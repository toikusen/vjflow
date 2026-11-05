// What a character is made of in style batch 4 (phone, blueprint, xerox; boards 2026-11-05). As in world-glyph.ts the stroke
// stays where the face drew it: a screen's type is flat; a drafter's lettering is flat white on the sheet; a photocopy's
// type is solid toner whose edge the copier roughens by a hair (the board's displacement, 3.2 px at a 212 px face) with a
// few specks that never fused. The roughening moves an edge by under 1 % of the size, so no two strokes ever meet.
import type { HandCtx } from './world-glyph-hand';

export type B4Surface = 'phone-type' | 'plan-type' | 'plan-cell' | 'toner-type';
const KINDS = new Set<string>(['phone-type', 'plan-type', 'plan-cell', 'toner-type']);
export const isB4Surface = (k: string): k is B4Surface => KINDS.has(k);

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
/** Smooth value noise, 0..1. */
function noise(x: number, y: number, seed: number) {
  const [xi, yi] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - xi, y - yi];
  const s = (t: number) => t * t * (3 - 2 * t);
  const v = (i: number, j: number) => hash(xi + i + seed * 13.1, yi + j);
  const a = v(0, 0) + (v(1, 0) - v(0, 0)) * s(fx);
  const b = v(0, 1) + (v(1, 1) - v(0, 1)) * s(fx);
  return a + (b - a) * s(fy);
}

/** The toner edge: every pixel read from a spot moved by fine noise, `amp` px at most (the board's feDisplacementMap). */
function displaced(tone: OffscreenCanvas, amp: number, freq: number, seed: number) {
  const [w, h] = [tone.width, tone.height];
  const src = tone.getContext('2d')!.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  const [S, D] = [src.data, out.data];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (noise(x * freq, y * freq, seed) - 0.5) * 2 * amp;
      const dy = (noise(x * freq + 41, y * freq + 17, seed) - 0.5) * 2 * amp;
      const sx = Math.min(w - 1, Math.max(0, Math.round(x + dx)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y + dy)));
      const [i, j] = [(y * w + x) * 4, (sy * w + sx) * 4];
      D[i] = S[j];
      D[i + 1] = S[j + 1];
      D[i + 2] = S[j + 2];
      D[i + 3] = S[j + 3];
    }
  const t = new OffscreenCanvas(w, h);
  t.getContext('2d')!.putImageData(out, 0, 0);
  return t;
}

export function b4Surface(ctx: CanvasRenderingContext2D, kind: B4Surface, h: HandCtx) {
  const { tone, tint, px, seed, cw, ch } = h;
  switch (kind) {
    // a screen's type and a drafter's lettering: flat, as the face drew it
    case 'phone-type':
    case 'plan-type': {
      ctx.drawImage(tone, 0, 0);
      break;
    }
    // blueprint board c: the lettering square a drafter practises in, a hard keyline round the character's em, under it
    case 'plan-cell': {
      const side = px * 1.2;
      // a mark narrower than a character (a quote, a stop) has no square of its own
      if (cw < side * 1.06 || ch < side * 1.06) break;
      const lw = Math.max(2, px * 0.011);
      ctx.save();
      ctx.strokeStyle = tint;
      ctx.lineWidth = lw;
      ctx.strokeRect(cw / 2 - side / 2, ch / 2 - side / 2, side, side);
      // the four centre ticks outside the square
      const t = px * 0.04;
      ctx.beginPath();
      ctx.moveTo(cw / 2 - side / 2 - t * 1.4, ch / 2);
      ctx.lineTo(cw / 2 - side / 2 - t * 0.4, ch / 2);
      ctx.moveTo(cw / 2 + side / 2 + t * 0.4, ch / 2);
      ctx.lineTo(cw / 2 + side / 2 + t * 1.4, ch / 2);
      ctx.moveTo(cw / 2, ch / 2 - side / 2 - t * 1.4);
      ctx.lineTo(cw / 2, ch / 2 - side / 2 - t * 0.4);
      ctx.moveTo(cw / 2, ch / 2 + side / 2 + t * 0.4);
      ctx.lineTo(cw / 2, ch / 2 + side / 2 + t * 1.4);
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
      ctx.restore();
      break;
    }
    // xerox (board .m filter): the toner edge moved by a hair, and a few specks of toner that never fused
    case 'toner-type': {
      const t = displaced(tone, Math.max(1, px * 0.0075), 1.1 / Math.max(1, px / 212), seed);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.6 + 0.4 * hash(i, seed + 3);
        g.beginPath();
        g.arc(hash(i, seed) * cw, hash(i, seed + 1) * ch, px * (0.002 + 0.0025 * hash(i, seed + 2)), 0, 6.3);
        g.fill();
      }
      ctx.drawImage(t, 0, 0);
      break;
    }
  }
}
