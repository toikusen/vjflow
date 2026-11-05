// What a character is made of in style batch 3's worlds, redrawn from the boards (2026-11-04). The letter itself is always
// flat ink, its stroke where the face drew it. What lies round it is drawn as separate layers under every letter of the
// line (world-layout's `under`): rings grown from the letter by an exact distance, after a closing that fills its
// counters and notches, so each ring nests and never leaks into a counter, and none ever crosses a letter. Hard edges,
// one pixel of anti-aliasing, no blur.
import type { HandCtx } from './world-glyph-hand';
import { B3 } from './b3-inks';

export type LoudSurface =
  | 'comic-key' | 'pop-sfx-plate' | 'pop-sfx-key'
  | 'web-type' | 'web-shift'
  | 'poster-fill' | 'poster-band' | 'poster-key' | 'poster-key-thin'
  | 'sleeve-type'
  | 'xerox-type'
  | 'fan-letter' | 'fan-member' | 'fan-white' | 'fan-key'
  | 'card-type'
  | 'stencil';
const KINDS = new Set<string>(['comic-key', 'pop-sfx-plate', 'pop-sfx-key', 'web-type', 'web-shift', 'poster-fill', 'poster-band', 'poster-key', 'poster-key-thin', 'sleeve-type', 'xerox-type', 'fan-letter', 'fan-member', 'fan-white', 'fan-key', 'card-type', 'stencil']);
export const isLoudSurface = (k: string): k is LoudSurface => KINDS.has(k);

/** The member colours an idol fan's letters are cut round, one a character (the board's pink, blue, mint, lemon, lilac). */
export const MEMBER = [B3.xFF7EB6, B3.x7CC0FF, B3.x5FDCC0, B3.xFFDE5C, B3.xB79CFF];

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
/** A light tone (the letter's own ink): its luma over half. */
const isLightHex = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.3, 0.59, 0.11][k], 0) / 255 > 0.5;
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
export function grown(mask: OffscreenCanvas, grow: number, close: number, tone: string, counters = true) {
  const [w, h] = [mask.width, mask.height];
  const src = mask.getContext('2d')!.getImageData(0, 0, w, h).data;
  // the letter's counters filled: whatever paper the strokes close round is the letter's own (a ring never runs inside a
  // counter, and no wide closing is needed that would bridge two strokes into a blob)
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = src[i * 4 + 3] >= 128 ? 1 : 0;
  const outside = new Uint8Array(w * h);
  if (!counters) outside.fill(1);
  const stack: number[] = [];
  if (counters) for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!solid[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  if (counters) for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!solid[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  while (stack.length) {
    const i = stack.pop()!;
    const [x, y] = [i % w, (i / w) | 0];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !solid[j] && !outside[j]) { outside[j] = 1; stack.push(j); }
  }
  const toLetter = distanceTo((i) => (counters ? !outside[i] : solid[i] === 1), w, h);
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
    case 'web-type':
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
      ctx.drawImage(grown(mask, px * 0.032, 0, tint, false), px * 0.05, px * 0.05);
      break;
    }
    case 'pop-sfx-key': {
      ctx.drawImage(grown(mask, px * 0.032, 0, tint, false), 0, 0);
      break;
    }
    // psychedelic's poster lettering (board a): a dark keyline round the word, a colour band grown out of it. The closing
    // only fills a letter's own counters and hairline notches (0.07 of the size): a wider one bridged strokes into blobs,
    // and band plus closing past the glyph picture's 0.3 margin was cut flat at its edge (owner 2026-11-04: odd outlines)
    case 'poster-key': {
      ctx.drawImage(grown(mask, px * 0.13, px * 0.07, tint), 0, 0);
      break;
    }
    case 'poster-key-thin': {
      // a quiet line's poster lettering (board b): the keyline alone, thinner, no band
      ctx.drawImage(grown(mask, px * 0.1, px * 0.07, tint), 0, 0);
      break;
    }
    case 'poster-band': {
      ctx.drawImage(grown(mask, px * 0.2, px * 0.07, tint), 0, 0);
      break;
    }
    // idol-live's fan lettering (board a): the member colour, a white cut, a thin plum keyline, each grown from the last
    case 'fan-member': {
      const k = [...MEMBER.keys()][Math.floor(hash(seed, 7) * MEMBER.length)];
      ctx.drawImage(grown(mask, px * 0.085, px * 0.06, MEMBER[k]), 0, 0);
      break;
    }
    case 'fan-white': {
      ctx.drawImage(grown(mask, px * 0.135, px * 0.06, tint), 0, 0);
      break;
    }
    case 'fan-key': {
      ctx.drawImage(grown(mask, px * 0.157, px * 0.06, tint), 0, 0);
      break;
    }
    // y2k (direction-B board a, c): a hard pink print laid off register under light letters, down and right, never moving
    // apart from them (a static misprint, not a trail). Dark letters on a gel or foil carry none, so nothing is drawn.
    case 'web-shift': {
      if (!isLightHex(core)) break;
      const d = Math.round(px * 0.042);
      const t = copy(mask);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = tint;
      g.fillRect(0, 0, t.width, t.height);
      ctx.drawImage(t, d, d);
      break;
    }
    case 'stencil': {
      // graffiti (round-2 board): a cut stencil sprayed through, its bridges and its overspray (stencilled below)
      ctx.drawImage(stencilled(mask, h.tint, px, seed), 0, 0);
      break;
    }
  }
  void core;
}

/**
 * A letter cut as a real stencil and sprayed through it (graffiti's round-2 board, its stencil.js). A counter of the
 * letter, the paper island the strokes close round, would fall out of a cut plate: a bridge is cut across the thinnest
 * stroke between it and the outside (or the next island), so the gaps are where a cutter must leave them, not random
 * nicks. The paint is solid with a little spray density; overspray is hard single dots just past the edge (6 % within
 * 2 px, 1 % within 6 px at a 232 px letter), never a blur.
 */
export function stencilled(mask: OffscreenCanvas, tint: string, px: number, seed: number): OffscreenCanvas {
  const [w, h] = [mask.width, mask.height];
  const src = mask.getContext('2d')!.getImageData(0, 0, w, h).data;
  const A = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = src[i * 4 + 3] > 110 ? 1 : 0;
  const cut = new Uint8Array(w * h);
  const gap = Math.max(3, Math.round(px * 0.05));
  const lab = new Int32Array(w * h);
  for (let it = 0; it < 14; it++) {
    lab.fill(-1);
    const holes: { id: number; px: number[] }[] = [];
    let n = 0;
    for (let s0 = 0; s0 < w * h; s0++) {
      if (A[s0] || lab[s0] >= 0) continue;
      const st = [s0];
      lab[s0] = n;
      let edge = false;
      const pts: number[] = [];
      while (st.length) {
        const q = st.pop()!;
        pts.push(q);
        const [x, y] = [q % w, (q / w) | 0];
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        for (const d of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q - w, q + w]) if (d >= 0 && d < w * h && !A[d] && lab[d] < 0) { lab[d] = n; st.push(d); }
      }
      if (!edge && pts.length > 6) holes.push({ id: n, px: pts });
      else if (!edge) for (const q of pts) A[q] = 1;
      n++;
    }
    if (!holes.length) break;
    for (const hl of holes) {
      let best: { run: number; x0: number; y0: number; dx: number; dy: number } | undefined;
      for (let k = 0; k < hl.px.length; k += 2) {
        const q = hl.px[k];
        const [x0, y0] = [q % w, (q / w) | 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let [x, y, run] = [x0 + dx, y0 + dy, 0];
          if (!A[y * w + x]) continue;
          while (x > 0 && y > 0 && x < w - 1 && y < h - 1 && A[y * w + x]) { x += dx; y += dy; run++; }
          const end = y * w + x;
          if (A[end] || lab[end] === hl.id) continue;
          if (!best || run < best.run) best = { run, x0, y0, dx, dy };
        }
      }
      if (!best) continue;
      const { x0, y0, dx, dy, run } = best;
      for (let s1 = 0; s1 <= run + 1; s1++) for (let t = -gap / 2; t <= gap / 2; t++) {
        const [x, y] = [Math.round(x0 + dx * s1 + (dy ? t : 0)), Math.round(y0 + dy * s1 + (dx ? t : 0))];
        if (x >= 0 && y >= 0 && x < w && y < h) { A[y * w + x] = 0; cut[y * w + x] = 1; }
      }
    }
  }
  // the paint: the letter's own edge where it was not cut, a little density in the core, hard dots past the edge
  const k = Math.max(1, px / 232);
  const [r1, r2] = [Math.max(1, Math.round(2 * k)), Math.max(2, Math.round(6 * k))];
  const R = rngOf(seed);
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
  const near = (x: number, y: number, r: number) => { for (let yy = -r; yy <= r; yy += r) for (let xx = -r; xx <= r; xx += r) { const [X, Y] = [x + xx, y + yy]; if (X >= 0 && Y >= 0 && X < w && Y < h && A[Y * w + X]) return true; } return false; };
  const out = new OffscreenCanvas(w, h);
  const g = out.getContext('2d')!;
  const img = g.createImageData(w, h);
  const D = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let a = 0;
    if (cut[i]) a = 0;
    else if (A[i]) a = 248 + R() * 7;
    else if (src[i * 4 + 3] > 0 && near(x, y, 1)) a = src[i * 4 + 3];
    else if (near(x, y, r1) && R() < 0.06) a = 255;
    else if (near(x, y, r2) && R() < 0.01) a = 255;
    if (!a) continue;
    D[i * 4] = cr; D[i * 4 + 1] = cg; D[i * 4 + 2] = cb; D[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return out;
}
/** The board's own seeded stream (stencil.js rng). */
function rngOf(seed: number) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
