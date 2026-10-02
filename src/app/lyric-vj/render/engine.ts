// Lyric-VJ render engine: one frame for any time t (no wall clock). Plates (image / video frames) with camera moves,
// per-shot decoration, per-cue template layers, then bloom + grain/aberration/vignette/flash.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { TEMPLATES } from '../templates';
import { TimelineCue } from '../timeline';
import { beatsDuring, Shot, TreatmentV3 } from '../treatment';
import { clamp01, easeOutCubic, hash } from './glyphs';
import { frameSplit } from './frame-split';
import { punch } from './punch';
import { CueLayer, CueRuntime, EXIT_SEC, FrameFx, LEAD, ShotLayer, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const RENDERERS: Record<string, TemplateRenderer> = { punch, 'frame-split': frameSplit };

export interface AssetSource {
  kind: 'image' | 'video';
  /** image: picture URL; video: URL of the first-frame image (used after the clip runs out). */
  url: string;
  frames?: { pattern: string; count: number; fps: number };
}

export interface RenderJob {
  fps: number;
  window: { start: number; end: number };
  beats: number[];
  cues: TimelineCue[];
  treatment: TreatmentV3;
  assets: Record<string, AssetSource>;
}

export interface CueMetric {
  id: string;
  text: string;
  readableFrom: number;
  readableTo: number;
  readableSec: number;
  requiredSec: number;
  ok: boolean;
}

const FINAL_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uHit: { value: 0 }, uSweep: { value: -1 }, uAberration: { value: 0.0012 }, uGrain: { value: 0.05 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFlash, uHit, uSweep, uAberration, uGrain; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 37.0) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float a = uAberration * (1.0 + 3.0 * uFlash);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * a).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * a).b);
      c *= 1.0 + 0.45 * uHit;                       // accent hit: exposure up (highlights bloom), shadows stay dark
      c *= 1.0 - 0.55 * dot(d, d) * 1.6;            // vignette
      c += (rnd(vUv * 1000.0) - 0.5) * uGrain;      // film grain
      if (uSweep >= 0.0) {                          // light sweep: a soft slanted band crossing left to right
        float x = vUv.x + (vUv.y - 0.5) * 0.25;
        c += vec3(0.55, 0.7, 1.0) * 0.5 * exp(-pow((x - (uSweep * 1.6 - 0.3)) / 0.035, 2.0)) * (1.0 - uSweep * 0.5);
      }
      c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

interface Plate {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

export class LyricVjEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
  private composer: EffectComposer;
  private finalPass: ShaderPass;
  private bloom: UnrealBloomPass;
  private motes: THREE.Points;
  private plates: Plate[] = [];
  private dim: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private textRoot = new THREE.Group();
  private shotLayers = new Map<string, ShotLayer>();
  private cueLayers: { rt: CueRuntime; layer: CueLayer }[] = [];
  private images = new Map<string, THREE.Texture>();
  private frameCache = new Map<string, THREE.Texture>();
  private gradient: THREE.Texture;

  constructor(canvas: HTMLCanvasElement, private job: RenderJob) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    // grade in display (sRGB) space: a 0.2 flash mixed in linear light reads as a ~45 % grey wash
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FINAL_SHADER);
    this.composer.addPass(this.finalPass);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
      mesh.renderOrder = i;
      this.scene.add(mesh);
      this.plates.push({ mesh });
    }
    const N = 260;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthTest: false, sizeAttenuation: false }));
    this.motes.renderOrder = 2.5;
    this.scene.add(this.motes);
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, H * 1.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false }));
    this.dim.renderOrder = 2;
    this.scene.add(this.dim);
    this.textRoot.renderOrder = 3;
    this.scene.add(this.textRoot);
    this.gradient = this.makeGradient();
  }

  async init() {
    const { treatment, cues } = this.job;
    const fonts = treatment.styleAnchor.fonts;
    const text = cues.map((c) => c.text).join('');
    await Promise.all([document.fonts.load(`400 100px "${fonts.display}"`, text), document.fonts.load(`900 100px "${fonts.body}"`, text), document.fonts.load(`700 100px "${fonts.body}"`, text)]);
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(this.job.assets).map(async ([id, a]) => {
        const tex = await loader.loadAsync(a.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.images.set(id, tex);
      }),
    );
    for (const shot of treatment.shots) {
      const r = RENDERERS[shot.template];
      if (r?.shot) {
        const layer = r.shot(shot, shot.params, treatment.styleAnchor.palette);
        layer.group.visible = false;
        this.textRoot.add(layer.group);
        this.shotLayers.set(shot.id, layer);
      }
    }
    const styled = treatment.cues
      .map((style) => ({ style, cue: cues.find((c) => c.id === style.cueId)! }))
      .filter((x) => x.cue)
      .sort((a, b) => a.cue.start - b.cue.start);
    styled.forEach(({ style, cue }, i) => {
      const shot = treatment.shots.find((s) => s.id === style.shot)!;
      const next = styled[i + 1]?.cue;
      const nextShow = next ? next.start - LEAD : Infinity;
      const exitAt = Math.min(cue.end, nextShow - EXIT_SEC - 0.02);
      const inBeats = beatsDuring(this.job.beats, cue.start, cue.end);
      const rt: CueRuntime = {
        cue, style, shot, params: shot.params, palette: treatment.styleAnchor.palette, fonts,
        showFrom: cue.start - LEAD,
        exitAt: Math.max(cue.start + 0.3, exitAt),
        exitDur: Math.max(0.08, Math.min(EXIT_SEC, nextShow - Math.max(cue.start + 0.3, exitAt) - 0.02)),
        accentTimes: (style.accents ?? []).map((k) => inBeats[k]).filter((b) => b !== undefined),
      };
      const layer = RENDERERS[shot.template].cue(rt);
      layer.group.visible = false;
      this.textRoot.add(layer.group);
      this.cueLayers.push({ rt, layer });
    });
  }

  metrics(): { cues: CueMetric[]; accents: { cueId: string; time: number }[] } {
    return {
      cues: this.cueLayers.map(({ rt, layer }) => {
        const [from, to] = layer.readable();
        const readableSec = Math.max(0, to - from);
        const requiredSec = Math.min(1, 0.6 * (rt.cue.end - rt.cue.start));
        return { id: rt.cue.id, text: rt.cue.text, readableFrom: from, readableTo: to, readableSec, requiredSec, ok: readableSec >= requiredSec };
      }),
      accents: this.cueLayers.flatMap(({ rt }) => rt.accentTimes.map((time) => ({ cueId: rt.cue.id, time }))),
    };
  }

  private shotAt(t: number): { shot: Shot; prev?: Shot } {
    const shots = this.job.treatment.shots;
    const i = Math.max(0, shots.findIndex((s) => s.start <= t && t < s.end));
    return { shot: shots[i] ?? shots[shots.length - 1], prev: shots[i - 1] };
  }

  /** Plate texture for a shot at time t: video frame while the clip lasts, then its first-frame image. */
  private async plateTexture(shot: Shot, t: number): Promise<{ tex: THREE.Texture; fromStill: number }> {
    const a = shot.asset ? this.job.assets[shot.asset] : undefined;
    if (!a) return { tex: this.gradient, fromStill: 0 };
    if (a.kind === 'image' || !a.frames) return { tex: this.images.get(shot.asset!)!, fromStill: 0 };
    const local = t - shot.start + (shot.clipStart ?? 0);
    const idx = Math.floor(local * a.frames.fps);
    if (idx >= a.frames.count) return { tex: this.images.get(shot.asset!)!, fromStill: local - a.frames.count / a.frames.fps };
    const url = a.frames.pattern.replace('%05d', String(Math.max(0, idx) + 1).padStart(5, '0'));
    let tex = this.frameCache.get(url);
    if (!tex) {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { imageOrientation: 'flipY' });
      tex = new THREE.Texture(bmp);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.frameCache.set(url, tex);
      if (this.frameCache.size > 8) {
        const [k, old] = this.frameCache.entries().next().value!;
        old.dispose();
        this.frameCache.delete(k);
      }
    }
    return { tex, fromStill: 0 };
  }

  private placePlate(p: Plate, tex: THREE.Texture, shot: Shot, t: number, opacity: number) {
    const img = tex.image as { width: number; height: number };
    const cover = Math.max(W / img.width, H / img.height);
    const k = clamp01((t - shot.start) / Math.max(0.1, shot.end - shot.start));
    // stills must keep moving (a slow push alone reads as a frozen picture)
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    let s = 1.06;
    let x = 0;
    let y = 0;
    if (shot.camera === 'static') [s, x] = [1.06 + 0.03 * k, Math.sin(t * 0.6) * 12];
    if (shot.camera === 'push') [s, y] = [1.02 + 0.16 * e, -20 * e];
    if (shot.camera === 'pan') [s, x] = [1.12, (e - 0.5) * W * 0.1];
    if (shot.camera === 'parallax') [s, x, y] = [1.08 + 0.1 * e, (e - 0.5) * W * 0.06, -24 * e];
    p.mesh.material.map = tex;
    p.mesh.material.needsUpdate = true;
    p.mesh.scale.set(img.width * cover * s, img.height * cover * s, 1);
    p.mesh.position.set(x, y, 0);
    p.mesh.material.opacity = opacity;
  }

  async renderAt(t: number) {
    const { shot, prev } = this.shotAt(t);
    const fx: FrameFx = { flash: 0, hit: 0, shake: 0 };
    const since = t - shot.start;
    // a flash is a few frames of white: a slower decay reads as grey fog over a dark plate
    if (shot.transitionIn === 'flash') fx.flash = Math.max(fx.flash, 0.9 * Math.exp(-since * 24) * (since >= 0 ? 1 : 0));
    if (shot.transitionIn === 'flash') fx.hit = Math.max(fx.hit, Math.exp(-since * 6) * (since >= 0 ? 1 : 0)); // then glows down
    const sweep = shot.transitionIn === 'wipe' && since >= 0 && since < 0.35 ? since / 0.35 : -1;

    const cur = await this.plateTexture(shot, t);
    // dissolving a plate into itself at another camera position shows a double image: skip it for the same asset
    const dissolve = prev && shot.transitionIn === 'dissolve' && prev.asset !== shot.asset ? clamp01(since / 0.4) : 1;
    if (prev && dissolve < 1) {
      const p0 = await this.plateTexture(prev, t);
      this.placePlate(this.plates[0], p0.tex, prev, t, 1);
      this.placePlate(this.plates[1], cur.tex, shot, t, dissolve);
    } else {
      this.placePlate(this.plates[0], cur.tex, shot, t, 1);
      this.plates[1].mesh.material.opacity = 0;
      // after a video clip runs out, its still crossfades in over 0.5 s (spec 3.2)
      if (cur.fromStill > 0 && cur.fromStill < 0.5) {
        const last = await this.plateTexture(shot, shot.start + (this.job.assets[shot.asset!].frames!.count - 1) / this.job.assets[shot.asset!].frames!.fps);
        this.placePlate(this.plates[0], last.tex, shot, t, 1);
        this.placePlate(this.plates[1], cur.tex, shot, t, cur.fromStill / 0.5);
      }
    }
    this.updateMotes(t, fx.hit);
    const dimTarget = (shot.params['dim'] as number) ?? 0.3;
    const dimPrev = prev ? ((prev.params['dim'] as number) ?? 0.3) : dimTarget;
    this.dim.material.opacity = dimPrev + (dimTarget - dimPrev) * easeOutCubic(since / 0.4);

    for (const [id, layer] of this.shotLayers) {
      const s = this.job.treatment.shots.find((x) => x.id === id)!;
      layer.group.visible = t >= s.start && t < s.end;
      if (layer.group.visible) layer.update(t, fx);
    }
    for (const { rt, layer } of this.cueLayers) {
      layer.group.visible = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05;
      if (layer.group.visible) layer.update(t, fx);
    }
    const shake = fx.shake * 10;
    this.camera.position.set((hash(t * 30) - 0.5) * shake, (hash(t * 30, 1) - 0.5) * shake, 5);
    this.finalPass.uniforms['uTime'].value = Math.floor(t * this.job.fps) / this.job.fps;
    this.finalPass.uniforms['uFlash'].value = fx.flash;
    this.finalPass.uniforms['uHit'].value = fx.hit;
    this.bloom.strength = 0.55 + 0.9 * fx.hit;
    this.finalPass.uniforms['uSweep'].value = sweep;
    this.composer.render();
  }

  /** Drifting light motes (deterministic in t): keep every shot alive even on a still plate. */
  private updateMotes(t: number, hit: number) {
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const sp = 18 + hash(i, 3) * 50;
      const y = ((hash(i, 1) * (H + 200) + t * sp) % (H + 200)) - H / 2 - 100;
      const x = (hash(i, 2) - 0.5) * W + Math.sin(t * 0.4 + i) * 30;
      pos.setXYZ(i, x, y, 0);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).color.set(this.job.treatment.styleAnchor.palette.glow);
    (this.motes.material as THREE.PointsMaterial).opacity = 0.45 + 0.4 * hit;
  }

  private makeGradient(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 540;
    const ctx = c.getContext('2d')!;
    const p = this.job.treatment.styleAnchor.palette;
    const g = ctx.createRadialGradient(480, 220, 40, 480, 270, 620);
    g.addColorStop(0, p.glow);
    g.addColorStop(0.35, p.background);
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 540);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
