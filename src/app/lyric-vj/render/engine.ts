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
import { MIXED_HALO, clamp01, easeOutBack, easeOutCubic, hash, setKanaScale } from './glyphs';
import { frameSplit } from './frame-split';
import { beatCut } from './beat-cut';
import { handwrite } from './handwrite';
import { titleCard } from './title-card';
import { punch } from './punch';
import { chat } from './chat';
import { drawGlassCrack, drawGlassShards, glassOf } from './kit';
import { input, notify } from './phone';
import { array, couplet, orbit, quote, ribbon, stack, tunnel } from './layouts';
import { templateStyle, withTextFx } from './text-fx';
import { Call, callPhrases, callTimes, lineUp, mapRange, splitCalls } from '../calls';
import { enterSec, momentCamera, Scene, SceneSong, ShownText, shownTexts } from '../scene';
import type { TransitionKind } from './transition';
import { checkScene, drawScene, echoCarry, SCENE_FONTS, SceneTextQa, setScenePictures } from './scene-parts';
import { fxAt, MomentFx, quietSpans } from '../moments';
import { quiet, quietFace } from './quiet';
import { hookRanges, titleHook } from '../compose';
import { stair } from './stair';
import { keywordRange } from './punch';
import { makeGlyphs, placeRow, rowWidth, advanceOf, Glyph, setFinish, setGhost, setHalo, setSizeCap, setInkGhost, setPieces, syncPieces } from './glyphs';
import { colorAt, DEFAULT_DESIGN, uses } from '../design';
import { SYSTEMS } from '../systems';
import { LANGUAGES } from '../languages';
import { MEDIA, stepTime } from '../medium';
import { MotifLayer } from './motif-layer';
import { CustomScene } from './custom-scene';
import { avoidAll, blendLayer, drawLook, drawNative, drawTransition, Layer, layerRect, Measured, measurable, photoBox, Rect, sectionAt, smoothPlacement } from './graphics';
import { freeBand, oppositeSide, setLineVeil } from './kinetic';
import { freeZone } from './board';
import { DIAGRAM_FX } from './kinetic-more';
import { storyEvents, storyLayers } from './story';
import type { Palette } from '../treatment';
import { contrastFace, DEFAULT_FONTS, FontChoice, nearestWeight, readingLatin, resolveFonts } from '../fonts';
import { scatter } from './scatter';
import { typewriter } from './typewriter';
import { vertical } from './vertical';
import { lanes } from './lanes';
import { contrast, CueLayer, guardLine, poorShare, CueRuntime, entranceLost, EXIT_SEC, FrameFx, LEAD, fitReading, measureAtRest, motionPad, paceStyle, PaceAdjust, readable as readableOn, readingSec, ShotLayer, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
/** Exits drawn over time (a glitch, a blade, falling dominoes, pixels, a shattering pane): given the gap to the next line. */
const LONG_EXITS = new Set(['glitch', 'slash', 'domino', 'pixel', 'shatter']);
/**
 * Lyrics always inside the frame: the layer is laid out at its settled moment and, if any glyph would cross the
 * safe area (48 px side / 40 px top-bottom margin), scaled down about the centre inside a wrapper group.
 */
/**
 * Frame-px boxes of the glyphs on screen in a line's group (visible and not faded out), their opacity, and for a whole
 * glyph texture the affine that lays the texture where the letter is drawn, tilt and all (a letter on an arc).
 */
function glyphBoxes(group: THREE.Object3D): (Rect & { a: number; img?: CanvasImageSource; at?: [number, number, number, number, number, number] })[] {
  const out: (Rect & { a: number; img?: CanvasImageSource; at?: [number, number, number, number, number, number] })[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  if (!shown(group)) return out;
  const b = new THREE.Box3();
  group.traverseVisible((o) => {
    const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (!m.isMesh || (m.material.opacity ?? 1) < 0.05) return;
    b.setFromObject(m);
    const map = m.material.map;
    const whole = map && map.repeat.x === 1 && map.repeat.y === 1 && !map.offset.x && !map.offset.y;
    if (b.isEmpty()) return;
    const box = { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y, a: m.material.opacity ?? 1 };
    const pos = m.geometry.getAttribute('position');
    const img = whole ? (map.image as CanvasImageSource & { width: number; height: number }) : undefined;
    if (!img || !pos || pos.count !== 4 || !img.width) return void out.push(box);
    // a plane's corners, top left, top right, bottom left, into frame px: the texture's own affine
    [0, 1, 2].forEach((k) => v[k].fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld));
    const [tl, tr, bl] = v.map((p) => [p.x + W / 2, H / 2 - p.y]);
    out.push({ ...box, img, at: [(tr[0] - tl[0]) / img.width, (tr[1] - tl[1]) / img.width, (bl[0] - tl[0]) / img.height, (bl[1] - tl[1]) / img.height, tl[0], tl[1]] });
  });
  return out;
}

/** The layer's settled bounds in frame px (origin at the centre), with the layer laid out at its readable moment. */
function settledBox(layer: CueLayer, parent?: THREE.Object3D, span = false): THREE.Box3 {
  const [from, to] = layer.readable();
  const end = Number.isFinite(to) ? to : from + 1;
  const vis = layer.group.visible;
  layer.group.visible = true;
  // span: every place the line rests while it is read (a stack line is pushed up when the next one lands; measured
  // once it protected only one of its places — a card covered チョロイン c061, c003 ran off the frame), else the middle
  const box = new THREE.Box3();
  for (const k of span ? [0.05, 0.25, 0.5, 0.75, 0.95] : [0.5]) {
    measureAtRest(() => layer.update(from + (end - from) * k, { flash: 0, hit: 0, shake: 0 }));
    (parent ?? layer.group).updateMatrixWorld(true);
    box.union(shownBox(layer));
  }
  layer.group.visible = vis;
  return box;
}

/**
 * Each place a line rests while it is read, with when it is there: a stack (or couplet) line moves when a later line
 * lands (`cuts`, its arrivals); one box per stretch between them, measured once the 0.4 s push has settled. The
 * union of all of them held the whole frame middle for the whole line (チョロイン c003: a one-row line kept props and
 * photos off 580 px of the frame) though the line is only ever in one of those places.
 */
function placesWhileRead(layer: CueLayer, parent: THREE.Object3D, cuts: number[]): { from: number; to: number; box: THREE.Box3 }[] {
  const [from, to] = layer.readable();
  const end = Number.isFinite(to) ? to : from + 1;
  const vis = layer.group.visible;
  layer.group.visible = true;
  const bounds = [from, ...cuts.filter((c) => c > from + 0.05 && c < end - 0.05), end];
  const out = bounds.slice(0, -1).map((a, i) => {
    const b = bounds[i + 1];
    const s0 = Math.min(i ? a + 0.4 : a + (end - from) * 0.05, b - 0.01);
    const box = new THREE.Box3();
    for (const x of [s0, (s0 + b) / 2, b - 0.01]) {
      measureAtRest(() => layer.update(x, { flash: 0, hit: 0, shake: 0 }));
      parent.updateMatrixWorld(true);
      box.union(shownBox(layer));
    }
    return { from: a, to: b, box };
  });
  layer.group.visible = vis;
  return out;
}

/** The box of what the layer shows now, in world (frame) px with every transform above it applied. */
function shownBox(layer: CueLayer, inkOnly = false): THREE.Box3 {
  // only what is showing at that moment (beat-cut keeps its other pieces hidden)
  const box = new THREE.Box3();
  // decor (array's tiled words) is not the lyric: it may fill the frame on purpose
  const shown = (o: THREE.Object3D): boolean => o === layer.group || (o.visible && !o.userData['decor'] && (!o.parent || shown(o.parent)));
  layer.group.traverse((o) => {
    // inkOnly (the motion check): what can be seen, not pieces waiting at zero opacity
    const faint = inkOnly && ((o as THREE.Mesh).material as THREE.Material | undefined)?.opacity !== undefined && ((o as THREE.Mesh).material as THREE.Material).opacity <= 0.01;
    if ((o as THREE.Mesh).isMesh && o.parent && shown(o.parent) && o.visible && !faint) box.expandByObject(o);
  });
  return box;
}

/** Text without spaces, punctuation or symbols, to match a card's words in a line (「嘘つき！」 in 「…結局嘘つき！つき！」). */
const bare = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');

/** A stretch between changes is placed as it is this long in: a card that just landed has stopped falling (story.ts). */
const SETTLE_SEC = 0.9;

/** A line whose type reads below 3:1 over more than this share of its box, as played, is rebuilt light in a dark halo
 * (experimental: set by eye on チョロイン, iw and Utsusemi stills, 2026-10-13). */
const POOR_SHARE = 0.15;
/** The light type of a line over light and dark at once (in a dark halo). */
const LIGHT_TYPE = '#f4f2ee';

function fitToFrame(layer: CueLayer, kick: boolean): THREE.Group {
  const fit = new THREE.Group();
  fit.add(layer.group);
  if (layer.framed) return fit;
  const box = settledBox(layer, fit, true);
  if (box.isEmpty()) return fit;
  const ex = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  const ey = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
  // inside the safe area at rest, and inside the frame as it moves (motionPad: the kick and drift grow the box about
  // the centre, the sway and drift shift it); 行星 c010 and 天文対話 c036 sat in the safe area and swayed off the frame
  const pad = motionPad({ x0: W / 2 - ex, y0: H / 2 - ey, x1: W / 2 + ex, y1: H / 2 + ey }, kick);
  const mx = (pad.x1 - W / 2) / ex;
  const my = (pad.y1 - H / 2) / ey;
  fit.scale.setScalar(Math.min(1, (W / 2 - 48) / ex, (H / 2 - 40) / ey, W / 2 / (ex * mx), H / 2 / (ey * my)));
  return fit;
}

/** How long a drop's keyword flash holds before the line takes over (a few frames). */
const FLASH_SEC = 0.16;
const HOLD_SEC = 1.2;
/** Loudness from which heavy beats kick the type layer (kickAt); the lyrics' avoidance room counts the kick from here. */
const KICK_LEVEL = 2.4;
const KANA_TEMPLATES = new Set(['punch', 'beat-cut', 'scatter', 'title-card']);
/** Vertical presentation forms (︕︖︙) in lyrics typed for vertical text set as wide blanks across: their horizontal
 * marks, one for one so character timings keep their indexes. */
function horizontalPunct<T extends { text: string }>(c: T): T {
  return c && /[︕︖︐]/.test(c.text) ? { ...c, text: c.text.replace(/︕/g, '！').replace(/︖/g, '？').replace(/︐/g, '、') } : c;
}

const RENDERERS: Record<string, TemplateRenderer> = { punch, 'frame-split': frameSplit, typewriter, vertical, scatter, handwrite, 'title-card': titleCard, 'beat-cut': beatCut, quiet, stair, stack, array, couplet, quote, orbit, ribbon, tunnel, chat, notify, input, lanes };

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
  /** Members and their colours: a line tagged with a singer is set in that singer's colour. */
  singers?: { name: string; color: string }[];
  /** Downbeats (song.downbeats): storyboard events may count them. */
  downbeats?: number[];
  /** QA: log every sprite's box per frame (codelayer.mts continuity checks). */
  track?: boolean;
  /** One layer only, for compositing in VJ software: 'text' = lyrics on transparency, 'back' = everything else. */
  layer?: 'text' | 'back';
  /**
   * A line too fast for its entrance: 'whole' (default) keeps a quick entrance on the whole line at once when readFix
   * still finds the reading time, else cuts; 'stagger' the same character by character (comparison only); 'cut' always
   * cuts: the earlier entrance strategy, kept as the fallback (measuring, room-making and fit work the same either way).
   */
  entrance?: Entrance;
}

/** motionQa per line: the deepest overlap with a visible story prop (by cause), decoration and card pile, and how far past the safe area / frame edge. */
export interface MotionCheck {
  id: string;
  text: string;
  template: string;
  /** Lyrics over a visible story prop or card, by cause (each the deepest, with which prop, its opacity and layer). */
  motion: Hit;
  atRest: Hit;
  /** Over a prop that found no room and faded behind the line (avoid's fallback, by design; still counted). */
  steppedBack: Hit;
  gliding: Hit;
  /** Lyrics over a visible decoration (inset photo, blob, stamp, seal, numeral, window); `cause` as above. */
  decor: Hit & { cause?: OverlapCause };
  /** Two visible cards over each other while the line is up (their texts show through each other). */
  cards: { t: number; px: number; a?: string; b?: string; opacity?: [number, number] };
  offSafe: { t: number; px: number };
  offFrame: { t: number; px: number };
}

export type OverlapCause = 'motion' | 'atRest' | 'steppedBack' | 'gliding';

/** The deepest overlap (px) at t, with the object it is over: id, drawn opacity and draw layer. */
export interface Hit {
  t: number;
  px: number;
  prop?: string;
  opacity?: number;
  layer?: string;
}

export type Entrance = 'whole' | 'stagger' | 'cut';

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
  /** When its last character is sung and when it is gone (equal for a line a template keeps up on purpose). */
  lastSung: number;
  goneAt: number;
  template: string;
  /** The director's entrance/reveal, what was drawn, why it changed, and whether a planned entrance never played. */
  plannedEnter: string;
  plannedReveal: string;
  enter: string;
  reveal: string;
  /** How much the line was scaled down to stay in the safe area at rest and in the frame as it moves (1 = not). */
  fitScale: number;
  /** A whole-line quick entrance was drawn (entrance 'whole'); a line cut afterwards keeps its state but did not get one. */
  together: boolean;
  adjust: PaceAdjust[];
  entranceLost: boolean;
}

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uHit: { value: 0 }, uSweep: { value: -1 }, uAberration: { value: 0.0012 }, uGrain: { value: 0.05 }, uPaper: { value: 0 }, uBeams: { value: 0 },
    // section moments (moments.ts)
    uVignette: { value: 0 }, uVigBase: { value: 0.55 }, uRays: { value: 0 }, uShockR: { value: -1 }, uShock: { value: 0 },
    uRayColor: { value: new THREE.Color(1, 1, 1) },
    // medium (medium.ts)
    uBoil: { value: 0 }, uBoilSeed: { value: 0 }, uWeave: { value: new THREE.Vector2() }, uFlicker: { value: 1 }, uTooth: { value: 0 },
    uPixel: { value: 0 }, uLift: { value: 0 }, tText: { value: null }, uHasText: { value: 0 },
    // full-frame glitch transition, and the ending's fade to black
    uGlitch: { value: 0 }, uFade: { value: 0 },
    // a broken screen (kit.ts glass): the shard map shifts and shades the picture piece by piece, the cracks go on top
    tGlass: { value: null }, tCracks: { value: null }, uGlass: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFlash, uHit, uSweep, uAberration, uGrain, uPaper, uBeams;
    uniform float uVignette, uVigBase, uRays, uShockR, uShock; uniform vec3 uRayColor; varying vec2 vUv;
    uniform float uBoil, uBoilSeed, uFlicker, uTooth, uPixel, uLift, uHasText, uGlitch, uFade; uniform sampler2D tText; uniform vec2 uWeave;
    uniform sampler2D tGlass, tCracks; uniform float uGlass;
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
      vec3 c = vec3(texture2D(tDiffuse, uv + d * a).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * a).b);
      vec4 cracks = vec4(0.0);
      if (uGlass > 0.0) {                           // broken glass: each shard refracts what is under it a little
        vec3 sh = texture2D(tGlass, vUv).rgb;
        vec2 off = (sh.rg - 0.5) * 0.02 * uGlass;
        cracks = texture2D(tCracks, vUv);
        float split = 0.0016 * cracks.a;            // a rainbow fringe along the cracks
        c = vec3(texture2D(tDiffuse, uv + off + split).r, texture2D(tDiffuse, uv + off).g, texture2D(tDiffuse, uv + off - split).b);
        c *= 1.0 + (sh.b - 0.5) * 0.3 * uGlass;
        c += vec3(0.03) * (sh.b - 0.5) * uGlass;   // a lighter shard is a little milky even over black
      }
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
      c *= 1.0 - (uVigBase + uVignette) * dot(d, d) * 1.6; // vignette
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
      if (uGlitch > 0.0) {                          // block noise, only in the bands that jumped (all over read as a dead TV)
        float gb = floor(vUv.y * 14.0) + floor(uTime * 30.0) * 7.0;
        c += (rnd(floor(vUv * vec2(48.0, 27.0)) + uTime) - 0.5) * 0.14 * uGlitch * step(0.45, h1(gb * 1.7));
      }
      c = mix(c, cracks.rgb, cracks.a * uGlass);   // the cracks themselves over everything, the type included
      // white only at the peak, then an exposure lift that falls away: a plain white mix while it decays is grey fog
      // over a dark frame; brightening keeps the darks dark and makes the lit parts glow
      float fl = clamp(uFlash, 0.0, 1.0);
      c = mix(c, vec3(1.0), pow(fl, 4.0)) * (1.0 + 1.2 * fl);
      c *= 1.0 - clamp(uFade, 0.0, 1.0);
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
  private lyricRects: { from: number; to: number; rect: Rect; rest: Rect; id?: string }[] = [];
  /** The visible props, cards and decorations as placed in the last rendered frame (motionQa checks the lyrics against them). */
  private placedProps: Measured[] = [];
  /** The props were still gliding out of the way of a line that just came up (or back after one left). */
  private propsGliding = false;
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
  private cueLayers: { rt: CueRuntime; layer: CueLayer; fit?: THREE.Group; fitScale?: number; drift?: [number, number]; mixed?: boolean; remake?: () => void; twin?: { layer: CueLayer; fit: THREE.Group; text: [string, string] }; guard?: { from: number; to: number; rect: Rect; share: number; light: number } }[] = [];
  /** Calls and backing lines (the bracketed part of a line) on a small second track of their own. */
  private callLayers: { rt: CueRuntime; group: THREE.Group; units: { glyphs: Glyph[]; at: number; x: number; y: number; tilt: number }[] }[] = [];
  private images = new Map<string, THREE.Texture>();
  /** Each shot's lines as they show (chat attachments are pushed up by the messages after them). */
  private shotLines = new Map<string, { text: string; at: number }[]>();
  /** The storyboard's scenes (scene.ts): drawn by their parts, their lines never built as caption layers. */
  private storyboard: Scene[] = [];
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
    // a storyboard draws on the graphics canvas: give it one
    if (this.job.treatment.storyboard?.length) this.job.treatment.graphics ??= { sections: [{ start: 0, layers: [] }] };
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
    const faces = [[fonts.display, 400], [fonts.body, 900], [fonts.body, 700], [fonts.script, 400], [quietFace(fonts.display), 500], [contrastFace(fonts.display), 900]] as const;
    await Promise.all(faces.map(([f, w]) => document.fonts.load(`${nearestWeight(f, w)} 100px "${f}"`, text)));
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(this.job.assets).map(async ([id, a]) => {
        const tex = await loader.loadAsync(a.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.images.set(id, tex);
      }),
    );
    // story props take their pictures' aspect (their boxes make room for the lyrics); a prop with no picture (the
    // image model dropped it) is taken out instead of drawing nothing where the story expects it
    // a calls board (idol Live's LED marquee) shows the song's calls as they are shouted, apart from the lead's lines
    if (treatment.graphics) {
      const script = callTimes(cues).map(({ text, at }) => ({ text, at }));
      for (const sec of treatment.graphics.sections) for (const l of sec.layers) if (l.kind === 'led' && l.calls) l.script = script;
    }
    if (treatment.graphics?.story) {
      const pic = (prop: string) => this.images.get(`spr:${prop}`)?.image as { width: number; height: number } | undefined;
      const aspect = (prop: string) => pic(prop)!.width / pic(prop)!.height;
      // a shape chain or a float keeps the shapes that were drawn (and drops out if fewer than it needs remain)
      treatment.graphics.story = treatment.graphics.story
        .filter((it) => !('prop' in it) || pic(it.prop))
        .map((it) => {
          if ('prop' in it) return { ...it, aspect: aspect(it.prop) };
          if (it.kind === 'morph') {
            const steps = it.steps.filter((s) => pic(s.prop));
            return { ...it, steps, aspects: Object.fromEntries(steps.map((s) => [s.prop, aspect(s.prop)])) };
          }
          if (it.kind === 'float') {
            const props = it.props.filter((p) => pic(p));
            return { ...it, props, aspects: Object.fromEntries(props.map((p) => [p, aspect(p)])) };
          }
          return it;
        })
        .filter((it) => (it.kind === 'morph' ? it.steps.length > 1 : it.kind === 'float' ? it.props.length > 0 : true));
      // a card the colour of the ground it lands on cannot be read (行星's second, dark-blue time notes on the night
      // sky): measured where it lands (without the story drawn), it turns to light paper with dark ink
      const story = treatment.graphics.story;
      treatment.graphics.story = undefined;
      const cards = story.map((it) => {
        if (it.kind !== 'cards' && it.kind !== 'chapter') return it;
        const box = new THREE.Box3(new THREE.Vector3(it.x * (W / 2) - 260, it.y * (H / 2) - 200, 0), new THREE.Vector3(it.x * (W / 2) + 260, it.y * (H / 2) + 120, 0));
        const ground = this.backdropAt((it.kind === 'cards' ? it.from : it.at) + 0.5, box)?.mean;
        return ground && contrast(it.color, ground) < 2.2 ? { ...it, color: '#F4ECDA', ink: '#1E1C24' } : it;
      });
      // a prop the tone of its ground (落ちた風鈴: pale glass on cream paper) gets a halo of the opposite tone
      treatment.graphics.story = cards.map((it) => {
        if (!('prop' in it)) return it;
        const tone = this.spriteTone(`spr:${it.prop}`);
        // where and when it is first fully seen (a moving prop: where its journey ends, an orbit: its centre)
        const at = it.kind === 'hero' ? it.states[0]?.at ?? 0 : it.kind === 'fly' ? it.at + it.dur : it.kind === 'pop' ? it.at + 0.5 : it.kind === 'journey' ? it.to : it.from + 0.5;
        const [x, y] = it.kind === 'journey' ? it.pts[it.pts.length - 1] : [it.x, it.y];
        const [hw, hh] = [(it.size * H * (it.aspect ?? 1)) / 2, (it.size * H) / 2];
        const box = new THREE.Box3(new THREE.Vector3(x * (W / 2) - hw, y * (H / 2) - hh, 0), new THREE.Vector3(x * (W / 2) + hw, y * (H / 2) + hh, 0));
        const ground = this.backdropAt(at, box)?.mean;
        if (!tone || !ground || contrast(tone, ground) >= 1.6) return it;
        return { ...it, lift: contrast(ground, '#000000') > contrast(ground, '#FFFFFF') ? 'rgba(20,18,24,0.75)' : 'rgba(255,250,240,0.85)' };
      });
    }
    const logo = this.job.meta?.logo ? await loader.loadAsync(this.job.meta.logo) : undefined;
    if (logo) logo.colorSpace = THREE.SRGBColorSpace;
    const ctx = { fonts: this.fonts, accentFont: this.accentFont, meta: { title: this.job.meta?.title ?? '', artist: this.job.meta?.artist ?? '' }, logo, texture: (id: string) => this.images.get(id), lines: (shotId: string) => this.shotLines.get(shotId) ?? [] };
    if (treatment.motif && (!design.system || SYSTEMS[design.system].motif) && (!design.language || LANGUAGES[design.language].motif)) {
      this.motif = new MotifLayer(treatment.motif, this.job.beats, { display: this.fonts.display, accent: this.accentFont });
      this.motif.group.renderOrder = 2.7; // above the background and motes, under the lyrics
      this.scene.add(this.motif.group);
    }
    for (const spec of treatment.scenes ?? []) {
      const stop = colorAt(design.colorScript, spec.start + 0.5);
      this.customScenes.push(new CustomScene(spec, { W, H, start: spec.start, end: spec.end, palette: { shadow: stop.shadow, highlight: stop.highlight, accent: stop.accent }, beats: this.job.beats, beatStrength: this.job.beatStrength ?? [], hash }));
    }
    // 'auto' placement: the lyrics go to the third of the frame where the background is calmest at that shot
    for (const shot of treatment.shots)
      for (const [k, v] of Object.entries(shot.params)) if (v === 'auto') shot.params[k] = this.calmSide(shot, k);
    for (const shot of treatment.shots) {
      const r = RENDERERS[shot.template];
      if (r?.shot) {
        const from = r.standalone ? this.clearOfLines(shot) : shot.start;
        const make = (palette: Palette) => {
          const l = r.shot!({ ...shot, start: from }, shot.params, palette, ctx);
          l.group.visible = false;
          this.textRoot.add(l.group);
          return l;
        };
        let layer = make(treatment.styleAnchor.palette);
        if (r.standalone && treatment.graphics) {
          // measured once it has fully drawn in (glyphs sit at the origin until the first update)
          const at = Math.min(from + 2.5, shot.end - 1);
          layer.update(at, { flash: 0, hit: 0, shake: 0 });
          layer.group.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(layer.group);
          if (!b.isEmpty()) {
            // the title takes dark or light type against what is behind it, like a line, and the background makes room;
            // a long card spans several camera shots, so the backdrop is sampled across it and the type must read on all
            const samples = [at, (at + shot.end) / 2, shot.end - 1.5].filter((x) => x >= from && x < shot.end).map((x) => this.backdropAt(x, b)?.mean).filter((x): x is string => !!x);
            const lumas = samples.map(luma);
            const darkType = Math.min(...lumas) > 1 - Math.max(...lumas);
            // the colour is picked against the backdrop that is hardest for that type: dark type against the darkest
            // sample, light type against the lightest (picked the other way round, 雙截棍's title went dark on dark)
            const backdrop = samples.length ? samples[lumas.indexOf(darkType ? Math.min(...lumas) : Math.max(...lumas))] : undefined;
            // a card over both dark and light ground (a dark intro cutting to yellow) gets the line treatment for that
            const spread = lumas.length ? Math.max(...lumas) - Math.min(...lumas) : 0;
            const both = spread > 0.35;
            const text = both ? '#f4f2ee' : backdrop ? this.cuePalette(at, backdrop).text : treatment.styleAnchor.palette.text;
            const ground = both ? '#141218' : backdrop ?? treatment.styleAnchor.palette.background;
            this.textRoot.remove(layer.group);
            setHalo(both ? MIXED_HALO : luma(ground) > 0.5 ? hexToRgba(ground, 0.95) : 'rgba(0,0,0,0.85)');
            layer = make({ ...treatment.styleAnchor.palette, text, background: ground });
            const r = { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y };
            this.lyricRects.push({ from, to: shot.end, rect: r, rest: r });
          }
        }
        this.shotLayers.set(shot.id, layer);
      }
    }
    const all = treatment.cues
      .map((style) => ({ style, cue: horizontalPunct(cues.find((c) => c.id === style.cueId)!) }))
      .filter((x) => x.cue)
      .sort((a, b) => a.cue.start - b.cue.start);
    // shouts are call words beside the lead line that is up (the line before keeps showing through them)
    const shouts = all.filter((x) => x.style.shout);
    // a scene's lines are drawn by its parts: nothing below (merging, pacing, room-making, recolouring) touches them
    this.storyboard = treatment.storyboard ?? [];
    // the story's drawn props and the song's title, for the scene parts that show them
    setScenePictures((prop) => this.images.get(`spr:${prop}`)?.image as (CanvasImageSource & { width: number; height: number }) | undefined, this.job.meta ? { title: this.job.meta.title, artist: this.job.meta.artist } : undefined);
    const sceneShots = new Set(treatment.shots.filter((s) => s.template === 'scene').map((s) => s.id));
    const sorted = all.filter((x) => !x.style.shout && !sceneShots.has(x.style.shot));
    if (this.storyboard.length) {
      const text = this.storyboard.flatMap((sc) => shownTexts(sc, this.sceneSong()).map((x) => x.text)).join('') + 'iLiFE!';
      const faces = new Set([...SCENE_FONTS, ...this.storyboard.flatMap((sc) => sc.parts.flatMap((p) => (typeof p.params?.['font'] === 'string' ? [p.params['font'] as string] : [])))]);
      const extra = '特典券No.0046CHEKI×1¥2,000TIME UP0123456789:';
      await Promise.all([...faces].flatMap((f) => [400, 700, 900].map((wt) => document.fonts.load(`${wt} 100px "${f}"`, text + extra))));
    }
    // a line sung again straight away (いつまでも ×3) stays up as one line that pulses on each repeat: three cuts in
    // three seconds could not be read
    const norm = (x: string) => x.replace(/[\s、。,.!?！？「」]/g, '');
    const repeats = new Map<string, number[]>();
    const styled: typeof sorted = [];
    for (const x of sorted) {
      const prev = styled[styled.length - 1];
      // a chat keeps every message: the earlier ones stay up in the thread, and sending it three times is the point
      const chat = treatment.shots.find((s) => s.id === x.style.shot)?.template === 'chat';
      if (prev && !chat && norm(prev.cue.text) === norm(x.cue.text) && x.cue.start - prev.cue.end < 0.6) {
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
      // a chat sends each line as its own message: the thread keeps both up anyway
      const inChat = treatment.shots.find((s) => s.id === styled[i].style.shot)?.template === 'chat';
      if (inChat || !quick(a) || !quick(b) || b.start - a.end > 0.35 || chars > 26 || repeats.has(a.id) || repeats.has(b.id)) continue;
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
    // the entrance is over when the voice comes in: a line starts its animation that much earlier (as long as the line
    // before is no longer being sung)
    const ENTER_LEAD: Record<string, number> = { slam: 0.3, pop: 0.3, wipe: 0.2, fade: 0.25, ink: 0.45, cut: 0 };
    const showAt = styled.map(({ cue, style }, i) => {
      // a message is sent on the line's first sung syllable, not ahead of it (the database's chat videos: the bubble
      // lands on the beat the voice comes in)
      if (treatment.shots.find((s) => s.id === style.shot)?.template === 'chat') return cue.start;
      const pace = Math.min(1, Math.max(0.35, (cue.end - cue.start) / 2));
      return Math.max(cue.start - Math.max(lead, (ENTER_LEAD[style.enter] ?? 0.25) * pace), Math.min(cue.start, (lastSung[i - 1] ?? -Infinity) + 0.3));
    });
    for (const [i, { cue, style }] of styled.entries()) this.shotLines.set(style.shot, [...(this.shotLines.get(style.shot) ?? []), { text: cue.text, at: showAt[i] }]);
    // the title as sung gets one fixed treatment every time it appears (accent colour), like a logotype
    // strokes only when the director picked them (older treatments without techniques keep whole glyphs)
    setPieces(!!design.techniques?.includes('pieces'));
    // a quiet song's lines carry no offset ghost (三年後的大雪's thick shadows pushed its longing into a poster's shout)
    const langGhost: [number, number] = design.language && !design.quiet ? (LANGUAGES[design.language].text?.ghost ?? [0, 0]) : [0, 0];
    setGhost(langGhost);
    setFinish(design.finish);
    setSizeCap(design.language ? (LANGUAGES[design.language].text?.cap ?? 1) : 1);
    const hook = uses(design, 'title-hook') ? titleHook(this.job.meta?.title ?? '') : '';
    styled.forEach(({ style: style1, cue: cue1 }, i) => {
      // bracketed calls leave the line for a track of their own; emphasis and breaks follow the remaining text (a chat
      // message keeps its aside: 「もう殺しちゃいたいんだ (キルユー)」 is one message)
      const inChat = treatment.shots.find((s) => s.id === style1.shot)?.template === 'chat';
      const split = inChat ? { main: cue1.text, calls: [] as Call[], map: [...cue1.text].map((_, k) => k) } : splitCalls(cue1.text);
      const cue = split.calls.length ? { ...cue1, text: split.main, charStarts: cue1.charStarts && cue1.charStarts.length === split.map.length ? cue1.charStarts.filter((_, k) => split.map[k] >= 0) : undefined } : cue1;
      const style0 = split.calls.length
        ? {
            ...style1,
            emphasis: style1.emphasis?.flatMap((e) => {
              const r = mapRange(split.map, e.from, e.to);
              return r ? [{ ...e, from: r[0], to: r[1] }] : [];
            }),
            rows: style1.rows?.map((r) => split.map[r]).filter((r) => r > 0),
          }
        : style1;
      const hooks = hookRanges(cue.text, hook).map(([from, to]) => ({ from, to, method: 'color' as const }));
      const style = hooks.length ? { ...style0, emphasis: [...hooks, ...(style0.emphasis ?? [])] } : style0;
      const shot = treatment.shots.find((s) => s.id === style.shot)!;
      const next = styled[i + 1]?.cue;
      const nextShow = next ? showAt[i + 1] : Infinity;
      const len = cue.end - cue.start;
      const pace = Math.min(1, Math.max(0.35, len / 2)); // short lines enter and leave faster so they stay readable
      // a rushed line leaves in a blink: its exit animation would eat the little time it has
      const rushedLine = len < [...cue.text.replace(/\s/g, '')].length / 12 + 1;
      // a glitch or a blade needs time to be seen; it takes up to half a second when the next line leaves room (a row of
      // dominoes or a shattering pane up to 0.8 s: in 0.28 s neither reads as more than a flicker)
      // a cut needs no time: the line holds until the next one shows (leaving early left a frame with no words in it)
      // a fade takes the time the music leaves it: half the gap to the next line, 0.28–1 s
      const fadeSec = Math.min(1, Math.max(EXIT_SEC * pace, (nextShow - cue.end) * 0.5));
      // a falling, breaking or pixelating exit may take 0.6 s of the line's own end when the line has that much more than
      // it needs to be read (lines sung back to back left it 0.28 s: a blink, never seen as dominoes or glass)
      const spare = len - readingSec(cue.text, cue.start, cue.end);
      const drawnFloor = ['domino', 'shatter', 'pixel'].includes(style.exit) && spare > 0.8 ? 0.6 : 0;
      const exitSec = style.exit === 'cut' ? 0 : rushedLine ? 0.08 : style.exit === 'fade' ? fadeSec : LONG_EXITS.has(style.exit) ? Math.max(EXIT_SEC * pace, drawnFloor, Math.min(style.exit === 'domino' || style.exit === 'shatter' ? 0.8 : 0.5, nextShow - cue.end - 0.05)) : EXIT_SEC * pace;
      // breathing: a line holds up to 1.2 s past its last syllable when nothing follows straight away
      // lines after this one in the same shot (stack and couplet keep earlier lines up while they arrive)
      const later = styled.flatMap((x, j) => (j > i && x.style.shot === style.shot ? [showAt[j]] : []));
      const laterText = styled.flatMap((x, j) => (j > i && x.style.shot === style.shot ? [x.cue.text] : []));
      const shotText = styled.flatMap((x) => (x.style.shot === style.shot ? [x.cue.text] : []));
      const firstVoice = styled.find((x) => x.style.shot === style.shot)?.style.voice;
      const persist = RENDERERS[shot.template]?.persist;
      const leaveBy = (() => {
        const other = styled.findIndex((x, j) => j > i && x.style.shot !== style.shot);
        const shotOver = Math.min(shot.end, other >= 0 ? showAt[other] : Infinity);
        if (persist === 'shot') return shotOver;
        if (persist === 'next') return Math.min(shotOver, later[1] ?? Infinity);
        return nextShow;
      })();
      const exitAt = persist ? Math.max(cue.end, leaveBy - exitSec - 0.02) : Math.min(cue.end + HOLD_SEC, nextShow - exitSec - 0.02);
      const inBeats = beatsDuring(this.job.beats, cue.start, cue.end);

      // a line sung faster than it can be read appears whole: word reveals and staggered pieces would eat its time
      const entrance = this.job.entrance ?? 'whole';
      const { style: paced, rushed, adjust } = paceStyle(style, cue, entrance !== 'cut');
      // a quick entrance comes in on the whole line at once
      const together = entrance === 'whole' && adjust.includes('fast-short');
      const rt: CueRuntime = {
        cue, style: paced, shot, params: shot.params, palette: this.paletteAt(cue.start + 0.3), // a colour stop set on the drop beat can sit a few ms after the line's start
        // an English line is set in the paired Latin face
        fonts: isLatinLine(cue.text) ? { display: readingLatin(this.accentFont), body: readingLatin(this.accentFont), script: readingLatin(this.accentFont) } : this.fonts,
        showFrom: showAt[i],
        exitAt: Math.max(cue.start + 0.25 * pace, exitAt),
        exitDur: Math.max(0.08, Math.min(exitSec, (persist ? leaveBy : nextShow) - Math.max(cue.start + 0.25 * pace, exitAt) - 0.02)),
        accentTimes: [...(style.accents ?? []).map((k) => inBeats[k]).filter((b) => b !== undefined), ...(repeats.get(cue.id) ?? [])].sort((a, b) => a - b),
        pace,
        rushed,
        planned: { enter: style.enter, reveal: style.reveal },
        song: [...(this.job.meta?.title ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
        bpm: this.job.tempo,
        together,
        adjust,
        later,
        laterText,
        shotText,
        firstVoice,
        order: styled.slice(0, i).filter((x) => x.style.shot === style.shot).length,
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
        const probe = RENDERERS[shot.template].cue({ ...rt, style: templateStyle(rt.style) });
        const box = settledBox(probe);
        const where = box.isEmpty() ? undefined : box;
        const measured = this.backdropAt(cue.start + Math.min(1, (cue.end - cue.start) / 2), where);
        backdrop = measured?.mean;
        mixed = measured?.mixed ?? false;
        rt.palette = this.cuePalette(cue.start + 0.3, backdrop);
        // the camera moves under a held line: measured again as it lands and as it leaves; where the chosen colour
        // falls short anywhere (a bright lake sliding in), the line takes the treatment that reads on anything
        const ends = [cue.start + 0.15, Math.max(cue.start + 0.2, cue.end - 0.2)].map((x) => this.backdropAt(x, where)).filter((m): m is NonNullable<typeof m> => !!m);
        if (ends.some((m) => m.mixed || contrast(rt.palette.text, m.mean) < 3)) mixed = true;
      }
      // a line over light and dark at once (stripes, a photo inset) stays one colour: light type in a dark halo reads
      // on both; flipping each glyph to the other ink made words change colour for no reason
      // the emphasis colour is read against the same dark keyline as the type: measured against the light half of the
      // backdrop it was darkened, and a dark keyword sat unreadable on the dark half (世界のつづき 「波に」)
      const colour = (mix: boolean) => {
        if (mix) rt.palette = { ...rt.palette, text: LIGHT_TYPE, background: '#141218' };
        // a member's line in the member's colour, lightened or darkened until it reads on what is behind it
        const singer = cue.singer ? this.job.singers?.find((x) => x.name === cue.singer) : undefined;
        if (singer) rt.palette = { ...rt.palette, text: readableOn(singer.color, backdrop ?? rt.palette.background, 4.5) };
        // a one-ink look (phosphor) keeps its ink on everything: the dark halo carries it over a busy backdrop
        // a section on a real Mac / Windows desktop takes white type instead, so the two kinds of section read apart
        // (read mid-line: the director's section starts are rounded and land a few hundredths after the cut)
        const desk = this.job.treatment.graphics && sectionAt(this.job.treatment.graphics, (cue.start + cue.end) / 2).layers.some((l) => l.kind === 'ui' && (l.skin === 'mac' || l.skin === 'win'));
        const ink = design.language && LANGUAGES[design.language].text?.ink;
        if (ink) rt.palette = { ...rt.palette, text: desk ? '#F5F5F7' : ink };
        setHalo(mix ? MIXED_HALO : backdrop && luma(backdrop) > 0.5 ? hexToRgba(backdrop, 0.95) : 'rgba(0,0,0,0.85)');
        // the dark offset copy goes under light type; dark type gets the offset as a coloured second ink instead (a dark
        // shadow under dark heavy type merged the strokes into one blob)
        const darkType = luma(rt.palette.text) <= 0.5;
        // dark type never sits on a dark halo or keyline: its strokes and counters fill in and the word reads as one
        // blob (てぇてぇ's chorus: dark type on a dark keyline). A light halo keeps it legible on any ground
        if (darkType && (mix || !(backdrop && luma(backdrop) > 0.5))) setHalo('rgba(255,255,255,0.92)');
        setGhost(darkType ? [0, 0] : langGhost);
        setInkGhost(darkType && (langGhost[0] || langGhost[1]) ? { dx: langGhost[0] * 1.4, dy: langGhost[1] * 1.4, color: new THREE.Color(rt.palette.accent).lerp(new THREE.Color(1, 1, 1), 0.25) } : null);
      };
      colour(mixed);
      // templates draw the plain entrance/exit; ink, glitch, slash and drawn emphasis go on top (text-fx.ts)
      const build = (r = rt) => withTextFx(RENDERERS[shot.template].cue({ ...r, style: templateStyle(r.style) }), r);
      let layer = build();
      // a line not up long enough to read holds into the free time after it, or lands and leaves at once (the
      // templates read their timing when built, so the line is built again with the new timing)
      const need = readingSec(rt.cue.text, rt.cue.start, rt.cue.end);
      const limit = (persist ? leaveBy : nextShow) - 0.02;
      const fixRead = fitReading(rt, (r) => (r === rt ? layer : build(r)).readable(), need, limit, entrance !== 'cut', entrance === 'whole');
      if (fixRead) {
        Object.assign(rt, fixRead);
        layer = build();
      }
      // a kinetic print swaps paper and ink from cut to cut under one line: no one type colour reads on both (light
      // type with a dark keyline sat unreadable on the cream cuts), so the line is built in both inks and each frame
      // shows the one that reads on the cut behind it (updateCues)
      const inks = this.kineticInks(cue.start, cue.end);
      let twin: CueLayer | undefined;
      const keyOn: [string, string] = ['', '']; // each build's type colour after the language's own ink
      if (inks) {
        const inked = (text: string, ground: string) => {
          backdrop = ground;
          rt.palette = { ...this.cuePalette(cue.start + 0.3, ground), text };
          colour(false);
          return build();
        };
        layer = inked(inks.ink, inks.paper);
        keyOn[0] = rt.palette.text;
        twin = inked(inks.paper, inks.ink);
        keyOn[1] = rt.palette.text;
        twin.group.visible = false;
        mixed = true; // never rebuilt as light type in a dark halo (the guard below)
      }
      setInkGhost(null);
      layer.group.visible = false;
      // the kick (kickAt) moves the line only where the section is loud enough: its fit and its room count it there
      const span = rt.exitAt + rt.exitDur - rt.showFrom;
      const kick = Array.from({ length: Math.ceil(span / 0.25) + 1 }, (_, k) => rt.showFrom + k * 0.25).some((x) => fxAt(x, treatment.moments ?? [], treatment.arc ?? []).level >= KICK_LEVEL);
      const fit = fitToFrame(layer, kick);
      this.textRoot.add(fit);
      // a held line drifts slowly one way and grows a little, so type never sits frozen (each line its own direction)
      const ang = hash(i, 41) * Math.PI * 2;
      const entry: (typeof this.cueLayers)[number] = { rt, layer, fit, fitScale: fit.scale.x, drift: layer.framed ? undefined : [Math.cos(ang) * 14, Math.sin(ang) * 8], mixed };
      if (twin) {
        const f = fitToFrame(twin, kick);
        this.textRoot.add(f);
        entry.twin = { layer: twin, fit: f, text: keyOn };
      }
      // rebuilt light type in a dark halo (same timing and layout): a line found over a picture once the song is laid out
      entry.remake = () => {
        setKanaScale(KANA_TEMPLATES.has(shot.template) ? design.kanaScale : 1);
        colour(true);
        const l = build();
        setInkGhost(null);
        l.group.visible = false;
        const f = fitToFrame(l, kick);
        const kids = this.textRoot.children;
        const k = kids.indexOf(entry.fit!);
        entry.fit!.removeFromParent();
        this.textRoot.add(f);
        kids.splice(k, 0, kids.pop()!); // drawn in the same order as before
        Object.assign(entry, { layer: l, fit: f, fitScale: f.scale.x, mixed: true });
      };
      this.cueLayers.push(entry);
      if (this.job.treatment.graphics) {
        // where the line sits on screen, so background objects can make room for it
        // beat-cut throws its phrases all over the frame before the line settles: the whole frame is the line's
        const b = settledBox(layer, fit, true);
        if (shot.template === 'beat-cut') this.lyricRects.push({ id: rt.cue.id, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: { x0: 0, y0: 0, x1: W, y1: H }, rest: { x0: 0, y0: 0, x1: W, y1: H } });
        else if (!b.isEmpty()) {
          const px = (x: THREE.Box3): Rect => ({ x0: x.min.x + W / 2, y0: H / 2 - x.max.y, x1: x.max.x + W / 2, y1: H / 2 - x.min.y });
          const places = placesWhileRead(layer, fit, rt.later ?? []);
          // room for the line as it moves, not only where it rests; a line pushed along by later lines gets each place
          // for its own stretch (the change lands with a line coming up, where the props glide anyway), and once its
          // reading time is over (pushed out by the second one) no room at all
          if (places.length < 2) {
            const rest = px(b);
            this.lyricRects.push({ id: rt.cue.id, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: motionPad(rest, kick), rest });
          } else {
            const readTo = layer.readable()[1];
            places.forEach((p, k) => {
              if (p.box.isEmpty()) return;
              const last = k === places.length - 1;
              const rest = px(p.box);
              this.lyricRects.push({ id: rt.cue.id, from: k ? p.from : rt.showFrom, to: last && readTo >= rt.exitAt - 0.01 ? rt.exitAt + rt.exitDur : p.to, rect: motionPad(rest, kick), rest });
            });
          }
        }
      }
      const onBoard = !!treatment.graphics && sectionAt(treatment.graphics, cue1.start).layers.some((l) => l.kind === 'led' && l.calls);
      if (split.calls.length && !onBoard) this.callLayers.push(this.makeCalls(rt, cue1, split.calls, settledBox(layer, fit)));
      if (shot.params['echo'] && !this.ownDrawing(cue.start)) {
        const echo = this.makeEcho(rt);
        if (echo) this.echoes.push(echo);
      }
    });
    for (const { cue } of shouts) {
      const host = this.cueLayers.find((c) => c.rt.showFrom <= cue.start && cue.start < c.rt.exitAt) ?? this.cueLayers.find((c) => c.rt.showFrom > cue.start);
      if (!host) continue;
      const until = Math.max(cue.end, cue.start + 0.8);
      const rt = { ...host.rt, cue, showFrom: cue.start - 0.05, exitAt: until, exitDur: 0.15 };
      const box = host.rt.showFrom <= cue.start ? settledBox(host.layer, host.fit) : new THREE.Box3();
      this.callLayers.push(this.makeCalls(rt, cue, [{ text: cue.text, from: 0, to: 1 }], box, 1.9));
    }
    // each line's colour was read where it first sits, with room made for it alone; as played it may be pushed up by
    // the next lines, and an object with no room for all of them stays behind (チョロイン c003: blue type pushed up over
    // the blue stage photo). Every place a line takes is read again as played; a line whose type falls short over a
    // share of it is rebuilt light in a dark halo (a mean let a mid-tone photo under half the line pass)
    if (treatment.graphics)
      for (const c of this.cueLayers) {
        if (c.mixed || !c.remake) continue;
        // beat-cut takes the whole frame for room (its phrases fly all over before the line settles): its type is read
        // where it settles, so that box is measured, not the frame (a photo anywhere filled a frame-wide share)
        const settled = c.rt.shot.template === 'beat-cut' ? settledBox(c.layer, c.fit, true) : undefined;
        const own = settled
          ? settled.isEmpty()
            ? []
            : [{ from: c.rt.showFrom, to: c.rt.exitAt, rest: { x0: settled.min.x + W / 2, y0: H / 2 - settled.max.y, x1: settled.max.x + W / 2, y1: H / 2 - settled.min.y } }]
          : this.lyricRects.filter((r) => r.id === c.rt.cue.id);
        const places = own
          .flatMap((r) => {
            const box = new THREE.Box3(new THREE.Vector3(r.rest.x0 - W / 2, H / 2 - r.rest.y1, 0), new THREE.Vector3(r.rest.x1 - W / 2, H / 2 - r.rest.y0, 0));
            // read after the 0.4 s objects take to glide clear of a line coming up, and the median over the place's
            // stretch: an object mid-glide as the line comes up or leaves is not where the line is read
            const at = [r.from + 0.5, (r.from + r.to) / 2, r.to - 0.2].filter((x) => x >= r.from && x <= r.to).map((x) => ({ x, poor: this.backdropAt(x, box, true, c.rt.palette.text)?.poor ?? 0 })).sort((p, q) => p.poor - q.poor);
            const mid = at[Math.floor((at.length - 1) / 2)];
            return mid ? [{ from: r.from, to: r.to, rect: r.rest, share: mid.poor, x: mid.x, box }] : [];
          });
        const worst = places.reduce<(typeof places)[number] | undefined>((a, b) => (!a || b.share > a.share ? b : a), undefined);
        if (!worst || worst.share <= POOR_SHARE) continue;
        // only when light type reads better there (guardLine): over a pale photo (チョロイン's bright stage) the line's
        // own dark ink read better than light type on a thin keyline
        const light = this.backdropAt(worst.x, worst.box, true, LIGHT_TYPE)?.poor ?? 1;
        if (!guardLine(worst.share, light, POOR_SHARE)) continue;
        c.guard = { from: worst.from, to: worst.to, rect: worst.rect, share: worst.share, light };
        c.remake();
      }
    // a kinetic cut's character stands on the other side from where its lyric actually landed (a layout with no side
    // setting, couplet, sat its lines on the left over the figure the plan had put there)
    if (treatment.graphics) {
      const secs = treatment.graphics.sections;
      const rects = this.lyricRects.map((r) => ({ from: r.from, to: r.to, x0: r.rest.x0, x1: r.rest.x1 }));
      secs.forEach((sec, i) => {
        for (const l of sec.layers as Layer[]) {
          if (l.kind !== 'kinetic') continue;
          const until = secs[i + 1]?.start ?? Infinity;
          // a board lays its pieces where this cut's lines leave the most room (board.ts)
          if (l.board) {
            const lines = this.lyricRects.map((r) => ({ from: r.from, to: r.to, ...r.rest }));
            l.zone = freeZone(lines, sec.start, until, W, H) ?? null;
            const on = lines.filter((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0);
            if (on.length) l.busy = on.map((r) => [r.x0, r.y0, r.x1, r.y1] as [number, number, number, number]);
          }
          if (!(l.sprite || DIAGRAM_FX.has(l.fx))) {
            // a move with big words of its own (split panels) keeps them out of the lines' way: the room the lines leave
            // ([0, 0] when they leave none; unset when nobody sings over the cut)
            const way = oppositeSide(rects, sec.start, until);
            if (rects.some((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0)) l.room = (way && freeBand(rects, sec.start, until, way)) || [0, 0];
            continue;
          }
          const side = oppositeSide(rects, sec.start, until);
          if (side) Object.assign(l, { side, flip: side === 'left' });
          // the floor plan: the room the lines leave it, where the character is fitted (a 1.7 close-up reached under them)
          const room = side && l.sprite ? freeBand(rects, sec.start, secs[i + 1]?.start ?? Infinity, side) : undefined;
          if (room) l.room = room;
          // a thing never sits on a sung line at full strength: with lines centred, or too little room beside them, it
          // stands behind them faded (sweet timer's carriage, wand and moon sat on its lines; dropping it instead left
          // プラトニックチョロイン a minute without pictures)
          else if (l.sprite && rects.some((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0)) l.under = true;
        }
      });
    }
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

  /** A storyboard frame: the scene under the moments' camera, coming in through the scene before's exit (a flash, a
   * transition from the library), lights out on its last beat when it ends that way, a drop's two white frames. */
  private drawStoryboard(ctx: CanvasRenderingContext2D, scene: Scene, t: number, since: number, beat: number) {
    const song = this.sceneSong();
    const k = this.storyboard.indexOf(scene);
    const prev = this.storyboard[k - 1];
    const joined = !!prev && Math.abs(prev.end - scene.start) < 0.1;
    const lastBeat = [...this.job.beats].reverse().find((b) => b < scene.end - 0.05) ?? scene.end;
    const cam = momentCamera(this.job.treatment.moments ?? [], t);
    const bursts = (s: Scene) => (this.job.treatment.moments ?? []).filter((m) => (m.kind === 'drop' || m.kind === 'finale') && m.at >= s.start - 0.05 && m.at < s.end).map((m) => m.at);
    const frame = (s: Scene) => ({ t, since, beat, hide: this.sceneHide, zoom: cam.zoom, carry: echoCarry(this.storyboard, s, song), bursts: bursts(s), enterFlash: s === scene && joined && prev.exit === 'flash', exitDark: s.exit === 'blackout' && t >= ([...this.job.beats].reverse().find((b) => b < s.end - 0.05) ?? s.end) && t < s.end });
    const into = enterSec(this.storyboard, scene);
    if (into && t < scene.start + into)
      drawTransition(ctx, { kind: prev.exit as TransitionKind }, (t - scene.start) / into, Math.round(scene.start * 10), (c) => void drawScene(c, prev, song, { ...frame(prev), t: Math.min(t, prev.end - 0.001) }), (c) => void drawScene(c, scene, song, frame(scene)));
    else drawScene(ctx, scene, song, { ...frame(scene), exitDark: scene.exit === 'blackout' && t >= lastBeat });
    if (cam.flash) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** The scene playing at t. */
  private sceneAt(t: number): Scene | undefined {
    return this.storyboard.find((s) => t >= s.start && t < s.end);
  }

  private sceneSong(): SceneSong {
    return { beats: this.job.beats, downbeats: this.job.downbeats ?? [], cues: this.job.cues };
  }

  /** A text the next frames leave out (the scene check renders a frame without it). */
  sceneHide?: ShownText;

  /** Every storyboard text measured on finished frames (scene-parts.ts checkScene); `grab` renders and reads one. */
  async sceneQa(grab: (t: number) => Promise<ImageData>): Promise<SceneTextQa[]> {
    const beats = this.job.beats;
    const sinceAt = (t: number) => {
      const b = beats.filter((x) => x <= t).pop();
      return b === undefined ? 10 : t - b;
    };
    const out: SceneTextQa[] = [];
    for (const sc of this.storyboard)
      out.push(...(await checkScene(sc, this.sceneSong(), sinceAt, async (t, hide) => {
        this.sceneHide = hide;
        try {
          return await grab(t);
        } finally {
          this.sceneHide = undefined;
        }
      }, (t) => momentCamera(this.job.treatment.moments ?? [], t).zoom, sc.start + enterSec(this.storyboard, sc))));
    return out;
  }

  metrics(): { cues: CueMetric[]; accents: { cueId: string; time: number }[]; textGuard: { id: string; text: string; from: number; to: number; rect: number[]; share: number; light: number }[] } {
    return {
      // lines rebuilt light in a dark halo over a photo as played: the place that set it off and its share below 3:1
      // (POOR_SHARE and the median are experimental rules, recorded here to be checked against the picture)
      textGuard: this.cueLayers.flatMap(({ rt, guard: g }) => (g ? [{ id: rt.cue.id, text: rt.cue.text, from: +g.from.toFixed(2), to: +g.to.toFixed(2), rect: [g.rect.x0, g.rect.y0, g.rect.x1, g.rect.y1].map(Math.round), share: +g.share.toFixed(2), light: +g.light.toFixed(2) }] : [])),
      cues: this.cueLayers.map(({ rt, layer, fitScale }) => {
        const [from, to] = layer.readable();
        const readableSec = Math.max(0, to - from);
        // reading time: chars / 12 + 1 s , but never more than 90 % of the time the line is sung
        const chars = [...rt.cue.text.replace(/\s/g, '')].length;
        // never more than the line can be up without covering the next one (a rap line sung back to back has only
        // its own slot: asking more flagged every line of a fast song)
        const requiredSec = Math.min(readingSec(rt.cue.text, rt.cue.start, rt.cue.end), 0.95 * (rt.exitAt + rt.exitDur - rt.showFrom));
        const last = rt.cue.charStarts?.length ? rt.cue.charStarts[rt.cue.charStarts.length - 1] : rt.cue.end;
        const lingerSec = rt.later !== undefined && RENDERERS[rt.shot.template]?.persist ? 0 : +(rt.exitAt + rt.exitDur - last).toFixed(2);
        return { id: rt.cue.id, text: rt.cue.text, readableFrom: from, readableTo: to, readableSec, requiredSec, ok: readableSec >= requiredSec - 0.05, lingerSec, lastSung: last, goneAt: last + lingerSec, template: rt.shot.template, fitScale: +(fitScale ?? 1).toFixed(4), plannedEnter: rt.planned?.enter ?? rt.style.enter, plannedReveal: rt.planned?.reveal ?? 'line', enter: rt.style.enter, reveal: rt.style.reveal ?? 'line', together: !!rt.together && rt.style.enter !== 'cut', adjust: rt.adjust ?? [], entranceLost: entranceLost(rt.planned ?? rt.style, rt.style) }; // the same 0.05 s readFix lets pass
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

  /** The kinetic print's two inks when the look under t0..t1 is kinetic type (the line is then built in both). */
  private kineticInks(t0: number, t1: number): { ink: string; paper: string } | undefined {
    const g = this.job.treatment.graphics;
    if (!g) return undefined;
    const ks = g.sections.filter((s, i) => s.start < t1 && (g.sections[i + 1]?.start ?? Infinity) > t0).flatMap((s) => s.layers.filter((l) => l.kind === 'kinetic')) as { ink: string; paper: string }[];
    return ks.length ? { ink: ks[0].ink, paper: ks[0].paper } : undefined;
  }

  /**
   * A kinetic cut draws its words, diagrams and tape wherever its move puts them: behind each line up, the cut's own
   * ground is laid round each letter as a tight keyline, so the move still shows round the line but never
   * through it (第六感: a clock and stacked 未完成 under the sung words). Drawn under the character (kinetic.ts):
   * laid over it, the figure greyed into a box behind the line.
   */
  private veilLines(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    this.veilShape ??= new OffscreenCanvas(W, H).getContext('2d')!;
    const shape = this.veilShape;
    for (const { rt, layer, twin } of this.cueLayers) {
      const end = rt.exitAt + rt.exitDur;
      if (t < rt.showFrom || t > end) continue;
      const inks = this.kineticInks(rt.cue.start, rt.cue.end);
      if (!inks || !twin) continue;
      // which build reads here is decided now, on this frame's ground and move (before any keyline or the character):
      // read off the last frame, a cold still or a cut's first frame took the other ink, and its keyline then held
      // the choice (light type in a dark keyline on cream)
      if (this.lit.t !== t) this.lit = { t, by: new Map() };
      if (!this.lit.by.has(rt.cue.id)) this.lit.by.set(rt.cue.id, this.groundLight(rt.cue.id, t, twin.text));
      const light = this.lit.by.get(rt.cue.id)!;
      // both builds share one layout: the keyline follows whichever was laid out
      const boxes = glyphBoxes(twin.layer.group.visible ? twin.layer.group : layer.group);
      if (!boxes.length) continue;
      // a tight keyline in the type's own ground round each letter's shape, grown by R px: the move is cut cleanly
      // where it crosses a letter (a frosted blur under each letter read as a smudge)
      // twice as wide where neither ink stands off the ground (thin mincho in navy on a mid violet sky, indigo)
      const R = (this.weak.get(rt.cue.id) ?? 21) < 4.5 ? 14 : 7;
      const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x0)) - R));
      const y0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y0)) - R));
      const [w, h] = [Math.min(W, Math.ceil(Math.max(...boxes.map((b) => b.x1)) + R)) - x0, Math.min(H, Math.ceil(Math.max(...boxes.map((b) => b.y1)) + R)) - y0];
      if (w < 2 || h < 2) continue;
      shape.save();
      shape.clearRect(x0, y0, w, h);
      for (const b of boxes) {
        // only what has a letter's own shape gets a keyline: a cut-up glyph, a repeating wave (a held vowel's ～), a
        // mark took a rounded box, a smudge of ground behind it
        if (!b.img || !b.at) continue;
        shape.globalAlpha = b.a;
        // the texture where the letter is, tilted with it (an arc's letters had upright keylines, a blur round them)
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          shape.setTransform(b.at[0], b.at[1], b.at[2], b.at[3], b.at[4] + Math.cos(a) * R, b.at[5] + Math.sin(a) * R);
          shape.drawImage(b.img, 0, 0);
        }
        shape.setTransform(1, 0, 0, 1, 0, 0);
      }
      shape.globalAlpha = 1;
      shape.globalCompositeOperation = 'source-in';
      // the ink the letters are not in (a language's own type ink can put both builds in the same colour)
      const text = twin.text[light ? 0 : 1];
      shape.fillStyle = contrast(text, inks.ink) > contrast(text, inks.paper) ? inks.ink : inks.paper;
      shape.fillRect(x0, y0, w, h);
      shape.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // frame px, under the cut's camera move
      ctx.globalAlpha = alpha * clamp01((t - rt.showFrom) / 0.25) * clamp01((end - t) / 0.25);
      ctx.drawImage(shape.canvas, x0, y0, w, h, x0, y0, w, h);
      ctx.restore();
    }
  }
  private veilShape?: OffscreenCanvasRenderingContext2D;
  /** The build each kinetic line shows this frame, picked by the veil (veilLines). */
  private lit: { t: number; by: Map<string, boolean> } = { t: NaN, by: new Map() };

  /**
   * Whether the line's first build (`texts[0]`) reads better than its twin on the look drawn behind it this frame (read
   * from the frame's own background canvas). By contrast, not by a light/dark split: a mid red paper counted as dark
   * and took the red twin, red type on red (雙截棍).
   */
  private groundLight(id: string, t: number, texts: [string, string]): boolean {
    if (this.lit.t === t && this.lit.by.has(id)) return this.lit.by.get(id)!;
    const rs = this.lyricRects.filter((r) => r.id === id);
    const r = rs.find((x) => t >= x.from && t <= x.to)?.rest ?? rs[0]?.rest;
    if (!this.gfx || !r) return true;
    const [x0, y0] = [Math.max(0, Math.floor(r.x0)), Math.max(0, Math.floor(r.y0))];
    const [w, h] = [Math.min(W, Math.ceil(r.x1)) - x0, Math.min(H, Math.ceil(r.y1)) - y0];
    if (w < 1 || h < 1) return true;
    const d = this.gfx.ctx.getImageData(x0, y0, w, h).data;
    const rgb = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 53, n++) for (let c = 0; c < 3; c++) rgb[c] += d[i + c];
    const mean = `#${rgb.map((v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')).join('')}`;
    const [c0, c1] = [contrast(texts[0], mean), contrast(texts[1], mean)];
    this.weak.set(id, Math.max(c0, c1));
    return c0 >= c1;
  }
  /** The contrast the chosen build has on its ground, per line, as last read (groundLight). */
  private weak = new Map<string, number>();

  /** Whether the section at t is a kinetic-type cut: a flat print, shown without lens effects. */
  private flatPrint(t: number) {
    const g = this.job.treatment.graphics;
    return !!g && sectionAt(g, t).layers.some((l) => l.kind === 'kinetic');
  }

  /** Whether the section at t has the director's own drawing (a 'code' layer), which owns the background. */
  private ownDrawing(t: number) {
    const g = this.job.treatment.graphics;
    // a kinetic cut lays out its own frame too: the language's drop move drew an orange rail across it
    return !!g && sectionAt(g, t).layers.some((l) => l.kind === 'code' || l.kind === 'kinetic');
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

  /**
   * The call track of one line: each call phrase ("幹什麼?") is set small in the accent colour on the side of the frame
   * away from the main line and pops in when it is sung (its share of the line's time), tilted alternately like a
   * crowd shouting back; all of it leaves with the line.
   */
  /** The phone's broken glass (a glass layer in the current look section), its two maps made once per crack. */
  private glassKey = '';
  private glassFlash = 0;
  private updateGlass(t: number) {
    const u = this.finalPass.uniforms;
    const look = this.job.treatment.graphics;
    const l = look ? (sectionAt(look, t).layers.find((x) => x.kind === 'glass') as { crack: number; seed?: number } | undefined) : undefined;
    this.glassFlash = 0;
    if (!l || !(l.crack > 0)) {
      u['uGlass'].value = 0;
      return;
    }
    const key = `${l.crack}|${l.seed ?? 7}`;
    if (key !== this.glassKey) {
      this.glassKey = key;
      const glass = glassOf(W, H, l.crack, l.seed ?? 7)!;
      const shards = new OffscreenCanvas(W, H);
      drawGlassShards(shards.getContext('2d')!, W, H, glass);
      const lines = new OffscreenCanvas(W, H);
      drawGlassCrack(lines.getContext('2d')!, W, H, l.crack, l.seed ?? 7);
      for (const [name, c] of [['tGlass', shards], ['tCracks', lines]] as const) {
        (u[name].value as THREE.Texture | null)?.dispose();
        const tex = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
        tex.flipY = true;
        u[name].value = tex;
      }
    }
    // a fresh break (more cracked than the section before): the glass snaps in with a short white hit
    const secs = look!.sections;
    const k = secs.indexOf(sectionAt(look!, t));
    const before = (secs[k - 1]?.layers.find((x) => x.kind === 'glass') as { crack: number } | undefined)?.crack ?? 0;
    const since = t - secs[k].start;
    const fresh = l.crack > before + 0.05 && since < 0.3;
    u['uGlass'].value = fresh ? clamp01(since / 0.08) : 1;
    this.glassFlash = fresh && since < 0.12 ? 0.35 * (1 - since / 0.12) : 0;
  }

  private makeCalls(rt: CueRuntime, full: TimelineCue, calls: Call[], box: THREE.Box3, scale = 1) {
    const group = new THREE.Group();
    group.renderOrder = 3;
    const dur = full.end - full.start;
    const cx = box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2;
    // the calls sit right over their own line (under it when the frame has no room above): set beside it they ran off
    // the frame's edge and lay over the next line of a couplet (Tokyo Drift's asides over あなたも東京好き)
    const top = box.isEmpty() ? H * 0.2 : box.max.y;
    const bottom = box.isEmpty() ? -H * 0.2 : box.min.y;
    const units: { glyphs: Glyph[]; at: number; x: number; y: number; tilt: number }[] = [];
    const widths: number[] = [];
    for (const c of calls) {
      // a long aside in phrases of a few words, not a word per row (you / see / me / go … ran off the frame's foot)
      const parts = [...c.text].length > 6 ? callPhrases(c.text) : [c.text];
      const from = full.start + c.from * dur;
      const span = Math.max(0.2, (c.to - c.from) * dur);
      parts.forEach((part, k) => {
        // a shout is a sticker: the heaviest face, filled, on a thick dark keyline (the database's idol call words)
        const face = scale > 1 ? { family: rt.fonts.body, weight: 900, size: Math.round(78 * scale) } : { family: rt.fonts.display, weight: 900, size: 78, shadow: true };
        const fill = makeGlyphs(part, face, new THREE.Color(readableOn(rt.palette.accent, rt.palette.background)));
        const keyline = scale > 1 ? makeGlyphs(part, { ...face, outline: Math.round(face.size * 0.16) }, new THREE.Color('#14081A')) : [];
        const glyphs = [...keyline, ...fill];
        const n = units.length;
        placeRow(fill, 0, 0);
        if (keyline.length) placeRow(keyline, 0, 0);
        const g = new THREE.Group();
        glyphs.forEach((gl, j) => {
          // the keyline is drawn first, under the fill (same render order: added first, and further back)
          gl.mesh.position.set(gl.x, gl.y, j < keyline.length ? -1 : 0);
          if (j < keyline.length) gl.mesh.renderOrder = -1;
          g.add(gl.mesh);
        });
        group.add(g);
        units.push({ glyphs, at: from + (k * span) / parts.length - 0.04, x: 0, y: 0, tilt: (n % 2 ? -1 : 1) * 0.07 });
        widths.push(rowWidth(fill) * (scale > 1 ? 1.1 : 1));
      });
    }
    // in rows as wide as the line (at least half the frame), each call beside the last (lineUp), inside the frame
    const room = Math.min(W * 0.9, Math.max(W * 0.5, box.isEmpty() ? 0 : box.max.x - box.min.x));
    const at = lineUp(widths, room, 56);
    const rows = Math.max(1, ...at.map((a) => a.row + 1));
    const above = top + 70 + (rows - 1) * 96 <= H / 2 - 50;
    at.forEach(({ x, row }, j) => {
      const half = widths[j] / 2 + 30;
      units[j].x = Math.min(W / 2 - half, Math.max(-W / 2 + half, cx + x));
      // the first row read first: on top above the line, nearest the line below it
      units[j].y = above ? top + 70 + (rows - 1 - row) * 96 : Math.max(-H / 2 + 60, bottom - 70 - row * 96);
    });
    group.visible = false;
    this.textRoot.add(group);
    return { rt, group, units };
  }

  /** Shows the lines up at t and moves them; strokes follow their glyphs. */
  private updateCues(t: number, fx: FrameFx, hidden?: string) {
    for (const { rt, layer: main, fit, fitScale, drift, twin } of this.cueLayers) {
      if (fit && drift && fitScale !== undefined) {
        const k = clamp01((t - rt.showFrom) / Math.max(0.5, rt.exitAt + rt.exitDur - rt.showFrom));
        const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
        for (const f of twin ? [fit, twin.fit] : [fit]) {
          f.position.set(drift[0] * e, drift[1] * e, 0);
          f.scale.setScalar(fitScale * (1 + 0.012 * e));
        }
      }
      const on = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05 && rt.cue.id !== hidden;
      // the dark-ink build on a light cut, the light-ink twin on a dark one
      const light = !twin || !on || this.groundLight(rt.cue.id, t, twin.text);
      const layer = light ? main : twin!.layer;
      main.group.visible = on && light;
      if (twin) twin.layer.group.visible = on && !light;
      if (on) layer.update(this.koma(t), fx);
    }
    for (const { rt, group, units } of this.callLayers) {
      const k = this.koma(t);
      group.visible = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05 && rt.cue.id !== hidden;
      if (!group.visible) continue;
      const out = clamp01((k - rt.exitAt) / Math.max(0.08, rt.exitDur));
      units.forEach((u, i) => {
        const g = group.children[i] as THREE.Group;
        const p = (k - u.at) / 0.22;
        const s = p <= 0 ? 0 : easeOutBack(p);
        g.position.set(u.x, u.y + (1 - clamp01(p)) * -24, 0);
        g.scale.setScalar(Math.max(0.001, s));
        g.rotation.z = u.tilt;
        for (const gl of u.glyphs) gl.mesh.material.opacity = clamp01(p * 3) * (1 - out);
      });
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
    this.placedProps = [];
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
    // the white rises over the two frames before the cut, holds a frame on it, then falls away in about 0.2 s
    const next = this.job.treatment.shots.find((x) => x.start > shot.start + 0.01);
    const toNext = next ? next.start - t : Infinity;
    if (next?.transitionIn === 'flash' && toNext <= 0.07 && toNext > 0) fx.flash = Math.max(fx.flash, 0.9 * (1 - toNext / 0.07));
    if (flashIn) fx.flash = Math.max(fx.flash, since >= 0 ? (since < 1 / 30 ? 0.95 : 0.95 * Math.exp(-(since - 1 / 30) * 14)) : 0);
    if (flashIn) fx.hit = Math.max(fx.hit, Math.exp(-since * 6) * (since >= 0 ? 1 : 0)); // then glows down
    // glitch: the signal breaks up just before the cut, peaks on it and settles in a quarter second
    const glitchOut = next?.transitionIn === 'glitch' && toNext <= 0.1 && toNext > 0 ? 1 - toNext / 0.1 : 0;
    const glitchIn = shot.transitionIn === 'glitch' && since >= 0 && since < 0.25 ? 1 - since / 0.25 : 0;
    this.finalPass.uniforms['uGlitch'].value = Math.max(glitchOut, glitchIn);
    if (glitchIn > 0.6) fx.shake = Math.max(fx.shake, 0.3);
    // the ending fades to black when the last line is over well before the song ends
    const lastLine = Math.max(0, ...this.job.cues.map((c) => c.end));
    const end = this.job.window.end;
    const fadeLen = Math.min(3, Math.max(0, end - lastLine - 1));
    this.finalPass.uniforms['uFade'].value = fadeLen > 0.8 ? clamp01((t - (end - fadeLen)) / fadeLen) : 0;
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
      if (this.flatPrint(bt)) {
        // the type laid out for this frame first: the veil under it follows where its letters are now
        this.updateCues(t, fx, this.flashes.find((f) => t >= f.at && t < f.at + FLASH_SEC)?.cueId);
        this.textRoot.updateMatrixWorld(true);
        setLineVeil((c, alpha) => this.veilLines(c, t, alpha));
      }
      drawLook(this.gfx.ctx, this.job.treatment.graphics!, this.koma(bt), { since, pulse: Math.exp(-since * 7), index: i }, (asset) => {
        const tex = this.images.get(asset ?? shot.asset ?? '');
        return tex?.image as CanvasImageSource | undefined;
      }, (ls) => this.makeRoom(shot.template === 'title-card' ? ls.filter((l) => !(l.kind === 'app' && l.type === 'lock')) : ls, bt), t); // the code layer moves on real time (bt is stepped by the medium and koma)
      setLineVeil(undefined); // probes draw the look without it
      // (a title card takes the frame alone: a lock screen's big clock under it read as one word with the title)
      const scene = this.sceneAt(t);
      if (scene) this.drawStoryboard(this.gfx.ctx, scene, t, since, i);
      const lang = this.job.treatment.design?.language;
      const drop = scene ? undefined : [...(this.job.treatment.moments ?? [])].reverse().find((m) => (m.kind === 'drop' || m.kind === 'finale') && bt >= m.at);
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
    // a phone's messages are the screen itself: nothing moves them off it or draws bars over it
    const screen = !!(this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language]?.screen);
    // a flat print fills the frame: the letterbox bars read as a mistake over it
    const close = screen || this.sceneAt(t) || this.flatPrint(t) ? 0 : sys && SYSTEMS[sys].letterbox ? 1 : q ? easeOutCubic(clamp01((t - q.start) / 0.5)) : 0;
    for (const bar of this.bars) bar.position.y = bar.userData['side'] * (H / 2 + H * 0.1 - close * H * 0.12);
    this.updateCues(t, fx, flash?.cueId);
    // heavy beats in loud sections: the lyrics jump with the kick (strength from the song's kick analysis)
    const kick = screen ? 0 : this.kickAt(t, mfx.level);
    this.textRoot.scale.setScalar(1 + 0.05 * kick);
    this.textRoot.position.y = 10 * kick;
    // held lyrics never freeze: the whole type layer drifts a few pixels, like a hand-held camera on a slow move
    const drift = screen ? 0 : 1;
    this.textRoot.position.x = drift * (9 * Math.sin(t * 0.31) + 4 * Math.sin(t * 0.83 + 1.7));
    this.textRoot.position.y += drift * 6 * Math.sin(t * 0.27 + 0.9);
    // a scene plays its moments itself (scene.ts momentCamera): the shared push, shake and hit would come on top of it
    const inScene = !!this.sceneAt(t);
    const shake = inScene ? 0 : Math.max(fx.shake, mfx.shake) * 10;
    this.camera.position.set((hash(t * 30) - 0.5) * shake, (hash(t * 30, 1) - 0.5) * shake, 5);
    this.camera.zoom = inScene ? 1 : mfx.zoom;
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
    // a phone's screen does not go black for a drop: its climax is what happens on it (a close-up, the glass breaking)
    const onScreen = !!(d.language && LANGUAGES[d.language]?.screen);
    if (onScreen || this.sceneAt(t)) this.dim.material.opacity = 0;
    if (peak === 'vacuum' && !onScreen && !this.sceneAt(t)) {
      const drop = (this.job.treatment.moments ?? []).find((m) => (m.kind === 'drop' || m.kind === 'finale') && t >= m.at - 0.35 && t < m.at);
      if (drop) this.dim.material.opacity = Math.max(this.dim.material.opacity, 0.96);
    }
    // a scene's stage draws its own dark edges: the shared vignette greyed its white flash
    u['uVignette'].value = this.sceneAt(t) ? 0 : mfx.vignette;
    // a flat print (kinetic type) has no lens: the vignette greyed its paper and inks
    u['uVigBase'].value = this.sceneAt(t) || this.flatPrint(t) ? 0 : 0.55;
    this.updateGlass(t);
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
      // a 'wipe' into a shot opens through the motif's shape; its mask is black, so a design language's paper look
      // (crayon on てぇてぇ: black wedges at every wipe) never uses it
      const iris = !own && shot.transitionIn === 'wipe' && since >= 0 && since < 0.6 ? since / 0.6 : -1;
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
    this.finalPass.uniforms['uFlash'].value = inScene ? 0 : Math.max(fx.flash, this.glassFlash);
    this.finalPass.uniforms['uHit'].value = inScene ? 0 : fx.hit;
    // capped: past this, white lyrics bloom into an unreadable glare
    this.bloom.strength = Math.min(1.2, 0.55 + 0.9 * fx.hit + mfx.bloom);
    // a light field blooms to white: keep only a trace there; on a dark field a flat graphic look still glows around
    // every light object (a cream sprite got a white halo), so it stays low there too
    if (this.job.treatment.graphics) this.bloom.strength = sectionAt(this.job.treatment.graphics, t).text ? 0.05 : Math.min(this.bloom.strength, 0.15);
    // the cream paper bloomed to white and spilled over the printed figure, turning navy pale blue
    if (this.flatPrint(t)) this.bloom.strength = 0;
    // a scene's parts glow on their own (the LED's halo): a bloom over them washed the band's type grey
    if (this.sceneAt(t)) this.bloom.strength = 0;
    this.finalPass.uniforms['uSweep'].value = this.motif ? -1 : sweep;
    // chroma ghosts: the lyrics as they were 1/30 and 1/15 s ago, offset and tinted
    const chroma = this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language].chroma;
    if (chroma && this.ghostPass) {
      const offset = this.textRoot.position.x;
      // a line jumping (pushed up by the next one landing) leaves no ghost: a copy a whole line away is a second line
      // over the new one (チョロイン c061 at 163.4 s), not a misregistered plate; small motion keeps its trail
      const pose = () => this.cueLayers.map(({ layer }) => [layer.group.position.x, layer.group.position.y, layer.group.scale.x]);
      const at = pose();
      ([[2 / 30, -3.4, this.ghostB!], [1 / 30, 3.2, this.ghostA!]] as const).forEach(([lag, dx, target]) => {
        this.updateCues(t - lag, { flash: 0, hit: 0, shake: 0 }, flash?.cueId);
        pose().forEach(([x, y, s], i) => {
          const [x1, y1, s1] = at[i];
          if (Math.hypot(x - x1, y - y1) > 24 || Math.abs(s - s1) > 0.03 * Math.max(s, s1)) this.cueLayers[i].layer.group.visible = false;
        });
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
    if (!strength || level < KICK_LEVEL) return 0;
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

  /** When a shot is clear of lyrics: after the last line that overlaps it has held and left the screen (+0.3 s). */
  private clearOfLines(shot: Shot): number {
    let t = shot.start;
    // a line holds HOLD_SEC after it is sung before it exits: the title waits until it has gone
    const gone = (c: { end: number }) => c.end + HOLD_SEC + EXIT_SEC + 0.3;
    for (const c of this.job.cues) if (c.start < shot.end && gone(c) > shot.start) t = Math.max(t, gone(c));
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
  private roomEvents?: { n: number; ev: number[] };
  /** Every time the frame's set of objects or lines changes, sorted (see makeRoom). */
  private roomEventsFor(): number[] {
    if (this.roomEvents?.n === this.lyricRects.length) return this.roomEvents.ev;
    const look = this.job.treatment.graphics;
    const all = [...this.lyricRects.flatMap((r) => [r.from, r.to]), ...(look?.sections.map((s) => s.start) ?? []), ...storyEvents(look?.story ?? [])];
    const ev = [...new Set(all.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
    this.roomEvents = { n: this.lyricRects.length, ev };
    return ev;
  }

  private makeRoom(all: Layer[], t: number): Layer[] {
    const GLIDE = 0.4;
    // a bracket or viewfinder frame marks where the words are: it fades in with the words and out when none are up, so
    // an intro or an interlude never frames empty space (a section running on past its first line kept it there)
    // (per line, from its first box to its last: a line pushed along has one box per place and must not dip between them)
    const spans = new Map<string, { from: number; to: number }>();
    this.lyricRects.forEach((r, i) => {
      const k = r.id ?? `#${i}`;
      const s = spans.get(k);
      spans.set(k, s ? { from: Math.min(s.from, r.from), to: Math.max(s.to, r.to) } : { from: r.from, to: r.to });
    });
    const words = Math.max(0, ...[...spans.values()].map((r) => Math.min(clamp01((t - r.from + 0.15) / 0.3), clamp01((r.to - t) / 0.3))));
    const ls = all.map((l) => (l.kind === 'frame' && (l.type === 'brackets' || l.type === 'viewfinder') ? ({ ...l, opacity: (l.opacity ?? 1) * words } as Layer) : l));
    const at = (x: number) => this.lyricRects.filter((r) => x >= r.from && x <= r.to);
    const union = (rs: Rect[]) => (rs.length ? rs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })) : undefined);
    // room for the lines as they move where the frame has it; an object with nowhere to go clear of that makes room
    // for the lines at rest instead (as it did before the motion room; the bigger box left it over the words)
    const placeAt = (layers0: Layer[], x: number) => {
      const lines = at(x);
      const moving = union(lines.map((r) => r.rect));
      const rest = union(lines.map((r) => r.rest));
      if (!moving || !rest) return layers0;
      // a card about a line up (its text in the line: 「嘘つき！」 on c062) is key content: it stays before the others
      const sung = lines.map((r) => bare(this.cueLayers.find((c) => c.rt.cue.id === r.id)?.rt.cue.text ?? '')).join('|');
      const layers = layers0.map((l) => (l.kind === 'card' && !l.key && bare(l.text) && sung.includes(bare(l.text)) ? ({ ...l, key: true } as Layer) : l));
      const wide = avoidAll(layers, moving);
      const tight = avoidAll(layers, rest);
      return wide.map((l, i) => {
        const r = l.kind === 'code' ? undefined : layerRect(l);
        return r && r.x0 < moving.x1 && moving.x0 < r.x1 && r.y0 < moving.y1 && moving.y0 < r.y1 ? tight[i] : l;
      });
    };
    const placed = (x: number) => placeAt(ls, x);
    // the latest change of the visible set before t: glide from the placement just before it
    const edges = this.lyricRects.flatMap((r) => [r.from, r.to]).filter((x) => x <= t && x > t - GLIDE);
    const now = placed(t);
    const e = edges.length ? Math.max(...edges) : 0;
    const before = edges.length ? placed(e - 0.001) : now;
    const blended = edges.length ? now.map((l, i) => blendLayer(before[i], l, easeOutCubic((t - e) / GLIDE))) : now;
    const look = this.job.treatment.graphics;
    const sec = look ? sectionAt(look, this.koma(t)) : undefined;
    const current = !!sec && sec.layers.length <= all.length && sec.layers.every((l, i) => all[i] === l);
    const n = look && sec ? look.sections.indexOf(sec) : -1;
    // every move making room makes, and every object it sends away (avoid sets one with no room anywhere to 0), glides
    // and fades over GLIDE: the placement is the mean over the frames of the last GLIDE s, each placed with the layers
    // and lines of its own time — whatever made the change (a line, a card landing, a hero state), nothing jumps
    const storyFrom = sec && current ? sec.layers.length : all.length;
    const idsOf = (layers: Layer[], s: number, from: number) => layers.map((l, i) => (i >= from ? ((l as { ref?: string }).ref ?? `story#${i - from}`) : `${s}#${i}`));
    const keys = (layers: Layer[], s: number, from: number) => new Map(idsOf(layers, s, from).map((k, i) => [k, i]));
    const own = sec && current ? n : n - 1;
    // decided once per stretch between changes (a line, a section, a card landing, a hero turn, a prop coming or going):
    // placed per frame, a falling, swaying card found another spot every few frames and the pile hopped about
    // (チョロイン 167–169 s). The stretch is placed as it is 0.9 s in (a card that just landed has settled), or just
    // before the next change if that comes first
    const ev = this.roomEventsFor();
    const decide = (x: number) => {
      const k = ev.findIndex((e) => e > x);
      const e = k < 0 ? ev[ev.length - 1] : k === 0 ? undefined : ev[k - 1];
      const next = k < 0 ? Infinity : ev[k];
      return e === undefined ? x : Math.min(e + SETTLE_SEC, next - 0.001);
    };
    const memo = new Map<number, { plan: Layer[]; placed: Layer[]; keys: Map<string, number> }>();
    // the window looks back twice GLIDE: a long move fades out and in over GLIDE each (see smoothPlacement); the rest
    // glides over the latest GLIDE
    const STEPS = 25;
    const LOOK = 2 * STEPS - 1;
    // a prop flying along its path is placed frame by frame: room made where it was at one time of the stretch is not
    // where it is later (a feather of 春泥棒 grazed c008)
    const flying = (l: Layer) => ((l as { ref?: string }).ref ?? '').startsWith('fly#');
    const sample = (j: number, each: boolean) => {
      const x = t - (GLIDE * j) / (STEPS - 1);
      const d = each ? x : decide(x);
      const hit = memo.get(d);
      if (hit) return hit;
      const sx = look && sec && current ? sectionAt(look, this.koma(d)) : undefined;
      const plan = sx && look ? [...sx.layers, ...(storyLayers(look.story ?? [], this.koma(d)) as Layer[])] : ls;
      const f = { plan, placed: placeAt(plan, d), keys: sx && look ? keys(plan, look.sections.indexOf(sx), sx.layers.length) : keys(ls, own, storyFrom) };
      memo.set(d, f);
      return f;
    };
    const frames = Array.from({ length: LOOK }, (_, j) => sample(j, false));
    const each = ls.some(flying) ? Array.from({ length: STEPS }, (_, j) => sample(j, true)) : frames;
    const ids = idsOf(ls, own, storyFrom);
    const out = ls.map((l, i) => {
      if (l.kind === 'code') return blended[i];
      return smoothPlacement(l, (flying(l) ? each : frames).map((f) => {
        const j = f.keys.get(ids[i]);
        return j === undefined ? undefined : { plan: f.plan[j], placed: f.placed[j] };
      }), STEPS);
    });
    this.placedProps.push(...(sec && current ? measurable(out, ls, this.koma(t) - sec.start, 'section', n, sec.layers.length) : measurable(out, ls, Infinity, 'prev', n - 1)));
    // (a line shows 0.05 s before its room is made: those frames are the start of the glide)
    this.propsGliding = this.lyricRects.some((r) => [r.from, r.to].some((x) => x <= t + 0.05 && x > t - GLIDE));
    return out;
  }

  /**
   * QA after a render: where each line actually is while it plays (the type layer's kick and sway, its own drift,
   * wave and beat pulses), at its beats and across its readable time, against the story props placed in that frame,
   * the safe area and the frame edge. The avoidance boxes are measured at rest; this is what checks the motion.
   */
  async motionQa(everyFrame: string[] = []): Promise<MotionCheck[]> {
    const depth = (a: Rect, p: Rect) => Math.max(0, Math.min(Math.min(a.x1, p.x1) - Math.max(a.x0, p.x0), Math.min(a.y1, p.y1) - Math.max(a.y0, p.y0)));
    const out: MotionCheck[] = [];
    for (const { rt, layer } of this.cueLayers) {
      const [from, to0] = layer.readable();
      const to = Number.isFinite(to0) ? to0 : from + 1;
      if (!(to > from)) continue;
      const boxes = this.lyricRects.filter((r) => r.id === rt.cue.id);
      // sampled (beats + five points) to find problems; lines named in everyFrame are checked on every 60 fps frame
      const times = everyFrame.includes(rt.cue.id)
        ? Array.from({ length: Math.floor((to - from) * 60) + 1 }, (_, k) => from + k / 60)
        : [...new Set([...rt.accentTimes.filter((a) => a >= from && a <= to), ...[0.1, 0.3, 0.5, 0.7, 0.9].map((k) => from + (to - from) * k)])];
      const none = { t: 0, px: 0 };
      const worst: MotionCheck = { id: rt.cue.id, text: rt.cue.text, template: rt.shot.template, motion: none, atRest: none, steppedBack: none, gliding: none, decor: none, cards: none, offSafe: none, offFrame: none };
      const keep = <K extends 'motion' | 'atRest' | 'steppedBack' | 'gliding' | 'decor' | 'cards' | 'offSafe' | 'offFrame'>(k: K, px: number, hit: MotionCheck[K]) => {
        if (px > worst[k].px) worst[k] = hit;
      };
      const hit = (t: number, px: number, p: Measured): Hit => ({ t, px, prop: p.ref, opacity: p.opacity, layer: p.layer });
      for (const t of times) {
        await this.renderAt(t);
        if (!layer.group.visible) continue;
        this.textRoot.updateMatrixWorld(true);
        const b = shownBox(layer, true);
        if (b.isEmpty()) continue;
        const r = { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y };
        for (const p of this.placedProps) {
          const px = depth(r, p.r);
          if (!px) continue;
          // gliding: the prop is still on its way out (0.4 s, by design); stepped back: it found no room and faded
          // behind the line (by design, but a half-transparent prop behind the words is still counted); at rest: the
          // measured box already meets it; else the playing line's motion carried it onto a prop that had cleared its box
          const rest = (boxes.find((x) => t >= x.from && t <= x.to) ?? boxes[0])?.rest;
          const cause: OverlapCause = this.propsGliding ? 'gliding' : p.faded ? 'steppedBack' : rest && depth(rest, p.r) > 0 ? 'atRest' : 'motion';
          if (p.group === 'decor') keep('decor', px, { ...hit(t, px, p), cause });
          else keep(cause, px, hit(t, px, p));
        }
        // cards over each other: measured apart from the lyrics (c061: two half-transparent cards, texts through each other)
        const cards = this.placedProps.filter((p) => p.group === 'card');
        cards.forEach((a, i) =>
          cards.slice(i + 1).forEach((b) => {
            const px = depth(a.r, b.r);
            keep('cards', px, { t, px, a: a.ref, b: b.ref, opacity: [a.opacity, b.opacity] });
          }),
        );
        const off = Math.max(0, -r.x0, r.x1 - W, -r.y0, r.y1 - H);
        keep('offFrame', off, { t, px: off });
        const safe = Math.max(0, 48 - r.x0, r.x1 - (W - 48), 40 - r.y0, r.y1 - (H - 40));
        keep('offSafe', safe, { t, px: safe });
      }
      out.push(worst);
    }
    return out;
  }

  /** The value of a placement param (align / position) that puts the lyrics over the calmest third of the frame. */
  private calmSide(shot: Shot, key: string): string {
    const values = ((TEMPLATES[shot.template]?.params[key] as { values?: string[] } | undefined)?.values ?? []).filter((v) => v !== 'auto');
    const side = this.calmestThird((shot.start + shot.end) / 2, shot.asset);
    return [side, side === 'center' ? '' : 'center', values[0]].find((v) => v && values.includes(v)) ?? values[0] ?? 'center';
  }

  /** Which third of the frame (left / center / right) has the least detail in the background at t. */
  private calmestThird(t: number, asset?: string): 'left' | 'center' | 'right' {
    this.probe ??= Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
    const ctx = this.probe;
    ctx.clearRect(0, 0, W, H);
    const img = this.images.get(asset ?? '')?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (this.job.treatment.graphics) {
      const pf = globalThis as { __vjProbe?: boolean };
      pf.__vjProbe = true; // a probe, not a frame (see backdropAt)
      try {
        drawLook(ctx, this.job.treatment.graphics, t, { since: 1, pulse: 0, index: 0 }, (a) => this.images.get(a ?? asset ?? '')?.image as CanvasImageSource | undefined);
      } finally {
        pf.__vjProbe = false;
      }
    } else if (img) {
      const s = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    } else return 'center';
    const d = ctx.getImageData(0, 0, W, H).data;
    const L = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    };
    // detail = mean luminance change between neighbouring samples, over the band the lyrics use (middle 70 %)
    const busy = [0, 0, 0];
    const n = [0, 0, 0];
    for (let y = Math.round(H * 0.15); y < H * 0.85 - 6; y += 6)
      for (let x = 0; x < W - 6; x += 6) {
        const b = Math.min(2, Math.floor((x / W) * 3));
        busy[b] += Math.abs(L(x + 6, y) - L(x, y)) + Math.abs(L(x, y + 6) - L(x, y));
        n[b]++;
      }
    const m = busy.map((v, i) => v / Math.max(1, n[i]));
    // the centre wins unless a side is clearly calmer (a centred line reads best)
    const k = m[1] <= Math.min(m[0], m[2]) * 1.15 ? 1 : m[0] < m[2] ? 0 : 2;
    return (['left', 'center', 'right'] as const)[k];
  }

  /**
   * Mean colour of the look behind `box` (frame px, centre origin; default the central lyric band) at t. `asPlayed`
   * places the objects as the frame does (room for every line up, eased), not with room for this box alone; `text`
   * also gives `poor`, the share of the box where that colour reads below 3:1.
   */
  private backdropAt(t: number, box?: THREE.Box3, asPlayed = false, text?: string): { mean: string; mixed: boolean; poor: number } | undefined {
    if (!this.job.treatment.graphics) return undefined;
    this.probe ??= Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
    const shot = this.shotAt(t).shot;
    const lyric: Rect | undefined = box && !box.isEmpty() ? { x0: box.min.x + W / 2, y0: H / 2 - box.max.y, x1: box.max.x + W / 2, y1: H / 2 - box.min.y } : undefined;
    // a probe, not a frame: the sprite tracking (--track) must not log it (its boxes mixed into the real frames read
    // as props teleporting between two samples a frame apart)
    const pf = globalThis as { __vjProbe?: boolean };
    pf.__vjProbe = true;
    const [kept, gliding] = [this.placedProps.length, this.propsGliding];
    let placed: Layer[] = [];
    try {
      drawLook(this.probe, this.job.treatment.graphics, t, { since: 1, pulse: 0, index: 0 }, (asset) => this.images.get(asset ?? shot.asset ?? '')?.image as CanvasImageSource | undefined, (ls) => (asPlayed ? (placed = this.makeRoom(ls, t)) : lyric ? avoidAll(ls, lyric) : ls));
    } finally {
      pf.__vjProbe = false;
      // makeRoom logs what it placed for the motion QA: a probe is not a frame
      this.placedProps.length = kept;
      this.propsGliding = gliding;
    }
    const [x0, y0, x1, y1] = box
      ? [box.min.x + W / 2, H / 2 - box.max.y, box.max.x + W / 2, H / 2 - box.min.y].map((v, i) => Math.max(0, Math.min(i % 2 ? H : W, v)))
      : [W * 0.15, H * 0.28, W * 0.85, H * 0.72];
    const img = this.probe.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    const d = img.data;
    let r = 0, g = 0, b = 0, n = 0, dark = 0, light = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (l < 0.3) dark++;
      else if (l > 0.65) light++;
    }
    const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    // only pictures behind the words count (as placed): photos in every mode (a band or full photo makes no room, so
    // it is under the words by design: Utsusemi's band photo under 「交差する道」) and a key hero (see poorShare)
    const photos = placed.flatMap((l) =>
      (l.opacity ?? 1) <= 0.05 ? [] : l.kind === 'photo' ? [photoBox(l)] : l.kind === 'sprite' && l.key && layerRect(l) ? [layerRect(l)!] : [],
    );
    const poor = text ? poorShare(img, Math.floor(x0), Math.floor(y0), text, photos) : 0;
    // mixed: a sizeable share of both dark and light under the line — no single type colour reads everywhere
    return { mean: `#${hx(r)}${hx(g)}${hx(b)}`, mixed: dark / n > 0.06 && light / n > 0.06, poor };
  }

  /** A sprite's mean colour over its opaque pixels, as #rrggbb. */
  private spriteTone(asset: string): string | undefined {
    const img = this.images.get(asset)?.image as CanvasImageSource | undefined;
    if (!img) return undefined;
    const c = new OffscreenCanvas(32, 32).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, 32, 32);
    const d = c.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return undefined;
    const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hx(r)}${hx(g)}${hx(b)}`;
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
