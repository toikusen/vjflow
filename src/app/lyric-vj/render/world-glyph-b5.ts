// What a character is made of in style batch 5 (boards 2026-11-06, 風格第5批設計稿), redrawn from the boards' own code:
// - embroidery: a satin fill, stitches 3.3 px apart along an angle of the character's own, none longer than 46 px (a
//   longer run is split, long and short), each lit 20 % at its middle and 32 % darker at its ends; a backstitched edge in
//   the outline thread (dashes 9 / 3.5); the thread's hard (3, 4) shadow on the cloth. A sampler's word in cross-stitch: the
//   character laid on the aida grid, a cell stitched where more than half of it is ink. Both are the thread, not the face.
// - screentone: flat ink; a sound effect's black ring (24 %) and white ring (16 %) grown from the letter, never into it.
// - art-deco: flat cream and pale gold.
// - notebook: marker letters each turned ±2.2°, lifted or dropped a little and a hair bigger or smaller (the board's
//   handwriting); pencil the same, a little steadier, with graphite grain; the paper kept round every stroke (the rules
//   stop 8 px short) and a highlighter laid under a key word.
// Every stroke stays where the face drew it (or, for thread, inside it): nothing here can join two strokes.
import type { HandCtx } from './world-glyph-hand';
import { grown } from './world-glyph-loud';
import { B5 } from './b5-inks';

export type B5Surface = 'satin' | 'cross-stitch' | 'tone-type' | 'sfx-outer' | 'sfx-inner' | 'deco-type' | 'marker-type' | 'pencil-type' | 'nb-halo' | 'nb-highlight';
const KINDS = new Set<string>(['satin', 'cross-stitch', 'tone-type', 'sfx-outer', 'sfx-inner', 'deco-type', 'marker-type', 'pencil-type', 'nb-halo', 'nb-highlight']);
export const isB5Surface = (k: string): k is B5Surface => KINDS.has(k);
/** Surfaces that redraw a character in thread: what shows is the stitching, never the face's own fill (the font table). */
export const THREAD_SURFACES = ['satin', 'cross-stitch'];

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (c: number[], to: number, t: number) => `rgb(${c.map((v) => Math.round(v + (to - v) * t)).join(',')})`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The board's satin numbers at its 186 px type, scaled to the picture. */
export const SATIN = { gap: 3.3, width: 3.2, longest: 46, at: 186, angles: [1.0, 2.2, 0.7, 1.9, 0.5, 2.6, 1.3, 1.6] };
/** Aida cells across a 410 px character (board c: 14 px cells), the samples of 25 a stitched cell needs over, and how far (cells) a cross may stand past the letter. */
export const AIDA = { cell: 14, at: 410, over: 12, overhang: 0.25 };
/** The notebook hand: turn (degrees), drift and size wobble, shares of the size (board: ±2.2°, ±7 px and ±3.5 % at 206 px). */
export const HAND = { turn: 2.2, drift: 7 / 206, size: 0.035, halo: 8 / 206 };

function satin(ctx: CanvasRenderingContext2D, h: HandCtx) {
  const { mask, tinted, tint, core, px, seed, cw, ch } = h;
  const k = px / SATIN.at;
  const alpha = mask.getContext('2d')!.getImageData(0, 0, cw, ch).data;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && alpha[(y * cw + x) * 4 + 3] >= 128;
  // the thread's hard shadow on the cloth (board lift: (3, 4), 16 %)
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.drawImage(tinted(mask, 'rgb(0,0,0)'), 3 * k, 4 * k);
  ctx.restore();
  const t = new OffscreenCanvas(cw, ch);
  const g = t.getContext('2d')!;
  const th = SATIN.angles[seed % SATIN.angles.length] + (hash(seed, 7) - 0.5) * 0.2;
  const [ux, uy] = [Math.cos(th), Math.sin(th)];
  const [qx, qy] = [-uy, ux];
  const [cx, cy, R] = [cw / 2, ch / 2, Math.hypot(cw, ch) / 2];
  const C = rgbOf(tint);
  // (a picture drawn at twice the size and shown at its own loses half its fine contrast: the board's 32 % and 20 % are
  // laid on a little stronger so the stitches read as the board's do on screen)
  const [lo, mid, hi] = [mix(C, 0, 0.42), `rgb(${C.join(',')})`, mix(C, 255, 0.3)];
  const [gap, wid, most] = [SATIN.gap * k, SATIN.width * k, SATIN.longest * k];
  g.lineCap = 'butt';
  g.lineWidth = wid;
  let row = 0;
  const lay = (o: number, a: number, b: number) => {
    const L = b - a;
    const n = Math.max(1, Math.ceil(L / most));
    // long and short: every other row's first cut moves half a stitch, so the ends never line up
    const cuts = [a, ...Array.from({ length: n - 1 }, (_, j) => a + (L * (j + 1 - (row % 2 && j === 0 ? 0.5 : 0))) / n), b];
    for (let j = 0; j < cuts.length - 1; j++) {
      const [s, e] = [cuts[j], cuts[j + 1]];
      if (e - s < 2 * k) continue;
      const [ax, ay, bx, by] = [cx + qx * o + ux * s, cy + qy * o + uy * s, cx + qx * o + ux * e, cy + qy * o + uy * e];
      const gr = g.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, lo);
      gr.addColorStop(0.18, mid);
      gr.addColorStop(0.45, hi);
      gr.addColorStop(0.7, mid);
      gr.addColorStop(1, lo);
      g.strokeStyle = gr;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
  };
  for (let o = -R; o <= R; o += gap) {
    row++;
    let run: number | undefined;
    const step = Math.max(1, k * 0.8);
    for (let s = -R; s <= R; s += step) {
      const on = inside(Math.round(cx + qx * o + ux * s), Math.round(cy + qy * o + uy * s));
      if (on && run === undefined) run = s;
      if (!on && run !== undefined) { lay(o, run, s); run = undefined; }
    }
    if (run !== undefined) lay(o, run, R);
  }
  // (each stitch ends where it leaves the letter, its butt end standing a hair proud of the outline, as thread does)
  // the backstitched edge (board: 2.6 px, dashes 9 / 3.5) in the outline thread, a band just inside the edge
  const edge = new OffscreenCanvas(cw, ch);
  const eg = edge.getContext('2d')!;
  const img = eg.createImageData(cw, ch);
  const [er, period, on] = [Math.max(2, Math.round(2.2 * k)), 12.5 * k, 9 / 12.5];
  const E = rgbOf(core);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      if (!inside(x, y)) continue;
      if (inside(x - er, y) && inside(x + er, y) && inside(x, y - er) && inside(x, y + er)) continue;
      if (fract((x + y) / period) > on && fract((x - y) / period) > on) continue;
      const i = (y * cw + x) * 4;
      img.data[i] = E[0];
      img.data[i + 1] = E[1];
      img.data[i + 2] = E[2];
      img.data[i + 3] = 235;
    }
  eg.putImageData(img, 0, 0);
  ctx.drawImage(t, 0, 0);
  ctx.drawImage(edge, 0, 0);
}

/**
 * The sampler's cross-stitch (board c): the character laid on the aida grid, a whole cross in each cell more than half of
 * whose 25 samples are ink. Whole cells step past the letter's edge, and at 30 cells a size a bold Han's narrow gaps (雙's
 * 隹, 鬱) closed into one blot: the crosses are kept within a quarter cell of the letter's own outline, so a gap never
 * closes, and the sampler sets its words in a lighter weight (world-b5-sets).
 */
function crossStitch(ctx: CanvasRenderingContext2D, h: HandCtx) {
  const { mask, tint, px, cw, ch } = h;
  const P = Math.max(3, (px * AIDA.cell) / AIDA.at);
  const alpha = mask.getContext('2d')!.getImageData(0, 0, cw, ch).data;
  const a = (x: number, y: number) => (x < cw && y < ch ? alpha[(Math.floor(y) * cw + Math.floor(x)) * 4 + 3] >= 128 : false);
  const C = rgbOf(tint);
  const [lo, mid, hi] = [mix(C, 0, 0.35), `rgb(${C.join(',')})`, mix(C, 255, 0.3)];
  const s = P / AIDA.cell;
  const t = new OffscreenCanvas(cw, ch);
  const g = t.getContext('2d')!;
  g.lineCap = 'round';
  for (let gy = 0; gy * P < ch; gy++)
    for (let gx = 0; gx * P < cw; gx++) {
      let n = 0;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) n += a(gx * P + ((i + 0.5) * P) / 5, gy * P + ((j + 0.5) * P) / 5) ? 1 : 0;
      if (n <= AIDA.over) continue;
      const [x, y] = [gx * P, gy * P];
      g.lineWidth = 4.2 * s;
      g.strokeStyle = lo;
      g.beginPath();
      g.moveTo(x + 2 * s, y + P - 2 * s);
      g.lineTo(x + P - 2 * s, y + 2 * s);
      g.stroke();
      g.strokeStyle = mid;
      g.beginPath();
      g.moveTo(x + 2 * s, y + 2 * s);
      g.lineTo(x + P - 2 * s, y + P - 2 * s);
      g.stroke();
      g.lineWidth = 1.4 * s;
      g.strokeStyle = hi;
      g.beginPath();
      g.moveTo(x + 4 * s, y + 4 * s);
      g.lineTo(x + P - 5 * s, y + P - 5 * s);
      g.stroke();
    }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(grown(mask, P * AIDA.overhang, 0, B5.xFFFFFF, false), 0, 0);
  ctx.drawImage(t, 0, 0);
}

/** The hand's own small turn, drift and size for a character (the same for its letter and the paper kept round it). */
export function handOf(seed: number, steady = 1) {
  return { r: ((hash(seed, 11) - 0.5) * 2 * HAND.turn * steady * Math.PI) / 180, dy: (hash(seed, 12) - 0.5) * 2 * HAND.drift * steady, s: 1 + (hash(seed, 13) - 0.5) * 2 * HAND.size * steady };
}
/** Draws a picture of the character through its hand: about its centre, a hair smaller first so a turned corner never leaves the picture. */
function byHand(ctx: CanvasRenderingContext2D, pic: OffscreenCanvas, h: HandCtx, steady: number) {
  const { px, seed, cw, ch } = h;
  const j = handOf(seed, steady);
  ctx.save();
  ctx.translate(cw / 2, ch / 2 + j.dy * px);
  ctx.rotate(j.r);
  ctx.scale(j.s * 0.97, j.s * 0.97);
  ctx.drawImage(pic, -cw / 2, -ch / 2);
  ctx.restore();
}

/** Graphite: a pencil leaves the paper's tooth showing through, in fine specks, a tenth of the stroke at most. */
function graphite(t: OffscreenCanvas, px: number, seed: number) {
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'destination-out';
  const n = Math.round((t.width * t.height) / 260);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.25 + 0.35 * hash(i, seed + 21);
    const r = Math.max(0.6, px * 0.0035 * (0.5 + hash(i, seed + 22)));
    g.fillRect(hash(i, seed + 23) * t.width, hash(i, seed + 24) * t.height, r, r * 0.6);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** The rows of a picture's ink, top and bottom, px. */
function inkRows(m: OffscreenCanvas): [number, number] {
  const d = m.getContext('2d')!.getImageData(0, 0, m.width, m.height).data;
  let [top, bottom] = [m.height, 0];
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x += 2)
      if (d[(y * m.width + x) * 4 + 3] >= 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
  return bottom > top ? [top, bottom] : [m.height * 0.3, m.height * 0.7];
}

export function b5Surface(ctx: CanvasRenderingContext2D, kind: B5Surface, h: HandCtx) {
  const { mask, tone, tint, core, px, seed, cw, ch } = h;
  switch (kind) {
    case 'satin':
      satin(ctx, h);
      break;
    case 'cross-stitch':
      crossStitch(ctx, h);
      break;
    case 'tone-type':
    case 'deco-type':
      ctx.drawImage(tone, 0, 0);
      break;
    // a sound effect's rings, under the letters whose ink is the ring's own (the line's sound-effect part)
    case 'sfx-outer':
      if (same(core, tint)) ctx.drawImage(grown(mask, px * 0.12, px * 0.03, tint), 0, 0);
      break;
    case 'sfx-inner':
      if (same(core, tint)) ctx.drawImage(grown(mask, px * 0.075, px * 0.03, B5.xFFFFFF), 0, 0);
      break;
    case 'marker-type':
      byHand(ctx, tone, h, 1);
      break;
    case 'pencil-type': {
      const t = new OffscreenCanvas(cw, ch);
      t.getContext('2d')!.drawImage(tone, 0, 0);
      graphite(t, px, seed);
      byHand(ctx, t, h, 0.75);
      break;
    }
    // the paper kept round the strokes, turned with the letter (a pencil page's hand is steadier: the larger turn covers it)
    case 'nb-halo':
      byHand(ctx, grown(mask, px * HAND.halo, px * 0.02, tint, false), h, 1);
      break;
    // a key word's highlighter: a chisel swipe over the lower half of the letters, across the whole advance so a word's
    // swipe runs on unbroken (board a: under 雙截棍, from half the letters' height to a little under them)
    case 'nb-highlight': {
      if (same(core, tint)) break;
      const [top, bottom] = inkRows(mask);
      const hgt = bottom - top;
      const pad = px * 0.3;
      const [x0, x1] = [pad - px * 0.04, cw - pad + px * 0.04];
      const [y0, y1] = [top + hgt * 0.5 + (hash(seed, 31) - 0.5) * px * 0.02, bottom + hgt * 0.07 + (hash(seed, 32) - 0.5) * px * 0.02];
      ctx.fillStyle = B5.xFFE24F;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0 + px * 0.012);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1 - px * 0.008);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}
