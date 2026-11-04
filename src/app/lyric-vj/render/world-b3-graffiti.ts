// graffiti, rebuilt from its round-2 board (2026-11-04, 風格設計稿_第二輪/graffiti a–d): stencil and paste-up on a painted
// plaster wall. The writer rolls a patch of buff over the wall, then sprays the words through a cut stencil (bridges where
// a cutter must leave them: world-glyph-loud.ts `stencilled`); round it, wheatpasted screen prints with torn edges and a
// halftone fade, masking tape on their corners, stickers. Only real data is printed on them (the song's title and its
// artist). Hard edges throughout; overspray is single dots, never a blur. The wall is ambientCG PaintedPlaster016 (CC0).
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, isLight, mixHex, ObjectPaint, Slots, W, WorldEnv } from './world-craft';
import { artistBy, C, halftone, label, rng, still, titleOf } from './world-b3-shared';
import { stencilled } from './world-glyph-loud';
import { graffitiWall } from './world-b3-tex';
import { B3 } from './b3-inks';

const K = B3.x151515;
const PAPER = B3.xF1EEE6;
const YEL = B3.xF0C02C;
const TAPE = B3.xD9CDAA;
const RIM = B3.xF6F4EE;
/** The poster and sticker caps, falling back to the stencil face for what they do not draw (a Chinese title). */
const CAPS = (px: number, w = 900) => `${w} ${px}px "Big Shoulders Stencil Display", "WDXL Lubrifont TC", "WDXL Lubrifont JP N", sans-serif`;
const FACE = (px: number) => `400 ${px}px "WDXL Lubrifont TC", "WDXL Lubrifont JP N", sans-serif`;
/** A Latin label is set in capitals, as on the board; anything else as it is. */
const caps = (t: string) => (/^[\x20-\x7e]+$/.test(t) ? t.toUpperCase() : t);

interface Box { x0: number; y0: number; x1: number; y1: number }
const hits = (a: Box, b: Box, m = 24) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;

/** A torn or rolled edge round a w × h box (the board's edgePoly): jitter `j` px every `step` px. */
function edged(c: C, x: number, y: number, w: number, h: number, j: number, step: number, seed: number) {
  const R = rng(seed);
  const pts: [number, number][] = [];
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) { const t = i / n; const k = (R() - 0.5) * 2 * j; pts.push([x + x0 + (x1 - x0) * t + nx * k, y + y0 + (y1 - y0) * t + ny * k]); }
  };
  side(0, 0, w, 0, 0, 1); side(w, 0, w, h, 1, 0); side(w, h, 0, h, 0, 1); side(0, h, 0, 0, 1, 0);
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.closePath();
}
/** Turned about a box's centre. */
function turned(c: C, x: number, y: number, w: number, h: number, deg: number, f: () => void) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate((deg * Math.PI) / 180);
  c.translate(-x - w / 2, -y - h / 2);
  f();
  c.restore();
}

/** The wall: the painted plaster photograph, toned toward the scheme's wall. */
function wall(c: C, e: WorldEnv) {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const t = graffitiWall();
  if (!t) return;
  c.drawImage(t, 0, 0, W, H);
  // a scheme's own wall: the plaster multiplied darker, or screened lighter, toward its tone
  if (e.paper === B3.x8E8B84) return;
  c.save();
  c.globalCompositeOperation = isLight(e.paper) ? 'screen' : 'multiply';
  c.globalAlpha = 0.55;
  c.fillStyle = isLight(e.paper) ? mixHex(e.paper, B3.x000000, 0.35) : e.paper;
  c.fillRect(0, 0, W, H);
  c.restore();
}
/** The finish over the page: the board's vignette, clear to 62 % and 22 % dark at the corners. */
function finish(c: C) {
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0.62, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
/** A rolled patch of buff the words are sprayed on: flat, its edge as a roller leaves it. */
function buff(c: C, b: Box, tone: string, seed: number, deg = 0) {
  turned(c, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, deg, () => { edged(c, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 4, 26, seed); c.fillStyle = tone; c.fill(); });
}
interface Fade { tone: string; from: number; to: number; step: number }
/** A wheatpasted screen print: torn edge, flat ink, a halftone fading down from `ht.from` to `ht.to` (px in the poster). */
function paste(c: C, x: number, y: number, w: number, h: number, tone: string, seed: number, deg: number, ht?: Fade, text?: { t: string; px: number; ink: string; dy?: number }, torn = 10) {
  turned(c, x, y, w, h, deg, () => {
    edged(c, x, y, w, h, torn, 18, seed);
    c.fillStyle = tone;
    c.fill();
    c.save();
    edged(c, x, y, w, h, torn, 18, seed);
    c.clip();
    if (ht) halftone(c, x, y, w, h, ht.step, (_px, py) => { const t = (py - y - ht.from) / (ht.to - ht.from); return t < 0 || t > 1 ? 0 : ht.step * 0.62 * (1 - t); }, ht.tone, 45);
    if (text?.t) lines(c, caps(text.t), x + 36, y + 36 + (text.dy ?? 0), text.px, text.ink, w - 60);
    c.restore();
  });
}
/** Big poster caps, broken on spaces into stacked lines (the board's FAN / TASY), each line kept inside `max` px. */
function lines(c: C, t: string, x: number, y: number, px: number, ink: string, max: number) {
  let at = y;
  for (const w of t.split(/\s+/).filter(Boolean)) {
    c.font = CAPS(px);
    const fit = Math.min(px, (px * max) / Math.max(1, c.measureText(w).width));
    at += fit * 0.84;
    label(c, w, x, at, CAPS(fit), ink, fit * 0.02);
  }
}
/** A strip of masking tape over a corner. */
function tape(c: C, x: number, y: number, w: number, deg: number, seed: number) {
  turned(c, x, y, w, 34, deg, () => {
    edged(c, x, y + 1, w, 34, 3, 7, seed);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fill();
    edged(c, x, y, w, 34, 3, 7, seed);
    c.globalAlpha = 0.9;
    c.fillStyle = TAPE;
    c.fill();
    c.globalAlpha = 1;
  });
}
/** A printed sticker: its colour, a white rim, a hard shadow; a rounded card or a disc. */
function sticker(c: C, x: number, y: number, w: number, h: number, bg: string, fg: string, text: string, deg: number, round: 'card' | 'disc', px: number) {
  if (!text) return;
  turned(c, x, y, w, h, deg, () => {
    const shape = (dx: number, dy: number) => { c.beginPath(); if (round === 'disc') c.ellipse(x + w / 2 + dx, y + h / 2 + dy, w / 2, h / 2, 0, 0, Math.PI * 2); else c.roundRect(x + dx, y + dy, w, h, 8); };
    shape(2, 3); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    shape(0, 0); c.fillStyle = RIM; c.fill();
    c.save();
    c.beginPath();
    if (round === 'disc') c.ellipse(x + w / 2, y + h / 2, w / 2 - 5, h / 2 - 5, 0, 0, Math.PI * 2); else c.roundRect(x + 5, y + 5, w - 10, h - 10, 4);
    c.fillStyle = bg; c.fill(); c.clip();
    c.font = CAPS(px);
    const fit = Math.min(px, (px * (w - 24)) / Math.max(1, c.measureText(caps(text)).width));
    label(c, caps(text), x + w / 2, y + h / 2 + fit * 0.34, CAPS(fit), fg, fit * 0.04, 'center');
    c.restore();
  });
}
/** A small sprayed stencil label (board c's 雙截棍 in the patch's corner): the title cut and sprayed like the words. */
function stencilLabel(c: C, text: string, x: number, y: number, px: number, tone: string, seed: number) {
  if (!text) return;
  const m = new OffscreenCanvas(Math.ceil(px * ([...text].length + 1)), Math.ceil(px * 1.6));
  const g = m.getContext('2d')!;
  g.font = FACE(px);
  g.fillStyle = K;
  g.fillText(text, px * 0.3, px * 1.15);
  const cut = stencilled(m, tone, px, seed);
  c.save();
  // (on a mirrored page the label still reads left to right)
  if (c.getTransform().a < 0) { c.translate(x + m.width, y); c.scale(-1, 1); c.drawImage(cut, 0, 0); } else c.drawImage(cut, x, y);
  c.restore();
}

const lyricBox = (e: WorldEnv, fallback: Box): Box => e.rect ?? fallback;
/**
 * Where world-layout puts a set's object for the lyric box `r` (the block with 14 px round it), in the frame's own
 * coordinates: margin `pad`, at least `fill` of the frame, kept in the frame, its canvas rounded up to 12 px
 * (paintObject). A page that draws the same object under it (for a shared shot, where objects are off) draws it exactly
 * there, so the two never show as a seam. On a mirrored page the box is turned back to the frame's.
 */
function objectPlace(c: { getTransform(): DOMMatrix }, r: { x0: number; y0: number; x1: number; y1: number }, pad: [number, number], fill: [number, number] = [0, 0]) {
  const flipped = c.getTransform().a < 0;
  const [x0, x1] = flipped ? [W - r.x1, W - r.x0] : [r.x0, r.x1];
  const [ow, oh] = [Math.max(x1 - x0 - 28 + pad[0] * 2, fill[0] * W), Math.max(r.y1 - r.y0 - 28 + pad[1] * 2, fill[1] * H)];
  const keep = (v: number, half: number, frame: number) => (half >= frame / 2 ? frame / 2 : Math.min(frame - half, Math.max(half, v)));
  const [cx, cy] = [keep((x0 + x1) / 2, ow / 2, W), keep((r.y0 + r.y1) / 2, oh / 2, H)];
  const [w, h] = [Math.ceil(ow / 12) * 12, Math.ceil(oh / 12) * 12];
  return { x: cx - w / 2, y: cy - h / 2, w, h, flipped };
}
/** Draws in the frame's own coordinates, a mirrored page's mirror undone. */
function unmirrored(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, flipped: boolean, f: () => void) {
  c.save();
  if (flipped) { c.translate(W, 0); c.scale(-1, 1); }
  f();
  c.restore();
}
/**
 * A page painted once and kept (b3-shared still), the mirrored page (mirrorGround) included: the kept picture is painted
 * through the mirror itself, so its printed labels are laid the right way round (label() reads the mirror), and drawn
 * without it. Kept as a flipped picture, a mirrored page's prints read backwards.
 */
function page(e: WorldEnv, id: string, paint: (c: OffscreenCanvasRenderingContext2D) => void) {
  const m = !!e.base && e.base.a < 0;
  const cv = still(e, m ? `${id}-r` : id, (c) => { if (m) { c.translate(W, 0); c.scale(-1, 1); } paint(c); });
  const c = e.ctx;
  c.save();
  if (e.base) c.setTransform(e.base);
  if (m) { c.translate(W, 0); c.scale(-1, 1); }
  c.drawImage(cv, 0, 0);
  c.restore();
}
const poster = (e: WorldEnv) => [titleOf(e), artistBy(e)] as const;

/** a: the buff patch the line is sprayed on, two prints wheatpasted beside it, stickers round it. */
const pasteUp: HandGround = (e) => page(e, 'gf-paste-up', (c) => {
  const s = e.slots;
  wall(c, e);
  const r = lyricBox(e, { x0: 190, y0: 240, x1: 1250, y1: 780 });
  const b = { x0: r.x0 - 80, y0: r.y0 - 50, x1: Math.max(r.x0 + 1160, r.x1 + 100), y1: Math.max(r.y0 + 600, r.y1 + 120) };
  const [title, artist] = poster(e);
  // the prints stand right of the patch; a line too wide for them leaves them off
  const px = Math.max(b.x1 - 20, r.x1 + 60);
  const pw = Math.min(470, W - 80 - px);
  if (pw >= 240) {
    paste(c, px, 90, pw, 700, s.accent, 3, 2.2, { tone: mixHex(s.accent, K, 0.32), from: 300, to: 560, step: 18 }, { t: title, px: 150, ink: PAPER }, 9);
    label(c, artist, px + 42, 742, FACE(70), PAPER, 0);
    paste(c, px + 70, 770, Math.min(380, pw - 40), 330, PAPER, 5, -2.5, { tone: s.faint, from: 120, to: 330, step: 14 }, { t: artist, px: 120, ink: K }, 8);
    tape(c, px - 30, 74, 150, -28, 4); tape(c, px + pw - 120, 70, 150, 30, 5); tape(c, px + 270, 750, 120, 24, 6);
  }
  buff(c, b, s.plate, 21, 0.4);
  const free = (x: number, y: number, w: number, h: number) => !hits({ x0: x, y0: y, x1: x + w, y1: y + h }, r, 30);
  if (free(b.x1 - 170, b.y1 - 60, 160, 160)) sticker(c, b.x1 - 170, b.y1 - 60, 160, 160, YEL, K, title, -8, 'disc', 32);
  if (free(b.x0 + 830, b.y1 + 30, 220, 84) && b.y1 + 114 < H) sticker(c, b.x0 + 830, b.y1 + 30, 220, 84, K, PAPER, title, 3, 'card', 46);
  if (free(60, 950, 230, 80)) sticker(c, 60, 950, 230, 80, PAPER, s.ink2, artist, -4, 'card', 44);
  if (free(40, 70, 170, 90)) sticker(c, 40, 70, 170, 90, s.ink2, PAPER, artist, 5, 'card', 56);
  finish(c);
});

/** b: one rolled patch, the line sprayed in navy, a sprayed rule under it; a print with a navy fade at the right. */
const navy: HandGround = (e) => page(e, 'gf-navy', (c) => {
  const s = e.slots;
  wall(c, e);
  const r = lyricBox(e, { x0: 190, y0: 300, x1: 1000, y1: 680 });
  // the patch round the words (and round both lines of a shared shot); a line's own shot gets the set's object over it, the
  // same patch with the sprayed rule, which also stays under a line read on past its cut
  const o = objectPlace(c, r, NAVY_PAD);
  unmirrored(c, o.flipped, () => { c.save(); c.translate(o.x, o.y); buffPatch(c, o.w, o.h, s); c.restore(); });
  const b = { x0: r.x0 + 14 - NAVY_PAD[0], y0: r.y0 + 14 - NAVY_PAD[1], x1: r.x1 - 14 + NAVY_PAD[0], y1: r.y1 - 14 + NAVY_PAD[1] };
  const [title, artist] = poster(e);
  const px = Math.max(1470, b.x1 + 110);
  if (W - 100 - px >= 260) {
    paste(c, px, 200, Math.min(330, W - 100 - px), 560, PAPER, 41, 1.6, { tone: s.plateInk, from: 0, to: 300, step: 14 }, { t: title, px: 62, ink: s.plateInk, dy: 300 }, 8);
    tape(c, px + 20, 184, 120, -14, 42); tape(c, px + 220, 736, 120, -14, 43);
  }
  if (!hits({ x0: 160, y0: 930, x1: 310, y1: 994 }, r)) sticker(c, 160, 930, 150, 64, s.plateInk, PAPER, artist || title, -3, 'card', 34);
  finish(c);
});

/** c: the whole wall pasted over with torn prints, stickers along the top and the foot, one wide patch rolled across. */
const posterWall: HandGround = (e) => page(e, 'gf-poster-wall', (c) => {
  const s = e.slots;
  wall(c, e);
  const R = rng(77 + (e.seed % 5));
  const t = poster(e);
  const P: [number, number, number, number, string, string, string, Fade | undefined][] = [
    [-60, -80, 520, 560, s.accent, t[0], PAPER, { tone: mixHex(s.accent, K, 0.32), from: 260, to: 560, step: 16 }],
    [380, -120, 420, 500, PAPER, t[1], K, { tone: s.faint, from: 200, to: 500, step: 14 }],
    [720, -60, 360, 420, YEL, t[0], K, undefined],
    [1010, -100, 560, 520, K, t[1], YEL, undefined],
    [1480, -60, 500, 640, s.faint, t[0], PAPER, { tone: mixHex(s.faint, K, 0.3), from: 300, to: 640, step: 16 }],
    [-80, 420, 420, 700, PAPER, '', K, { tone: s.ink2, from: 0, to: 700, step: 18 }],
    [260, 700, 520, 460, s.faint, t[1], PAPER, undefined],
    [700, 760, 480, 380, PAPER, t[0], K, { tone: K, from: 200, to: 380, step: 12 }],
    [1120, 700, 420, 440, s.accent, t[1], PAPER, undefined],
    [1460, 560, 520, 600, PAPER, t[0], s.ink2, { tone: s.ink2, from: 240, to: 600, step: 16 }],
  ];
  P.forEach(([x, y, w, h, tone, text, ink, ht], i) => paste(c, x, y, w, h, tone, 100 + i, (R() - 0.5) * 6, ht, text ? { t: text, px: 90 + Math.floor(R() * 60), ink } : undefined, 14));
  // torn remnants of older prints at the seams
  ([[300, 380, 160, 120, YEL], [1380, 420, 140, 140, s.ink2], [880, 320, 180, 90, s.faint], [60, 330, 200, 80, K]] as [number, number, number, number, string][]).forEach(([x, y, w, h, tone], i) => paste(c, x, y, w, h, tone, 300 + i, (R() - 0.5) * 14, undefined, undefined, 18));
  for (let i = 0; i < 9; i++) tape(c, R() * 1800, i < 5 ? R() * 200 : 860 + R() * 160, 90 + R() * 80, (R() - 0.5) * 70, 200 + i);
  const r = lyricBox(e, { x0: 360, y0: 340, x1: 1560, y1: 740 });
  const b = { x0: Math.min(130, r.x0 - 120), y0: r.y0 - 90, x1: Math.max(1790, r.x1 + 120), y1: r.y1 + 90 };
  const st: [string, string, string][] = [[YEL, K, t[1]], [s.faint, PAPER, t[0]], [K, YEL, t[0]], [PAPER, s.ink2, t[1]], [s.ink2, PAPER, t[0]]];
  for (let i = 0; i < 14; i++) {
    const [bg, fg, text] = st[i % 5];
    const [x, y, w, h] = [40 + R() * 1760, i % 2 ? R() * 180 : 880 + R() * 140, 90 + R() * 70, 70 + R() * 50];
    if (hits({ x0: x, y0: y, x1: x + w, y1: y + h }, b, 10)) continue;
    sticker(c, x, y, w, h, bg, fg, text, (R() - 0.5) * 24, i % 3 ? 'card' : 'disc', 24);
  }
  buff(c, b, s.plate, 301, -0.3);
  stencilLabel(c, t[0], b.x0 + 46, b.y0 + 8, 54, s.ink2, 22);
  finish(c);
});

/** The second phrase's strip sits here (world-split: board d's column set apart at 0.474 of the frame). */
export const STRIP_X = 0.474;
/** d: prints down the left and right, the line's two phrases on two tall strips (the first on the set's own strip). */
const strips: HandGround = (e) => page(e, 'gf-strips', (c) => {
  const s = e.slots;
  wall(c, e);
  const [title, artist] = poster(e);
  paste(c, 60, 40, 420, 420, s.accent, 70, -3, { tone: mixHex(s.accent, K, 0.32), from: 200, to: 420, step: 14 }, { t: title, px: 120, ink: PAPER }, 12);
  paste(c, 250, 560, 380, 520, PAPER, 71, 2, { tone: s.faint, from: 220, to: 520, step: 14 }, { t: artist, px: 130, ink: K }, 12);
  paste(c, 1580, 140, 280, 800, s.faint, 63, 0.8, { tone: mixHex(s.faint, K, 0.3), from: 380, to: 800, step: 14 }, { t: title, px: 104, ink: PAPER }, 6);
  tape(c, 1600, 122, 120, -4, 66); tape(c, 1700, 920, 120, 12, 67);
  sticker(c, 380, 360, 180, 180, YEL, K, title, -6, 'disc', 38);
  sticker(c, 120, 600, 230, 90, K, PAPER, artist, 4, 'card', 46);
  sticker(c, 60, 900, 260, 100, PAPER, s.ink2, title, -3, 'card', 62);
  // the first phrase's strip round its column (the set stands it at 0.672 of the frame), and the second phrase's strip
  // only when the line has one: a strip without words would be a bare shape
  const r = e.rect;
  if (r) {
    const hx = 0.672 * W;
    const half = Math.max(60, r.x1 - 14 - hx) + 90;
    const [y0, y1] = [r.y0 + 14 - 36, r.y1 - 14 + 36];
    paste(c, hx - half, y0, half * 2, y1 - y0, PAPER, 61, 0, undefined, undefined, 6);
    tape(c, hx - half + 10, y0 - 18, 120, -8, 64);
  }
  const sx = STRIP_X * W;
  if (r && r.x0 < sx + 60) {
    paste(c, sx - 150, 70, 300, 940, s.ink2, 62, -0.5, undefined, undefined, 6);
    tape(c, sx - 140, 48, 120, 6, 65);
  }
  finish(c);
});

const Gs: Record<string, HandGround> = { 'graffiti/paste-up': pasteUp, 'graffiti/navy-buff': navy, 'graffiti/poster-wall': posterWall, 'graffiti/strips': strips };

/** The calm line's rolled patch (board b), a shade under the buff: the set's object, so a shared shot keeps it. */
const buffPatch = (c: C, w: number, h: number, s: Slots) => {
  edged(c, 6, 6, w - 12, h - 12, 4, 26, 31);
  c.fillStyle = mixHex(s.plate, K, 0.06);
  c.fill();
  // the sprayed rule under the line (board b's 海の広さ): one pass of the second can, the width of the words, 60 px under them
  const [px, py] = NAVY_PAD;
  edged(c, px + 46, h - py + 60, Math.max(200, w - 2 * px - 40), 12, 1.5, 30, 5);
  c.fillStyle = mixHex(s.accent, s.ink2, 0.3);
  c.fill();
};
/** The calm set's object: the patch's face only, inset, under the words; the page draws the whole patch and its rule round it. */
// (it stops short of the sprayed rule, 60 px under the words, which the page draws)
const buffFace: ObjectPaint = (c, w, h, s) => { c.fillStyle = mixHex(s.plate, K, 0.06); c.fillRect(14, 14, w - 28, h - NAVY_PAD[1] + 40 - 14); };
/** The calm patch's margin round its words (world-b3-sets graffiti/navy pad): room under them for the sprayed rule. */
export const NAVY_PAD: [number, number] = [80, 120];

const INS: Record<string, HandIn> = {
  // a fresh sheet of buff is brushed across the wall in four hard strokes, never over the line that lands with it
  'paste-sweep': { sec: 0.32, draw: (e, q) => {
    const c = e.ctx;
    c.save();
    if (e.base) c.setTransform(e.base);
    const r = e.rect;
    if (r) { c.beginPath(); c.rect(0, 0, W, H); c.rect(r.x0 - 24, r.y0 - 24, r.x1 - r.x0 + 48, r.y1 - r.y0 + 48); c.clip('evenodd'); }
    const k = Math.min(3, Math.floor(q * 4));
    c.fillStyle = e.slots.plate;
    c.fillRect((W * k) / 4, 0, W / 4, H);
    c.restore();
  } },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number): Box => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };
const framed = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };

const PIECES: Record<string, Piece> = {
  // stickers are slapped on one by one round the edges, each a little turned, never on the words
  'sticker-slap': { sec: 2, clear: 0, draw: (e, q) => framed(e, (c) => {
    const b = keepOut(e, 30);
    const R = rng(e.seed + 5);
    const [title, artist] = [titleOf(e), artistBy(e)];
    const n = Math.min(5, Math.floor(q * 6));
    for (let i = 0; i < n; i++) {
      const [w, h] = [150 + R() * 60, 70 + R() * 30];
      const [x, y] = [60 + R() * (W - 260), i % 2 ? 40 + R() * 80 : H - 140 - R() * 60];
      if (hits({ x0: x, y0: y, x1: x + w, y1: y + h }, b, 0)) continue;
      sticker(c, x, y, w, h, [YEL, e.slots.ink2, K, e.slots.faint][i % 4], i % 4 === 0 ? K : PAPER, i % 2 ? title : artist || title, (R() - 0.5) * 20, 'card', 34);
    }
  }) },
  // an old print is torn half away at the frame's free side: what is left of it hangs shorter
  'poster-tear': { sec: 1.4, clear: 0, draw: (e, q) => framed(e, (c) => {
    const b = keepOut(e, 40);
    const left = b.x0 > W - b.x1;
    const w = Math.min(340, left ? b.x0 - 40 : W - b.x1 - 40);
    if (w < 160) return;
    const x = left ? 20 : W - 20 - w;
    const k = ease(clamp01(q * 1.6), 3);
    paste(c, x, 120, w, 760 * (1 - 0.45 * k), e.slots.accent, e.seed + 17, left ? -2 : 2, { tone: mixHex(e.slots.accent, K, 0.32), from: 200, to: 600, step: 16 }, { t: titleOf(e), px: 90, ink: PAPER }, 16);
  }) },
  // the roller pushes a fresh band of buff along the free foot (or head) of the wall in hard steps
  'buff-roll': { sec: 1.2, clear: 0, draw: (e, q) => framed(e, (c) => {
    const b = keepOut(e, 30);
    const y = b.y1 + 20 < H - 130 ? H - 120 : b.y0 - 20 > 130 ? 20 : -1;
    if (y < 0) return;
    const w = (W * Math.ceil(clamp01(q * 1.4) * 5)) / 5;
    edged(c, -10, y, w, 100, 4, 26, e.seed + 9);
    c.fillStyle = e.slots.plate;
    c.fill();
  }) },
};

export const GRAFFITI = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'gf-buff': buffFace } as Record<string, ObjectPaint> };
