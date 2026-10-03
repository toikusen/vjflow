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
import { clamp01, easeOutCubic, hash, setKanaScale } from './glyphs';
import { frameSplit } from './frame-split';
import { handwrite } from './handwrite';
import { titleCard } from './title-card';
import { punch } from './punch';
import { fxAt, MomentFx } from '../moments';
import { colorAt, DEFAULT_DESIGN } from '../design';
import { MotifLayer } from './motif-layer';
import type { Palette } from '../treatment';
import { DEFAULT_FONTS, FontChoice, nearestWeight, resolveFonts } from '../fonts';
import { scatter } from './scatter';
import { typewriter } from './typewriter';
import { vertical } from './vertical';
import { CueLayer, CueRuntime, EXIT_SEC, FrameFx, LEAD, ShotLayer, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const RENDERERS: Record<string, TemplateRenderer> = { punch, 'frame-split': frameSplit, typewriter, vertical, scatter, handwrite, 'title-card': titleCard };

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
  /** The user's font choice; overrides the treatment's. */
  fonts?: FontChoice;
  /** Song identity for title cards; `logo` is an image URL (the group logo upload, later). */
  meta?: { title: string; artist: string; logo?: string };
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
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uHit: { value: 0 }, uSweep: { value: -1 }, uAberration: { value: 0.0012 }, uGrain: { value: 0.05 }, uPaper: { value: 0 }, uBeams: { value: 0 },
    // section moments (moments.ts)
    uVignette: { value: 0 }, uRays: { value: 0 }, uShockR: { value: -1 }, uShock: { value: 0 },
    uRayColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFlash, uHit, uSweep, uAberration, uGrain, uPaper, uBeams;
    uniform float uVignette, uRays, uShockR, uShock; uniform vec3 uRayColor; varying vec2 vUv;
    const vec2 ORIGIN = vec2(0.5, 0.34);            // the horizon in the emotional style's compositions
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 37.0) * 43758.5453); }
    float h1(float x){ return fract(sin(x * 91.3458) * 47453.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 q = (uv - ORIGIN) * vec2(1.7778, 1.0);
      float r = length(q);
      if (uShockR >= 0.0) {                         // shockwave: a thin ring pushes the image outward as it passes
        float ring = exp(-pow((r - uShockR * 1.6) / 0.06, 2.0));
        uv += normalize(q + 1e-5) / vec2(1.7778, 1.0) * ring * 0.028 * uShock;
      }
      vec2 d = uv - 0.5;
      float a = uAberration * (1.0 + 3.0 * uFlash + 3.0 * uShock); // more reads as a template RGB-split effect
      vec3 c = vec3(texture2D(tDiffuse, uv + d * a).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * a).b);
      c *= 1.0 + 0.45 * uHit;         // accent hit: exposure up (highlights bloom), shadows stay dark
      if (uRays > 0.0) {                            // light rays bursting from the horizon, added light only
        float ang = atan(q.y, q.x);
        float k = floor((ang + 3.1416) * 18.0);
        float beam = pow(0.5 + 0.5 * cos(ang * 36.0 + h1(k) * 6.28), 6.0) * (0.4 + 0.6 * h1(k + 7.0));
        float fall = exp(-r * 1.1) * smoothstep(0.0, 0.06, r);
        c += uRayColor * (beam * fall * 1.4 + exp(-r * 4.0) * 0.8) * uRays;
      }
      if (uBeams > 0.0) {                           // diagonal parallel light beams sweeping across
        float x = uv.x * 1.7778 + uv.y * 0.9 - uTime * 0.9;
        float band = pow(0.5 + 0.5 * sin(x * 9.0), 18.0) + 0.6 * pow(0.5 + 0.5 * sin(x * 23.0 + 1.3), 30.0);
        c += uRayColor * band * uBeams * 0.85;
      }
      c *= 1.0 - (0.55 + uVignette) * dot(d, d) * 1.6; // vignette
      c += (rnd(vUv * 1000.0) - 0.5) * uGrain;      // film grain
      if (uPaper > 0.0) {                           // static print/paper texture: fibres and soft blotches
        vec2 p = vUv * vec2(1920.0, 1080.0);
        float fib = h1(floor(p.x / 3.0) * 7.0 + floor(p.y * 0.7)) * 0.5 + h1(floor(p.y / 2.0) * 13.0 + floor(p.x * 0.3)) * 0.5;
        float blot = sin(vUv.x * 9.0 + sin(vUv.y * 7.0) * 2.0) * sin(vUv.y * 11.0 + vUv.x * 3.0);
        c *= 1.0 - uPaper * (0.07 * fib + 0.05 * (0.5 + 0.5 * blot));
      }
      if (uSweep >= 0.0) {                          // light sweep: a soft slanted band crossing left to right
        float x = vUv.x + (vUv.y - 0.5) * 0.25;
        c += vec3(0.55, 0.7, 1.0) * 0.5 * exp(-pow((x - (uSweep * 1.6 - 0.3)) / 0.035, 2.0)) * (1.0 - uSweep * 0.5);
      }
      c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

interface Plate {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

/** A plate draws one frame, or two adjacent frames blended (slowed clips), in a single pass. */
const plateMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      map: { value: null }, map2: { value: null }, mixAmt: { value: 0 }, opacity: { value: 1 }, exposure: { value: 1 }, sat: { value: 1 },
      shadowC: { value: new THREE.Color(0, 0, 0) }, highlightC: { value: new THREE.Color(1, 1, 1) }, duo: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // exposure/saturation from the emotional arc grade the background only, so lyrics never go grey
    // the song's duotone turns any plate into a designed two-colour image (the main AI-look tell is full colour)
    fragmentShader: `uniform sampler2D map; uniform sampler2D map2; uniform float mixAmt, opacity, exposure, sat, duo; uniform vec3 shadowC, highlightC; varying vec2 vUv;
      void main() {
        vec3 c = mix(texture2D(map, vUv).rgb, texture2D(map2, vUv).rgb, mixAmt) * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, mix(shadowC, highlightC, smoothstep(0.03, 0.9, l)), duo);
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, sat);
        gl_FragColor = vec4(c, opacity);
      }`,
  });

/** Mostly Latin letters (an English line): set in the accent face. */
export const isLatinLine = (text: string) => {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  return letters.length > 0 && letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length >= 0.7;
};

export class LyricVjEngine {
  private renderer: THREE.WebGLRenderer;
  private fonts = DEFAULT_FONTS;
  private accentFont = DEFAULT_DESIGN.accentFont;
  private motif?: MotifLayer;
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
    this.renderer.localClippingEnabled = true; // handwrite reveals glyphs with clip planes
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
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMaterial());
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
    const design = treatment.design ?? DEFAULT_DESIGN;
    const fonts = (this.fonts = resolveFonts({ ...this.job.fonts, family: this.job.fonts?.family ?? design.font }));
    setKanaScale(design.kanaScale);
    this.accentFont = design.accentFont;
    await document.fonts.load(`400 100px "${design.accentFont}"`, 'Aa');
    const text = cues.map((c) => c.text).join('');
    const faces = [[fonts.display, 400], [fonts.body, 900], [fonts.body, 700], [fonts.script, 400]] as const;
    await Promise.all(faces.map(([f, w]) => document.fonts.load(`${nearestWeight(f, w)} 100px "${f}"`, text)));
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(this.job.assets).map(async ([id, a]) => {
        const tex = await loader.loadAsync(a.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.images.set(id, tex);
      }),
    );
    const logo = this.job.meta?.logo ? await loader.loadAsync(this.job.meta.logo) : undefined;
    if (logo) logo.colorSpace = THREE.SRGBColorSpace;
    const ctx = { fonts: this.fonts, accentFont: this.accentFont, meta: { title: this.job.meta?.title ?? '', artist: this.job.meta?.artist ?? '' }, logo };
    if (treatment.motif) {
      this.motif = new MotifLayer(treatment.motif, this.job.beats, { display: this.fonts.display, accent: this.accentFont });
      this.motif.group.renderOrder = 2.7; // above the background and motes, under the lyrics
      this.scene.add(this.motif.group);
    }
    for (const shot of treatment.shots) {
      const r = RENDERERS[shot.template];
      if (r?.shot) {
        const layer = r.shot(r.standalone ? { ...shot, start: this.clearOfLines(shot) } : shot, shot.params, treatment.styleAnchor.palette, ctx);
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
      const len = cue.end - cue.start;
      const pace = Math.min(1, Math.max(0.35, len / 2)); // short lines enter and leave faster so they stay readable
      const exitSec = EXIT_SEC * pace;
      const exitAt = Math.min(cue.end, nextShow - exitSec - 0.02);
      const inBeats = beatsDuring(this.job.beats, cue.start, cue.end);
      const rt: CueRuntime = {
        cue, style, shot, params: shot.params, palette: this.paletteAt(cue.start),
        // an English line is set in the paired Latin face
        fonts: isLatinLine(cue.text) ? { display: this.accentFont, body: this.accentFont, script: this.accentFont } : this.fonts,
        showFrom: cue.start - LEAD,
        exitAt: Math.max(cue.start + 0.25 * pace, exitAt),
        exitDur: Math.max(0.08, Math.min(exitSec, nextShow - Math.max(cue.start + 0.25 * pace, exitAt) - 0.02)),
        accentTimes: (style.accents ?? []).map((k) => inBeats[k]).filter((b) => b !== undefined),
        pace,
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

  /**
   * Consecutive shots on the same asset form one run: the clip plays straight through it and the camera move spans it,
   * so a cut between those shots changes only the text, never jumps the background back.
   */
  private runOf(shot: Shot): { start: number; end: number; first: Shot } {
    const shots = this.job.treatment.shots;
    let i = shots.indexOf(shot);
    let j = i;
    while (i > 0 && shots[i - 1].asset === shot.asset) i--;
    while (j < shots.length - 1 && shots[j + 1].asset === shot.asset) j++;
    return { start: shots[i].start, end: shots[j].end, first: shots[i] };
  }

  /**
   * Plate frames for a shot at time t. A clip shorter than its run plays slower (down to half speed, adjacent frames
   * blended), then holds its last frame: it never restarts or falls back to the first-frame still.
   */
  private async plateTexture(shot: Shot, t: number): Promise<{ tex: THREE.Texture; next?: THREE.Texture; mix: number }> {
    const a = shot.asset ? this.job.assets[shot.asset] : undefined;
    if (!a) return { tex: this.gradient, mix: 0 };
    if (a.kind === 'image' || !a.frames) return { tex: this.images.get(shot.asset!)!, mix: 0 };
    const run = this.runOf(shot);
    const from = run.first.clipStart ?? 0;
    const clipSec = a.frames.count / a.frames.fps;
    const speed = Math.min(1, Math.max(0.5, (clipSec - from) / Math.max(0.1, run.end - run.start)));
    const f = Math.min(a.frames.count - 1, Math.max(0, (from + (t - run.start) * speed) * a.frames.fps));
    const idx = Math.floor(f);
    const tex = await this.frame(a.frames.pattern, idx);
    if (idx >= a.frames.count - 1 || speed >= 1) return { tex, mix: 0 };
    return { tex, next: await this.frame(a.frames.pattern, idx + 1), mix: f - idx };
  }

  private async frame(pattern: string, idx: number): Promise<THREE.Texture> {
    const url = pattern.replace('%05d', String(idx + 1).padStart(5, '0'));
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
    return tex;
  }

  private placePlate(p: Plate, tex: THREE.Texture, shot: Shot, t: number, opacity: number, next?: THREE.Texture, mix = 0) {
    const img = tex.image as { width: number; height: number };
    const cover = Math.max(W / img.width, H / img.height);
    const run = this.runOf(shot);
    const k = clamp01((t - run.start) / Math.max(0.1, run.end - run.start));
    shot = run.first; // the run keeps its first shot's camera move
    // stills must keep moving (a slow push alone reads as a frozen picture)
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    let s = 1.06;
    let x = 0;
    let y = 0;
    if (shot.camera === 'static') [s, x] = [1.06 + 0.03 * k, Math.sin(t * 0.6) * 12];
    if (shot.camera === 'push') [s, y] = [1.02 + 0.16 * e, -20 * e];
    if (shot.camera === 'pan') [s, x] = [1.12, (e - 0.5) * W * 0.1];
    if (shot.camera === 'parallax') [s, x, y] = [1.08 + 0.1 * e, (e - 0.5) * W * 0.06, -24 * e];
    const u = p.mesh.material.uniforms;
    u['map'].value = tex;
    u['map2'].value = next ?? tex;
    u['mixAmt'].value = next ? mix : 0;
    u['opacity'].value = opacity;
    p.mesh.scale.set(img.width * cover * s, img.height * cover * s, 1);
    p.mesh.position.set(x, y, 0);
  }

  async renderAt(t: number) {
    const { shot, prev } = this.shotAt(t);
    const fx: FrameFx = { flash: 0, hit: 0, shake: 0 };
    const since = t - shot.start;
    // a flash is a few frames of white: a slower decay reads as grey fog over a dark plate
    // a drop/finale on this cut already is the impact: stacking the white flash on it is too much
    const momentHere = (this.job.treatment.moments ?? []).some((m) => (m.kind === 'drop' || m.kind === 'finale') && Math.abs(m.at - shot.start) < 0.3);
    const flashIn = shot.transitionIn === 'flash' && !momentHere;
    if (flashIn) fx.flash = Math.max(fx.flash, 0.9 * Math.exp(-since * 24) * (since >= 0 ? 1 : 0));
    if (flashIn) fx.hit = Math.max(fx.hit, Math.exp(-since * 6) * (since >= 0 ? 1 : 0)); // then glows down
    const sweep = shot.transitionIn === 'wipe' && since >= 0 && since < 0.35 ? since / 0.35 : -1;

    const cur = await this.plateTexture(shot, t);
    // dissolving a plate into itself at another camera position shows a double image: skip it for the same asset
    const dissolve = prev && shot.transitionIn === 'dissolve' && prev.asset !== shot.asset ? clamp01(since / 0.4) : 1;
    if (prev && dissolve < 1) {
      const p0 = await this.plateTexture(prev, t);
      this.placePlate(this.plates[0], p0.tex, prev, t, 1, p0.next, p0.mix);
      this.placePlate(this.plates[1], cur.tex, shot, t, dissolve, cur.next, cur.mix);
    } else {
      // slowed clips blend toward the next frame instead of stepping
      this.placePlate(this.plates[0], cur.tex, shot, t, 1, cur.next, cur.mix);
      this.plates[1].mesh.material.uniforms['opacity'].value = 0;
    }
    const mfx = fxAt(t, this.job.treatment.moments ?? [], this.job.treatment.arc ?? []);
    this.updateMotes(t + mfx.moteTime, fx.hit, mfx);
    const dimTarget = (shot.params['dim'] as number) ?? 0.3;
    const dimPrev = prev ? ((prev.params['dim'] as number) ?? 0.3) : dimTarget;
    // a hold (溜め) darkens the background only: the dim layer sits under the motes (starlight stays) and the text
    this.dim.material.opacity = Math.max(dimPrev + (dimTarget - dimPrev) * easeOutCubic(since / 0.4), mfx.black);

    for (const [id, layer] of this.shotLayers) {
      const s = this.job.treatment.shots.find((x) => x.id === id)!;
      // an empty frame during an instrumental reads as a mistake: only draw it around text
      const lines = this.cueLayers.filter((c) => c.rt.shot.id === id);
      const busy = RENDERERS[s.template]?.standalone || lines.some(({ rt }) => t >= rt.showFrom - 0.5 && t <= rt.exitAt + rt.exitDur + 0.3);
      layer.group.visible = t >= s.start && t < s.end && busy;
      if (layer.group.visible) layer.update(t, fx);
    }
    for (const { rt, layer } of this.cueLayers) {
      layer.group.visible = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05;
      if (layer.group.visible) layer.update(t, fx);
    }
    const shake = Math.max(fx.shake, mfx.shake) * 10;
    this.camera.position.set((hash(t * 30) - 0.5) * shake, (hash(t * 30, 1) - 0.5) * shake, 5);
    this.camera.zoom = mfx.zoom;
    this.camera.updateProjectionMatrix();
    const u = this.finalPass.uniforms;
    const d = this.job.treatment.design ?? DEFAULT_DESIGN;
    const stop = colorAt(d.colorScript, t);
    // the drop's peak style (one per song): rays / diagonal beams / black vacuum then burst / motif rings
    const peak = d.peak === 'burst' && !this.motif ? 'rays' : d.peak;
    const beams = peak === 'beams' ? mfx.rays : 0;
    for (const p of this.plates) {
      // image < 1 sinks the picture toward a dark ground so graphics and type carry the section
      p.mesh.material.uniforms['exposure'].value = mfx.exposure * (0.12 + 0.88 * stop.image);
      p.mesh.material.uniforms['sat'].value = mfx.saturation * (1 - 0.65 * beams);
    }
    if (peak === 'vacuum') {
      const drop = (this.job.treatment.moments ?? []).find((m) => (m.kind === 'drop' || m.kind === 'finale') && t >= m.at - 0.35 && t < m.at);
      if (drop) this.dim.material.opacity = Math.max(this.dim.material.opacity, 0.96);
    }
    u['uVignette'].value = mfx.vignette;
    u['uRays'].value = peak === 'rays' || peak === 'vacuum' ? mfx.rays * (peak === 'vacuum' ? 0.5 : 1) : 0;
    u['uBeams'].value = beams;
    u['uShockR'].value = mfx.shockR;
    u['uShock'].value = mfx.shock;
    (u['uRayColor'].value as THREE.Color).set(this.paletteAt(t).glow).lerp(new THREE.Color(1, 1, 1), 0.45);
    for (const p of this.plates) {
      const pu = p.mesh.material.uniforms;
      (pu['shadowC'].value as THREE.Color).set(stop.shadow);
      (pu['highlightC'].value as THREE.Color).set(stop.highlight);
      pu['duo'].value = Math.max(stop.duotone, 1 - stop.image);
    }
    if (this.motif) {
      const pal = this.paletteAt(t);
      // a 'wipe' into a shot opens through the motif's shape
      const iris = shot.transitionIn === 'wipe' && since >= 0 && since < 0.6 ? since / 0.6 : -1;
      this.motif.update(t, Math.max(mfx.rays, mfx.moteBurst) * 0.8, new THREE.Color(pal.line), new THREE.Color(pal.accent), peak === 'burst' ? mfx.rays : 0, iris);
    }
    u['uGrain'].value = 0.02 + 0.1 * d.grain;
    u['uPaper'].value = d.paper;
    this.finalPass.uniforms['uTime'].value = Math.floor(t * this.job.fps) / this.job.fps;
    this.finalPass.uniforms['uFlash'].value = fx.flash;
    this.finalPass.uniforms['uHit'].value = fx.hit;
    // capped: past this, white lyrics bloom into an unreadable glare
    this.bloom.strength = Math.min(1.2, 0.55 + 0.9 * fx.hit + mfx.bloom);
    this.finalPass.uniforms['uSweep'].value = this.motif ? -1 : sweep;
    this.composer.render();
  }

  /** Drifting light motes (deterministic in t): keep every shot alive even on a still plate. */
  private updateMotes(t: number, hit: number, m: MomentFx) {
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const sp = 18 + hash(i, 3) * 50;
      const y = ((hash(i, 1) * (H + 200) + t * sp) % (H + 200)) - H / 2 - 100;
      const x = (hash(i, 2) - 0.5) * W + Math.sin(t * 0.4 + i) * 30;
      // after a drop the motes are blown outward from the horizon, then drift back
      const ox = x;
      const oy = y + H * 0.16;
      const push = 1 + 1.2 * m.moteBurst;
      pos.setXYZ(i, ox * push, oy * push - H * 0.16, 0);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).color.set(this.paletteAt(t).glow);
    (this.motes.material as THREE.PointsMaterial).opacity = Math.min(1, (0.45 + 0.4 * hit) * (0.75 + 0.15 * m.level) + 0.3 * m.moteBurst);
  }

  /** When a shot is clear of lyrics: after the last line that overlaps it has left the screen (+0.4 s). */
  private clearOfLines(shot: Shot): number {
    let t = shot.start;
    for (const c of this.job.cues) if (c.start < shot.end && c.end + EXIT_SEC > shot.start) t = Math.max(t, c.end + EXIT_SEC + 0.4);
    return Math.min(t, shot.end - 1);
  }

  /** The palette with this section's accent (the colour script's one accent drives key words, lines and glows). */
  private paletteAt(t: number): Palette {
    const base = this.job.treatment.styleAnchor.palette;
    if (!this.job.treatment.design) return base;
    const stop = colorAt(this.job.treatment.design.colorScript, t);
    return { ...base, accent: stop.accent, glow: stop.accent, line: stop.highlight };
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
