// Velocity banking: a moving prop or carrier leans into its own travel, as far as it is going fast, and stands upright
// again as it comes to rest. The lean is read off the prop's own pure path (its velocity at t by a central difference),
// so a frame is the same by seek or by play. Never the lyric while it is read: callers bank props, and carriers only
// in their entrance and exit. A common motion-design idea (after the AE expression guide's phys-velocity concept);
// the arithmetic here is our own. Pure numbers.

/** The most a prop leans, rad (about 10 degrees): enough to read as speed, never enough to read as falling over. */
export const BANK_MAX = 0.18;

/**
 * The lean for a horizontal speed vx, in the drawing's turn (positive = clockwise on screen, the top leaning right):
 * moving right leans right. `full` is the speed (same units as vx, per second) at which it has three quarters of `max`;
 * it eases smoothly toward max (tanh) and is exactly 0 at rest.
 */
export const bankTilt = (vx: number, full: number, max = BANK_MAX) => (vx === 0 ? 0 : max * Math.tanh(vx / Math.max(1e-6, full)));

/** The velocity of a pure path at t, units per second: a central difference over h (a sixtieth of a second). */
export function velocityAt(path: (t: number) => readonly [number, number], t: number, h = 1 / 60): [number, number] {
  const [a, b] = [path(t - h), path(t + h)];
  return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)];
}
