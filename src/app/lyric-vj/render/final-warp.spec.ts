import { describe, expect, it } from 'vitest';
import { FINAL_WARP_LIB, FINAL_WARP_UV, FX_VERSION } from './final-warp.glsl';
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

  it('versions the effect geometry by the chunk', () => {
    expect(FX_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });
});
