// What style batch 5's scrapbook, watercolor, midcentury and claymation pages share: drawing in the frame's own place, the
// small print (only real data: the song's title and artist in its opening, a line's part and start time), and the
// measuring hook that tells that small print's ink from the line's (scripts/lyric-vj/world-focus.mts).
import { H, W, WorldEnv } from './world-craft';
import { artistBy, C, label, onPage, still, titleOf } from './world-b3-shared';
import { langOfEnv } from '../labels';
import { splitCalls } from '../calls';
import { splitParts } from './world-split';

export type Box = { x0: number; y0: number; x1: number; y1: number };
export const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
export const meets = (a: Box, b: Box | undefined, m = 0) => !!b && a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
const no2 = (n: number) => String(n).padStart(2, '0');
export const mmss = (t: number) => `${no2(Math.floor(Math.max(0, t) / 60))}:${no2(Math.floor(Math.max(0, t) % 60))}`;

/** Measuring only (`globalThis.vjSmallBare`): the small print laid out but not printed; its largest size is published (`vjSmallPrint`). */
const tally = { largest: 0 };
const bare = () => (globalThis as { vjSmallBare?: boolean }).vjSmallBare === true;
type Op = { m: DOMMatrix; a: [string, number, number, string, number, string, number, 'left' | 'right' | 'center'] };
/** While a kept page is painted, its small print is held back to be printed on the frame (a mirrored page's text still reads). */
let deferring: Op[] | undefined;
const OPS = new WeakMap<OffscreenCanvas, Op[]>();
/**
 * A page painted once and kept (world-b3-shared `still`), then its small print set on the frame in the page's own place:
 * text kept in the picture would be turned over with a mirrored page, and its ink could not be told from the line's.
 */
export function page(e: WorldEnv, id: string, paint: (c: OffscreenCanvasRenderingContext2D) => void, extra = '') {
  smallReset();
  const ops: Op[] = [];
  let ran = false;
  deferring = ops;
  const cv = still(e, id, (c) => { ran = true; paint(c); }, extra);
  deferring = undefined;
  if (ran || !OPS.has(cv)) OPS.set(cv, ops);
  onPage(e, cv);
  frame(e, (c) => { for (const op of OPS.get(cv)!) { c.save(); c.transform(op.m.a, op.m.b, op.m.c, op.m.d, op.m.e, op.m.f); small(c, ...op.a); c.restore(); } });
}
/** A small printed label, px its size; nothing when measuring the line alone. Returns its width. */
export function small(c: C, text: string, x: number, y: number, font: string, px: number, fill: string, track = 0, align: 'left' | 'right' | 'center' = 'left') {
  if (!text) return 0;
  if (deferring) { deferring.push({ m: c.getTransform(), a: [text, x, y, font, px, fill, track, align] }); c.save(); c.font = font; const w = c.measureText(text).width; c.restore(); return w; }
  tally.largest = Math.max(tally.largest, px);
  (globalThis as { vjSmallPrint?: typeof tally }).vjSmallPrint = { ...tally };
  if (bare()) { c.save(); c.font = font; const w = c.measureText(text).width; c.restore(); return w; }
  return label(c, text, x, y, font, fill, track, align);
}
/** A new frame's tally starts at nothing. */
export const smallReset = () => { tally.largest = 0; (globalThis as { vjSmallPrint?: typeof tally }).vjSmallPrint = { ...tally }; };

/**
 * The real data a page may print, as rows: the song's title and artist only on a cut in the song's opening (world-title.ts),
 * then the line's part and start time.
 */
export function dataRows(e: WorldEnv): { title: string; artist: string; part: string } {
  const it = e.item;
  return { title: titleOf(e), artist: artistBy(e), part: it ? [it.part, it.at === undefined ? '' : mmss(it.at)].filter(Boolean).join('　') : '' };
}
/** The data on one row, joined the board's way. */
export const dataLine = (e: WorldEnv, sep = '　') => { const d = dataRows(e); return [d.artist, d.title, d.part].filter(Boolean).join(sep); };
export const isJa = (e: WorldEnv) => langOfEnv(e) === 'ja';
export { W, H };
/** Whether the line is split onto two carriers (its calls aside); with no line known, whether its box reaches below `y`. */
export const twoPhrases = (e: WorldEnv, y = 0.55 * H) =>
  // (as the set splits it, world-split splitParts: two containers of one size, at the space nearest the middle)
  e.item?.text ? !!splitParts(splitCalls(e.item.text).main.trim(), 'tail', true) : !e.rect || e.rect.y1 > y;
