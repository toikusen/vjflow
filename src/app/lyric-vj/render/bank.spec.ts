import { describe, expect, it } from 'vitest';
import { BANK_MAX, bankTilt, velocityAt } from './bank';

describe('velocity banking', () => {
  it('leans into its travel as far as it is fast, never past BANK_MAX, and is upright at rest', () => {
    expect(bankTilt(0, 1)).toBe(0);
    expect(bankTilt(0.5, 1)).toBeGreaterThan(0);
    expect(bankTilt(-0.5, 1)).toBeLessThan(0);
    expect(bankTilt(2, 1)).toBeGreaterThan(bankTilt(0.5, 1));
    expect(Math.abs(bankTilt(1e6, 1))).toBeLessThanOrEqual(BANK_MAX);
    expect(Math.abs(bankTilt(-1e6, 1, 0.1))).toBeLessThanOrEqual(0.1);
  });

  it("reads a pure path's velocity at any time alone (the same by seek or play)", () => {
    const path = (t: number): [number, number] => [3 * t, t * t];
    const [vx, vy] = velocityAt(path, 2);
    expect(vx).toBeCloseTo(3, 3);
    expect(vy).toBeCloseTo(4, 3);
  });
});
