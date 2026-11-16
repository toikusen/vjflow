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

/**
 * Glyph pictures are uploaded premultiplied and undecoded (glyphs.ts premultGlyph): filtering then mixes a stroke's
 * edge texel with a clear neighbour as ink × coverage, never toward black, and the shader takes the ink back out
 * (÷ alpha) and decodes it from sRGB. Straight alpha ran an edge toward black: a light ink on a dark ground drew its
 * kept edge pixels at about 0.43 of its luminance (2026-11-15).
 */
export const unpremultiply: Patch = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb = sampledDiffuseColor.a > 0.0 ? sRGBTransferEOTF( vec4( sampledDiffuseColor.rgb / sampledDiffuseColor.a, 1.0 ) ).rgb : vec3( 0.0 );
  diffuseColor *= sampledDiffuseColor;
#endif`,
  );
};

/** A material showing a premultiplied glyph picture gets `unpremultiply` (once; idempotent). */
export function matchGlyphPicture(m: THREE.Material | THREE.Material[]) {
  for (const x of Array.isArray(m) ? m : [m]) {
    const map = (x as THREE.MeshBasicMaterial).map;
    if (map?.userData['premult'] && !(x as THREE.ShaderMaterial).isShaderMaterial) setPatch(x, 'unpremultiply', unpremultiply);
  }
}

/** A glyph's sung fill (render/sung-fill.ts): where across its picture the fill has reached, which way, and in what ink. */
export interface FillUniforms {
  /** The edge in the picture's uv along the axis: under it is filled (≤ 0 nothing, ≥ 1 all). */
  uFillEdge: { value: number };
  /** 0: a row, filled left to right along u; 1: a column, filled top to bottom (along 1 − v). */
  uFillAxis: { value: number };
  uFillInk: { value: THREE.Color };
}

/**
 * The sung fill drawn in the glyph's own material, not on a copy laid over it: the glyph takes the fill ink up to the
 * edge and keeps its own ink past it, one picture with one outline (a copy is interference to the ink halo and is cut
 * out of the reading glyph's clean zone). The edge is soft over about a texel so it never stair-steps.
 */
export const sungFill = (u: FillUniforms): Patch => (shader) => {
  Object.assign(shader.uniforms, u);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform float uFillEdge, uFillAxis; uniform vec3 uFillInk;\nvoid main() {')
    .replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  float fillAlong = uFillAxis < 0.5 ? vMapUv.x : 1.0 - vMapUv.y;
  float fillSoft = max(fwidth(fillAlong), 1e-4);
  diffuseColor.rgb = mix(diffuseColor.rgb, uFillInk, 1.0 - smoothstep(uFillEdge - fillSoft, uFillEdge + fillSoft, fillAlong));
#endif
#include <map_fragment>`,
    );
};
