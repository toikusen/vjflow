// Elastic follow: a secondary thing trails a moving target with lag and a little overshoot, as if on a spring. It is
// the target's own past, weighted by a damped spring's impulse response (a short FIR filter over the last 1.2 s), so a
// frame is a function of its time alone: no state carried from frame to frame, the same by seek, play or export.
// After the AE expression guide's layer-elastic-follow concept; the arithmetic here is our own. Pure numbers.

/** How far back the follower looks, s, and how finely. */
const WINDOW = 1.2;
const STEP = 1 / 30;

/**
 * The spring's weights at lags 0, STEP, 2·STEP…: a damped oscillation (period `period` s, damping ratio `damp`),
 * summing to 1, so a follower at rest sits exactly on its target; the negative lobe is the overshoot.
 */
export function springTaps(period = 0.8, damp = 0.4): { lag: number; w: number }[] {
  const w0 = (2 * Math.PI) / period;
  const wd = w0 * Math.sqrt(1 - damp * damp);
  const raw = Array.from({ length: Math.round(WINDOW / STEP) }, (_, k) => {
    const lag = (k + 0.5) * STEP;
    return { lag, w: Math.exp(-damp * w0 * lag) * Math.sin(wd * lag) };
  });
  const sum = raw.reduce((a, x) => a + x.w, 0);
  return raw.map((x) => ({ lag: x.lag, w: x.w / sum }));
}

const TAPS = springTaps();

/**
 * Where the follower is at t, for a target whose place at any time is `target(t)` (undefined while it is not up):
 * the spring-weighted mix of where the target was. Lags when the target was not up yet are left out and the rest
 * weighed again (a follower starts on its leader); undefined when the target is not up now. `stiff` > 1 follows
 * tighter (shorter lags), < 1 looser.
 */
export function elasticFollow(target: (t: number) => readonly [number, number] | undefined, t: number, stiff = 1): [number, number] | undefined {
  if (!target(t)) return undefined;
  let [x, y, sum] = [0, 0, 0];
  for (const { lag, w } of TAPS) {
    const p = target(t - lag / Math.max(0.3, stiff));
    if (!p) continue;
    x += w * p[0];
    y += w * p[1];
    sum += w;
  }
  // too little of the spring's past is there (the target has only just come): stand on it
  if (sum < 0.25) return [...target(t)!] as [number, number];
  return [x / sum, y / sum];
}
