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
  /** Beat pulse amount (scale or brightness kick), default 0. */
  pulse?: number;
}

export type Layer = Base &
  (
    | { kind: 'fill'; color: Rgb; to?: Rgb; angle?: number }
    | { kind: 'paper'; color: Rgb; grain?: number }
    | { kind: 'pattern'; type: 'grid' | 'dots' | 'stripes' | 'gingham' | 'checker' | 'halftone'; color: Rgb; scale?: number; angle?: number; scroll?: number }
    | { kind: 'photo'; mode: 'full' | 'inset' | 'polaroid' | 'band' | 'circle'; asset?: string; x?: number; y?: number; w?: number; h?: number; tilt?: number; tint?: Rgb; frame?: Rgb; drift?: number }
    | { kind: 'frame'; type: 'border' | 'filmstrip' | 'viewfinder' | 'brackets' | 'window'; color: Rgb; inset?: number; label?: string }
    | { kind: 'rings'; x?: number; y?: number; count?: number; color: Rgb; radius?: number; spin?: number; dashed?: boolean }
    | { kind: 'sparkles'; count?: number; color: Rgb; size?: number; seed?: number }
    | { kind: 'sunburst'; x?: number; y?: number; color: Rgb; rays?: number; spin?: number }
    | { kind: 'band'; type: 'tape' | 'solid' | 'marquee'; color: Rgb; color2?: Rgb; y?: number; angle?: number; height?: number; scroll?: number }
    | { kind: 'shapes'; type: 'circle' | 'diamond' | 'triangle' | 'star' | 'heart' | 'cross'; count?: number; color: Rgb; size?: number; drift?: number; seed?: number; outline?: boolean }
    | { kind: 'blob'; x?: number; y?: number; r?: number; color: Rgb; breathe?: number }
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

export const LAYER_KINDS = ['fill', 'paper', 'pattern', 'photo', 'frame', 'rings', 'sparkles', 'sunburst', 'band', 'shapes', 'blob'] as const;

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
export function drawLook(ctx: CanvasRenderingContext2D, look: GraphicsLook, t: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const sec = sectionAt(look, t);
  for (const l of sec.layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    draw(ctx, l, t, t - sec.start, beat, image);
    ctx.restore();
  }
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, l: Layer, t: number, age: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined) {
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
    // duotone-ish tint: multiply the section colour over the photo
    ctx.globalCompositeOperation = 'multiply';
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
