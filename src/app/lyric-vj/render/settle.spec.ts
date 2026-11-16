import { describe, expect, it } from 'vitest';
import { arrivalSpeed, backOut, overshootFor, speedShare } from './settle';

describe('velocity-aware settle', () => {
  it('backOut starts at 0, rests exactly at 1 from k = 1, and is an ease-out cubic with no overshoot', () => {
    for (const s of [0, 0.8, 1.7]) {
      expect(backOut(0, s)).toBe(0);
      expect(backOut(1, s)).toBe(1);
      expect(backOut(1.4, s)).toBe(1);
    }
    expect(backOut(0.5, 0)).toBeCloseTo(1 - 0.5 ** 3);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => backOut(i / 100, 0)))).toBeLessThanOrEqual(1);
  });

  it('overshoots more the faster it arrives, clamped, and not at all when slow', () => {
    const peak = (s: number) => Math.max(...Array.from({ length: 201 }, (_, i) => backOut(i / 200, s)));
    const [slow, fast, faster] = [0.5, 1.5, 9].map((v) => overshootFor(v, 0.8, 0.9, 1.2));
    expect(slow).toBe(0);
    expect(fast).toBeGreaterThan(0);
    expect(faster).toBe(1.2);
    expect(peak(fast)).toBeGreaterThan(1);
    expect(peak(faster)).toBeGreaterThan(peak(fast));
    expect(peak(faster)).toBeLessThan(1.06);
  });

  it('speed is distance over time; a swing scales with it within its bounds', () => {
    expect(arrivalSpeed(300, 0.5)).toBe(600);
    expect(arrivalSpeed(-300, 0.5)).toBe(600);
    expect(speedShare(600, 600)).toBe(1);
    expect(speedShare(6000, 600)).toBe(1.3);
    expect(speedShare(60, 600)).toBe(0.6);
    expect(speedShare(660, 600)).toBeCloseTo(1.1);
  });
});

describe('a carrier dashing out leans with its speed', () => {
  it('is level through reading and leans into the dash as it leaves', async () => {
    const { leaving } = await import('./carrier-shape');
    const m = { landSec: 0.5, exitAt: 3, exitDur: 0.4, exit: 'dash', show: 1 };
    const rest = { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 };
    expect(leaving(rest, 2.9, m, 1).rot).toBe(0);
    // (y is up: leaning right, into a dash to the right, is a clockwise, negative turn)
    expect(leaving(rest, 3.3, m, 1).rot).toBeLessThan(-0.05);
    expect(leaving(rest, 3.3, m, -1).rot).toBeGreaterThan(0.05);
  });
});

describe('elastic follow arithmetic', () => {
  it('sums to one (at rest on its target) and overshoots a step', async () => {
    const { elasticFollow, springTaps } = await import('./follow');
    expect(springTaps().reduce((a, x) => a + x.w, 0)).toBeCloseTo(1, 9);
    const step = (t: number): [number, number] => [t < 1 ? 0 : 1, 0];
    const xs = Array.from({ length: 60 }, (_, i) => elasticFollow(step, 1 + i / 30)![0]);
    expect(Math.max(...xs)).toBeGreaterThan(1.02);
    expect(xs[59]).toBeCloseTo(1, 2);
    expect(elasticFollow(step, 1.3)).toEqual(elasticFollow(step, 1.3));
  });
});
