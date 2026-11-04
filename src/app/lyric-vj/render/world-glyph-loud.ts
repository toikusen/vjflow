// What a character is made of in style batch 3's worlds, redrawn from the boards (2026-11-04). The letter itself is always
// flat ink, its stroke where the face drew it. What lies round it is drawn as separate layers under every letter of the
// line (world-layout's `under`): rings grown from the letter by an exact distance, after a closing that fills its
// counters and notches, so each ring nests and never leaks into a counter, and none ever crosses a letter. Hard edges,
// one pixel of anti-aliasing, no blur.
import type { HandCtx } from './world-glyph-hand';
import { B3 } from './b3-inks';

export type LoudSurface =
  | 'comic-key' | 'pop-sfx-plate' | 'pop-sfx-key'
  | 'cd-type'
  | 'poster-fill' | 'poster-band' | 'poster-key' | 'poster-key-thin'
  | 'sleeve-type'
  | 'xerox-type'
  | 'fan-letter' | 'fan-member' | 'fan-white' | 'fan-key'
  | 'card-type'
  | 'spray';
const KINDS = new Set<string>(['comic-key', 'pop-sfx-plate', 'pop-sfx-key', 'cd-type', 'poster-fill', 'poster-band', 'poster-key', 'poster-key-thin', 'sleeve-type', 'xerox-type', 'fan-letter', 'fan-member', 'fan-white', 'fan-key', 'card-type', 'spray']);
export const isLoudSurface = (k: string): k is LoudSurface => KINDS.has(k);

/** The member colours an idol fan's letters are cut round, one a character (the board's pink, blue, mint, lemon, lilac). */
export const MEMBER = [B3.xFF7EB6, B3.x7CC0FF, B3.x5FDCC0, B3.xFFDE5C, B3.xB79CFF];

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const copy = (m: OffscreenCanvas) => { const t = new OffscreenCanvas(m.width, m.height); t.getContext('2d')!.drawImage(m, 0, 0); return t; };

/** Squared distance transform along one line (Felzenszwalb & Huttenlocher). */
function line1d(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
/** Distance, px, from every pixel to the nearest pixel where `inside` holds. */
function distanceTo(inside: (i: number) => boolean, w: number, h: number) {
  const out = new Float32Array(w * h);
  const n = Math.max(w, h);
  const [f, d, z, v] = [new Float32Array(n), new Float32Array(n), new Float32Array(n + 1), new Int32Array(n)];
  for (let i = 0; i < w * h; i++) out[i] = inside(i) ? 0 : 1e20;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    line1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    line1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

/**
 * The letter grown by `grow` px after a closing of radius `close` (fills counters and the notches between strokes), as
 * a tone. Exact distances, so a ring is the same width all round; the edge keeps one pixel of anti-aliasing.
 */
function grown(mask: OffscreenCanvas, grow: number, close: number, tone: string) {
  const [w, h] = [mask.width, mask.height];
  const src = mask.getContext('2d')!.getImageData(0, 0, w, h).data;
  const toLetter = distanceTo((i) => src[i * 4 + 3] >= 128, w, h);
  const reach = grow + close;
  const toOutside = distanceTo((i) => toLetter[i] > reach, w, h);
  const t = new OffscreenCanvas(w, h);
  const g = t.getContext('2d')!;
  const img = g.createImageData(w, h);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, Math.max(0, toOutside[i] - close));
    if (a <= 0) continue;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return t;
}

export function loudSurface(ctx: CanvasRenderingContext2D, kind: LoudSurface, h: HandCtx) {
  const { mask, tone, tint, core, px, seed, cw, ch } = h;
  switch (kind) {
    // the letters themselves: flat ink, printed or cut
    case 'comic-key':
    case 'cd-type':
    case 'poster-fill':
    case 'sleeve-type':
    case 'fan-letter':
    case 'card-type': {
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'xerox-type': {
      // a photocopy: the black is solid, a few specks of toner never fused
      const t = copy(tone);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 60; i++) { g.globalAlpha = 0.5 + 0.5 * hash(i, seed + 3); g.beginPath(); g.arc(hash(i, seed) * cw, hash(i, seed + 1) * ch, px * (0.002 + 0.003 * hash(i, seed + 2)), 0, 6.3); g.fill(); }
      ctx.drawImage(t, 0, 0);
      break;
    }
    // popart's sound effect (board c): the colour plate printed under it off register, then the key line round it
    case 'pop-sfx-plate': {
      ctx.drawImage(grown(mask, px * 0.032, 0, tint), px * 0.05, px * 0.05);
      break;
    }
    case 'pop-sfx-key': {
      ctx.drawImage(grown(mask, px * 0.032, 0, tint), 0, 0);
      break;
    }
    // psychedelic's poster lettering (board a): a dark keyline closed round the word, a colour band grown out of it
    case 'poster-key': {
      ctx.drawImage(grown(mask, px * 0.15, px * 0.16, tint), 0, 0);
      break;
    }
    case 'poster-key-thin': {
      // a quiet line's poster lettering (board b): the keyline alone, thinner, no band
      ctx.drawImage(grown(mask, px * 0.11, px * 0.14, tint), 0, 0);
      break;
    }
    case 'poster-band': {
      ctx.drawImage(grown(mask, px * 0.22, px * 0.16, tint), 0, 0);
      break;
    }
    // idol-live's fan lettering (board a): the member colour, a white cut, a thin plum keyline, each grown from the last
    case 'fan-member': {
      const k = [...MEMBER.keys()][Math.floor(hash(seed, 7) * MEMBER.length)];
      ctx.drawImage(grown(mask, px * 0.085, px * 0.1, MEMBER[k]), 0, 0);
      break;
    }
    case 'fan-white': {
      ctx.drawImage(grown(mask, px * 0.135, px * 0.1, tint), 0, 0);
      break;
    }
    case 'fan-key': {
      ctx.drawImage(grown(mask, px * 0.157, px * 0.1, tint), 0, 0);
      break;
    }
    case 'spray': {
      // graffiti (held, being re-boarded): a can through a stencil, overspray past the edge, fine mist beyond it
      ctx.filter = `blur(${px * 0.05}px)`;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      const t = copy(tone);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.6;
      for (let i = 0; i < 140; i++) { g.beginPath(); g.arc(hash(i, seed) * t.width, hash(i, seed + 1) * t.height, px * (0.002 + 0.004 * hash(i, seed + 2)), 0, 6.3); g.fill(); }
      ctx.drawImage(t, 0, 0);
      ctx.fillStyle = h.tint;
      for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.25 + 0.4 * hash(i, seed + 9); const r = px * (0.002 + 0.004 * hash(i, seed + 10)); ctx.beginPath(); ctx.arc(hash(i, seed + 11) * cw, hash(i, seed + 12) * ch, r, 0, 6.3); ctx.fill(); }
      ctx.globalAlpha = 1;
      break;
    }
  }
  void core;
}
