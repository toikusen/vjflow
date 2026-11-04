// What a character is made of in the loud worlds (style batch 3). As in world-glyph-hand.ts the stroke stays where the face
// drew it: nothing thickens a stroke into its neighbour or closes a counter. A surface only decides what fills the stroke and
// what lies round it: an offset second plate, a hard shadow, a stage halo, chrome, a round-cornered second ink, overspray,
// toner, or airbrushed light.
import type { HandCtx } from './world-glyph-hand';

export type LoudSurface = 'offset-plate' | 'hard-shadow' | 'stage-lit' | 'chrome' | 'bubble' | 'spray' | 'toner' | 'airbrush';
const KINDS = new Set<string>(['offset-plate', 'hard-shadow', 'stage-lit', 'chrome', 'bubble', 'spray', 'toner', 'airbrush']);
export const isLoudSurface = (k: string): k is LoudSurface => KINDS.has(k);

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const copy = (m: OffscreenCanvas) => { const t = new OffscreenCanvas(m.width, m.height); t.getContext('2d')!.drawImage(m, 0, 0); return t; };
/** A picture with a gradient laid through its own alpha. */
function lit(m: OffscreenCanvas, stops: [number, string][], x0: number, y0: number, x1: number, y1: number) {
  const t = copy(m);
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'source-atop';
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  for (const [k, tone] of stops) grad.addColorStop(k, tone);
  g.fillStyle = grad;
  g.fillRect(0, 0, t.width, t.height);
  return t;
}
/** Takes specks out: toner that never bonded, mist that never landed. */
function speck(t: OffscreenCanvas, n: number, r0: number, r1: number, a: number, seed: number) {
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(hash(i, seed) * t.width, hash(i, seed + 1) * t.height, r0 + (r1 - r0) * hash(i, seed + 2), 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

export function loudSurface(ctx: CanvasRenderingContext2D, kind: LoudSurface, h: HandCtx) {
  const { mask, tone, tinted, core, px, seed, cw, ch } = h;
  switch (kind) {
    case 'offset-plate': {
      // comic printing: the colour plate a couple of points off register under the key black
      ctx.drawImage(tinted(mask, core), px * 0.024, px * 0.02);
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'hard-shadow': {
      // studio vector art: the same shape in the shadow tone, pushed down and right, never blurred
      ctx.drawImage(tinted(mask, core), px * 0.05, px * 0.055);
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'stage-lit': {
      // the member colour thrown on the singer from the rig: a soft rim of it round the word, the word itself clean
      ctx.filter = `blur(${px * 0.07}px)`;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(tinted(mask, core), 0, px * 0.01);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'chrome': {
      // a reflection band through the metal: bright, dark, bright again at 135°, a dark lip under the lower edge
      ctx.drawImage(tinted(mask, core), px * 0.014, px * 0.02);
      ctx.drawImage(lit(tone, [[0, 'rgba(255,255,255,0.55)'], [0.38, 'rgba(255,255,255,0)'], [0.5, 'rgba(0,0,0,0.22)'], [0.62, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0.5)']], 0, 0, cw * 0.6, ch), 0, 0);
      break;
    }
    case 'bubble': {
      // poster lettering: a thin second ink round the stroke that rounds its corners, and a thick offset of it below
      const edge = tinted(mask, core);
      ctx.drawImage(edge, px * 0.04, px * 0.05);
      const w = px * 0.011;
      for (const [dx, dy] of [[w, 0], [-w, 0], [0, w], [0, -w], [w * 0.7, w * 0.7], [-w * 0.7, w * 0.7], [w * 0.7, -w * 0.7], [-w * 0.7, -w * 0.7]]) ctx.drawImage(edge, dx, dy);
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'spray': {
      // a can through a stencil: overspray past the edge, fine mist beyond it, the stroke itself a little uneven
      ctx.filter = `blur(${px * 0.05}px)`;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      const t = copy(tone);
      speck(t, 140, px * 0.002, px * 0.006, 0.6, seed);
      ctx.drawImage(t, 0, 0);
      ctx.fillStyle = h.tint;
      for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.25 + 0.4 * hash(i, seed + 9); const r = px * (0.002 + 0.004 * hash(i, seed + 10)); ctx.beginPath(); ctx.arc(hash(i, seed + 11) * cw, hash(i, seed + 12) * ch, r, 0, 6.3); ctx.fill(); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'toner': {
      // a photocopy: toner that never fused leaves holes, the drum leaves a faint streak, the edge is a hair rough
      const t = copy(tone);
      speck(t, 420, px * 0.0015, px * 0.005, 0.7, seed);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.22;
      for (let i = 0; i < 3; i++) g.fillRect(0, hash(i, seed + 4) * ch, cw, Math.max(1, px * 0.006));
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      ctx.drawImage(t, px * 0.004, 0);
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'airbrush': {
      // sprayed light: a soft edge, lighter at the top of the stroke, a faint far shadow of the second tone below
      ctx.filter = `blur(${px * 0.03}px)`;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(tinted(mask, core), px * 0.02, px * 0.05);
      ctx.filter = `blur(${px * 0.006}px)`;
      ctx.globalAlpha = 1;
      ctx.drawImage(lit(tone, [[0, 'rgba(255,255,255,0.3)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.12)']], 0, 0, 0, ch), 0, 0);
      ctx.filter = 'none';
      break;
    }
  }
}
