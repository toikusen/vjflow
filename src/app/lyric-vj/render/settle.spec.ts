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
