import { describe, expect, it } from 'vitest';
import { runsDown, TRACK_MAX, trackOpen, trackReach, trackShifts } from './line-track';

describe('tracking-out', () => {
  it('opens from closed when the line shows to full as its exit starts, eased, and held through the exit', () => {
    expect(trackOpen(1, 1, 5)).toBe(0);
    expect(trackOpen(0.5, 1, 5)).toBe(0);
    expect(trackOpen(3, 1, 5)).toBeCloseTo(0.5);
    expect(trackOpen(5, 1, 5)).toBe(1);
    expect(trackOpen(5.3, 1, 5)).toBe(1);
    const v = Array.from({ length: 41 }, (_, i) => trackOpen(1 + i / 10, 1, 5));
    expect(v.every((x, i) => !i || x >= v[i - 1])).toBe(true);
    // slow at both ends: no jerk as it starts opening
    expect(v[1] - v[0]).toBeLessThan(v[20] - v[19]);
  });

  it('is measured at its widest', () => expect(trackOpen(1, 1, 5, true)).toBe(1));

  it('shifts each glyph by its distance from the centre: even steps, symmetric, bounded by TRACK_MAX', () => {
    const s = trackShifts([0, 50, 100, 150], trackReach(1), 1);
    expect(s[0]).toBeCloseTo(-s[3]);
    expect(s[1] - s[0]).toBeCloseTo(s[2] - s[1]);
    expect(trackReach(1)).toBe(TRACK_MAX);
    expect(trackReach(0)).toBeGreaterThan(0);
    expect(trackReach(7)).toBe(TRACK_MAX);
    expect(Math.abs(s[0])).toBeLessThanOrEqual(75 * TRACK_MAX + 1e-9);
    expect(trackShifts([0, 50], 0.2, 0)).toEqual([-0, 0]);
    expect(trackShifts([], 0.2, 1)).toEqual([]);
  });

  it('tells a column from a row (a second row is still a row)', () => {
    expect(runsDown([{ x: 0, y: 0 }, { x: 0, y: -50 }, { x: 0, y: -100 }])).toBe(true);
    expect(runsDown([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: -60 }, { x: 50, y: -60 }])).toBe(false);
    expect(runsDown([{ x: 0, y: 0 }])).toBe(false);
  });
});
