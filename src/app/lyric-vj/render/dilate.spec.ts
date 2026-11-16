import { describe, expect, it } from 'vitest';
import { discOffsets } from './dilate';

describe('keyline disc', () => {
  it('reaches R and leaves no point of the disc further than half the gap from a stamp (no scallops)', () => {
    for (const R of [7, 14]) {
      const s = discOffsets(R, 3);
      expect(Math.max(...s.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(R, 6);
      for (let x = -R; x <= R; x += 0.7)
        for (let y = -R; y <= R; y += 0.7) {
          if (Math.hypot(x, y) > R) continue;
          expect(Math.min(...s.map(([a, b]) => Math.hypot(a - x, b - y)))).toBeLessThanOrEqual(2.2);
        }
    }
  });
});

describe('keyline reach', () => {
  it('stays inside the halo the final pass measures, so its grain is kept off the whole ring', async () => {
    const { keyReach, keyRingClear } = await import('./dilate');
    const { HALO_REACH } = await import('./final-warp.glsl');
    for (const weak of [2, 4.4, 4.5, 21]) expect(keyRingClear(keyReach(weak)) + 1).toBeLessThanOrEqual(HALO_REACH);
    // still wider where neither ink stands off the ground
    expect(keyReach(3)).toBeGreaterThan(keyReach(7));
  });
});
