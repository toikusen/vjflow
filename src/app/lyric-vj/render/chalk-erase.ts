// The board eraser's one pass (Q1 phase 3b chalkboard erase-reseat, round 2 after the critic's "masked deletion"): a
// felt eraser held upright across the whole line, drawn once from its right end to its left, and everything the line
// put on the board (its words, the teacher's underline and dust) goes under that one front. Shared by the words
// (world-layout.ts, a clip plane at the front) and the board's own marks (world-b2-chalk.ts, a clip rect), so the two
// can never part. Rule 9: a hand stroke, picking up speed and easing off at the end (smoothstep), never a cut.

/** The chalk tray along the board's foot, px at 1080p (world-b2-chalk tray): nothing is wiped over it. */
export const TRAY_H = 120;
/** The felt's width across the stroke, px at 1080p (the board's own eraser, world-b2-chalk wipe-pass); it stands on the side already wiped. */
export const FELT_W = 70;
/** The hand's pressure: the eraser rides up and down this far, twice in the pass. */
export const FELT_WOBBLE = 6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** The stroke's pace: slow off the board's edge, fastest across the middle, slowing to a stop (smoothstep). */
export const eraseEase = (q: number) => { const k = clamp01(q); return k * k * (3 - 2 * k); };

/** Where the wipe's front stands at `t`: frame px across [x0, x1] (the line's room), everything right of it wiped. */
export function eraseFront(t: number, wipe: { from: number; sec: number }, x0: number, x1: number): number {
  const q = (t - wipe.from) / Math.max(0.05, wipe.sec);
  return x1 - (x1 - x0 + 4) * eraseEase(q);
}

/** The eraser's place and how much of it is seen at `t` (it comes onto the line and lifts off it), frame px, y down. */
export function feltAt(t: number, wipe: { from: number; sec: number }, r: { x0: number; y0: number; x1: number; y1: number }) {
  const q = (t - wipe.from) / Math.max(0.05, wipe.sec);
  if (q < 0 || q > 1) return undefined;
  const front = eraseFront(t, wipe, r.x0, r.x1);
  const a = Math.min(1, q / 0.08, (1 - q) / 0.12);
  return { x0: front, x1: front + FELT_W, y0: r.y0 - 10, y1: r.y1 + 10, dy: FELT_WOBBLE * Math.sin(q * Math.PI * 4), a: clamp01(a), q };
}
