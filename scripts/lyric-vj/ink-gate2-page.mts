// The ink gate v2's page side (ink-gate2.mts; docs/research/2026-11-13-ink-table-gate-design.md §1.3–1.4): one moment
// read glyph by glyph off the final composite, with the glyphs' ID masks, on the words-on pass's frozen controls.
import { DRIFT_MAX, glyphOfId, lineOfId, offDrift, reduceGlyphs, type GlyphVerdict } from '../../src/app/lyric-vj/ink-verify';

type Engine = { inkMoment(t: number, pad?: number): Promise<{ box: [number, number, number, number]; on: Uint8Array; off: Uint8Array; mask: Uint8Array; lines: Record<number, string>; shown: number[] } | undefined> };
const w = window as unknown as { vjEngine: Engine; vjGlyphs(): { id: string; glyphs: { i: number; moving: boolean; a: number }[] }[]; vjFrame(t: number): Promise<unknown>; inkGate: unknown };

/** The neighbourhood a glow, a chroma trail or the aberration split reaches round a glyph, px (offDrift). */
const DRIFT_R = 24;

export type Read = { cue: string; i: number; moving: boolean; v: GlyphVerdict };
/** One moment: every glyph shown, its verdict; the field drift; the 2D layer's characters (signature), unverified. */
async function moment(t: number): Promise<{ reads: Read[]; drift: number; driftAt?: number[]; box?: [number, number, number, number]; layer2d: number; hash?: number }> {
  // (the composed frame first: a signature moment's characters are drawn on the 2D layer, and are counted, not read)
  await w.vjFrame(t);
  const layer2d = w.vjGlyphs().filter((l) => l.id === 'signature').reduce((n, l) => n + l.glyphs.length, 0);
  const moving = new Map(w.vjGlyphs().flatMap((l) => l.glyphs.map((g) => [`${l.id}/${g.i}`, g.moving] as const)));
  const m = await w.vjEngine.inkMoment(t);
  if (!m) return { reads: [], drift: 0, layer2d };
  const [, , bw, bh] = m.box;
  const where: number[] = [];
  const drift = offDrift(m.on, m.off, m.mask, bw, bh, DRIFT_R, where);
  const reads = reduceGlyphs(m.on, m.off, m.mask, bw, m.shown).map((v): Read => {
    const cue = m.lines[lineOfId(v.id)] ?? '?';
    const i = glyphOfId(v.id);
    return { cue, i, moving: !!moving.get(`${cue}/${i}`), v: drift > DRIFT_MAX && v.status !== 'unverified:no-core' ? { ...v, status: 'unverified:field-drift' } : v };
  });
  // (a hash of the words-on pixels under the glyphs: the same moment drawn again must give the same)
  let hash = 0;
  for (let k = 0; k < m.mask.length; k += 4) if (m.mask[k] | m.mask[k + 1] | m.mask[k + 2]) hash = (hash * 31 + m.on[k] * 65536 + m.on[k + 1] * 256 + m.on[k + 2]) >>> 0;
  return { reads, drift, driftAt: where.length ? [where[0] + m.box[0], where[1] + m.box[1], where[2], where[3]] : undefined, box: m.box, layer2d, hash };
}
w.inkGate = { moment };
