// The signature moments drawn past the spike's tear, chain, wave and fall (render/signature.ts): the strikes burn,
// melt, slice, wipe and fly; the shapes circle and rise; the freeze (the frame stops, only the line moves) and the
// echo (an earlier line comes back faintly under the line answering it). Each varies with its line: how hard the verb
// lands, how quickly the line is sung, how long it is, which thing the noun names, and the song's own paper and inks.
import type { RenderJob } from './engine';
import type * as Sig from './signature';
import { lastSung, mainOf, ownCues, SignatureMoment } from '../signature-moments';
import { readingSec } from './reading-window';
import { isSungChar, wordIndex } from '../sung-times';
import { circleLayout, clamp, dripOf, easeOut, Feel, feelOf, flyDrift, freezeSpan, hashOf, jolt, mix, RAD, riseAt, rng, sliceShift, tickAt } from './signature-motion';

type Ctx = Sig.Ctx;
type Inks = Sig.Inks;
type Built = Sig.Built;
const [W, H] = [1920, 1080];

/** What signature.ts lends the forms here: its canvas, face, paper and the engine's windows for the moment's lines. */
export interface Kit {
  x: Ctx;
  job: RenderJob;
  family: string;
  grain: number;
  song: number;
  glyph: (c: Ctx, ch: string, a: number, b: number, size: number, fill: string, press?: number, pressInk?: string, halo?: string) => void;
  stampIn: (c: Ctx, ch: string, a: number, b: number, size: number, at: number, t: number, ink: string, ghost: string | null, press?: number, pressInk?: string, kick?: number, halo?: string) => void;
  shadowed: (draw: () => void, blur?: number, dy?: number) => void;
  alive: (id: string, t: number) => number;
  metric: (id: string, text: string, from: number, to: number, show: number, last: number) => Record<string, unknown>;
  exitOf: (id: string) => { at: number; dur: number };
  cueOf: (id: string) => { id: string; text: string; start: number; end: number };
  nextStart: (id: string) => number;
  drawAsides: (asides: Sig.Aside[], t: number, inks: Inks, until: number) => void;
  partsOf: typeof Sig.partsOf;
  inksAt: typeof Sig.inksAt;
  boardPaper: typeof Sig.boardPaper;
  mixHex: typeof Sig.mixHex;
  canvas: typeof Sig.canvas;
}

const MORE_SHAPES = new Set(['circle', 'rise']);
/** The moments drawn here rather than in signature.ts. */
export const isMore = (m: SignatureMoment) => m.form === 'freeze' || m.form === 'echo' || (m.form === 'strike' && m.variant !== 'tear') || (m.form === 'shape' && MORE_SHAPES.has(m.variant));

interface Pass {
  id: string;
  cue: { id: string; text: string; start: number; end: number };
  parts: ReturnType<typeof Sig.partsOf>;
  main: { ch: string; at: number; src: number }[];
  size: number;
  xs: number[];
  /** Each character's offset from the row's middle: a line too long for one row takes two. */
  ys: number[];
  rows: number;
  /** The printed characters' left and right edges. */
  span: [number, number];
  exit: () => { at: number; dur: number };
  last: number;
  enter: number;
  /** When this pass sings the moment's word. */
  wordTime: number;
  isWord: (i: number) => boolean;
  feel: Feel;
}

/** Where a line too long for one row at 72 px breaks: the space or the comma's end nearest its middle, else its middle. */
export function rowBreak(chars: string[], width: number, minSize = 72, word?: [number, number]): number {
  const n = chars.length;
  if (n * minSize * 1.04 <= width) return n;
  const spaces = chars.map((c, i) => (/\s/.test(c) || /[、，,。]/.test(chars[i - 1] ?? '') ? i : -1)).filter((i) => i > n / 4 && i < (3 * n) / 4);
  const cut = spaces.sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2))[0] ?? Math.ceil(n / 2);
  // never through the moment's word: before or after it, whichever leaves the rows more even
  if (!word || cut <= word[0] || cut >= word[1]) return cut;
  return [word[0], word[1]].filter((c) => c > 0 && c < n).sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2))[0] ?? cut;
}

/** The moment's own lines (the line, and the line sung again straight after) laid centred, in two rows when long. */
function passesOf(k: Kit, m: SignatureMoment, maxSize = 150, width = 1560): Pass[] {
  return ownCues(m).map((id) => {
    const cue = k.cueOf(id);
    const parts = k.partsOf(cue.text, m.sung[id], m.word);
    const main = parts.main;
    const n = main.length;
    const cut = rowBreak(main.map((c) => c.ch), width, 72, parts.wordAt >= 0 ? [parts.wordAt, parts.wordAt + parts.wordLen] : undefined);
    const rows = cut < n ? 2 : 1;
    const rowOf = (i: number) => (i < cut ? 0 : 1);
    const lens = [cut, n - cut];
    const size = Math.max(64, Math.min(maxSize, width / Math.max(1, ...lens.slice(0, rows))));
    const xs = main.map((_, i) => { const r = rowOf(i); const j = r ? i - cut : i; return 960 + (j - (lens[r] - 1) / 2) * size * 1.04; });
    const ys = main.map((_, i) => (rows === 2 ? (rowOf(i) - 0.5) * size * 1.25 : 0));
    const sungIdx = main.map((c, i) => (/\s/.test(c.ch) ? -1 : i)).filter((i) => i >= 0);
    const span: [number, number] = sungIdx.length ? [xs[sungIdx[0]] - size / 2, xs[sungIdx[sungIdx.length - 1]] + size / 2] : [960, 960];
    const wi = parts.wordAt;
    return {
      id, cue, parts, main, size, xs, ys, rows, span,
      exit: () => k.exitOf(id),
      last: lastSung(cue.text, m.sung[id]),
      enter: (main[0]?.at ?? cue.start) - 0.3,
      wordTime: wi >= 0 ? main[wi].at : m.at,
      isWord: (i: number) => wi >= 0 && i >= wi && i < wi + parts.wordLen,
      feel: feelOf(m.word, main.filter((c) => isSungChar(c.ch)).map((c) => c.at)),
    };
  });
}

const passAt = (passes: Pass[], t: number) => passes.filter((p) => t >= p.enter).at(-1) ?? passes[0];
const lastExit = (passes: Pass[]) => passes[passes.length - 1].exit();
const metricsOf = (k: Kit, passes: Pass[]) => () => passes.map((p) => k.metric(p.id, p.cue.text, p.enter + 0.12, p.exit().at, p.enter, p.last));
/** Smooth value noise in 0..1, stable for a seed: ragged edges that are not random per pixel. */
const lattice = (i: number, j: number, s: number) => { const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const valueAt = (x: number, y: number, cell: number, s: number) => {
  const [u, v] = [x / cell, y / cell];
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const [fu, fv] = [u - i, v - j].map((f) => f * f * (3 - 2 * f));
  return mix(mix(lattice(i, j, s), lattice(i + 1, j, s), fu), mix(lattice(i, j + 1, s), lattice(i + 1, j + 1, s), fu), fv);
};
const noise2 = (x: number, y: number, s: number) => 0.6 * valueAt(x, y, 46, s) + 0.3 * valueAt(x, y, 17, s + 9) + 0.1 * valueAt(x, y, 6, s + 21);

/** The pass's characters stamped into a row (a context of its own or the frame), each sung on its time. */
function stampRow(k: Kit, c: Ctx, p: Pass, t: number, inks: Inks, y: number, dx = 0) {
  p.main.forEach((ch, i) => {
    if (/\s/.test(ch.ch)) return;
    const s = p.isWord(i) ? p.size * 1.12 : p.size;
    k.stampIn(c, ch.ch, p.xs[i] + dx, y + p.ys[i], s, ch.at, t, inks.ink, inks.ghost, 6, inks.press, 0.32, inks.halo);
  });
}

/** The pass in its own canvas the width of the frame (a row `h` high, the row's middle at h/2). */
function rowCanvas(k: Kit, p: Pass, t: number, inks: Inks, h: number) {
  const c = k.canvas(W, h);
  stampRow(k, c.getContext('2d')!, p, t, inks, h / 2);
  return c;
}

// ---- strike / burn ----
/**
 * The line printed on a sheet; the verb sets it alight under the word. The fire eats the sheet to a charred, glowing
 * rim round the printed line and stops there (the line reads whole); as the line goes, the rest burns away.
 */
function buildBurn(k: Kit, m: SignatureMoment): Built {
  const inks = k.inksAt(k.job, m.at);
  const passes = passesOf(k, m, 140, 1400).map((p) => {
    const BW = Math.min(1700, Math.round(p.span[1] - p.span[0] + p.size * 1.6));
    const BH = Math.round(p.size * (2.15 + (p.rows - 1) * 1.25));
    const [ox, oy] = [960 - BW / 2, 520 - BH / 2];
    const seed = k.song + Math.round(p.wordTime * 10);
    const paper = k.boardPaper(BW, BH, inks, k.grain, false, seed);
    const G = 4;
    const [gw, gh] = [Math.ceil(BW / G), Math.ceil(BH / G)];
    const wi = Math.max(0, p.parts.wordAt);
    const ign: [number, number] = [p.xs[wi] + (p.parts.wordLen - 1) * p.size * 0.52 - ox, BH];
    const speed = 650 + 900 * p.feel.force;
    let grid: { at: Float32Array; rim: Float32Array; rimAt: Float32Array } | undefined;
    // when each cell of the sheet burns: the fire spreads from under the word, ragged; the band round the printed
    // line is kept until the line goes, charring at its rim when the fire reaches it
    const prepare = () => {
      const at = new Float32Array(gw * gh);
      const keep = new Uint8Array(gw * gh);
      const goAt = p.exit().at - 0.1;
      const [l, r] = [p.span[0] - ox, p.span[1] - ox];
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const [px, py] = [i * G + G / 2, j * G + G / 2];
          const nz = noise2(px, py, seed % 97);
          const dy = Math.max(0, Math.abs(py - BH / 2) - (p.rows - 1) * p.size * 0.625) / (p.size * 0.68);
          const dx = Math.max(0, l - px, px - r) / (p.size * 0.45);
          const d = Math.hypot(px - ign[0], py - ign[1]);
          const kept = Math.hypot(dx, dy) < 0.92 + 0.3 * nz;
          keep[j * gw + i] = kept ? 1 : 0;
          at[j * gw + i] = kept ? goAt + d / 2600 + nz * 0.12 : p.wordTime + d / speed + nz * 0.28;
        }
      }
      // the kept band's rim: the cells near a burnt one, charring as the fire reaches their neighbour
      const rim = new Float32Array(gw * gh);
      const rimAt = new Float32Array(gw * gh).fill(Infinity);
      const R = 5;
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          if (!keep[j * gw + i]) continue;
          let best = R + 1;
          let when = Infinity;
          for (let b = -R; b <= R; b++) {
            for (let a = -R; a <= R; a++) {
              const [u, v] = [i + a, j + b];
              const out = u < 0 || v < 0 || u >= gw || v >= gh;
              if (!out && keep[v * gw + u]) continue;
              const d = Math.hypot(a, b);
              if (d < best) { best = d; when = out ? p.wordTime + Math.hypot(i * G - ign[0], j * G - ign[1]) / speed : at[v * gw + u]; }
            }
          }
          rim[j * gw + i] = clamp(1 - best / (R + 1));
          rimAt[j * gw + i] = when;
        }
      }
      return { at, rim, rimAt };
    };
    const sheet = k.canvas(BW, BH);
    const masks = [k.canvas(gw, gh), k.canvas(gw, gh), k.canvas(gw, gh)];
    const images = masks.map((c) => c.getContext('2d')!.createImageData(gw, gh));
    return { p, BW, BH, ox, oy, paper, ign, speed, sheet, masks, images, seed, grid: () => (grid ??= prepare()) };
  });
  const jolts = passes.map((s) => jolt(s.p.wordTime, 0.18 + 0.2 * s.p.feel.force));
  const from = passes[0].p.enter - 0.05;
  return {
    from, to: () => lastExit(passes.map((s) => s.p)).at + 0.95, jolts, region: [200, 360, 1720, 680],
    draw(t) {
      const s = passAt(passes.map((q) => q.p), t);
      const b = passes.find((q) => q.p === s)!;
      if (t < s.enter) return;
      const p = b.p;
      const sc = b.sheet.getContext('2d')!;
      sc.globalCompositeOperation = 'source-over';
      sc.clearRect(0, 0, b.BW, b.BH);
      sc.drawImage(b.paper, 0, 0);
      p.main.forEach((ch, i) => {
        if (/\s/.test(ch.ch)) return;
        const word = p.isWord(i);
        k.stampIn(sc, ch.ch, p.xs[i] - b.ox, b.BH / 2 + 4 + p.ys[i], word ? p.size * 1.1 : p.size, ch.at, t, inks.boardInk, k.mixHex(inks.boardInk, inks.board, 0.55), word ? 5 : 0, inks.accent, 0.4);
      });
      const lit = t >= p.wordTime - 0.05;
      if (lit) {
        const g = b.grid();
        const [hole, char, glow] = b.images.map((im) => im.data);
        for (let i = 0; i < g.at.length; i++) {
          const age = t - g.at[i];
          const o = i * 4;
          hole[o + 3] = 255 * clamp((age - 0.05) / 0.08);
          const rimChar = g.rim[i] * clamp((t - g.rimAt[i]) / 0.45) * 0.9;
          const front = Math.max(clamp((age + 0.4) / 0.4) * 0.95, rimChar);
          char[o] = 38; char[o + 1] = 17; char[o + 2] = 6;
          char[o + 3] = 255 * front;
          // the burning front glows; the kept rim smoulders a while after the fire reached it
          const flame = age > -0.06 && age < 0.16 ? 1 - Math.abs(age - 0.05) / 0.11 : 0;
          const smoulder = g.rim[i] > 0.5 && t > g.rimAt[i] ? g.rim[i] * Math.exp(-(t - g.rimAt[i]) * 1.1) * (0.65 + 0.35 * Math.sin(t * 9 + i * 0.7)) : 0;
          const e = clamp(Math.max(flame, smoulder * 0.8));
          glow[o] = 255; glow[o + 1] = 120 + 90 * e; glow[o + 2] = 30 + 40 * e;
          glow[o + 3] = 255 * e;
        }
        b.masks.forEach((c, i) => c.getContext('2d')!.putImageData(b.images[i], 0, 0));
        sc.imageSmoothingEnabled = true;
        sc.globalCompositeOperation = 'source-atop';
        sc.drawImage(b.masks[1], 0, 0, b.BW, b.BH);
        sc.globalCompositeOperation = 'destination-out';
        sc.drawImage(b.masks[0], 0, 0, b.BW, b.BH);
        sc.globalCompositeOperation = 'source-over';
      }
      const x = k.x;
      const enter = easeOut((t - s.enter) / 0.22);
      const y = b.oy + (1 - enter) * -60;
      x.save();
      x.globalAlpha = enter;
      k.shadowed(() => x.drawImage(b.sheet, b.ox, y), 26, 14);
      x.restore();
      if (!lit) return;
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.shadowColor = '#ff7a1a';
      x.shadowBlur = 22;
      x.drawImage(b.masks[2], b.ox, y, b.BW, b.BH);
      x.restore();
      // embers off the front, rising and fading
      const r = rng(b.seed + 11);
      const goAt = p.exit().at - 0.1;
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70 + 50 * p.feel.force; i++) {
        const late = i % 3 === 0;
        const born = (late ? goAt : p.wordTime) + r() * (late ? 0.6 : 1.3);
        const [ang, life, size, drift] = [Math.PI * (1 + r()), 0.5 + r() * 0.7, 2 + r() * 3.5, (r() - 0.5) * 90];
        const e = t - born;
        if (e < 0 || e > life) continue;
        const rad = late ? r() * b.BW * 0.5 : Math.min(b.BW, (born - p.wordTime) * b.speed);
        const sx = b.ox + clamp((b.ign[0] + Math.cos(ang) * rad) / b.BW) * b.BW + drift * e;
        const sy = y + clamp((b.ign[1] + Math.sin(ang) * rad * 0.5) / b.BH) * b.BH - 170 * e - 40 * e * e;
        x.globalAlpha = (1 - e / life) * 0.9;
        x.fillStyle = e < life * 0.4 ? '#ffd27a' : '#ff8a2a';
        x.beginPath();
        x.arc(sx, sy, size * (1 - e / life * 0.5), 0, 7);
        x.fill();
      }
      x.restore();
    },
    metrics: metricsOf(k, passes.map((s) => s.p)),
  };
}

// ---- strike / melt ----
/** From the verb the line's ink sags and runs: every stroke slumps a little, a few run long and drip off. */
function buildMelt(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 150, 1500);
  const cache = new Map<string, HTMLCanvasElement>();
  const glyphPic = (ch: string, size: number, ink: string, press: string, halo = '') => {
    const key = `${ch}|${size}|${ink}|${halo}`;
    let c = cache.get(key);
    if (!c) {
      c = k.canvas(Math.ceil(size * 1.3), Math.ceil(size * 1.5));
      k.glyph(c.getContext('2d')!, ch, c.width / 2, c.height * 0.45, size, ink, 6, press, halo);
      cache.set(key, c);
    }
    return c;
  };
  const Y = 500;
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + lastExit(passes).dur + 0.3, jolts: [], region: [200, 380, 1720, 720],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const x = k.x;
      const hold = k.alive(p.id, t);
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const wi = Math.max(0, p.parts.wordAt);
      const going = Math.max(0, t - p.exit().at);
      x.globalAlpha = hold;
      p.main.forEach((c, i) => {
        if (/\s/.test(c.ch)) return;
        const size = p.isWord(i) ? p.size * 1.12 : p.size;
        // the melt spreads out from the word, a character at a time; one sung later melts as it is sung
        const from = Math.max(c.at + 0.12, p.wordTime + Math.abs(i - wi) * 0.07);
        const e = t - from + going * 2;
        if (t < c.at || e <= 0) {
          k.stampIn(x, c.ch, p.xs[i], Y + p.ys[i], size, c.at, t, inks.ink, inks.ghost, 6, inks.press, 0.32, inks.halo);
          return;
        }
        const g = glyphPic(c.ch, size, inks.ink, inks.press, inks.halo);
        const [gw, gh] = [g.width, g.height];
        const [x0, y0] = [p.xs[i] - gw / 2, Y + p.ys[i] - gh * 0.45];
        const sag = size * 0.08 * easeOut(e / 1.5);
        const top = Math.round(gh * 0.42);
        const cw = 3;
        for (let sx = 0; sx < gw; sx += cw) {
          const j = sx / cw;
          const kk = clamp(0.5 + 0.42 * Math.sin(j * 0.45 + i * 2.1) * Math.cos(j * 0.17 + i * 0.9) + 0.12 * Math.sin(j * 1.3 + i));
          const drip = dripOf(e, kk, size, p.feel.force) * (1 + going * 3);
          x.drawImage(g, sx, 0, cw, top, x0 + sx, y0 + sag, cw, top);
          x.drawImage(g, sx, top, cw, gh - top, x0 + sx, y0 + sag + top, cw, gh - top + drip);
          // a long run lets a drop go now and then
          if (kk > 0.82 && j % 3 === 0 && e > 0.7) {
            const ph = (e - 0.7 + j * 0.13) % 0.9;
            x.fillStyle = inks.ink;
            x.beginPath();
            x.ellipse(x0 + sx + 1, y0 + sag + gh + drip - size * 0.32 + 900 * ph * ph, size * 0.028, size * 0.04, 0, 0, 7);
            x.fill();
          }
        }
      });
      x.globalAlpha = 1;
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- strike / slice ----
/** The verb cuts the line along one slant: a blade flashes through, the upper half slides off along the cut and holds there. */
function buildSlice(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 150, 1500);
  const Y = 520;
  const cuts = passes.map((p) => {
    const h = hashOf(p.cue.text);
    // a sword's slant through the word (55-70° off the level): the line splits at the word and its halves slide along the cut
    const deg = (55 + (h % 16)) * (h % 2 ? 1 : -1);
    const wi = Math.max(0, p.parts.wordAt);
    const at: [number, number] = [p.xs[wi] + (p.parts.wordLen - 1) * p.size * 0.52, Y + p.ys[wi] + p.size * 0.04];
    return { u: [Math.cos(deg * RAD), Math.sin(deg * RAD)] as [number, number], at };
  });
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + lastExit(passes).dur + 0.4, jolts: passes.map((p) => jolt(p.wordTime, 0.3 + 0.5 * p.feel.force)), region: [200, 380, 1720, 680],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const cut = cuts[passes.indexOf(p)];
      const x = k.x;
      const hold = k.alive(p.id, t);
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const RH = Math.round(p.size * (2.6 + (p.rows - 1) * 1.25));
      const row = rowCanvas(k, p, t, inks, RH);
      const e = t - p.wordTime;
      x.globalAlpha = hold;
      if (e < 0) {
        x.drawImage(row, 0, Y - RH / 2);
      } else {
        const going = Math.max(0, t - p.exit().at);
        const sh = sliceShift(e, p.feel.force) + 900 * going * going;
        const [ux, uy] = cut.u;
        const [cx, cy] = cut.at;
        const half = (side: 1 | -1, k2: number) => {
          x.save();
          x.beginPath();
          x.moveTo(cx - ux * 3000, cy - uy * 3000);
          x.lineTo(cx + ux * 3000, cy + uy * 3000);
          x.lineTo(cx + ux * 3000 + side * -uy * 3000, cy + uy * 3000 + side * ux * 3000);
          x.lineTo(cx - ux * 3000 + side * -uy * 3000, cy - uy * 3000 + side * ux * 3000);
          x.closePath();
          x.clip();
          x.translate(ux * sh * k2, uy * sh * k2 + side * 3 * clamp(e / 0.1));
          x.drawImage(row, 0, Y - RH / 2);
          x.restore();
        };
        half(-1, 1);
        half(1, -0.35);
        // the cut's hairline stays across the line
        const reach = p.size * 0.95;
        x.strokeStyle = inks.accent;
        x.lineWidth = 3;
        x.globalAlpha = hold * 0.7;
        x.beginPath();
        x.moveTo(cx - ux * reach, cy - uy * reach);
        x.lineTo(cx + ux * reach, cy + uy * reach);
        x.stroke();
      }
      // the blade: a streak through the whole frame, crossing as the verb is sung
      const b = t - (p.wordTime - 0.08);
      if (b >= 0 && b < 0.38) {
        const [ux, uy] = cut.u;
        const [cx, cy] = cut.at;
        const head = clamp(b / 0.08);
        const fade = b < 0.08 ? 1 : 1 - (b - 0.08) / 0.3;
        const [sx, sy] = [cx - ux * 900, cy - uy * 900];
        const [ex, ey] = [sx + ux * 1800 * head, sy + uy * 1800 * head];
        x.save();
        x.globalAlpha = fade * hold;
        x.shadowColor = inks.accent;
        x.shadowBlur = 24;
        x.strokeStyle = inks.accent;
        x.lineCap = 'round';
        x.lineWidth = 12 * fade + 2;
        x.beginPath();
        x.moveTo(sx, sy);
        x.lineTo(ex, ey);
        x.stroke();
        x.strokeStyle = '#ffffff';
        x.lineWidth = 3;
        x.stroke();
        x.restore();
      }
      x.globalAlpha = 1;
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- strike / wipe ----
/**
 * The line stands whole and is read; nothing touches the type while it reads. At its last moment, once its reading
 * time has passed and its last character is sung, one stroke of a cloth wipes the whole line away: the ink smears
 * along the stroke for a breath and is gone, before the next line comes where it can.
 */
function buildWipe(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 150, 1500);
  const Y = 520;
  /** When the stroke starts and how long it takes: a quick line is wiped quicker. */
  const strokeOf = (p: Pass) => {
    const want = 0.42 - 0.12 * p.feel.pace;
    const read = p.enter + 0.2 + readingSec(mainOf(p.cue.text), p.cue.start, p.cue.end);
    const next = k.nextStart(p.id);
    const from = Math.max(p.last + 0.08, Math.min(read, Math.max(next - 0.05 - want, p.exit().at)));
    // a line sung to its last breath is wiped quicker, so the stroke is done as the next line comes
    const dur = Math.max(0.18, Math.min(want, next - 0.02 - from));
    return { from, dur };
  };
  const SLANT = Math.tan(16 * RAD);
  return {
    from: passes[0].enter - 0.05, to: () => { const s = strokeOf(passes[passes.length - 1]); return s.from + s.dur + 0.3; }, jolts: [], region: [200, 400, 1720, 660],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const { from, dur } = strokeOf(p);
      if (t >= from + dur + 0.25) return;
      const x = k.x;
      k.drawAsides(p.parts.asides, t, inks, from);
      const RH = Math.round(p.size * (2.4 + (p.rows - 1) * 1.25));
      const row = rowCanvas(k, p, t, inks, RH);
      const top = Y - RH / 2;
      if (t < from) {
        x.drawImage(row, 0, top);
        return;
      }
      // the stroke: its leading edge slants like a cloth held at an angle, easing across the line in one go
      const u = clamp((t - from) / dur);
      const s = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const [x0, x1] = [p.span[0] - 120, p.span[1] + 140];
      const edge = mix(x0, x1, s);
      const edgeAt = (y: number) => edge + (y - RH / 2) * SLANT;
      const rc = row.getContext('2d')!;
      // what the cloth passed is gone, with a short feather at the edge
      rc.globalCompositeOperation = 'destination-out';
      const g = rc.createLinearGradient(edge - 50, 0, edge + 30, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      rc.fillStyle = g;
      rc.beginPath();
      rc.moveTo(-200, 0);
      rc.lineTo(edgeAt(0) + 30, 0);
      rc.lineTo(edgeAt(RH) + 30, RH);
      rc.lineTo(-200, RH);
      rc.closePath();
      rc.fill();
      rc.globalCompositeOperation = 'source-over';
      // the ink dragged along the stroke, just behind the edge, thinning as it goes
      const whole = rowCanvas(k, p, t, inks, RH);
      x.save();
      x.beginPath();
      x.moveTo(edgeAt(-40) - 170, top - 40);
      x.lineTo(edgeAt(-40) + 20, top - 40);
      x.lineTo(edgeAt(RH + 40) + 20, top + RH + 40);
      x.lineTo(edgeAt(RH + 40) - 170, top + RH + 40);
      x.closePath();
      x.clip();
      for (const [dx, a] of [[22, 0.14], [46, 0.09], [72, 0.05]] as const) {
        x.globalAlpha = a * (1 - u * 0.5);
        x.drawImage(whole, -dx, top);
      }
      x.restore();
      x.globalAlpha = 1;
      x.drawImage(row, 0, top);
      // the cloth itself: a soft band at the edge, the keyline's pole, so the stroke is seen on any ground
      if (u < 1) {
        x.save();
        x.globalAlpha = 0.16 * (1 - Math.abs(2 * u - 1) ** 3);
        const tone = inks.halo ?? k.mixHex(inks.ink, inks.paper, 0.5);
        const band = x.createLinearGradient(edge - 70, 0, edge + 20, 0);
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(0.5, tone);
        band.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = band;
        x.beginPath();
        x.moveTo(edgeAt(-60) - 70, top - 60);
        x.lineTo(edgeAt(-60) + 20, top - 60);
        x.lineTo(edgeAt(RH + 60) + 20, top + RH + 60);
        x.lineTo(edgeAt(RH + 60) - 70, top + RH + 60);
        x.closePath();
        x.fill();
        x.restore();
      }
    },
    metrics: () => passes.map((p) => k.metric(p.id, p.cue.text, p.enter + 0.12, strokeOf(p).from, p.enter, p.last)),
  };
}

// ---- strike / fly ----
/** From the verb the line is let go: it lifts and drifts (放手, 飛ぶ) or is hurled off-centre (丟, 吹き飛ばす); as the line goes it flies out of the frame. */
function buildFly(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 150, 1500);
  const hurl = /[丟扔甩投拋抛]|飛ばす|吹き飛|throw|toss|blow/i.test(m.word);
  const Y = 540;
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + 1.2, jolts: hurl ? passes.map((p) => jolt(p.wordTime, 0.45)) : [], region: [200, 360, 1720, 700],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const x = k.x;
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const n = p.main.length;
      const goFrom = p.exit().at - 0.05;
      const at = (i: number, tt: number) => {
        const d = flyDrift(tt - p.wordTime, hurl, i, n);
        const u = Math.max(0, tt - goFrom - i * 0.035);
        if (u > 0) {
          if (hurl) { d.dx += 1500 * u + 900 * u * u; d.dy += -380 * u + 700 * u * u; d.rot += 7 * u; }
          else { d.dx += 60 * Math.sin(u * 4 + i); d.dy += -260 * u - 900 * u * u; d.rot += 1.6 * u * Math.sin(i); }
        }
        return d;
      };
      const draw = (tt: number, alpha: number) => {
        x.globalAlpha = alpha;
        p.main.forEach((c, i) => {
          if (/\s/.test(c.ch)) return;
          const d = at(i, tt);
          const s = p.isWord(i) ? p.size * 1.12 : p.size;
          x.save();
          x.translate(p.xs[i] + d.dx, Y + p.ys[i] + d.dy);
          x.rotate(d.rot);
          k.stampIn(x, c.ch, 0, 0, s, c.at, t, inks.ink, inks.ghost, 6, inks.press, 0.32, inks.halo);
          x.restore();
        });
      };
      // the throw's smear, drawn from where the line was a moment ago
      const e = t - p.wordTime;
      if (hurl && e > 0 && e < 0.2) for (const j of [3, 2, 1]) draw(t - j / 60, 0.16);
      if (t > goFrom) for (const j of [2, 1]) draw(t - j / 50, 0.14);
      draw(t, 1);
      x.globalAlpha = 1;
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- shape / circle ----
/**
 * The line laid along the top of a circle, the thing it names drawn as the circle: a moon is a pale disc, a clock
 * ticks round on the beats, a ring has a glint going round it, a plain round is drawn by a pen as the word is sung.
 */
function buildCircle(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m);
  const kind = /[鐘]|時計|clock/i.test(m.word) ? 'clock' : /月|moon/i.test(m.word) ? 'moon' : /[輪環]|戒指|ring/i.test(m.word) ? 'ring' : 'round';
  // a long line goes round both rims, broken where the row would break
  const lay = passes.map((p) => { const n = p.main.length; const cut = n > 12 ? rowBreak(p.main.map((c) => c.ch), 1, 1, p.parts.wordAt >= 0 ? [p.parts.wordAt, p.parts.wordAt + p.parts.wordLen] : undefined) : n; return cut < n ? circleLayout(cut, n - cut, 150, 370) : circleLayout(n); });
  const turn = hashOf(m.word + passes[0].cue.text) % 2 ? 1 : -1;
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + lastExit(passes).dur + 0.05, jolts: [], region: [400, 160, 1520, 760],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const L = lay[passes.indexOf(p)];
      const x = k.x;
      const hold = k.alive(p.id, t) * easeOut((t - p.enter) / 0.15);
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const [cx, cy] = [960, 540];
      const inner = L.r - L.size * (L.under.some(Boolean) ? 0.85 : 0.8);
      const rot = kind === 'clock' ? tickAt(t, p.enter, k.job.beats) * turn : kind === 'round' ? 0 : 5 * RAD * Math.sin((t - p.enter) * 0.8) * turn;
      const drawn = easeOut((t - p.enter) / 0.6);
      x.save();
      x.globalAlpha = hold;
      x.lineCap = 'round';
      if (kind === 'moon') {
        x.fillStyle = inks.accent;
        x.globalAlpha = hold * 0.22;
        x.beginPath();
        x.arc(cx, cy, inner - 14, 0, 7);
        x.fill();
        x.globalAlpha = hold;
      }
      if (kind !== 'round') {
        x.strokeStyle = inks.ink;
        x.lineWidth = 5;
        x.globalAlpha = hold * 0.6;
        for (const rr of kind === 'ring' ? [inner, inner - 14] : [inner]) {
          x.beginPath();
          x.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * drawn);
          x.stroke();
        }
        if (kind === 'clock') {
          for (let h = 0; h < 12; h++) {
            const a = (h / 12) * 2 * Math.PI + rot;
            const len = h % 3 ? 14 : 28;
            x.lineWidth = h % 3 ? 4 : 7;
            x.beginPath();
            x.moveTo(cx + Math.cos(a) * (inner - 10), cy + Math.sin(a) * (inner - 10));
            x.lineTo(cx + Math.cos(a) * (inner - 10 - len), cy + Math.sin(a) * (inner - 10 - len));
            x.stroke();
          }
        }
        if (kind === 'ring' && drawn >= 1) {
          const g = ((t - p.enter) * 1.6) % (2 * Math.PI);
          x.strokeStyle = inks.paper === inks.ink ? '#ffffff' : inks.paper;
          x.globalAlpha = hold * 0.85;
          x.lineWidth = 7;
          x.beginPath();
          x.arc(cx, cy, inner - 7, g, g + 0.35);
          x.stroke();
        }
      } else if (t >= p.wordTime) {
        // a pen draws the round as the word is sung, a little past where it began
        const u = easeOut((t - p.wordTime) / 0.55);
        const a0 = -120 * RAD;
        x.strokeStyle = inks.accent;
        x.lineWidth = 8;
        x.globalAlpha = hold * 0.9;
        x.beginPath();
        for (let a = 0; a <= 380 * RAD * u; a += 0.04) {
          const rr = inner * (0.97 + 0.02 * Math.sin(a * 3 + 1) - 0.03 * (a / (2 * Math.PI)));
          const [px, py] = [cx + Math.cos(a0 + a) * rr, cy + Math.sin(a0 + a) * rr];
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
      }
      x.globalAlpha = hold;
      p.main.forEach((c, i) => {
        if (/\s/.test(c.ch)) return;
        const a = L.angles[i] + rot;
        const s = p.isWord(i) ? L.size * 1.12 : L.size;
        x.save();
        x.translate(cx + Math.cos(a) * L.r, cy + Math.sin(a) * L.r);
        x.rotate(L.under[i] ? a - Math.PI / 2 : a + Math.PI / 2);
        k.stampIn(x, c.ch, 0, 0, s, c.at, t, inks.ink, inks.ghost, 6, inks.press, 0.32, inks.halo);
        x.restore();
      });
      x.restore();
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- shape / rise ----
export type RiseKind = 'smoke' | 'bubble' | 'balloon' | 'burst' | 'lift';
/** What the rising line names, by its word: smoke, bubbles, a balloon, a firework; else the line itself rises (昇天, 升起, 浮かぶ). */
export function riseKindOf(word: string): RiseKind {
  if (/泡|シャボン|bubble/i.test(word)) return 'bubble';
  if (/花火|煙火|firework/i.test(word)) return 'burst';
  if (/煙|けむり|smoke/i.test(word)) return 'smoke';
  if (/氣球|気球|風船|balloon/i.test(word)) return 'balloon';
  return 'lift';
}
/**
 * The line stands and reads; what it says goes up. Smoke rises off the sung characters in wisps that curl, widen and
 * thin as they climb, soft-edged, never over the words; bubbles wobble up as sheened rings and pop; a balloon's
 * characters sway buoyant once sung; a firework's burst flares on each. The plain rise (昇天, 升起, 浮かぶ) is the type's
 * own: each character, once sung, lifts off its row with a short after-image beneath it and motes of the accent
 * climbing past, so the line reads as rising while it is read; once read, the whole line ascends out of the frame,
 * trailing, and thins away. Nothing is drawn over a character before it is read.
 */
function buildRise(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 140, 1500);
  const kind = riseKindOf(m.word);
  const Y = 640;
  // a soft puff, drawn once per colour: every wisp is puffs of it along its path
  const puffs = new Map<string, HTMLCanvasElement>();
  const puffOf = (color: string) => {
    let c = puffs.get(color);
    if (!c) {
      c = k.canvas(96, 96);
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      grad.addColorStop(0, color);
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 96, 96);
      puffs.set(color, c);
    }
    return c;
  };
  const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  interface Wisp { i: number; born: number; phase: number; drift: number; life: number; big: boolean; turn: number }
  // a wisp now and then off a sung character, more off the named word; the line's going sends up the rest
  const wispsOf = (p: Pass): Wisp[] => {
    const r = rng(k.song + Math.round(p.wordTime * 10));
    const out: Wisp[] = [];
    const wisp = (i: number, born: number, big: boolean): Wisp => ({ i, born, phase: r() * 6.3, drift: (r() - 0.5) * 40, life: 2.6 + r() * 0.8, big, turn: r() < 0.5 ? -1 : 1 });
    p.main.forEach((c, i) => {
      if (!isSungChar(c.ch)) return;
      if (p.isWord(i)) for (let j = 0; j < 3; j++) out.push(wisp(i, c.at + 0.08 + j * 0.9 + r() * 0.3, true));
      else if (i % 2 === 0) out.push(wisp(i, c.at + 0.15 + r() * 0.5, false));
      if (p.isWord(i) || i % 3 === 0) out.push(wisp(i, p.exit().at - 0.05 + i * 0.03, true));
    });
    return out;
  };
  const wisps = passes.map(wispsOf);
  // the plain rise's motes: a few soft specks of the accent climb off each character as it is sung, more off the word
  interface Mote { i: number; born: number; dx: number; speed: number; r: number; phase: number }
  const motesOf = (p: Pass): Mote[] => {
    const r = rng(k.song + 11 + Math.round(p.wordTime * 10));
    const out: Mote[] = [];
    p.main.forEach((c, i) => {
      if (!isSungChar(c.ch)) return;
      const n = p.isWord(i) ? 5 : 3;
      for (let j = 0; j < n; j++) out.push({ i, born: c.at + 0.05 + j * 0.22 + r() * 0.12, dx: (r() - 0.5) * p.size * 0.7, speed: 170 + r() * 110, r: 7 + r() * 7, phase: r() * 6.3 });
    });
    return out;
  };
  const motes = kind === 'lift' ? passes.map(motesOf) : [];
  // how a sung character floats: the plain rise lifts a little and keeps lifting; a balloon lifts more and sways
  const buoyancy = kind === 'balloon' ? { speed: 20, wobble: 9 } : kind === 'lift' ? { speed: 26, wobble: 3 } : undefined;
  // the line leaves inside the engine's exit window, as any line does: the next line may show the moment it closes
  // (i REVOLUTION's 上がらせ was still climbing over 脳！波！Pump), so the ascent runs head first through the line and
  // every character is gone by then, however long the line (第六感's 22-character tail stood on the next cut)
  const leave = (p: Pass) => Math.max(0.25, p.exit().dur);
  const stagger = (p: Pass) => Math.min(0.03, (0.3 * leave(p)) / Math.max(1, p.main.length));
  // once read, the plain rise and the smoke shoot off; a balloon and bubbles drift off, still swaying
  const slow = kind === 'balloon' || kind === 'bubble';
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + Math.max(0.5, lastExit(passes).dur) + 0.05, jolts: [], region: [200, 540, 1720, 740],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const x = k.x;
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const goFrom = p.exit().at - 0.05;
      const topOf = (i: number) => Y + p.ys[i] - p.size * 0.62;
      const lineTop = Math.min(...p.main.map((_, i) => topOf(i)));
      // whatever rose off the line thins out within half a second of the line's going: the next line is never read
      // through smoke, bubbles or motes left behind (雙截棍's 店裡面的媽媽桑 under the 煙味 wisps)
      const gone = clamp(1 - (t - p.exit().at) / Math.min(0.5, leave(p)));
      // what rises off the type
      if ((kind === 'smoke' || kind === 'bubble') && gone > 0) {
        const puff = puffOf(rgba(inks.ghost, 0.9));
        const sheen = puffOf(rgba(inks.paper === inks.ink ? '#ffffff' : inks.paper, 0.9));
        x.save();
        for (const w of wisps[passes.indexOf(p)]) {
          const age = t - w.born;
          if (age < 0 || age > w.life) continue;
          const x0 = p.xs[w.i];
          // the wisp's head rises and curls, the curl widening as it goes; its trail is its earlier heads, each puff
          // wider and thinner with its own age, so the whole bends like a ribbon of smoke and thins out at the top
          const steps = kind === 'smoke' ? 16 : 1;
          for (let s = 0; s < steps; s++) {
            const a = age - s * 0.11;
            if (a < 0) break;
            const climb = (130 + (w.big ? 50 : 0)) * a + 18 * a * a;
            const curl = w.turn * (w.big ? 70 : 50) * Math.sin(a * 1.7 + w.phase) * Math.min(1, a * 0.8) + w.drift * a;
            const px = x0 + curl;
            const py = lineTop - 10 - climb;
            const spread = (w.big ? 18 : 13) + (w.big ? 64 : 46) * Math.pow(a, 0.8);
            const thin = Math.pow(1 - a / w.life, 1.5);
            if (kind === 'smoke') {
              x.globalAlpha = 0.11 * thin * clamp(a * 3) * (1 - s * 0.03) * gone;
              x.drawImage(puff, px - spread, py - spread, spread * 2, spread * 2);
            } else {
              // a bubble: a sheened round the width of its age, a rim in the ink, a glint on its shoulder; in its last
              // quarter second it pops, the rim swelling and thinning to nothing
              const left = w.life - a;
              const pop = left < 0.25 ? 1 - left / 0.25 : 0;
              const rr = (6 + 14 * Math.min(1, a / 1.2) + (w.big ? 6 : 0)) * (1 + 0.5 * pop);
              x.globalAlpha = 0.55 * thin * (1 - pop) * gone;
              x.drawImage(sheen, px - rr * 1.3, py - rr * 1.3, rr * 2.6, rr * 2.6);
              x.globalAlpha = 0.72 * (1 - pop) * clamp(a * 4) * gone;
              x.strokeStyle = inks.ink;
              x.lineWidth = 2;
              x.beginPath();
              x.arc(px, py, rr, 0, 7);
              x.stroke();
              x.strokeStyle = inks.paper === inks.ink ? '#ffffff' : inks.paper;
              x.lineWidth = 3;
              x.beginPath();
              x.arc(px, py, rr * 0.7, -2.4, -1.6);
              x.stroke();
            }
          }
        }
        x.restore();
      }
      // the plain rise's motes, under the type: each climbs off its character, swaying a little, and thins out
      if (kind === 'lift' && gone > 0) {
        const speck = puffOf(rgba(inks.accent, 0.95));
        x.save();
        for (const mo of motes[passes.indexOf(p)]) {
          const a = t - mo.born;
          if (a < 0 || a > 1.6) continue;
          const px = p.xs[mo.i] + mo.dx + 10 * Math.sin(a * 2.4 + mo.phase);
          const py = Y + p.ys[mo.i] + p.size * 0.45 - mo.speed * a;
          const rr = mo.r * (1 + a * 0.5);
          x.globalAlpha = 0.9 * clamp(a * 6) * Math.pow(1 - a / 1.6, 1.4) * gone;
          x.drawImage(speck, px - rr, py - rr, rr * 2, rr * 2);
        }
        x.restore();
      }
      // the line itself: at rest until sung, each character popping as sung and then afloat; going, it lifts and thins away
      p.main.forEach((c, i) => {
        if (/\s/.test(c.ch)) return;
        const s = p.isWord(i) ? p.size * 1.12 : p.size;
        // the character's way out: its share of the exit window, from 0 (standing) to 1 (gone)
        const u = clamp((t - goFrom - i * stagger(p)) / leave(p));
        const away = slow ? -(150 * u + 90 * u * u) : -(260 * u + 200 * u * u);
        const fade = 1 - u;
        if (fade <= 0) return;
        const e = t - c.at;
        const sung = t >= c.at;
        const lift = buoyancy && sung ? riseAt(t, c.at, i * 1.3, buoyancy.speed, buoyancy.wobble) : { dx: 0, dy: 0, scale: 1 };
        const rot = kind === 'balloon' && sung ? 3 * RAD * Math.sin(e * 1.3 + i) : 0;
        const [px, py] = [p.xs[i] + lift.dx, Y + p.ys[i] + lift.dy + away];
        x.save();
        x.globalAlpha = fade;
        // the plain rise's after-image: for a moment after it is sung, and as it leaves, the character's own trail hangs
        // below it in the line's ink, each copy lower and fainter, so the lift reads as motion (the character itself is
        // drawn over it, whole)
        if (kind === 'lift' && sung) {
          const trail = u > 0 ? 1 : clamp(1 - e / 1.1);
          if (trail > 0) for (const [dy, k2] of [[0.14, 0.3], [0.28, 0.17], [0.42, 0.08]] as const) {
            x.globalAlpha = fade * k2 * trail;
            k.glyph(x, c.ch, px, py + s * dy * (u > 0 ? 1.6 : 1), s, inks.ink, 0, '', inks.halo);
          }
          x.globalAlpha = fade;
        }
        x.translate(px, py);
        x.rotate(rot);
        k.stampIn(x, c.ch, 0, 0, s, c.at, t, inks.ink, inks.ghost, 6, inks.press, 0.15, inks.halo);
        if (sung && kind === 'burst' && e < 0.5) {
          x.strokeStyle = inks.accent;
          x.globalAlpha = (1 - e / 0.5) * fade;
          x.lineWidth = 4;
          for (let j = 0; j < 10; j++) {
            const a = (j / 10) * 2 * Math.PI + i;
            const [r0, r1] = [s * (0.55 + e * 1.2), s * (0.75 + e * 1.8)];
            x.beginPath();
            x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
            x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
            x.stroke();
          }
        }
        x.restore();
      });
      x.globalAlpha = 1;
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- freeze ----
/** The frame stops on the stopping word (the engine renders the held time) and greys; only this line goes on, sung and pushing in, until the world resumes. */
function buildFreeze(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 150, 1500);
  const p0 = passes[0];
  const [from, until] = freezeSpan(p0.wordTime, p0.last, k.job.beats);
  return {
    stageAt: (t) => (t >= from && t < until ? from : undefined),
    from: p0.enter - 0.05, to: () => lastExit(passes).at + lastExit(passes).dur + 0.05, jolts: [], region: [200, 400, 1720, 680],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const x = k.x;
      if (p === p0 && t >= from && t < until + 0.2) {
        const w = t < until ? easeOut((t - from) / 0.08) : 1 - (t - until) / 0.2;
        x.save();
        x.globalCompositeOperation = 'saturation';
        x.fillStyle = '#808080';
        x.globalAlpha = 0.85 * w;
        x.fillRect(-200, -200, W + 400, H + 400);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = '#c8c8c8';
        x.globalAlpha = 0.6 * w;
        x.fillRect(-200, -200, W + 400, H + 400);
        x.restore();
        const flash = 1 - (t - from) / 0.12;
        if (flash > 0) {
          x.save();
          x.fillStyle = '#ffffff';
          x.globalAlpha = 0.3 * flash;
          x.fillRect(-200, -200, W + 400, H + 400);
          x.restore();
        }
      }
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      const push = p === p0 ? 1 + 0.07 * easeOut((t - from) / Math.max(0.3, until - from)) : 1;
      x.save();
      x.globalAlpha = k.alive(p.id, t);
      x.translate(960, 540);
      x.scale(push, push);
      x.translate(-960, -540);
      stampRow(k, x, p, t, inks, 540);
      x.restore();
    },
    metrics: metricsOf(k, passes),
  };
}

// ---- echo ----
/** The answering line, and under it the earlier line it answers, faint, its shared word under this one's, surfacing as the shared word is sung. */
function buildEcho(k: Kit, m: SignatureMoment): Built {
  const passes = passesOf(k, m, 140, 1450);
  const earlier = k.cueOf(m.cues[0]);
  const old = k.partsOf(earlier.text, [...earlier.text].map(() => 0), '').main;
  const Y = 470;
  const layOld = (p: Pass) => {
    const n = old.length;
    const size = Math.max(56, Math.min(p.size * 1.05, 1700 / Math.max(1, n)));
    const w0 = wordIndex(earlier.text, m.word);
    const oi = Math.max(0, old.findIndex((c) => c.src === w0));
    const wi = Math.max(0, p.parts.wordAt);
    let x0 = p.xs[wi] - oi * size * 1.04;
    x0 = Math.min(W - 110 - size / 2 - (n - 1) * size * 1.04, Math.max(110 + size / 2, x0));
    const wordLen = [...m.word].length;
    return { size, xs: old.map((_, i) => x0 + i * size * 1.04), y: Y + Math.max(...p.ys) + p.size * 0.78 + size * 0.62, isWord: (i: number) => i >= oi && i < oi + wordLen, oi };
  };
  const olds = passes.map(layOld);
  return {
    from: passes[0].enter - 0.05, to: () => lastExit(passes).at + lastExit(passes).dur + 0.05, jolts: [], region: [200, 340, 1720, 760],
    draw(t, inks) {
      const p = passAt(passes, t);
      if (t < p.enter) return;
      const o = olds[passes.indexOf(p)];
      const x = k.x;
      const hold = k.alive(p.id, t);
      k.drawAsides(p.parts.asides, t, inks, p.exit().at);
      // the earlier line surfaces from its shared word outward
      old.forEach((c, i) => {
        if (/\s/.test(c.ch)) return;
        const e = t - (p.wordTime - 0.1 + Math.abs(i - o.oi) * 0.035);
        if (e < 0) return;
        const up = easeOut(e / 0.5);
        const a = up * hold * (o.isWord(i) ? 0.62 : 0.34);
        const ink = o.isWord(i) ? inks.accent : inks.ink;
        x.save();
        for (const [dx, k2] of [[-2, 0.5], [2, 0.5], [0, 1]] as const) {
          x.globalAlpha = a * k2;
          k.glyph(x, c.ch, o.xs[i] + dx, o.y + 24 * (1 - up), o.size, ink, 0, '', inks.halo);
        }
        x.restore();
      });
      x.save();
      x.globalAlpha = hold;
      stampRow(k, x, p, t, inks, Y);
      x.restore();
    },
    metrics: metricsOf(k, passes),
  };
}

const BUILDERS: Record<string, (k: Kit, m: SignatureMoment) => Built> = {
  'strike/burn': buildBurn, 'strike/melt': buildMelt, 'strike/slice': buildSlice, 'strike/wipe': buildWipe, 'strike/fly': buildFly,
  'shape/circle': buildCircle, 'shape/rise': buildRise, 'freeze/stop': buildFreeze, 'echo/ghost': buildEcho,
};
export const buildMore = (k: Kit, m: SignatureMoment): Built => BUILDERS[`${m.form}/${m.variant}`](k, m);
