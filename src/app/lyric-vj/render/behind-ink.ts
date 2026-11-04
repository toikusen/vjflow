// What is really behind a line's ink, read off the frame after a world's ground, its change and its set piece are
// drawn: legibility is absolute (owner), so the ink must contrast with every part of what lies under it. A set piece
// that lays a light block under a lamp-red line (LED 看板's module-flip: red 「才想起大雪的那一天」 on yellow, the 才
// cut in two at the block's edge) has the ground under the words held back to the paper the ink was chosen for.
import { contrast } from '../contrast';

/** The contrast the ink must keep with each patch of ground under the words. */
export const BEHIND_READS = 3;
/** Share of the patches under the words that may miss BEHIND_READS before the ground there is held back. */
export const BEHIND_SHARE = 0.01;
/** Patches read across the words' block: one every this many pixels. */
const STEP = 8;

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/** Share of the patches (RGBA, as getImageData gives them) on which `ink` misses `min`. */
export function unreadShare(data: Uint8ClampedArray | number[], ink: string, min = BEHIND_READS): number {
  let [n, miss] = [0, 0];
  for (let i = 0; i + 3 < data.length; i += 4) {
    n++;
    if (contrast(ink, `#${hex2(data[i])}${hex2(data[i + 1])}${hex2(data[i + 2])}`) < min) miss++;
  }
  return n ? miss / n : 0;
}

/** Whether the ground under the words must be held back: some of it would not let the ink read. */
export const mustHold = (share: number) => share > BEHIND_SHARE;

let probe: OffscreenCanvasRenderingContext2D | undefined;
/** The patches under a device-space box, averaged down to one per STEP pixels through a CPU copy (readback.ts). */
function patches(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Uint8ClampedArray | undefined {
  const src = (ctx as Partial<CanvasRenderingContext2D>).canvas as unknown;
  const [pw, ph] = [Math.max(1, Math.round(w / STEP)), Math.max(1, Math.round(h / STEP))];
  if (typeof OffscreenCanvas === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !(src instanceof HTMLCanvasElement || src instanceof OffscreenCanvas)) return undefined;
  if (!probe || probe.canvas.width < pw || probe.canvas.height < ph) probe = new OffscreenCanvas(Math.max(pw, probe?.canvas.width ?? 0), Math.max(ph, probe?.canvas.height ?? 0)).getContext('2d', { willReadFrequently: true })!;
  probe.clearRect(0, 0, pw, ph);
  probe.imageSmoothingEnabled = true;
  probe.drawImage(src, x, y, w, h, 0, 0, pw, ph);
  return probe.getImageData(0, 0, pw, ph).data;
}

/**
 * Reads the ground under the words' block (in the context's current space) and, where the ink would not read on part
 * of it, lays the paper back over the block with a soft edge, so no block, edge or band of the wrong colour stands
 * under a stroke. Returns the share that missed (for logs and tests).
 */
export function holdInkGround(ctx: CanvasRenderingContext2D, rect: { x0: number; y0: number; x1: number; y1: number }, ink: string, paper: string, weight: number, pad = 26): number {
  if (weight <= 0) return 0;
  const m = ctx.getTransform();
  const a = m.transformPoint({ x: rect.x0, y: rect.y0 });
  const b = m.transformPoint({ x: rect.x1, y: rect.y1 });
  const cw = ctx.canvas?.width ?? 1920;
  const ch = ctx.canvas?.height ?? 1080;
  const x = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const y = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const w = Math.min(cw, Math.ceil(Math.max(a.x, b.x))) - x;
  const h = Math.min(ch, Math.ceil(Math.max(a.y, b.y))) - y;
  if (w <= 0 || h <= 0) return 0;
  const data = patches(ctx, x, y, w, h);
  if (!data) return 0;
  const share = unreadShare(data, ink);
  if (!mustHold(share)) return share;
  // the paper back over the block, solid under the words and feathered out over `pad`, so the hold is not a box
  ctx.save();
  ctx.fillStyle = paper;
  const rings = 6;
  for (let k = rings; k >= 0; k--) {
    const grow = (pad * k) / rings;
    ctx.globalAlpha = weight * (k === 0 ? 1 : 0.22);
    ctx.fillRect(rect.x0 - grow, rect.y0 - grow, rect.x1 - rect.x0 + 2 * grow, rect.y1 - rect.y0 + 2 * grow);
  }
  ctx.restore();
  return share;
}
