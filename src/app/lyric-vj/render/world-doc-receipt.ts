// document (感熱收據), its pages from the owner-approved second boards (2026-11-05, ~/Desktop/vj/output/
// 感熱收據設計稿_第二版_2026-11-05 a–d; out/research/boards-receipt-v2/boards/receipt.html): the lyric is the item being
// printed on a narrow thermal roll. A receipt reads as one by its parts: the narrow roll, the centred shop block (artist,
// title, render date, BPM, the song's id and line count), printed '=' and '-' rule rows, item rows with the time column on
// the right and dot leaders, the quantity row (characters @ seconds a character = the line's length), the part's 小計,
// the song's 合計 in red, a real Code 128 barcode of the song's id, the thank-you, cutter and torn ends, the printer's mouth.
// Every number is the song's own (WorldItem, free-plan.ts): nothing is invented.
//
// The owner's worry for v2 was that so much small print would hide the lyric. So the camera never shows the whole
// receipt, only the stretch round the line being printed, and four rules keep the line the one thing to read:
// 1. Hierarchy: the line is printed 倍角 in full ink and is the only large text (its set's least size is 2.5 times the
//    largest small print, SMALL_MAX); past rows are small and lighter, older ones lighter still; the shop block smaller.
// 2. Budget: what is printed round the line is laid bottom-up from it (its rows, the part's mark, the shop block, the
//    paper's top edge) only while its ink stays under INK_BUDGET of the line's; the rest of the roll is out of shot.
// 3. Section ends only: the 小計, 合計, barcode and thank-you print at a part's end (the closing line's page, after the
//    line is sung) or go by on the slip torn off as the next part starts, in a quarter second.
// 4. Motion: the paper feeds the earlier rows up a row and the line prints in (world-doc-motion.ts); after that, while
//    the line is read, nothing moves.
// Everything prints across. Edges are hard; shadows solid. Small print is dot-printed like the words (world-glyph-doc.ts).
import { atBase, fibred, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import type { WorldItem } from './world-grounds';
import type { Piece } from './world-pieces';
import { artistOf, C, rng, titleOnly } from './world-b3-shared';
import { titleNow } from './world-title';
import { DOT_R } from './world-glyph-doc';
import { DOC_INKS } from './doc-inks';
import { code128 } from './world-doc-barcode';
import { splitCalls } from '../calls';
import { MARGIN, PITCH, ROLL, SMALL_G } from './world-doc-sets';
import { ALL_LABEL_TEXT, say } from '../labels';

const FACE = '"Noto Sans TC", "Noto Sans JP", sans-serif';

/** The receipt's words, in the song's language (labels.ts): 品名, 時間, 小計, 合計, 謝謝光臨 and its units. */
const wordsOf = (e: WorldEnv) => ({ subtotal: say(e, 'subtotal'), thanks: say(e, 'thanks'), chars: say(e, 'unitChars'), sec: say(e, 'unitSec'), lines: say(e, 'unitLines'), rows: say(e, 'unitRows') });
/** The receipt's own words, in every language a song's labels may speak (labels.ts), with its digits and marks. */
const LABELS = `${ALL_LABEL_TEXT}0123456789/:.@*=-No BPM`;

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

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
const no2 = (n: number) => String(n).padStart(2, '0');
const mmss = (t: number) => `${no2(Math.floor(Math.max(0, t) / 60))}:${no2(Math.floor(Math.max(0, t) % 60))}`;
const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => atBase(e, f);

// ---- the print head ----

/** Whether the face can draw `text` now; if not, it is asked for and the label waits a frame (never cached in a fallback face). */
function ready(font: string, text: string) {
  if (typeof document === 'undefined' || !document.fonts) return true;
  if (document.fonts.check(font, text)) return true;
  void document.fonts.load(font, text).catch(() => undefined);
  return false;
}

/** `text` on a head of `g` cells to the size, as cells (the board's rasterW): its width, the printed cells and their count. */
function cellsOf(text: string, g: number, weight: number) {
  const font = `${weight} ${g}px ${FACE}`;
  if (!ready(font, text)) return undefined;
  return rasterOf(text, g, weight, font);
}
const rasters = new Map<string, { w: number; h: number; on: Uint8Array; n: number }>();
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
  let n = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 120) { on[i] = 1; n++; }
  const out = { w, h, on, n };
  if (rasters.size > 600) rasters.delete(rasters.keys().next().value!);
  rasters.set(key, out);
  return out;
}

/**
 * What a frame's small print adds up to, for the ink budget and for measuring the focus (scripts/lyric-vj/doc-focus.mts
 * reads `globalThis.vjDocPrint`): the printed area, px², and the largest small type, px a size.
 */
const tally = { ink: 0, largest: 0 };
/** Measuring only: the small print laid out but left unprinted (`globalThis.vjDocBare`), to tell its ink from the line's. */
const bare = () => (globalThis as { vjDocBare?: boolean }).vjDocBare === true;
const publish = () => { (globalThis as { vjDocPrint?: typeof tally }).vjDocPrint = { ...tally }; };

interface Dot { g?: number; weight?: number; ink: string; align?: 'left' | 'right' | 'center' }
const G = SMALL_G;
/** The printed width of `text` at pitch `p`. */
export const dotWidth = (text: string, p: number, g = G, weight = 500) => { const r = cellsOf(text, g, weight); return r ? r.w * p : [...text].length * g * p; };
/** The ink `text` prints at pitch `p`, px². */
const dotInk = (text: string, p: number, g = G, weight = 500) => { const r = cellsOf(text, g, weight); return r ? r.n * p * p : [...text].length * g * g * p * p * 0.25; };

/** Dot-prints `text` with its top at `y` (the board's dotText): cells of the head as fused round dots of the pitch `p`. */
export function dotText(c: C, x: number, y: number, text: string, p: number, o: Dot) {
  const g = o.g ?? G;
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
  if (bare()) return w;
  c.drawImage(cv, Math.round(at - pad), Math.round(y - pad));
  if (y > -g * pp && y < H) {
    tally.ink += r.n * pp * pp;
    tally.largest = Math.max(tally.largest, g * pp);
  }
  return w;
}

// ---- sizes (frame px at 1080p) ----

/** Pitches of the small print (world-doc-sets.ts): the line's set never prints under 2.5 times the largest. */
const P = PITCH;
/** Height of one printed row of small print and its gap. */
const ROW = 42;
/** The print round the line may hold at most this share of the line's own ink. */
export const INK_BUDGET = 0.45;
/** Past rows' ink: a fresh row at this share of black, each line older this much lighter, never under the floor. */
const FADE = { fresh: 0.64, step: 0.08, floor: 0.34 };
/** Share of the closing line's time after which its tail prints under it. */
const TAIL_AT = 0.7;
/** The printer's top (feed, pair). */
const MOUTH_Y = 968;

// ---- paper and printer ----

type Edge = 'flat' | 'cut' | 'tear';
/** One edge of a piece, x 0..w: the cutter's even teeth, or a hand tear along them (the board's edge()). */
function edgePts(w: number, y: number, dir: 1 | -1, kind: Edge, seed: number): [number, number][] {
  if (kind === 'flat') return [[0, y], [w, y]];
  const R = rng(seed);
  const T = 16;
  const pts: [number, number][] = [];
  for (let x = 0; x <= w; x += T) pts.push([x, y], [Math.min(w, x + T / 2), y + dir * (kind === 'tear' ? 5 + R() * 12 : 12)]);
  pts.push([w, y]);
  return pts;
}
interface PieceOpt { top?: Edge; bottom?: Edge; rot?: number; shadow?: [number, number]; seed?: number; dx?: number; dy?: number }
/**
 * A piece of thermal paper, w × h at (x, y), its edges flat, cut or torn, turned `rot` radians about its middle, its solid
 * shadow pushed by `shadow`, the roll's bend a faint shade at its long edges; `inside` prints on it in its own coordinates.
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
  c.save();
  path();
  c.clip();
  // (the roll's bend: a tenth darker at both long edges, inside the paper, its edge still hard)
  const g = c.createLinearGradient(0, 0, w, 0);
  const shade = mixHex(e.slots.plate, DOC_INKS.black, 0.1);
  g.addColorStop(0, shade);
  g.addColorStop(0.07, `${e.slots.plate}00`);
  g.addColorStop(0.9, `${e.slots.plate}00`);
  g.addColorStop(1, shade);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h + 20);
  c.restore();
  if (inside) inside(c);
  c.restore();
}
/** The paper's tone with its faint fibre, a tile. */
const paperTile = (plate: string, ink: string) => fibred(`receipt|${plate}`, plate, mixHex(plate, ink, 0.35), 260, 512, 512);

/** The printer's mouth (boards a, d): the dark body under the roll, the paper slot, the steel tear bar with its teeth. */
function printer(c: C, x0: number, x1: number, y: number) {
  c.fillStyle = DOC_INKS.body;
  c.fillRect(x0 - 150, y, x1 - x0 + 300, H - y);
  c.fillStyle = DOC_INKS.slot;
  c.fillRect(x0 - 14, y, x1 - x0 + 28, 14);
  c.fillStyle = DOC_INKS.steel;
  c.fillRect(x0 - 24, y + 14, x1 - x0 + 48, 14);
  c.beginPath();
  for (let u = x0 - 24; u < x1 + 24; u += 12) { c.moveTo(u, y + 14); c.lineTo(u + 6, y + 5); c.lineTo(u + 12, y + 14); c.closePath(); }
  c.fill();
  c.fillStyle = DOC_INKS.edge;
  c.fillRect(x0 - 150, y + 28, x1 - x0 + 300, 6);
}

// ---- what a receipt prints ----

/** A printed row of the roll: its height and how it prints with its top at y, between x0 and x1, in `ink`. */
interface Row { h: number; ink: number; draw: (c: C, y: number, x0: number, x1: number, ink: string) => void }
const rowInk = (age: number) => Math.max(FADE.floor, FADE.fresh - FADE.step * Math.max(0, age - 1));

/** A rule row of printed characters, '=' or '-', as a real receipt does it (its ink reckoned on the feed's print width). */
const rule = (ch: '=' | '-'): Row => {
  // (one character's advance from a run of ten: a lone character's raster carries its own margin)
  const across = (w: number) => ch.repeat(Math.max(4, Math.floor((w - dotWidth(ch, P.head)) / Math.max(1, dotWidth(ch.repeat(11), P.head) - dotWidth(ch.repeat(10), P.head))) + 1));
  return { h: 30, ink: dotInk(across(ROLL.feed[1] - ROLL.feed[0] - 2 * MARGIN), P.head), draw: (c, y, x0, x1, ink) => { dotText(c, x0, y, across(x1 - x0), P.head, { ink }); } };
};
/** Left and right words on one row. */
const pairRow = (l: string, r: string, p: number, o: { weight?: number } = {}): Row => ({ h: p * G + 12, ink: dotInk(l + r, p, G, o.weight), draw: (c, y, x0, x1, ink) => {
  dotText(c, x0, y, l, p, { ink, weight: o.weight });
  if (r) dotText(c, x1, y, r, p, { ink, weight: o.weight, align: 'right' });
} });
const centred = (t: string, p: number, weight = 500, gap = 10): Row => ({ h: p * G + gap, ink: dotInk(t, p, G, weight), draw: (c, y, x0, x1, ink) => { dotText(c, (x0 + x1) / 2, y, t, p, { ink, weight, align: 'center' }); } });
/** An item row: number, the line's words (shrunk, then cut short with …, to fit), dot leaders, its start at the right. */
const itemRow = (no: number, text: string, at: number | undefined): Row => ({ h: ROW, ink: dotInk(`${no2(no)}${text}${mmss(at ?? 0)}`, P.row), draw: (c, y, x0, x1, ink) => {
  const time = at === undefined ? '' : mmss(at);
  const nw = dotWidth('00 ', P.row);
  const tw = dotWidth('00:00', P.row);
  dotText(c, x0, y, no2(no), P.row, { ink });
  const room = x1 - tw - 30 - (x0 + nw);
  let t = text;
  while ([...t].length > 2 && dotWidth(t, 0.95 * P.row) > room) t = `${[...t].slice(0, -2).join('')}…`;
  const q = Math.min(P.row, room / Math.max(1, dotWidth(t, 1)));
  const w = dotText(c, x0 + nw, y + (P.row - q) * 12, t, q, { ink });
  const dw = dotWidth('.', P.row);
  const lead = x1 - tw - 14 - (x0 + nw + w + 10);
  if (lead > dw * 2) dotText(c, x0 + nw + w + 10, y, '.'.repeat(Math.floor(lead / dw)), P.row, { ink });
  if (time) dotText(c, x1, y, time, P.row, { ink, align: 'right' });
} });

/** The quantity row under the line: its characters @ seconds a character, its length at the right (board a's 15字 @0.164秒 2.46秒). */
function qtyRow(e: WorldEnv, it: WorldItem): Row | undefined {
  const n = [...(it.text ?? '').replace(/\s+/g, '')].length;
  if (!n || !it.dur) return undefined;
  const u = wordsOf(e);
  return pairRow(`  ${n}${u.chars} @${(it.dur / n).toFixed(3)}${u.sec}`, `${it.dur.toFixed(2)}${u.sec}`, P.row);
}

/** The song as the shop block prints it: the date the video is made, today. */
const today = () => { const d = new Date(); return `${d.getFullYear()}/${no2(d.getMonth() + 1)}/${no2(d.getDate())}`; };

/** The shop block, top-down (boards a, b, d): artist (or the title), title, date | BPM, No.id | lines, =, 品名 | 時間, -. */
function shopRows(e: WorldEnv, it: WorldItem): Row[] {
  const t = e.title ?? '';
  const [artist, title] = [artistOf(t), titleOnly(t)];
  const u = wordsOf(e);
  const s = it.song;
  return [
    ...(artist || title ? [centred(artist || title, P.shop, 700, 6)] : []),
    ...(artist && title ? [centred(title, P.head, 500, 14)] : []),
    pairRow(today(), s ? `BPM ${s.bpm}` : '', P.head),
    ...(s ? [pairRow(`No.${s.id}`, `${s.lines}${u.rows}`, P.head)] : []),
    rule('='),
    pairRow(say(e, 'item'), say(e, 'time'), P.head),
    rule('-'),
  ];
}
/** The part's mark over its first item: *** 主歌 ***. */
const markRow = (part: string) => centred(`*** ${part} ***`, P.row, 500, 12);

/**
 * What lies printed on the roll above the line, newest first, each with the age (in lines) its ink has faded by: this
 * part's earlier rows, its mark, the shop block, the receipt's top edge (`edge`). The camera shows them only while they
 * fit the room and the ink budget.
 */
function above(e: WorldEnv, it: WorldItem): { row: Row; age: number; edge?: Edge }[] {
  const mine = it.first ? [] : it.prev.filter((x) => x.run === undefined || x.run === it.run);
  const out: { row: Row; age: number; edge?: Edge }[] = [...mine].reverse().map((x) => ({ row: itemRow(x.no, x.text, x.at), age: it.no - x.no }));
  // (where the part opened: on this line, on the first of its rows on record, or past the record, out of shot anyway)
  const opened = it.first || mine.length < it.prev.length || it.no - 1 === mine.length;
  if (!opened) return out;
  const firstNo = mine[0]?.no ?? it.no;
  const age = it.no - firstNo;
  out.push({ row: markRow(it.part), age }, ...shopRows(e, it).reverse().map((row) => ({ row, age })));
  out.push({ row: { h: 34, ink: 0, draw: () => undefined }, age, edge: it.no === 1 ? 'cut' : 'tear' });
  return out;
}

/** The line's ink as the head prints it, px², from its box. */
/**
 * The line's ink as the head prints it, px²: its own characters' cells (kana in the Japanese face's 500, else 700) at the
 * size its box gives them (rows × size × lead tall, rows × width ≈ its advance). A box's area would count a kana line's
 * thin strokes as a bold Han line's (choroin's lines read a third under their box estimate, 2026-11-05).
 */
function lyricInk(e: WorldEnv) {
  // (a call beside the line shares its box but is not the line: the line's own words)
  const text = splitCalls(e.item?.text ?? '').main.replace(/\s+/g, '');
  if (!e.rect || !text) return 0;
  const weight = /[ぁ-ゖァ-ヺ]/u.test(text) ? 500 : 700;
  const r = cellsOf(text, G, weight);
  if (!r) return 0;
  const [w, h] = [e.rect.x1 - e.rect.x0, e.rect.y1 - e.rect.y0];
  const size = Math.min(h, Math.sqrt((h / 1.16) * w * G / r.w));
  return r.n * (size / G) ** 2;
}

/**
 * Lays `rows` bottom-up from `bottom`, newest first, while each fits under `ceil` and the ink so far stays in `budget`;
 * returns the top of what was laid and the edge reached (where the receipt starts), if any.
 */
function layUp(c: C, rows: { row: Row; age: number; edge?: Edge }[], bottom: number, ceil: number, budget: number, x0: number, x1: number, e: WorldEnv) {
  let y = bottom;
  let spent = 0;
  for (const { row, age, edge } of rows) {
    if (edge) return { top: y - row.h, edge };
    if (y - row.h < ceil || spent + row.ink > budget) break;
    y -= row.h;
    spent += row.ink;
    row.draw(c, y, x0, x1, mixHex(e.slots.plate, e.slots.plateInk, rowInk(age)));
  }
  return { top: y, edge: undefined as Edge | undefined };
}

/** The paper feeding: what is printed above the head starts a row lower and steps up into place as the line prints. */
const fed = (e: WorldEnv) => ROW * (1 - stepsOf(e.age / 0.3, 3));

/**
 * The slip of the part just ended, torn off as this part's first line prints (board d): its last rows, 小計, the 合計 if
 * it closed the song, the barcode, the thank-you, its torn foot; it goes up and left, turning, in four held steps, gone
 * in a quarter second, before the line is read.
 */
function tornSlip(c: C, e: WorldEnv, it: WorldItem, x0: number, x1: number, foot: number) {
  const b = it.before;
  // (a line too short to read past a slip going by keeps the frame to itself: the slip was torn off unseen)
  if (!b || e.age > 0.25 || (it.dur ?? 0) < 1.5) return;
  const k = stepsOf((e.age - 0.03) / 0.2, 4);
  if (k >= 1) return;
  const u = wordsOf(e);
  const w = x1 - x0;
  const rows: Row[] = [
    ...it.prev.filter((x) => x.run !== it.run).slice(-2).map((x) => itemRow(x.no, x.text, x.at)),
    rule('-'),
    pairRow(`${u.subtotal}  ${b.part} ${b.n}${u.lines}`, `${b.sec.toFixed(1)}${u.sec}`, P.row),
    rule('='),
    ...(b.closing && it.song ? [totalRow(e, it.song.len), rule('=')] : []),
    ...(it.song ? [barcodeRow(it.song.id)] : []),
    centred(u.thanks, P.row, 700, 0),
  ];
  const h = rows.reduce((s, r) => s + r.h, 0) + 80;
  const ink = e.slots.plateInk;
  piece(c, e, x0 - 220, foot - h, w, h, { bottom: 'tear', rot: -0.1 - 0.12 * k, shadow: [0, 30], seed: 21 + it.no, dx: -260 * k, dy: -(foot + 200) * k }, (p) => {
    let y = 20;
    for (const r of rows) { r.draw(p, y, MARGIN, w - MARGIN, ink); y += r.h; }
  });
}

/** The 合計 row: the song's length, in the paper's second colour, a little larger than the rest of the small print. */
const totalRow = (e: WorldEnv, len: number): Row => ({ ...pairRow(say(e, 'total'), mmss(len), P.total, { weight: 700 }), draw: (c, y, x0, x1) => {
  dotText(c, x0, y, say(e, 'total'), P.total, { ink: e.slots.accent, weight: 700 });
  dotText(c, x1, y, mmss(len), P.total, { ink: e.slots.accent, weight: 700, align: 'right' });
} });
/** The song id's Code 128, whole modules (crisp bars), centred, its id printed under it. */
function barcodeRow(id: string): Row {
  const bars = code128(id) ?? [];
  const mod = 4;
  const bh = 80;
  const total = bars.reduce((s, x) => s + x, 0) * mod;
  return { h: bh + 8 + P.head * G + 14, ink: bars.filter((_, i) => i % 2 === 0).reduce((s, x) => s + x, 0) * mod * bh, draw: (c, y, x0, x1, ink) => {
    let x = Math.round((x0 + x1 - total) / 2);
    c.fillStyle = bare() ? 'rgba(0,0,0,0)' : ink;
    bars.forEach((m, i) => { if (i % 2 === 0) c.fillRect(x, Math.round(y), m * mod, bh); x += m * mod; });
    tally.ink += bars.filter((_, i) => i % 2 === 0).reduce((s, m) => s + m, 0) * mod * bh;
    dotText(c, (x0 + x1) / 2, y + bh + 8, id, P.head, { ink, align: 'center' });
  } };
}

// ---- pages ----

const box = (e: WorldEnv, x0: number, y0: number, x1: number, y1: number) => e.rect ?? { x0, y0, x1, y1 };

/**
 * a / b: the roll round the line being printed. a (feed): the roll rises out of the printer at the frame's foot, the line
 * printed 倍角 just over the tear bar. b (sheet): the slip lies still on the desk, the blank roll under the line. Above
 * the line: its number and start, then what the roll holds (above()), as far as the room and the ink budget go.
 */
const roll = (kind: 'feed' | 'sheet' | 'pair'): HandGround => (e) => page(e, (c) => {
  tally.ink = 0;
  tally.largest = 0;
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const [X0, X1] = kind === 'sheet' ? ROLL.sheet : ROLL.feed;
  const [x0, x1] = [X0 + MARGIN, X1 - MARGIN];
  const r = box(e, x0, 560, x1, 896);
  const it = e.item;
  const ink = e.slots.plateInk;
  const lift = it?.first ? 0 : fed(e);
  // (lay out first, offscreen of nothing: the rows are drawn after the paper, so measure where the paper starts)
  const rows = it ? above(e, it) : [];
  const head = it ? pairRow(kind === 'pair' ? `${no2(it.no)}–${no2(it.no + 1)}` : no2(it.no), it.at === undefined ? '' : mmss(it.at), P.row) : undefined;
  const qty = it && kind !== 'pair' ? qtyRow(e, it) : undefined;
  const budget = lyricInk(e) * INK_BUDGET - (head?.ink ?? 0) - (qty?.ink ?? 0);
  const headY = r.y0 - (head?.h ?? 0) - 4;
  // dry run for the paper's top: lay the rows on a scratch context that draws nothing
  const dry = layUp(scratch(), rows, headY, 0, budget, x0, x1, e);
  const top = dry.edge ? dry.top + lift : -60;
  const low = kind === 'feed' || kind === 'pair' ? MOUTH_Y + 10 : H + 60;
  piece(c, e, X0, top, X1 - X0, low - top, { top: dry.edge ?? 'flat', shadow: kind === 'sheet' ? [18, 18] : [16, 0], seed: 5 + (it?.run ?? 0) });
  tally.ink = 0;
  tally.largest = 0;
  c.save();
  c.translate(0, lift);
  layUp(c, rows, headY, 0, budget, x0, x1, e);
  c.restore();
  if (it && head) head.draw(c, headY, x0, x1, ink);
  if (qty) qty.draw(c, r.y1 + 14, x0, x1, ink);
  if (kind !== 'sheet') printer(c, X0, X1, MOUTH_Y);
  if (it) tornSlip(c, e, it, X0, X1, Math.min(560, r.y0 - 70));
  publish();
});

/**
 * c: the closing line (the last of the last chorus) is the receipt's last item, in the second colour, near the top of the
 * frame; once it has had most of its time (TAIL_AT), the tail prints under it a row at a time: -, 小計 (this part), =, 合計 (the song's length) in red,
 * =, the barcode, the thank-you, and the cutter's edge.
 */
const totalPage: HandGround = (e) => page(e, (c) => {
  tally.ink = 0;
  tally.largest = 0;
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const [X0, X1] = ROLL.total;
  const [x0, x1] = [X0 + MARGIN, X1 - MARGIN];
  const r = box(e, x0, 184, x1, 480);
  const it = e.item;
  const red = e.slots.accent;
  const u = wordsOf(e);
  const head = it ? pairRow(no2(it.no), it.at === undefined ? '' : mmss(it.at), P.row) : undefined;
  const qty = it ? qtyRow(e, it) : undefined;
  // (the tail starts once the line has had most of its time: the line after it often comes in at once, and the 合計 is the
  // receipt's point; by then the line has been read)
  const from = (it?.dur ?? 0) * TAIL_AT;
  const sung = !!it?.dur && e.age > from;
  const tail: Row[] = it ? [
    rule('-'),
    pairRow(`${u.subtotal}  ${it.part} ${it.sub?.n ?? 1}${u.lines}`, `${(it.sub?.sec ?? 0).toFixed(1)}${u.sec}`, P.row),
    rule('='),
    ...(it.song ? [totalRow(e, it.song.len), rule('='), barcodeRow(it.song.id)] : []),
    centred(u.thanks, P.row, 700, 0),
  ] : [];
  // (the tail prints a row every tenth of a second once the line is sung, then the cutter cuts)
  const shown = sung ? Math.min(tail.length, Math.floor((e.age - from) / 0.1) + 1) : 0;
  let y = r.y1 + 14 + (qty?.h ?? 0) + 18;
  const ys = tail.slice(0, shown).map((row) => { const at = y; y += row.h; return at; });
  const cut = shown === tail.length && shown > 0 ? Math.min(H - 20, y + 30) : undefined;
  piece(c, e, X0, -60, X1 - X0, (cut ?? H + 60) + 60, { bottom: cut ? 'cut' : 'flat', shadow: [18, 18], seed: 4 });
  const rows = it ? above(e, { ...it, first: false }) : [];
  const budget = lyricInk(e) * INK_BUDGET - (head?.ink ?? 0) - (qty?.ink ?? 0);
  const headY = r.y0 - (head?.h ?? 0) - 4;
  tally.ink = 0;
  tally.largest = 0;
  layUp(c, rows.filter((x) => !x.edge), headY, 0, budget, x0, x1, e);
  if (head) head.draw(c, headY, x0, x1, red);
  if (qty) qty.draw(c, r.y1 + 14, x0, x1, red);
  tail.slice(0, shown).forEach((row, i) => row.draw(c, ys[i], x0, x1, e.slots.plateInk));
  publish();
});

/** A context that draws nothing, for laying rows out before the paper under them is drawn. */
let dryCtx: OffscreenCanvasRenderingContext2D | undefined;
const scratch = () => (dryCtx ??= new OffscreenCanvas(1, 1).getContext('2d')!);

/** No line up (an intro, an interlude): the printer with a short tongue of blank paper; the shop block in the song's opening. */
const idle: HandGround = (e) => page(e, (c) => {
  tally.ink = 0;
  tally.largest = 0;
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const [X0, X1] = ROLL.feed;
  const opening = !!titleNow(e);
  const rows = opening ? shopRows(e, { no: 1, part: '', prev: [], song: e.item?.song }) : [];
  const h = rows.reduce((s, r) => s + r.h, 0);
  const top = MOUTH_Y - (opening ? h + 110 : 170);
  piece(c, e, X0, top, X1 - X0, MOUTH_Y + 10 - top, { top: 'cut', shadow: [16, 0], seed: 17 });
  let y = top + 50;
  for (const r of rows) { r.draw(c, y, X0 + MARGIN, X1 - MARGIN, mixHex(e.slots.plate, e.slots.plateInk, FADE.fresh)); y += r.h; }
  printer(c, X0, X1, MOUTH_Y);
  publish();
});

/** With no line up every page is the idle printer: no empty receipt is ever shown. */
const orIdle = (g: HandGround): HandGround => (e) => (e.rect ? g(e) : idle(e));
const Gs: Record<string, HandGround> = {
  'document/idle': idle,
  'document/feed': orIdle(roll('feed')),
  'document/sheet': orIdle(roll('sheet')),
  'document/pair': orIdle(roll('pair')),
  'document/total': orIdle(totalPage),
};

const INS: Record<string, HandIn> = {
  // a change of part: the page itself tears the ended part's slip off as the part's first line prints (tornSlip), from
  // the song's own parts; the plan's part change adds nothing over it
  'tear-swap': { sec: 0.4, draw: () => undefined },
};

// (no set pieces: while a line is read nothing else on the receipt moves)
const PIECES: Record<string, Piece> = {};

export const DOCUMENT = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
