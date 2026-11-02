import { describe, expect, it } from 'vitest';
import { BEAT_RATE, detectBeats } from './beat-detect';

/** A decaying click every `period` s, from `from`; quiet noise under it when asked for. */
function clicks(seconds: number, bpm: number, o: { noise?: number; from?: number; gap?: [number, number]; accent?: number } = {}) {
  const out = new Float32Array(Math.floor(seconds * BEAT_RATE));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  if (o.noise) for (let i = 0; i < out.length; i++) out[i] = rand() * o.noise;
  const times: number[] = [];
  for (let k = 0, t = o.from ?? 0.5; t < seconds - 0.1; k++, t = (o.from ?? 0.5) + (k * 60) / bpm) {
    times.push(t);
    if (o.gap && t >= o.gap[0] && t < o.gap[1]) continue;
    const start = Math.round(t * BEAT_RATE);
    const loud = o.accent !== undefined && k % 4 === o.accent ? 1 : 0.5;
    for (let i = 0; i < 400 && start + i < out.length; i++) out[start + i] += loud * Math.exp(-i / 80) * Math.sin(i * 0.9);
  }
  return { samples: out, times };
}

const nearest = (xs: number[], t: number) => xs.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), Infinity);

describe('detectBeats', () => {
  it.each([70, 96, 120, 128, 150])('finds %i BPM from a click track, on the clicks', (bpm) => {
    const { samples, times } = clicks(30, bpm, { noise: 0.005 });
    const got = detectBeats(samples, BEAT_RATE)!;
    expect(got.tempo).toBeGreaterThan(bpm * 0.99);
    expect(got.tempo).toBeLessThan(bpm * 1.01);
    const off = times.slice(1, -1).map((t) => Math.abs(nearest(got.beats, t) - t));
    expect(Math.max(...off)).toBeLessThan(0.02);
    expect(got.beats.length).toBeGreaterThanOrEqual(times.length - 1);
    expect(got.beats.length).toBeLessThanOrEqual(times.length + 1);
  });

  it('may count a very fast pulse at half speed, still on the clicks', () => {
    const { samples, times } = clicks(30, 174, { noise: 0.005 });
    const got = detectBeats(samples, BEAT_RATE)!;
    expect(Math.abs(got.tempo / 174 - 1) < 0.01 || Math.abs(got.tempo / 87 - 1) < 0.01).toBe(true);
    expect(Math.max(...got.beats.slice(1, -1).map((b) => Math.abs(nearest(times, b) - b)))).toBeLessThan(0.02);
  });

  it('keeps the grid through a break in the middle', () => {
    const { samples, times } = clicks(40, 120, { noise: 0.005, gap: [15, 22] });
    const got = detectBeats(samples, BEAT_RATE)!;
    const during = times.filter((t) => t > 16 && t < 21);
    expect(Math.max(...during.map((t) => Math.abs(nearest(got.beats, t) - t)))).toBeLessThan(0.03);
  });

  it('starts bars on the accented beat', () => {
    const { samples, times } = clicks(30, 120, { noise: 0.005, accent: 2 });
    const got = detectBeats(samples, BEAT_RATE)!;
    const accented = times.filter((_, k) => k % 4 === 2);
    expect(Math.abs(nearest(got.downbeats, accented[3]) - accented[3])).toBeLessThan(0.03);
  });

  it('gives beats, strengths in step, and times in order', () => {
    const got = detectBeats(clicks(20, 120).samples, BEAT_RATE)!;
    expect(got.beatStrength.length).toBe(got.beats.length);
    expect(got.beats.every((b, i) => i === 0 || b > got.beats[i - 1])).toBe(true);
    expect(got.beats.at(-1)).toBeLessThan(20.1);
  });

  it('finds nothing in silence, in steady noise, or in too little audio', () => {
    expect(detectBeats(new Float32Array(BEAT_RATE * 20), BEAT_RATE)).toBeUndefined();
    expect(detectBeats(clicks(20, 120, { noise: 0.2, gap: [0, 20] }).samples, BEAT_RATE)).toBeUndefined();
    expect(detectBeats(clicks(4, 120).samples, BEAT_RATE)).toBeUndefined();
  });
});
