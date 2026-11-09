// art-deco, from its boards (2026-11-06, 風格第5批設計稿/art-deco a–d; source out/research/boards-b5/boards/art-deco.html): a
// 1920s–30s theatre sign or film poster on a strict centre axis. Black or emerald ground; gold only in thin rules (1.2 to
// 2.6 px, every third ray heavier and paler), never a metal gradient or a sparkle: a sunburst from below the axis, frames
// whose corners step in twice drawn as two parallel lines, a stepped arch window, a field of fans with rays, chevron seas,
// diamond stars, stepped pillars. Every plaque, arch and pillar is built round the words as they were set (their cells),
// and every ray stops behind it. Unlike gothic-lolita (carving, a dark fairy tale) it is geometry; unlike stained-glass
// there is no lead and no light through; the fans have rays and the sea is chevrons, never chiyogami's seigaiha.
// Printed words: the song's title and artist in its opening only, and the time the cut began, tracked wide in gold.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import type { C } from './world-b3-shared';
import { B5 } from './b5-inks';
import { Box, boxOf, cellsOf, cutTime, frame, grow, openingData, outside, small, smallEnd, smallStart, wordsBox } from './world-b5-shared';
import { DECO_COLUMN, DECO_NARROW, DECO_PANELS } from './world-b5-sets';
import type { FaceLayout } from './world-sets';

const SERIF = (px: number) => `500 ${px}px "Noto Serif TC", "Kaisei Tokumin", serif`;
const AX = W / 2;
/** The words' box as drawn narrow. */
const narrowBox = (e: WorldEnv, sx = DECO_NARROW[0]) => boxOf(cellsOf(e), sx) ?? wordsBox(e);

const line = (c: C, x1: number, y1: number, x2: number, y2: number, w: number, col: string) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
/** The stepped outline (corners stepping in twice by `k`), as a path. */
function steppedPath(c: C, x: number, y: number, w: number, h: number, k: number) {
  const p: [number, number][] = [[x + 2 * k, y], [x + w - 2 * k, y], [x + w - 2 * k, y + k], [x + w - k, y + k], [x + w - k, y + 2 * k], [x + w, y + 2 * k], [x + w, y + h - 2 * k], [x + w - k, y + h - 2 * k], [x + w - k, y + h - k], [x + w - 2 * k, y + h - k], [x + w - 2 * k, y + h], [x + 2 * k, y + h], [x + 2 * k, y + h - k], [x + k, y + h - k], [x + k, y + h - 2 * k], [x, y + h - 2 * k], [x, y + 2 * k], [x + k, y + 2 * k], [x + k, y + k], [x + 2 * k, y + k]];
  c.beginPath();
  p.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
  c.closePath();
}
/** A stepped frame in two parallel gold lines (board `stepped`). */
function stepped(c: C, x: number, y: number, w: number, h: number, st = 26, gap = 12, wd = 2.5) {
  [0, gap].forEach((o) => { steppedPath(c, x + o, y + o, w - 2 * o, h - 2 * o, st); c.strokeStyle = o ? B5.xE3C987 : B5.xC9A45C; c.lineWidth = o ? 1.5 : wd; c.stroke(); });
}
/** A sunburst (board `sun`): `n + 1` rays between two angles, every third heavier and paler; only the first `upto` drawn. */
function sun(c: C, cx: number, cy: number, r0: number, r1: number, n: number, a0: number, a1: number, gold: [string, string], upto = Infinity) {
  for (let i = 0; i <= Math.min(n, upto); i++) {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    line(c, cx + Math.cos(t) * r0, cy + Math.sin(t) * r0, cx + Math.cos(t) * r1, cy + Math.sin(t) * r1, i % 3 ? 1.4 : 2.6, i % 3 ? gold[0] : gold[1]);
  }
}
const diamond = (c: C, cx: number, cy: number, r: number, f: string) => { c.fillStyle = f; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r * 0.45, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r * 0.45, cy); c.closePath(); c.fill(); };
/** The scheme's two golds (a silver scheme's two silvers): the rule and the pale ray. */
const golds = (e: WorldEnv): [string, string] => [e.slots.faint, e.slots.ink2];
/** The small print, tracked wide (board .42 em), centred on the axis. */
function caption(c: C, e: WorldEnv, y: number, tone: string, px = 26, extra = '') {
  const d = openingData(e, '　·　');
  small(c, [d, extra, cutTime(e)].filter(Boolean).join('　·　'), AX, y, px, SERIF, tone, px * 0.42, 'center');
}
/** How many rays are drawn yet: one after another as the page opens (board motion), all of them by 0.6 s. */
const raysUp = (e: WorldEnv, n: number) => Math.floor(clamp01(e.age / 0.6) * n);

/** The poster-panel's slide: out fast, settling, never past its place (design-bar rule 9: a panel slides, no bounce). */
const PANEL_EASE = (q: number) => 1 - Math.pow(1 - clamp01(q), 3);
type Rect = { x0: number; y0: number; x1: number; y1: number };
const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({ x0: a.x0 + (b.x0 - a.x0) * k, y0: a.y0 + (b.y0 - a.y0) * k, x1: a.x1 + (b.x1 - a.x1) * k, y1: a.y1 + (b.y1 - a.y1) * k });
/**
 * A marquee line carried on panels (Q1 phase 3b, poster-panel; world-sets `panels`): the main part's plaque (the board's,
 * at its least width) and the gold phrase's own panel under it, both on the axis, the panel the lesser (DECO_PANELS:
 * narrower, its phrase in its inner room with even space above and below). While they part, the one plaque that held
 * both splits between the parts: its upper half rises to the main plaque, its lower half closes in to the panel, so
 * every word stands on the ground's black throughout and no rule ever crosses a word (only the gap between them opens).
 * None when the parts are too close or the panel would not be the lesser: the single plaque, as drawn before.
 */
export function panelsOf(e: WorldEnv): { main: Rect; panel: Rect } | undefined {
  const f = (e.rect as { face?: FaceLayout } | undefined)?.face;
  if (!f?.panels || !f.parts) return undefined;
  const cs = cellsOf(e);
  if (cs.length !== f.parts.length) return undefined;
  const tail = cs.filter((_, i) => f.parts![i]);
  const [m, t] = [boxOf(cs.filter((_, i) => !f.parts![i]), DECO_NARROW[0]), boxOf(tail, DECO_NARROW[0])];
  if (!m || !t) return undefined;
  const P = DECO_PANELS;
  const all = boxOf(cs, DECO_NARROW[0])!;
  const halfAll = Math.max(P.mainHalf, (all.x1 - all.x0) / 2 + P.mainPad);
  const halfMain = Math.max(P.mainHalf, (m.x1 - m.x0) / 2 + P.mainPad);
  const main = { x0: AX - halfMain, y0: m.y0 - P.mainPadY, x1: AX + halfMain, y1: m.y1 + P.mainPadY };
  const halfT = (t.x1 - t.x0) / 2 + P.pad;
  const padY = Math.max(P.inset * 2, P.padY * Math.max(...tail.map((q) => q.s)));
  const panel = { x0: AX - halfT, y0: t.y0 - padY, x1: AX + halfT, y1: t.y1 + padY };
  if (panel.y0 - main.y1 < P.gap || halfT > halfMain - P.narrower) return undefined;
  const k = f.panels.sec > 0 ? PANEL_EASE((e.now - f.panels.from) / f.panels.sec) : 1;
  const mid = (main.y1 + panel.y0) / 2;
  const one = { x0: AX - halfAll, y0: all.y0 - P.mainPadY, x1: AX + halfAll, y1: all.y1 + P.mainPadY };
  return { main: lerpRect({ ...one, y1: mid }, main, k), panel: lerpRect({ ...one, y0: mid }, panel, k) };
}

/** a: a stepped double frame; a sunburst from below the axis; a black plaque round the words with triple rules top and bottom, a diamond on the axis at each; chevrons under it. */
const marqueeOf = (low: boolean): HandGround => (e) => frame(e, (c) => {
  smallStart(e);
  const [g0, g1] = golds(e);
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  stepped(c, 70, 60, 1780, 960);
  const w = narrowBox(e);
  const half = Math.max(DECO_PANELS.mainHalf, (w.x1 - w.x0) / 2 + DECO_PANELS.mainPad);
  const whole = { x0: AX - half, y0: w.y0 - DECO_PANELS.mainPadY, x1: AX + half, y1: w.y1 + DECO_PANELS.mainPadY };
  // (a line carried on panels, poster-panel: the plaque parts into the main plaque and the gold phrase's panel)
  const parted = panelsOf(e);
  const p = parted?.main ?? whole;
  c.save();
  c.beginPath();
  c.rect(110, 100, 1700, 880);
  c.clip();
  // (held low, the sunburst comes from above the axis and the chevrons point up from over the plaque)
  if (low) sun(c, AX, 20, 260, 1500, 48, 0, 180, [g0, g1], raysUp(e, 48));
  else sun(c, AX, 1060, 260, 1500, 48, 180, 360, [g0, g1], raysUp(e, 48));
  c.restore();
  c.fillStyle = e.slots.ground;
  c.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  [0, 14, 28].forEach((o) => { line(c, p.x0, p.y0 + o, p.x1, p.y0 + o, o ? 1.2 : 2.4, g0); line(c, p.x0, p.y1 - o, p.x1, p.y1 - o, o ? 1.2 : 2.4, g0); });
  line(c, p.x0, p.y0, p.x0, p.y1, 2.4, g0);
  line(c, p.x1, p.y0, p.x1, p.y1, 2.4, g0);
  diamond(c, AX, p.y0, 20, g1);
  diamond(c, AX, p.y1, 20, g1);
  if (parted) {
    // the secondary panel, the lesser: the ground's own black, one thin gold rule round it (no steps, no second line),
    // a small diamond on the axis at its foot only
    const q = parted.panel;
    c.fillStyle = e.slots.ground;
    c.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
    c.strokeStyle = g0;
    c.lineWidth = 1.4;
    c.strokeRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
    diamond(c, AX, q.y1, 10, g1);
  }
  const foot = parted ? parted.panel.y1 : p.y1;
  if (low) {
    if (p.y0 - 150 > 90) {
      c.fillStyle = e.slots.ground;
      c.fillRect(600, p.y0 - 120, 720, 50);
      caption(c, e, p.y0 - 86, g0);
      [0, 1, 2].forEach((i) => { c.strokeStyle = g0; c.lineWidth = 2; c.beginPath(); c.moveTo(AX - 60, p.y0 - 140 - i * 22); c.lineTo(AX, p.y0 - 166 - i * 22); c.lineTo(AX + 60, p.y0 - 140 - i * 22); c.stroke(); });
    }
  } else if (foot + 150 < 990) {
    c.fillStyle = e.slots.ground;
    c.fillRect(600, foot + 70, 720, 50);
    caption(c, e, foot + 102, g0);
    [0, 1, 2].forEach((i) => { c.strokeStyle = g0; c.lineWidth = 2; c.beginPath(); c.moveTo(AX - 60, foot + 140 + i * 22); c.lineTo(AX, foot + 166 + i * 22); c.lineTo(AX + 60, foot + 140 + i * 22); c.stroke(); });
  }
  smallEnd();
});

/** b: a stepped arch window on the axis, darker than the ground; its gold outline and an inner one; diamond stars over the words; a chevron sea under them; the small print at the top of the arch. */
function archPath(c: C, half: number, top: number, bottom: number) {
  const r = half - 120;
  c.beginPath();
  c.moveTo(AX - half, bottom);
  c.lineTo(AX - half, top + 360);
  c.lineTo(AX - half + 50, top + 360);
  c.lineTo(AX - half + 50, top + 260);
  c.lineTo(AX - half + 120, top + 260);
  c.lineTo(AX - half + 120, top + 180);
  c.arc(AX, top + 180, r, Math.PI, 0);
  c.lineTo(AX + half - 120, top + 260);
  c.lineTo(AX + half - 50, top + 260);
  c.lineTo(AX + half - 50, top + 360);
  c.lineTo(AX + half, top + 360);
  c.lineTo(AX + half, bottom);
  c.closePath();
}
const arch: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [g0, g1] = golds(e);
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const w = narrowBox(e);
  const half = Math.min(900, Math.max(520, (w.x1 - w.x0) / 2 + 120));
  const top = Math.min(0, w.y0 - 330);
  archPath(c, half, top, 1000);
  c.fillStyle = mixHex(e.slots.ground, B5.x111111, 0.3);
  c.fill();
  c.strokeStyle = g0;
  c.lineWidth = 2.5;
  c.stroke();
  c.save();
  c.translate(AX, 600);
  c.scale(0.975, 0.975);
  c.translate(-AX, -600);
  archPath(c, half, top, 1000);
  c.strokeStyle = g1;
  c.lineWidth = 1.2;
  c.stroke();
  c.restore();
  c.save();
  archPath(c, half, top, 1000);
  c.clip();
  outside(c, grow(w, 30));
  const sea = Math.max(700, w.y1 + 60);
  for (let row = 0; row < 9 && sea + row * 32 < 1000; row++) {
    c.strokeStyle = row % 3 ? g0 : g1;
    c.lineWidth = row % 3 ? 1.2 : 2.2;
    c.beginPath();
    for (let x = AX - half - 40; x <= AX + half + 40; x += 80) { const y = sea + 20 + row * 32; if (x === AX - half - 40) c.moveTo(x, y); else c.lineTo(x, y); c.lineTo(x + 40, y - 20); }
    c.stroke();
  }
  // diamond stars over the words, one by one as the page opens
  const stars: [number, number, number][] = [[-330, -60, 14], [300, -70, 18], [150, -90, 9], [-170, -95, 9], [420, -30, 8], [-420, -30, 7]];
  stars.slice(0, Math.floor(clamp01(e.age / 0.9) * stars.length) + 1).forEach(([dx, dy, r]) => { const y = w.y0 + dy; if (y > top + 230) diamond(c, AX + dx, y, r, g1); });
  c.restore();
  if (w.y0 - 140 > top + 150) caption(c, e, w.y0 - 140, g0, 24);
  smallEnd();
});

/** c: a field of fans (half-discs with rays and a gold hub, rows offset); a cream stepped plaque on the axis, in a black stepped margin, round the words. */
const fans = (ground: string, g0: string, g1: string) => kept(`b5-deco-fans|${ground}|${g0}|${g1}`, W, H, (c) => {
  c.fillStyle = ground;
  c.fillRect(0, 0, W, H);
  for (let row = -1; row < 14; row++)
    for (let x = (row % 2) * 80 - 80; x < 2000; x += 160) {
      const y = row * 80;
      c.beginPath();
      c.moveTo(x - 80, y + 80);
      c.arc(x, y + 80, 80, Math.PI, 0);
      c.closePath();
      c.fillStyle = ground;
      c.fill();
      c.strokeStyle = g0;
      c.lineWidth = 2;
      c.stroke();
      for (let k = 1; k < 8; k++) { const t = Math.PI + (k * Math.PI) / 8; line(c, x + Math.cos(t) * 14, y + 80 + Math.sin(t) * 14, x + Math.cos(t) * 72, y + 80 + Math.sin(t) * 72, 1.2, k % 2 ? g0 : g1); }
      c.beginPath();
      c.moveTo(x - 14, y + 80);
      c.arc(x, y + 80, 14, Math.PI, 0);
      c.closePath();
      c.fillStyle = g0;
      c.fill();
    }
});
const plaque: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [g0, g1] = golds(e);
  c.drawImage(fans(e.slots.ground, g0, g1), 0, 0);
  const w = narrowBox(e);
  const half = Math.min(900, Math.max(630, (w.x1 - w.x0) / 2 + 150));
  const [y0, y1] = [Math.min(360, w.y0 - 90), Math.max(740, w.y1 + 110)];
  steppedPath(c, AX - half - 30, y0 - 30, (half + 30) * 2, y1 - y0 + 60, 30);
  c.fillStyle = e.slots.ground;
  c.fill();
  steppedPath(c, AX - half, y0, half * 2, y1 - y0, 26);
  c.fillStyle = e.slots.plate;
  c.fill();
  c.strokeStyle = g0;
  c.lineWidth = 3;
  c.stroke();
  steppedPath(c, AX - half + 16, y0 + 16, half * 2 - 32, y1 - y0 - 32, 22);
  c.strokeStyle = B5.x9C7A36;
  c.lineWidth = 1.5;
  c.stroke();
  if (w.y1 + 64 < y1 - 24) caption(c, e, y1 - 34, mixHex(e.slots.plateInk, B5.x9C7A36, 0.45), 24);
  smallEnd();
});

/** d: a sunburst from below; two stepped pillars mirrored on the axis, one round each column, inner gold lines; a diamond on the axis at their feet. */
const pillars: HandGround = (e) => frame(e, (c) => {
  smallStart(e);
  const [g0, g1] = golds(e);
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  sun(c, AX, 1120, 300, 1300, 40, 200, 340, [g0, g1], raysUp(e, 40));
  const cs = cellsOf(e);
  const cols = [...new Set(cs.map((q) => Math.round(q.x)))].map((x) => boxOf(cs.filter((q) => Math.abs(q.x - x) < q.s * 0.4), DECO_COLUMN[0])!).filter(Boolean);
  const boxes: Box[] = (cols.length ? cols : [wordsBox(e)]).filter((b, i, a) => a.findIndex((o) => Math.abs((o.x0 + o.x1) / 2 - (b.x0 + b.x1) / 2) < 30) === i);
  const bottom = Math.min(1000, Math.max(...boxes.map((b) => b.y1)) + 50);
  for (const b of boxes) {
    const pw = Math.max(230, b.x1 - b.x0 + 120);
    const x0 = (b.x0 + b.x1) / 2 - pw / 2;
    const top = Math.max(20, b.y0 - 130);
    c.beginPath();
    c.moveTo(x0, bottom);
    c.lineTo(x0, top + 90);
    c.lineTo(x0 + 30, top + 90);
    c.lineTo(x0 + 30, top + 40);
    c.lineTo(x0 + 70, top + 40);
    c.lineTo(x0 + 70, top);
    c.lineTo(x0 + pw - 70, top);
    c.lineTo(x0 + pw - 70, top + 40);
    c.lineTo(x0 + pw - 30, top + 40);
    c.lineTo(x0 + pw - 30, top + 90);
    c.lineTo(x0 + pw, top + 90);
    c.lineTo(x0 + pw, bottom);
    c.closePath();
    c.fillStyle = e.slots.ground;
    c.fill();
    c.strokeStyle = g0;
    c.lineWidth = 2.5;
    c.stroke();
    line(c, x0 + 16, top + 110, x0 + 16, bottom - 15, 1.2, g1);
    line(c, x0 + pw - 16, top + 110, x0 + pw - 16, bottom - 15, 1.2, g1);
  }
  diamond(c, AX, bottom - 10, 18, g1);
  if (bottom + 40 < H - 20) caption(c, e, bottom + 36, g0, 22);
  smallEnd();
});

const Gs: Record<string, HandGround> = { 'art-deco/marquee': marqueeOf(false), 'art-deco/marquee-low': marqueeOf(true), 'art-deco/arch': arch, 'art-deco/plaque': plaque, 'art-deco/pillars': pillars };

const INS: Record<string, HandIn> = {
  // two doors close toward the axis and open again: ground-coloured leaves with gold edge rules, never over the words
  'deco-doors': { sec: 0.5, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const k = q < 0.5 ? ease(q * 2, 2) : 1 - ease((q - 0.5) * 2, 2);
    const reach = AX * k;
    c.save();
    if (e.rect) outside(c, grow(narrowBox(e), 24));
    c.fillStyle = e.slots.ground;
    c.fillRect(0, 0, reach, H);
    c.fillRect(W - reach, 0, reach, H);
    [reach - 2, W - reach + 2].forEach((x) => line(c, x, 0, x, H, 2.6, e.slots.faint));
    [reach - 16, W - reach + 16].forEach((x) => line(c, x, 0, x, H, 1.2, e.slots.ink2));
    c.restore();
  }) },
};

const PIECES: Record<string, Piece> = {
  // more rays spread from behind the words, one after another, symmetric on the axis
  'deco-rays': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(narrowBox(e), 40);
    const [cx, cy] = [AX, (w.y0 + w.y1) / 2];
    const n = Math.floor(clamp01(q / 0.6) * 12);
    c.save();
    outside(c, w);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) { const t = s * (0.12 + i * 0.12); line(c, cx + Math.sin(t) * 300, cy - Math.cos(t) * 300 * 0.6, cx + Math.sin(t) * 1400, cy - Math.cos(t) * 1400 * 0.6, i % 3 ? 1.4 : 2.6, i % 3 ? e.slots.faint : e.slots.ink2); }
    c.restore();
  }) },
  // chevrons stack upward on the axis under the words, one per step
  'chevron-climb': { sec: 1.0, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(narrowBox(e), 30);
    const base = w.y1 + 220 < H - 30 ? w.y1 + 200 : w.y0 - 30;
    const n = Math.floor(clamp01(q / 0.6) * 6);
    c.save();
    outside(c, w);
    for (let i = 0; i < n; i++) { const y = base - i * 24; if (y < 30 || y > H - 30) continue; c.strokeStyle = i % 3 ? e.slots.faint : e.slots.ink2; c.lineWidth = 2; c.beginPath(); c.moveTo(AX - 70, y + 26); c.lineTo(AX, y); c.lineTo(AX + 70, y + 26); c.stroke(); }
    c.restore();
  }) },
  // gold diamonds appear in mirrored pairs either side of the axis
  'diamond-scatter': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(narrowBox(e), 40);
    const n = Math.floor(clamp01(q / 0.6) * 5);
    const at: [number, number, number][] = [[w.x1 + 80, w.y0 + 20, 16], [w.x1 + 180, (w.y0 + w.y1) / 2, 10], [w.x1 + 60, w.y1 - 10, 12], [w.x1 + 260, w.y0 - 30, 8], [w.x1 + 140, w.y1 + 50, 9]];
    c.save();
    outside(c, w);
    at.slice(0, n).forEach(([x, y, r]) => { for (const xx of [x, 2 * AX - x]) if (xx > 40 && xx < W - 40 && y > 40 && y < H - 40) diamond(c, xx, y, r, e.slots.ink2); });
    c.restore();
  }) },
};

export const DECO = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
