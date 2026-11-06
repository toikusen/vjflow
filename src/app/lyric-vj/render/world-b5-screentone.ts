// screentone, from its boards (2026-11-06, 風格第5批設計稿/screentone a–d; source out/research/boards-b5/boards/screentone.html):
// a black-and-white manga page. Panels with 7 px black frames and white gutters; tone sheets at 45° on a 9 px pitch in
// four steps (dot radius 1.6, 2.3, 3.1, and white dots of 2.4 on black), never a smooth gradient; a line tone for the sea;
// focus lines left as background (they never rush in) and tapered speed lines; a spiky shout balloon, vertical ellipse
// balloons, a narration box; scratched white stars. Only the ink and the paper: no third colour (that, and dots in
// colour with heavy outlines, is popart). Balloons and boxes are drawn round the words as they were set (their cells).
// Printed words: the song's title and artist in its opening only, and the time the cut began, under the page.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, W, WorldEnv } from './world-craft';
import { C, halftone, rng, sparklePath } from './world-b3-shared';
import { beyondCells, Box, boxOf, cellsOf, cutTime, frame, grow, openingData, outside, small, smallEnd, smallStart, wordsBox, mirrored } from './world-b5-shared';
import { B5_MIRRORS } from './world-b5-sets';

type Pt = [number, number];
const SERIF = (px: number) => `400 ${px}px "Cactus Classical Serif", "Zen Antique", serif`;
/** The four tone steps (board t20, t35, t55, and t75 white dots on black), dot radii on a 9 px pitch. */
export const TONES = { pitch: 9, steps: [1.6, 2.3, 3.1], dark: 2.4, frame: 7 } as const;
type Tone = 0 | 1 | 2 | 3;

const path = (c: C, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const bboxOf = (pts: Pt[]) => { const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
/** A tone sheet laid in a shape (clipped): one of the four steps. */
function tone(c: C, pts: Pt[], step: Tone, ink: string, paper: string) {
  const b = bboxOf(pts);
  c.save();
  path(c, pts);
  c.clip();
  if (step === 3) {
    c.fillStyle = ink;
    c.fillRect(b.x, b.y, b.w, b.h);
    halftone(c, b.x, b.y, b.w, b.h, TONES.pitch, () => TONES.dark, paper, 45);
  } else halftone(c, b.x, b.y, b.w, b.h, TONES.pitch, () => TONES.steps[step], ink, 45);
  c.restore();
}
/** Line tone (board `lines`): a 3.2 px black rule every 10 px. */
function lineTone(c: C, x: number, y: number, w: number, h: number, ink: string) {
  c.fillStyle = ink;
  for (let yy = y; yy < y + h; yy += 10) c.fillRect(x, yy, w, Math.min(3.2, y + h - yy));
}
/** Focus lines (board `focus`): thin tapered wedges toward a point, a clear centre of radius r0, clipped to a panel. */
function focus(c: C, pts: Pt[], fx: number, fy: number, r0: number, n: number, ink: string, seed: number) {
  const R = rng(seed);
  c.save();
  path(c, pts);
  c.clip();
  c.fillStyle = ink;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const [t, a, w] = [(i / n) * Math.PI * 2 + R() * 0.02, r0 * (1 + R() * 0.5), 0.004 + R() * 0.008];
    c.moveTo(fx + Math.cos(t) * a, fy + Math.sin(t) * a);
    c.lineTo(fx + Math.cos(t - w) * 2400, fy + Math.sin(t - w) * 2400);
    c.lineTo(fx + Math.cos(t + w) * 2400, fy + Math.sin(t + w) * 2400);
    c.closePath();
  }
  c.fill();
  c.restore();
}
/** Parallel speed lines (board `speed`): tapered, running right, clipped to a panel. */
function speed(c: C, pts: Pt[], n: number, ink: string, seed: number, reach = 1) {
  const R = rng(seed);
  const b = bboxOf(pts);
  c.save();
  path(c, pts);
  c.clip();
  c.fillStyle = ink;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const [y, w, L, x] = [b.y + R() * b.h, 1 + R() * 3, (300 + R() * 900) * reach, b.x + R() * b.w];
    c.moveTo(x, y);
    c.lineTo(x + L, y - w);
    c.lineTo(x + L, y + w);
    c.closePath();
  }
  c.fill();
  c.restore();
}
/** A panel's frame. */
function rim(c: C, pts: Pt[], ink: string) { c.save(); c.lineJoin = 'miter'; c.lineWidth = TONES.frame; c.strokeStyle = ink; path(c, pts); c.stroke(); c.restore(); }
/** A spiky shout balloon (board `spiky`) round a box. */
function spiky(c: C, cx: number, cy: number, rx: number, ry: number, n: number, ink: string, paper: string, seed: number) {
  const R = rng(seed);
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const t = (i / (n * 2)) * Math.PI * 2; const k = i % 2 ? 1 : 1.16 + R() * 0.12; const [x, y] = [cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  c.closePath();
  c.fillStyle = paper;
  c.fill();
  c.lineJoin = 'miter';
  c.lineWidth = 5;
  c.strokeStyle = ink;
  c.stroke();
}
/** A vertical ellipse balloon with its tail (board `balloon`). */
function balloon(c: C, cx: number, cy: number, rx: number, ry: number, tail: Pt, ink: string, paper: string) {
  const a = Math.atan2(tail[1] - cy, tail[0] - cx);
  const p1: Pt = [cx + Math.cos(a - 0.12) * rx, cy + Math.sin(a - 0.12) * ry];
  const p2: Pt = [cx + Math.cos(a + 0.12) * rx, cy + Math.sin(a + 0.12) * ry];
  c.save();
  c.lineWidth = 5;
  c.strokeStyle = ink;
  c.fillStyle = paper;
  path(c, [p1, tail, p2]);
  c.fill();
  c.stroke();
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = paper;
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(...p1);
  c.lineTo(...p2);
  c.stroke();
  c.restore();
}
/** Scratched white stars (board b): a dot and a cross of thin white lines. */
function star(c: C, x: number, y: number, r: number, paper: string) {
  c.fillStyle = paper;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = paper;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - r * 3, y);
  c.lineTo(x + r * 3, y);
  c.moveTo(x, y - r * 3);
  c.lineTo(x, y + r * 3);
  c.stroke();
}
/** The least half-height of an oval round words `h` half-high: room for its width to close round their corners. */
const oval = (h: number) => (h + 24) * 1.15;
/** The half-width an oval of half-height `ry` needs to hold a box `w` × `h` (halves) with 24 px to spare at its corners. */
const round = (w: number, h: number, ry: number) => (w + 24) / Math.sqrt(Math.max(0.05, 1 - ((h + 24) / ry) ** 2));
/** A call beside the line (engine placeCall) is set in a narration box of its own: never over tone or speed lines. (A
 * turned sound effect's box is wider than its cells and its rings: no call is read off it.) */
function callBoxes(c: C, e: WorldEnv) {
  const r = e.rect as { face?: { shear: number[] }; faces?: { shear: number[] }[] } | undefined;
  if ([...(r?.faces ?? []), ...(r?.face ? [r.face] : [])].some((f) => f.shear[1] !== 0)) return;
  // (over or under the line only: a band beside it was the room a line keeps for its travel, and drew an empty box)
  for (const b of beyondCells(e, 60).filter((x) => x.x1 - x.x0 > x.y1 - x.y0)) {
    const r = { x0: Math.max(40, b.x0 + 8), y0: Math.max(40, b.y0 + 8), x1: Math.min(W - 40, b.x1 - 8), y1: Math.min(H - 40, b.y1 - 8) };
    if (r.x1 - r.x0 < 30 || r.y1 - r.y0 < 30) continue;
    c.fillStyle = e.slots.ground;
    c.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    c.lineWidth = 4;
    c.strokeStyle = e.slots.ink;
    c.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }
}
/** The page's foot: title and artist in the opening, the cut's time; and the boxes of any call beside the line. */
function foot(c: C, e: WorldEnv) {
  callBoxes(c, e);
  const d = openingData(e, ' ');
  small(c, [d, cutTime(e)].filter(Boolean).join(' '), 70, 1040, 24, SERIF, e.slots.ink);
}
/** The page lights up a panel at a time as the cut opens (board motion): a panel not yet lit is bare paper inside its frame. */
const LIGHT_EVERY = 0.1;
function unlit(c: C, e: WorldEnv, panels: Pt[][]) {
  panels.forEach((p, i) => { if (e.age >= i * LIGHT_EVERY) return; c.save(); path(c, p); c.fillStyle = e.slots.ground; c.fill(); c.restore(); rim(c, p, e.slots.ink); });
}
/** The line's columns as set: the hero's (the column nearest `heroX`) and the rest. */
function parts(e: WorldEnv, heroX: number): { hero?: Box; rest?: Box } {
  const cs = cellsOf(e);
  if (!cs.length) return { hero: wordsBox(e) };
  const xs = [...new Set(cs.map((q) => Math.round(q.x / 20)))];
  const near = xs.sort((p, q) => Math.abs(p * 20 - heroX) - Math.abs(q * 20 - heroX))[0] * 20;
  const hero = cs.filter((q) => Math.abs(q.x - near) < q.s * 0.6);
  const rest = cs.filter((q) => !hero.includes(q));
  return { hero: boxOf(hero), rest: boxOf(rest) };
}

/** a: two panels; focus lines toward a spiky balloon round the line's first column; the last phrase down the next panel as a sound effect over tone and speed lines. */
const A_LEFT: Pt[] = [[60, 60], [1180, 60], [1060, 1000], [60, 1000]];
const A_RIGHT: Pt[] = [[1220, 60], [1860, 60], [1860, 1000], [1100, 1000]];
const shout: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-a|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    tone(g, A_RIGHT, 1, ink, paper);
    speed(g, A_RIGHT, 70, ink, 9);
    rim(g, A_RIGHT, ink);
  }), 0, 0);
  const { hero } = parts(e, 0.335 * W);
  const b = hero ?? wordsBox(e);
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  // (its spikes reach past the panel, as the board's do, but never out of the frame: it stays round the words, no taller)
  const ry = Math.max(oval((b.y1 - b.y0) / 2), Math.min(Math.max(300, (b.y1 - b.y0) / 2 + 80), (Math.min(cy, H - cy) - 12) / 1.28));
  const rx = Math.max(230, (b.x1 - b.x0) / 2 + 130, round((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, ry));
  focus(c, A_LEFT, cx, cy, Math.max(rx, ry) * 0.8, 220, ink, 71);
  rim(c, A_LEFT, ink);
  unlit(c, e, [A_LEFT, A_RIGHT]);
  spiky(c, cx, cy, rx, ry, 22, ink, paper, 7);
  foot(c, e);
  smallEnd();
});

/** b: one wide quiet panel: a night sky in four tone steps with scratched stars, a black horizon and line-tone sea; a narration box round the columns. */
const B_PANEL: Pt[] = [[60, 60], [1860, 60], [1860, 1000], [60, 1000]];
const STARS: [number, number, number][] = [[300, 140, 9], [420, 260, 5], [1500, 120, 8], [1650, 230, 5], [1380, 300, 4], [200, 380, 4], [1760, 400, 5]];
const narration: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-b|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    ([[3, 60, 220], [2, 220, 380], [1, 380, 540], [0, 540, 680]] as [Tone, number, number][]).forEach(([s, y0, y1]) => tone(g, [[60, y0], [1860, y0], [1860, y1 + 1], [60, y1 + 1]], s, ink, paper));
    g.fillStyle = ink;
    g.fillRect(60, 680, 1800, 6);
    lineTone(g, 60, 686, 1800, 314, ink);
    rim(g, B_PANEL, ink);
  }), 0, 0);
  const w = wordsBox(e);
  const box = { x0: w.x0 - 46, y0: w.y0 - 40, x1: w.x1 + 46, y1: Math.min(985, w.y1 + 40) };
  // the stars come out one by one as the page opens, never under the box
  const n = Math.min(STARS.length, Math.floor(e.age / 0.4) + 2);
  c.save();
  outside(c, grow(box, 20));
  STARS.slice(0, n).forEach(([x, y, r]) => star(c, x, y, r, paper));
  c.restore();
  c.fillStyle = paper;
  c.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  c.lineWidth = 5;
  c.strokeStyle = ink;
  c.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  foot(c, e);
  smallEnd();
});

/** c: a page of four panels (speed lines, tone, light tone, focus lines); the sound effect breaks through all of them. */
const C_PANELS: Pt[][] = [[[60, 60], [900, 60], [820, 470], [60, 470]], [[940, 60], [1860, 60], [1860, 400], [860, 470]], [[60, 510], [700, 510], [640, 1000], [60, 1000]], [[740, 510], [1860, 440], [1860, 1000], [680, 1000]]];
const sfx: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-c|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    speed(g, C_PANELS[0], 60, ink, 3);
    tone(g, C_PANELS[1], 2, ink, paper);
    tone(g, C_PANELS[2], 0, ink, paper);
    focus(g, C_PANELS[3], 1300, 720, 240, 200, ink, 5);
    C_PANELS.forEach((p) => rim(g, p, ink));
  }), 0, 0);
  unlit(c, e, C_PANELS);
  foot(c, e);
  smallEnd();
});

/** d: a tall panel in light tone with speed lines between two side panels; an ellipse balloon round each column, tails out. */
const D_MAIN: Pt[] = [[340, 60], [1580, 60], [1580, 1000], [340, 1000]];
const balloons: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-d|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    tone(g, D_MAIN, 0, ink, paper);
    speed(g, D_MAIN, 40, ink, 13);
    rim(g, D_MAIN, ink);
    const L: Pt[] = [[60, 60], [300, 60], [300, 1000], [60, 1000]];
    tone(g, L, 2, ink, paper);
    rim(g, L, ink);
    rim(g, [[1620, 60], [1860, 60], [1860, 500], [1620, 500]], ink);
    const RB: Pt[] = [[1620, 540], [1860, 540], [1860, 1000], [1620, 1000]];
    tone(g, RB, 3, ink, paper);
    rim(g, RB, ink);
  }), 0, 0);
  const { hero, rest } = parts(e, 0.608 * W);
  // (a balloon stays inside its panel where the words leave it room, and always round them)
  const one = (b: Box, tail: Pt) => { const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; const ry = Math.max(oval((b.y1 - b.y0) / 2), Math.min((b.y1 - b.y0) / 2 + 92, cy - 72, 992 - cy)); balloon(c, cx, cy, Math.max(150, (b.x1 - b.x0) / 2 + 92, round((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, ry)), ry, tail, ink, paper); };
  if (hero) one(hero, [Math.min(1560, hero.x1 + 200), Math.min(980, hero.y1 + 110)]);
  if (rest) one(rest, [Math.max(360, rest.x0 - 180), Math.max(80, rest.y0 - 110)]);
  foot(c, e);
  smallEnd();
});

/** The narration box set across: one big panel, tone deepening downward in steps and speed lines at the right; the box round the words. */
const caption: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-e|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    ([[0, 60, 420], [1, 420, 700], [2, 700, 1000]] as [Tone, number, number][]).forEach(([s, y0, y1]) => tone(g, [[60, y0], [1860, y0], [1860, y1 + 1], [60, y1 + 1]], s, ink, paper));
    speed(g, [[1000, 500], [1860, 500], [1860, 1000], [1000, 1000]], 50, ink, 21);
    rim(g, B_PANEL, ink);
  }), 0, 0);
  const w = wordsBox(e);
  const box = { x0: Math.max(80, w.x0 - 44), y0: Math.max(80, w.y0 - 34), x1: Math.min(1840, w.x1 + 44), y1: Math.min(980, w.y1 + 34) };
  c.fillStyle = paper;
  c.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  c.lineWidth = 5;
  c.strokeStyle = ink;
  c.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  foot(c, e);
  smallEnd();
});

/** a, set across: a wide panel of focus lines toward a spiky balloon round the words, a narrow panel of tone and speed lines. */
const E_LEFT: Pt[] = [[60, 60], [1400, 60], [1300, 1000], [60, 1000]];
const E_RIGHT: Pt[] = [[1440, 60], [1860, 60], [1860, 1000], [1340, 1000]];
const burst: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [ink, paper] = [e.slots.ink, e.slots.ground];
  c.drawImage(kept(`b5-st-f|${ink}|${paper}`, W, H, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    tone(g, E_RIGHT, 2, ink, paper);
    speed(g, E_RIGHT, 50, ink, 17);
    rim(g, E_RIGHT, ink);
  }), 0, 0);
  const b = wordsBox(e);
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const ry = Math.max(oval((b.y1 - b.y0) / 2), Math.min((b.y1 - b.y0) / 2 + 150, (Math.min(cy, H - cy) - 12) / 1.28));
  const rx = Math.max(300, (b.x1 - b.x0) / 2 + 150, round((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, ry));
  focus(c, E_LEFT, cx, cy, Math.max(rx, ry) * 0.8, 220, ink, 73);
  rim(c, E_LEFT, ink);
  spiky(c, cx, cy, rx, ry, 24, ink, paper, 11);
  foot(c, e);
  smallEnd();
});

const Gs: Record<string, HandGround> = { 'screentone/burst': burst, 'screentone/shout': shout, 'screentone/narration': narration, 'screentone/sfx': sfx, 'screentone/balloons': balloons, 'screentone/caption': caption };

const INS: Record<string, HandIn> = {
  // the page is turned: the next page's edge sweeps in from the right with its black rule and a hard shadow, never over the words
  'manga-flip': { sec: 0.36, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const x = W * (1 - ease(q, 3));
    c.save();
    if (e.rect) outside(c, grow(wordsBox(e), 24));
    c.fillStyle = e.slots.ground;
    c.fillRect(x, 0, W - x, H);
    c.fillStyle = e.slots.ink;
    c.fillRect(x - 5, 0, 5, H);
    halftone(c, x - 60, 0, 55, H, TONES.pitch, () => TONES.steps[1], e.slots.ink, 45);
    c.restore();
  }) },
};

const PIECES: Record<string, Piece> = {
  // focus lines flash round the words for a few held frames (background only: they never rush in)
  'tone-flash': { sec: 0.7, clear: 0, draw: (e, q) => frame(e, (c) => {
    if (q > 0.6 || Math.floor(q * 12) % 3 === 2) return;
    const w = grow(wordsBox(e), 60);
    const [cx, cy] = [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2];
    c.save();
    outside(c, w);
    focus(c, [[0, 0], [W, 0], [W, H], [0, H]], cx, cy, Math.hypot(w.x1 - w.x0, w.y1 - w.y0) / 2, 160, e.slots.ink, e.seed + 3);
    c.restore();
  }) },
  // white stars scratched out of the tone round the words, one by one, each on a dark patch of its own
  'scratch-stars': { sec: 1.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 50);
    const R = rng(e.seed + 29);
    const n = Math.floor(clamp01(q / 0.6) * 6);
    c.save();
    outside(c, w);
    for (let i = 0; i < n; i++) {
      const [x, y] = [120 + R() * (W - 240), 110 + R() * (H - 260)];
      if (x > w.x0 - 40 && x < w.x1 + 40 && y > w.y0 - 40 && y < w.y1 + 40) continue;
      c.fillStyle = e.slots.ink;
      c.beginPath();
      c.arc(x, y, 34, 0, Math.PI * 2);
      c.fill();
      star(c, x, y, 5, e.slots.ground);
      sparklePath(c, x, y, 26);
      c.lineWidth = 1.5;
      c.strokeStyle = e.slots.ground;
      c.stroke();
    }
    c.restore();
  }) },
  // speed lines sweep across the page behind the words, longer as they go
  'manga-speed': { sec: 0.9, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 40);
    c.save();
    outside(c, w);
    speed(c, [[60, 60], [1860, 60], [1860, 1000], [60, 1000]], 80, e.slots.ink, e.seed + 41, ease(clamp01(q / 0.5), 2));
    c.restore();
  }) },
};

// the turned pages (world-b5-sets B5_MIRRORS)
for (const id of B5_MIRRORS) if (Gs[id]) Gs[`${id}-r`] = mirrored(Gs[id]);

export const SCREENTONE = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
