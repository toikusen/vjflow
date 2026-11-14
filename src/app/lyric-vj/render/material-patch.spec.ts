import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { binarize } from './ink-mask';
import { HALO_UNIFORMS, haloCut, setPatch } from './material-patch';

const compile = (m: THREE.Material) => {
  const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: 'uniform float opacity;\nvoid main() {\n#include <alphatest_fragment>\n}', vertexShader: '' };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
};

describe('material patches', () => {
  it("a copy keeps the halo's cut while the ink gate binarizes it, and loses only the gate's patch after", () => {
    const m = new THREE.MeshBasicMaterial();
    setPatch(m, 'halo-cut', haloCut);
    binarize(m, true);
    const on = compile(m);
    expect(on.fragmentShader).toContain('step(0.5, diffuseColor.a');
    expect(on.fragmentShader).toContain('texture2D(tHalo');
    // (coverage made all or nothing first, then the cut: the bin line comes right after the include)
    expect(on.fragmentShader.indexOf('step(0.5')).toBeLessThan(on.fragmentShader.indexOf('texture2D(tHalo'));
    expect(on.uniforms['tHalo']).toBe(HALO_UNIFORMS.tHalo);
    expect(m.customProgramCacheKey()).toBe('halo-cut+ink-bin');
    binarize(m, false);
    const off = compile(m);
    expect(off.fragmentShader).not.toContain('step(0.5');
    expect(off.fragmentShader).toContain('texture2D(tHalo');
    expect(m.customProgramCacheKey()).toBe('halo-cut');
  });

  it('setting a patch twice compiles it once', () => {
    const m = new THREE.MeshBasicMaterial();
    setPatch(m, 'halo-cut', haloCut);
    const v = m.version;
    setPatch(m, 'halo-cut', haloCut);
    expect(m.version).toBe(v);
    expect(compile(m).fragmentShader.split('texture2D(tHalo').length).toBe(2);
  });
});
