import { describe, expect, it } from 'vitest';
import { DECLARED_PART_KINDS, fxKey, keepReadable, READ_FLOOR } from './world-glyph';
import { pairLeast } from '../ink-decide';
import { SURFACE_PARTS } from './surface-parts';
import { contrast } from '../contrast';

/** A fake 2D context over one row of texels. */
const fake = (px: number[][]) => {
  const d = new Uint8ClampedArray(px.flat());
  return { ctx: { getImageData: () => ({ data: d }), putImageData: () => {} } as unknown as CanvasRenderingContext2D, d };
};
const hex = (d: Uint8ClampedArray, i: number) => `#${[0, 1, 2].map((k) => d[i * 4 + k].toString(16).padStart(2, '0')).join('')}`;

describe("a material keeps its face readable on the ground it is drawn on (one rule for gilt, satin, the silhouette's rim)", () => {
  it("a satin highlight on a dark thread that no longer reads on the linen is drawn back toward the thread, the least it takes", () => {
    // navy thread #1c2850 on linen #c5bfb0; a highlight texel mixed 30 % toward white
    const { ctx, d } = fake([[0x1c, 0x28, 0x50, 255], [0x60, 0x69, 0x85, 255], [0x10, 0x10, 0x10, 0]]);
    keepReadable(ctx, 3, 1, { kind: 'satin', tint: '#1c2850', core: '#26365a', eaten: false, on: '#c5bfb0' });
    expect(hex(d, 0)).toBe('#1c2850');
    expect(contrast(hex(d, 1), '#c5bfb0')).toBeGreaterThanOrEqual(READ_FLOOR);
    expect(contrast(hex(d, 1), '#1c2850')).toBeGreaterThan(1.05); // (still a highlight, not flattened)
  });

  it("a declared part's rim texel that cannot read is cleared (the blur narrowed); a face texel is never cleared", () => {
    // paper-lantern: dark body #2a1d14 round a light face on lit paper #ffe3b0: a rim texel blended to near the paper
    const { ctx, d } = fake([[0xf0, 0xd8, 0xa8, 255], [0x60, 0x50, 0x40, 255]]);
    keepReadable(ctx, 2, 1, { kind: 'silhouette', tint: '#2a1d14', core: '#2a1d14', eaten: false, on: '#ffe3b0' });
    expect(contrast(hex(d, 0), '#ffe3b0')).toBeGreaterThanOrEqual(READ_FLOOR);
    expect(contrast(hex(d, 1), '#ffe3b0')).toBeGreaterThanOrEqual(READ_FLOOR);
  });

  it('judges a texel after the final effects, on every ground (Codex 2026-11-16: #787878 read 4.0 through dark-glitch\'s)', () => {
    const fx = { flicker: 0.02, grain: 0.07, vignette: 0.132, halo: true };
    const { ctx, d } = fake([[0x78, 0x78, 0x78, 255]]);
    keepReadable(ctx, 1, 1, { kind: 'tape', tint: '#dccfea', core: '#6a4c93', eaten: false, on: '#000000+#0e0a14', fx: fxKey(fx) });
    for (const g of ['#000000', '#0e0a14']) expect(pairLeast(hex(d, 0), g, fx)).toBeGreaterThanOrEqual(READ_FLOOR);
  });

  it('with no ground known it draws as it did', () => {
    const { ctx, d } = fake([[0xf0, 0xd8, 0xa8, 255]]);
    keepReadable(ctx, 1, 1, { kind: 'gilt', tint: '#c8a85a', core: '#160a0e', eaten: false });
    expect(hex(d, 0)).toBe('#f0d8a8');
  });

  it('the declared part kinds here are the gate\'s (surface-parts)', () => {
    expect([...DECLARED_PART_KINDS].sort()).toEqual(Object.keys(SURFACE_PARTS).sort());
  });
});
