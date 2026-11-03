// Reading a frame's own pixels without taking its canvas off the graphics card.

let probe: OffscreenCanvasRenderingContext2D | undefined;

/**
 * A region's pixels (as getImageData gives them), read through a copy on a CPU canvas. Chrome moves a 2D canvas that is
 * read back a few times onto the CPU for good; the look's canvas is drawn and uploaded to WebGL every frame, and once on
 * the CPU each upload is a full-frame copy (哥德蘿莉 and 默片 lost half their frames to it). A context with no canvas to
 * copy (tests) is read directly.
 */
export function readBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const src = (ctx as Partial<CanvasRenderingContext2D>).canvas;
  if (typeof OffscreenCanvas === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !(src instanceof HTMLCanvasElement)) return ctx.getImageData(x, y, w, h).data;
  if (!probe || probe.canvas.width < w || probe.canvas.height < h) probe = new OffscreenCanvas(Math.max(w, probe?.canvas.width ?? 0), Math.max(h, probe?.canvas.height ?? 0)).getContext('2d', { willReadFrequently: true })!;
  probe.clearRect(0, 0, w, h);
  probe.drawImage(src, x, y, w, h, 0, 0, w, h);
  return probe.getImageData(0, 0, w, h).data;
}
