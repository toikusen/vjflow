// notebook, from its boards (2026-11-06, 風格第5批設計稿/notebook a–d; source out/research/boards-b5/boards/notebook.html):
// a grown-up's notebook open on a desk. A side-spiral ruled page (rules 2 px, a heavier head rule, the red margin), a
// dotted page with a ribbon bookmark, a top-bound reporter's pad, a top-bound page ruled for columns; coils through
// punched holes; the head's number and date fields left blank (no invented entry). What the hand adds is drawn round the
// words as they were set (their cells), on the beat after they are written: a ballpoint loop round the last phrase, a
// wavy pencil line under it, a marker box drawn twice round the main line and two ballpoint rules under its head, red
// emphasis dots beside a column's end. The rules stop short of every stroke (world-glyph-b5 nb-halo). Paper and pens only:
// no tape, no stickers (that is scrapbook). Printed words: the song's title and artist in its opening only, and the
// time the cut began, written in the margin.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { C, rng } from './world-b3-shared';
import { B5 } from './b5-inks';
import { Box, boxOf, Cell, cellsOf, cutTime, frame, grow, linesOf, meets, openingData, outside, small, smallEnd, smallStart, wordsBox, mirrored } from './world-b5-shared';
import { B5_MIRRORS } from './world-b5-sets';
import { say } from '../labels';

type Pt = [number, number];
const HANDF = (px: number) => `400 ${px}px "LXGW Marker Gothic", sans-serif`;
const PRINT = (px: number) => `400 ${px}px "Noto Sans TC", "Noto Sans JP", sans-serif`;
/** When a pen mark is made: on the beat after the line is written (0.4 s), drawn in one stroke over 0.3 s. */
const stroke = (e: WorldEnv, at = 0.4, dur = 0.3) => clamp01((e.age - at) / dur);

/** A hand's stroke along points, a little off true (board `stroke`), its first share `k` drawn. */
function pen(c: C, pts: Pt[], col: string, w: number, seed: number, amp = 2, k = 1) {
  const R = rng(seed);
  const n = Math.max(2, Math.ceil(pts.length * clamp01(k)));
  c.save();
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.slice(0, n).forEach(([x, y], i) => { const [dx, dy] = [(R() - 0.5) * amp, (R() - 0.5) * amp]; if (i) c.lineTo(x + dx, y + dy); else c.moveTo(x + dx, y + dy); });
  c.stroke();
  c.restore();
}
const seg = (x0: number, y0: number, x1: number, y1: number, n = 20): Pt[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
/** A ballpoint loop round a box: 1.12 turns, its radius drifting (board `loop`). */
const loopPts = (cx: number, cy: number, rx: number, ry: number, seed: number): Pt[] => { const R = rng(seed); let drift = 0; return Array.from({ length: 161 }, (_, i) => { const t = -1.9 + (i / 160) * 1.12 * Math.PI * 2; drift += (R() - 0.5) * 0.004; const k = 1 + drift + (i / 160) * 0.035; return [cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]; }); };
/** A box drawn by hand round a rectangle (board c `rect`). */
const boxPts = (b: Box, pad: number): Pt[] => { const [x0, y0, x1, y1] = [b.x0 - pad, b.y0 - pad * 0.7, b.x1 + pad, b.y1 + pad * 0.7]; return [...seg(x0, y0, x1 + 6, y0 - 4), ...seg(x1 + 6, y0 - 4, x1, y1 + 3).slice(1), ...seg(x1, y1 + 3, x0 - 4, y1).slice(1), ...seg(x0 - 4, y1, x0 + 1, y0 + 6).slice(1)]; };
/** Coils through holes (board `coils`): from the side or from the top. */
function coils(c: C, holes: Pt[], side: boolean, desk: string) {
  for (const [hx, hy] of holes) { c.fillStyle = desk; c.beginPath(); c.arc(hx, hy, 12, 0, Math.PI * 2); c.fill(); }
  for (const [hx, hy] of holes) {
    const d = (cv: C) => { cv.beginPath(); cv.moveTo(hx, hy); if (side) cv.bezierCurveTo(hx - 26, hy - 4, hx - 70, hy - 30, hx - 92, hy - 22); else cv.bezierCurveTo(hx + 4, hy - 26, hx - 22, hy - 72, hx - 14, hy - 96); };
    c.save();
    c.lineCap = 'round';
    d(c);
    c.strokeStyle = B5.x3B3D44;
    c.lineWidth = 11;
    c.stroke();
    c.translate(side ? 0 : -3, side ? -3 : 0);
    d(c);
    c.strokeStyle = B5.x9DA1AB;
    c.lineWidth = 3;
    c.stroke();
    c.restore();
  }
}
/** Ruled lines across a page (or dotted), a heavier head rule, the margin. */
function ruled(c: C, x0: number, x1: number, y1: number, first: number, pitch: number, rule: string, o: { head?: number; margin?: number; dotted?: boolean } = {}) {
  c.fillStyle = rule;
  for (let y = first; y < y1 - 20; y += pitch) {
    if (o.dotted) for (let x = x0 + 8; x < x1; x += 14) { c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill(); }
    else c.fillRect(x0, y - 1, x1 - x0, 2);
  }
  if (o.head !== undefined) c.fillRect(x0, o.head - 1.75, x1 - x0, 3.5);
  if (o.margin !== undefined) { c.fillStyle = B5.xE07F7F; c.fillRect(o.margin - 1.25, 0, 2.5, H); }
}
/** The head's number and date fields, in the song's language, left blank. */
function fields(c: C, e: WorldEnv, x: number, y: number) {
  const [no, date] = [say(e, 'number'), say(e, 'date')];
  const w = small(c, `${no}  ．．．．`, x, y, 22, PRINT, B5.x7FA6CF, 4);
  small(c, `${date}  ．．．．．`, x + w + 50, y, 22, PRINT, B5.x7FA6CF, 4);
}
/** Turned writing in a pen (the margin's time, a head's note). */
function written(c: C, text: string, x: number, y: number, px: number, col: string, deg: number) {
  c.save();
  c.translate(x, y);
  c.rotate((deg * Math.PI) / 180);
  small(c, text, 0, 0, px, HANDF, col, 0);
  c.restore();
}
/** The line's rows (across) as set, top to bottom. */
const rowsOf = (e: WorldEnv) => linesOf(cellsOf(e), false).map((r) => boxOf(r)!);

/** a: a side-spiral ruled page, the margin's time in ballpoint; a loop round the last phrase (or two rules under a one-row line). */
const SIDE_HOLES: Pt[] = Array.from({ length: 14 }, (_, i) => [84, 40 + i * 76]);
const spiral: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  c.drawImage(kept(`b5-nb-a|${e.slots.plate}|${e.slots.ground}`, W, H, (g) => {
    g.fillStyle = e.slots.ground;
    g.fillRect(0, 0, W, H);
    g.fillStyle = e.slots.plate;
    g.fillRect(36, 0, W - 36, H);
    ruled(g, 36, W, H, 154, 76, B5.xA7C6E6, { head: 154, margin: 300 });
    coils(g, SIDE_HOLES, true, e.slots.ground);
  }), 0, 0);
  fields(c, e, 1290, 126);
  const w = wordsBox(e);
  written(c, cutTime(e), 126, Math.max(360, Math.min(900, w.y0 + 60)), 44, e.slots.accent, -3);
  const d = openingData(e, '　');
  if (d) written(c, d, 330, 128, 30, e.slots.accent, -1);
  const rows = rowsOf(e);
  const k = stroke(e);
  if (k > 0 && rows.length) {
    const last = rows[rows.length - 1];
    const others = rows.slice(0, -1);
    // the loop keeps off every other row: its height shrinks to fit, and a one-row line gets two rules instead
    let ry = (last.y1 - last.y0) / 2 + 60;
    const cy = (last.y0 + last.y1) / 2 + 4;
    while (ry > (last.y1 - last.y0) / 2 + 22 && others.some((o) => meets(o, { x0: last.x0 - 84, y0: cy - ry - 6, x1: last.x1 + 84, y1: cy + ry }))) ry -= 4;
    const fits = others.length > 0 && !others.some((o) => meets(o, { x0: last.x0 - 84, y0: cy - ry - 6, x1: last.x1 + 84, y1: cy + ry })) && cy + ry < H - 24;
    if (fits) pen(c, loopPts((last.x0 + last.x1) / 2, cy, (last.x1 - last.x0) / 2 + 84, ry, e.seed), e.slots.accent, 5.5, e.seed, 1.5, k);
    else if (w.y1 + 44 < H - 30) { pen(c, seg(w.x0, w.y1 + 22, w.x1 + 10, w.y1 + 18), e.slots.accent, 5, e.seed + 2, 2, k * 2); pen(c, seg(w.x0 + 10, w.y1 + 40, w.x1 + 4, w.y1 + 38), e.slots.accent, 5, e.seed + 6, 2, k * 2 - 1); }
  }
  smallEnd();
});

/** b: a dotted page in pencil, its ribbon bookmark lying across; a wavy pencil line under the last phrase; the time at the head. */
const dotted: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const paper = mixHex(e.slots.plate, B5.x3E4048, 0.03);
  c.drawImage(kept(`b5-nb-b|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    ruled(g, 0, W, H, 162 + 82, 82, mixHex(e.slots.faint, B5.x3E4048, 0.12), { dotted: true });
    g.fillStyle = mixHex(e.slots.faint, B5.x3E4048, 0.12);
    g.fillRect(0, 160, W, 3.5);
    g.fillStyle = mixHex(B5.xE07F7F, paper, 0.3);
    g.fillRect(219, 0, 2, H);
    // the ribbon bookmark lying across the page, its two tones
    g.fillStyle = B5.x7E2433;
    g.beginPath(); g.moveTo(1700, 0); g.lineTo(1734, 0); g.lineTo(1760, H); g.lineTo(1726, H); g.closePath(); g.fill();
    g.fillStyle = B5.x962E3F;
    g.beginPath(); g.moveTo(1700, 0); g.lineTo(1712, 0); g.lineTo(1738, H); g.lineTo(1726, H); g.closePath(); g.fill();
  }), 0, 0);
  fields(c, e, 1330, 132);
  const pencil = e.slots.ink2;
  const d = openingData(e, '　');
  if (d) small(c, d, 260, 228, 36, HANDF, pencil);
  small(c, cutTime(e), 1584, 228, 36, HANDF, pencil, 0, 'right');
  const rows = rowsOf(e);
  const last = rows.at(-1) ?? wordsBox(e);
  const k = stroke(e, 0.5, 0.45);
  if (k > 0 && last.y1 + 50 < H - 20) {
    const pts: Pt[] = Array.from({ length: 121 }, (_, i) => [last.x0 - 10 + (i / 120) * (last.x1 - last.x0 + 30), last.y1 + 34 + Math.sin((i / 120) * Math.PI * 7) * 9]);
    pen(c, pts, pencil, 4, e.seed + 3, 1.5, k);
  }
  smallEnd();
});

/** c: a top-spiral reporter's pad: a marker box drawn twice round the main line, two ballpoint rules under its head line, the time at the right. */
const TOP_HOLES: Pt[] = Array.from({ length: 23 }, (_, i) => [140 + i * 74, 132]);
const reporter: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  c.drawImage(kept(`b5-nb-c|${e.slots.plate}|${e.slots.ground}`, W, H, (g) => {
    g.fillStyle = e.slots.ground;
    g.fillRect(0, 0, W, H);
    g.fillStyle = e.slots.plate;
    g.fillRect(70, 90, 1780, H - 90);
    g.save();
    g.beginPath();
    g.rect(70, 90, 1780, H - 90);
    g.clip();
    ruled(g, 70, 1850, H, 214, 74, e.slots.faint);
    g.restore();
    coils(g, TOP_HOLES, false, e.slots.ground);
  }), 0, 0);
  const cs = cellsOf(e);
  const big = Math.max(0, ...cs.map((q) => q.s));
  const hero = boxOf(cs.filter((q) => q.s > big * 0.7)) ?? wordsBox(e);
  const head = boxOf(cs.filter((q) => q.s <= big * 0.7));
  written(c, cutTime(e), 1400, 290, 40, e.slots.accent, -2);
  const d = openingData(e, '　');
  if (d) written(c, d, 1400, 240, 30, e.slots.accent, -2);
  const k = stroke(e);
  if (k > 0) {
    const pads = [70, 92].filter((p) => !head || !meets(head, { x0: hero.x0 - p, y0: hero.y0 - p * 0.7 - 8, x1: hero.x1 + p, y1: hero.y1 + p * 0.7 }));
    pads.forEach((p, i) => { const b = { x0: Math.max(84, hero.x0), y0: hero.y0, x1: Math.min(1836, hero.x1), y1: Math.min(H - 70, hero.y1) }; pen(c, boxPts(b, p), e.slots.ink, i ? 5 : 7, e.seed + i * 5, 3, k * 2 - i); });
    if (head) { pen(c, seg(head.x0, head.y1 + 20, head.x1 + 10, head.y1 + 16), e.slots.accent, 5, e.seed + 2, 2, k * 2); pen(c, seg(head.x0 + 10, head.y1 + 36, head.x1 + 4, head.y1 + 34), e.slots.accent, 5, e.seed + 6, 2, k * 2 - 1); }
  }
  smallEnd();
});

/** d: a top-bound page ruled for columns; red emphasis dots beside the end of the last column; the time and the opening's data at the foot. */
const V_HOLES: Pt[] = Array.from({ length: 22 }, (_, i) => [196 + i * 72, 108]);
const vertical: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  c.drawImage(kept(`b5-nb-d|${e.slots.plate}|${e.slots.ground}`, W, H, (g) => {
    g.fillStyle = e.slots.ground;
    g.fillRect(0, 0, W, H);
    g.fillStyle = e.slots.plate;
    g.fillRect(120, 70, 1680, H - 70);
    g.fillStyle = B5.xDFA49C;
    for (let x = 1800 - 470; x > 180; x -= 135) g.fillRect(x - 1, 170, 2, 850);
    for (let x = 1800 - 470 + 135; x < 1740; x += 135) g.fillRect(x - 1, 170, 2, 850);
    g.fillRect(180, 169, 1560, 2.5);
    g.fillRect(180, 1019, 1560, 2.5);
    coils(g, V_HOLES, false, e.slots.ground);
  }), 0, 0);
  const cols = linesOf(cellsOf(e), true);
  const k = stroke(e, 0.45, 0.32);
  if (k > 0 && cols.length > 1) {
    const last = [...cols[cols.length - 1]].sort((p, q) => p.y - q.y);
    const marked = last.slice(-Math.min(4, last.length));
    const x = Math.max(...last.map((q) => q.x + q.s / 2)) + 24;
    marked.slice(0, Math.ceil(k * marked.length)).forEach((q: Cell) => { c.fillStyle = B5.xC8362E; c.beginPath(); c.arc(x, q.y, 9, 0, Math.PI * 2); c.fill(); });
  }
  written(c, cutTime(e), 250, 1056, 36, e.slots.accent, -1);
  const d = openingData(e, '　');
  if (d) small(c, d, 1590, 1034, 20, PRINT, mixHex(B5.xC8362E, e.slots.plate, 0.25), 2, 'right');
  smallEnd();
});

const Gs: Record<string, HandGround> = { 'notebook/spiral': spiral, 'notebook/dotted': dotted, 'notebook/reporter': reporter, 'notebook/vertical': vertical };

const INS: Record<string, HandIn> = {
  // the page is turned: the next sheet sweeps up from the bottom with a thin shadow at its edge, never over the words
  'notebook-turn': { sec: 0.4, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const y = H * (1 - ease(q, 3));
    c.save();
    if (e.rect) outside(c, grow(wordsBox(e), 24));
    c.fillStyle = e.slots.plate;
    c.fillRect(0, 0, W, y);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, y, W, 10);
    c.fillStyle = mixHex(e.slots.plate, e.slots.ink, 0.12);
    c.fillRect(0, y - 3, W, 3);
    c.restore();
  }) },
};

const PIECES: Record<string, Piece> = {
  // a small star drawn in one pass beside the words' upper right (board b's pencil star)
  'doodle-star': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = wordsBox(e);
    const [cx, cy, r] = [Math.min(W - 120, w.x1 + 80), Math.max(80, w.y0 + 30), 38];
    if (cx + r > W - 40 || meets(grow(w, 14), { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r })) return;
    const tips = [0, 2, 4, 1, 3, 0].map((k) => [cx + Math.sin((k * 2 * Math.PI) / 5) * r, cy - Math.cos((k * 2 * Math.PI) / 5) * r] as Pt);
    tips[5] = [tips[5][0] + 6, tips[5][1] + 4];
    pen(c, tips.flatMap((p, i) => (i ? seg(...tips[i - 1], ...p, 6).slice(1) : [p])), e.slots.ink2, 4, e.seed + 12, 1.5, ease(q / 0.5, 2));
  }) },
  // a ballpoint arrow in the left margin pointing at the words
  'margin-arrow': { sec: 1.0, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = wordsBox(e);
    const y = (w.y0 + w.y1) / 2;
    const x1 = w.x0 - 40;
    if (x1 < 260) return;
    const k = ease(q / 0.5, 2);
    pen(c, seg(Math.max(140, x1 - 260), y + 18, x1, y), e.slots.accent, 5, e.seed + 21, 2, k * 1.4);
    if (k > 0.7) { pen(c, seg(x1 - 34, y - 22, x1, y, 6), e.slots.accent, 5, e.seed + 22); pen(c, seg(x1 - 30, y + 30, x1, y, 6), e.slots.accent, 5, e.seed + 23); }
  }) },
  // ticks in the margin, one after another, as on a list kept
  'tick-list': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 20);
    const n = Math.floor(clamp01(q / 0.6) * 3) + 1;
    for (let i = 0; i < n && i < 3; i++) {
      const [x, y] = [w.x0 - 120 > 120 ? w.x0 - 120 : w.x1 + 70, w.y0 + 30 + i * 70];
      if (x + 50 > W - 40 || y > H - 50) continue;
      pen(c, [[x, y], [x + 16, y + 20], [x + 48, y - 22]], e.slots.accent, 6, e.seed + 30 + i, 1.5);
    }
  }) },
};

// the turned pages (world-b5-sets B5_MIRRORS)
for (const id of B5_MIRRORS) if (Gs[id]) Gs[`${id}-r`] = mirrored(Gs[id]);

export const NOTEBOOK = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
