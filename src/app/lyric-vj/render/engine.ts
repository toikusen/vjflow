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
import { beatCut } from './beat-cut';
import { handwrite } from './handwrite';
import { titleCard } from './title-card';
import { punch } from './punch';
import { fxAt, MomentFx, quietSpans } from '../moments';
import { quiet, quietFace } from './quiet';
import { hookRanges, titleHook } from '../compose';
import { stair } from './stair';
import { keywordRange } from './punch';
import { makeGlyphs, placeRow, advanceOf, Glyph, setGhost, setHalo, setInkGhost, setPieces, syncPieces } from './glyphs';
import { colorAt, DEFAULT_DESIGN, uses } from '../design';
import { SYSTEMS } from '../systems';
import { LANGUAGES } from '../languages';
import { MEDIA, stepTime } from '../medium';
import { MotifLayer } from './motif-layer';
import { CustomScene } from './custom-scene';
import { avoidAll, blendLayer, drawLook, drawNative, Layer, Rect, sectionAt } from './graphics';
import type { Palette } from '../treatment';
import { DEFAULT_FONTS, FontChoice, nearestWeight, readingLatin, resolveFonts } from '../fonts';
import { scatter } from './scatter';
import { typewriter } from './typewriter';
import { vertical } from './vertical';
import { CueLayer, CueRuntime, EXIT_SEC, FrameFx, LEAD, ShotLayer, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
/**
 * Lyrics always inside the frame: the layer is laid out at its settled moment and, if any glyph would cross the
 * safe area (48 px side / 40 px top-bottom margin), scaled down about the centre inside a wrapper group.
 */
/** The layer's settled bounds in frame px (origin at the centre), with the layer laid out at its readable moment. */
function settledBox(layer: CueLayer, parent?: THREE.Object3D): THREE.Box3 {
  const [from, to] = layer.readable();
  const vis = layer.group.visible;
  layer.group.visible = true;
  layer.update(Number.isFinite(to) ? (from + to) / 2 : from + 0.5, { flash: 0, hit: 0, shake: 0 });
  layer.group.visible = vis;
  (parent ?? layer.group).updateMatrixWorld(true);
  // only what is showing at that moment (beat-cut keeps its other pieces hidden)
  const box = new THREE.Box3();
  const shown = (o: THREE.Object3D): boolean => o === layer.group || (o.visible && (!o.parent || shown(o.parent)));
  layer.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.parent && shown(o.parent) && o.visible) box.expandByObject(o);
  });
  return box;
}

function fitToFrame(layer: CueLayer): THREE.Group {
  const fit = new THREE.Group();
  fit.add(layer.group);
  const box = settledBox(layer, fit);
  if (box.isEmpty()) return fit;
  const sx = (W / 2 - 48) / Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  const sy = (H / 2 - 40) / Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
  fit.scale.setScalar(Math.min(1, sx, sy));
  return fit;
}

/** How long a drop's keyword flash holds before the line takes over (a few frames). */
const FLASH_SEC = 0.16;
const HOLD_SEC = 1.2;
const KANA_TEMPLATES = new Set(['punch', 'beat-cut', 'scatter', 'title-card']);
const RENDERERS: Record<string, TemplateRenderer> = { punch, 'frame-split': frameSplit, typewriter, vertical, scatter, handwrite, 'title-card': titleCard, 'beat-cut': beatCut, quiet, stair };

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
  /** Kick strength per beat (song.beatStrength). */
  beatStrength?: number[];
  /** Song tempo (BPM): slow songs get breathing timing. */
  tempo?: number;
  cues: TimelineCue[];
  treatment: TreatmentV3;
  assets: Record<string, AssetSource>;
  /** The user's font choice; overrides the treatment's. */
  fonts?: FontChoice;
  /** Song identity for title cards; `logo` is an image URL (the group logo upload, later). */
  meta?: { title: string; artist: string; logo?: string };
  /** One layer only, for compositing in VJ software: 'text' = lyrics on transparency, 'back' = everything else. */
  layer?: 'text' | 'back';
}

export interface CueMetric {
  id: string;
  text: string;
  readableFrom: number;
  readableTo: number;
  readableSec: number;
  requiredSec: number;
  ok: boolean;
  /** Seconds the line stays up after its last sung character (a long one sits over an instrumental). */
  lingerSec: number;
}

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uHit: { value: 0 }, uSweep: { value: -1 }, uAberration: { value: 0.0012 }, uGrain: { value: 0.05 }, uPaper: { value: 0 }, uBeams: { value: 0 },
    // section moments (moments.ts)
    uVignette: { value: 0 }, uRays: { value: 0 }, uShockR: { value: -1 }, uShock: { value: 0 },
    uRayColor: { value: new THREE.Color(1, 1, 1) },
    // medium (medium.ts)
    uBoil: { value: 0 }, uBoilSeed: { value: 0 }, uWeave: { value: new THREE.Vector2() }, uFlicker: { value: 1 }, uTooth: { value: 0 },
    uPixel: { value: 0 }, uLift: { value: 0 }, tText: { value: null }, uHasText: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFlash, uHit, uSweep, uAberration, uGrain, uPaper, uBeams;
    uniform float uVignette, uRays, uShockR, uShock; uniform vec3 uRayColor; varying vec2 vUv;
    uniform float uBoil, uBoilSeed, uFlicker, uTooth, uPixel, uLift, uHasText; uniform sampler2D tText; uniform vec2 uWeave;
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
    void main(){
      vec2 uv = vUv + uWeave;                       // gate weave / stop-motion jitter
      if (uBoil > 0.0) {                            // line boil: coherent ~40 px wobble, redrawn a few times a second
        vec2 n = vUv * RES / 40.0 + uBoilSeed * 7.31;
        uv += (vec2(vnoise(n), vnoise(n + 17.3)) - 0.5) * 2.0 * uBoil / RES;
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
      float a = uAberration * (3.0 * uFlash + uShock); // only on hits, faint on the shockwave: a strong split doubled the drop's type into ghosts
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
      vec2 px = vUv * RES;
      float lum = dot(c, LUMA);
      // lyrics (a text-only render, tText) stay crisp under pixel dither and paper tooth
      float keep = uHasText > 0.0 ? smoothstep(0.05, 0.5, texture2D(tText, uvText).a) : 0.0;
      if (uLift > 0.0) {                            // the paper shows through the darks: a warm, fibrous ground
        float fib = h1(floor(px.x / 3.0) * 7.0 + floor(px.y * 0.7)) * 0.5 + vnoise(px / 90.0) * 0.5;
        c += vec3(0.91, 0.86, 0.77) * uLift * (0.6 + 0.8 * fib) * (1.0 - lum);
      }
      if (uTooth > 0.0) {                           // paper tooth: paint skips the grooves of rough paper
        float tn = vnoise(px / 2.5) * 0.6 + h2(floor(px / 2.0)) * 0.4;
        c *= 1.0 - uTooth * 0.55 * smoothstep(0.62, 0.8, tn) * smoothstep(0.1, 0.6, lum) * (1.0 - 0.8 * keep);
      }
      if (uPixel > 0.0) c = mix(c, floor(c * 4.0 + bayer4(floor(uv * PIX))) / 4.0, uPixel);
      if (uPixel > 0.0) c = mix(c, texture2D(tDiffuse, uvText).rgb * (1.0 + 0.45 * uHit), keep * uPixel);
      c *= uFlicker;
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
      shadowC: { value: new THREE.Color(0, 0, 0) }, highlightC: { value: new THREE.Color(1, 1, 1) }, duo: { value: 0 }, soft: { value: 0.0018 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // exposure/saturation from the emotional arc grade the background only, so lyrics never go grey
    // the song's duotone turns any plate into a designed two-colour image (the main AI-look tell is full colour)
    fragmentShader: `uniform sampler2D map; uniform sampler2D map2; uniform float mixAmt, opacity, exposure, sat, duo, soft; uniform vec3 shadowC, highlightC; varying vec2 vUv;
      vec3 px(vec2 uv) { return mix(texture2D(map, uv).rgb, texture2D(map2, uv).rgb, mixAmt); }
      void main() {
        // the plate is softened (a 9-tap ring blur): generated pictures give themselves away in crisp, busy detail,
        // and a designer keeps the background a supporting layer behind the type
        vec3 c = px(vUv) * 0.2;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7854;
          c += px(vUv + vec2(cos(a), sin(a) * 1.7778) * soft) * 0.1;
        }
        c *= exposure;
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
  /** Lyrics (and their echoes), rendered after the bloom pass. */
  private textScene = new THREE.Scene();
  private probe?: CanvasRenderingContext2D;
  /** Each line's on-screen rectangle and when it is up (graphic objects move out of its way). */
  private lyricRects: { from: number; to: number; rect: Rect }[] = [];
  private ghostA?: THREE.WebGLRenderTarget;
  private ghostB?: THREE.WebGLRenderTarget;
  private ghostPass?: ShaderPass;
  private camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
  private composer: EffectComposer;
  private finalPass: ShaderPass;
  private bloom: UnrealBloomPass;
  private motes: THREE.Points;
  private plates: Plate[] = [];
  private customScenes: CustomScene[] = [];
  private sceneTarget?: THREE.WebGLRenderTarget;
  /** The graphic look's canvas, drawn every frame and shown as the background layer. */
  private gfx?: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh };
  private dim: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Letterbox bars, closed over quiet spans (the cinema-scope narrowing from the technique library). */
  private bars: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private quiet: { start: number; end: number }[] = [];
  /** Keyword flashes on the drops: full-width for a few frames, then the line takes over. */
  /** Outlined echoes of chorus keywords behind the lines (the library's readable layer + huge echo layer). */
  private echoes: { rt: CueRuntime; group: THREE.Group; glyphs: Glyph[] }[] = [];
  private echoRoot = new THREE.Group();
  private flashes: { at: number; glyphs: Glyph[]; group: THREE.Group; cueId: string }[] = [];
  private textRoot = new THREE.Group();
  private shotLayers = new Map<string, ShotLayer>();
  private cueLayers: { rt: CueRuntime; layer: CueLayer }[] = [];
  private images = new Map<string, THREE.Texture>();
  private frameCache = new Map<string, THREE.Texture>();
  private gradient: THREE.Texture;

  constructor(canvas: HTMLCanvasElement, private job: RenderJob) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: job.layer === 'text' });
    this.renderer.setPixelRatio(1);
    this.renderer.localClippingEnabled = true; // handwrite reveals glyphs with clip planes
    this.renderer.setSize(W, H, false);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    // chroma ghosts of the lyrics (languages with `chroma`), composited before the crisp lyrics
    if (job.treatment.design?.language && LANGUAGES[job.treatment.design.language].chroma) {
      this.ghostA = new THREE.WebGLRenderTarget(W, H);
      this.ghostB = new THREE.WebGLRenderTarget(W, H);
      this.ghostPass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, tA: { value: this.ghostA.texture }, tB: { value: this.ghostB.texture }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse, tA, tB; uniform vec3 uColA, uColB; varying vec2 vUv;
          void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            c.rgb = mix(c.rgb, uColB, texture2D(tB, vUv).a * 0.45);
            c.rgb = mix(c.rgb, uColA, texture2D(tA, vUv).a * 0.55);
            gl_FragColor = c;
          }`,
      });
      // ShaderPass clones its uniforms (a cloned texture is no longer the render target's): point them back
      this.ghostPass.uniforms['tA'].value = this.ghostA.texture;
      this.ghostPass.uniforms['tB'].value = this.ghostB.texture;
      this.composer.addPass(this.ghostPass);
    }
    // lyrics are drawn after the bloom: bloomed white type smeared into an unreadable glow
    const textPass = new RenderPass(this.textScene, this.camera);
    textPass.clear = false;
    this.composer.addPass(textPass);
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
    if (this.job.treatment.graphics) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      mesh.renderOrder = -1; // first: the plates are hidden, everything else (dim, motif, lyrics) draws over it
      this.scene.add(mesh);
      this.gfx = { ctx: c.getContext('2d')!, tex, mesh };
    }
    this.echoRoot.renderOrder = 2.65; // above the dim layer and motes, under the motif and lyrics
    this.textScene.add(this.echoRoot);
    this.bars = [1, -1].map((side) => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, H * 0.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false })); // transparent: drawn in the same pass as the plates, so renderOrder holds
      bar.renderOrder = 2.6;
      bar.userData['side'] = side;
      this.scene.add(bar);
      return bar;
    });
    this.scene.add(this.motes);
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, H * 1.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false }));
    this.dim.renderOrder = 2;
    this.scene.add(this.dim);
    this.textRoot.renderOrder = 3;
    this.textScene.add(this.textRoot);
    this.gradient = this.makeGradient();
  }

  async init() {
    const { treatment, cues } = this.job;
    const design = treatment.design ?? DEFAULT_DESIGN;
    const fonts = (this.fonts = resolveFonts({ ...this.job.fonts, family: this.job.fonts?.family ?? design.font }));
    setKanaScale(design.kanaScale);
    this.accentFont = design.accentFont;
    await document.fonts.load(`400 100px "${design.accentFont}"`, 'Aa');
    const latin = readingLatin(design.accentFont);
    await Promise.all([700, 900].map((w) => document.fonts.load(`${nearestWeight(latin, w)} 100px "${latin}"`, 'Aa')));
    const text = cues.map((c) => c.text).join('');
    const faces = [[fonts.display, 400], [fonts.body, 900], [fonts.body, 700], [fonts.script, 400], [quietFace(fonts.display), 500]] as const;
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
    if (treatment.motif && (!design.system || SYSTEMS[design.system].motif) && (!design.language || LANGUAGES[design.language].motif)) {
      this.motif = new MotifLayer(treatment.motif, this.job.beats, { display: this.fonts.display, accent: this.accentFont });
      this.motif.group.renderOrder = 2.7; // above the background and motes, under the lyrics
      this.scene.add(this.motif.group);
    }
    for (const spec of treatment.scenes ?? []) {
      const stop = colorAt(design.colorScript, spec.start + 0.5);
      this.customScenes.push(new CustomScene(spec, { W, H, start: spec.start, end: spec.end, palette: { shadow: stop.shadow, highlight: stop.highlight, accent: stop.accent }, beats: this.job.beats, beatStrength: this.job.beatStrength ?? [], hash }));
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
    const sorted = treatment.cues
      .map((style) => ({ style, cue: cues.find((c) => c.id === style.cueId)! }))
      .filter((x) => x.cue)
      .sort((a, b) => a.cue.start - b.cue.start);
    // a line sung again straight away (いつまでも ×3) stays up as one line that pulses on each repeat: three cuts in
    // three seconds could not be read
    const norm = (x: string) => x.replace(/[\s、。,.!?！？「」]/g, '');
    const repeats = new Map<string, number[]>();
    const styled: typeof sorted = [];
    for (const x of sorted) {
      const prev = styled[styled.length - 1];
      if (prev && norm(prev.cue.text) === norm(x.cue.text) && x.cue.start - prev.cue.end < 0.6) {
        prev.cue = { ...prev.cue, end: x.cue.end };
        repeats.set(prev.cue.id, [...(repeats.get(prev.cue.id) ?? []), x.cue.start]);
      } else styled.push({ ...x });
    }
    // two lines sung back to back faster than either can be read are set together as one two-row line: the first
    // stays up while the second is sung (word reveal follows the voice across both)
    const quick = (c: TimelineCue) => c.end - c.start < [...c.text.replace(/\s/g, '')].length / 12 + 1;
    for (let i = 0; i + 1 < styled.length; i++) {
      const a = styled[i].cue;
      const b = styled[i + 1].cue;
      const chars = [...a.text.replace(/\s/g, '')].length + [...b.text.replace(/\s/g, '')].length;
      if (!quick(a) || !quick(b) || b.start - a.end > 0.35 || chars > 26 || repeats.has(a.id) || repeats.has(b.id)) continue;
      const aLen = [...a.text].length;
      styled[i] = {
        style: { ...styled[i].style, rows: [aLen + 1], reveal: 'word' },
        cue: { ...a, text: `${a.text} ${b.text}`, end: b.end, charStarts: a.charStarts && b.charStarts ? [...a.charStarts, a.end, ...b.charStarts] : undefined, charTimed: !!(a.charTimed && b.charTimed) },
      };
      styled.splice(i + 1, 1);
    }
    // slow songs show each line a little before the voice (breathing timing); fast songs stay on the beat
    const lead = this.job.tempo !== undefined && this.job.tempo < 95 ? 0.35 : LEAD;
    // a line shows ahead of its voice, but never while the previous line's last word is still being sung
    const lastSung = styled.map(({ cue }) => (cue.charTimed && cue.charStarts?.length ? cue.charStarts[cue.charStarts.length - 1] : -Infinity));
    const showAt = styled.map(({ cue }, i) => Math.max(cue.start - lead, Math.min(cue.start, (lastSung[i - 1] ?? -Infinity) + 0.3)));
    // the title as sung gets one fixed treatment every time it appears (accent colour), like a logotype
    // strokes only when the director picked them (older treatments without techniques keep whole glyphs)
    setPieces(!!design.techniques?.includes('pieces'));
    const langGhost: [number, number] = design.language ? (LANGUAGES[design.language].text?.ghost ?? [0, 0]) : [0, 0];
    setGhost(langGhost);
    const hook = uses(design, 'title-hook') ? titleHook(this.job.meta?.title ?? '') : '';
    styled.forEach(({ style: style0, cue }, i) => {
      const hooks = hookRanges(cue.text, hook).map(([from, to]) => ({ from, to, method: 'color' as const }));
      const style = hooks.length ? { ...style0, emphasis: [...hooks, ...(style0.emphasis ?? [])] } : style0;
      const shot = treatment.shots.find((s) => s.id === style.shot)!;
      const next = styled[i + 1]?.cue;
      const nextShow = next ? showAt[i + 1] : Infinity;
      const len = cue.end - cue.start;
      const pace = Math.min(1, Math.max(0.35, len / 2)); // short lines enter and leave faster so they stay readable
      // a rushed line leaves in a blink: its exit animation would eat the little time it has
      const rushedLine = len < [...cue.text.replace(/\s/g, '')].length / 12 + 1;
      const exitSec = rushedLine ? 0.08 : EXIT_SEC * pace;
      // breathing: a line holds up to 1.2 s past its last syllable when nothing follows straight away
      const exitAt = Math.min(cue.end + HOLD_SEC, nextShow - exitSec - 0.02);
      const inBeats = beatsDuring(this.job.beats, cue.start, cue.end);

      // a line sung faster than it can be read appears whole: word reveals and staggered pieces would eat its time
      const rushed = cue.end - cue.start < [...cue.text.replace(/\s/g, '')].length / 12 + 1;
      const rt: CueRuntime = {
        cue, style: rushed && style.reveal === 'word' ? { ...style, reveal: 'line' as const } : style, shot, params: shot.params, palette: this.paletteAt(cue.start + 0.3), // a colour stop set on the drop beat can sit a few ms after the line's start
        // an English line is set in the paired Latin face
        fonts: isLatinLine(cue.text) ? { display: readingLatin(this.accentFont), body: readingLatin(this.accentFont), script: readingLatin(this.accentFont) } : this.fonts,
        showFrom: showAt[i],
        exitAt: Math.max(cue.start + 0.25 * pace, exitAt),
        exitDur: Math.max(0.08, Math.min(exitSec, nextShow - Math.max(cue.start + 0.25 * pace, exitAt) - 0.02)),
        accentTimes: [...(style.accents ?? []).map((k) => inBeats[k]).filter((b) => b !== undefined), ...(repeats.get(cue.id) ?? [])].sort((a, b) => a - b),
        pace,
        rushed,
      };
      // small kana only on the impact templates: on every line it read as an algorithm
      setKanaScale(KANA_TEMPLATES.has(shot.template) ? design.kanaScale : 1);
      // dark type on a light field gets a halo of that field's colour: it then reads over a photo inset as well
      // with a graphic look the lyric colour comes from what is actually behind the lyrics: the line is laid out once
      // to find where it sits, the look is measured there, and the line is built again in a colour that reads
      let backdrop: string | undefined;
      let mixed = false;
      if (this.job.treatment.graphics) {
        setHalo('rgba(0,0,0,0)');
        const probe = RENDERERS[shot.template].cue(rt);
        const box = settledBox(probe);
        const measured = this.backdropAt(cue.start + Math.min(1, (cue.end - cue.start) / 2), box.isEmpty() ? undefined : box);
        backdrop = measured?.mean;
        mixed = measured?.mixed ?? false;
        rt.palette = this.cuePalette(cue.start + 0.3, backdrop);
      }
      setHalo(backdrop && luma(backdrop) > 0.5 ? hexToRgba(backdrop, 0.95) : 'rgba(0,0,0,0.85)');
      // the dark offset copy goes under light type; dark type gets the offset as a coloured second ink instead (a dark
      // shadow under dark heavy type merged the strokes into one blob)
      const darkType = luma(rt.palette.text) <= 0.5;
      setGhost(darkType ? [0, 0] : langGhost);
      setInkGhost(darkType && (langGhost[0] || langGhost[1]) ? { dx: langGhost[0] * 1.4, dy: langGhost[1] * 1.4, color: new THREE.Color(rt.palette.accent).lerp(new THREE.Color(1, 1, 1), 0.25) } : null);
      const layer = RENDERERS[shot.template].cue(rt);
      setInkGhost(null);
      // a line can straddle light and dark (a photo inset under part of it): each glyph over the opposite tone flips
      // to the other ink, like type knocked out where it crosses a picture
      if (mixed) this.knockout(layer, cue.start + Math.min(1, (cue.end - cue.start) / 2), rt.palette.text);
      layer.group.visible = false;
      const fit = fitToFrame(layer);
      this.textRoot.add(fit);
      this.cueLayers.push({ rt, layer });
      if (this.job.treatment.graphics) {
        // where the line sits on screen, so background objects can make room for it
        const b = settledBox(layer, fit);
        if (!b.isEmpty()) this.lyricRects.push({ from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y } });
      }
      if (shot.params['echo'] && !this.ownDrawing(cue.start)) {
        const echo = this.makeEcho(rt);
        if (echo) this.echoes.push(echo);
      }
    });
    setKanaScale(design.kanaScale);
    this.quiet = uses(design, 'quiet') ? quietSpans(treatment.moments ?? []) : [];
    // the drop keyword flash: one per drop/finale (2–4 a song), the line's keyword set full width in the display face
    for (const m of (treatment.moments ?? []).filter((x) => uses(design, 'flash') && (x.kind === 'drop' || x.kind === 'finale'))) {
      const hit = styled.find(({ cue }) => cue.start >= m.at - 0.4 && cue.start <= m.at + 0.6);
      if (!hit) continue;
      const [k0, k1] = keywordRange(hit.cue.text, hit);
      const word = [...hit.cue.text].slice(k0, k1).join('').replace(/\s+/g, '');
      const probe = { family: fonts.display, weight: 900, size: 200 };
      const w200 = [...word].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
      const glyphs = makeGlyphs(word, { family: fonts.display, weight: 900, size: Math.round(Math.min(700, (200 * 0.9 * W) / w200)) }, new THREE.Color(1, 1, 1));
      placeRow(glyphs, 0, 20);
      const group = new THREE.Group();
      glyphs.forEach((g) => {
        g.mesh.position.set(g.x, g.y, 0);
        group.add(g.mesh);
      });
      group.visible = false;
      this.textRoot.add(group);
      this.flashes.push({ at: m.at, glyphs, group, cueId: hit.cue.id });
    }
  }

  metrics(): { cues: CueMetric[]; accents: { cueId: string; time: number }[] } {
    return {
      cues: this.cueLayers.map(({ rt, layer }) => {
        const [from, to] = layer.readable();
        const readableSec = Math.max(0, to - from);
        // reading time: chars / 12 + 1 s (lemo-opuscar's readcheck), but never more than 90 % of the time the line is sung
        const chars = [...rt.cue.text.replace(/\s/g, '')].length;
        const requiredSec = Math.min(chars / 12 + 1, 0.9 * (rt.cue.end - rt.cue.start + 0.4));
        const last = rt.cue.charStarts?.length ? rt.cue.charStarts[rt.cue.charStarts.length - 1] : rt.cue.end;
        const lingerSec = +(rt.exitAt + rt.exitDur - last).toFixed(2);
        return { id: rt.cue.id, text: rt.cue.text, readableFrom: from, readableTo: to, readableSec, requiredSec, ok: readableSec >= requiredSec, lingerSec };
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

  /** Whether the section at t has the director's own drawing (a 'code' layer), which owns the background. */
  private ownDrawing(t: number) {
    const g = this.job.treatment.graphics;
    return !!g && sectionAt(g, t).layers.some((l) => l.kind === 'code');
  }

  /** The cue's keyword as large outlined type behind the line, within the frame. */
  private makeEcho(rt: CueRuntime) {
    const [k0, k1] = keywordRange(rt.cue.text, rt);
    const word = [...rt.cue.text].slice(k0, k1).join('').replace(/\s+/g, '');
    // a long phrase echoed at near text size reads as a doubled line, not a deeper layer
    if ([...word].length > 5) return undefined;
    const probe = { family: rt.fonts.display, weight: 900, size: 200 };
    const w200 = [...word].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
    const size = Math.round(Math.min(620, (200 * 0.95 * W) / w200));
    const glyphs = makeGlyphs(word, { family: rt.fonts.display, weight: 900, size, outline: 3 }, new THREE.Color(rt.palette.text));
    placeRow(glyphs, 0, 30);
    const group = new THREE.Group();
    group.renderOrder = 2.65; // a nested group resets three.js's group order
    for (const g of glyphs) {
      g.mesh.position.set(g.x, g.y, 0);
      group.add(g.mesh);
    }
    group.visible = false;
    this.echoRoot.add(group);
    return { rt, group, glyphs };
  }

  /** Shows the lines up at t and moves them; strokes follow their glyphs. */
  private updateCues(t: number, fx: FrameFx, hidden?: string) {
    for (const { rt, layer } of this.cueLayers) {
      layer.group.visible = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05 && rt.cue.id !== hidden;
      if (layer.group.visible) layer.update(this.koma(t), fx);
    }
    syncPieces(this.textRoot);
  }

  /** Motion time held to the design language's drawings per second (koma); cuts and visibility stay on real time. */
  private koma(t: number): number {
    const k = this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language].koma;
    return k ? Math.floor(t * k + 1e-6) / k : t;
  }

  /** Draws a custom scene into its render target; the target's texture then stands in for the plate. */
  private renderCustom(scene: CustomScene, t: number): THREE.Texture {
    this.sceneTarget ??= new THREE.WebGLRenderTarget(W, H);
    scene.update(t);
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(scene.scene, scene.camera);
    this.renderer.setRenderTarget(null);
    return this.sceneTarget.texture;
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
    // a custom scene is already composed for the frame: no camera move, no softening
    const isScene = tex === this.sceneTarget?.texture;
    if (isScene) [s, x, y] = [1, 0, 0];
    u['soft'].value = isScene ? 0 : 0.0018;
    u['map'].value = tex;
    u['map2'].value = next ?? tex;
    u['mixAmt'].value = next ? mix : 0;
    u['opacity'].value = opacity;
    p.mesh.scale.set(img.width * cover * s, img.height * cover * s, 1);
    p.mesh.position.set(x, y, 0);
  }

  async renderAt(t: number) {
    const { shot, prev } = this.shotAt(t);
    const medium = MEDIA[(this.job.treatment.design ?? DEFAULT_DESIGN).medium ?? 'clean'];
    // background motion is held to the medium's frame rate (on twos); cuts and lyrics stay on every frame
    const bt = stepTime(t, medium.step);
    const fx: FrameFx = { flash: 0, hit: 0, shake: 0 };
    const since = t - shot.start;
    // a flash is a few frames of white: a slower decay reads as grey fog over a dark plate
    // a drop/finale on this cut already is the impact: stacking the white flash on it is too much
    const momentHere = (this.job.treatment.moments ?? []).some((m) => (m.kind === 'drop' || m.kind === 'finale') && Math.abs(m.at - shot.start) < 0.3);
    const flashIn = shot.transitionIn === 'flash' && !momentHere;
    if (flashIn) fx.flash = Math.max(fx.flash, 0.9 * Math.exp(-since * 24) * (since >= 0 ? 1 : 0));
    if (flashIn) fx.hit = Math.max(fx.hit, Math.exp(-since * 6) * (since >= 0 ? 1 : 0)); // then glows down
    const sweep = shot.transitionIn === 'wipe' && since >= 0 && since < 0.35 ? since / 0.35 : -1;

    const custom = this.customScenes.find((s) => s.covers(t));
    const cur = custom ? { tex: this.renderCustom(custom, bt), mix: 0 } : await this.plateTexture(shot, bt);
    // dissolving a plate into itself at another camera position shows a double image: skip it for the same asset
    const dissolve = prev && shot.transitionIn === 'dissolve' && prev.asset !== shot.asset ? clamp01(since / 0.4) : 1;
    if (prev && dissolve < 1) {
      const p0 = await this.plateTexture(prev, bt);
      this.placePlate(this.plates[0], p0.tex, prev, bt, 1, p0.next, p0.mix);
      this.placePlate(this.plates[1], cur.tex, shot, bt, dissolve, cur.next, cur.mix);
    } else {
      // slowed clips blend toward the next frame instead of stepping
      this.placePlate(this.plates[0], cur.tex, shot, bt, 1, cur.next, cur.mix);
      this.plates[1].mesh.material.uniforms['opacity'].value = 0;
    }
    const mfx = fxAt(t, this.job.treatment.moments ?? [], this.job.treatment.arc ?? []);
    this.updateMotes(bt + mfx.moteTime, fx.hit, mfx);
    if (this.gfx) {
      const beats = this.job.beats;
      let i = beats.findIndex((b) => b > bt) - 1;
      if (i < -1) i = beats.length - 1;
      const since = i >= 0 ? bt - beats[i] : 10;
      drawLook(this.gfx.ctx, this.job.treatment.graphics!, this.koma(bt), { since, pulse: Math.exp(-since * 7), index: i }, (asset) => {
        const tex = this.images.get(asset ?? shot.asset ?? '');
        return tex?.image as CanvasImageSource | undefined;
      }, (ls) => this.makeRoom(ls, bt));
      const lang = this.job.treatment.design?.language;
      const drop = [...(this.job.treatment.moments ?? [])].reverse().find((m) => (m.kind === 'drop' || m.kind === 'finale') && bt >= m.at);
      // a song's own code layer brings its own peaks; the language's stock move on top of it read as clutter
      if (lang && drop && !this.ownDrawing(bt)) drawNative(this.gfx.ctx, lang, bt - drop.at, sectionAt(this.job.treatment.graphics!, bt), { since, pulse: Math.exp(-since * 7), index: i });
      this.gfx.tex.needsUpdate = true;
      // the look is the whole background: no full-bleed plates, no generic light motes
      for (const p of this.plates) p.mesh.material.uniforms['opacity'].value = 0;
      this.motes.visible = false;
    }
    const dimTarget = (shot.params['dim'] as number) ?? 0.3;
    const dimPrev = prev ? ((prev.params['dim'] as number) ?? 0.3) : dimTarget;
    // a hold (溜め) darkens the background only: the dim layer sits under the motes (starlight stays) and the text
    this.dim.material.opacity = Math.max(dimPrev + (dimTarget - dimPrev) * easeOutCubic(since / 0.4), mfx.black);
    if (this.job.treatment.graphics) this.dim.material.opacity = mfx.black; // the look sets its own contrast

    for (const [id, layer] of this.shotLayers) {
      const s = this.job.treatment.shots.find((x) => x.id === id)!;
      // an empty frame during an instrumental reads as a mistake: only draw it around text
      const lines = this.cueLayers.filter((c) => c.rt.shot.id === id);
      const busy = RENDERERS[s.template]?.standalone || lines.some(({ rt }) => t >= rt.showFrom - 0.5 && t <= rt.exitAt + rt.exitDur + 0.3);
      layer.group.visible = t >= s.start && t < s.end && busy;
      if (layer.group.visible) layer.update(this.koma(t), fx);
    }
    for (const e of this.echoes) {
      const on = t >= e.rt.showFrom && t <= e.rt.exitAt + e.rt.exitDur;
      e.group.visible = on;
      if (!on) continue;
      const a = clamp01((t - e.rt.showFrom) / 0.6) * (1 - clamp01((t - e.rt.exitAt) / Math.max(0.1, e.rt.exitDur)));
      // slow drift at a fraction of the text's speed: reads as a deeper layer
      e.group.position.set(-30 + 60 * clamp01((t - e.rt.showFrom) / 6), 0, 0);
      for (const g of e.glyphs) g.mesh.material.opacity = 0.2 * a;
    }
    const flash = this.flashes.find((f) => t >= f.at && t < f.at + FLASH_SEC);
    for (const f of this.flashes) {
      f.group.visible = f === flash;
      if (f !== flash) continue;
      f.group.scale.setScalar(1.08 - 0.08 * ((t - f.at) / FLASH_SEC));
    }
    // letterbox: bars slide in over 0.5 s at a quiet span and snap open on the beat that ends it
    const q = this.quiet.find((s) => t >= s.start && t < s.end);
    const sys = this.job.treatment.design?.system;
    const close = sys && SYSTEMS[sys].letterbox ? 1 : q ? easeOutCubic(clamp01((t - q.start) / 0.5)) : 0;
    for (const bar of this.bars) bar.position.y = bar.userData['side'] * (H / 2 + H * 0.1 - close * H * 0.12);
    this.updateCues(t, fx, flash?.cueId);
    // heavy beats in loud sections: the lyrics jump with the kick (strength from the song's kick analysis)
    const kick = this.kickAt(t, mfx.level);
    this.textRoot.scale.setScalar(1 + 0.05 * kick);
    this.textRoot.position.y = 10 * kick;
    // held lyrics never freeze: the whole type layer drifts a few pixels, like a hand-held camera on a slow move
    this.textRoot.position.x = 9 * Math.sin(t * 0.31) + 4 * Math.sin(t * 0.83 + 1.7);
    this.textRoot.position.y += 6 * Math.sin(t * 0.27 + 0.9);
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
      const isScene = p.mesh.material.uniforms['map'].value === this.sceneTarget?.texture;
      p.mesh.material.uniforms['exposure'].value = mfx.exposure * (isScene ? 1 : 0.12 + 0.88 * stop.image);
      p.mesh.material.uniforms['sat'].value = mfx.saturation * (1 - 0.65 * beams);
    }
    if (peak === 'vacuum') {
      const drop = (this.job.treatment.moments ?? []).find((m) => (m.kind === 'drop' || m.kind === 'finale') && t >= m.at - 0.35 && t < m.at);
      if (drop) this.dim.material.opacity = Math.max(this.dim.material.opacity, 0.96);
    }
    u['uVignette'].value = mfx.vignette;
    // a design language brings its own peak move (graphics.ts drawNative): no shared rays, beams or shockwave
    const own = !!this.job.treatment.design?.language && !!this.gfx;
    u['uRays'].value = own ? 0 : peak === 'rays' || peak === 'vacuum' ? mfx.rays * (peak === 'vacuum' ? 0.5 : 1) : 0;
    u['uBeams'].value = own ? 0 : beams;
    u['uShockR'].value = mfx.shockR;
    u['uShock'].value = own ? 0 : mfx.shock;
    (u['uRayColor'].value as THREE.Color).set(this.paletteAt(t).glow).lerp(new THREE.Color(1, 1, 1), 0.45);
    for (const p of this.plates) {
      const pu = p.mesh.material.uniforms;
      (pu['shadowC'].value as THREE.Color).set(stop.shadow);
      (pu['highlightC'].value as THREE.Color).set(stop.highlight);
      pu['duo'].value = pu['map'].value === this.sceneTarget?.texture ? 0 : Math.max(stop.duotone, 1 - stop.image);
    }
    if (this.motif) {
      const pal = this.paletteAt(t);
      // a 'wipe' into a shot opens through the motif's shape
      const iris = shot.transitionIn === 'wipe' && since >= 0 && since < 0.6 ? since / 0.6 : -1;
      const textOn = this.cueLayers.some(({ rt }) => t >= rt.showFrom && t <= rt.exitAt + rt.exitDur) ? 1 : 0;
      this.motif.update(bt, Math.max(mfx.rays, mfx.moteBurst) * 0.8 * (1 - 0.6 * textOn), new THREE.Color(pal.line), new THREE.Color(pal.accent), peak === 'burst' ? mfx.rays : 0, iris, textOn);
    }
    u['uGrain'].value = 0.02 + 0.1 * d.grain + medium.grain;
    u['uPaper'].value = Math.max(d.paper, medium.paper);
    const held = Math.floor(t * (medium.step || this.job.fps) + 1e-6);
    u['uTime'].value = held / (medium.step || this.job.fps); // grain re-seeds once per held frame
    u['uBoil'].value = medium.boil;
    u['uBoilSeed'].value = Math.floor(t * medium.boilRate + 1e-6) % 97;
    (u['uWeave'].value as THREE.Vector2).set(((hash(held, 11) - 0.5) * 2 * medium.weave) / W, ((hash(held, 12) - 0.5) * 2 * medium.weave) / H);
    u['uFlicker'].value = 1 + (hash(held, 13) - 0.5) * 2 * medium.flicker;
    u['uTooth'].value = medium.tooth;
    u['uPixel'].value = medium.pixel;
    u['uLift'].value = medium.lift;
    const needsMask = medium.pixel + medium.tooth > 0;
    u['uHasText'].value = needsMask ? 1 : 0;
    if (needsMask) u['tText'].value = this.renderTextMask();
    this.finalPass.uniforms['uFlash'].value = fx.flash;
    this.finalPass.uniforms['uHit'].value = fx.hit;
    // capped: past this, white lyrics bloom into an unreadable glare
    this.bloom.strength = Math.min(1.2, 0.55 + 0.9 * fx.hit + mfx.bloom);
    // a light field blooms to white: keep only a trace there
    if (this.job.treatment.graphics && sectionAt(this.job.treatment.graphics, t).text) this.bloom.strength = 0.05;
    this.finalPass.uniforms['uSweep'].value = this.motif ? -1 : sweep;
    // chroma ghosts (after JIZURA's ghost passes): the lyrics as they were 1/30 and 1/15 s ago, offset and tinted
    const chroma = this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language].chroma;
    if (chroma && this.ghostPass) {
      const offset = this.textRoot.position.x;
      ([[2 / 30, -3.4, this.ghostB!], [1 / 30, 3.2, this.ghostA!]] as const).forEach(([lag, dx, target]) => {
        this.updateCues(t - lag, { flash: 0, hit: 0, shake: 0 }, flash?.cueId);
        this.textRoot.position.x = offset + dx;
        this.renderer.setRenderTarget(target);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear();
        this.renderer.render(this.textScene, this.camera);
      });
      this.renderer.setRenderTarget(null);
      this.textRoot.position.x = offset;
      this.updateCues(t, fx, flash?.cueId);
      (this.ghostPass.uniforms['uColA'].value as THREE.Color).set(chroma[0]);
      (this.ghostPass.uniforms['uColB'].value as THREE.Color).set(chroma[1]);
    }
    if (this.job.layer === 'text') {
      // the lyrics alone on transparency (their own colour treatment; grain and grading belong to the back layer)
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(this.textScene, this.camera);
      return;
    }
    if (this.job.layer === 'back') this.textRoot.visible = this.echoRoot.visible = false;
    this.composer.render();
  }

  private textMask?: THREE.WebGLRenderTarget;

  /** The lyrics alone (alpha = coverage), so ink treatments can leave them crisp. */
  private renderTextMask(): THREE.Texture {
    this.textMask ??= new THREE.WebGLRenderTarget(W, H);
    const shown = this.scene.children.map((o) => o.visible);
    this.scene.children.forEach((o) => (o.visible = o === this.textRoot));
    const clear = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.setRenderTarget(this.textMask);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearAlpha(clear);
    this.scene.children.forEach((o, i) => (o.visible = shown[i]));
    return this.textMask.texture;
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

  /** Kick pulse 0..1 at t: only in loud sections (arc level ≥ 2.4), only on beats that really hit (≥ 0.3). */
  private kickAt(t: number, level: number): number {
    const strength = this.job.beatStrength;
    if (!strength || level < 2.4) return 0;
    const beats = this.job.beats;
    let lo = 0;
    let hi = beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1;
    if (i < 0 || strength[i] < 0.3) return 0;
    return Math.min(1, strength[i] * 1.4) * Math.exp(-(t - beats[i]) * 9) * Math.min(1, level - 2.4 + 0.4);
  }

  /** When a shot is clear of lyrics: after the last line that overlaps it has left the screen (+0.4 s). */
  private clearOfLines(shot: Shot): number {
    let t = shot.start;
    for (const c of this.job.cues) if (c.start < shot.end && c.end + EXIT_SEC > shot.start) t = Math.max(t, c.end + EXIT_SEC + 0.4);
    return Math.min(t, shot.end - 1);
  }

  /** The palette with this section's accent (the colour script's one accent drives key words, lines and glows). */
  /** The cue's palette: with a graphic look, dark type over a light backdrop and light type over a dark one. */
  private cuePalette(t: number, backdrop?: string): Palette {
    const p = this.paletteAt(t);
    if (!backdrop) return p;
    const look = sectionAt(this.job.treatment.graphics!, t);
    const light = luma(backdrop) > 0.5;
    const text = light ? (look.text && luma(look.text) < 0.4 ? look.text : '#1a1a1a') : look.text && luma(look.text) > 0.6 ? look.text : '#f4f2ee';
    return { ...p, text, background: backdrop };
  }

  /**
   * Background objects make room for the lyrics: moved (or shrunk) off the rectangle of the line on screen, gliding
   * there over 0.4 s when a new line comes up and back when lines leave.
   */
  private makeRoom(ls: Layer[], t: number): Layer[] {
    const GLIDE = 0.4;
    const at = (x: number) => this.lyricRects.filter((r) => x >= r.from && x <= r.to).map((r) => r.rect);
    const union = (rs: Rect[]) => (rs.length ? rs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })) : undefined);
    const placed = (x: number) => {
      const u = union(at(x));
      return u ? avoidAll(ls, u) : ls;
    };
    // the latest change of the visible set before t: glide from the placement just before it
    const edges = this.lyricRects.flatMap((r) => [r.from, r.to]).filter((x) => x <= t && x > t - GLIDE);
    const now = placed(t);
    if (!edges.length) return now;
    const e = Math.max(...edges);
    const before = placed(e - 0.001);
    return now.map((l, i) => blendLayer(before[i], l, easeOutCubic((t - e) / GLIDE)));
  }

  /** Flips glyphs whose own backdrop (the look at t, under the glyph's settled position) is the same tone as the type. */
  private knockout(layer: CueLayer, t: number, text: string) {
    const fit = new THREE.Group();
    fit.add(layer.group);
    settledBox(layer, fit);
    const dark = luma(text) <= 0.5;
    const flip = new THREE.Color(dark ? '#f4f2ee' : '#16151a');
    const v = new THREE.Vector3();
    layer.group.traverse((o) => {
      const m = o as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      if (!m.isMesh || !m.material.map || o.parent?.userData['inkGhost'] === o) return;
      o.getWorldPosition(v);
      const x = Math.round(v.x + W / 2);
      const y = Math.round(H / 2 - v.y);
      if (x < 8 || y < 8 || x > W - 8 || y > H - 8) return;
      const d = this.probe!.getImageData(x - 8, y - 8, 16, 16).data;
      let l = 0;
      for (let i = 0; i < d.length; i += 4) l += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      l /= d.length / 4;
      if (dark ? l < 0.32 : l > 0.68) m.material.color.copy(flip);
    });
    fit.remove(layer.group);
  }

  /** Mean colour of the look behind `box` (frame px, centre origin; default the central lyric band) at t. */
  private backdropAt(t: number, box?: THREE.Box3): { mean: string; mixed: boolean } | undefined {
    if (!this.job.treatment.graphics) return undefined;
    this.probe ??= Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
    const shot = this.shotAt(t).shot;
    const lyric: Rect | undefined = box && !box.isEmpty() ? { x0: box.min.x + W / 2, y0: H / 2 - box.max.y, x1: box.max.x + W / 2, y1: H / 2 - box.min.y } : undefined;
    drawLook(this.probe, this.job.treatment.graphics, t, { since: 1, pulse: 0, index: 0 }, (asset) => this.images.get(asset ?? shot.asset ?? '')?.image as CanvasImageSource | undefined, (ls) => (lyric ? avoidAll(ls, lyric) : ls));
    const [x0, y0, x1, y1] = box
      ? [box.min.x + W / 2, H / 2 - box.max.y, box.max.x + W / 2, H / 2 - box.min.y].map((v, i) => Math.max(0, Math.min(i % 2 ? H : W, v)))
      : [W * 0.15, H * 0.28, W * 0.85, H * 0.72];
    const d = this.probe.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
    let r = 0, g = 0, b = 0, n = 0, dark = 0, light = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (l < 0.3) dark++;
      else if (l > 0.65) light++;
    }
    const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    // mixed: a sizeable share of both dark and light under the line — no single type colour reads everywhere
    return { mean: `#${hx(r)}${hx(g)}${hx(b)}`, mixed: dark / n > 0.06 && light / n > 0.06 };
  }

  private paletteAt(t: number): Palette {
    const base = this.job.treatment.styleAnchor.palette;
    if (!this.job.treatment.design) return base;
    const stop = colorAt(this.job.treatment.design.colorScript, t);
    const look = this.job.treatment.graphics && sectionAt(this.job.treatment.graphics, t);
    return { ...base, accent: look?.accent ?? stop.accent, glow: look?.accent ?? stop.accent, line: stop.highlight, text: look?.text ?? base.text, background: look?.text ? '#ffffff' : base.background };
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

const hexToRgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Relative luminance 0..1 of a #rrggbb colour (rough: for picking dark or light type). */
const luma = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
