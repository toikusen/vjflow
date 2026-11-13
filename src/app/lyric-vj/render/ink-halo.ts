// The ink halo (ruling 2026-11-13 §2, docs/research/2026-11-13-ink-halo-codex.md): each pixel's distance to the nearest
// reading glyph (a face, its declared extrude; their full geometric support, whatever their fade), for the final pass and
// the scene's own noise to stay off round the words (final-warp.glsl FINAL_HALO_LIB). An exact Euclidean distance up to
// HALO_REACH px in two passes: along each row to the nearest glyph pixel, then down each column (separable EDT).
import * as THREE from 'three';
import { drawIds } from './ink-mask';
import { HALO_REACH } from './final-warp.glsl';

const W = 1920;
const H = 1080;
const R = HALO_REACH;

const pass = (frag: string) =>
  new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null as THREE.Texture | null } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; const float R = ${R.toFixed(1)}; const vec2 RES = vec2(${W}.0, ${H}.0);
      void main(){ ${frag} }`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });

/** The halo's targets and passes, made once an engine. `texture`: the distance in px (R channel), R + 1 beyond reach. */
export class InkHalo {
  private support = new THREE.WebGLRenderTarget(W, H, { samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  private rows = new THREE.WebGLRenderTarget(W, H, { samples: 0, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  private dist = new THREE.WebGLRenderTarget(W, H, { samples: 0, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  private across = pass(`float b = R + 1.0; for (int k = -${R}; k <= ${R}; k++) if (texture2D(tSrc, vUv + vec2(float(k), 0.0) / RES).a > 0.5) b = min(b, abs(float(k))); gl_FragColor = vec4(b, 0.0, 0.0, 1.0);`);
  private down = pass(`float b = R + 1.0; for (int k = -${R}; k <= ${R}; k++) { float g = texture2D(tSrc, vUv + vec2(0.0, float(k)) / RES).r; b = min(b, sqrt(g * g + float(k * k))); } gl_FragColor = vec4(min(b, R + 1.0), 0.0, 0.0, 1.0);`);
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.across);
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly texture = this.dist.texture;
  constructor() {
    for (const t of [this.support, this.rows, this.dist]) t.texture.colorSpace = THREE.NoColorSpace;
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Measures the halo round `meshes` (shown meshes of `scene`) as drawn by `camera` now. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, meshes: THREE.Mesh[]) {
    drawIds(renderer, scene, camera, meshes.map((mesh) => ({ mesh, id: 1 })), this.support);
    const [target, cs] = [renderer.getRenderTarget(), renderer.outputColorSpace];
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    for (const [m, src, into] of [[this.across, this.support, this.rows], [this.down, this.rows, this.dist]] as const) {
      this.quad.material = m;
      m.uniforms['tSrc'].value = src.texture;
      renderer.setRenderTarget(into);
      renderer.render(this.quadScene, this.quadCam);
    }
    renderer.setRenderTarget(target);
    renderer.outputColorSpace = cs;
  }
}
