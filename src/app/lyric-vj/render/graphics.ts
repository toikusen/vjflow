// Graphic component library: program-drawn layers a designer builds a VJ frame from — flat fields, paper, patterns,
// framed photos, frames, rings, sparkles, sunbursts, tape bands, shapes. The database's designer VJs are mostly
// these over flat colour, not a full-bleed picture; a song's look is a stack of them per section, drawn in Canvas2D
// every frame (deterministic in t) and composited as the background layer under the lyrics.

export type Rgb = string;

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
}

export type Layer = Base &
  (
    | { kind: 'fill'; color: Rgb; to?: Rgb; angle?: number }
    | { kind: 'paper'; color: Rgb; grain?: number }
    | { kind: 'pattern'; type: 'grid' | 'dots' | 'stripes' | 'gingham' | 'checker' | 'halftone' | 'waves' | 'genkou'; color: Rgb; scale?: number; angle?: number; scroll?: number }
    | { kind: 'photo'; mode: 'full' | 'inset' | 'polaroid' | 'band' | 'circle'; asset?: string; x?: number; y?: number; w?: number; h?: number; tilt?: number; tint?: Rgb; frame?: Rgb; drift?: number }
    | { kind: 'frame'; type: 'border' | 'filmstrip' | 'viewfinder' | 'brackets' | 'window' | 'ticket'; color: Rgb; inset?: number; label?: string }
    | { kind: 'rings'; x?: number; y?: number; count?: number; color: Rgb; radius?: number; spin?: number; dashed?: boolean }
    | { kind: 'sparkles'; count?: number; color: Rgb; size?: number; seed?: number }
    | { kind: 'sunburst'; x?: number; y?: number; color: Rgb; rays?: number; spin?: number }
    | { kind: 'band'; type: 'tape' | 'solid' | 'marquee'; color: Rgb; color2?: Rgb; y?: number; angle?: number; height?: number; scroll?: number }
    | { kind: 'shapes'; type: 'circle' | 'diamond' | 'triangle' | 'star' | 'heart' | 'cross'; count?: number; color: Rgb; size?: number; drift?: number; seed?: number; outline?: boolean }
    | { kind: 'blob'; x?: number; y?: number; r?: number; color: Rgb; breathe?: number }
    | { kind: 'bands'; colors: Rgb[]; from?: number; to?: number }
    | { kind: 'stamp'; text: string; color: Rgb; x?: number; y?: number; size?: number; tilt?: number; font?: string }
    | { kind: 'seal'; text: string; color: Rgb; x?: number; y?: number; size?: number; font?: string }
    | { kind: 'numeral'; text: string; color: Rgb; x?: number; y?: number; size?: number; font?: string; weight?: number }
    | { kind: 'scanlines'; color?: Rgb; gap?: number; vignette?: number }
    | { kind: 'chargrid'; color: Rgb; cols?: number; chars?: string; field?: 'noise' | 'radial' | 'rain'; speed?: number }
    | { kind: 'mist'; color: Rgb; count?: number; y?: number; drift?: number }
    | { kind: 'speedlines'; color: Rgb; count?: number; inner?: number }
    | { kind: 'swissgrid'; color: Rgb; cols?: number; bars?: Rgb; signal?: Rgb; seed?: number }
    | { kind: 'skyline'; type?: 'city' | 'hills' | 'trees' | 'peaks'; colors: Rgb[]; height?: number; seed?: number; drift?: number; windows?: Rgb }
    | { kind: 'mosaic'; colors: Rgb[]; color?: Rgb; cells?: number; seed?: number }
    | { kind: 'ink'; color: Rgb; count?: number; size?: number; seed?: number }
    // a song's own drawing, written by the director (scripts/lyric-vj/codelayer.mts); `lyric` is filled at draw time
    | { kind: 'code'; src: string; lyric?: Rect }
  );

export interface LookSection {
  start: number;
  layers: Layer[];
  /** Lyric colour and accent over this section's graphics (a light field needs dark type). */
  text?: Rgb;
  accent?: Rgb;
}

/** A song's graphic look: layer stacks per section (cut on the section start). */
export interface GraphicsLook {
  sections: LookSection[];
}

export const LAYER_KINDS = ['fill', 'paper', 'pattern', 'photo', 'frame', 'rings', 'sparkles', 'sunburst', 'band', 'shapes', 'blob', 'bands', 'stamp', 'seal', 'numeral', 'scanlines', 'chargrid', 'mist', 'speedlines', 'swissgrid', 'skyline', 'mosaic', 'ink'] as const;

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

/** Draws the look at t; `image(asset)` returns a loaded picture for photo layers. */
export function drawLook(ctx: CanvasRenderingContext2D, look: GraphicsLook, t: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined, adjust: (ls: Layer[]) => Layer[] = (ls) => ls) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const sec = sectionAt(look, t);
  for (const l of adjust(sec.layers)) {
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    if (l.blend) ctx.globalCompositeOperation = l.blend;
    for (const g of 'color' in l ? (l.ghosts ?? []) : []) {
      ctx.save();
      ctx.translate(g.dx, g.dy);
      draw(ctx, { ...l, color: g.color } as Layer, t, t - sec.start, beat, image);
      ctx.restore();
    }
    draw(ctx, l, t, t - sec.start, beat, image);
    ctx.restore();
  }
  ctx.restore();
}

type CodeDraw = (ctx: CanvasRenderingContext2D, f: { w: number; h: number; t: number; age: number; beat: Beat; lyric: Rect | null; hash: typeof hash }) => void;
const compiled = new Map<string, CodeDraw>();
const reported = new Set<string>();
/** Reports a code layer's failure or slowness once per message (the render's console, read by codelayer.mts). */
const report = (msg: string) => reported.has(msg) || (reported.add(msg), console.error(`code layer: ${msg}`));

/** Runs a director-written layer; a broken one draws nothing instead of breaking the frame. */
function drawCode(ctx: CanvasRenderingContext2D, l: { src: string; lyric?: Rect }, t: number, age: number, beat: Beat) {
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
  ctx.save();
  try {
    fn(ctx, { w: W, h: H, t, age, beat, lyric: l.lyric ?? null, hash });
  } catch (e) {
    report(`runtime: ${(e as Error).message}`);
  }
  ctx.restore();
  const ms = performance.now() - t0;
  if (ms > 25) report(`slow: ${Math.round(ms / 5) * 5} ms`);
}

function draw(ctx: CanvasRenderingContext2D, l: Layer, t: number, age: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined) {
  if (l.kind === 'code') return drawCode(ctx, l, t, age, beat);
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
        shape(ctx, l.type, size, l.color, !!l.outline);
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
      const chars = [...l.text].slice(0, 4);
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
      const top = H * (1 - (l.height ?? 0.45));
      l.colors.forEach((c, k) => {
        const depth = (k + 1) / n; // 0 back … 1 front
        const base = top + (H - top) * (0.15 + 0.5 * depth);
        const off = (t * (l.drift ?? 6) * (0.3 + depth)) % W;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-off - 10, H);
        const seed = (l.seed ?? 0) * 31 + k * 7;
        const type = l.type ?? 'city';
        for (let x = -off - 10; x < W + W; ) {
          const r = hash(Math.floor(x / 40), seed);
          if (type === 'city') {
            const w = 40 + r * 90;
            const h = (H - base) * 0.3 + r * (H - top) * 0.55 * (1 - depth * 0.4);
            ctx.lineTo(x, base - h);
            ctx.lineTo(x + w, base - h);
            x += w;
          } else if (type === 'trees') {
            const w = 30 + r * 40;
            ctx.lineTo(x + w / 2, base - 60 - r * 120);
            ctx.lineTo(x + w, base);
            x += w;
          } else {
            const w = (type === 'peaks' ? 120 : 260) + r * 200;
            ctx.quadraticCurveTo(x + w / 2, base - (type === 'peaks' ? 160 : 60) - r * (type === 'peaks' ? 260 : 90), x + w, base - r * 20);
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
    case 'ink': {
      // ink-wash blots: soft overlapping washes with a darker core, growing slowly
      const n = l.count ?? 5;
      for (let i = 0; i < n; i++) {
        const seed = (l.seed ?? 0) * 17 + i;
        const x = hash(seed, 1) * W;
        const y = hash(seed, 2) * H;
        const r = (l.size ?? 220) * (0.5 + hash(seed, 3)) * (1 + 0.05 * Math.sin(t * 0.4 + i));
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, l.color);
        g.addColorStop(0.55, l.color);
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
      ctx.fillStyle = '#FFB000';
      ctx.textBaseline = 'top';
      const ramp = '.:-=+*#%@';
      for (let j = 0; j < Math.ceil(H / ch); j++)
        for (let i = 0; i < cols; i++) {
          const d = Math.min(1, k * 1.2 - Math.hypot(i / cols - 0.5, j / (H / ch) - 0.5) * (1 - k) * 2);
          if (d > 0.05) ctx.fillText(ramp[Math.min(ramp.length - 1, Math.floor(d * ramp.length))], i * cw, j * ch);
        }
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
      return box(cx(l.x), cy(l.y), s * ([...l.text].length + 0.9), s * 1.6);
    }
    case 'seal': {
      const s = l.size ?? 90;
      return box(cx(l.x ?? 0.85), cy(l.y ?? -0.8), s, s);
    }
    case 'numeral': {
      const s = (l.size ?? 0.8) * H;
      return box(cx(l.x), cy(l.y), s * 0.62 * [...l.text].length, s);
    }
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
  if (!r) return l;
  const guard = { x0: lyrics.x0 - margin, y0: lyrics.y0 - margin, x1: lyrics.x1 + margin, y1: lyrics.y1 + margin };
  if (!overlaps(r, guard)) return l;
  const clash = (q: Rect) => overlaps(q, guard) || others.some((o) => overlaps(q, o));
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const inFrame = (q: Rect) => q.x0 >= 0 && q.y0 >= 0 && q.x1 <= W && q.y1 <= H;
  for (const k of [1, 0.75, 0.55]) {
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
      const fx = Math.min(W - ww / 2, Math.max(ww / 2, x));
      const fy = Math.min(H - hh / 2, Math.max(hh / 2, y));
      const q = { x0: fx - ww / 2, y0: fy - hh / 2, x1: fx + ww / 2, y1: fy + hh / 2 };
      if (!inFrame(q) || clash(q)) continue;
      return resize({ ...l, x: (fx - W / 2) / (W / 2), y: (H / 2 - fy) / (H / 2) } as Layer, k);
    }
  }
  return l;
}

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
    default:
      return l;
  }
}

/** Interpolates a layer's placement (position and size) from `a` to `b`, k 0..1: objects glide out of the way. */
export function blendLayer(a: Layer, b: Layer, k: number): Layer {
  if (a === b || k >= 1) return b;
  if (k <= 0) return a;
  const out = { ...b } as Record<string, unknown>;
  for (const key of ['x', 'y', 'w', 'h', 'r', 'size']) {
    const va = (a as unknown as Record<string, unknown>)[key];
    const vb = (b as unknown as Record<string, unknown>)[key];
    if (typeof va === 'number' && typeof vb === 'number') out[key] = va + (vb - va) * k;
  }
  return out as unknown as Layer;
}

/** Makes room for the lyrics across a section's layers: each movable object avoids the lyrics and the ones placed before it. */
export function avoidAll(layers: Layer[], lyrics: Rect): Layer[] {
  // objects already clear of the lyrics stay where they are and are obstacles for the ones that must move
  const clear = (l: Layer) => {
    const r = layerRect(l);
    return !r || !overlaps(r, { x0: lyrics.x0 - 24, y0: lyrics.y0 - 24, x1: lyrics.x1 + 24, y1: lyrics.y1 + 24 });
  };
  const placed: Rect[] = layers.filter(clear).map(layerRect).filter((r): r is Rect => !!r);
  return layers.map((l) => {
    if (l.kind === 'code') return { ...l, lyric: lyrics };
    if (clear(l)) return l;
    const out = avoid(l, lyrics, 24, placed);
    const r = layerRect(out);
    if (r) placed.push(r);
    return out;
  });
}
