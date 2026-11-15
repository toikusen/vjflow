// The ink gate's masks (gate v2, docs/research/2026-11-13-ink-table-gate-design.md §1.2–1.3): which pixel of the final
// composite is which glyph's ink. The same glyph meshes, the same transforms, drawn in their IDs into a target with no
// multisampling, then read through the final pass's own sampling geometry (final-warp.glsl), so a pixel is a glyph's core
// only where every point the final pass read it from was that glyph. QA only: nothing here runs while a video is made.
import * as THREE from 'three';
import { idRgb } from '../ink-verify';
import { setPatch } from './material-patch';
import { FINAL_HALO_LIB, FINAL_WARP_LIB, FINAL_WARP_UV } from './final-warp.glsl';

const W = 1920;
const H = 1080;

/**
 * A glyph material drawn with its geometric coverage made all or nothing (the verification pass, per the ruling: the ink
 * read with no antialiasing, its material, its real opacity and every effect after it kept). Undone by `on = false`.
 */
export function binarize(m: THREE.Material, on: boolean) {
  // (a patch among others, material-patch: the halo's cut on a copy stays)
  setPatch(m, 'ink-bin', on ? (shader) => void (shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  diffuseColor.a = step(0.5, diffuseColor.a / max(opacity, 1e-4)) * opacity;')) : undefined);
}

/**
 * How a glyph picture with a declared part (surface-parts) is split: `keep` 'face' draws only its ink texels, 'part' only
 * the part's; a texel is the part where it is nearer the part's colour than the ink (surface-parts isPartTexel).
 */
export interface Split { tint: string; part: string; keep: 'face' | 'part' }
const vec = (c: string) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255));

/** A glyph's picture drawn as its ID: the picture's own coverage (alpha ≥ 0.5) decides, no tint, no opacity. */
export function idMaterial(src: THREE.MeshBasicMaterial, id: number, split?: Split): THREE.ShaderMaterial {
  const [r, g, b] = idRgb(id);
  const map = src.map;
  map?.updateMatrix();
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, uvT: { value: map ? map.matrix.clone() : new THREE.Matrix3() }, idc: { value: new THREE.Vector3(r / 255, g / 255, b / 255) }, shownOp: { value: (src.opacity ?? 1) > 0 ? 1 : 0 },
      uSplit: { value: split ? (split.keep === 'face' ? 1 : 2) : 0 }, uTint: { value: vec(split?.tint ?? '#000000') }, uPart: { value: vec(split?.part ?? '#000000') }, uPremult: { value: map?.userData['premult'] ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      uniform mat3 uvT; varying vec2 vUv;
      void main(){ vUv = (uvT * vec3(uv, 1.0)).xy; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform sampler2D map; uniform vec3 idc, uTint, uPart; uniform float shownOp, uSplit, uPremult; varying vec2 vUv;
      void main(){
      #include <clipping_planes_fragment>
        vec4 t = texture2D(map, vUv);
        float a = t.a * shownOp;
        if (a < 0.5) discard;
        if (uSplit > 0.0) {                       // a declared part: nearer its colour than the ink (surface-parts isPartTexel)
          vec3 c = uPremult > 0.0 ? t.rgb / max(t.a, 1e-4) : t.rgb;
          bool part = dot(c - uPart, c - uPart) < dot(c - uTint, c - uTint);
          if ((uSplit < 1.5) == part) discard;
        }
        gl_FragColor = vec4(idc, 1.0);
      }`,
    clipping: true,
    clippingPlanes: src.clippingPlanes,
    side: src.side,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    transparent: true,
    toneMapped: false,
  });
}

/**
 * The ID target read through the final pass's sampling: each output pixel gets the ID every one of its sample points
 * holds (alpha 1: a core pixel), else the ID at its centre with alpha 0.5 (mixed), else nothing.
 */
export const MASK_WARP = {
  uniforms: {
    tId: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uFlash: { value: 0 }, uAberration: { value: 0 }, uShockR: { value: -1 }, uShock: { value: 0 },
    uBoil: { value: 0 }, uBoilSeed: { value: 0 }, uGlitch: { value: 0 }, uPixel: { value: 0 }, uWeave: { value: new THREE.Vector2() },
    uZoomHit: { value: 0 }, uTileHit: { value: 0 }, uHasText: { value: 0 }, uGlass: { value: 0 }, tGlass: { value: null as THREE.Texture | null }, tCracks: { value: null as THREE.Texture | null },
    tHalo: { value: null as THREE.Texture | null }, uHaloIn: { value: 0 }, uHaloOut: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tId, tGlass, tCracks; varying vec2 vUv;
    uniform float uTime, uFlash, uAberration, uShockR, uShock, uBoil, uBoilSeed, uGlitch, uPixel, uZoomHit, uTileHit, uHasText, uGlass; uniform vec2 uWeave;
    uniform sampler2D tHalo; uniform float uHaloIn, uHaloOut;
    ${FINAL_WARP_LIB}
    ${FINAL_HALO_LIB}
    vec3 idAt(vec2 p){ return texture2D(tId, p).rgb; }
    void main(){
      ${FINAL_WARP_UV}
      vec3 i0, i1, i2;
      if (uGlass > 0.0) {
        vec2 off = (texture2D(tGlass, vUv).rg - 0.5) * 0.02 * uGlass;
        float split = 0.0016 * texture2D(tCracks, vUv).a;
        i0 = idAt(uv + off + split); i1 = idAt(uv + off); i2 = idAt(uv + off - split);
      } else if ((uZoomHit > 0.0 || uTileHit > 0.0) && uHasText > 0.0 && uHaloOut <= 0.0) {
        i0 = idAt(uv); i1 = i0; i2 = i0;                         // the lyrics come through a hit from uv itself
      } else if (uTileHit > 0.0) {
        i0 = idAt(fract(uv * 3.0)); i1 = i0; i2 = i0;
      } else if (uZoomHit > 0.0) {
        i1 = idAt(0.5 + d); i0 = i1; i2 = i1;
        for (int k = 1; k < 12; k++) { vec3 o = idAt(0.5 + d * (1.0 - 0.26 * uZoomHit * float(k) / 11.0)); if (any(notEqual(o, i1))) i0 = vec3(-1.0); }
      } else if (uPixel > 0.0 && uHasText > 0.0 && uHaloOut <= 0.0) {
        i0 = idAt(uvText); i1 = i0; i2 = i0;                     // the lyrics are sampled off the pixel grid
      } else {
        i0 = idAt(uv + d * a); i1 = idAt(uv); i2 = idAt(uv - d * a);
      }
      // (the halo as the final pass mixes it: read straight where it keeps nothing, both reads must agree where it mixes)
      if (uHaloOut > 0.0 && uGlass <= 0.0) {
        float hk = haloKeep(uvC, uv, d, a);
        vec3 ic = idAt(uvC);
        if (hk <= 0.0) { i0 = ic; i1 = ic; i2 = ic; }
        else if (hk < 1.0 && any(notEqual(ic, i1))) i0 = vec3(-1.0);
      }
      bool core = all(equal(i0, i1)) && all(equal(i1, i2)) && any(greaterThan(i1, vec3(0.0)));
      if (core) { gl_FragColor = vec4(i1, 1.0); return; }
      gl_FragColor = any(greaterThan(i1, vec3(0.0))) ? vec4(i1, 0.5) : vec4(0.0);
    }`,
};

/**
 * Draws `glyphs` (meshes of `scene`, each with its ID) alone in their IDs into `into`: each picture's own coverage
 * (alpha ≥ 0.5) decides, no tint, no opacity (a glyph shown at any opacity is drawn whole). Every material and visibility
 * is put back. (A mesh a drawn one hangs under, a glyph under its echo or shine, is drawn as nothing, not hidden.)
 */
/** Drawn as nothing (a mesh a drawn part hangs under). */
const NOTHING = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
const idCache = new WeakMap<THREE.Material, Map<string, THREE.ShaderMaterial>>();
/**
 * An ID material for a source material, kept and brought up to date (its picture, the picture's transform, whether it is
 * shown, its clip planes), not made and thrown away each frame (Codex review 2026-11-16 P2).
 */
export function idMaterialOf(src: THREE.MeshBasicMaterial, id: number, split?: Split): THREE.ShaderMaterial {
  const key = `${id}|${split ? `${split.keep}${split.tint}${split.part}` : ''}`;
  let byKey = idCache.get(src);
  if (!byKey) {
    idCache.set(src, (byKey = new Map()));
    // (released with its source: three's program cache holds a material until it is disposed; Codex 2026-11-16 P2)
    const kept = byKey;
    src.addEventListener('dispose', () => { kept.forEach((m) => m.dispose()); kept.clear(); idCache.delete(src); });
  }
  let m = byKey.get(key);
  if (!m) { m = idMaterial(src, id, split); byKey.set(key, m); return m; }
  const u = m.uniforms;
  const map = src.map;
  map?.updateMatrix();
  u['map'].value = map;
  (u['uvT'].value as THREE.Matrix3).copy(map ? map.matrix : new THREE.Matrix3());
  u['shownOp'].value = (src.opacity ?? 1) > 0 ? 1 : 0;
  u['uPremult'].value = map?.userData['premult'] ? 1 : 0;
  m.clippingPlanes = src.clippingPlanes;
  m.side = src.side;
  return m;
}

export function drawIds(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, glyphs: { mesh: THREE.Mesh; id: number; split?: Split }[], into: THREE.WebGLRenderTarget) {
  const keep = new Map(glyphs.map((g) => [g.mesh, g.id]));
  const splits = new Map(glyphs.map((g) => [g.mesh, g.split]));
  const hidden: THREE.Object3D[] = [];
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const above = new Set<THREE.Object3D>();
  for (const g of glyphs) for (let p = g.mesh.parent; p; p = p.parent) above.add(p);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine && !(o as THREE.Sprite).isSprite) return;
    const id = keep.get(m);
    if (id === undefined && above.has(o) && m.isMesh) { swapped.push([m, m.material]); m.material = NOTHING; return; }
    if (id === undefined) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
    swapped.push([m, m.material]);
    m.material = idMaterialOf(m.material as THREE.MeshBasicMaterial, id, splits.get(m));
  });
  const [target, clear, alpha, cs] = [renderer.getRenderTarget(), renderer.getClearColor(new THREE.Color()), renderer.getClearAlpha(), renderer.outputColorSpace];
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setRenderTarget(into);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  // (the ID materials are kept for the next frame, one a source material, ID and split: the halo draws this every frame)
  for (const [m, mat] of swapped) m.material = mat;
  hidden.forEach((o) => (o.visible = true));
  renderer.setRenderTarget(target);
  renderer.setClearColor(clear, alpha);
  renderer.outputColorSpace = cs;
}

/** The ink gate's mask targets and passes, made once a page. */
export class InkMask {
  readonly idTarget = new THREE.WebGLRenderTarget(W, H, { samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  readonly warped = new THREE.WebGLRenderTarget(W, H, { samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  private warp = new THREE.ShaderMaterial({ ...MASK_WARP, uniforms: THREE.UniformsUtils.clone(MASK_WARP.uniforms), depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.warp);
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor() {
    this.idTarget.texture.colorSpace = THREE.NoColorSpace;
    this.warped.texture.colorSpace = THREE.NoColorSpace;
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /**
   * Draws `glyphs` (meshes of `scene`, each with its ID) alone in their IDs, then through the final pass's sampling as
   * the final pass's own uniforms have it (`finals`): the warped mask is left in `warped`. Every material and visibility
   * is put back.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, glyphs: { mesh: THREE.Mesh; id: number; split?: Split }[], finals: Record<string, { value: unknown }>) {
    drawIds(renderer, scene, camera, glyphs, this.idTarget);
    const [target, clear, alpha, auto, cs] = [renderer.getRenderTarget(), renderer.getClearColor(new THREE.Color()), renderer.getClearAlpha(), renderer.autoClear, renderer.outputColorSpace];
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const u = this.warp.uniforms;
    for (const k of Object.keys(u)) if (k !== 'tId' && finals[k]) u[k].value = finals[k].value;
    u['tId'].value = this.idTarget.texture;
    renderer.setRenderTarget(this.warped);
    renderer.clear();
    renderer.render(this.quadScene, this.quadCam);
    renderer.setRenderTarget(target);
    renderer.setClearColor(clear, alpha);
    renderer.autoClear = auto;
    renderer.outputColorSpace = cs;
  }

  /** The warped mask's box (frame px, y down) as RGBA rows, top row first. */
  read(renderer: THREE.WebGLRenderer, x0: number, y0: number, w: number, h: number): Uint8Array {
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(this.warped, x0, H - y0 - h, w, h, buf);
    return flipRows(buf, w, h);
  }
}

/** RGBA rows read bottom-up (WebGL) turned top-down. */
export function flipRows(buf: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(buf.length);
  for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}
