// Proximity response: background elements react (swell, brighten, push aside) as a moving control point passes near
// them, and settle back when it has gone. The point's path and every element's response are pure functions of time,
// and nothing in the lyric box or its margin reacts or is drawn there, so a passing light never lands on a sung word.
// After the AE expression guide's layer-distance concept; the arithmetic here is our own. Pure numbers.
import type { CoverRect } from './cover';

/** 1 at the control point, falling smoothly (smoothstep) to exactly 0 at `reach` px and beyond. */
export function nearGain(dx: number, dy: number, reach: number): number {
  const q = 1 - Math.hypot(dx, dy) / Math.max(1, reach);
  return q <= 0 ? 0 : q * q * (3 - 2 * q);
}

/**
 * Where the control point is at `age` s: a slow seeded figure over the frame (two sines out of step, so it never
 * retraces a line), inside an eighth of the frame from each edge. `speed` scales its pace.
 */
export function controlPoint(age: number, seed: number, W: number, H: number, speed: number): [number, number] {
  const s = age * speed;
  const ph = (seed % 97) * 0.731;
  return [W * (0.5 + 0.37 * Math.sin(s * 0.31 + ph)), H * (0.5 + 0.36 * Math.sin(s * 0.47 + ph * 1.7 + 1.1))];
}

/** Whether (x, y) is clear of the lyric box grown by `pad` px (true when there is no lyric). */
export const outside = (x: number, y: number, r: CoverRect | undefined, pad: number) => !r || x < r.x0 - pad || x > r.x1 + pad || y < r.y0 - pad || y > r.y1 + pad;

/** The lyric box (frame px) in the coordinates the context draws in now (under the camera's moves), as a box. */
export function rectInDraw(ctx: CanvasRenderingContext2D, r: CoverRect | undefined): CoverRect | undefined {
  if (!r) return undefined;
  const inv = ctx.getTransform?.()?.inverse?.();
  if (!inv) return r;
  const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}
