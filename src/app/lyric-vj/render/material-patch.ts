// Shader patches a material can carry several of at once (the ink gate's coverage, the ink halo's cut): each by name, all
// applied in name order on compile, the program cached by the names. Setting one never drops another.
import * as THREE from 'three';

type Patch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

/** Adds the patch `key` to `m` (`fn`), or takes it off (`fn` undefined); a no-op when that is already so. */
export function setPatch(m: THREE.Material, key: string, fn?: Patch) {
  const u = m.userData as { patches?: Record<string, Patch> };
  const p = (u.patches ??= {});
  if (fn ? p[key] : !p[key]) return;
  if (fn) p[key] = fn;
  else delete p[key];
  const keys = Object.keys(p).sort();
  m.onBeforeCompile = (shader) => keys.forEach((k) => p[k](shader));
  m.customProgramCacheKey = () => keys.join('+');
  m.needsUpdate = true;
}

/**
 * The ink halo's uniforms every cut copy reads (engine sets them each frame: final-warp.glsl FINAL_HALO_LIB's tHalo,
 * uHaloIn, uHaloOut).
 */
export const HALO_UNIFORMS = { tHalo: { value: null as THREE.Texture | null }, uHaloIn: { value: 0 }, uHaloOut: { value: 0 } };

/**
 * A copy of the words (an echo, a ghost, a misprint, an undeclared extrude, a shine) kept out of the halo's clean zone
 * round every reading glyph and coming back over its ramp (ruling 2026-11-13 §1–2: interference stays off the reading
 * outline). With the halo off it is drawn whole.
 */
export const haloCut: Patch = (shader) => {
  Object.assign(shader.uniforms, HALO_UNIFORMS);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform sampler2D tHalo; uniform float uHaloIn, uHaloOut;\nvoid main() {')
    .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  if (uHaloOut > 0.0) diffuseColor.a *= clamp((texture2D(tHalo, gl_FragCoord.xy / vec2(1920.0, 1080.0)).r - uHaloIn) / max(uHaloOut - uHaloIn, 1e-3), 0.0, 1.0);');
};
