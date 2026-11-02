import { describe, expect, it } from 'vitest';
import { estimateStarts, snapToBeat, sungStretches } from './free-sung';

const RATE = 22050;

/** Seconds of still tone, with `busy` spans of ever-changing noise bursts over it. */
function song(seconds: number, busy: [number, number][]) {
  const x = new Float32Array(seconds * RATE);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    const on = busy.some(([a, b]) => t >= a && t < b) && Math.floor(t * 8) % 2 === 0;
    x[i] = 0.1 * Math.sin(2 * Math.PI * 220 * t) + (on ? 0.4 * rnd() : 0);
  }
  return x;
}

describe('sungStretches', () => {
  it('finds the busy stretch and leaves out a long still intro and outro', () => {
    const [r, ...rest] = sungStretches(song(60, [[15, 45]]), RATE);
    expect(rest).toEqual([]);
    expect(Math.abs(r.start - 15)).toBeLessThan(2.5);
    expect(Math.abs(r.end - 45)).toBeLessThan(2.5);
  });
  it('falls back to the whole audio when it is too short to judge', () => {
    expect(sungStretches(new Float32Array(RATE), RATE)).toEqual([{ start: 0, end: 1 }]);
  });
});

describe('estimateStarts', () => {
  it('shares time by length, in order, and starts at the first stretch', () => {
    const [a, b, c] = estimateStarts(['一二', '一二三四五六七八', '一二'], [{ start: 10, end: 40 }]);
    expect(a).toBe(10);
    expect(c - b).toBeGreaterThan(b - a);
  });
  it('never starts a line in a gap', () => {
    const gaps = [{ start: 0, end: 10 }, { start: 30, end: 40 }];
    const starts = estimateStarts(Array.from({ length: 12 }, () => '一二三四'), gaps);
    expect(starts.filter((t) => t > 10 && t < 30)).toEqual([]);
    expect(starts.some((t) => t >= 30)).toBe(true);
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
  });
});

describe('snapToBeat', () => {
  const r = { beats: [1, 1.5, 2, 2.5, 3], downbeats: [1, 3] };
  it('prefers a downbeat within its wider reach', () => {
    expect(snapToBeat(2.75, r)).toBe(3);
  });
  it('takes a near beat, and leaves a start with none close', () => {
    expect(snapToBeat(2.1, r)).toBe(2);
    expect(snapToBeat(8, r)).toBe(8);
  });
});
