import { GAIT, limb, pawAt } from './quadruped';

describe('quadruped walk', () => {
  it('keeps a planted paw moving backward at the body speed, so it stays put on the ground', () => {
    const a = pawAt(0.1, 100, 20, -1);
    const b = pawAt(0.2, 100, 20, -1);
    expect(a.planted && b.planted).toBe(true);
    // walking left: relative to the hip the paw drifts right by stride × Δphase / duty
    expect(b.x - a.x).toBeCloseTo((100 * 0.1) / 0.62, 6);
    expect(a.lift).toBe(0);
  });

  it('lifts the paw in the swing and lands it where the next stance starts', () => {
    const mid = pawAt(0.81, 100, 20, -1);
    expect(mid.planted).toBe(false);
    expect(mid.lift).toBeGreaterThan(19);
    expect(pawAt(0.9999, 100, 20, -1).x).toBeCloseTo(pawAt(0, 100, 20, -1).x, 1);
  });

  it('lifts off and lands at rest on the ground, so a step never jerks', () => {
    const cycle = 100 / 0.62;
    const worldAt = (p: number) => -cycle * p + pawAt(p, 100, 20, -1).x;
    const speed = (p: number) => Math.abs(worldAt(p + 1e-4) - worldAt(p)) / 1e-4 / cycle;
    expect(speed(0.62 + 1e-4)).toBeLessThan(0.01);
    expect(speed(1 - 2e-4)).toBeLessThan(0.01);
    expect(speed(0.81)).toBeGreaterThan(2);
  });

  it('puts the paw of a two-bone limb on its target', () => {
    const L = 200;
    for (const [x, y] of [[30, 180], [-40, 170], [0, 150]]) {
      const [a1, a2] = limb(x, y, L, true, -1);
      const knee = [-(L / 2) * Math.sin(a1), (L / 2) * Math.cos(a1)];
      const paw = [knee[0] - (L / 2) * Math.sin(a2), knee[1] + (L / 2) * Math.cos(a2)];
      expect(paw[0]).toBeCloseTo(x, 3);
      expect(paw[1]).toBeCloseTo(y, 3);
    }
  });

  it('walks a lateral sequence: each leg a quarter cycle after the last', () => {
    expect(Object.values(GAIT).sort()).toEqual([0, 0.25, 0.5, 0.75]);
  });
});
