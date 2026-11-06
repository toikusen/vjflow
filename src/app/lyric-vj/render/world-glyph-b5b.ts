// What a character is made of in style batch 5's scrapbook, watercolor, midcentury and claymation worlds (2026-11-06,
// 風格第5批設計稿). The letter keeps the face's own strokes in every one: nothing here thickens a stroke, so no two strokes
// ever meet. What changes is what fills it and what lies under it (world-layout `under`), all hard edged:
// - scrapbook: a die-cut letter sticker, the letter in flat ink on a white backing grown round it with a grey cut line
//   outside and a hard shadow down and right (board: backing 15 px at 168, cut 2 px, shadow (3, 4) at 32 %);
// - watercolor: a painted letter, its density computed from the distance to its own edge (pigment pools at the drying
//   rim: base × slow flow + 0.42 × e^(−d / 3.5 px at 192)), granulation and a second pigment drifting through, laid over
//   the paper as a glaze (multiplied); or a letter reserved white with masking fluid, the wash pooled dark against it;
// - midcentury: flat screen-print ink with the paper showing through in specks, its second plate a hair out of register;
// - claymation: flat clay with a hard light rim up and left and a hard dark rim down and right (an offset of the letter
//   itself, never a bevel gradient), thumb-print ridges and tool marks pressed into the thick of the strokes, and a hard
//   contact shadow on the slab.
import type { HandCtx } from './world-glyph-hand';
import { distanceTo, grown } from './world-glyph-loud';
import { mixHex } from './material';
import { B5B } from './b5b-inks';

export type B5bSurface = 'scrap-type' | 'scrap-back' | 'scrap-cut' | 'scrap-drop' | 'wc-paint' | 'wc-reserve' | 'wc-pool' | 'mc-type' | 'mc-reg' | 'clay-type' | 'clay-multi' | 'clay-drop';
const KINDS = new Set<string>(['scrap-type', 'scrap-back', 'scrap-cut', 'scrap-drop', 'wc-paint', 'wc-reserve', 'wc-pool', 'mc-type', 'mc-reg', 'clay-type', 'clay-multi', 'clay-drop']);
export const isB5bSurface = (k: string): k is B5bSurface => KINDS.has(k);

/** The sticker's parts, shares of the type size (board: 15 px backing and a 2 px cut line at 168 px; shadow (3, 4)). */
export const STICKER = { back: 0.085, cut: 0.1, close: 0.02, drop: [0.018, 0.024] as [number, number], shadow: 0.32 };
/** The watercolour letter (board: rim 0.42 over 3.5 px at 192 px; granulation 6 %), and the least density a letter keeps. */
export const WASH = { base: 0.9, flow: 0.24, rim: 0.42, rr: 0.018, gran: 0.06, least: 0.8, pool: 0.07 };
/** The screen print's second plate, shares of the size, down and right. */
export const REGISTER = [0.03, 0.022] as const;
/** The clay letter's hard rims and contact shadow, shares of the size. */
export const CLAY = { rim: 0.03, drop: [0.045, 0.06] as [number, number] };
/** Clays that read on the light slab of the frame-filling page (each ≥ 4.5:1 on its yellow). */
export const CLAY_DARK = [B5B.x8E1E22, B5B.x1D3A7A, B5B.x1F5E3A, B5B.x4E2A78];

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
/** Value noise, smooth, 0..1. */
const vnoise = (x: number, y: number, s: number) => {
  const [xi, yi] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - xi, y - yi].map((t) => t * t * (3 - 2 * t));
  const h = (i: number, j: number) => hash(i + s * 17.3, j - s * 9.1);
  const [a, b, c, d] = [h(xi, yi), h(xi + 1, yi), h(xi, yi + 1), h(xi + 1, yi + 1)];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const copy = (m: OffscreenCanvas) => { const t = new OffscreenCanvas(m.width, m.height); t.getContext('2d')!.drawImage(m, 0, 0); return t; };
/** The part of the letter an offset copy of itself does not cover: a hard rim on the side away from the offset. */
function rimOf(mask: OffscreenCanvas, dx: number, dy: number) {
  const t = copy(mask);
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(mask, dx, dy);
  return t;
}
/** The letter pulled in by `r` px all round (the intersection of eight offset copies): only the thick of a stroke. */
function eroded(mask: OffscreenCanvas, r: number) {
  const t = copy(mask);
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'destination-in';
  for (let k = 0; k < 8; k++) g.drawImage(mask, Math.cos((k * Math.PI) / 4) * r, Math.sin((k * Math.PI) / 4) * r);
  return t;
}
const fill = (m: OffscreenCanvas, tone: string, a = 1) => { const t = copy(m); const g = t.getContext('2d')!; g.globalCompositeOperation = 'source-in'; g.globalAlpha = a; g.fillStyle = tone; g.fillRect(0, 0, t.width, t.height); return t; };

/**
 * A watercolour letter as a glaze over the paper: each pixel's pigment density from its distance to the letter's edge (the
 * rim pools darker as it dries), a slow flow of density and a second pigment through the wash, granulation; big letters
 * take one backrun bloom, its cauliflower edge darker. Composited onto the paper colour (a multiply), opaque, so the letter
 * reads as painted and its edge stays the face's own, crisp.
 */
function painted(h: HandCtx) {
  const { mask, tint, core, px, seed, cw, ch } = h;
  const g = mask.getContext('2d')!;
  const src = g.getImageData(0, 0, cw, ch).data;
  const D = distanceTo((i) => src[i * 4 + 3] < 128, cw, ch);
  const second = core && core.toLowerCase() !== tint.toLowerCase() ? mixHex(tint, core, 0.4) : mixHex(tint, B5B.x0F2340, 0.3);
  const [c1, c2, P] = [rgb(tint), rgb(second), rgb(B5B.xFBF8F1)];
  const [fs, gs, rr] = [0.9 * px, Math.max(1.6, px * 0.011), WASH.rr * px];
  // one backrun in a big letter, where its stroke is thick
  let bloom: [number, number, number] | undefined;
  if (px >= 220) for (let k = 0; k < 400 && !bloom; k++) { const [x, y] = [Math.floor(hash(k, seed) * cw), Math.floor(hash(k, seed + 3) * ch)]; if (D[y * cw + x] > 0.05 * px) bloom = [x, y, px * (0.12 + 0.06 * hash(seed, 9))]; }
  const out = new ImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    const al = src[i * 4 + 3];
    if (!al) continue;
    const [x, y] = [i % cw, (i / cw) | 0];
    const f = vnoise(x / fs, y / fs, seed);
    let a = WASH.base * (1 - WASH.flow / 2 + WASH.flow * f) + WASH.rim * Math.exp(-D[i] / rr);
    a *= 1 - WASH.gran + WASH.gran * 2 * vnoise(x / gs, y / gs, seed + 5);
    if (bloom) {
      const r = Math.hypot(x - bloom[0], y - bloom[1]) - bloom[2] * (0.85 + 0.3 * vnoise(x / (px * 0.05), y / (px * 0.05), seed + 7));
      if (r < 0) a *= 0.86;
      else if (r < px * 0.012) a = Math.min(1, a + 0.22);
    }
    a = Math.min(1, Math.max(WASH.least, a));
    const k = Math.min(1, Math.max(0, (vnoise(x / (fs * 1.4), y / (fs * 1.4), seed + 11) - 0.35) * 2));
    for (let c = 0; c < 3; c++) out.data[i * 4 + c] = P[c] * (1 - a * (1 - (c1[c] + (c2[c] - c1[c]) * k) / 255));
    out.data[i * 4 + 3] = al;
  }
  const t = new OffscreenCanvas(cw, ch);
  t.getContext('2d')!.putImageData(out, 0, 0);
  return t;
}

/** The wash pooled against a reserved letter: darker as it nears the letter, over a few pixels, computed (no blur). */
function pooled(h: HandCtx) {
  const { mask, tint, px, cw, ch } = h;
  const src = mask.getContext('2d')!.getImageData(0, 0, cw, ch).data;
  const D = distanceTo((i) => src[i * 4 + 3] >= 128, cw, ch);
  const c = rgb(mixHex(tint, B5B.x000000, 0.3));
  const [reach, rr] = [WASH.pool * px, WASH.rr * px * 1.2];
  const out = new ImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    if (D[i] > reach || src[i * 4 + 3] >= 128) continue;
    const a = 0.62 * Math.exp(-D[i] / rr) + 0.12 * (1 - D[i] / reach);
    out.data[i * 4] = c[0];
    out.data[i * 4 + 1] = c[1];
    out.data[i * 4 + 2] = c[2];
    out.data[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  const t = new OffscreenCanvas(cw, ch);
  t.getContext('2d')!.putImageData(out, 0, 0);
  return t;
}

/** Thumb-print ridges and tool marks pressed into the thick of a clay letter, a darker clay, hard lines. */
function pressed(ctx: CanvasRenderingContext2D, mask: OffscreenCanvas, tone: string, px: number, seed: number) {
  const [cw, ch] = [mask.width, mask.height];
  const deep = eroded(mask, px * 0.05);
  const t = new OffscreenCanvas(cw, ch);
  const g = t.getContext('2d')!;
  g.strokeStyle = mixHex(tone, B5B.x000000, 0.16);
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.2, px * 0.008);
  // a print: three nested arcs, open on one side
  for (let p = 0; p < 2; p++) {
    const [cx, cy, a0] = [cw * (0.25 + 0.5 * hash(p, seed)), ch * (0.25 + 0.5 * hash(p, seed + 1)), hash(p, seed + 2) * 6.28];
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.ellipse(cx, cy, px * 0.03 * k, px * 0.024 * k, a0, 0.4, 4.2); g.stroke(); }
  }
  // two short straight tool drags
  for (let p = 0; p < 2; p++) {
    const [x, y, a] = [cw * hash(p, seed + 5), ch * hash(p, seed + 6), hash(p, seed + 7) * 3.14];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * px * 0.12, y + Math.sin(a) * px * 0.12); g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(deep, 0, 0);
  ctx.drawImage(t, 0, 0);
}

/** A flat clay letter: its colour, a hard light rim up and left, a hard dark rim down and right, prints in its thick. */
function clay(ctx: CanvasRenderingContext2D, mask: OffscreenCanvas, tone: string, px: number, seed: number) {
  const o = Math.max(1.5, px * CLAY.rim);
  const light = mixHex(tone, B5B.xFFFFFF, lightOf(tone) > 0.5 ? 0.55 : 0.2);
  const dark = mixHex(tone, B5B.x000000, lightOf(tone) > 0.5 ? 0.22 : 0.3);
  ctx.drawImage(fill(mask, tone), 0, 0);
  ctx.drawImage(fill(rimOf(mask, o, o), light), 0, 0);
  ctx.drawImage(fill(rimOf(mask, -o, -o), dark), 0, 0);
  pressed(ctx, mask, tone, px, seed);
}
const lightOf = (hex: string) => { const [r, g, b] = rgb(hex); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

export function b5bSurface(ctx: CanvasRenderingContext2D, kind: B5bSurface, h: HandCtx) {
  const { mask, tone, tint, px, seed, cw, ch } = h;
  switch (kind) {
    case 'scrap-type':
    case 'wc-reserve': {
      ctx.drawImage(tone, 0, 0);
      if (kind === 'wc-reserve') {
        // the reserved paper keeps its cold-press tooth: a few hard specks a shade down
        const t = new OffscreenCanvas(cw, ch);
        const g = t.getContext('2d')!;
        g.fillStyle = mixHex(tint, B5B.x8A8070, 0.12);
        for (let i = 0; i < (cw * ch) / 900; i++) g.fillRect(hash(i, seed) * cw, hash(i, seed + 1) * ch, 2, 2);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(mask, 0, 0);
        ctx.drawImage(t, 0, 0);
      }
      break;
    }
    case 'scrap-back': {
      ctx.drawImage(grown(mask, px * STICKER.back, px * STICKER.close, tint), 0, 0);
      break;
    }
    case 'scrap-cut': {
      ctx.drawImage(grown(mask, px * STICKER.cut, px * STICKER.close, B5B.xD9D3C8), 0, 0);
      break;
    }
    case 'scrap-drop': {
      ctx.globalAlpha = STICKER.shadow;
      ctx.drawImage(grown(mask, px * STICKER.cut, px * STICKER.close, B5B.x281E14), px * STICKER.drop[0], px * STICKER.drop[1]);
      ctx.globalAlpha = 1;
      break;
    }
    case 'wc-paint': {
      ctx.drawImage(painted(h), 0, 0);
      break;
    }
    case 'wc-pool': {
      ctx.drawImage(pooled(h), 0, 0);
      break;
    }
    case 'mc-type': {
      ctx.drawImage(tone, 0, 0);
      // a screen print's ink lies on the paper unevenly: paper shows through in fine specks
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < (cw * ch) / 1400; i++) ctx.fillRect(hash(i, seed) * cw, hash(i, seed + 2) * ch, 1.5, 1.5);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'mc-reg': {
      ctx.drawImage(tone, px * REGISTER[0], px * REGISTER[1]);
      break;
    }
    case 'clay-type': {
      clay(ctx, mask, tint, px, seed);
      break;
    }
    case 'clay-multi': {
      clay(ctx, mask, CLAY_DARK[seed % CLAY_DARK.length], px, seed);
      break;
    }
    case 'clay-drop': {
      ctx.drawImage(fill(mask, mixHex(tint, B5B.x000000, 0.38)), px * CLAY.drop[0], px * CLAY.drop[1]);
      break;
    }
  }
}
