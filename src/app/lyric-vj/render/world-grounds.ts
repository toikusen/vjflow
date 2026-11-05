// The grounds of the style worlds. Nothing here is a sheet of paper with things on it: a static field, a brick wall lit by
// what hangs on it, a console's glass, a wall of lamps, wet rice paper, a projected card, leaded light, a tooled wallpaper.
// Each takes its colours from the world's slots, keeps its busiest moves off the words, and is a function of time alone.
import { contrast } from '../contrast';
import { mixHex, Box, Pt } from './material';
import { brushStroke, inkWash, reservePaper, spatter } from './world-ink';
import type { Slots } from './world-objects';
import type { LabelLang } from '../labels';
import { handGrounds, handIns } from './world-packs';

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export interface WorldEnv {
  ctx: CanvasRenderingContext2D;
  /** Seconds since the cut. */
  age: number;
  /** Seconds into the song, for what keeps running across cuts. */
  now: number;
  seed: number;
  paper: string;
  ink: string;
  slots: Slots;
  /** The line's box; carried: it stands whole on an opaque carrier of its own (graphics.ts Rect). */
  rect?: Box & { carried?: boolean };
  weight: number;
  pulse: number;
  /** How loud this part is, 0..1. */
  level: number;
  /** The frame's own coordinates, what stays with the words while the ground slides. */
  base?: DOMMatrix;
  /** The song's own title, for a world's small printed labels (only real data goes on them). */
  title?: string;
  /** The song's tempo and the seconds since its last beat, for what keeps the beat (a flash card's beat pips). */
  bpm?: number;
  since?: number;
  /** The line as an item of the song (a receipt's number and 段落): its number, its part, the lines sung before it. */
  item?: WorldItem;
  /** The language the world's small labels are printed in: the lyric's (labels.ts). */
  lang?: LabelLang;
}
/** A line's place in the song, for a world that prints it: 1-based number, its part's name, the lines before it. */
export interface WorldItem { no: number; part: string; /** The line's own words. */ text?: string; prev: { no: number; text: string; part: string }[] }

type Ground = (e: WorldEnv) => void;
const layers = new Map<string, OffscreenCanvas>();
/** A picture made once and kept: what does not change between frames is not painted between frames. */
function kept(key: string, w: number, h: number, paint: (c: OffscreenCanvasRenderingContext2D) => void) {
  const hit = layers.get(key);
  if (hit) return hit;
  const cv = new OffscreenCanvas(w, h);
  paint(cv.getContext('2d')!);
  if (layers.size > 60) layers.delete(layers.keys().next().value!);
  layers.set(key, cv);
  return cv;
}
const full = (e: WorldEnv, tone: string, a = 1) => { e.ctx.globalAlpha = a; e.ctx.fillStyle = tone; e.ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2); e.ctx.globalAlpha = 1; };
const middle = (e: WorldEnv): Pt => (e.rect ? [(e.rect.x0 + e.rect.x1) / 2, (e.rect.y0 + e.rect.y1) / 2] : [W / 2, H / 2]);
/** Light thrown round a point: added, so it reads as light and not as paint. */
function pool(c: CanvasRenderingContext2D, x: number, y: number, r: number, tone: string, a: number, squash = 1) {
  c.save();
  c.translate(x, y);
  c.scale(1, squash);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, tone);
  g.addColorStop(1, `${tone}00`);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
}
/**
 * The words' room, in the frame's own coordinates: their box padded, opening from its middle as they come in and closing
 * as they go (so it is never a box standing on its own). `rows`: the whole width of the frame across the words' rows.
 */
function wordsRoom(e: WorldEnv, rows = false): Box | undefined {
  // (words on their own opaque carrier read on it: a room cut round them stood beside the carrier as a bare block or a
  // full-width dark seam, 2026-11-04 audit)
  if (!e.rect || e.weight <= 0 || e.rect.carried) return undefined;
  const r = e.rect;
  // (a margin a good part of a row: a tight room let lamps, leads and slit edges touch the strokes, 2026-11-04 gate)
  const p = Math.max(48, Math.min(110, 0.36 * (r.y1 - r.y0)));
  const k = ease(e.weight / 0.6, 2);
  const [cx, cy, hw, hh] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, ((r.x1 - r.x0) / 2 + p) * k, ((r.y1 - r.y0) / 2 + p * 0.8) * k];
  return rows ? { x0: -W, y0: cy - hh, x1: W * 2, y1: cy + hh } : { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}
/**
 * Draws a ground's busy marks everywhere but the words' room: a crisp knockout, the way a printer or a sign leaves room
 * for a line, never a soft glow laid over the picture (2026-11-04 audit: the glow turned print worlds' flat ink to blur).
 */
function roundWords(e: WorldEnv, draw: () => void, room = wordsRoom(e)) {
  if (!room) return draw();
  const c = e.ctx;
  const m = c.getTransform();
  c.save();
  c.setTransform(e.base ?? m);
  c.beginPath();
  c.rect(-W, -H, W * 3, H * 3);
  c.rect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);
  c.setTransform(m);
  c.clip('evenodd');
  draw();
  c.restore();
}
const mulHex = (a: string, b: string) => `#${[1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) * parseInt(b.slice(i, i + 2), 16)) / 255).toString(16).padStart(2, '0')).join('')}`;
/**
 * The paper back over the words' room, crisp and whole (no feather, no glow): what a set piece or a change laid over the
 * ground leaves round a line being read, so none of its marks crosses it.
 */
function clearWords(e: WorldEnv, strength: number) {
  const room = wordsRoom(e);
  // (a piece that asks for no clearing gets none: papercut's and woodcut's are drawn round the words already)
  if (!room || strength <= 0) return;
  const c = e.ctx;
  c.save();
  if (e.base) c.setTransform(e.base);
  c.fillStyle = e.paper;
  c.fillRect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);
  c.restore();
}
/** The wet worlds' room for a line: paper the brush never touched, its edge torn the way a reserve is (world-ink.ts). */
const reserveWords = (e: WorldEnv) => { if (!e.rect || e.weight <= 0 || e.rect.carried) return; const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); reservePaper(c, e.seed, e.rect, e.paper, Math.min(1, e.weight * 3)); c.restore(); };
const vignette = (e: WorldEnv, a: number) => {
  const g = e.ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  e.ctx.fillStyle = g;
  e.ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
};

// ---- emissive: static, a wall at night, a console, lamps -------------------------------------------------------------

/** Analogue snow: one tile of it, thrown down at a new place fifteen times a second. */
function snow(e: WorldEnv, alpha: number, tone: string, y0 = 0, y1 = H) {
  const tile = kept(`snow|${tone}`, 480, 270, (g) => {
    const img = g.createImageData(480, 270);
    const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
    for (let i = 0; i < 480 * 270; i++) { const v = hash(i, 3.3) ** 2.6; img.data.set([r * (0.4 + v), gg * (0.4 + v), b * (0.4 + v), 255 * v], i * 4); }
    g.putImageData(img, 0, 0);
  });
  const k = Math.floor(e.now * 8);
  const c = e.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = false;
  c.beginPath();
  c.rect(-W * 0.1, y0, W * 1.2, y1 - y0);
  c.clip();
  const [ox, oy] = [Math.floor(hash(k, 1) * 480), Math.floor(hash(k, 2) * 270)];
  for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) c.drawImage(tile, i * 960 - ox * 2, j * 540 - oy * 2, 960, 540);
  c.restore();
}

const bandOf = (e: WorldEnv, i: number) => {
  const speed = 28 + 90 * hash(i, 4);
  const y = fract(hash(i, e.seed) + (e.now * speed) / H) * H;
  return { y, h: 6 + 90 * hash(i, e.seed + 1) ** 3 };
};

const brick = (e: WorldEnv) => kept(`brick|${e.paper}`, 1200, 700, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, 1200, 700);
  const [bw, bh] = [118, 42];
  for (let j = 0; j * bh < 700; j++)
    for (let i = -1; i * bw < 1200; i++) {
      const x = i * bw + (j % 2 ? bw / 2 : 0);
      c.fillStyle = mixHex(e.paper, e.slots.faint, 0.04 + 0.16 * hash(i, j));
      c.fillRect(x + 2, j * bh + 2, bw - 4, bh - 4);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x + 2, j * bh + bh - 7, bw - 4, 5);
    }
});
const wall = (e: WorldEnv, a = 1) => { e.ctx.globalAlpha = a; for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) e.ctx.drawImage(brick(e), i * 1200, j * 700); e.ctx.globalAlpha = 1; };
/** A straight run of tube, its brackets and the light it throws. */
function rail(e: WorldEnv, y: number, tone: string, lit: number, seed: number) {
  const c = e.ctx;
  const inset = 40 + 200 * hash(seed, 2);
  const [x0, x1] = [hash(seed, 3) > 0.5 ? -40 : inset, hash(seed, 4) > 0.5 ? W + 40 : W - inset];
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = mixHex(e.paper, tone, 0.26);
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = x0 + 80; x < x1; x += 280) c.fillRect(x, y - 9, 10, 18);
  if (lit > 0.02) {
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = tone;
    c.globalAlpha = 0.14 * lit;
    c.lineWidth = 90;
    c.stroke();
    c.globalAlpha = 0.34 * lit;
    c.lineWidth = 26;
    c.stroke();
    c.globalAlpha = lit;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = e.ink;
    c.globalAlpha = 0.8 * lit;
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();
}
const railY = (e: WorldEnv, i: number) => { const r = e.rect; const free = r ? [...[0.12, 0.3, 0.72, 0.9].map((y) => y * H).filter((y) => y < r.y0 - 50 || y > r.y1 + 50)] : [H * 0.16, H * 0.84]; return free.length ? free[i % free.length] : (i % 2 ? H - 50 : 50); };
const flick = (e: WorldEnv, i: number) => { const tick = Math.floor(e.now * 11); const bad = hash(i, e.seed) > 0.7; return bad && hash(tick, i) > 0.72 ? 0.12 : 1; };

const glass = (e: WorldEnv) => {
  const c = e.ctx;
  const cell = kept(`glass|${e.ink}`, 16, 16, (g) => { g.fillStyle = e.ink; g.globalAlpha = 0.05; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); });
  c.save();
  c.fillStyle = c.createPattern(cell, 'repeat')!;
  c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  c.restore();
};
const raster = (e: WorldEnv, speed: number, a: number) => {
  const c = e.ctx;
  const y = H - fract(e.now * speed) * (H + 260);
  const g = c.createLinearGradient(0, y, 0, y + 240);
  g.addColorStop(0, `${e.ink}00`);
  g.addColorStop(0.5, e.ink);
  g.addColorStop(1, `${e.ink}00`);
  c.save();
  c.globalAlpha = a;
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g;
  c.fillRect(-W * 0.1, y, W * 1.2, 240);
  c.restore();
};
/** Output going by, seen too far off to read: bars the length of lines of text, never words. */
function outputRows(e: WorldEnv, x: number, y: number, w: number, h: number, seed: number, speed: number, a: number) {
  const c = e.ctx;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = e.ink;
  const row = 22;
  const off = Math.floor(e.now * speed);
  for (let j = 0; j < h / row + 1; j++) {
    const line = j + off;
    let u = 0;
    let k = 0;
    const len = 0.2 + 0.8 * hash(line, seed) ** 1.4;
    while (u < len && k < 9) {
      const piece = 0.04 + 0.13 * hash(line, k + seed);
      c.globalAlpha = a * (0.5 + 0.5 * hash(k, line));
      c.fillRect(x + u * w, y + j * row, piece * w, 8);
      u += piece + 0.02;
      k++;
    }
  }
  c.restore();
}

const LAMP = 18;
const lampMask = (e: WorldEnv) => kept('lampmask', LAMP * 8, LAMP * 8, (g) => {
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(0, 0, LAMP * 8, LAMP * 8);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc((i + 0.5) * LAMP, (j + 0.5) * LAMP, LAMP * 0.46, 0, TAU); g.fill(); }
});
/** A low-resolution picture shown through the lamps: each cell one lamp. */
function lampPicture(e: WorldEnv, f: (x: number, y: number) => number, tone: string, a: number, room?: Box) {
  const c = e.ctx;
  const [cols, rows] = [Math.ceil(W / LAMP) + 2, Math.ceil(H / LAMP) + 2];
  // the lamps behind a line being read stay unlit, whole lamps: the board's message area. Unlit, not gone: a lamp
  // that is off still shows on a real board, so the area reads as the board and not as a flat dark plate (2026-11-04 audit)
  const m = (e.base ? e.base.inverse() : new DOMMatrix()).multiply(c.getTransform());
  const dark = (x: number, y: number) => { if (!room) return false; const p = m.transformPoint({ x: (x + 0.5) * LAMP, y: (y + 0.5) * LAMP }); return p.x > room.x0 && p.x < room.x1 && p.y > room.y0 && p.y < room.y1; };
  const cv = (lampCanvas ??= new OffscreenCanvas(cols, rows));
  const g = cv.getContext('2d')!;
  const img = g.createImageData(cols, rows);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) img.data.set([r, gg, b, dark(x, y) ? 255 * UNLIT : 255 * clamp01(f(x / cols, y / rows))], (y * cols + x) * 4);
  g.putImageData(img, 0, 0);
  c.save();
  c.imageSmoothingEnabled = false;
  c.globalAlpha = a;
  c.drawImage(cv, 0, 0, cols * LAMP, rows * LAMP);
  c.globalAlpha = 1;
  c.fillStyle = c.createPattern(lampMask(e), 'repeat')!;
  c.globalAlpha = 1;
  c.fillRect(0, 0, W + LAMP * 2, H + LAMP * 2);
  c.restore();
}
let lampCanvas: OffscreenCanvas | undefined;
/** How much of its light an unlit lamp in a line's area still shows (glass and reflector, the lamp off). */
const UNLIT = 0.06;
const unlitLamps = (e: WorldEnv, a: number) => { const c = e.ctx; const dots = kept(`unlit|${e.slots.faint}`, LAMP * 4, LAMP * 4, (g) => { g.fillStyle = e.slots.faint; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc((i + 0.5) * LAMP, (j + 0.5) * LAMP, LAMP * 0.3, 0, TAU); g.fill(); } }); c.save(); c.globalAlpha = a; c.fillStyle = c.createPattern(dots, 'repeat')!; c.fillRect(-LAMP, -LAMP, W + LAMP * 2, H + LAMP * 2); c.restore(); };

// ---- wet: rice paper, and water carrying ink through it --------------------------------------------------------------

const lightGround = (e: WorldEnv) => [1, 3, 5].reduce((a, i) => a + parseInt(e.paper.slice(i, i + 2), 16), 0) > 380;
const xuan = (e: WorldEnv) => {
  const sheet = kept(`xuan|${e.paper}|${e.slots.faint}`, W, H, (c) => {
    c.fillStyle = e.paper;
    c.fillRect(0, 0, W, H);
    c.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      c.strokeStyle = i % 3 ? e.slots.faint : e.ink;
      c.globalAlpha = 0.015 + 0.05 * hash(i, 1);
      c.lineWidth = 0.5 + 0.7 * hash(i, 2);
      const [x, y, a, l] = [hash(i, 3) * W, hash(i, 4) * H, hash(i, 5) * TAU, 8 + 30 * hash(i, 6) ** 2];
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 8 * (hash(i, 7) - 0.5), y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    c.globalAlpha = 1;
  });
  e.ctx.drawImage(sheet, 0, 0);
};
/** The corner of the frame furthest from the words, in frame fractions. */
const farCorner = (e: WorldEnv, turn = 0): Pt => { const [x, y] = middle(e); const opts: Pt[] = [[x < W / 2 ? 0.86 : 0.14, y < H / 2 ? 0.86 : 0.14], [x < W / 2 ? 0.92 : 0.08, y < H / 2 ? 0.2 : 0.8]]; return opts[turn % 2]; };
const inkLoad = (e: WorldEnv, k: number) => mixHex(e.paper, e.ink, k);
const blendOf = (e: WorldEnv): GlobalCompositeOperation => (lightGround(e) ? 'multiply' : 'screen');

// ---- film gate ---------------------------------------------------------------------------------------------------------

/** What a print gets from a projector: exposure breathing, a scratch that stays a few frames, dust that does not. */
function gate(e: WorldEnv, strength = 1) {
  const c = e.ctx;
  const tick = Math.floor(e.now * 18);
  const light = c.createRadialGradient(W / 2, H * 0.48, H * 0.12, W / 2, H * 0.52, H * 1.05);
  light.addColorStop(0, 'rgba(255,255,255,0.05)');
  light.addColorStop(0.6, 'rgba(0,0,0,0)');
  light.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = light;
  c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  c.save();
  c.strokeStyle = e.ink;
  c.lineCap = 'round';
  // a scratch or a speck of dust never runs through the words being read (2026-11-04 audit: silent-film ②)
  const room = wordsRoom(e);
  const inRoom = (x: number, y0: number, y1: number) => !!room && x > room.x0 - 12 && x < room.x1 + 12 && y1 > room.y0 && y0 < room.y1;
  for (let i = 0; i < 4; i++) {
    const held = Math.floor(tick / (3 + i));
    if (hash(held, i) < 0.55) continue;
    const x = hash(held, i + 9) * W;
    const [y0, y1] = [hash(held, 6) * H * 0.6, H * (0.5 + 0.5 * hash(held, 7))];
    if (inRoom(x, y0, y1)) continue;
    c.globalAlpha = (0.1 + 0.3 * hash(held, 3)) * strength;
    c.lineWidth = 0.8 + 1.6 * hash(held, 5);
    c.beginPath();
    c.moveTo(x, y0);
    c.quadraticCurveTo(x + 6 * (hash(held, 8) - 0.5), (y0 + y1) / 2, x + 3 * (hash(held, 4) - 0.5), y1);
    c.stroke();
  }
  c.fillStyle = e.ink;
  for (let i = 0; i < 16; i++) {
    if (inRoom(hash(tick, i) * W, hash(tick, i + 20) * H, hash(tick, i + 20) * H)) continue;
    c.globalAlpha = 0.5 * hash(tick, i + 40) * strength;
    c.beginPath();
    c.ellipse(hash(tick, i) * W, hash(tick, i + 20) * H, 1 + 3 * hash(tick, i + 60), 1 + 1.6 * hash(tick, i + 80), hash(i, tick), 0, TAU);
    c.fill();
  }
  c.restore();
}

// ---- tooled and upholstered -------------------------------------------------------------------------------------------

/** A wallpaper repeat of mirrored scrolls, a shade off its ground: seen by the light, not by the colour. */
const damask = (e: WorldEnv) => kept(`damask|${e.paper}|${e.slots.faint}`, 260, 340, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, 260, 340);
  c.fillStyle = mixHex(e.paper, e.slots.faint, 0.3);
  const leaf = (x: number, y: number, r: number, a: number) => { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(r * 0.5, -r * 0.5, r * 0.9, -r * 0.12, r, 0); c.bezierCurveTo(r * 0.8, r * 0.26, r * 0.3, r * 0.3, 0, 0); c.fill(); c.restore(); };
  const half = (s: number) => {
    c.save();
    c.translate(130, 0);
    c.scale(s, 1);
    [[0, 66, 62, -1.5], [0, 90, 58, -0.9], [8, 140, 80, -0.5], [10, 190, 66, -0.9], [12, 214, 90, 0.2], [10, 250, 60, 0.9], [4, 280, 40, 1.3], [40, 160, 48, -1.4], [60, 120, 46, -2], [70, 210, 44, 0.4]].forEach(([x, y, r, a]) => leaf(x, y, r, a));
    c.restore();
  };
  half(1);
  half(-1);
  [[0, 0], [260, 0], [0, 340], [260, 340]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 18, 0, TAU); c.fill(); });
});
const candle = (e: WorldEnv, x: number, y: number, r: number, a: number) => {
  const sway = 0.8 + 0.2 * Math.sin(e.now * 5.1) * Math.sin(e.now * 2.7 + 1);
  pool(e.ctx, x + 10 * Math.sin(e.now * 1.3), y, r, e.slots.ink2, a * sway);
};
function folds(e: WorldEnv, seed: number, a: number) {
  const c = e.ctx;
  c.save();
  for (let i = 0; i < 16; i++) {
    const x = (i / 16) * (W + 200) - 100 + 18 * Math.sin(e.now * 0.4 + i);
    const w = 70 + 120 * hash(i, seed);
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgba(255,255,255,${0.05 * a})`);
    g.addColorStop(0.6, `rgba(0,0,0,${0.5 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x, -H * 0.1, w, H * 1.2);
  }
  c.restore();
}
/** A thorned stem reaching out of the frame's edge, with the song. */
function vine(e: WorldEnv, x0: number, y0: number, dir: number, len: number, seed: number) {
  const c = e.ctx;
  const grown = ease(e.age / 1.8, 2);
  c.save();
  c.strokeStyle = e.slots.accent;
  c.fillStyle = e.slots.accent;
  c.lineCap = 'round';
  let [x, y, a] = [x0, y0, dir];
  const steps = Math.floor(46 * grown);
  for (let i = 0; i < steps; i++) {
    a += (hash(i, seed) - 0.5) * 0.5 + 0.1 * Math.sin(i * 0.4 + seed);
    const l = len / 46;
    const [nx, ny] = [x + Math.cos(a) * l, y + Math.sin(a) * l];
    c.lineWidth = 5.4 * (1 - i / 60);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(nx, ny);
    c.stroke();
    if (i % 5 === 3) {
      const side = i % 2 ? 1 : -1;
      c.beginPath();
      c.moveTo(nx - Math.cos(a) * 5, ny - Math.sin(a) * 5);
      c.lineTo(nx + Math.cos(a + side * 1.2) * 16, ny + Math.sin(a + side * 1.2) * 16);
      c.lineTo(nx + Math.cos(a) * 5, ny + Math.sin(a) * 5);
      c.fill();
    }
    [x, y] = [nx, ny];
  }
  c.restore();
}

export const WORLD_GROUNDS: Record<string, Ground> = {
  'dark-glitch/static': (e) => {
    full(e, e.paper);
    snow(e, 0.1 + 0.06 * e.level, e.slots.ink2);
    // the interference rolls through every row but the words': the signal holds where a line is being read
    roundWords(e, () => { for (let i = 0; i < 5; i++) { const b = bandOf(e, i); snow(e, 0.34, e.slots.faint, b.y, b.y + b.h * 2.4); } }, wordsRoom(e, true));
    vignette(e, 0.7);
  },
  'dark-glitch/carrier': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    snow(e, 0.14, e.slots.ink2);
    const y = e.rect ? (e.rect.y1 + 150 < H ? e.rect.y1 + 96 : e.rect.y0 - 96) : H * 0.5;
    c.save();
    c.strokeStyle = e.slots.faint;
    c.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) {
      c.globalAlpha = k ? 0.14 : 0.8;
      c.beginPath();
      for (let x = -40; x <= W + 40; x += 6) {
        const beat = 0.3 + 0.7 * e.pulse;
        const v = Math.sin(x * 0.02 + e.now * 7 + k) * 18 * beat + Math.sin(x * 0.11 - e.now * 21) * 9 * beat * Math.sin(x * 0.003 + e.now);
        x === -40 ? c.moveTo(x, y + v + k * 12 * Math.sin(e.now)) : c.lineTo(x, y + v + k * 12 * Math.sin(e.now));
      }
      c.stroke();
    }
    c.restore();
    vignette(e, 0.6);
  },
  'dark-glitch/dead-air': (e) => {
    full(e, e.paper);
    snow(e, 0.07 + 0.05 * Math.sin(e.now * 0.8), e.slots.ink2);
    const y = (0.5 + 0.34 * Math.sin(e.now * 0.21 + e.seed)) * H;
    snow(e, 0.26, e.slots.faint, y, y + 40);
    vignette(e, 0.8);
  },
  'dark-glitch/roll': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    snow(e, 0.24, e.slots.ink2);
    const y = fract(e.now * 0.34 + e.seed * 0.1) * (H + 300) - 150;
    roundWords(e, () => {
      c.fillStyle = e.slots.faint;
      c.globalAlpha = 0.14;
      c.fillRect(-W * 0.1, y, W * 1.2, 150);
      c.globalAlpha = 1;
      // sideways tearing in the bar, whole rows of the picture pushed along
      for (let i = 0; i < 18; i++) {
        const yy = y + (i / 18) * 150;
        const off = (hash(i, Math.floor(e.now * 12)) - 0.5) * 140;
        c.fillStyle = e.slots.ink2;
        c.globalAlpha = 0.16;
        c.fillRect(off + hash(i, 3) * W, yy, 200 + 500 * hash(i, 4), 6);
      }
      c.globalAlpha = 1;
    }, wordsRoom(e, true));
    vignette(e, 0.66);
  },
  'dark-glitch/break': (e) => {
    const k = Math.exp(-e.age * 2.4);
    full(e, e.paper);
    roundWords(e, () => { snow(e, 0.2 + 0.16 * k, e.ink); snow(e, 0.4, e.slots.accent, H * fract(e.now * 0.7), H * fract(e.now * 0.7) + 120); }, wordsRoom(e, true));
    vignette(e, 0.5);
  },
  'dark-glitch/clear': (e) => {
    full(e, e.paper);
    const [x, y] = middle(e);
    pool(e.ctx, x, y, 620, e.slots.faint, 0.3 * ease(e.age / 1.4));
    snow(e, 0.05 * (1 - ease(e.age / 1.2)), e.slots.ink2);
    vignette(e, 0.7);
  },
  'neon-stage/wall': (e) => {
    full(e, e.paper);
    wall(e);
    const [x, y] = middle(e);
    pool(e.ctx, x, y, 880, e.slots.accent, 0.26 + 0.34 * e.pulse);
    pool(e.ctx, x + 180, y + 240, 520, e.slots.ink2, 0.2);
    vignette(e, 0.66);
  },
  'neon-stage/rails': (e) => {
    full(e, e.paper);
    wall(e);
    [e.slots.accent, e.slots.ink2, e.slots.accent].forEach((tone, i) => rail(e, railY(e, i + e.seed), tone, flick(e, i) * (0.66 + 0.34 * e.pulse), e.seed + i));
    vignette(e, 0.54);
  },
  'neon-stage/street': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    wall(e, 0.8);
    const horizon = H * 0.66;
    const r = c.createLinearGradient(0, horizon, 0, H);
    r.addColorStop(0, e.paper);
    r.addColorStop(1, mixHex(e.paper, e.slots.faint, 0.3));
    c.fillStyle = r;
    c.fillRect(-W * 0.1, horizon, W * 1.2, H);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = hash(i, e.seed) * W;
      const w = 24 + 90 * hash(i, 2);
      const tone = i % 3 ? e.slots.accent : e.slots.ink2;
      const shim = 0.5 + 0.5 * Math.sin(e.now * (3 + 3 * hash(i, 3)) + i);
      const g = c.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, tone);
      g.addColorStop(1, `${tone}00`);
      c.fillStyle = g;
      c.globalAlpha = 0.14 + 0.2 * shim;
      c.fillRect(x + 12 * Math.sin(e.now * 2 + i), horizon, w, (H - horizon) * (0.5 + 0.5 * hash(i, 5)));
    }
    c.restore();
    vignette(e, 0.5);
  },
  'neon-stage/dim': (e) => {
    full(e, e.paper);
    wall(e, 0.7);
    rail(e, railY(e, e.seed), e.slots.accent, Math.floor(e.now * 2) % 7 === 3 ? 0.4 : 0.1, e.seed);
    const [x, y] = middle(e);
    pool(e.ctx, x, y, 560, e.slots.accent, 0.12);
    vignette(e, 0.78);
  },
  'neon-stage/full-power': (e) => {
    full(e, e.paper);
    wall(e);
    for (let i = 0; i < 4; i++) rail(e, railY(e, i), i % 2 ? e.slots.ink2 : e.slots.accent, 1, e.seed + i);
    pool(e.ctx, W / 2, H / 2, 1300, e.slots.accent, 0.3 + 0.3 * e.pulse);
    vignette(e, 0.34);
  },
  'neon-stage/one-tube': (e) => {
    full(e, e.paper);
    wall(e, 0.6);
    const k = e.age < 1 ? (hash(Math.floor(e.age * 12), 3) > 0.5 ? 0.9 : 0.1) : 1;
    rail(e, railY(e, e.seed + 1), e.slots.ink2, k, e.seed);
    vignette(e, 0.7);
  },
  'terminal/black': (e) => { full(e, e.paper); glass(e); raster(e, 0.09, 0.07); vignette(e, 0.5); },
  'terminal/raster': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    glass(e);
    raster(e, 0.3 + 0.4 * e.level, 0.26);
    raster(e, 0.13 + 0.2 * e.level, 0.16);
    c.save();
    c.fillStyle = e.ink;
    const tick = Math.floor(e.now * 8);
    for (let i = 0; i < 3; i++) { if (hash(tick, i) < 0.6) continue; c.globalAlpha = 0.16; c.fillRect(0, hash(tick, i + 4) * H, W, 2 + 3 * hash(tick, i + 8)); }
    c.restore();
    vignette(e, 0.46);
  },
  'terminal/panes': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    glass(e);
    const split = (0.3 + 0.4 * hash(e.seed, 2)) * W;
    const mid = (0.3 + 0.4 * hash(e.seed, 3)) * H;
    const panes: [number, number, number, number, number][] = [[40, 44, split - 60, H - 88, 11], [split + 20, 44, W - split - 60, mid - 60, 19], [split + 20, mid + 16, W - split - 60, H - mid - 60, 6]];
    // the panes' output and their frames leave the words' room clear: nothing prints across a line being read
    roundWords(e, () => panes.forEach(([x, y, w, h, speed], i) => {
      outputRows(e, x + 16, y + 16, w - 32, h - 32, e.seed + i, speed, 0.26);
      c.strokeStyle = e.ink;
      c.globalAlpha = 0.34;
      c.lineWidth = 1.4;
      c.strokeRect(x, y, w, h);
      c.globalAlpha = 1;
    }));
    vignette(e, 0.42);
  },
  'terminal/output': (e) => {
    full(e, e.paper);
    glass(e);
    roundWords(e, () => outputRows(e, 60, 30, W - 120, H - 60, e.seed, 14 + 18 * e.level, 0.2));
    raster(e, 0.2, 0.1);
    vignette(e, 0.5);
  },
  'terminal/alone': (e) => { full(e, e.paper); glass(e); vignette(e, 0.62); },
  'led-board/lamp-wall': (e) => {
    full(e, e.paper);
    unlitLamps(e, 0.5);
    const kind = e.seed % 3;
    const t = e.now * (0.3 + 0.5 * e.level);
    lampPicture(e, (x, y) => {
      const v = kind === 0 ? fract(x * 2.4 + y * 1.4 - t) : kind === 1 ? fract(Math.abs(x - 0.5) * 3 - t) : fract(y * 3 + Math.sin(x * 9 + t * 3) * 0.1 - t);
      return (v < 0.36 ? 0.9 * (1 - v / 0.36) : 0) * 0.7;
    }, e.slots.accent, 0.8, wordsRoom(e));
    vignette(e, 0.4);
  },
  'led-board/chase': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    unlitLamps(e, 0.36);
    c.save();
    c.fillStyle = e.slots.ink2;
    const step = Math.floor(e.now * 15);
    const lane = (y: number, dir: number) => { for (let i = 0; i < W / LAMP + 2; i++) if ((i + dir * step) % 6 < 2) { c.beginPath(); c.arc((i + 0.5) * LAMP, y, LAMP * 0.36, 0, TAU); c.fill(); } };
    c.shadowColor = e.slots.ink2;
    c.shadowBlur = 14;
    [[LAMP * 2.5, 1], [LAMP * 3.5, -1], [H - LAMP * 2.5, -1], [H - LAMP * 3.5, 1]].forEach(([y, d]) => lane(y, d));
    c.restore();
    vignette(e, 0.5);
  },
  'led-board/standby': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    unlitLamps(e, 0.3);
    const x = fract(e.now * 0.1 + hash(e.seed, 1)) * W;
    c.fillStyle = e.slots.faint;
    c.globalAlpha = 0.5;
    for (let j = 0; j < H / LAMP; j++) { c.beginPath(); c.arc(Math.floor(x / LAMP + 0.5) * LAMP - LAMP / 2, (j + 0.5) * LAMP, LAMP * 0.3, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    vignette(e, 0.6);
  },
  'led-board/stacks': (e) => {
    full(e, e.paper);
    unlitLamps(e, 0.4);
    const t = e.now * 3;
    // blocks of lamps switched in banks, the way a board tests itself
    lampPicture(e, (x, y) => {
      const [i, j] = [Math.floor(x * 16), Math.floor(y * 9)];
      return hash(i + Math.floor(t * 1.4), j + e.seed) > 0.72 ? 0.7 : 0;
    }, e.slots.ink2, 0.8, wordsRoom(e));
    vignette(e, 0.4);
  },
  'led-board/full-wall': (e) => {
    full(e, e.paper);
    const t = e.now * 1.1;
    lampPicture(e, (x, y) => 0.5 + 0.5 * Math.sin((x * 6 + y * 3 - t) * TAU), e.slots.accent, 0.96, wordsRoom(e));
    vignette(e, 0.26);
  },
  'led-board/one-row': (e) => {
    full(e, e.paper);
    unlitLamps(e, 0.24);
    const y = e.rect ? e.rect.y1 + 60 : H * 0.7;
    const x = fract(e.now * 0.16) * W;
    pool(e.ctx, x, y, 200, e.slots.ink2, 0.5, 0.2);
    vignette(e, 0.66);
  },
  'ink-wash/bloom': (e) => {
    xuan(e);
    const [cx, cy] = farCorner(e, e.seed);
    inkWash(e.ctx, e.seed % 5, [[cx, cy]], 0.26 + 0.34 * ease(e.age / 6, 2), 1.1, inkLoad(e, 0.9), blendOf(e));
    reserveWords(e);
  },
  'ink-wash/mist': (e) => {
    xuan(e);
    // a wide brush of thin grey dragged wet across the sheet: water carries it out from under the stroke
    inkWash(e.ctx, (e.seed % 5) + 1, [[0.06, 0.74], [0.3, 0.8], [0.56, 0.72], [0.82, 0.82]], 0.2 + 0.1 * ease(e.age / 8, 2), 0.5, inkLoad(e, 0.62), blendOf(e));
    reserveWords(e);
  },
  'ink-wash/dry': (e) => {
    xuan(e);
    const c = e.ctx;
    c.save();
    c.globalAlpha = 0.86;
    c.drawImage(brushStroke(e.seed % 4, [[W * 0.04, H * 0.92], [W * 0.5, H * 0.88], [W * 0.96, H * 0.94]], 120, inkLoad(e, 0.84)), 0, 0);
    c.restore();
  },
  'ink-wash/flood': (e) => {
    xuan(e);
    const [cx, cy] = farCorner(e, 1);
    inkWash(e.ctx, e.seed % 5, [[cx, cy]], 0.2 + 0.9 * ease(e.age / 2.4, 2), 1.3, inkLoad(e, 0.95), blendOf(e));
    reserveWords(e);
  },
  'ink-wash/one-drop': (e) => {
    xuan(e);
    const [cx, cy] = farCorner(e, 0);
    inkWash(e.ctx, (e.seed % 5) + 2, [[cx, cy]], 0.04 + 0.24 * ease(e.age / 5, 2), 1.4, inkLoad(e, 0.95), blendOf(e));
  },
  'silent-film/card-stock': (e) => { full(e, e.paper); gate(e); },
  'silent-film/screen': (e) => {
    const c = e.ctx;
    full(e, mixHex(e.paper, e.slots.faint, 0.5));
    const tick = Math.floor(e.now * 18);
    c.fillStyle = e.paper;
    c.globalAlpha = 0.12 * hash(tick, 2);
    c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.globalAlpha = 1;
    gate(e, 1.4);
  },
  'silent-film/iris': (e) => {
    const c = e.ctx;
    const r0 = e.rect ? Math.max(e.rect.x1 - e.rect.x0, e.rect.y1 - e.rect.y0) * 0.62 + 90 : 380;
    const open = ease(e.age / 0.55, 2) * (e.rect ? 0.2 + 0.8 * e.weight : 1);
    const [x, y] = e.rect ? middle(e) : [W / 2, H / 2];
    full(e, mixHex(e.paper, e.slots.plateInk, 0.3));
    gate(e, 1.2);
    c.save();
    c.fillStyle = e.slots.plate;
    c.beginPath();
    c.rect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.moveTo(x + r0 * open, y);
    c.arc(x, y, Math.max(1, r0 * open), 0, TAU, true);
    c.shadowColor = e.slots.plate;
    c.shadowBlur = 40;
    c.fill('evenodd');
    c.restore();
  },
  'silent-film/leak': (e) => {
    full(e, e.paper);
    const side = e.seed % 2;
    pool(e.ctx, side ? W + 40 : -40, H * (0.3 + 0.4 * hash(e.seed, 1)), 760, e.slots.accent, 0.5 + 0.3 * Math.sin(e.now * 5));
    gate(e);
  },
  'silent-film/reel-change': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    const y = fract(e.age * 1.6) * H;
    c.fillStyle = e.slots.faint;
    c.globalAlpha = 0.5;
    c.fillRect(-W * 0.1, y, W * 1.2, 60);
    c.globalAlpha = 1;
    pool(c, W / 2, H / 2, 900, e.ink, 0.5 * Math.exp(-e.age * 3));
    gate(e, 1.6);
  },
  'silent-film/long-fade': (e) => { full(e, e.paper); pool(e.ctx, W / 2, H / 2, 640, e.slots.faint, 0.16 + 0.14 * Math.sin(e.now * 0.6)); gate(e, 0.7); },
  'gothic-lolita/damask': (e) => {
    const c = e.ctx;
    c.save();
    c.fillStyle = c.createPattern(damask(e), 'repeat')!;
    c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.restore();
    const [x, y] = middle(e);
    candle(e, x, y - 80, 900, 0.3);
    vignette(e, 0.72);
  },
  'gothic-lolita/velvet': (e) => {
    full(e, e.paper);
    folds(e, e.seed, 1);
    candle(e, W * (0.3 + 0.4 * hash(e.seed, 1)), H * 0.3, 800, 0.24);
    vignette(e, 0.7);
  },
  'gothic-lolita/thorns': (e) => {
    full(e, e.paper);
    folds(e, e.seed, 0.6);
    const s = e.seed;
    // thorns grow in from the corners and stay there: none reaches across the page to the words
    vine(e, -10, H * 0.9, -0.5, 380, s);
    vine(e, W + 10, H * 0.14, Math.PI - 0.4, 380, s + 1);
    vine(e, W * 0.2, H + 10, -1.2, 280, s + 2);
    vine(e, W * 0.84, -10, 1.8, 280, s + 3);
    vignette(e, 0.6);
  },
  'gothic-lolita/lace': (e) => {
    const c = e.ctx;
    full(e, e.paper);
    folds(e, e.seed, 0.5);
    const edge = (y: number, dir: number) => {
      c.save();
      c.fillStyle = e.slots.ink2;
      c.globalAlpha = 0.8;
      c.beginPath();
      c.moveTo(-40, dir > 0 ? -40 : H + 40);
      const r = 56;
      const sway = 10 * Math.sin(e.now * 0.8);
      for (let x = -40; x < W + 80; x += r * 2) { c.lineTo(x + sway, y); c.quadraticCurveTo(x + r + sway, y + dir * r * 1.3, x + r * 2 + sway, y); }
      c.lineTo(W + 80, dir > 0 ? -40 : H + 40);
      c.closePath();
      c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.restore();
      c.save();
      c.fillStyle = e.paper;
      for (let x = -40; x < W + 80; x += r * 2) { c.beginPath(); c.arc(x + r + sway, y + dir * r * 0.34, 12, 0, TAU); c.fill(); for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(x + 8 + k * 16 + sway, y - dir * 16, 4, 0, TAU); c.fill(); } }
      c.restore();
    };
    edge(80, 1);
    edge(H - 80, -1);
    vignette(e, 0.6);
  },
  'gothic-lolita/gilded': (e) => {
    const c = e.ctx;
    c.save();
    c.fillStyle = c.createPattern(damask(e), 'repeat')!;
    c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.restore();
    const g = ease(e.age / 0.8);
    const s = e.seed;
    [[0, H, -0.6], [W, H, Math.PI + 0.6], [0, 0, 0.6], [W, 0, Math.PI - 0.6]].forEach(([x, y, a], i) => vine({ ...e, age: e.age * 2 }, x, y, a, 340 * g, s + i));
    const x = fract(e.now * 0.4) * (W + 800) - 400;
    pool(c, x, H / 2, 700, e.slots.accent, 0.3);
    vignette(e, 0.5);
  },
  'gothic-lolita/candle-out': (e) => {
    full(e, e.paper);
    folds(e, e.seed, 0.5);
    const k = 1 - ease(e.age / 3.4, 2);
    candle(e, W / 2, H * 0.4, 700, 0.1 + 0.3 * k);
    vignette(e, 0.8);
  },
};

/** The frame's big changes: on a fast song a world swings between its dark ground and one of these, each cut a new picture. */
Object.assign(WORLD_GROUNDS, {
  // a wide band of interference crawling down the frame: it fills a third of the picture and never the whole of it
  'dark-glitch/burst': (e: WorldEnv) => {
    const c = e.ctx;
    full(e, e.paper);
    snow(e, 0.08, e.slots.ink2);
    const h = H * 0.5;
    const y = fract(e.now * 0.1 + hash(e.seed, 3)) * (H + h) - h;
    roundWords(e, () => {
      c.fillStyle = e.slots.ink2;
      c.globalAlpha = 0.85;
      c.fillRect(-W * 0.1, y, W * 1.2, h);
      c.globalAlpha = 1;
      snow(e, 0.32, e.ink, y, y + h);
      for (let i = 0; i < 24; i++) { c.fillStyle = e.paper; c.fillRect(-20 + hash(i, e.seed) * W * 0.7, y + (i / 24) * h, 200 + 900 * hash(i, 3), 5); }
    }, wordsRoom(e, true));
    vignette(e, 0.5);
  },
  'neon-stage/flood': (e: WorldEnv) => {
    full(e, mixHex(e.paper, e.slots.accent, 0.3));
    wall(e, 0.6);
    // the flood is thrown on the wall across from the sign being read, never from behind it
    const side = e.rect && e.weight > 0 ? ((e.rect.x0 + e.rect.x1) / 2 < W / 2 ? 1 : 0) : hash(e.seed, 2);
    pool(e.ctx, W * (0.12 + 0.76 * side), H * 0.5, 1100, e.slots.accent, 0.7 + 0.2 * e.pulse);
    pool(e.ctx, W * (0.12 + 0.76 * side), H * 0.16, 700, e.slots.ink2, 0.5);
    vignette(e, 0.4);
  },
  'terminal/reverse-block': (e: WorldEnv) => {
    const c = e.ctx;
    full(e, e.paper);
    glass(e);
    // the block takes whatever side of the words is free: it never lies under them
    const r = e.rect ?? { x0: 0, y0: H, x1: W, y1: H };
    const room = [{ x: r.x1 + 60, y: 0, w: W - r.x1 - 60, h: H }, { x: 0, y: 0, w: r.x0 - 60, h: H }, { x: 0, y: 0, w: W, h: r.y0 - 50 }, { x: 0, y: r.y1 + 50, w: W, h: H - r.y1 - 50 }].sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (room.w < 120 || room.h < 120) return;
    c.fillStyle = e.ink;
    c.fillRect(room.x, room.y, room.w, room.h);
    c.fillStyle = e.paper;
    const off = Math.floor(e.now * 16);
    for (let j = 0; j < 30; j++) { const line = j + off; const len = 0.2 + 0.7 * hash(line, e.seed); const y = room.y + 26 + j * 36; if (y < room.y + room.h - 20) c.fillRect(room.x + 36, y, (room.w - 72) * len, 12); }
    vignette(e, 0.3);
  },
  'led-board/field': (e: WorldEnv) => {
    full(e, e.paper);
    const t = e.now * 0.9;
    const kind = e.seed % 2;
    lampPicture(e, (x, y) => (kind ? (fract(x * 4 - t) < 0.5 ? 0.9 : 0.25) : (fract((x + y) * 3 + t) < 0.5 ? 0.9 : 0.25)), e.slots.ink2, 0.95, wordsRoom(e));
    vignette(e, 0.2);
  },
  'ink-wash/great-stroke': (e: WorldEnv) => {
    const c = e.ctx;
    xuan(e);
    const up = e.rect ? (e.rect.y0 + e.rect.y1) / 2 > H / 2 : e.seed % 2 === 0;
    const y = up ? H * 0.2 : H * 0.78;
    const k = ease(e.age / 0.5);
    c.save();
    c.beginPath();
    c.rect(-W * 0.1, -H * 0.1, W * 1.2 * k, H * 1.2);
    c.clip();
    c.drawImage(brushStroke(e.seed % 4, [[-60, y + 30], [W * 0.5, y - 30], [W + 80, y + 20]], 330, inkLoad(e, 0.95)), 0, 0);
    c.restore();
    spatter(c, e.seed, W * 0.9, y, 0.2, 500, inkLoad(e, 0.9), k);
    reserveWords(e);
  },
  'silent-film/white-screen': (e: WorldEnv) => {
    full(e, mixHex(e.paper, e.slots.plateInk, 0.5 + 0.08 * hash(Math.floor(e.now * 6), 3)));
    gate(e, 1.3);
  },
  'gothic-lolita/gold-leaf': (e: WorldEnv) => {
    const c = e.ctx;
    full(e, mixHex(e.paper, e.slots.accent, 0.92));
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = c.createPattern(damask(e), 'repeat')!;
    c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.restore();
    pool(c, fract(e.now * 0.3) * W, H / 2, 800, e.slots.ink2, 0.5);
    vignette(e, 0.5);
  },
} as Record<string, Ground>);

/**
 * Draws `draw`, an ink of `tone`, round the words (a crisp knockout) unless the tone is all but the paper. The ground's
 * own ink is not the line's (a line may be set in its accent or its own object's ink), so a tone is never assumed to
 * carry the words: card's light-purple line sat on its purple tiles at 1.3:1 when it was (2026-11-04).
 */
const inkRound = (e: WorldEnv, tone: string, draw: () => void, room = wordsRoom(e)) => (contrast(tone, e.paper) < 1.25 ? draw() : roundWords(e, draw, room));
/**
 * The print worlds' own: a flat ink on a sheet, cut or pulled the way that press would, big enough to carry the frame. It
 * is knocked out round the words, each plate's knockout a hair off register (no second screen sits quite true), never a
 * glow laid over it.
 */
const slab = (e: WorldEnv, pts: Pt[], tone: string, a = 1) => {
  const c = e.ctx;
  const fill = () => { c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = a; c.fillStyle = tone; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.restore(); };
  const room = wordsRoom(e);
  const off = (hash(parseInt(tone.slice(1, 7), 16) % 997, 3) - 0.5) * 14;
  inkRound(e, mixHex(e.paper, mulHex(e.paper, tone), a), fill, room && { x0: room.x0 + off, y0: room.y0 - off / 2, x1: room.x1 + off, y1: room.y1 - off / 2 });
};
const slide = (e: WorldEnv) => ease(e.age / 0.4) * (1 + 0.01 * Math.sin(e.now));
const tint = (e: WorldEnv, k: number) => mixHex(e.paper, e.slots.accent, k);
const shade = (e: WorldEnv, k: number) => mixHex(e.paper, e.slots.ink2, k);
Object.assign(WORLD_GROUNDS, {
  'silk/pulled-slab': (e: WorldEnv) => { full(e, e.paper); const s = slide(e); slab(e, [[-80, H * 0.1], [W * 0.7 * s, H * 0.1], [W * 0.62 * s, H * 0.86], [-80, H * 0.86]], tint(e, 0.55)); slab(e, [[W * 0.3, -60], [W + 80, -60], [W + 80, H * 0.56 * s], [W * 0.36, H * 0.56 * s]], shade(e, 0.5)); },
  'silk/second-pull': (e: WorldEnv) => { full(e, e.paper); const s = slide(e); slab(e, [[W * (1 - s), -60], [W + 80, -60], [W + 80, H + 60], [W * (1.1 - s), H + 60]], shade(e, 0.42)); slab(e, [[-80, H * 0.6], [W + 80, H * 0.5], [W + 80, H * 0.72], [-80, H * 0.82]], tint(e, 0.6)); },
  'silk-cold/fog-bank': (e: WorldEnv) => { full(e, e.paper); const y = H * (0.5 + 0.06 * Math.sin(e.now * 0.3)); slab(e, [[-80, y], [W + 80, y - 60], [W + 80, H + 60], [-80, H + 60]], shade(e, 0.34)); slab(e, [[-80, y + 150], [W + 80, y + 90], [W + 80, H + 60], [-80, H + 60]], shade(e, 0.3)); },
  'silk-cold/night-sheet': (e: WorldEnv) => { full(e, mixHex(e.paper, e.slots.ink2, 0.2)); slab(e, [[-80, -60], [W + 80, -60], [W + 80, H * 0.34], [-80, H * 0.42]], shade(e, 0.4)); },
  'riso/two-drum': (e: WorldEnv) => { full(e, e.paper); const o = 18 * Math.sin(e.now * 2); for (let i = -1; i < 6; i++) { const x = i * 420 + fract(e.now * 0.05) * 420; slab(e, [[x, -60], [x + 190, -60], [x - 110, H + 60], [x - 300, H + 60]], tint(e, 0.5)); slab(e, [[x + o + 120, -60], [x + o + 260, -60], [x + o - 40, H + 60], [x + o - 180, H + 60]], shade(e, 0.5)); } },
  'riso/grain-block': (e: WorldEnv) => { full(e, e.paper); const s = slide(e); slab(e, [[-80, -60], [W * 0.56 * s, -60], [W * 0.44 * s, H + 60], [-80, H + 60]], shade(e, 0.55)); slab(e, [[W * 0.3, H * 0.3], [W + 80, H * 0.24], [W + 80, H + 60], [W * 0.36, H + 60]], tint(e, 0.5)); },
  'spy/wedge': (e: WorldEnv) => { full(e, e.paper); const s = slide(e); slab(e, [[-80, H + 60], [W * 1.2 * s, H + 60], [-80, H * (1.3 - s)]], mixHex(e.paper, e.ink, 0.86)); },
  'spy/sliced': (e: WorldEnv) => { full(e, e.paper); const s = slide(e); for (let i = 0; i < 3; i++) { const y = H * (0.1 + i * 0.32); slab(e, [[W * (1.3 - s) - 300 * i, y], [W + 200, y - 170], [W + 200, y + 70], [W * (1.3 - s) - 300 * i, y + 240]], i === 1 ? tint(e, 0.8) : mixHex(e.paper, e.ink, 0.7)); } },
} as Record<string, Ground>);

Object.assign(WORLD_GROUNDS, {
  // the paper tape filling the whole frame: the pale cut that makes the dark ones read as cuts; the line keeps a dark gap in it
  'dark-glitch/tape-wall': (e: WorldEnv) => {
    const c = e.ctx;
    full(e, e.slots.plate);
    // the rows of tape torn off across the line: a clean dark gap, edge to edge
    const gap = wordsRoom(e, true);
    if (gap) { c.save(); if (e.base) c.setTransform(e.base); c.fillStyle = e.paper; c.fillRect(-W * 0.1, gap.y0, W * 1.2, gap.y1 - gap.y0); c.restore(); }
    roundWords(e, () => {
      c.fillStyle = e.slots.plateInk;
      for (let j = 0; j < 22; j++) { const y = (j * H) / 22 + 8; let x = -60 + 40 * hash(j, e.seed); while (x < W + 60) { const w = 40 + 220 * hash(x, j); c.globalAlpha = 0.16 + 0.3 * hash(j, x); c.fillRect(x, y, w, 12); x += w + 18 + 60 * hash(j, x + 1); } }
      c.globalAlpha = 1;
    }, gap);
    vignette(e, 0.4);
  },
  // a whole leaf held up to the candle: the same use
  'gothic-lolita/leaf-wall': (e: WorldEnv) => {
    const c = e.ctx;
    full(e, e.slots.plate);
    candle(e, W * 0.5, H * 0.5, 1100, 0.2 + 0.1 * Math.sin(e.now * 2.3));
    c.strokeStyle = e.slots.accent;
    c.lineWidth = 4;
    c.strokeRect(46, 46, W - 92, H - 92);
    c.lineWidth = 1.4;
    c.strokeRect(62, 62, W - 124, H - 124);
    // a window cut in the leaf round the line, its edge gilt like the leaf's own rule: the dark behind shows through it
    // (a slit across the whole leaf read as a full-frame dark seam under the words, 2026-11-04 audit)
    const gap = wordsRoom(e);
    if (gap) {
      c.save();
      if (e.base) c.setTransform(e.base);
      const [x0, x1] = [Math.max(70, gap.x0), Math.min(W - 70, gap.x1)];
      c.fillStyle = e.paper;
      c.fillRect(x0, gap.y0, x1 - x0, gap.y1 - gap.y0);
      c.strokeStyle = e.slots.accent;
      c.lineWidth = 4;
      c.strokeRect(x0 - 10, gap.y0 - 10, x1 - x0 + 20, gap.y1 - gap.y0 + 20);
      c.lineWidth = 1.4;
      c.strokeRect(x0 - 22, gap.y0 - 22, x1 - x0 + 44, gap.y1 - gap.y0 + 44);
      c.restore();
    }
    vignette(e, 0.5);
  },
} as Record<string, Ground>);
Object.assign(WORLD_GROUNDS, handGrounds);

/** The clearing a set piece leaves round the words. */
export const clearWordsAfter = (e: WorldEnv, strength: number) => clearWords(e, strength);
export const isWorldGround = (fx: string) => fx in WORLD_GROUNDS;
/** A world's ground lies a little larger than the frame and slides under it, slowly on a calm part: a large slow move, never a cut. */
export function drawWorldGround(e: WorldEnv, fx: string) {
  const c = e.ctx;
  c.save();
  e.base = c.getTransform();
  const speed = 0.12 + 0.3 * e.level;
  const k = hash(e.seed, 5) * TAU;
  c.translate(W / 2, H / 2);
  c.scale(1.12, 1.12);
  c.translate(-W / 2 + 70 * Math.sin(e.now * speed + k), -H / 2 + 34 * Math.cos(e.now * speed * 0.8 + k));
  WORLD_GROUNDS[fx]?.(e);
  c.restore();
}

/** How a world changes its picture, drawn over the new ground and under the words: q runs 0..1. */
export const WORLD_INS: Record<string, { sec: number; draw: (e: WorldEnv, q: number) => void }> = {
  'noise-wall': { sec: 0.26, draw: (e, q) => { const n = 9; for (let i = 0; i < n; i++) { const k = hash(i, e.seed) * 0.6; if (i % 3 === 0 && q < k + 0.4) snow(e, 0.5, e.ink, (i * H) / n, ((i + 1) * H) / n); } } },
  blackout: { sec: 0.24, draw: (e, q) => full(e, 'rgba(0,0,0,1)', q < 0.5 ? 1 : (1 - q) * 2) },
  'clear-rows': { sec: 0.2, draw: (e, q) => { const c = e.ctx; const rows = 14; c.fillStyle = e.paper; for (let j = 0; j < rows; j++) if (j / rows >= q) c.fillRect(-W * 0.1, (j * H) / rows, W * 1.2, H / rows + 1); } },
  'lamp-sweep': { sec: 0.3, draw: (e, q) => { const edge = q * 1.3 - 0.15; lampPicture(e, (x) => (Math.abs(x - edge) < 0.09 ? 1 : 0), e.slots.ink2, 0.5, wordsRoom({ ...e, weight: 1 })); } },
  // on the dark sheet there is no ink to carry: a pale flood there is a grey flash, so it stays a thin veil
  'wash-over': { sec: 0.5, draw: (e, q) => (lightGround(e) ? inkWash(e.ctx, e.seed % 5, [[0.5, 0.5]], (1 - q) * 1.2, 1.2 * (1 - q), e.ink, 'multiply') : full(e, e.paper, 1 - q)) },
  // the frame line of the next shot rolling through: it goes behind the words' box, never across them
  'frame-slip': { sec: 0.22, draw: (e, q) => { const c = e.ctx; const y = (1 - q) * H; if (e.rect && y > e.rect.y0 - 70 && y < e.rect.y1 + 70 && e.weight > 0) return; c.fillStyle = e.slots.plate; c.fillRect(-W * 0.1, y - 56, W * 1.2, 56); } },
  'leaf-sweep': { sec: 0.36, draw: (e, q) => { const c = e.ctx; const x = (1 - q) * (W + 300) - 150; c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 60; c.fillStyle = mixHex(e.paper, e.slots.faint, 0.6); c.beginPath(); c.moveTo(-W * 0.1, -H * 0.1); c.lineTo(x + 120, -H * 0.1); c.lineTo(x - 120, H * 1.1); c.lineTo(-W * 0.1, H * 1.1); c.closePath(); c.fill(); c.restore(); } },
};
/** The print worlds' changes of plate: a press lifting, a squeegee pass, a folder shut. */
Object.assign(WORLD_INS, {
  'squeegee-pass': { sec: 0.3, draw: (e: WorldEnv, q: number) => { const c = e.ctx; c.fillStyle = mixHex(e.paper, e.slots.accent, 0.4); c.fillRect(-W * 0.1 + q * W * 1.2, -H * 0.1, W * (1 - q) * 1.2, H * 1.2); } },
  'fog-rise': { sec: 0.6, draw: (e: WorldEnv, q: number) => full(e, e.paper, 1 - q) },
  'drum-roll': { sec: 0.28, draw: (e: WorldEnv, q: number) => { const c = e.ctx; c.fillStyle = mixHex(e.paper, e.ink, 0.4); c.fillRect(-W * 0.1, -H * 0.1 + q * H * 1.2, W * 1.2, H * (1 - q)); } },
  'slash-cut': { sec: 0.22, draw: (e: WorldEnv, q: number) => { const c = e.ctx; const x = q * (W + 800) - 400; c.fillStyle = e.ink; c.beginPath(); c.moveTo(x, -H * 0.1); c.lineTo(W * 1.3, -H * 0.1); c.lineTo(W * 1.3, H * 1.1); c.lineTo(x - 500, H * 1.1); c.closePath(); c.fill(); } },
} as Record<string, { sec: number; draw: (e: WorldEnv, q: number) => void }>);
Object.assign(WORLD_INS, handIns);
export const worldInAt = (id: string | undefined, age: number) => { const w = id ? WORLD_INS[id] : undefined; return w && age < w.sec ? { w, q: age / w.sec } : undefined; };
