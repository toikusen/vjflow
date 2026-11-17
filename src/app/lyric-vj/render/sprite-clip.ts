// A sprite clip's own clock: which frame a cut-out plays at song time t. The clock starts at `start` and runs on
// regardless of the cuts drawn under the sprite (the subject keeps moving while the background, layout and text cut
// on the beat); past its last frame the clip holds it, or loops when it is a loopable motion.

export interface SpriteClock { count: number; fps: number; start: number; loop: boolean }

/** The frame index at song time t: 0 before the clock starts, the last frame held after the end, modulo when looping. */
export function clipFrame(c: SpriteClock, t: number): number {
  if (c.count <= 0) return 0;
  const f = Math.floor(Math.max(0, t - c.start) * c.fps);
  return c.loop ? f % c.count : Math.min(c.count - 1, f);
}

/** A picture's opaque bounds as shares of its size (x0, y0, x1, y1), from its RGBA bytes; the whole picture when it is all clear. */
export function alphaBounds(data: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 24): [number, number, number, number] {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return [0, 0, 1, 1];
  return [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
}

/**
 * The motion envelope of a sprite clip: the union of its frames' opaque bounds (shares of the frame), so a figure is
 * seated and kept in frame by everywhere it moves over the clip, never by one frame of it (engine.ts loads clips with
 * it; kinetic.ts seats the cut-out by KineticLayer.crop). Undefined when it is the whole frame anyway.
 */
export function clipEnvelope(bounds: [number, number, number, number][]): [number, number, number, number] | undefined {
  if (!bounds.length) return undefined;
  const box: [number, number, number, number] = [Math.min(...bounds.map((b) => b[0])), Math.min(...bounds.map((b) => b[1])), Math.max(...bounds.map((b) => b[2])), Math.max(...bounds.map((b) => b[3]))];
  return box[0] <= 0 && box[1] <= 0 && box[2] >= 1 && box[3] >= 1 ? undefined : box;
}
