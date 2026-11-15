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
  /** `${set}|${scheme id}` → the drawn ground's darkest and lightest tones under the set's words, and how many reads. */
  grounds: Record<string, { lo: string; hi: string; n: number }>;
  /**
   * `${surface kind}|${core colour}` → the luminance of the face's drawn darkest and lightest parts (5th and 95th
   * percentile of its ink texels, declared parts left out) as shares of its tint's: a satin's highlights, a seam, a scan.
   */
  surfaces: Record<string, { lo: number; hi: number } | number>;
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

/** How far a surface draws a tint down and up at its darkest and lightest parts (1: not at all; undefined: not read). */
export const surfaceShare = (kind: string | undefined, core: string | undefined): { lo: number; hi: number } | undefined => {
  const s = kind ? inkTones()?.surfaces[`${kind}|${(core ?? '').toLowerCase()}`] : undefined;
  return s === undefined ? undefined : typeof s === 'number' ? { lo: s, hi: 1 } : s;
};

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
