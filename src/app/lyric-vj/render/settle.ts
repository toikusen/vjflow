// Velocity-aware settle: how far a prop or a carrier overshoots its rest is set by how fast it arrives (distance over
// duration), clamped, and the settle is always over by the end of the arrival (k = 1), so reading never sees it.
// The idea of inertia scaled by arrival speed is a common motion-design one; this is our own arithmetic. Pure numbers.

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Arrival speed, units per second (any unit, as long as `ref` and `from` below use the same one). */
export const arrivalSpeed = (distance: number, duration: number) => Math.abs(distance) / Math.max(1e-3, duration);

/**
 * The overshoot of a back-out landing for an arrival at `speed`: nothing at or under `from`, growing by `gain` per unit
 * of speed above it, never past `max`. 0 is a plain ease-out; 1.7 is the classic back-out (about a tenth past the rest).
 */
export const overshootFor = (speed: number, from: number, gain: number, max: number) => clamp((speed - from) * gain, 0, max);

/**
 * A swing or wobble's size for an arrival at `speed`, as a multiple of its size at `ref` (the speed it was tuned at):
 * proportional to the speed, never under `lo` nor over `hi` times.
 */
export const speedShare = (speed: number, ref: number, lo = 0.6, hi = 1.3) => clamp(speed / Math.max(1e-6, ref), lo, hi);

/**
 * Back-out progress at k (0..1) with overshoot `s`: 0 at k = 0, exactly 1 from k = 1 on, past 1 in between when s > 0
 * (s = 0 is an ease-out cubic). Monotone up to its single peak, then back to rest.
 */
export function backOut(k: number, s: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  const p = k - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
}
