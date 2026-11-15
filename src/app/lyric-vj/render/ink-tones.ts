// M4, the sampled tone table (docs/research/2026-11-13-ink-table-gate-design.md §2.2–2.4): what a world really draws where
// its slots say one colour. Two kinds of entry, both made offline (scripts/lyric-vj/ink-tones.mts, never at render time):
// - grounds: under a set's words on a scheme, with the words off and the final pass at rest, the darkest and lightest
//   tone of the page as drawn (a transcript tape's darkened margin, a halftone, a set piece), sampled over real jobs;
// - surfaces: how far a world's glyph material darkens its tint at its darkest drawn part (a scan line, a core, a print
//   stripe), as a share of the tint's luminance.
// Keyed by the effect version (FX_VERSION): a table made on other effects is not read. A missing entry reads nothing:
// the decision falls back on the scheme's colours alone (hold-room standsOn, ink-decide decideInk).
import { FX_VERSION } from './final-warp.glsl';

export interface ToneTable {
  v: 1;
  /** The effect version the table was made on (FX_VERSION). */
  fx: string;
  commit: string;
  built: string;
  /** Every ground was read with its line at rest (on its carrier, if it has one): a carried set's entry may be read. */
  restOnly?: boolean;
  /** The worlds whose entries are shipped (each improved its sample gate and regressed nothing, 2026-11-15). */
  shipped?: string[];
  /** Every ground was read inside its line's carrier as drawn, or under its glyphs' boxes off a carrier. */
  inside?: boolean;
  /** `${set}|${scheme id}` → the drawn ground's darkest and lightest tones under the set's words, and how many reads. */
  grounds: Record<string, { lo: string; hi: string; n: number }>;
  /**
   * `${surface kind}|${core colour}` → how far the face's drawn darkest and lightest parts move its tint toward black and
   * toward white (sRGB mix fractions: `black` read on a white tint's 5th percentile, `white` on a black tint's 95th, the
   * declared parts left out): a satin's shading and highlights, a gilt's bands, a seam.
   */
  surfaces: Record<string, { black: number; white: number }>;
}

const FILE = 'src/app/lyric-vj/render/ink-tones.json';
let table: ToneTable | null | undefined;

/** Loads the table where a plan or a page runs (browser: its own chunk; the plan and main.ts await it). */
export async function ensureInkTones(): Promise<void> {
  if (table !== undefined) return;
  try {
    table = (await import('./ink-tones.json')).default as unknown as ToneTable;
  } catch {
    table = null;
  }
}

type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string; existsSync(path: string): boolean };
const nodeFs = () => (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.('node:fs') as NodeFs | undefined;

/** The table, when one was made on these effects (node reads it on demand; a page after ensureInkTones). */
export function inkTones(): ToneTable | undefined {
  // (QA, the before/after crops: __vjNoInkTones reads no table)
  if ((globalThis as { __vjNoInkTones?: boolean }).__vjNoInkTones) return undefined;
  if (table === undefined) {
    const fs = nodeFs();
    table = fs && fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as ToneTable) : null;
  }
  return table && table.fx === FX_VERSION ? table : undefined;
}

/** For tests and the generator: use this table (undefined: load again). */
export const setInkTones = (t: ToneTable | null | undefined) => void (table = t);

/** The drawn ground under a set's words on a scheme, its darkest and lightest tones; undefined where nothing was read. */
export const drawnGround = (set: string, scheme: string | undefined) => (scheme ? inkTones()?.grounds[`${set}|${scheme}`] : undefined);

/** How far a surface moves a tint toward black and toward white at its darkest and lightest parts (undefined: not read). */
export const surfaceShare = (kind: string | undefined, core: string | undefined): { black: number; white: number } | undefined => {
  const s = kind ? inkTones()?.surfaces[`${kind}|${(core ?? '').toLowerCase()}`] : undefined;
  return s && typeof s === 'object' && 'black' in s ? s : undefined;
};
/** An ink mixed toward a colour by `k` (sRGB, as a canvas paints a shade or a highlight). */
export const mixToward = (ink: string, to: string, k: number) => (!/^#[0-9a-f]{6}$/i.test(ink) || !k ? ink : `#${[1, 3, 5].map((i) => Math.round(parseInt(ink.slice(i, i + 2), 16) * (1 - k) + parseInt(to.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`);

/**
 * How far a glyph's edge draws its ink down, any surface: 1 since the glyph pictures are premultiplied (glyphs.ts
 * premultGlyph). Straight alpha ran an edge toward black at about 0.43 of the ink's luminance (dark-glitch choroin c059,
 * c031, 2026-11-15). QA knob only: __vjEdgeShare sets it for a probe.
 */
export const EDGE_SHARE = 1;
/** The edge share in force: EDGE_SHARE, or a QA probe's (__vjEdgeShare). */
export const edgeShare = () => (globalThis as { __vjEdgeShare?: number }).__vjEdgeShare ?? EDGE_SHARE;

/** An ink as a surface draws it at one of its parts: its linear channels scaled so its luminance is `share` of its own (capped at white). */
export function darkest(ink: string, share: number | undefined): string {
  if (share === undefined || share === 1 || !/^#[0-9a-f]{6}$/i.test(ink)) return ink;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const enc = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  return `#${[1, 3, 5].map((i) => Math.round(enc(Math.min(1, lin(parseInt(ink.slice(i, i + 2), 16) / 255) * Math.max(0, share))) * 255).toString(16).padStart(2, '0')).join('')}`;
}
