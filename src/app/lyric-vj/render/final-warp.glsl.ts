// The final pass's sampling geometry, shared by FINAL_SHADER (engine.ts) and the ink gate's mask warp (ink-mask.ts): where
// each output pixel reads the picture from (weave, boil, glitch bands, the pixel grid, the shockwave, the aberration
// split). One text, so the mask can never drift from the picture (docs/research/2026-11-13-ink-table-gate-design.md §1.2).
// Both shaders declare the uniforms the chunk reads: uTime, uFlash, uAberration, uShockR, uShock, uBoil, uBoilSeed,
// uGlitch, uPixel, uWeave.

/** Constants and helpers (needs uTime declared before it). */
export const FINAL_WARP_LIB = /* glsl */ `
    const vec2 RES = vec2(1920.0, 1080.0);
    const vec3 LUMA = vec3(0.299, 0.587, 0.114);
    const vec2 PIX = vec2(320.0, 180.0);         // the pixel medium's grid (6 px cells)
    const vec2 ORIGIN = vec2(0.5, 0.34);            // the horizon in the emotional style's compositions
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 37.0) * 43758.5453); }
    float h1(float x){ return fract(sin(x * 91.3458) * 47453.5453); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

/**
 * The ink halo (ruling 2026-11-13 §2, docs/research/2026-11-13-ink-halo-codex.md): round every reading glyph (its face and
 * its declared extrude, their full geometric support, never shrunk by a fade) the destructive effects are at zero up to
 * uHaloIn px and come back by uHaloOut px (1920×1080). tHalo holds each pixel's distance to the nearest reading glyph in
 * px (engine inkHalo, an exact distance up to HALO_REACH). haloKeep is how much of the effects' geometry a pixel keeps:
 * the least of the halo where the pixel shows (its output footprint) and where each of its samples is read from (its
 * source footprint: the aberration split, a glitch band's jump, the pixel grid, the shock, a hit's tile or zoom smear).
 * uHaloOut 0: off, everything kept. Needs uTileHit, uZoomHit, tHalo, uHaloIn, uHaloOut declared before it.
 */
export const FINAL_HALO_LIB = /* glsl */ `
    float haloAt(vec2 p){
      if (uHaloOut <= 0.0) return 1.0;
      return clamp((texture2D(tHalo, p).r - uHaloIn) / max(uHaloOut - uHaloIn, 1e-3), 0.0, 1.0);
    }
    float haloKeep(vec2 uvC, vec2 uv, vec2 d, float a){
      if (uHaloOut <= 0.0) return 1.0;
      float h = min(haloAt(uvC), min(haloAt(uv), min(haloAt(uv + d * a), haloAt(uv - d * a))));
      if (uTileHit > 0.0) h = min(h, haloAt(fract(uv * 3.0)));
      if (uZoomHit > 0.0) for (int i = 0; i < 12; i++) h = min(h, haloAt(0.5 + d * (1.0 - 0.26 * uZoomHit * float(i) / 11.0)));
      return h;
    }
`;
/** How far tHalo measures, px: the widest halo it can hold (uHaloOut at most this). */
export const HALO_REACH = 12;

/** The start of main(): from vUv it sets uv, uvC, uvText, q, r, d and a, exactly as the final pass samples. */
export const FINAL_WARP_UV = /* glsl */ `
      vec2 uv = vUv + uWeave;                       // gate weave / stop-motion jitter
      vec2 uvC = uv;                                // the picture read straight, the halo's (moves with the whole frame only)
      if (uBoil > 0.0) {                            // line boil: coherent ~40 px wobble, redrawn a few times a second
        vec2 n = vUv * RES / 40.0 + uBoilSeed * 7.31;
        uv += (vec2(vnoise(n), vnoise(n + 17.3)) - 0.5) * 2.0 * uBoil / RES;
      }
      if (uGlitch > 0.0) {                          // broken signal across the whole frame: bands jump sideways
        float band = floor(vUv.y * 14.0) + floor(uTime * 30.0) * 7.0;
        float on = step(0.45, h1(band * 1.7));
        uv.x += (h1(band) - 0.5) * 0.12 * uGlitch * on;
        uv.y += (h1(band + 3.1) - 0.5) * 0.01 * uGlitch;
      }
      vec2 uvText = uv;                             // lyrics are sampled off the pixel grid
      if (uPixel > 0.0) uv = mix(uv, (floor(uv * PIX) + 0.5) / PIX, uPixel);
      vec2 q = (uv - ORIGIN) * vec2(1.7778, 1.0);
      float r = length(q);
      if (uShockR >= 0.0) {                         // shockwave: a thin ring pushes the image outward as it passes
        float ring = exp(-pow((r - uShockR * 1.6) / 0.06, 2.0));
        uv += normalize(q + 1e-5) / vec2(1.7778, 1.0) * ring * 0.028 * uShock;
      }
      vec2 d = uv - 0.5;
      float a = uAberration * (3.0 * uFlash + uShock) + 0.012 * uGlitch; // only on hits, faint on the shockwave: a strong split doubled the drop's type into ghosts
`;

/** The effect geometry's version: a hash of the shared chunk (a gate result is read against the version it was made on). */
export const FX_VERSION = (() => {
  let h = 0x811c9dc5;
  for (const ch of FINAL_WARP_LIB + FINAL_HALO_LIB + FINAL_WARP_UV) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
})();
