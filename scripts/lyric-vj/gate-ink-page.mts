// The measured ink probe's page side (style-gate-ink.mts), bundled and added before the render page's own scripts: one
// moment drawn with and without the words (what they stand on kept), every glyph shown read on the pixels under it.
import { readGlyph, type GlyphRead } from '../../src/app/lyric-vj/measured-ink';

type Box = { i: number; x0: number; y0: number; x1: number; y1: number; a: number; moving: boolean };
const w = window as unknown as { __vjInkProbe?: boolean; vjLyrics(on: boolean, carriers?: boolean): void; vjFrame(t: number): Promise<HTMLCanvasElement>; vjGlyphs(): { id: string; glyphs: Box[] }[]; inkPage: unknown };

/** A glyph's reading, or why it was not read: still coming or going, faint (its own fade), or too little ink to read. */
export type Read = { id: string; i: number; skip?: 'moving' | 'faint' | 'small'; r?: GlyphRead; box: [number, number, number, number] };

/** One moment: the lines `ids` (all shown when empty) read glyph by glyph, at full size. */
async function moment(t: number, ids: string[]): Promise<Read[]> {
  w.__vjInkProbe = true;
  const grab = async (on: boolean) => {
    w.vjLyrics(on, true);
    const cv = await w.vjFrame(t);
    const c = new OffscreenCanvas(cv.width, cv.height).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(cv, 0, 0);
    return c;
  };
  const a = await grab(true);
  const lines = w.vjGlyphs().filter((l) => !ids.length || ids.includes(l.id));
  const b = await grab(false);
  w.vjLyrics(true);
  w.__vjInkProbe = false;
  const all = lines.flatMap((l) => l.glyphs);
  if (!all.length) return [];
  const [W, H] = [a.canvas.width, a.canvas.height];
  const u = all.reduce((p, q) => ({ x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const [x0, y0] = [Math.max(0, Math.floor(u.x0)), Math.max(0, Math.floor(u.y0))];
  const [rw, rh] = [Math.min(W, Math.ceil(u.x1)) - x0, Math.min(H, Math.ceil(u.y1)) - y0];
  if (rw <= 0 || rh <= 0) return [];
  const on = a.getImageData(x0, y0, rw, rh).data;
  const off = b.getImageData(x0, y0, rw, rh).data;
  return lines.flatMap((l) => l.glyphs.map((g): Read => {
    const box: Read['box'] = [Math.round(g.x0), Math.round(g.y0), Math.round(g.x1), Math.round(g.y1)];
    if (g.moving) return { id: l.id, i: g.i, skip: 'moving', box };
    if (g.a < 0.98) return { id: l.id, i: g.i, skip: 'faint', box };
    const r = readGlyph(on, off, rw, { x0: g.x0 - x0, y0: g.y0 - y0, x1: g.x1 - x0, y1: g.y1 - y0 });
    return r ? { id: l.id, i: g.i, r, box } : { id: l.id, i: g.i, skip: 'small', box };
  }));
}

/** A full frame with the words as a JPEG data URL (for a look at a flagged moment). */
async function still(t: number, on = true) {
  w.vjLyrics(on, true);
  const url = (await w.vjFrame(t)).toDataURL('image/jpeg', 0.9);
  w.vjLyrics(true);
  return url;
}
w.inkPage = { moment, still };
