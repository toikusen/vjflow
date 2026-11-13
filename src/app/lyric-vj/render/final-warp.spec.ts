import { describe, expect, it } from 'vitest';
import { FINAL_HALO_LIB, FINAL_WARP_LIB, FINAL_WARP_UV, FX_VERSION } from './final-warp.glsl';
import { MASK_WARP } from './ink-mask';
import { FINAL_SHADER } from './engine';

describe('one sampling geometry for the picture and the ink mask', () => {
  it('the final shader and the mask warp both read the shared chunk, and nothing of their own in its place', () => {
    const final = FINAL_SHADER.fragmentShader;
    expect(final).toContain(FINAL_WARP_LIB);
    expect(final).toContain(FINAL_WARP_UV);
    // (the uv is set once, by the chunk)
    expect(final.split('vec2 uv = vUv + uWeave;').length).toBe(2);
    expect(MASK_WARP.fragmentShader).toContain(FINAL_WARP_LIB);
    expect(MASK_WARP.fragmentShader).toContain(FINAL_WARP_UV);
    expect(FINAL_WARP_UV).toContain('vec2 uv = vUv + uWeave;');
  });

  it('the ink halo is one text too: both shaders weigh it the same way, and nothing of its own decides in the final pass', () => {
    expect(FINAL_SHADER.fragmentShader).toContain(FINAL_HALO_LIB);
    expect(MASK_WARP.fragmentShader).toContain(FINAL_HALO_LIB);
    expect(MASK_WARP.fragmentShader).toContain('haloKeep(uvC, uv, d, a)');
    expect(FINAL_SHADER.fragmentShader).toContain('haloKeep(uvC, uv, d, a)');
    // (every noise of the final pass is weighed by the halo where it shows)
    for (const fx of ['uGrain * ho', 'uPixel * ho', 'uGlitch * step(0.45, h1(gb * 1.7)) * ho', 'fract(vUv.y * 360.0)) * ho']) expect(FINAL_SHADER.fragmentShader).toContain(fx);
  });

  it('versions the effect geometry by the chunk', () => {
    expect(FX_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });
});
