// Smooth, seeded noise that loops: a prop's or a ground's idle drift that never repeats a visible beat of a sine and
// still comes back to exactly where it started every `period` seconds (a loop exported for a live set joins seamlessly).
// Written for this project from the general idea of octave noise on a wrapping lattice; no code taken from elsewhere.
// Pure numbers, no three.js. Never used on the lyric line being read.

/** An integer hash of a lattice point, an octave and a seed, to [-1, 1]. */
function gradient(i: number, octave: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(octave + 1, 0x27d4eb2d), 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Quintic fade: no jump in speed or acceleration at a lattice point. */
const fade = (f: number) => f * f * f * (f * (f * 6 - 15) + 10);

/**
 * Smooth noise at time t, about -1..1, that loops exactly every `period` seconds: f(t) === f(t + period). Octaves of
 * 1-D gradient noise on a lattice of `cells` points per period (doubling each octave, half the weight), every lattice
 * wrapping at the period, so the loop has no seam. `seed` gives each prop its own path.
 */
export function loopNoise(t: number, period: number, seed = 0, octaves = 3, cells = 4): number {
  const span = Math.max(1e-6, period);
  const phase = ((t / span) % 1 + 1) % 1;
  let [sum, weight, amp] = [0, 0, 1];
  for (let o = 0; o < Math.max(1, octaves); o++) {
    const n = Math.max(1, Math.round(cells)) << o;
    // each octave's lattice is shifted by its own share of a cell: gradient noise is 0 on its lattice points, and
    // octaves sharing them would pass through 0 together on a steady beat
    const x = phase * n + (gradient(7, o, seed) + 1) / 2;
    const i0 = Math.floor(x);
    const f = x - i0;
    const [g0, g1] = [gradient(i0 % n, o, seed), gradient((i0 + 1) % n, o, seed)];
    // a 1-D gradient lattice reaches about ±0.5; doubled to about ±1
    sum += amp * 2 * (g0 * f + (g1 * (f - 1) - g0 * f) * fade(f));
    weight += amp;
    amp *= 0.5;
  }
  return Math.max(-1, Math.min(1, sum / weight));
}
