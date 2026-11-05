// document (感熱收據), its pages from the owner-approved boards (2026-11-05, ~/Desktop/vj/output/感熱收據設計稿_2026-11-05
// a–d; out/research/boards-receipt/boards/receipt.html): the lyric is the transaction being printed. a: the continuous
// feed, a strip wider than the frame stepping up out of the printer at the bottom, the earlier items above the line being
// printed; b: the receipt relay, a new strip hanging from the printer at the top, the last one torn and set down at the
// lower left; c: the TOTAL close-up, the paper filling the frame between a cutter's edge and a hand tear; d: the tear-off,
// the piece just torn lifting away over the strip being fed out under it. Small print is functional only (品名／段落／合計,
// the item's number, its part) and the song's real title and artist in the song's opening (world-title.ts): never a
// price, a count, a time, a shop or a barcode. Everything prints across. Edges are hard (cutter teeth, hand tear, straight
// roll edge); shadows are solid, never blurred. Labels are dot-printed like the words (render/world-glyph-doc.ts).
import { atBase, fibred, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import type { WorldItem } from './world-grounds';
import type { Piece } from './world-pieces';
import { artistOf, C, rng, titleOnly } from './world-b3-shared';
import { titleNow } from './world-title';
import { splitParts } from './world-split';
import { splitCalls } from '../calls';
import { DOT_R } from './world-glyph-doc';
import { DOC_INKS } from './doc-inks';
import { ALL_LABEL_TEXT, say } from '../labels';

const FACE = '"Noto Sans TC", "Noto Sans JP", sans-serif';
/** The receipt's own words, in every language a song's labels may speak (labels.ts). */
const LABELS = `${ALL_LABEL_TEXT}0123456789/ `;

/**
 * The faces a document job prints its small words in, loaded with the job (render/job-fonts.ts): its labels, and every
 * line (an earlier item is reprinted small) and the song's name, in both weights, so no label waits for its face a frame.
 */
export function docFaces(job: { cues: { text: string }[]; meta?: { title: string; artist: string }; treatment: { cues?: { world?: { set?: string } }[] } }) {
  const printed = (job.treatment.cues ?? []).some((c) => c.world?.set?.startsWith('document/'));
  if (!printed || typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const text = [...new Set([...LABELS, ...job.cues.map((c) => c.text).join(''), ...(job.meta ? `${job.meta.title}${job.meta.artist}` : '')])].join('');
  return Promise.all([500, 700].map((w) => document.fonts.load(`${w} 24px ${FACE}`, text))).then(() => undefined, () => undefined);
}

type ItemData = WorldItem;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
const no2 = (n: number) => String(n).padStart(2, '0');
const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => atBase(e, f);

/** Whether the face can draw `text` now; if not, it is asked for and the label waits a frame (never cached in a fallback face). */
function ready(font: string, text: string) {
  if (typeof document === 'undefined' || !document.fonts) return true;
  if (document.fonts.check(font, text)) return true;
  void document.fonts.load(font, text).catch(() => undefined);
  return false;
}

/** `text` on a head of `g` cells to the size, as cells (the board's rasterW): its width and the printed cells. */
function cellsOf(text: string, g: number, weight: number) {
  const font = `${weight} ${g}px ${FACE}`;
  if (!ready(font, text)) return undefined;
  return rasterOf(text, g, weight, font);
}
const rasters = new Map<string, { w: number; h: number; on: Uint8Array }>();
function rasterOf(text: string, g: number, weight: number, font: string) {
  const key = `${text}|${g}|${weight}`;
  const hit = rasters.get(key);
  if (hit) return hit;
  const probe = new OffscreenCanvas(8, 8).getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 2;
  const h = g + 4;
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.font = font;
  c.textBaseline = 'top';
  c.fillText(text, 1, 1);
  const d = c.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] > 120 ? 1 : 0;
  const out = { w, h, on };
  if (rasters.size > 400) rasters.delete(rasters.keys().next().value!);
  rasters.set(key, out);
  return out;
}

interface Dot { g?: number; weight?: number; ink: string; align?: 'left' | 'right' | 'center' }
/** The printed width of `text` at pitch `p`. */
export const dotWidth = (text: string, p: number, g = 24, weight = 500) => { const r = cellsOf(text, g, weight); return r ? r.w * p : [...text].length * g * p; };
/** The pitch that sets `text` `w` px wide, never over `most`. */
export const dotFit = (text: string, w: number, most: number, g = 24, weight = 500) => Math.min(most, w / Math.max(1, dotWidth(text, 1, g, weight)));

/** Dot-prints `text` with its top at `y` (the board's dotText): cells of the head as fused round dots of the pitch `p`. */
export function dotText(c: C, x: number, y: number, text: string, p: number, o: Dot) {
  const g = o.g ?? 24;
  const weight = o.weight ?? 500;
  const r = text ? cellsOf(text, g, weight) : undefined;
  if (!r) return 0;
  const pp = Math.round(p * 20) / 20;
  const pad = Math.ceil(pp);
  const cv = kept(`doc-dots|${text}|${g}|${weight}|${pp}|${o.ink}`, Math.ceil(r.w * pp) + 2 * pad, Math.ceil(r.h * pp) + 2 * pad, (d) => {
    d.fillStyle = o.ink;
    d.beginPath();
    const rad = pp * DOT_R;
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        if (!r.on[j * r.w + i]) continue;
        const [cx, cy] = [pad + (i + 0.5) * pp, pad + (j + 0.5) * pp];
        d.moveTo(cx + rad, cy);
        d.arc(cx, cy, rad, 0, Math.PI * 2);
      }
    d.fill();
  });
  const w = r.w * pp;
  const at = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  c.drawImage(cv, Math.round(at - pad), Math.round(y - pad));
  return w;
}

type Edge = 'flat' | 'cut' | 'tear';
/** One edge of a piece, x 0..w: the cutter's even teeth, or a hand tear along them (the board's edge()). */
function edgePts(w: number, y: number, dir: 1 | -1, kind: Edge, seed: number): [number, number][] {
  if (kind === 'flat') return [[0, y], [w, y]];
  const R = rng(seed);
  const T = 18;
  const pts: [number, number][] = [];
  for (let x = 0; x <= w; x += T) pts.push([x, y], [Math.min(w, x + T / 2), y + dir * (kind === 'tear' ? 6 + R() * 12 : 14)]);
  pts.push([w, y]);
  return pts;
}
interface PieceOpt { top?: Edge; bottom?: Edge; rot?: number; shadow?: [number, number]; seed?: number; dx?: number; dy?: number }
/**
 * A piece of thermal paper, w × h at (x, y), its edges flat, cut or torn, turned `rot` radians about its middle, its solid
 * shadow pushed by `shadow`; `inside` prints on it in the piece's own coordinates.
 */
function piece(c: C, e: WorldEnv, x: number, y: number, w: number, h: number, o: PieceOpt, inside?: (c: C) => void) {
  const top = edgePts(w, 0, 1, o.top ?? 'flat', o.seed ?? 5);
  const bottom = edgePts(w, h, -1, o.bottom ?? 'flat', (o.seed ?? 5) + 7).reverse();
  const path = () => { c.beginPath(); [...top, ...bottom].forEach(([u, v], i) => (i ? c.lineTo(u, v) : c.moveTo(u, v))); c.closePath(); };
  c.save();
  c.translate(x + w / 2 + (o.dx ?? 0), y + h / 2 + (o.dy ?? 0));
  c.rotate(o.rot ?? 0);
  c.translate(-w / 2, -h / 2);
  if (o.shadow) {
    c.save();
    c.translate(o.shadow[0], o.shadow[1]);
    path();
    c.fillStyle = mixHex(e.slots.ground, DOC_INKS.black, 0.42);
    c.fill();
    c.restore();
  }
  path();
  c.fillStyle = c.createPattern(paperTile(e.slots.plate, e.slots.plateInk), 'repeat')!;
  c.fill();
  if (inside) inside(c);
  c.restore();
}
/** The paper's tone with its faint fibre, a tile (multiplied at the boards' 30 % it is only ever a few per cent darker). */
const paperTile = (plate: string, ink: string) => fibred(`receipt|${plate}`, plate, mixHex(plate, ink, 0.35), 260, 512, 512);

/** The printer's mouth (board): the dark body, the paper slot, the steel tear bar with its teeth on the paper's side. */
function printer(c: C, y: number, h: number, side: 'top' | 'bottom') {
  c.fillStyle = DOC_INKS.body;
  c.fillRect(0, y, W, h);
  const lip = side === 'top' ? y : y + h;
  c.fillStyle = DOC_INKS.slot;
  c.fillRect(0, side === 'top' ? y : lip - 14, W, 14);
  const by = side === 'top' ? y + 14 : lip - 30;
  c.fillStyle = DOC_INKS.steel;
  c.fillRect(0, by, W, 16);
  const ty = side === 'top' ? by : by + 16;
  const dir = side === 'top' ? -1 : 1;
  c.beginPath();
  for (let u = 0; u < W; u += 14) { c.moveTo(u, ty); c.lineTo(u + 7, ty + dir * 10); c.lineTo(u + 14, ty); c.closePath(); }
  c.fill();
  c.fillStyle = DOC_INKS.edge;
  c.fillRect(0, side === 'top' ? y + h - 8 : y, W, 8);
}
const solid = (c: C, x: number, y: number, w: number, ink: string, t = 4) => { c.fillStyle = ink; c.fillRect(x, y, w, t); };
const dashed = (c: C, x: number, y: number, w: number, ink: string, t = 4) => { c.fillStyle = ink; for (let u = 0; u < w; u += 14) c.fillRect(x + u, y, Math.min(7, w - u), t); };

/** The song's title and artist, only in its opening (world-title.ts). */
const facts = (e: WorldEnv) => { const t = titleNow(e); return { title: titleOnly(t), artist: artistOf(t) }; };
const itemOf = (e: WorldEnv) => e.item;
/**
 * Whether the line is laid out in two parts on this page (world-doc-sets `split`): its words, its calls taken out, break at
 * a space of their own. Read from the words, not the box: a call set beside the line widens the box without a split.
 */
const splitsAt = (e: WorldEnv, even: boolean) => !!e.item?.text && !!splitParts(splitCalls(e.item.text).main.trim(), 'lead', even);
/** The paper feeding: what is printed above the head starts a row lower and steps up into place as the cut opens. */
const fed = (e: WorldEnv, row: number) => row * (1 - stepsOf(e.age / 0.3, 3));

/** Item rows printed above the head, newest lowest, from `bottom` up while they fit under `ceil`: number, line, part. */
function items(c: C, e: WorldEnv, prev: ItemData['prev'], bottom: number, ceil: number, x0: number, x1: number) {
  const ink = e.slots.plateInk;
  let y = bottom;
  for (const it of [...prev].reverse()) {
    const top = y - 82;
    if (top < ceil) break;
    dotText(c, x0, top + 10, no2(it.no), 2.6, { weight: 700, ink });
    const partW = dotText(c, x1, top + 10, it.part, 2.6, { ink, align: 'right' });
    const room = x1 - partW - 40 - (x0 + 106);
    dotText(c, x0 + 106, top, it.text, dotFit(it.text, room, 2.25, 32), { g: 32, ink });
    y = top;
  }
  return y;
}

/** The receipt's header right above its items, as room allows (board a): 品名 … 段落 under a rule, and over the rule the
 * song's title and artist (in its opening only). `ceil` is the paper's top. */
function header(c: C, e: WorldEnv, x0: number, x1: number, ceil: number, itemsTop: number) {
  const ink = e.slots.plateInk;
  const rule = itemsTop - 96;
  if (rule < ceil) return;
  solid(c, x0, rule, x1 - x0, ink);
  dotText(c, x0, rule + 24, say(e, 'item'), 2.3, { ink });
  dotText(c, x1, rule + 24, say(e, 'part'), 2.3, { ink, align: 'right' });
  const f = facts(e);
  if (!f.title || rule - 200 < ceil) return;
  dotText(c, (x0 + x1) / 2, rule - 208, f.title, dotFit(f.title, x1 - x0, 3.4, 24, 700), { weight: 700, ink, align: 'center' });
  if (f.artist) dotText(c, (x0 + x1) / 2, rule - 106, f.artist, 2.3, { ink, align: 'center' });
}

const box = (e: WorldEnv, x0: number, y0: number, x1: number, y1: number) => e.rect ?? { x0, y0, x1, y1 };
const L = 130;
const R = 1790;

/** a: the continuous feed with an item at its head: its number and part a label row above it, the earlier items above that. */
const feed = (total: boolean): HandGround => (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const r = box(e, L, 650, 1500, 860);
  const it = itemOf(e);
  const ink = e.slots.plateInk;
  const red = e.slots.accent;
  const opening = !!facts(e).title;
  const lift = fed(e, 82);
  piece(c, e, 46, opening ? 28 : -40, 1828, 1000, { top: opening ? 'cut' : 'flat', seed: 5 }, () => undefined);
  c.save();
  c.translate(0, lift);
  // (the head's own label row: an item's number and part, or the TOTAL's double rule and 合計 in the second colour)
  let ceil: number;
  if (total) {
    solid(c, L, r.y0 - 134, R - L, ink);
    solid(c, L, r.y0 - 120, R - L, ink);
    dotText(c, L, r.y0 - 94, say(e, 'total'), 2.8, { weight: 700, ink: red });
    if (it?.part) dotText(c, R, r.y0 - 94, it.part, 2.8, { weight: 700, ink: red, align: 'right' });
    ceil = r.y0 - 160;
  } else {
    if (it) dotText(c, L, r.y0 - 92, no2(it.no), 2.6, { weight: 700, ink });
    if (it?.part) dotText(c, R, r.y0 - 92, it.part, 2.6, { ink, align: 'right' });
    dashed(c, L, r.y0 - 118, R - L, ink);
    ceil = r.y0 - 140;
  }
  const top = items(c, e, it?.prev ?? [], ceil, 120, L, R);
  header(c, e, L, R, opening ? 50 : 0, top);
  c.restore();
  printer(c, 930, 150, 'top');
});

/** Two quick items on the feed, numbered at the left of each row (board a's 01 and 02). */
const pair: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const r = box(e, 236, 420, 1500, 760);
  const it = itemOf(e);
  const ink = e.slots.plateInk;
  const lift = fed(e, 82);
  piece(c, e, 46, -40, 1828, 1000, {}, () => undefined);
  c.save();
  c.translate(0, lift);
  const h = (r.y1 - r.y0) / 2;
  [0, 1].forEach((k) => {
    if (!it) return;
    const mid = r.y0 + h * (k + 0.5);
    dotText(c, L, mid - 34, no2(it.no + k), 2.6, { weight: 700, ink });
    if (it.part) dotText(c, R, mid - 34, it.part, 2.6, { ink, align: 'right' });
  });
  dashed(c, L, r.y0 - 30, R - L, ink);
  dashed(c, L, r.y1 + 26, R - L, ink);
  const top = items(c, e, it?.prev ?? [], r.y0 - 50, 120, L, R);
  header(c, e, L, R, 0, top);
  c.restore();
  printer(c, 930, 150, 'top');
});

/** b: the receipt relay: the new strip hangs from the top printer, the line's last phrase at its front; the strip before it
 * lies torn at the lower left with the line's first phrase (world-doc-sets split). A line laid out whole leaves the torn
 * strip the line before it, item-size (nothing large behind the words is a line not being sung). */
const relay: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const r = box(e, 730, 236, 1700, 450);
  const it = itemOf(e);
  const ink = e.slots.plateInk;
  // (split: the first phrase stands on the torn strip, left of where the new strip hangs)
  const split = r.x0 < 600 && splitsAt(e, false);
  const last = it?.prev.at(-1);
  // (the torn strip carrying a phrase being read lies level, so its rules run with its words)
  if (split || last) piece(c, e, 40, 548, 1060, 470, { top: 'cut', bottom: 'tear', rot: split ? 0 : -0.052, shadow: [-14, 18], seed: 11 }, (p) => {
    // (number and part at the left: the new strip covers this one's right end)
    const no = split ? it?.no : last?.no;
    const part = split ? it?.part : last?.part;
    if (no) dotText(p, 70, 56, no2(no), 2.3, { weight: 700, ink });
    if (part) dotText(p, 170, 56, part, 2.3, { ink });
    solid(p, 70, 126, 920, ink);
    if (!split && last) dotText(p, 70, 190, last.text, dotFit(last.text, 880, 1.9, 48, 500), { g: 48, ink });
    dashed(p, 70, 368, 920, ink);
  });
  // the new strip grows with its line, just clear of the printer; its leading edge is the cutter's
  const heroLow = split ? 236 + Math.min(450, r.y1 - 236) : r.y1;
  const bottom = split ? 696 : Math.max(696, Math.min(1000, heroLow + 170));
  const step = fed(e, 46);
  piece(c, e, 640, 96 - step, 1220, bottom - 96, { bottom: 'cut', shadow: [-14, 18], seed: 4 }, (p) => {
    // (a split line's number is on the torn strip with its first phrase; this strip names the part)
    const lead = split ? it?.part : it ? no2(it.no) : '';
    if (lead) dotText(p, 90, 60, lead, 2.4, { weight: 700, ink });
    if (it?.part && !split) dotText(p, 1130, 60, it.part, 2.4, { ink, align: 'right' });
    const f = facts(e);
    if (f.title) dotText(p, split ? 1130 : 200, 66, f.title, dotFit(f.title, 760, 2.1), { ink, align: split ? 'right' : 'left' });
    dashed(p, 90, split ? 500 : Math.min(bottom - 96 - 60, heroLow - 96 + step + 70), 1040, ink);
  });
  printer(c, 0, 100, 'bottom');
});

/** c: the TOTAL close-up: an item row at the top (the line's first phrase when it is split, else the line before, small),
 * the double rule and 合計, the red line, the double rule under it, and the song's name in its opening. */
const totalPage: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const r = box(e, 120, 330, 1800, 780);
  const it = itemOf(e);
  const ink = e.slots.plateInk;
  const red = e.slots.accent;
  const [x0, x1] = [120, 1800];
  piece(c, e, -40, 40, 2000, 940, { top: 'cut', bottom: 'tear', seed: 3 }, () => undefined);
  const split = r.y0 < 250 && splitsAt(e, false);
  const last = it?.prev.at(-1);
  if (split && it) {
    dotText(c, x0 + 40, 104, no2(it.no), 2.6, { weight: 700, ink });
    if (it.part) dotText(c, x1 + 40, 104, it.part, 2.6, { ink, align: 'right' });
  } else if (last) {
    dotText(c, x0 + 40, 104, no2(last.no), 2.6, { weight: 700, ink });
    const pw = last.part ? dotText(c, x1 + 40, 104, last.part, 2.6, { ink, align: 'right' }) : 0;
    dotText(c, x0 + 140, 92, last.text, dotFit(last.text, x1 - pw - 60 - (x0 + 140), 2.3, 32), { g: 32, ink });
  }
  solid(c, x0, 190, x1 - x0, ink);
  solid(c, x0, 204, x1 - x0, ink);
  dotText(c, x0, 236, say(e, 'total'), 3.0, { weight: 700, ink: red });
  const low = Math.min(900, Math.max(846, r.y1 + 40));
  solid(c, x0, low, x1 - x0, ink);
  solid(c, x0, low + 14, x1 - x0, ink);
  const f = facts(e);
  const foot = [f.title, f.artist].filter(Boolean).join(' / ');
  if (foot && low + 110 < 960) dotText(c, x1, low + 42, foot, 2.3, { ink, align: 'right' });
});

/** d: the tear-off: the line's first phrase on the piece just torn off, lifted with its hard shadow over the strip fed out
 * under it with the last phrase (world-doc-sets split). A line laid out whole sees the piece before it go: a pause of a few
 * frames on the tear, then it leaves whole in steps, before the line is read. */
const tear: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const r = box(e, 120, 676, 1500, 880);
  const it = itemOf(e);
  const ink = e.slots.plateInk;
  const split = r.y0 < H * 0.45 && splitsAt(e, true);
  const last = it?.prev.at(-1);
  const k = split ? 0 : stepsOf((e.age - 0.24) / 0.5, 4);
  const upper = split ? it : last;
  if (upper && k < 1) piece(c, e, 30, -40, 1860, 480, { bottom: 'tear', rot: split ? 0 : -0.059 - 0.05 * k, shadow: [0, 34], seed: 21, dx: -60 * k, dy: -560 * k }, (p) => {
    dotText(p, 90, 110, no2(upper.no), 2.6, { weight: 700, ink });
    if (upper.part) dotText(p, 1770, 110, upper.part, 2.6, { ink, align: 'right' });
    if (!split && last) dotText(p, 90, 200, last.text, dotFit(last.text, 1500, 1.9, 48, 700), { g: 48, weight: 700, ink });
  });
  piece(c, e, 30, 560, 1860, 380, { top: 'cut', seed: 9 }, (p) => {
    if (it && !split) dotText(p, 90, 44, no2(it.no), 2.6, { weight: 700, ink });
    if (it?.part && !split) dotText(p, 1770, 44, it.part, 2.6, { ink, align: 'right' });
  });
  printer(c, 930, 150, 'top');
});

/** No line up (an intro, an interlude): the printer with a short torn tongue of blank paper; the song's name in its opening. */
const idle: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const f = facts(e);
  const ink = e.slots.plateInk;
  piece(c, e, 46, f.title ? 520 : 740, 1828, f.title ? 410 : 190, { top: 'tear', seed: 17 }, (p) => {
    if (!f.title) return;
    dotText(p, 914, 70, f.title, dotFit(f.title, 1500, 3.4, 24, 700), { weight: 700, ink, align: 'center' });
    if (f.artist) dotText(p, 914, 176, f.artist, 2.3, { ink, align: 'center' });
  });
  printer(c, 930, 150, 'top');
});

/** With no line up every page is the idle printer: no empty receipt is ever shown. */
const orIdle = (g: HandGround): HandGround => (e) => (e.rect ? g(e) : idle(e));
const Gs: Record<string, HandGround> = {
  'document/idle': idle,
  'document/feed': orIdle(feed(false)),
  'document/feed-total': orIdle(feed(true)),
  'document/pair': orIdle(pair),
  'document/relay': orIdle(relay),
  'document/total': orIdle(totalPage),
  'document/tear': orIdle(tear),
};

const INS: Record<string, HandIn> = {
  // a change of part: the receipt above the new line is torn off along a hand tear just over it and goes up and away whole,
  // its hard shadow with it, in four held steps (never over the line landing with it)
  'tear-swap': { sec: 0.4, draw: (e, q) => page(e, (c) => {
    const k = stepsOf(q / 0.85, 4);
    if (k >= 1) return;
    const at = Math.max(160, (e.rect?.y0 ?? H * 0.5) - 40);
    piece(c, e, -20, -60, W + 40, at + 60, { bottom: 'tear', rot: -0.03 * k, shadow: [0, 30], seed: 29, dy: -(at + 160) * k }, () => undefined);
  }) },
};

/** The words' box and a margin, frame px: a piece keeps out of it. */
const around = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: 130, y0: 650, x1: 1790, y1: 860 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

// Small events of the machine, on a change of part, a key line or a long unsung stretch (world-pieces.ts): each prints on
// the paper outside the words' box and never over it; nothing is invented (no price, no count, no barcode).
const PIECES: Record<string, Piece> = {
  // the head prints a dotted rule under the line, dot by dot from the left, and it stays printed
  'rule-print': { sec: 2.2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = around(e, 34);
    if (!e.rect || b.y1 + 10 > 920) return;
    const n = Math.floor((b.x1 - b.x0 - 68) / 18);
    const shown = Math.ceil(n * stepsOf(q / 0.45, 12));
    c.fillStyle = e.slots.plateInk;
    c.beginPath();
    for (let i = 0; i < shown; i++) { const x = b.x0 + 34 + i * 18; c.moveTo(x + 4, b.y1); c.arc(x, b.y1, 4, 0, Math.PI * 2); }
    c.fill();
  }) },
  // the roll's black sensor mark comes up past the head at the paper's edge as it feeds, a step at a time
  'black-mark': { sec: 1.6, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = around(e, 44);
    const left = b.x0 - 26 > 40;
    const x = left ? b.x0 - 26 : Math.min(W - 70, b.x1);
    const y = 900 - stepsOf(q, 5) * 520;
    c.fillStyle = e.slots.plateInk;
    c.fillRect(x, y - 110, 26, 110);
  }) },
  // the cutter's partial cut: a row of slits across the paper under the line, the ground showing through, cut in six steps
  'partial-cut': { sec: 1.4, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = around(e, 64);
    if (!e.rect || b.y1 + 8 > 920) return;
    const reach = 60 + (W - 120) * stepsOf(q / 0.5, 6);
    c.fillStyle = e.slots.ground;
    for (let x = 60; x + 22 < reach; x += 40) c.fillRect(x, b.y1, 22, 6);
  }) },
};

export const DOCUMENT = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
