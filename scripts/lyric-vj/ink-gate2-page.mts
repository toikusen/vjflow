// The ink gate v2's page side (ink-gate2.mts; docs/research/2026-11-13-ink-table-gate-design.md §1.3–1.4): one moment
// read glyph by glyph off the final composite, with the glyphs' ID masks, on the words-on pass's frozen controls.
import { DRIFT_MAX, glyphOfId, lineOfId, offDrift, reduceGlyphs, type GlyphVerdict } from '../../src/app/lyric-vj/ink-verify';

type Engine = { inkMoment(t: number, pad?: number): Promise<{ box: [number, number, number, number]; on: Uint8Array; off: Uint8Array; mask: Uint8Array; lines: Record<number, string>; shown: number[]; opacity: Record<number, number> } | undefined> };
const w = window as unknown as { vjEngine: Engine; vjGlyphs(): { id: string; glyphs: { i: number; moving: boolean; a: number }[] }[]; vjFrame(t: number): Promise<unknown>; inkGate: unknown };

/** The neighbourhood a glow, a chroma trail, the aberration split or a word's own copies (an extrude, a misprint: taken away with it) reach round a glyph, px (offDrift). */
const DRIFT_R = 48;

export type Read = { cue: string; i: number; moving: boolean; v: GlyphVerdict };
/** One moment: every glyph shown, its verdict; the field drift; the 2D layer's characters (signature), unverified. */
async function moment(t: number): Promise<{ reads: Read[]; drift: number; driftAt?: number[]; box?: [number, number, number, number]; layer2d: number; hash?: number; lines?: Record<number, string> }> {
  // (the composed frame first: a signature moment's characters are drawn on the 2D layer, and are counted, not read)
  await w.vjFrame(t);
  const layer2d = w.vjGlyphs().filter((l) => l.id === 'signature').reduce((n, l) => n + l.glyphs.length, 0);
  const moving = new Map(w.vjGlyphs().flatMap((l) => l.glyphs.map((g) => [`${l.id}/${g.i}`, g.moving] as const)));
  const m = await w.vjEngine.inkMoment(t);
  if (!m) return { reads: [], drift: 0, layer2d };
  const [, , bw, bh] = m.box;
  const where: number[] = [];
  const drift = offDrift(m.on, m.off, m.mask, bw, bh, DRIFT_R, where);
  const reads = reduceGlyphs(m.on, m.off, m.mask, bw, m.shown, m.opacity).map((v): Read => {
    const cue = m.lines[lineOfId(v.id)] ?? '?';
    const i = glyphOfId(v.id);
    return { cue, i, moving: !!moving.get(`${cue}/${i}`), v: drift > DRIFT_MAX && v.status !== 'unverified:no-core' ? { ...v, status: 'unverified:field-drift' } : v };
  });
  // (a hash of both passes over the whole box: the same moment drawn again must give the same, words on and off)
  let hash = 0;
  for (let k = 0; k < m.on.length; k += 4) hash = (Math.imul(hash, 31) + m.on[k] * 65536 + m.on[k + 1] * 256 + m.on[k + 2] + Math.imul(m.off[k] * 65536 + m.off[k + 1] * 256 + m.off[k + 2], 7)) >>> 0;
  return { reads, drift, driftAt: where.length ? [where[0] + m.box[0], where[1] + m.box[1], where[2], where[3]] : undefined, box: m.box, layer2d, hash, lines: m.lines };
}
/**
 * Evidence for one glyph: the three boxes (words on, words off, mask overlay) cropped round the glyph's core pixels and
 * grown by `pad`, as PNG data URLs, with the box and where its ratio-1 pixels are (diagnosis, not a verdict).
 */
async function dump(t: number, cue: string, i: number, pad = 32) {
  // (as a gate moment is drawn: the composed frame first)
  await w.vjFrame(t);
  const m = await w.vjEngine.inkMoment(t);
  if (!m) return undefined;
  const [bx, by, bw, bh] = m.box;
  const slot = Number(Object.entries(m.lines).find(([, c]) => c === cue)?.[0]);
  const id = ((slot & 255) << 16) | ((i + 1) & 0xffff);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const same: number[][] = [];
  // (a core pixel the two passes paint within 1.1:1 of each other)
  const L = (k: number, a: Uint8Array) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(a[k]) + 0.7152 * f(a[k + 1]) + 0.0722 * f(a[k + 2]); };
  const near = (k: number) => { const [p, q] = [L(k, m.on), L(k, m.off)]; return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05) < 1.1; };
  for (let k = 0; k < m.mask.length; k += 4) {
    if (((m.mask[k] << 16) | (m.mask[k + 1] << 8) | m.mask[k + 2]) !== id || m.mask[k + 3] < 255) continue;
    const [x, y] = [(k / 4) % bw, Math.floor(k / 4 / bw)];
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    if (near(k)) same.push([x + bx, y + by, m.on[k], m.on[k + 1], m.on[k + 2], m.off[k], m.off[k + 1], m.off[k + 2]]);
  }
  if (!(x1 >= x0)) return undefined;
  [x0, y0, x1, y1] = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(bw - 1, x1 + pad), Math.min(bh - 1, y1 + pad)];
  const [cw, ch] = [x1 - x0 + 1, y1 - y0 + 1];
  const png = (src: Uint8Array, tint?: boolean) => {
    const c = new OffscreenCanvas(cw, ch);
    const img = c.getContext('2d')!.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = ((y + y0) * bw + x + x0) * 4, o = (y * cw + x) * 4;
      const core = ((m.mask[k] << 16) | (m.mask[k + 1] << 8) | m.mask[k + 2]) === id && m.mask[k + 3] === 255;
      const eq = core && near(k);
      img.data.set(tint ? (eq ? [255, 0, 255, 255] : core ? [0, 200, 0, 255] : [src[k] >> 1, src[k + 1] >> 1, src[k + 2] >> 1, 255]) : [src[k], src[k + 1], src[k + 2], 255], o);
    }
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c.convertToBlob({ type: 'image/png' }).then((b) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b); }));
  };
  return { box: [x0 + bx, y0 + by, cw, ch], same: same.length, sameFirst: same.slice(0, 5), on: await png(m.on), off: await png(m.off), mask: await png(m.on, true) };
}
w.inkGate = { moment, dump };
