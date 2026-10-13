// Graphic component library: program-drawn layers a designer builds a VJ frame from — flat fields, paper, patterns,
// framed photos, frames, rings, sparkles, sunbursts, tape bands, shapes. The database's designer VJs are mostly
// these over flat colour, not a full-bleed picture; a song's look is a stack of them per section, drawn in Canvas2D
// every frame (deterministic in t) and composited as the background layer under the lyrics.
import { drawStory, StoryItem, StoryLayer, storyLayers, storyRect } from './story';
import { revealMask, SectionTransition, transitionAccent, TRANSITION_SEC } from './transition';
import { drawWarped, WarpZone } from './warp';

export type Rgb = string;

/** Drifting particles: petals, leaves, snow, stars, hearts, bubbles or a character, in depth layers. */
export interface ParticleLayer {
  kind: 'particles';
  shape?: 'dot' | 'petal' | 'leaf' | 'snow' | 'star' | 'spark' | 'heart' | 'bubble' | 'char';
  /** For shape 'char': the character(s) to drift (one picked per particle). */
  char?: string;
  color?: Rgb | Rgb[];
  count?: number;
  /** Base size in px (near particles are drawn larger). */
  size?: number;
  /** Fall speed in px/s (near particles move faster). */
  speed?: number;
  dir?: 'down' | 'up' | 'left' | 'right';
  /** Side-to-side sway 0..1. */
  sway?: number;
  opacity?: number;
  seed?: number;
}

export interface Beat {
  /** Seconds since the last beat and decaying hit (1 → 0). */
  since: number;
  pulse: number;
  /** Index of the last beat (−1 before the first). */
  index: number;
}

interface Base {
  /** 0..1, default 1. */
  opacity?: number;
  /** How the layer lands on the ones below: 'multiply' overprints like translucent ink (risograph). */
  blend?: 'multiply' | 'screen' | 'lighter';
  /**
   * Copies drawn first, offset and in another colour: a misregistered plate (1–4 px, an ink colour) or a hard
   * offset shadow (8–14 px, near-black). Only for layers with a `color`.
   */
  ghosts?: { dx: number; dy: number; color: Rgb }[];
  /** Beat pulse amount (scale or brightness kick), default 0. */
  pulse?: number;
  /** Part of the ground (a planet's curve rising from the bottom): never moved or shrunk to make room for the lyrics. */
  fixed?: boolean;
}

export type Layer = Base &
  (
    | { kind: 'fill'; color: Rgb; to?: Rgb; angle?: number }
    | { kind: 'paper'; color: Rgb; grain?: number }
    | { kind: 'pattern'; type: 'grid' | 'dots' | 'stripes' | 'gingham' | 'checker' | 'halftone' | 'waves' | 'genkou' | 'shibori' | 'itajime'; color: Rgb; scale?: number; angle?: number; scroll?: number }
    | { kind: 'photo'; mode: 'full' | 'inset' | 'polaroid' | 'band' | 'circle'; asset?: string; x?: number; y?: number; w?: number; h?: number; tilt?: number; tint?: Rgb; frame?: Rgb; drift?: number }
    | { kind: 'frame'; type: 'border' | 'filmstrip' | 'viewfinder' | 'brackets' | 'window' | 'ticket' | 'deco'; color: Rgb; inset?: number; label?: string }
    | { kind: 'rings'; x?: number; y?: number; count?: number; color: Rgb; radius?: number; spin?: number; dashed?: boolean }
    | { kind: 'sparkles'; count?: number; color: Rgb; size?: number; seed?: number }
    | ParticleLayer
    | { kind: 'panels'; count?: number; layout?: 'vertical' | 'horizontal' | 'diagonal' | 'grid'; assets?: string[]; tints?: Rgb[]; line?: Rgb; gap?: number }
    | { kind: 'sunburst'; x?: number; y?: number; color: Rgb; rays?: number; spin?: number }
    | { kind: 'band'; type: 'tape' | 'solid' | 'marquee'; color: Rgb; color2?: Rgb; y?: number; angle?: number; height?: number; scroll?: number }
    | { kind: 'shapes'; type: 'circle' | 'diamond' | 'triangle' | 'star' | 'heart' | 'cross'; count?: number; color: Rgb; colors?: Rgb[]; size?: number; drift?: number; seed?: number; outline?: boolean }
    | { kind: 'blob'; x?: number; y?: number; r?: number; color: Rgb; breathe?: number }
    | { kind: 'bands'; colors: Rgb[]; from?: number; to?: number }
    | { kind: 'stamp'; text: string; color: Rgb; x?: number; y?: number; size?: number; tilt?: number; font?: string }
    | { kind: 'seal'; text: string; color: Rgb; x?: number; y?: number; size?: number; font?: string }
    | { kind: 'numeral'; text: string; color: Rgb; x?: number; y?: number; size?: number; font?: string; weight?: number }
    | { kind: 'scanlines'; color?: Rgb; gap?: number; vignette?: number }
    | { kind: 'chargrid'; color: Rgb; cols?: number; chars?: string; field?: 'noise' | 'radial' | 'rain'; speed?: number }
    | { kind: 'mist'; color: Rgb; count?: number; y?: number; drift?: number; soft?: boolean }
    | { kind: 'speedlines'; color: Rgb; count?: number; inner?: number }
    | { kind: 'swissgrid'; color: Rgb; cols?: number; bars?: Rgb; signal?: Rgb; seed?: number }
    | { kind: 'skyline'; type?: 'city' | 'hills' | 'trees' | 'peaks'; colors: Rgb[]; height?: number; seed?: number; drift?: number; windows?: Rgb; wash?: boolean }
    | { kind: 'mosaic'; type?: 'random' | 'rose' | 'lancet'; colors: Rgb[]; color?: Rgb; cells?: number; seed?: number; x?: number; y?: number; r?: number }
    | { kind: 'botanical'; type?: 'fern' | 'leaf' | 'flower' | 'feather' | 'mixed'; color: Rgb; count?: number; size?: number; seed?: number }
    | { kind: 'ink'; color: Rgb; colors?: Rgb[]; count?: number; size?: number; seed?: number }
    | UiLayer
    // a song's own drawing, written by the director (scripts/lyric-vj/codelayer.mts); `lyric` is filled at draw time
    | { kind: 'code'; src: string; lyric?: Rect; lyricWeight?: number; cuts?: number[] }
    // story components' per-frame layers (story.ts), never written by the director directly
    | StoryLayer
  );

/**
 * One computer window (terminal, log, code, file list, error dialog, progress, loading): stack a few for a desktop.
 * x/y centre in −1..1, w/h fractions of the frame; `lines` are the song's own words for its content; it pops in
 * `delay` s after the section starts.
 */
export type UiLayer = { kind: 'ui'; type: 'terminal' | 'log' | 'code' | 'files' | 'error' | 'progress' | 'loading' | 'cursor'; color: Rgb; alert?: Rgb; skin?: 'term' | 'mac' | 'win'; cascade?: number; x?: number; y?: number; w?: number; h?: number; title?: string; lines?: string[]; delay?: number };

export interface LookSection {
  start: number;
  layers: Layer[];
  /** Lyric colour and accent over this section's graphics (a light field needs dark type). */
  text?: Rgb;
  accent?: Rgb;
  /** How this section comes in over the one before (transition.ts); none is a cut. */
  transition?: SectionTransition;
}

/** A song's graphic look: layer stacks per section (cut on the section start). */
export interface GraphicsLook {
  sections: LookSection[];
  /** Story components across the whole song (story.ts), drawn over each section's layers. */
  story?: StoryItem[];
  /** The props the story uses, for props.mts to draw (id, English description, hero). */
  storyProps?: { id: string; what: string; hero: boolean }[];
}

export const LAYER_KINDS = ['ui', 'fill', 'paper', 'pattern', 'photo', 'frame', 'rings', 'sparkles', 'sunburst', 'band', 'shapes', 'blob', 'bands', 'stamp', 'seal', 'numeral', 'scanlines', 'chargrid', 'mist', 'speedlines', 'swissgrid', 'skyline', 'mosaic', 'ink', 'botanical', 'particles', 'panels'] as const;

const W = 1920;
const H = 1080;

/** Deterministic noise in [0, 1). */
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The section's layers at t. */
export function sectionAt(look: GraphicsLook, t: number): LookSection {
  let cur = look.sections[0];
  for (const s of look.sections) if (s.start <= t) cur = s;
  return cur;
}

/**
 * Draws the look at t; `image(asset)` returns a loaded picture for photo layers. `codeTime` (real time) drives a code
 * layer when t is held to a language's drawings per second: stepping a camera move at 12 fps read as objects
 * teleporting.
 */
export function drawLook(ctx: CanvasRenderingContext2D, look: GraphicsLook, t: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined, adjust: (ls: Layer[]) => Layer[] = (ls) => ls, codeTime = t) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const sec = sectionAt(look, t);
  // the story's layers make room for the lyrics together with the section's, but are drawn over any transition
  const story = storyLayers(look.story ?? [], t) as Layer[];
  const all = adjust([...sec.layers, ...story]);
  const own = all.slice(0, sec.layers.length);
  const tr = sec.transition;
  const i = look.sections.indexOf(sec);
  const prev = i > 0 ? look.sections[i - 1] : undefined;
  const dur = tr ? (tr.dur ?? TRANSITION_SEC[tr.kind]) : 0;
  const k = tr && prev && !(globalThis as { __vjProbe?: boolean }).__vjProbe ? (t - sec.start) / dur : 1;
  if (k < 1 && tr && prev) {
    // the section before stays underneath; the new one is drawn apart and shows only inside the growing shape
    drawLayers(ctx, adjust(prev.layers), prev, t, beat, image, codeTime);
    const off = transitionCanvas();
    const oc = off.getContext('2d')! as unknown as CanvasRenderingContext2D;
    oc.save();
    oc.clearRect(0, 0, W, H);
    drawLayers(oc, own, sec, t, beat, image, codeTime);
    oc.globalCompositeOperation = 'destination-in';
    oc.fillStyle = '#000';
    revealMask(oc, tr.kind, k, W, H, Math.round(sec.start * 10));
    oc.restore();
    if (tr.color) {
      // a band of colour leads the edge: the same shape a little further on, under the new section
      ctx.save();
      ctx.fillStyle = tr.color;
      revealMask(ctx, tr.kind, Math.min(1, k * 1.15 + 0.05), W, H, Math.round(sec.start * 10));
      ctx.restore();
    }
    ctx.drawImage(off, 0, 0);
    transitionAccent(ctx, tr.kind, k, W, H);
  } else drawLayers(ctx, own, sec, t, beat, image, codeTime);
  drawLayers(ctx, all.slice(sec.layers.length), sec, t, beat, image, codeTime);
  ctx.restore();
}

let transitionOff: OffscreenCanvas | undefined;
const transitionCanvas = () => (transitionOff ??= new OffscreenCanvas(W, H));

function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], sec: LookSection, t: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined, codeTime: number) {
  for (const l of layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    if (l.blend) ctx.globalCompositeOperation = l.blend;
    for (const g of 'color' in l ? (l.ghosts ?? []) : []) {
      ctx.save();
      ctx.translate(g.dx, g.dy);
      draw(ctx, { ...l, color: g.color } as Layer, t, t - sec.start, beat, image);
      ctx.restore();
    }
    // one layer the director got wrong (a missing colour) draws nothing instead of stopping the whole render
    try {
      if (l.kind === 'code') drawCode(ctx, l, codeTime, codeTime - sec.start, beat, image);
      else draw(ctx, l, t, t - sec.start, beat, image);
    } catch (e) {
      report(`${l.kind}: ${(e as Error).message}`);
    }
    ctx.restore();
  }
}

/** The camera shot a code layer is in: shots are cut at `cuts` (song seconds), synced with the lyric layouts. */
export interface CodeCam { index: number; start: number; end: number; progress: number; count: number }
/** f.img(id): a sprite from the song's library (designed by the image model, keyed), null when it is missing. */
type CodeDraw = (ctx: CanvasRenderingContext2D, f: { w: number; h: number; t: number; age: number; beat: Beat; lyric: Rect | null; lyricWeight: number; cam: CodeCam; hash: typeof hash; img: (id: string) => CanvasImageSource | null; scene: (id: string) => CanvasImageSource | null; particles: (opts: Omit<ParticleLayer, 'kind'>) => void; warp: (img: CanvasImageSource | null, x: number, y: number, w: number, h: number, zones: WarpZone[], seed?: number) => void; cache: Record<string, unknown> }) => void;

/** The shot at t among cut times (sorted); before the first cut is shot 0. */
export function camAt(cuts: number[], t: number, end = Infinity): CodeCam {
  let index = 0;
  while (index < cuts.length && cuts[index] <= t) index++;
  const start = index ? cuts[index - 1] : 0;
  const stop = index < cuts.length ? cuts[index] : end;
  const span = Number.isFinite(stop) ? stop - start : 1;
  return { index, start, end: stop, progress: Math.min(1, Math.max(0, (t - start) / Math.max(0.001, span))), count: cuts.length + 1 };
}
const compiled = new Map<string, CodeDraw>();
/** Per drawing, kept across frames: textures and noise it builds once (deterministic content, so frame order is free). */
const caches = new Map<string, Record<string, unknown>>();
const reported = new Set<string>();
/** Reports a code layer's failure or slowness once per message (the render's console, read by codelayer.mts). */
const report = (msg: string) => reported.has(msg) || (reported.add(msg), console.error(`code layer: ${msg}`));

// lyric cover: a sprite's opaque cells (24 × 24, measured once per picture) drawn inside the lyric box
const COVER_GRID = 24;
const masks = new Map<CanvasImageSource, Uint8Array>();
function maskOf(img: CanvasImageSource & { width: number; height: number }) {
  let m = masks.get(img);
  if (m) return m;
  m = new Uint8Array(COVER_GRID * COVER_GRID);
  try {
    const c = new OffscreenCanvas(COVER_GRID, COVER_GRID);
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, COVER_GRID, COVER_GRID);
    const d = x.getImageData(0, 0, COVER_GRID, COVER_GRID).data;
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  } catch {
    m.fill(1);
  }
  masks.set(img, m);
  return m;
}
/** Shares of the lyric box hidden by one sprite draw, and of the sprite inside the box (dest box in its transform). */
export function coverOf(img: CanvasImageSource & { width: number; height: number }, m: DOMMatrix, dx: number, dy: number, dw: number, dh: number, r: Rect) {
  const mask = maskOf(img);
  const cell = (Math.abs(m.a * m.d - m.b * m.c) * dw * dh) / (COVER_GRID * COVER_GRID);
  let hidden = 0;
  let solid = 0;
  for (let j = 0; j < COVER_GRID; j++)
    for (let i = 0; i < COVER_GRID; i++) {
      if (!mask[j * COVER_GRID + i]) continue;
      solid += cell;
      const lx = dx + ((i + 0.5) / COVER_GRID) * dw;
      const ly = dy + ((j + 0.5) / COVER_GRID) * dh;
      const x = m.a * lx + m.c * ly + m.e;
      const y = m.b * lx + m.d * ly + m.f;
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) hidden += cell;
    }
  return [hidden / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0)), hidden / Math.max(1, solid)] as const;
}
const covered = new Set<string>();
// which sprite a picture is: kept across frames (a drawing caches what f.img returned)
const ids = new Map<CanvasImageSource, string>();

/** Runs a director-written layer; a broken one draws nothing instead of breaking the frame. */
function drawCode(ctx: CanvasRenderingContext2D, l: { src: string; lyric?: Rect; lyricWeight?: number; cuts?: number[] }, t: number, age: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined) {
  let fn = compiled.get(l.src);
  if (!fn) {
    try {
      fn = new Function('ctx', 'f', l.src) as CodeDraw;
    } catch (e) {
      fn = () => undefined;
      report(`syntax: ${(e as Error).message}`);
    }
    compiled.set(l.src, fn);
  }
  const t0 = performance.now();
  const cam = camAt(l.cuts ?? [], t);
  // while the lyric is fully up, watch the sprite draws for ones that hide it (a check the director must pass)
  const base = l.lyric && (l.lyricWeight ?? 1) > 0.85 ? ctx.getTransform?.()?.inverse?.() : undefined;
  const lyric = base ? l.lyric : undefined;
  // soft motion inside a sprite (sails, branches, cloth, water); its mesh pieces skip the cover watch, its box counts
  let warping = false;
  const warp = (pic: CanvasImageSource | null, x: number, y: number, w: number, h: number, zones: WarpZone[], seed = 0) => {
    if (!pic) return;
    recordCover(pic, x, y, w, h);
    recordBox(pic, x, y, w, h);
    warping = true;
    try {
      drawWarped(ctx, pic as CanvasImageSource & { width: number; height: number }, x, y, w, h, Array.isArray(zones) ? zones : [], t, seed, 10);
    } finally {
      warping = false;
    }
  };
  const proto = typeof CanvasRenderingContext2D === 'undefined' ? undefined : CanvasRenderingContext2D.prototype;
  const plain = proto?.drawImage;
  // QA renders (render.mts --track) log every sprite's box on screen per frame: codelayer.mts finds jumps, pops,
  // overlaps and aimless bobbing from them
  const track = !!(globalThis as { __vjTrack?: boolean }).__vjTrack && !(globalThis as { __vjProbe?: boolean }).__vjProbe && !!proto;
  const frame = track ? ctx.getTransform?.()?.inverse?.() : undefined;
  const boxes: string[] = [];
  const recordBox = (pic: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => {
    const id = ids.get(pic);
    if (!frame || !id) return;
    const m = frame.multiply(ctx.getTransform());
    const pts = [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
    boxes.push(`${id}:${Math.round(x0)},${Math.round(y0)},${Math.round(Math.max(...xs) - x0)},${Math.round(Math.max(...ys) - y0)},${ctx.globalAlpha.toFixed(2)}`);
  };
  const recordCover = (pic: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => {
    const id = ids.get(pic);
    if (!lyric || !base || !id) return;
    const [share, inside] = coverOf(pic as CanvasImageSource & { width: number; height: number }, base.multiply(ctx.getTransform()), dx, dy, dw, dh, lyric);
    const key = `${id}@${cam.index}`;
    // a big sprite across the lyric, or a small one sitting on its words
    if ((share > 0.08 || (inside > 0.5 && share > 0.015)) && !covered.has(key)) {
      covered.add(key);
      console.error(`code layer: lyric covered: ${id} hides ${Math.round(share * 100)}% of the lyric box (${Math.round(inside * 100)}% of it inside) at ${t.toFixed(1)} s (shot ${cam.index})`);
    }
  };
  // every drawImage while the drawing runs: a sprite copied onto the drawing's own canvas (tinted, made solid) passes
  // its name to that canvas when the canvas is about the sprite's size; a sprite drawn on the frame is measured
  if ((lyric || track) && proto)
    proto.drawImage = function (this: CanvasRenderingContext2D, pic: CanvasImageSource, ...a: number[]) {
      const id = ids.get(pic);
      if (id && !warping && this === ctx && (a.length === 2 || a.length === 4 || a.length === 8)) {
        const sized = pic as CanvasImageSource & { width: number; height: number };
        const [dx, dy, dw, dh] = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], sized.width, sized.height];
        recordCover(pic, dx, dy, dw, dh);
        recordBox(pic, dx, dy, dw, dh);
      } else if (id && this !== ctx && this.canvas) {
        const src = pic as CanvasImageSource & { width: number; height: number };
        const c = this.canvas;
        if (c.width * c.height <= src.width * src.height * 2.5) ids.set(c, id);
      }
      return (plain as (...x: unknown[]) => void).call(this, pic, ...a);
    } as typeof proto.drawImage;
  // which scene pictures each camera shot shows (codelayer.mts checks that the story moves through them)
  const sceneIds = new Set<string>();
  const scene = (id: string) => {
    const x = image(id) ?? null;
    if (x) sceneIds.add(id);
    return x;
  };
  const img = (id: string) => {
    const x = image(`spr:${id}`) ?? null;
    if (x) ids.set(x, id);
    return x;
  };
  ctx.save();
  try {
    fn(ctx, { w: W, h: H, t, age, beat, lyric: l.lyric ?? null, lyricWeight: l.lyric ? (l.lyricWeight ?? 1) : 0, cam, hash, img, scene, particles: (opts: Omit<ParticleLayer, 'kind'>) => particles(ctx, { kind: 'particles', ...opts }, t), warp, cache: caches.get(l.src) ?? (caches.set(l.src, {}), caches.get(l.src)!) });
  } catch (e) {
    report(`runtime: ${(e as Error).message}`);
  }
  ctx.restore();
  if ((lyric || track) && proto && plain) proto.drawImage = plain;
  if (track) console.error(`code layer: track ${t.toFixed(3)} ${cam.index} ${boxes.join(';')}`);
  if (sceneIds.size) {
    const key = `scene-use ${cam.index} ${[...sceneIds].sort().join(',')}`;
    if (!covered.has(key)) {
      covered.add(key);
      console.error(`code layer: ${key}`);
    }
  }
  const ms = performance.now() - t0;
  if (ms > 25) report(`slow: ${Math.round(ms / 5) * 5} ms`);
}

function draw(ctx: CanvasRenderingContext2D, l: Layer, t: number, age: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined) {
  if (l.kind === 'code') return drawCode(ctx, l, t, age, beat, image);
  if (l.kind === 'sprite' || l.kind === 'thread' || l.kind === 'card') return drawStory(ctx, l, image);
  const kick = 1 + (l.pulse ?? 0) * beat.pulse;
  switch (l.kind) {
    case 'fill': {
      if (!l.to) {
        ctx.fillStyle = l.color;
      } else {
        const a = ((l.angle ?? 90) * Math.PI) / 180;
        const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * W / 2, H / 2 - Math.sin(a) * H / 2, W / 2 + Math.cos(a) * W / 2, H / 2 + Math.sin(a) * H / 2);
        g.addColorStop(0, l.color);
        g.addColorStop(1, l.to);
        ctx.fillStyle = g;
      }
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'paper': {
      ctx.fillStyle = l.color;
      ctx.fillRect(0, 0, W, H);
      // fibres: short faint strokes, fixed per song (seeded, not per frame)
      const n = Math.round(1400 * (l.grain ?? 0.6));
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x = hash(i, 1) * W;
        const y = hash(i, 2) * H;
        const a = hash(i, 3) * Math.PI;
        const len = 4 + hash(i, 4) * 14;
        ctx.strokeStyle = hash(i, 5) > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      return;
    }
    case 'pattern':
      return pattern(ctx, l, t);
    case 'photo':
      return photo(ctx, l, t, age, kick, image(l.asset));
    case 'frame':
      return frame(ctx, l, t, beat);
    case 'rings': {
      const cx = W / 2 + (l.x ?? 0) * W / 2;
      const cy = H / 2 - (l.y ?? 0) * H / 2;
      const n = l.count ?? 5;
      const r0 = (l.radius ?? 0.45) * H;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 3;
      if (l.dashed) ctx.setLineDash([18, 14]);
      for (let i = 0; i < n; i++) {
        const r = r0 * (0.35 + (0.65 * (i + 1)) / n) * (1 + 0.04 * (l.pulse ?? 0) * beat.pulse * (n - i));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (l.spin ?? 0.1) * (i % 2 ? -1 : 1));
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    case 'sparkles': {
      const n = l.count ?? 24;
      const s = l.size ?? 26;
      ctx.fillStyle = l.color;
      for (let i = 0; i < n; i++) {
        const seed = (l.seed ?? 0) * 97 + i;
        const x = hash(seed, 1) * W;
        const y = hash(seed, 2) * H;
        // each twinkles on its own phase, and all flare on the beat
        const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(seed, 3) * 2) + hash(seed, 4) * 6.28);
        const size = s * (0.4 + hash(seed, 5)) * (0.4 + 0.6 * tw) * kick;
        star4(ctx, x, y, size);
      }
      return;
    }
    case 'particles':
      return particles(ctx, l, t, kick);
    case 'panels':
      return panels(ctx, l, t, age, image);
    case 'ui':
      return ui(ctx, l, age, beat);
    case 'sunburst': {
      const cx = W / 2 + (l.x ?? 0) * W / 2;
      const cy = H / 2 - (l.y ?? 0) * H / 2;
      const n = l.rays ?? 24;
      ctx.translate(cx, cy);
      ctx.rotate(t * (l.spin ?? 0.05));
      ctx.fillStyle = l.color;
      const R = Math.hypot(W, H);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = a0 + Math.PI / n;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
        ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    case 'band':
      return band(ctx, l, t);
    case 'shapes': {
      const n = l.count ?? 12;
      const s = l.size ?? 60;
      for (let i = 0; i < n; i++) {
        const seed = (l.seed ?? 0) * 89 + i;
        const sp = (l.drift ?? 30) * (0.5 + hash(seed, 6));
        const x = ((hash(seed, 1) * (W + 2 * s) + t * sp * (hash(seed, 7) > 0.5 ? 1 : -0.6)) % (W + 2 * s) + W + 2 * s) % (W + 2 * s) - s;
        const y = ((hash(seed, 2) * (H + 2 * s) - t * sp * 0.6) % (H + 2 * s) + H + 2 * s) % (H + 2 * s) - s;
        const size = s * (0.5 + hash(seed, 3)) * kick;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(hash(seed, 4) * 6.28 + t * 0.4 * (hash(seed, 5) - 0.5));
        shape(ctx, l.type, size, l.colors?.length ? l.colors[i % l.colors.length] : l.color, !!l.outline);
        ctx.restore();
      }
      return;
    }
    case 'bands': {
      // stepped colour bands instead of a gradient (silkscreen skies): each step thinner toward the next colour
      const y0 = (l.from ?? 0) * H;
      const y1 = (l.to ?? 1) * H;
      const n = l.colors.length;
      const bh = (y1 - y0) / n;
      l.colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, y0 + i * bh, W, bh + 1);
        if (i + 1 < n) {
          // thinning stripes of the next colour at the seam
          ctx.fillStyle = l.colors[i + 1];
          for (let k = 0; k < 4; k++) ctx.fillRect(0, y0 + (i + 1) * bh - bh * 0.42 + k * bh * 0.12, W, bh * 0.025 * (k + 1));
        }
      });
      return;
    }
    case 'stamp': {
      const size = l.size ?? 64;
      ctx.translate(W / 2 + (l.x ?? 0) * W / 2, H / 2 - (l.y ?? 0) * H / 2);
      ctx.rotate(((l.tilt ?? -8) * Math.PI) / 180);
      ctx.scale(kick, kick);
      ctx.font = `900 ${size}px "${l.font ?? 'Zen Kaku Gothic New'}"`;
      const tw = ctx.measureText(l.text).width;
      const bw = tw + size * 0.9;
      const bh = size * 1.6;
      ctx.strokeStyle = l.color;
      ctx.fillStyle = l.color;
      ctx.lineWidth = size * 0.09;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, size * 0.2);
      ctx.stroke();
      roundRect(ctx, -bw / 2 + size * 0.16, -bh / 2 + size * 0.16, bw - size * 0.32, bh - size * 0.32, size * 0.12);
      ctx.lineWidth = size * 0.04;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, 0, size * 0.04);
      // worn ink: paper-coloured specks knocked out of the stamp
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 160; i++) ctx.fillRect((hash(i, 21) - 0.5) * bw, (hash(i, 22) - 0.5) * bh, 2 + hash(i, 23) * 4, 2 + hash(i, 24) * 3);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    case 'seal': {
      const size = l.size ?? 90;
      ctx.translate(W / 2 + (l.x ?? 0.85) * W / 2, H / 2 - (l.y ?? -0.8) * H / 2);
      ctx.fillStyle = l.color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.globalCompositeOperation = 'destination-out';
      const chars = [...String(l.text ?? '')].slice(0, 4);
      const cols = chars.length > 2 ? 2 : 1;
      const rows = Math.ceil(chars.length / cols);
      ctx.font = `700 ${(size * 0.8) / rows}px "${l.font ?? 'Zen Old Mincho'}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // seal text reads top to bottom, right column first
      chars.forEach((c, i) => {
        const col = cols - 1 - Math.floor(i / rows);
        const row = i % rows;
        ctx.fillText(c, -size / 2 + (size / cols) * (col + 0.5), -size / 2 + (size / rows) * (row + 0.5));
      });
      for (let i = 0; i < 40; i++) ctx.fillRect((hash(i, 31) - 0.5) * size, (hash(i, 32) - 0.5) * size, 3, 3);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    case 'numeral': {
      const size = (l.size ?? 0.8) * H;
      ctx.font = `${l.weight ?? 900} ${size}px "${l.font ?? 'Zen Kaku Gothic New'}"`;
      ctx.fillStyle = l.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, W / 2 + (l.x ?? 0) * W / 2, H / 2 - (l.y ?? 0) * H / 2);
      return;
    }
    case 'scanlines': {
      ctx.fillStyle = l.color ?? 'rgba(0,0,0,0.35)';
      const gap = l.gap ?? 4;
      for (let y = 0; y < H; y += gap) ctx.fillRect(0, y, W, gap / 2);
      if (l.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${l.vignette})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    case 'chargrid': {
      // real characters on a monospace grid, chosen by a density field (never an image filter)
      const cols = l.cols ?? 96;
      const cw = W / cols;
      const ch = cw * 2;
      const rows = Math.ceil(H / ch);
      const ramp = l.chars ?? ' .:-=+*#%@';
      ctx.font = `${ch * 0.9}px "Space Mono", monospace`;
      ctx.fillStyle = l.color;
      ctx.textBaseline = 'top';
      const sp = l.speed ?? 0.4;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const u = i / cols - 0.5;
          const v = j / rows - 0.5;
          let d: number;
          if (l.field === 'radial') d = 1 - Math.min(1, Math.hypot(u * 1.8, v) * 2 - 0.3 * Math.sin(t * sp * 3 - Math.hypot(u, v) * 12));
          else if (l.field === 'rain') d = ((hash(i, 41) + t * sp * (0.5 + hash(i, 42)) - j / rows) % 1 + 1) % 1 > 0.85 ? 0.9 : 0.05;
          else d = 0.5 + 0.5 * Math.sin(u * 9 + t * sp * 2 + Math.sin(v * 7 - t * sp)) * Math.cos(v * 5 + t * sp);
          d = Math.min(1, Math.max(0, d * (1 + 0.3 * beat.pulse * (l.pulse ?? 0))));
          const c = ramp[Math.min(ramp.length - 1, Math.floor(d * ramp.length))];
          if (c !== ' ') ctx.fillText(c, i * cw, j * ch);
        }
      return;
    }
    case 'mist': {
      // suyari-gasumi: long rounded flat bands fading at both ends, drifting sideways
      const n = l.count ?? 4;
      for (let i = 0; i < n; i++) {
        const y = H / 2 - (l.y ?? 0) * H / 2 + (i - n / 2) * H * 0.13 + hash(i, 51) * 40;
        const w = W * (0.35 + hash(i, 52) * 0.4);
        const x = ((hash(i, 53) * W + t * (l.drift ?? 12) * (i % 2 ? 1 : -1)) % (W + w) + W + w) % (W + w) - w;
        const h = 34 + hash(i, 54) * 30;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.15, l.color);
        g.addColorStop(0.85, l.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        // soft: a drifting haze (ink-wash, indigo), an elliptical glow with no edge, not ukiyo-e's crisp flat band
        if (l.soft) {
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(w * 0.6, h * 1.8);
          const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          r.addColorStop(0, l.color);
          r.addColorStop(1, `${l.color.slice(0, 7)}00`);
          ctx.fillStyle = r;
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
      }
      return;
    }
    case 'speedlines': {
      // manga focus lines: thin wedges from the frame edge toward an empty centre, re-drawn on every beat
      const n = l.count ?? 90;
      const inner = (l.inner ?? 0.42) * H;
      ctx.fillStyle = l.color;
      ctx.translate(W / 2, H / 2);
      for (let i = 0; i < n; i++) {
        const a = hash(i, 61 + beat.index) * Math.PI * 2;
        const r0 = inner * (0.9 + hash(i, 62 + beat.index) * 0.5);
        const wdt = 0.004 + hash(i, 63) * 0.01;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a - wdt) * W, Math.sin(a - wdt) * W);
        ctx.lineTo(Math.cos(a + wdt) * W, Math.sin(a + wdt) * W);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    case 'swissgrid': {
      // 12-column grid in hairlines, black bars snapping to modules on the beat, one signal-colour block
      const cols = l.cols ?? 12;
      const m = 96;
      const cw = (W - 2 * m) / cols;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 1;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        ctx.moveTo(m + i * cw, 0);
        ctx.lineTo(m + i * cw, H);
        ctx.stroke();
      }
      const step = Math.max(0, beat.index);
      for (let k = 0; k < 3; k++) {
        const seed = (l.seed ?? 0) * 13 + k + Math.floor(step / 4) * 7;
        const c0 = Math.floor(hash(seed, 71) * (cols - 3));
        const span = 1 + Math.floor(hash(seed, 72) * 4);
        const y = Math.floor(hash(seed, 73) * 8) * (H / 9);
        ctx.fillStyle = k === 0 && l.signal ? l.signal : (l.bars ?? '#111111');
        ctx.fillRect(m + c0 * cw, y, span * cw, k === 0 ? H / 9 : H / 36);
      }
      return;
    }
    case 'skyline': {
      // layered silhouettes (paper-lantern / cut-paper depth): back layers first, each a flat colour, parallax drift
      const n = l.colors.length;
      // height is a fraction of the frame; a director that wrote pixels (cyanotype: 160) got a skyline over everything
      const top = H * (1 - Math.min(0.9, (l.height ?? 0.45) > 1 ? (l.height as number) / 1080 : (l.height ?? 0.45)));
      l.colors.forEach((c, k) => {
        const depth = (k + 1) / n; // 0 back … 1 front
        const base = top + (H - top) * (0.15 + 0.5 * depth);
        const off = (t * (l.drift ?? 6) * (0.3 + depth)) % W;
        // wash: ink graded from the ridge down into the mist at the foot (ink-wash), instead of a flat cut-out
        if (l.wash) {
          const g = ctx.createLinearGradient(0, top + (base - top) * 0.2, 0, base + (H - base) * 0.4);
          g.addColorStop(0, c);
          g.addColorStop(1, `${c.slice(0, 7)}00`);
          ctx.fillStyle = g;
        } else ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-off - 10, H);
        const seed = (l.seed ?? 0) * 31 + k * 7;
        const type = l.type ?? 'city';
        let lastSaddle = H;
        for (let x = -off - 10; x < W + W; ) {
          const r = hash(Math.floor(x / 40), seed);
          if (type === 'city') {
            const w = 40 + r * 90;
            const h = (H - base) * 0.3 + r * (H - top) * 0.55 * (1 - depth * 0.4);
            ctx.lineTo(x, base - h);
            ctx.lineTo(x + w, base - h);
            x += w;
          } else if (type === 'trees') {
            // a mixed treeline: tiered pines, round broadleaf crowns and slim cypresses of uneven height, a little
            // ground between some of them (a row of equal triangles read as a placeholder)
            const kind = hash(Math.floor(x / 40), seed + 9);
            const h = (70 + r * 170) * (1 - depth * 0.25);
            // the tops sway in a slow breeze, each tree on its own phase, more the higher the point
            const sway = Math.sin(t * 0.9 + x * 0.013 + k) * h * 0.03;
            if (kind < 0.45) {
              const w = 50 + r * 50;
              const tiers = [[0, 0.32], [0.12, 0.6], [0.22, 0.86]];
              ctx.lineTo(x, base);
              for (const [inset, up] of tiers) {
                ctx.lineTo(x + w * inset + sway * (up - 0.3), base - h * (up - 0.3));
                ctx.lineTo(x + w * (inset + 0.12) + sway * up, base - h * up);
              }
              ctx.lineTo(x + w / 2 + sway, base - h);
              for (const [inset, up] of [...tiers].reverse()) {
                ctx.lineTo(x + w * (1 - inset - 0.12) + sway * up, base - h * up);
                ctx.lineTo(x + w * (1 - inset) + sway * (up - 0.3), base - h * (up - 0.3));
              }
              ctx.lineTo(x + w, base);
              x += w * 0.85;
            } else if (kind < 0.8) {
              const w = 60 + r * 60;
              const cr = w * 0.62;
              ctx.lineTo(x + w * 0.44, base);
              ctx.lineTo(x + w * 0.44, base - h * 0.2);
              // a lumpy crown: three overlapping arcs over the trunk
              ctx.arc(x + w * 0.28 + sway * 0.6, base - h * 0.2 - cr * 0.55, cr * 0.55, Math.PI * 0.75, Math.PI * 1.5);
              ctx.arc(x + w * 0.5 + sway, base - h * 0.2 - cr * 0.95, cr * 0.62, Math.PI * 1.15, Math.PI * 1.85);
              ctx.arc(x + w * 0.72 + sway * 0.6, base - h * 0.2 - cr * 0.55, cr * 0.55, Math.PI * 1.5, Math.PI * 0.25);
              ctx.lineTo(x + w * 0.56, base - h * 0.2);
              ctx.lineTo(x + w * 0.56, base);
              x += w * 0.9;
            } else {
              const w = 26 + r * 18;
              ctx.lineTo(x, base);
              ctx.quadraticCurveTo(x - w * 0.1 + sway * 0.6, base - h * 0.75, x + w / 2 + sway * 1.2, base - h * 1.15);
              ctx.quadraticCurveTo(x + w * 1.1 + sway * 0.6, base - h * 0.75, x + w, base);
              x += w;
            }
            if (hash(Math.floor(x / 40), seed + 11) < 0.25) x += 20 + r * 40;
          } else if (type === 'peaks' && l.wash) {
            // brushed mountains: a ridge from layered value noise, tall and uneven, not a row of equal bumps
            const vn = (v: number, o: number) => {
              const i = Math.floor(v);
              const f = v - i;
              return hash(i, seed + o) + (hash(i + 1, seed + o) - hash(i, seed + o)) * f * f * (3 - 2 * f);
            };
            const xx = x + off;
            const ridge = 0.6 * vn(xx / 420, 1) + 0.3 * vn(xx / 140, 2) + 0.1 * vn(xx / 45, 3);
            ctx.lineTo(x, base - (H - top) * (0.1 + 0.9 * ridge) * (1 - depth * 0.35));
            x += 18;
          } else {
            // rolling ridge: alternate crests and saddles joined through their midpoints, so the line stays smooth (one
            // arch per hill met the next in a sharp V)
            const w = (type === 'peaks' ? 120 : 260) + r * 200;
            // crests of clearly different heights, saddles part-way down: overlapping hills, not an even wave
            const crest = base - (type === 'peaks' ? 160 : 70) - r * (type === 'peaks' ? 260 : 150);
            const saddle = crest + (base - crest) * (type === 'peaks' ? 0.7 : 0.35 + 0.3 * hash(Math.floor(x / 40), seed + 13));
            // flat tangents at every crest and saddle: the ridge never folds into a point
            ctx.bezierCurveTo(x + w * 0.2, lastSaddle, x + w * 0.3, crest, x + w * 0.5, crest);
            ctx.bezierCurveTo(x + w * 0.7, crest, x + w * 0.8, saddle, x + w, saddle);
            lastSaddle = saddle;
            x += w;
          }
        }
        ctx.lineTo(W + W, H);
        ctx.closePath();
        ctx.fill();
        // lit windows on the front-most city layer
        if (type === 'city' && l.windows && k === n - 1) {
          ctx.fillStyle = l.windows;
          for (let i = 0; i < 120; i++) {
            const x = (hash(i, seed + 3) * W * 1.2 - off) % W;
            const y = base - hash(i, seed + 4) * (H - top) * 0.4;
            if (hash(i, seed + 5 + Math.floor(t)) > 0.35) ctx.fillRect(x, y, 6, 9);
          }
        }
      });
      return;
    }
    case 'mosaic': {
      if (l.type === 'rose') return roseWindow(ctx, l, t);
      if (l.type === 'lancet') return lancets(ctx, l, t);
      // stained glass: triangulated cells in a few jewel colours, dark leading between them, light breathing through
      const n = l.cells ?? 9;
      const cw = W / n;
      const ch = H / Math.round(n * 0.56);
      const rows = Math.ceil(H / ch);
      const pt = (i: number, j: number) => [i * cw + (hash(i, j + 1) - 0.5) * cw * 0.6, j * ch + (hash(j, i + 2) - 0.5) * ch * 0.6];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < n; i++) {
          const [a, b, c, d] = [pt(i, j), pt(i + 1, j), pt(i, j + 1), pt(i + 1, j + 1)];
          for (const [tri, k] of [[[a, b, d], 0], [[a, d, c], 1]] as const) {
            const col = l.colors[Math.floor(hash(i * 3 + k, j + (l.seed ?? 0)) * l.colors.length)];
            ctx.globalAlpha = (l.opacity ?? 1) * (0.75 + 0.25 * Math.sin(t * 0.8 + hash(i, j) * 6));
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(tri[0][0], tri[0][1]);
            ctx.lineTo(tri[1][0], tri[1][1]);
            ctx.lineTo(tri[2][0], tri[2][1]);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = l.opacity ?? 1;
            ctx.strokeStyle = l.color ?? '#141018';
            ctx.lineWidth = 7;
            ctx.stroke();
          }
        }
      return;
    }
    case 'botanical':
      return botanicals(ctx, l, t);
    case 'ink': {
      // ink-wash blots: soft overlapping washes with a darker core, growing slowly
      const n = l.count ?? 5;
      for (let i = 0; i < n; i++) {
        const seed = (l.seed ?? 0) * 17 + i;
        const x = hash(seed, 1) * W;
        const y = hash(seed, 2) * H;
        const r = (l.size ?? 220) * (0.5 + hash(seed, 3)) * (1 + 0.05 * Math.sin(t * 0.4 + i));
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        // a set of washes (colors) takes turns; one color otherwise
        const ink = l.colors?.length ? l.colors[i % l.colors.length] : l.color;
        g.addColorStop(0, ink);
        g.addColorStop(0.55, ink);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (l.opacity ?? 1) * (0.35 + 0.4 * hash(seed, 4));
        ctx.fillStyle = g;
        ctx.beginPath();
        // ragged edge: a wobbling outline
        for (let a = 0; a <= 24; a++) {
          const ang = (a / 24) * Math.PI * 2;
          const rr = r * (0.82 + 0.18 * hash(seed, a + 10));
          ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    case 'blob': {
      const cx = W / 2 + (l.x ?? 0) * W / 2;
      const cy = H / 2 - (l.y ?? 0) * H / 2;
      const r = (l.r ?? 0.35) * H * (1 + (l.breathe ?? 0.03) * Math.sin(t * 1.3)) * kick;
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
  }
}

function pattern(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'pattern' }>, t: number) {
  const s = l.scale ?? 60;
  const off = (t * (l.scroll ?? 0)) % (s * 2);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(((l.angle ?? 0) * Math.PI) / 180);
  ctx.translate(-W, -H);
  ctx.translate(off, off);
  const span = [Math.ceil((W * 2) / s) + 2, Math.ceil((H * 2) / s) + 2];
  ctx.fillStyle = l.color;
  ctx.strokeStyle = l.color;
  switch (l.type) {
    case 'grid':
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < span[0]; i++) ctx.rect(i * s, 0, 0.001, H * 2 + s * 2);
      for (let j = 0; j < span[1]; j++) ctx.rect(0, j * s, W * 2 + s * 2, 0.001);
      ctx.stroke();
      return;
    case 'dots':
    case 'halftone':
      for (let i = 0; i < span[0]; i++)
        for (let j = 0; j < span[1]; j++) {
          // halftone: dot size falls off toward the bottom-right, like a printed gradient
          const r = l.type === 'dots' ? s * 0.18 : s * 0.48 * Math.max(0.05, 1 - (i / span[0] + j / span[1]) * 0.7);
          ctx.beginPath();
          ctx.arc(i * s + (j % 2 ? s / 2 : 0), j * s, r, 0, Math.PI * 2);
          ctx.fill();
        }
      return;
    case 'stripes':
      for (let i = 0; i < span[0]; i += 2) ctx.fillRect(i * s, 0, s, H * 2 + s * 2);
      return;
    case 'checker':
      for (let i = 0; i < span[0]; i++) for (let j = 0; j < span[1]; j++) if ((i + j) % 2) ctx.fillRect(i * s, j * s, s, s);
      return;
    case 'shibori':
      // kanoko shibori: rows of tiny resist rings where thread bound the cloth, the dye bleeding into every edge
      ctx.drawImage(blurredOnce(`shibori${s}${l.color}`, span[0] * s, span[1] * s, Math.max(1, s * 0.05), (c) => {
        c.strokeStyle = l.color;
        c.lineWidth = Math.max(2, s * 0.1);
        for (let i = 0; i < span[0]; i++)
          for (let j = 0; j < span[1] / 0.86; j++) {
            c.beginPath();
            c.arc(i * s + (j % 2 ? s / 2 : 0), j * s * 0.86, s * (0.16 + 0.07 * hash(i, j + 3)), 0, Math.PI * 2);
            c.stroke();
          }
      }), 0, 0);
      return;
    case 'itajime':
      // itajime: cloth folded and clamped between boards; each fold leaves a soft white diamond and a faint crease
      ctx.drawImage(blurredOnce(`itajime${s}${l.color}`, span[0] * s, span[1] * s, Math.max(1.5, s * 0.025), (c) => {
        c.fillStyle = l.color;
        c.strokeStyle = l.color;
        for (let i = 0; i < span[0]; i++)
          for (let j = 0; j < span[1]; j++) {
            const [cx, cy, d] = [i * s + s / 2, j * s + s / 2, s * (0.3 + 0.06 * hash(i, j + 7))];
            c.beginPath();
            c.moveTo(cx, cy - d);
            c.lineTo(cx + d, cy);
            c.lineTo(cx, cy + d);
            c.lineTo(cx - d, cy);
            c.closePath();
            c.fill();
          }
        c.globalAlpha = 0.35;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < span[0]; i++) c.rect(i * s, 0, 0.001, span[1] * s);
        for (let j = 0; j < span[1]; j++) c.rect(0, j * s, span[0] * s, 0.001);
        c.stroke();
      }), 0, 0);
      return;
    case 'genkou':
      // genkō yōshi (manuscript paper): square cells in vertical columns, a gutter between columns
      ctx.lineWidth = 2;
      for (let i = 0; i < span[0]; i++) {
        const x = i * s * 1.25;
        ctx.strokeRect(x, 0, s, H * 2 + s * 2);
        for (let j = 0; j < span[1]; j++) ctx.strokeRect(x, j * s, s, s);
      }
      return;
    case 'waves':
      // seigaiha: overlapping concentric arcs in rows, each row offset half a module
      ctx.lineWidth = Math.max(2, s * 0.05);
      for (let j = 0; j < span[1] * 2; j++)
        for (let i = -1; i < span[0]; i++) {
          const cx = i * s + (j % 2 ? s / 2 : 0);
          const cy = j * s * 0.5;
          for (let k = 3; k >= 1; k--) {
            ctx.beginPath();
            ctx.arc(cx, cy, (s / 2) * (k / 3), Math.PI, 0);
            ctx.stroke();
          }
        }
      return;
    case 'gingham':
      ctx.globalAlpha *= 0.5;
      for (let i = 0; i < span[0]; i += 2) ctx.fillRect(i * s, 0, s, H * 2 + s * 2);
      for (let j = 0; j < span[1]; j += 2) ctx.fillRect(0, j * s, W * 2 + s * 2, s);
      return;
  }
}

/** One particle shape, centred at the origin, size s. */
function particleShape(ctx: CanvasRenderingContext2D, shape: NonNullable<ParticleLayer['shape']>, s: number, char: string) {
  ctx.beginPath();
  switch (shape) {
    case 'petal': {
      // a cherry petal: narrow base, wide rounded tip with a notch, darker toward the base
      ctx.moveTo(-s * 0.5, 0);
      ctx.bezierCurveTo(-s * 0.25, -s * 0.3, s * 0.25, -s * 0.42, s * 0.5, -s * 0.17);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.03, s * 0.32, 0);
      ctx.quadraticCurveTo(s * 0.4, s * 0.03, s * 0.5, s * 0.17);
      ctx.bezierCurveTo(s * 0.25, s * 0.42, -s * 0.25, s * 0.3, -s * 0.5, 0);
      ctx.fill();
      const g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.1, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fill();
      return;
    }
    case 'leaf':
      ctx.moveTo(-s * 0.5, 0);
      ctx.quadraticCurveTo(0, -s * 0.4, s * 0.5, 0);
      ctx.quadraticCurveTo(0, s * 0.4, -s * 0.5, 0);
      ctx.fill();
      return;
    case 'snow':
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.2 : s * 0.5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.fill();
      return;
    case 'spark':
      star4(ctx, 0, 0, s);
      return;
    case 'heart':
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.3, -s * 0.55, 0, -s * 0.2);
      ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.6, -s * 0.05, 0, s * 0.35);
      ctx.fill();
      return;
    case 'bubble':
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'char':
      ctx.font = `700 ${s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, 0, 0);
      return;
    default:
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
  }
}

/**
 * Drifting particles in three depth bands: far ones small, slow and faint, near ones large and quick, each swaying on
 * its own phase and turning slowly; positions are a function of t only (any frame renders the same).
 */
export function particles(ctx: CanvasRenderingContext2D, l: ParticleLayer, t: number, kick = 1) {
  const n = Math.min(400, l.count ?? 60);
  const size = l.size ?? 30;
  const speed = l.speed ?? 60;
  const sway = l.sway ?? 0.5;
  const colors = Array.isArray(l.color) ? l.color : [l.color ?? '#ffffff'];
  const chars = [...(l.char ?? '✦')];
  const [vx, vy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[l.dir ?? 'down'];
  const margin = size * 3;
  const spanX = W + margin * 2;
  const spanY = H + margin * 2;
  for (let i = 0; i < n; i++) {
    const seed = (l.seed ?? 0) * 131 + i;
    const depth = 0.35 + 0.65 * hash(seed, 3); // 0.35 far … 1 near
    const v = speed * depth * (0.7 + 0.6 * hash(seed, 4));
    const ph = hash(seed, 5) * Math.PI * 2;
    const wob = Math.sin(t * (0.6 + hash(seed, 6)) + ph) * sway * 40 * depth;
    const x = ((((hash(seed, 1) * spanX + vx * v * t + (vy ? wob : 0)) % spanX) + spanX) % spanX) - margin;
    const y = ((((hash(seed, 2) * spanY + vy * v * t + (vx ? wob : 0)) % spanY) + spanY) % spanY) - margin;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ph + t * (hash(seed, 7) - 0.5) * 1.6);
    // petals and leaves tumble: turning around their long axis, face-on then edge-on
    if (l.shape === 'petal' || l.shape === 'leaf') ctx.scale(1, Math.cos(t * (1.2 + 2 * hash(seed, 9)) + ph));
    ctx.globalAlpha = (l.opacity ?? 0.85) * (0.35 + 0.65 * depth) * (l.shape === 'spark' || l.shape === 'star' ? 0.6 + 0.4 * Math.sin(t * 3 + ph) : 1);
    ctx.fillStyle = colors[i % colors.length];
    particleShape(ctx, l.shape ?? 'dot', size * depth * (0.7 + 0.6 * hash(seed, 8)) * kick, chars[i % chars.length]);
    ctx.restore();
  }
}

/**
 * Split panels: the frame cut into 2–4 panels (vertical, horizontal, diagonal or a grid), each with its own picture (or
 * tint) framed and drifting on its own, sliding in one after another as the section starts, thin rules between them.
 */
function panels(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'panels' }>, t: number, age: number, image: (asset?: string) => CanvasImageSource | undefined) {
  const n = Math.max(2, Math.min(4, l.count ?? 3));
  const layout = l.layout ?? 'vertical';
  const gap = l.gap ?? 10;
  const polys: [number, number][][] = [];
  if (layout === 'grid') {
    const cols = 2;
    const rows = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const c = k % cols;
      const r = Math.floor(k / cols);
      const [x0, y0, x1, y1] = [(c * W) / cols, (r * H) / rows, ((c + 1) * W) / cols, ((r + 1) * H) / rows];
      polys.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
  } else
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      if (layout === 'horizontal') polys.push([[0, a * H], [W, a * H], [W, b * H], [0, b * H]]);
      else {
        // diagonal panels lean by a fifth of the frame width
        const lean = layout === 'diagonal' ? W * 0.1 : 0;
        polys.push([[a * W + lean, 0], [b * W + lean, 0], [b * W - lean, H], [a * W - lean, H]]);
      }
    }
  polys.forEach((poly, k) => {
    const enter = 1 - Math.pow(1 - Math.min(1, Math.max(0, (age - k * 0.12) / 0.45)), 3);
    if (enter <= 0) return;
    const off = (1 - enter) * (layout === 'horizontal' ? W : H) * (k % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(layout === 'horizontal' ? off : 0, layout === 'horizontal' ? 0 : off);
    ctx.beginPath();
    poly.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    const pic = image(l.assets?.[k % Math.max(1, l.assets.length)]) as (CanvasImageSource & { width: number; height: number }) | undefined;
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [bx, by, bw, bh] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    if (pic?.width) {
      // each panel frames its picture differently and drifts on its own
      const sc = Math.max(bw / pic.width, bh / pic.height) * (1.15 + 0.05 * Math.sin(t * 0.2 + k));
      const dx = Math.sin(t * 0.15 + k * 1.7) * bw * 0.04;
      ctx.drawImage(pic, bx + (bw - pic.width * sc) / 2 + dx, by + (bh - pic.height * sc) / 2, pic.width * sc, pic.height * sc);
    } else {
      ctx.fillStyle = l.tints?.[k % l.tints.length] ?? '#222222';
      ctx.fillRect(bx, by, bw, bh);
    }
    if (l.tints?.length && pic?.width) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = l.tints[k % l.tints.length];
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  });
  // rules between panels
  ctx.strokeStyle = l.line ?? '#ffffff';
  ctx.lineWidth = gap;
  polys.slice(1).forEach((poly) => {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    ctx.lineTo(poly[3][0], poly[3][1]);
    ctx.stroke();
  });
}

/**
 * Where a photo is drawn (frame px), in every mode: a full or band photo makes no room for the lyrics (layerRect has
 * no box for it), but the type over it is read against it all the same (engine.ts backdropAt).
 */
export function photoBox(l: Extract<Layer, { kind: 'photo' }>): Rect {
  if (l.mode === 'full') return { x0: 0, y0: 0, x1: W, y1: H };
  const bw = (l.w ?? 0.42) * W;
  const bh = l.mode === 'band' ? (l.h ?? 0.34) * H : l.mode === 'circle' ? bw : (l.h ?? 0.5) * H;
  const cx = W / 2 + ((l.x ?? 0) * W) / 2;
  const cy = H / 2 - ((l.y ?? 0) * H) / 2;
  return { x0: cx - bw / 2, y0: cy - bh / 2, x1: cx + bw / 2, y1: cy + bh / 2 };
}

function photo(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'photo' }>, t: number, age: number, kick: number, img: CanvasImageSource | undefined) {
  if (!img) return;
  const iw = (img as HTMLImageElement).width;
  const ih = (img as HTMLImageElement).height;
  // box in frame px: full frame, or a w×h box centred at x,y (−1..1)
  const full = l.mode === 'full';
  const bw = full ? W : (l.w ?? 0.42) * W;
  const bh = full ? H : l.mode === 'band' ? (l.h ?? 0.34) * H : l.mode === 'circle' ? bw : (l.h ?? 0.5) * H;
  const cx = W / 2 + (l.x ?? 0) * W / 2;
  const cy = H / 2 - (l.y ?? 0) * H / 2;
  ctx.translate(cx, cy);
  ctx.rotate((((l.tilt ?? 0) + (full ? 0 : Math.sin(t * 0.5) * 0.6)) * Math.PI) / 180);
  ctx.scale(kick, kick);
  if (l.mode === 'polaroid') {
    // white card with a deeper bottom margin
    ctx.fillStyle = l.frame ?? '#f5f1e8';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillRect(-bw / 2 - 22, -bh / 2 - 22, bw + 44, bh + 110);
    ctx.shadowColor = 'transparent';
  } else if (!full && l.frame) {
    ctx.fillStyle = l.frame;
    ctx.fillRect(-bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20);
  }
  ctx.beginPath();
  if (l.mode === 'circle') ctx.arc(0, 0, bw / 2, 0, Math.PI * 2);
  else ctx.rect(-bw / 2, -bh / 2, bw, bh);
  ctx.clip();
  // cover the box, with a slow push-in
  const zoom = 1.06 + 0.04 * Math.min(1, age / 8) * (l.drift ?? 1);
  const sc = Math.max(bw / iw, bh / ih) * zoom;
  ctx.drawImage(img, -iw * sc / 2 + Math.sin(t * 0.07) * 20 * (l.drift ?? 1), -ih * sc / 2, iw * sc, ih * sc);
  if (l.tint) {
    // tint keeps the photo's light and takes the section's hue ('color' blend): a multiply by a dark colour
    // blacked the picture out
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha *= 0.75;
    ctx.fillStyle = l.tint;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function frame(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'frame' }>, t: number, beat: Beat) {
  const m = l.inset ?? 48;
  ctx.strokeStyle = l.color;
  ctx.fillStyle = l.color;
  switch (l.type) {
    case 'border':
      ctx.lineWidth = 4;
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
      return;
    case 'deco': {
      // art deco: a double rule with stepped (ziggurat) corners, a fan rising from the top and bottom centre, and
      // nested chevrons on the sides
      ctx.lineWidth = 3;
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
      const n = m + 16;
      const st = 22;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const corner = (x: number, y: number, dx: number, dy: number) => {
        ctx.lineTo(x, y + dy * 3 * st);
        for (let k = 3; k > 0; k--) {
          ctx.lineTo(x + dx * (4 - k) * st, y + dy * k * st);
          ctx.lineTo(x + dx * (4 - k) * st, y + dy * (k - 1) * st);
        }
        ctx.lineTo(x + dx * 3 * st, y);
      };
      ctx.moveTo(n, H / 2);
      corner(n, n, 1, 1);
      ctx.lineTo(W - n - 3 * st, n);
      for (let k = 0; k < 3; k++) {
        ctx.lineTo(W - n - (3 - k) * st, n + k * st);
        ctx.lineTo(W - n - (2 - k) * st, n + k * st);
      }
      ctx.lineTo(W - n, n + 3 * st);
      ctx.lineTo(W - n, H - n - 3 * st);
      for (let k = 0; k < 3; k++) {
        ctx.lineTo(W - n - k * st, H - n - (3 - k) * st);
        ctx.lineTo(W - n - k * st, H - n - (2 - k) * st);
      }
      ctx.lineTo(W - n - 3 * st, H - n);
      ctx.lineTo(n + 3 * st, H - n);
      for (let k = 0; k < 3; k++) {
        ctx.lineTo(n + (3 - k) * st, H - n - k * st);
        ctx.lineTo(n + (2 - k) * st, H - n - k * st);
      }
      ctx.lineTo(n, H - n - 3 * st);
      ctx.closePath();
      ctx.stroke();
      // fans: half-discs of rays and arcs, opening a little on the beat
      for (const [fy, dir] of [[n, 1], [H - n, -1]] as const) {
        const R = 190 * (1 + 0.05 * beat.pulse);
        ctx.lineWidth = 2;
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          ctx.arc(W / 2, fy, (R * k) / 3, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const a = (k / 10) * Math.PI * dir;
          ctx.moveTo(W / 2 + Math.cos(a) * R * 0.33, fy + Math.sin(a) * R * 0.33);
          ctx.lineTo(W / 2 + Math.cos(a) * R, fy + Math.sin(a) * R);
        }
        ctx.stroke();
      }
      // chevrons pointing inward at the middle of each side
      ctx.lineWidth = 2.5;
      for (const [x, d] of [[n + 30, 1], [W - n - 30, -1]] as const)
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(x + d * k * 16, H / 2 - 40);
          ctx.lineTo(x + d * (k * 16 + 22), H / 2);
          ctx.lineTo(x + d * k * 16, H / 2 + 40);
          ctx.stroke();
        }
      return;
    }
    case 'filmstrip': {
      // black edges with sprocket holes running sideways
      ctx.fillRect(0, 0, W, 90);
      ctx.fillRect(0, H - 90, W, 90);
      ctx.globalCompositeOperation = 'destination-out';
      const off = (t * 80) % 60;
      for (let x = -60 + off; x < W + 60; x += 60) {
        ctx.fillRect(x, 30, 32, 30);
        ctx.fillRect(x, H - 60, 32, 30);
      }
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    case 'viewfinder': {
      ctx.lineWidth = 5;
      const c = 90;
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy * c);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * c, y);
        ctx.stroke();
      }
      // REC dot blinks on the beat
      if (beat.index % 2 === 0) {
        ctx.beginPath();
        ctx.arc(m + 70, m + 70, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#ff3344';
        ctx.fill();
      }
      ctx.font = '600 34px "Space Mono", monospace';
      ctx.fillStyle = l.color;
      ctx.fillText(l.label ?? 'REC', m + 100, m + 82);
      return;
    }
    case 'brackets': {
      ctx.lineWidth = 6;
      const bw = W * 0.34;
      const bh = H * 0.3;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + s * (bw - 40), H / 2 - bh);
        ctx.lineTo(W / 2 + s * bw, H / 2 - bh);
        ctx.lineTo(W / 2 + s * bw, H / 2 + bh);
        ctx.lineTo(W / 2 + s * (bw - 40), H / 2 + bh);
        ctx.stroke();
      }
      return;
    }
    case 'ticket': {
      // a ticket stub: rounded card with notched sides and a perforated line, label printed on the stub
      const x = m * 2;
      const y = m * 3;
      const w = W - 4 * m;
      const h = H - 6 * m;
      ctx.lineWidth = 5;
      roundRect(ctx, x, y, w, h, 28);
      ctx.stroke();
      for (const sx of [x, x + w]) {
        ctx.beginPath();
        ctx.arc(sx, y + h / 2, 34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.78, y + 20);
      ctx.lineTo(x + w * 0.78, y + h - 20);
      ctx.stroke();
      ctx.setLineDash([]);
      if (l.label) {
        ctx.save();
        ctx.translate(x + w * 0.89, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = '700 40px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(l.label, 0, 14);
        ctx.restore();
      }
      return;
    }
    case 'window': {
      // a desktop window: title bar with three dots, thin border
      const x = m * 2;
      const y = m * 2;
      const w = W - 4 * m;
      const h = H - 4 * m;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y, w, 56);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 34 + i * 34, y + 28, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      if (l.label) {
        ctx.font = '600 28px "Space Mono", monospace';
        ctx.fillText(l.label, x + 150, y + 38);
      }
      return;
    }
  }
}

const UI_W: Record<UiLayer['type'], number> = { terminal: 0.42, log: 0.36, code: 0.38, files: 0.32, error: 0.32, progress: 0.38, loading: 0.28, cursor: 0.34 };
const UI_H: Record<UiLayer['type'], number> = { terminal: 0.4, log: 0.4, code: 0.42, files: 0.36, error: 0.24, progress: 0.18, loading: 0.16, cursor: 0.1 };
// a cascade's copies step down-right by this much (px) and pop this often (s), like a flood of popups
const CASCADE_STEP = 44;
const CASCADE_EVERY = 0.45;
// generic machine text when the director gives no lines of the song's own
const UI_TEXT: Record<UiLayer['type'], string[]> = {
  terminal: ['ping -c 4 target', 'reply: 64 bytes  time=12ms', 'ssh observer@remote', 'connected.', 'cat signal.log', 'tail -f /var/log/sys'],
  log: ['link up', 'handshake ok', 'packet lost', 'retry 1/3', 'sync 98%', 'checksum ok', 'buffer full', 'reconnect'],
  code: ['while (true) {', '  if (signal) send(msg);', '  wait(beat);', '}', 'function call(target) {', '  return reply ?? retry();', '}'],
  files: ['memory.dat', 'signal.log', 'photo_0412.jpg', 'draft.txt', 'core.sys', 'backup.tar'],
  error: ['CONNECTION LOST'],
  progress: ['UPLOADING'],
  loading: ['CONNECTING'],
  cursor: [''],
};

// desktop window chrome: the look's own phosphor glass, or a generic Mac / Windows window in system colours
// (no vendor logos or icons, only the window shapes everyone recognises)
type Skin = { body: string; bar: string; barText: string; ink: string; accent: string; alert: string; line: string; radius: number; font: string; mono: string };
const OS_SANS = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif';
// ponytail: system faces from the render machine, not webfonts — load a webfont pair if renders move to a bare server
const SKINS: Record<'mac' | 'win', Skin> = {
  mac: { body: '#F5F5F7', bar: '#E3E3E6', barText: '#3A3A3C', ink: '#1D1D1F', accent: '#0A84FF', alert: '#FF3B30', line: '#C6C6C8', radius: 14, font: OS_SANS, mono: '"SF Mono", Menlo, "Space Mono", monospace' },
  win: { body: '#FFFFFF', bar: '#F3F3F3', barText: '#1B1B1B', ink: '#1B1B1B', accent: '#0067C0', alert: '#C42B1C', line: '#D1D1D1', radius: 8, font: OS_SANS, mono: 'Consolas, "Space Mono", monospace' },
};
const skinOf = (l: UiLayer, col: string): Skin =>
  l.skin === 'mac' || l.skin === 'win'
    ? // a terminal window stays dark on either system, as it does on a real desktop
      l.type === 'terminal' || l.type === 'log' ? { ...SKINS[l.skin], body: '#1E1E1E', ink: '#E6E6E6', bar: l.skin === 'mac' ? '#3A3A3C' : '#2B2B2B', barText: '#E6E6E6', line: '#4A4A4C' } : SKINS[l.skin]
    : { body: 'rgba(2,8,4,0.86)', bar: col, barText: '#020804', ink: col, accent: col, alert: col, line: col, radius: 0, font: '"Space Mono", "DotGothic16", monospace', mono: '"Space Mono", "DotGothic16", monospace' };

// the whole window stays on screen, with room for a camera push-in (a director's y of 0.9 cut the title bar off)
const UI_MX = W * 0.07;
const UI_MY = H * 0.1;
/** Where a window is drawn: its centre clamped inside the margins, and its size. Placement checks use the same box. */
function uiBox(l: UiLayer) {
  // a cascade is placed as one block: the first copy's window plus the steps of the rest
  const extra = CASCADE_STEP * (cascadeOf(l) - 1);
  const w = (l.w ?? UI_W[l.type]) * W + extra;
  const h = (l.h ?? UI_H[l.type]) * H + extra;
  const px = Math.min(W - w / 2 - UI_MX, Math.max(w / 2 + UI_MX, W / 2 + (l.x ?? 0) * W / 2));
  const py = Math.min(H - h / 2 - UI_MY, Math.max(h / 2 + UI_MY, H / 2 - (l.y ?? 0) * H / 2));
  return { px, py, w, h };
}

const cascadeOf = (l: UiLayer) => Math.max(1, Math.min(8, Math.round(l.cascade ?? 1)));

/** A computer window: the look's phosphor glass, or a Mac / Windows window (one system per song); its content moves with time. */
function ui(ctx: CanvasRenderingContext2D, l: UiLayer, age: number, beat: Beat) {
  const n = cascadeOf(l);
  if (n > 1) {
    // the same window popping again and again, each copy a step down-right of the last (the desktop losing control)
    const { px, py, w, h } = uiBox(l);
    const w1 = w - CASCADE_STEP * (n - 1);
    const h1 = h - CASCADE_STEP * (n - 1);
    for (let k = 0; k < n; k++) {
      const cx = px - w / 2 + w1 / 2 + k * CASCADE_STEP;
      const cy = py - h / 2 + h1 / 2 + k * CASCADE_STEP;
      ctx.save();
      ui(ctx, { ...l, cascade: 1, delay: (l.delay ?? 0) + k * CASCADE_EVERY, x: (cx - W / 2) / (W / 2), y: (H / 2 - cy) / (H / 2) }, age, beat);
      ctx.restore();
    }
    return;
  }
  const local = age - (l.delay ?? 0);
  if (local < 0) return;
  if (l.type === 'cursor') {
    // a quiet section's whole desktop: one prompt, its line typed out, then the cursor blinking alone
    const { px, py } = uiBox(l);
    const line = `> ${(l.lines?.[0] ?? '').slice(0, Math.floor(local * 12))}`;
    ctx.font = `400 46px ${l.skin === 'mac' || l.skin === 'win' ? SKINS[l.skin].mono : '"Space Mono", "DotGothic16", monospace'}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = l.skin === 'mac' || l.skin === 'win' ? '#E6E6E6' : l.color;
    const x0 = px - ctx.measureText(`> ${l.lines?.[0] ?? ''}`).width / 2;
    ctx.globalAlpha *= Math.min(1, local / 0.3);
    ctx.fillText(line, x0, py);
    if (Math.floor(local / 0.53) % 2 === 0) ctx.fillRect(x0 + ctx.measureText(line).width + 8, py - 24, 26, 48);
    return;
  }
  const err = l.type === 'error';
  const col = err ? (l.alert ?? '#FF4040') : l.color;
  const { px, py, w, h } = uiBox(l);
  const pop = Math.min(1, local / 0.15);
  // an error dialog lands with a short shake, then blinks its title on the beat
  const shake = err && local < 0.35 ? Math.sin(local * 90) * 10 * (1 - local / 0.35) : 0;
  ctx.translate(px + shake, py);
  ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
  ctx.globalAlpha *= pop;
  ctx.translate(-w / 2, -h / 2);
  const sk = skinOf(l, col);
  const os = l.skin === 'mac' || l.skin === 'win';
  const bar = os ? 44 : 40;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, sk.radius);
  if (os) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = sk.body;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = sk.body;
    ctx.fill();
  }
  ctx.save();
  ctx.clip();
  ctx.globalAlpha *= !os && err && beat.since < 0.12 ? 0.35 : 1;
  ctx.fillStyle = sk.bar;
  ctx.fillRect(0, 0, w, bar);
  ctx.restore();
  ctx.strokeStyle = sk.line;
  ctx.lineWidth = os ? 1.5 : 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, sk.radius);
  ctx.stroke();
  const title = l.title ?? (err ? (os ? 'Error' : 'ERROR') : l.type === 'terminal' ? (os ? 'Terminal' : '~ $ terminal') : l.type);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = sk.barText;
  if (l.skin === 'mac') {
    // traffic lights left, title centred
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(24 + i * 26, bar / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = sk.barText;
    ctx.font = `600 22px ${sk.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, bar / 2 + 1, w - 200);
    ctx.textAlign = 'left';
  } else if (l.skin === 'win') {
    // title left, minimise / maximise / close right
    ctx.font = `400 21px ${sk.font}`;
    ctx.fillText(title, 16, bar / 2 + 1, w - 190);
    ctx.strokeStyle = sk.barText;
    ctx.lineWidth = 1.5;
    const cx0 = w - 30;
    ctx.beginPath();
    ctx.moveTo(cx0 - 7, bar / 2 - 7); ctx.lineTo(cx0 + 7, bar / 2 + 7);
    ctx.moveTo(cx0 + 7, bar / 2 - 7); ctx.lineTo(cx0 - 7, bar / 2 + 7);
    ctx.moveTo(w - 140, bar / 2); ctx.lineTo(w - 126, bar / 2);
    ctx.stroke();
    ctx.strokeRect(w - 92, bar / 2 - 7, 14, 14);
  } else {
    ctx.font = '700 24px "Space Mono", "DotGothic16", monospace';
    ctx.fillText(title, 12, bar / 2 + 1);
    for (let i = 0; i < 3; i++) ctx.strokeRect(w - 34 - i * 30, 11, 18, 18);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bar, w, h - bar);
  ctx.clip();
  const text = l.lines?.length ? l.lines : UI_TEXT[l.type];
  const fs = 26;
  const lh = fs * 1.4;
  const mono = l.type === 'terminal' || l.type === 'log' || l.type === 'code';
  ctx.font = `400 ${fs}px ${mono ? sk.mono : sk.font}`;
  ctx.fillStyle = sk.ink;
  const rows = Math.max(1, Math.floor((h - bar - 16) / lh));
  const blink = Math.floor(local / 0.53) % 2 === 0;
  switch (l.type) {
    case 'terminal': {
      // commands type in at 16 characters a second; the screen scrolls when it fills
      const typed = Math.floor(local * 16);
      const out: string[] = [];
      let n = 0;
      for (const line of text.flatMap((x, i) => [i % 2 === 0 ? `> ${x}` : x])) {
        if (n >= typed) break;
        out.push([...line].slice(0, typed - n).join(''));
        n += [...line].length;
      }
      const shown = out.slice(-rows);
      shown.forEach((x, i) => ctx.fillText(x, 14, bar + 12 + lh * (i + 0.5)));
      if (blink) {
        const last = shown[shown.length - 1] ?? '';
        ctx.fillRect(14 + ctx.measureText(last).width + 4, bar + 12 + lh * (shown.length - 0.5) - fs / 2, fs * 0.6, fs);
      }
      break;
    }
    case 'log':
    case 'code': {
      // a steady upward scroll, a line every 0.5 s (code scrolls slower, with line numbers)
      const speed = l.type === 'log' ? 2 : 0.8;
      const off = local * speed;
      for (let i = -1; i <= rows; i++) {
        const k = Math.floor(off) + i;
        const y = bar + 12 + lh * (i + 0.5 - (off % 1));
        const line = text[((k % text.length) + text.length) % text.length];
        const pre = l.type === 'log' ? `[${(k * 0.731 + 10).toFixed(3).padStart(8, ' ')}] ` : `${String((k % 99) + 1).padStart(2, ' ')}  `;
        ctx.globalAlpha *= l.type === 'code' ? 1 : 0.55 + 0.45 * hash(k, 3);
        ctx.fillText(pre + line, 14, y);
        ctx.globalAlpha /= l.type === 'code' ? 1 : 0.55 + 0.45 * hash(k, 3);
      }
      break;
    }
    case 'files': {
      // the selection walks down the list on the beat (highlighted row)
      const sel = Math.max(0, beat.index) % Math.min(rows, text.length);
      text.slice(0, rows).forEach((x, i) => {
        const y = bar + 12 + lh * (i + 0.5);
        if (i === sel) {
          ctx.fillStyle = sk.accent;
          ctx.beginPath();
          ctx.roundRect(8, y - lh / 2, w - 16, lh, os ? 6 : 0);
          ctx.fill();
        }
        ctx.fillStyle = i !== sel ? sk.ink : os ? '#FFFFFF' : '#020804';
        if (os) {
          // a plain document glyph, then name and size in columns
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(18, y - 11, 16, 22);
          ctx.fillText(x, 46, y, w - 190);
          ctx.textAlign = 'right';
          ctx.fillText(`${(hash(i, 5) * 900 + 12).toFixed(0)} KB`, w - 20, y);
          ctx.textAlign = 'left';
        } else ctx.fillText(`${x.padEnd(18, ' ')} ${(hash(i, 5) * 900 + 12).toFixed(0).padStart(4, ' ')}KB`, 14, y);
      });
      break;
    }
    case 'error': {
      const cy = bar + (h - bar) * 0.42;
      ctx.lineWidth = 3;
      if (os) {
        // Mac: a warning triangle; Windows: a red circle with a cross
        ctx.fillStyle = l.skin === 'mac' ? '#FFCC00' : sk.alert;
        ctx.beginPath();
        if (l.skin === 'mac') {
          ctx.moveTo(62, cy - 24); ctx.lineTo(88, cy + 22); ctx.lineTo(36, cy + 22); ctx.closePath();
        } else ctx.arc(62, cy, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = l.skin === 'mac' ? '#1D1D1F' : '#FFFFFF';
        ctx.font = `700 26px ${sk.font}`;
        ctx.textAlign = 'center';
        ctx.fillText(l.skin === 'mac' ? '!' : '✕', 62, cy + (l.skin === 'mac' ? 6 : 1));
        ctx.textAlign = 'left';
        ctx.fillStyle = sk.ink;
      } else {
        ctx.beginPath();
        ctx.moveTo(40, cy + 22);
        ctx.lineTo(62, cy - 20);
        ctx.lineTo(84, cy + 22);
        ctx.closePath();
        ctx.stroke();
        ctx.fillText('!', 56, cy + 6);
      }
      // the message shrinks to fit a window the lyrics squeezed
      const face = os ? sk.font : sk.mono;
      let mf = fs + 4;
      ctx.font = `700 ${mf}px ${face}`;
      while (mf > 14 && ctx.measureText(text[0]).width > w - 124) ctx.font = `700 ${--mf}px ${face}`;
      ctx.fillText(text[0], 104, cy);
      const bw = 110;
      if (os) {
        // the default button in the system accent
        ctx.fillStyle = sk.accent;
        ctx.beginPath();
        ctx.roundRect(w - bw - 20, h - 54, bw, 38, l.skin === 'mac' ? 8 : 4);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 22px ${sk.font}`;
        ctx.textAlign = 'center';
        ctx.fillText('OK', w - bw / 2 - 20, h - 35);
        ctx.textAlign = 'left';
      } else {
        ctx.lineWidth = 2;
        ctx.strokeRect(w / 2 - bw / 2, h - 52, bw, 36);
        ctx.font = `700 ${fs}px "Space Mono", monospace`;
        ctx.fillText('OK', w / 2 - 14, h - 34);
      }
      break;
    }
    case 'progress': {
      // fills over about eight seconds, then holds at 100 %
      const p = Math.min(1, local / 8);
      ctx.fillText(`${text[0]}...  ${Math.floor(p * 100)}%`, 14, bar + 28, w - 28);
      if (os) {
        // a continuous rounded bar in the system accent
        ctx.fillStyle = sk.line;
        ctx.beginPath();
        ctx.roundRect(14, bar + 58, w - 28, 12, 6);
        ctx.fill();
        ctx.fillStyle = sk.accent;
        ctx.beginPath();
        ctx.roundRect(14, bar + 58, Math.max(12, (w - 28) * p), 12, 6);
        ctx.fill();
        break;
      }
      const cells = 24;
      const cw = (w - 28) / cells;
      for (let i = 0; i < cells; i++) {
        if (i < Math.floor(p * cells)) ctx.fillRect(14 + i * cw, bar + 52, cw - 4, 26);
        else ctx.strokeRect(14 + i * cw, bar + 52, cw - 4, 26);
      }
      break;
    }
    case 'loading': {
      if (os) {
        // a spinner of fading spokes
        const cy = bar + (h - bar) / 2;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.globalAlpha *= ((i - Math.floor(local * 12) + 120) % 12) / 12 * 0.8 + 0.2;
          ctx.strokeStyle = sk.ink;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(44 + Math.cos(a) * 9, cy + Math.sin(a) * 9);
          ctx.lineTo(44 + Math.cos(a) * 18, cy + Math.sin(a) * 18);
          ctx.stroke();
          ctx.globalAlpha /= ((i - Math.floor(local * 12) + 120) % 12) / 12 * 0.8 + 0.2;
        }
        ctx.font = `500 ${fs}px ${sk.font}`;
        ctx.fillText(`${text[0]}${'.'.repeat(Math.floor(local * 2) % 4)}`, 80, cy, w - 100);
        break;
      }
      const spin = '|/-\\'[Math.floor(local * 8) % 4];
      ctx.font = `700 ${fs + 6}px "Space Mono", monospace`;
      ctx.fillText(`${spin}  ${text[0]}${'.'.repeat(Math.floor(local * 2) % 4)}`, 18, bar + (h - bar) / 2);
      break;
    }
  }
  ctx.restore();
}

function band(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'band' }>, t: number) {
  const h = l.height ?? 110;
  ctx.translate(W / 2, H / 2 - (l.y ?? 0) * H / 2);
  ctx.rotate(((l.angle ?? -8) * Math.PI) / 180);
  const L = W * 1.6;
  ctx.fillStyle = l.color;
  ctx.fillRect(-L / 2, -h / 2, L, h);
  if (l.type === 'tape' || l.type === 'marquee') {
    // diagonal hazard stripes (tape) or dots (marquee bulbs), scrolling along the band
    ctx.beginPath();
    ctx.rect(-L / 2, -h / 2, L, h);
    ctx.clip();
    ctx.fillStyle = l.color2 ?? '#111111';
    const step = l.type === 'tape' ? h * 0.9 : h * 0.6;
    const off = (t * (l.scroll ?? 120)) % step;
    for (let x = -L / 2 - step + off; x < L / 2 + step; x += step) {
      if (l.type === 'tape') {
        ctx.beginPath();
        ctx.moveTo(x, h / 2);
        ctx.lineTo(x + step / 2, h / 2);
        ctx.lineTo(x + step / 2 + h, -h / 2);
        ctx.lineTo(x + h, -h / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        for (const y of [-h / 4, h / 4]) {
          ctx.beginPath();
          ctx.arc(x, y, h * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s * 0.32, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s * 0.32, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

function shape(ctx: CanvasRenderingContext2D, type: Extract<Layer, { kind: 'shapes' }>['type'], s: number, color: string, outline: boolean) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.beginPath();
  switch (type) {
    case 'circle':
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 3, 0);
      ctx.lineTo(0, s / 2);
      ctx.lineTo(-s / 3, 0);
      ctx.closePath();
      break;
    case 'triangle':
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, s / 2);
      ctx.lineTo(-s / 2, s / 2);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.22 : s / 2;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.3, -s * 0.55, 0, -s * 0.2);
      ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.6, -s * 0.05, 0, s * 0.35);
      break;
    case 'cross':
      ctx.rect(-s / 2, -s * 0.12, s, s * 0.24);
      ctx.rect(-s * 0.12, -s / 2, s * 0.24, s);
      break;
  }
  if (outline) ctx.stroke();
  else ctx.fill();
}

// soft-edged pictures (dye bleeding, light under a leaf) drawn and blurred once: a canvas blur per stroke per frame
// took a 7-object photogram past the renderer's two-minute ready timeout
const blurCache = new Map<string, OffscreenCanvas>();
function blurredOnce(key: string, w: number, h: number, blur: number, draw: (c: OffscreenCanvasRenderingContext2D) => void): OffscreenCanvas {
  const hit = blurCache.get(key);
  if (hit) return hit;
  const raw = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  draw(raw.getContext('2d')!);
  let out = raw;
  if (blur > 0) {
    out = new OffscreenCanvas(raw.width, raw.height);
    const c = out.getContext('2d')!;
    c.filter = `blur(${blur}px)`;
    c.drawImage(raw, 0, 0);
  }
  if (blurCache.size > 48) blurCache.clear();
  blurCache.set(key, out);
  return out;
}

type Mosaic = Extract<Layer, { kind: 'mosaic' }>;

/** One pane of leaded glass: its colour lit by where the sun is (`light` 0..1), then the lead line around it. */
function pane(ctx: CanvasRenderingContext2D, l: Mosaic, path: () => void, k: number, light: number) {
  const a = l.opacity ?? 1;
  ctx.globalAlpha = a * (0.45 + 0.55 * light);
  ctx.fillStyle = l.colors[Math.floor(hash(k, (l.seed ?? 0) + 5) * l.colors.length)];
  ctx.beginPath();
  path();
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.stroke();
}

/** A rose window: a centre disc, a ring of petals, a ring of roundels, leaded and set in a stone ring; the sun moves
 * round it so the lit side keeps changing. */
function roseWindow(ctx: CanvasRenderingContext2D, l: Mosaic, t: number) {
  const cx = W / 2 + ((l.x ?? 0) * W) / 2;
  const cy = H / 2 - ((l.y ?? 0) * H) / 2;
  const R = (l.r ?? 0.46) * H;
  const n = Math.max(6, Math.min(16, l.cells ?? 12));
  const sun = t * 0.18;
  const lit = (ang: number) => 0.5 + 0.5 * Math.cos(ang - sun);
  ctx.strokeStyle = l.color ?? '#141018';
  ctx.lineWidth = 6;
  pane(ctx, l, () => ctx.arc(cx, cy, R * 0.17, 0, Math.PI * 2), 0, 1);
  for (let i = 0; i < n; i++) {
    const [a0, a1] = [(i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2];
    const am = (a0 + a1) / 2;
    // inner ring: wedges between the centre and the petals
    pane(ctx, l, () => { ctx.arc(cx, cy, R * 0.5, a0, a1); ctx.arc(cx, cy, R * 0.17, a1, a0, true); ctx.closePath(); }, i + 1, lit(am));
    // petals: a pointed lobe on each wedge
    pane(ctx, l, () => ctx.arc(cx + Math.cos(am) * R * 0.64, cy + Math.sin(am) * R * 0.64, R * 0.15, 0, Math.PI * 2), i + 40, lit(am));
    // outer roundels, two per wedge
    for (const f of [0.25, 0.75]) {
      const ao = a0 + (a1 - a0) * f;
      pane(ctx, l, () => ctx.arc(cx + Math.cos(ao) * R * 0.88, cy + Math.sin(ao) * R * 0.88, R * 0.09, 0, Math.PI * 2), i * 2 + 80 + f * 4, lit(ao));
    }
  }
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  // light breathing through the glass
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
  g.addColorStop(0, 'rgba(255,240,210,0.16)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
  ctx.globalCompositeOperation = 'source-over';
}

/** Three pointed-arch lancet windows of diamond quarries with a roundel in each; a band of sunlight crosses them. */
function lancets(ctx: CanvasRenderingContext2D, l: Mosaic, t: number) {
  const lead = l.color ?? '#141018';
  const yb = H * 0.94;
  const sweep = ((t * 0.08) % 1.6) - 0.3;
  const wins = [[W * 0.2, W * 0.15, H * 0.42], [W * 0.5, W * 0.18, H * 0.3], [W * 0.8, W * 0.15, H * 0.42]] as const;
  wins.forEach(([cx, w, ys], wi) => {
    const [xl, xr] = [cx - w / 2, cx + w / 2];
    const outline = () => {
      ctx.moveTo(xl, yb);
      ctx.lineTo(xl, ys);
      ctx.arc(xr, ys, w, Math.PI, (Math.PI * 4) / 3);
      ctx.arc(xl, ys, w, -Math.PI / 3, 0);
      ctx.lineTo(xr, yb);
      ctx.closePath();
    };
    ctx.save();
    ctx.beginPath();
    outline();
    ctx.clip();
    ctx.strokeStyle = lead;
    ctx.lineWidth = 4;
    const q = w / 3.2;
    const top = ys - w * 0.9;
    for (let j = 0; top + (j - 1) * q * 0.7 < yb; j++)
      for (let i = -1; i < 5; i++) {
        const [x, y] = [xl + i * q + (j % 2 ? q / 2 : 0), top + j * q * 0.7];
        const light = Math.max(0, 1 - Math.abs(x / W - sweep - (y / H) * 0.3) * 3);
        pane(ctx, l, () => { ctx.moveTo(x, y - q * 0.7); ctx.lineTo(x + q / 2, y); ctx.lineTo(x, y + q * 0.7); ctx.lineTo(x - q / 2, y); ctx.closePath(); }, wi * 97 + j * 7 + i, 0.35 + 0.65 * light);
      }
    // a roundel in the head of each window
    ctx.lineWidth = 6;
    pane(ctx, l, () => ctx.arc(cx, ys - w * 0.1, w * 0.3, 0, Math.PI * 2), wi + 300, 1);
    ctx.restore();
    ctx.strokeStyle = lead;
    ctx.lineWidth = 16;
    ctx.beginPath();
    outline();
    ctx.stroke();
  });
}

/** Cyanotype photogram objects: white silhouettes of plants and feathers laid round the edges of the sheet, each with
 * the soft halo light leaves where it crept under the object. */
function botanicals(ctx: CanvasRenderingContext2D, l: Extract<Layer, { kind: 'botanical' }>, t: number) {
  const n = l.count ?? 6;
  const types = ['fern', 'leaf', 'flower', 'feather'] as const;
  ctx.fillStyle = l.color;
  ctx.strokeStyle = l.color;
  for (let i = 0; i < n; i++) {
    const seed = (l.seed ?? 0) * 53 + i;
    const type = !l.type || l.type === 'mixed' ? types[Math.floor(hash(seed, 1) * 4)] : l.type;
    // round the edges, the centre left for the lyrics
    const side = i % 4;
    const u = hash(seed, 2);
    const [x, y] = side === 0 ? [u * W, H * 0.06] : side === 1 ? [W * 0.94, u * H] : side === 2 ? [u * W, H * 0.94] : [W * 0.06, u * H];
    const size = (l.size ?? 380) * (0.7 + 0.6 * hash(seed, 3));
    const rot = Math.atan2(H / 2 - y, W / 2 - x) + (hash(seed, 4) - 0.5) * 1.2 + 0.06 * Math.sin(t * 0.6 + i);
    // the halo and the crisp silhouette are blurred once, then placed every frame
    // the stem runs from the centre to +size and a flower's petals reach past its end: the canvas must hold 1.3 × size
    // each side plus the halo blur, or the head was cut off flat
    const box = Math.ceil(size * 2.8 + 40);
    const img = blurredOnce(`bot${type}${Math.round(size)}${seed}${l.color}`, box, box, 0, (c) => {
      for (const [blur, alpha] of [[10, 0.3], [1.2, 0.92]] as const) {
        const tmp = new OffscreenCanvas(box, box);
        const tc = tmp.getContext('2d')!;
        tc.fillStyle = tc.strokeStyle = l.color;
        tc.translate(box / 2, box / 2);
        drawBotanical(tc as unknown as CanvasRenderingContext2D, type, size, seed);
        c.filter = `blur(${blur}px)`;
        c.globalAlpha = alpha;
        c.drawImage(tmp, 0, 0);
      }
    });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(img, -box / 2, -box / 2);
    ctx.restore();
  }
}

function drawBotanical(ctx: CanvasRenderingContext2D, type: 'fern' | 'leaf' | 'flower' | 'feather', s: number, seed: number) {
  const bend = (hash(seed, 6) - 0.5) * 0.5;
  // the stem / shaft runs from the origin along +x, curving
  const at = (u: number) => [u * s, Math.sin(u * Math.PI) * bend * s * 0.3] as const;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, s * 0.012);
  ctx.beginPath();
  for (let k = 0; k <= 20; k++) ctx.lineTo(...at(k / 20));
  ctx.stroke();
  if (type === 'fern' || type === 'feather') {
    const pairs = type === 'fern' ? 16 : 60;
    for (let k = 1; k < pairs; k++) {
      const u = k / pairs;
      const [px, py] = at(u);
      const len = s * (type === 'fern' ? 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.15)) : 0.16 * Math.sqrt(Math.sin(Math.PI * u)));
      for (const d of [-1, 1]) {
        const a = d * (type === 'fern' ? 1.05 : 0.6);
        if (type === 'fern') {
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5, len * 0.5, len * 0.13, a, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
          ctx.stroke();
        }
      }
    }
    return;
  }
  if (type === 'leaf') {
    // two halves with a thin gap down the midrib
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.15, d * 3);
      ctx.bezierCurveTo(s * 0.4, d * s * 0.3, s * 0.85, d * s * 0.22, s, d * 2);
      ctx.lineTo(s * 0.15, d * 3);
      ctx.fill();
    }
    return;
  }
  // flower: petals round a centre at the stem's end
  const [fx, fy] = at(1);
  const petals = 5 + Math.floor(hash(seed, 7) * 4);
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * s * 0.13, fy + Math.sin(a) * s * 0.13, s * 0.13, s * 0.055, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The design language's own peak move (languages.ts `native`), drawn over the look for ~1.5 s after each drop or
 * finale: it replaces the generic radial glow every song used to share. `since` is seconds since the drop.
 */
export function drawNative(ctx: CanvasRenderingContext2D, language: string, since: number, sec: LookSection, beat: Beat) {
  if (since < 0 || since > 1.6) return;
  const k = Math.min(1, since / 0.18);
  const fade = since > 1.1 ? 1 - (since - 1.1) / 0.5 : 1;
  const accent = sec.accent ?? '#ff3355';
  const ink = sec.text ?? '#111111';
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  switch (language) {
    case 'dossier': {
      // a giant rubber stamp slams down in the centre
      const s = 2.4 - 1.4 * (1 - (1 - k) ** 3);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.16);
      ctx.scale(s, s);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 16;
      roundRect(ctx, -330, -130, 660, 260, 36);
      ctx.stroke();
      ctx.lineWidth = 6;
      roundRect(ctx, -300, -100, 600, 200, 24);
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 260; i++) ctx.fillRect((hash(i, 81) - 0.5) * 680, (hash(i, 82) - 0.5) * 280, 3 + hash(i, 83) * 5, 3);
      break;
    }
    case 'ukiyoe': {
      // a great wave of seigaiha rises from the bottom and falls back
      const rise = since < 0.5 ? (1 - (1 - since / 0.5) ** 3) : 1 - Math.min(1, (since - 0.5) / 1.0) ** 2;
      const top = H - rise * H * 0.45; // stays under the lyric band
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, top + Math.sin(x / 140 + since * 4) * 26);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = '#1F3F7A';
      ctx.fill();
      ctx.clip();
      draw(ctx, { kind: 'pattern', type: 'waves', color: '#EFE4CC', scale: 110 }, since, since, beat, () => undefined);
      break;
    }
    case 'swiss': {
      // the page flips to the signal colour for one beat (the lyrics stay on top, so no true inversion)
      if (since < 0.45) {
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'terminal': {
      // the character field floods to full density
      const cols = 96;
      const cw = W / cols;
      const ch = cw * 2;
      ctx.font = `${ch * 0.9}px "Space Mono", monospace`;
      // the language's one phosphor (languages.ts terminal), dim enough that the error windows and lyrics read over it
      ctx.fillStyle = '#0B5A22';
      ctx.textBaseline = 'top';
      const ramp = '.:-=+*#%@';
      for (let j = 0; j < Math.ceil(H / ch); j++)
        for (let i = 0; i < cols; i++) {
          const d = Math.min(1, k * 1.2 - Math.hypot(i / cols - 0.5, j / (H / ch) - 0.5) * (1 - k) * 2);
          if (d > 0.05) ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(d * ramp.length))], i * cw, j * ch);
        }
      // the system is breached: error dialogs pop one after another round the edges, clear of the centred lyrics —
      // only when the director put an error window in this section (the lyrics are about a failure, a break, a loss)
      if (sec.layers.some((l) => l.kind === 'ui' && l.type === 'error')) ['SYSTEM BREACH', 'ACCESS DENIED', 'SIGNAL LOST', 'FATAL ERROR'].forEach((msg, i) => {
        ctx.save();
        ui(ctx, { kind: 'ui', type: 'error', color: '#3DFF6E', alert: '#FF4040', x: [-0.62, 0.6, -0.55, 0.64][i], y: [0.62, 0.55, -0.6, -0.64][i], w: 0.3, h: 0.2, lines: [msg], delay: i * 0.12 }, since, beat);
        ctx.restore();
      });
      break;
    }
    case 'cel80s': {
      // tape power-on: a bright line opens into the frame
      const open = Math.min(1, since / 0.3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,240,255,0.9)';
      const h = 6 + open * H;
      ctx.globalAlpha *= 1 - open * 0.85;
      ctx.fillRect(0, H / 2 - h / 2, W, h);
      break;
    }
    case 'gameshow': {
      // a judgement star bursts from the centre, spinning
      ctx.translate(W / 2, H / 2);
      ctx.rotate(since * 2.5);
      const s = (0.3 + 1.2 * k) * H;
      ctx.fillStyle = accent;
      ctx.strokeStyle = '#1B1B2F';
      ctx.lineWidth = 16;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.22 : s / 2;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.globalAlpha *= 0.85;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'papercut': {
      // backlight: warm light glows through the frame
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(255,190,90,0.75)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.globalAlpha *= k;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'silkscreen':
    case 'risograph': {
      // a squeegee pull: a band of the accent ink wipes across once
      const x = -W * 0.2 + Math.min(1, since / 0.35) * W * 1.4;
      ctx.fillStyle = accent;
      ctx.globalAlpha *= since < 0.35 ? 0.85 : 0;
      ctx.fillRect(x - 60, 0, 120, H);
      break;
    }
    case 'art-deco':
    case 'midcentury': {
      // a fan of rays opens from the bottom centre (deco gold / atomic starburst)
      const open = Math.min(1, since / 0.4);
      ctx.translate(W / 2, H);
      ctx.fillStyle = language === 'art-deco' ? '#d4af37' : accent;
      for (let i = 0; i < 13; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        if (i % 2) continue;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.06) * H * 1.6 * open, Math.sin(a - 0.06) * H * 1.6 * open);
        ctx.lineTo(Math.cos(a + 0.06) * H * 1.6 * open, Math.sin(a + 0.06) * H * 1.6 * open);
        ctx.closePath();
        ctx.globalAlpha *= 0.9;
        ctx.fill();
      }
      break;
    }
    case 'blueprint':
    case 'hologram': {
      // a scan sweeps down the frame and a target box locks on the centre
      const y = Math.min(1, since / 0.5) * H;
      ctx.fillStyle = language === 'blueprint' ? 'rgba(231,240,249,0.8)' : accent;
      ctx.fillRect(0, y - 3, W, 6);
      ctx.strokeStyle = language === 'blueprint' ? '#e7f0f9' : accent;
      ctx.lineWidth = 4;
      const s = 520 - 200 * Math.min(1, since / 0.3);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + dx * s, H / 2 + dy * (s * 0.55 - 60));
        ctx.lineTo(W / 2 + dx * s, H / 2 + dy * s * 0.55);
        ctx.lineTo(W / 2 + dx * (s - 60), H / 2 + dy * s * 0.55);
        ctx.stroke();
      }
      break;
    }
    case 'ink-wash':
    case 'watercolor': {
      // a drop of ink (or pigment) blooms out from the centre
      const r = (1 - (1 - Math.min(1, since / 0.7)) ** 3) * H * 0.9;
      const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.2, W / 2, H / 2, r);
      g.addColorStop(0, language === 'ink-wash' ? 'rgba(20,18,16,0.55)' : accent);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha *= 0.6;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'stained-glass': {
      // a shaft of sunlight crosses the window
      const x = -W * 0.3 + Math.min(1, since / 0.9) * W * 1.6;
      const g = ctx.createLinearGradient(x - 260, 0, x + 260, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.75)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'spy-titles':
    case 'woodcut': {
      // a black silhouette slab wipes across (cut paper / carved block), leaving the frame as it passes
      const x = -W + Math.min(1, since / 0.45) * W * 2.2;
      ctx.fillStyle = language === 'woodcut' ? '#0c0b0a' : '#1b1714';
      ctx.globalAlpha *= since < 0.45 ? 1 : 0;
      ctx.fillRect(x, 0, W * 0.5, H);
      break;
    }
    case 'pictogram': {
      // the disc grid flips: every cell pops to the accent for one beat
      const n = 8;
      const cw = W / n;
      ctx.fillStyle = accent;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < 5; j++) {
          const k = Math.min(1, Math.max(0, (since - (i + j) * 0.03) / 0.15));
          ctx.beginPath();
          ctx.arc(i * cw + cw / 2, j * (H / 5) + H / 10, (cw * 0.42) * k * (since < 0.6 ? 1 : 0), 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    }
    case 'silent-film': {
      // iris: the frame closes to a circle and opens again
      const k = since < 0.35 ? 1 - since / 0.35 : Math.min(1, (since - 0.35) / 0.5);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, Math.max(4, k * H * 1.1), 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      break;
    }
    case 'paper-lantern': {
      // the lantern brightens: warm light glows through the layers
      const g = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, H);
      g.addColorStop(0, 'rgba(255,184,98,0.7)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.globalAlpha *= k;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'crayon': {
      // a colour wash scribbles over the page
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 60;
      ctx.lineCap = 'round';
      ctx.globalAlpha *= 0.35;
      const n = Math.floor(k * 14);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(-50, i * 80 + hash(i, 91) * 40);
        ctx.lineTo(W + 50, i * 80 + 60 + hash(i, 92) * 40);
        ctx.stroke();
      }
      break;
    }
    case 'screentone': {
      // manga focus lines close in on the centre, then the tone flashes
      draw(ctx, { kind: 'speedlines', color: ink, count: 90, inner: 0.55 - 0.25 * k }, since, since, beat, () => undefined);
      if (since < 0.12) {
        ctx.globalAlpha *= 0.5;
        draw(ctx, { kind: 'pattern', type: 'halftone', color: ink, scale: 14 }, since, since, beat, () => undefined);
      }
      break;
    }
    case 'chiyogami': {
      // a square of patterned paper folds open from the centre like origami
      const r = (0.1 + 0.9 * k) * H * 0.75;
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI / 4 * (1 - k));
      ctx.beginPath();
      ctx.rect(-r, -r, r * 2, r * 2);
      ctx.clip();
      ctx.fillStyle = accent;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.translate(-W / 2, -H / 2);
      draw(ctx, { kind: 'pattern', type: 'gingham', color: '#FFFFFF', scale: 60 }, since, since, beat, () => undefined);
      break;
    }
    case 'aizome': {
      // indigo blooms outward, white resist rings left where it never reached
      const r = (0.15 + 0.85 * k) * Math.hypot(W, H) * 0.5;
      ctx.fillStyle = '#1D3461';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#EEF2F6';
      for (let i = 1; i <= 5; i++) {
        ctx.lineWidth = 10 - i;
        ctx.globalAlpha = Math.max(0, fade) * (0.5 - i * 0.06);
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r * (i / 6), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'citypop': {
      // a striped sun rises over the horizon
      const cy = H * (0.95 - 0.35 * k);
      const rad = H * 0.32;
      ctx.beginPath();
      ctx.arc(W / 2, cy, rad, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? accent : '#FFD27A';
        ctx.fillRect(W / 2 - rad, cy - rad + (i * rad * 2) / 9, rad * 2, (rad * 2) / 9 - (i > 4 ? (i - 4) * 4 : 0));
      }
      break;
    }
    case 'y2k': {
      // a chrome sparkle bursts with a ring of bubbles
      ctx.translate(W / 2, H / 2);
      const s = (0.2 + 0.9 * k) * H * 0.4;
      const g = ctx.createLinearGradient(-s, -s, s, s);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.45, '#B9C6D8');
      g.addColorStop(0.55, '#FFFFFF');
      g.addColorStop(1, '#8EA0BC');
      ctx.fillStyle = g;
      star4(ctx, 0, 0, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + since;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 1.6, Math.sin(a) * s * 1.6, 10 + hash(i, 61) * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'gothic-lolita': {
      // a crimson cross of light opens through the dark
      const t = Math.min(1, since / 0.35);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = accent;
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(W / 2 - 14 - 30 * t, 0, 28 + 60 * t, H);
      ctx.fillRect(0, H * 0.38 - 10 - 22 * t, W, 20 + 44 * t);
      break;
    }
    case 'embroidery': {
      // a stitched heart draws itself, stitch by stitch
      ctx.translate(W / 2, H / 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.setLineDash([22, 14]);
      const n = Math.floor(k * 120);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / 120) * Math.PI * 2;
        const x = 16 * Math.sin(a) ** 3;
        const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        if (i) ctx.lineTo(x * 22, y * 22);
        else ctx.moveTo(x * 22, y * 22);
      }
      ctx.stroke();
      break;
    }
    case 'chalkboard': {
      // a chalk star is scribbled in one stroke, dust flying off it
      ctx.translate(W / 2, H / 2);
      ctx.strokeStyle = 'rgba(246,244,236,0.9)';
      ctx.lineWidth = 12;
      ctx.lineJoin = 'round';
      const n = Math.floor(k * 5) + 1;
      const r = H * 0.33;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(246,244,236,0.6)';
      for (let i = 0; i < 60; i++) ctx.fillRect((hash(i, 71) - 0.5) * r * 2.4 * k, (hash(i, 72) - 0.5) * r * 2.4 * k, 3, 3);
      break;
    }
    case 'cyanotype': {
      // the print is exposed: a white flash fades back to Prussian blue
      ctx.fillStyle = '#F1F5F8';
      ctx.globalAlpha *= Math.max(0, 1 - since / 0.6);
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'claymation': {
      // a big clay blob squashes onto the stage and springs up
      const squash = since < 0.25 ? 1 - since / 0.25 : 0;
      const sx = 1 + 0.35 * squash;
      const sy = 1 - 0.3 * squash;
      ctx.translate(W / 2, H * 0.78);
      ctx.scale(sx * k, sy * k);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, -H * 0.18, H * 0.26, H * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-H * 0.08, -H * 0.27, H * 0.06, H * 0.035, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
  void ink;
}

/** A rectangle in frame px, top-left origin. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The frame area a movable layer covers (photos that are not full frame, blobs, stamps, seals, numerals). */
export function layerRect(l: Layer): Rect | undefined {
  const cx = (x?: number) => W / 2 + (x ?? 0) * W / 2;
  const cy = (y?: number) => H / 2 - (y ?? 0) * H / 2;
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
  switch (l.kind) {
    case 'photo': {
      if (l.mode === 'full' || l.mode === 'band') return undefined;
      const bw = (l.w ?? 0.42) * W;
      const bh = l.mode === 'circle' ? bw : (l.h ?? 0.5) * H + (l.mode === 'polaroid' ? 110 : 0);
      return box(cx(l.x), cy(l.y), bw + 44, bh + 44);
    }
    case 'blob': {
      const r = (l.r ?? 0.35) * H;
      return box(cx(l.x), cy(l.y), 2 * r, 2 * r);
    }
    case 'stamp': {
      const s = l.size ?? 64;
      return box(cx(l.x), cy(l.y), s * ([...String(l.text ?? '')].length + 0.9), s * 1.6);
    }
    case 'seal': {
      const s = l.size ?? 90;
      return box(cx(l.x ?? 0.85), cy(l.y ?? -0.8), s, s);
    }
    case 'numeral': {
      const s = (l.size ?? 0.8) * H;
      return box(cx(l.x), cy(l.y), s * 0.62 * [...String(l.text ?? '')].length, s);
    }
    case 'ui': {
      const b = uiBox(l);
      return box(b.px, b.py, b.w, b.h);
    }
    case 'sprite':
    case 'card':
    case 'thread':
      return storyRect(l);
    default:
      return undefined;
  }
}

/**
 * Moves (then, if no place is free, shrinks) a movable layer so it does not cover the lyrics' area: tried in order —
 * slide sideways to the roomier side, slide up or down, shrink to 75 % and 55 % at each place. Returns the layer
 * unchanged when it does not overlap or cannot be placed (the type's knockout handles the rest).
 */
export function avoid(l: Layer, lyrics: Rect, margin = 24, others: Rect[] = []): Layer {
  const r = layerRect(l);
  if (!r || l.fixed) return l;
  const guard = { x0: lyrics.x0 - margin, y0: lyrics.y0 - margin, x1: lyrics.x1 + margin, y1: lyrics.y1 + margin };
  if (!overlaps(r, guard)) return l;
  if (l.kind === 'sprite' && l.pass) {
    // a prop on its way (an orbit, a journey, a float) passes behind the line, fading by how much it covers it:
    // pushed aside every frame it would jump about
    const cover = (Math.max(0, Math.min(r.x1, guard.x1) - Math.max(r.x0, guard.x0)) * Math.max(0, Math.min(r.y1, guard.y1) - Math.max(r.y0, guard.y0))) / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0));
    return { ...l, opacity: (l.opacity ?? 1) * (1 - 0.65 * Math.min(1, cover)) };
  }
  const clash = (q: Rect) => overlaps(q, guard) || others.some((o) => overlaps(q, o));
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  // a window must land inside its own margins, or the draw clamps it back over the line
  const [mx, my] = l.kind === 'ui' ? [UI_MX, UI_MY] : [0, 0];
  const inFrame = (q: Rect) => q.x0 >= mx - 1 && q.y0 >= my - 1 && q.x1 <= W - mx + 1 && q.y1 <= H - my + 1;
  // a story prop is the subject, not decoration: it may give way a little but never shrinks into a corner
  const story = l.kind === 'sprite' || l.kind === 'card';
  for (const k of story ? [1, 0.85] : [1, 0.75, 0.55]) {
    const ww = w * k;
    const hh = h * k;
    const cy0 = (r.y0 + r.y1) / 2;
    const cx0 = (r.x0 + r.x1) / 2;
    const roomL = guard.x0;
    const roomR = W - guard.x1;
    const spots = [
      // sideways first, toward the roomier side
      ...(roomR >= roomL ? [guard.x1 + ww / 2, guard.x0 - ww / 2] : [guard.x0 - ww / 2, guard.x1 + ww / 2]).map((x) => [x, cy0]),
      [cx0, guard.y0 - hh / 2],
      [cx0, guard.y1 + hh / 2],
    ];
    for (const [x, y] of spots) {
      // keep it inside the frame along the free axis
      const fx = Math.min(W - ww / 2 - mx, Math.max(ww / 2 + mx, x));
      const fy = Math.min(H - hh / 2 - my, Math.max(hh / 2 + my, y));
      const q = { x0: fx - ww / 2, y0: fy - hh / 2, x1: fx + ww / 2, y1: fy + hh / 2 };
      if (!inFrame(q) || clash(q)) continue;
      return resize({ ...l, x: (fx - W / 2) / (W / 2), y: (H / 2 - fy) / (H / 2) } as Layer, k);
    }
  }
  // a picture or letters (a photo inset, a stamp, a seal, a numeral) behind the words is what makes them hard to read
  // (チョロイン c003: blue type over a blue stage photo); a flat shape (a blob, a disc) may stay behind them by design
  const busy = l.kind === 'photo' || l.kind === 'stamp' || l.kind === 'seal' || l.kind === 'numeral';
  if (story || busy) {
    // no room next to the line: the object crosses to the far side or another free spot (nearest first) rather than
    // fading behind the line (落ちた風鈴 dimmed to a ghost beside the vertical lyrics)
    const cx0 = (r.x0 + r.x1) / 2;
    const cy0 = (r.y0 + r.y1) / 2;
    const near = (ss: number[][]) => ss.sort((a, b) => Math.hypot(a[0] - cx0, a[1] - cy0) - Math.hypot(b[0] - cx0, b[1] - cy0));
    const spots = near([[W - cx0, cy0], [cx0, H - cy0], [W - cx0, H - cy0], ...[0.2, 0.5, 0.8].flatMap((fx) => [0.25, 0.5, 0.75].map((fy) => [W * fx, H * fy]))]);
    // then against the frame's edges (a strip beside lines that fill the middle), a card down to 70 %
    const edges = near([...[0.15, 0.5, 0.85].flatMap((fy) => [[0, H * fy], [W, H * fy]]), ...[0.25, 0.5, 0.75].flatMap((fx) => [[W * fx, 0], [W * fx, H]])]);
    const tries: [number[][], number[]][] = [
      [spots, story ? [1, 0.85] : [1, 0.75, 0.55]],
      [[...spots, ...edges], l.kind === 'card' ? [1, 0.85, 0.7] : story ? [1, 0.85] : [1, 0.75, 0.55, 0.4]],
    ];
    for (const [where, scales] of tries)
      for (const k of scales)
        for (const [x, y] of where) {
          const fx = Math.min(W - (w * k) / 2, Math.max((w * k) / 2, x));
          const fy = Math.min(H - (h * k) / 2, Math.max((h * k) / 2, y));
          const q = { x0: fx - (w * k) / 2, y0: fy - (h * k) / 2, x1: fx + (w * k) / 2, y1: fy + (h * k) / 2 };
          if (!clash(q)) return resize({ ...l, x: (fx - W / 2) / (W / 2), y: (H / 2 - fy) / (H / 2) } as Layer, k);
        }
    // a frame full of type: a photo stays where it is (the line's halo carries it; a frame emptied of its picture read
    // as dead, チョロイン 0-20 s), and so does key story content (a hero at a turn of its story, a card about the line
    // being sung: the line is read against it, engine.ts); the rest leaves (opacity 0; the caller fades it out and back
    // in) instead of staying half-transparent behind the words, where its text showed through them (c061's cards)
    return l.kind === 'photo' || (l as StoryLayer).key ? l : ({ ...l, opacity: 0 } as Layer);
  }
  // a window with nowhere to go (huge beat-cut type over the whole frame) steps back behind the line instead
  return l.kind === 'ui' ? { ...l, opacity: 0.45 } : l;
}

/**
 * A layer's placement eased over the frames before it: `samples` are the same object as planned and as placed (after
 * making room) at t and in the frames before (undefined where it was not up yet). Its shift, size and opacity are
 * the mean of what making room did to it over those frames, so any change — a line coming up, a card landing, a pile
 * thinning out, a prop leaving — glides and fades over the window instead of jumping. Untouched, it is `plan` itself.
 */
export function smoothPlacement(plan: Layer, samples: ({ plan: Layer; placed: Layer } | undefined)[], glide = samples.length): Layer {
  const r0 = layerRect(plan);
  if (!r0 || plan.kind === 'code') return samples[0]?.placed ?? plan;
  // a photo's box carries a fixed 22 px margin each side; the rest scale with the layer
  const pad = plan.kind === 'photo' ? 44 : 0;
  const have = samples.flatMap((s, i) => {
    const a = s && layerRect(s.plan);
    const b = s && layerRect(s.placed);
    if (!s || !a || !b) return [];
    const pa = s.plan.opacity ?? 1;
    return [{ i, dx: (b.x0 + b.x1 - a.x0 - a.x1) / 2, dy: (b.y0 + b.y1 - a.y0 - a.y1) / 2, k: (b.x1 - b.x0 - pad) / Math.max(1, a.x1 - a.x0 - pad), o: pa > 1e-3 ? (s.placed.opacity ?? 1) / pa : 1 }];
  });
  // the plain glide and fade read the latest `glide` samples; a long move fades over the whole look-back
  const recent = have.filter((h) => h.i < glide);
  if (!recent.length) return plan;
  // a long move (a prop crossing to the far side of the frame) does not slide: on the way it would sweep across the
  // words it makes room for (チョロイン 163.5 s, the carousel horse through c062). It fades out where it was, changes
  // place unseen and fades in at the new one, each over half the look-back (density proposal §3.4: 0.3–0.4 s fades;
  // the koma of a stepped medium turned a 0.2 s fade into 0.4 jumps between frames)
  const dist = (a: (typeof have)[number], b: (typeof have)[number]) => Math.hypot(a.dx - b.dx, a.dy - b.dy);
  // (pictures and letters only: a flat shape behind the words is there by design, and a sun fading out and in at every
  // line change of 行星 read as a flicker)
  const pictured = plan.kind === 'sprite' || plan.kind === 'card' || plan.kind === 'photo' || plan.kind === 'stamp' || plan.kind === 'seal' || plan.kind === 'numeral';
  // the latest long move in the window (frames before it are where the object was): two changes close together (a
  // line, then a card landing 0.24 s later) count from the latest, so the object never flashes up between them
  const m0 = pictured ? have.findIndex((h, i) => i > 0 && dist(h, have[i - 1]) > JUMP_PX / 2 && dist(h, have[0]) > JUMP_PX) : -1;
  // a move to or from nowhere (leaving for want of room, coming back) is a plain fade where it shows, over the whole
  // window: cross-faded, it was gone in half the time (the carousel horse at チョロイン 14.4 s, 1 → 0 in five frames)
  const seen = (hs: typeof have) => hs.reduce((sum, h) => sum + h.o, 0) / Math.max(1, hs.length) > 0.02;
  const m = m0 > 0 && seen(have.slice(0, m0)) && seen(have.slice(m0)) ? m0 : -1;
  const jump = m > 0;
  const showing = m0 > 0 && !jump ? (seen(have.slice(0, m0)) ? have.slice(0, m0) : have.slice(m0)).filter((h) => h.i < glide) : undefined;
  // (the share of the window already at the new place: under half, the old place still shows, fading)
  const arrived = jump ? m / have.length : 1;
  const side0 = jump ? (arrived >= 0.5 ? have.slice(0, m) : have.slice(m).filter((h) => dist(h, have[m]) <= JUMP_PX / 2)) : showing?.length ? showing : recent;
  const side = side0.length ? side0 : recent;
  const mean = (f: (h: (typeof have)[number]) => number, hs = side) => hs.reduce((sum, h) => sum + f(h), 0) / hs.length;
  const [dx, dy, k] = [mean((h) => h.dx), mean((h) => h.dy), mean((h) => h.k)];
  const o = jump ? mean((h) => h.o) * Math.abs(2 * arrived - 1) : mean((h) => h.o, recent);
  const moved = Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6;
  const cx = (r0.x0 + r0.x1) / 2 + dx;
  const cy = (r0.y0 + r0.y1) / 2 + dy;
  const at = moved ? ({ ...plan, x: (cx - W / 2) / (W / 2), y: (H / 2 - cy) / (H / 2) } as Layer) : plan;
  const sized = Math.abs(k - 1) > 1e-6 ? resize(at, k) : at;
  return Math.abs(o - 1) > 1e-6 ? ({ ...sized, opacity: (plan.opacity ?? 1) * o } as Layer) : sized;
}

/** A move longer than this (frame px) within the glide fades out and in rather than sliding (smoothPlacement). */
const JUMP_PX = 160;

function resize(l: Layer, k: number): Layer {
  if (k === 1) return l;
  switch (l.kind) {
    case 'photo':
      return { ...l, w: (l.w ?? 0.42) * k, h: (l.h ?? 0.5) * k };
    case 'blob':
      return { ...l, r: (l.r ?? 0.35) * k };
    case 'stamp':
      return { ...l, size: (l.size ?? 64) * k };
    case 'seal':
      return { ...l, size: (l.size ?? 90) * k };
    case 'numeral':
      return { ...l, size: (l.size ?? 0.8) * k };
    case 'ui':
      return { ...l, w: (l.w ?? UI_W[l.type]) * k, h: (l.h ?? UI_H[l.type]) * k };
    case 'sprite':
      return { ...l, size: l.size * k };
    case 'card':
      return { ...l, scale: l.scale * k };
    default:
      return l;
  }
}

/** Interpolates a layer's placement (position and size) from `a` to `b`, k 0..1: objects glide out of the way. */
export function blendLayer(a: Layer, b: Layer, k: number): Layer {
  if (a === b || k >= 1) return b;
  if (k <= 0) return a;
  // a code layer's lyric box glides too (its drawing makes room by it): between two boxes it moves, a box that
  // appears or leaves keeps its place while its weight fades in or out
  if (a.kind === 'code' && b.kind === 'code') {
    const ra = a.lyric;
    const rb = b.lyric;
    if (ra && rb) return { ...b, lyric: { x0: ra.x0 + (rb.x0 - ra.x0) * k, y0: ra.y0 + (rb.y0 - ra.y0) * k, x1: ra.x1 + (rb.x1 - ra.x1) * k, y1: ra.y1 + (rb.y1 - ra.y1) * k }, lyricWeight: 1 };
    if (rb) return { ...b, lyricWeight: k };
    if (ra) return { ...b, lyric: ra, lyricWeight: 1 - k };
    return b;
  }
  const out = { ...b } as Record<string, unknown>;
  if (a.kind === 'ui' && b.kind === 'ui' && (a.opacity ?? 1) !== (b.opacity ?? 1)) out['opacity'] = (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * k;
  for (const key of ['x', 'y', 'w', 'h', 'r', 'size']) {
    const va = (a as unknown as Record<string, unknown>)[key];
    const vb = (b as unknown as Record<string, unknown>)[key];
    if (typeof va === 'number' && typeof vb === 'number') out[key] = va + (vb - va) * k;
  }
  return out as unknown as Layer;
}

/**
 * Pulls apart a section's computer windows that the director stacked on each other: each window that covers more than
 * a fifth of an earlier one moves to the free spot (of nine around the frame) nearest its own. Positions only.
 */
export function spreadWindows(layers: Layer[]): Layer[] {
  const placed: Rect[] = [];
  const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  const cut = (a: Rect, b: Rect) => area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
  const crowded = (r: Rect) => placed.some((p) => cut(r, p) > 0.2 * Math.min(area(r), area(p)));
  return layers.map((l) => {
    if (l.kind !== 'ui') return l;
    const r = layerRect(l)!;
    if (!crowded(r)) return placed.push(r), l;
    const spots = [-0.62, 0, 0.62].flatMap((x) => [0.58, 0, -0.58].map((y) => ({ ...l, x, y })));
    const free = spots.filter((q) => !crowded(layerRect(q)!));
    const d = (q: UiLayer) => ((q.x ?? 0) - (l.x ?? 0)) ** 2 + ((q.y ?? 0) - (l.y ?? 0)) ** 2;
    const best = free.sort((a, b) => d(a) - d(b))[0];
    // ponytail: no free spot keeps the overlap, a busy desktop overlaps anyway
    const out = best ?? l;
    placed.push(layerRect(out)!);
    return out;
  });
}

/** A layer the motion check measures the lyrics against, as it is drawn in one frame. */
export interface Measured {
  r: Rect;
  /**
   * Which object, unique per item: a story item by its index (`hero#0:horse`, `pop#7:horse`, `cards#2[1]:嘘つき`) or a
   * decoration by section and layer index (`stamp:LOVE@s3#4`: section 3's layer 4).
   */
  ref: string;
  group: 'prop' | 'card' | 'decor';
  /** The opacity it is drawn at in this frame (a window's pop-in counted). */
  opacity: number;
  /** Draw order, all under the lyrics: `story:i`, `section:i`, or `prev:i` for the section a transition reveals over. */
  layer: string;
  /** Faded below its own opacity to make room (avoid's fallback, or passing behind the line). */
  faded: boolean;
}

/** The measuring threshold for a hidden hero, a card not yet down, one faded out (not a guarantee no eye sees it). */
export const VISIBLE_OPACITY = 0.02;

/**
 * The layers of one frame the lyrics can actually collide with: story props, cards and the movable decorations (inset
 * photos, blobs, stamps, seals, numerals, windows) that are visible. `placed` is after making room, `planned` before
 * (same order); layers from `storyFrom` on are the story's; `age` is seconds into the section (a window shows `delay` s
 * in); `zone` names the draw pass and `section` the look section the layers belong to. Pure: what the motion QA
 * records, it changes nothing drawn. A geometric overlap of what passes the visibility filter, not proof the words are
 * harder to read (an opaque card can hide another; a background disc behind the words may be the design).
 */
export function measurable(placed: Layer[], planned: Layer[], age: number, zone: 'section' | 'prev', section: number, storyFrom = placed.length): Measured[] {
  return placed.flatMap((l, i): Measured[] => {
    const r = l.kind === 'code' ? undefined : layerRect(l);
    if (!r) return [];
    const story = i >= storyFrom;
    const pop = l.kind === 'ui' ? Math.min(1, Math.max(0, (age - (l.delay ?? 0)) / (l.type === 'cursor' ? 0.3 : 0.15))) : 1;
    // a shattered hero's pieces are gone at 1
    const gone = l.kind === 'sprite' && (l.shatter ?? 0) >= 0.999;
    const opacity = gone ? 0 : (l.opacity ?? 1) * pop;
    if (opacity < VISIBLE_OPACITY) return [];
    const label = l.kind === 'card' ? '' : 'text' in l ? `:${l.text}` : 'type' in l ? `:${l.type}` : 'mode' in l ? `:${l.mode}` : '';
    return [
      {
        r,
        ref: story ? ((l as StoryLayer).ref ?? l.kind) : `${l.kind}${label}@s${section}#${i}`,
        group: l.kind === 'card' ? 'card' : story ? 'prop' : 'decor',
        opacity: +opacity.toFixed(3),
        layer: story ? `story:${i - storyFrom}` : `${zone}:${i}`,
        faded: (l.opacity ?? 1) < (planned[i]?.opacity ?? 1) - 1e-3,
      },
    ];
  });
}

/** Makes room for the lyrics across a section's layers: each movable object avoids the lyrics and the ones placed before it. */
export function avoidAll(layers: Layer[], lyrics: Rect): Layer[] {
  // objects already clear of the lyrics stay where they are and are obstacles for the ones that must move
  const clear = (l: Layer) => {
    const r = layerRect(l);
    return !r || !overlaps(r, { x0: lyrics.x0 - 24, y0: lyrics.y0 - 24, x1: lyrics.x1 + 24, y1: lyrics.y1 + 24 });
  };
  const isStory = (l: Layer) => l.kind === 'sprite' || l.kind === 'card' || l.kind === 'thread';
  const placed = layers.flatMap((l, i) => (clear(l) && layerRect(l) ? [{ i, r: layerRect(l)!, story: isStory(l) }] : []));
  // key story content finds its place first: the rest gives way to it (density proposal §3.2)
  const key = (l: Layer) => !!(l as StoryLayer).key;
  const order = layers.map((_, i) => i).sort((a, b) => Number(key(layers[b])) - Number(key(layers[a])));
  const place = (only: (i: number) => boolean) => {
    const out: Layer[] = [...layers];
    const taken = placed.filter((p) => only(p.i));
    order.forEach((i) => {
      const l = layers[i];
      if (l.kind === 'code') {
        out[i] = { ...l, lyric: lyrics };
        return;
      }
      if (!only(i) || clear(l)) return;
      // a story prop is drawn over the backdrop, so only the lyrics and the other story objects are in its way (a
      // background disc next to the line pushed 落ちた風鈴 under the lyrics)
      out[i] = avoid(l, lyrics, 24, taken.filter((p) => !isStory(l) || p.story).map((p) => p.r));
      const r = layerRect(out[i]);
      if (r) taken.push({ i, r, story: isStory(l) });
    });
    return out;
  };
  const out = place(() => true);
  // a card pile that does not fit beside the lines keeps the cards about the lines up (key), or, with none, the card
  // that landed last: the others leave where they are (the caller fades them) and the kept ones find their place
  // without them; everything else keeps the place it found above, so nothing jumps when a card lands
  const pile = (l: Layer) => (l.kind === 'card' ? (l.ref ?? '').replace(/\[.*$/, '') : '');
  for (const id of new Set(layers.map(pile).filter(Boolean))) {
    const cards = layers.flatMap((l, i) => (pile(l) === id && (l.opacity ?? 1) > 1e-3 ? [i] : []));
    if (!cards.some((i) => (out[i].opacity ?? 1) <= 1e-3)) continue;
    const keys = cards.filter((i) => key(layers[i]));
    const kept = keys.length ? keys : [cards[cards.length - 1]];
    const alone = place((i) => !cards.includes(i) || kept.includes(i));
    cards.forEach((i) => (out[i] = kept.includes(i) ? alone[i] : ({ ...out[i], opacity: 0 } as Layer)));
  }
  return out;
}
