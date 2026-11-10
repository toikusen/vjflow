// scrapbook, from its board (2026-11-06, 風格第5批設計稿/scrapbook a–d; source out/research/boards-b5/boards/scrapbook.html):
// an album page with patterned papers laid on it (gingham, dots, ticking, stripes), each with a hard shadow; a card held in
// black photo corners, a torn paper with its white fibre core, ruled index cards, a stitched edge, washi tape that never
// carries a word, a ticket stub and a manila tag that carry the small print, gold star stickers. The words are die-cut
// letter stickers (world-glyph-b5b): one style of letter, white backing, grey cut line, hard shadow. Kept apart from xerox
// (black toner, cut-out ransom letters of mixed faces): colour papers, one even sticker alphabet, nothing photocopied. No
// polaroid, no tape that carries words, no hanging tag with a column of words (JIZURA's). Small print: the song's title and
// artist in its opening only (world-title.ts), then the line's part and start time.
import type { Piece } from './world-pieces';
import { clamp01, ease, HandGround, HandIn, isLight, mixHex, WorldEnv } from './world-craft';
import { C, mirrorGround, onPage, rng, still } from './world-b3-shared';
import { B5B } from './b5b-inks';
import { B5B_MIRRORED, SET_BANDS } from './world-b5b-sets';
import { declareCarrier, toPx } from './carrier-fit';
import { Box, dataRows, frame, H, isJa, meets, page, small, twoPhrases, W } from './world-b5b-shared';

type Pt = [number, number];
const TK = (px: number, ja: boolean, w = 500) => `${w} ${px}px ${ja ? '"M PLUS Rounded 1c"' : '"Noto Sans HK"'}, "Noto Sans TC", sans-serif`;
const SHADOW = 'rgba(40,30,20,0.28)';

/** A wobbly edge along a polygon (the board's `wobble`), from a seeded walk: hand-torn paper. */
function torn(pts: Pt[], amp: number, seed: number, step = 6): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [];
  let o = 0;
  pts.forEach(([x0, y0], k) => {
    const [x1, y1] = pts[(k + 1) % pts.length];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(L / step));
    const [nx, ny] = [-(y1 - y0) / L, (x1 - x0) / L];
    for (let i = 0; i < n; i++) { o = o * 0.7 + (r() - 0.5) * amp * 0.9; const t = i / n; out.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); }
  });
  return out;
}
const poly = (c: C, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
/** A paper rectangle, turned `rot` degrees about its centre, its hard shadow (4, 6) under it; `paint` fills it in its own frame. */
function sheet(c: C, x: number, y: number, w: number, h: number, rot: number, paint: (c: C) => void, shadow = true) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate((rot * Math.PI) / 180);
  c.translate(-w / 2, -h / 2);
  if (shadow) { c.fillStyle = SHADOW; c.fillRect(4, 6, w, h); }
  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  paint(c);
  c.restore();
  c.restore();
}
const gingham = (c: C, w: number, h: number, col: string, paper: string, cell = 44) => {
  c.fillStyle = paper;
  c.fillRect(0, 0, w, h);
  c.fillStyle = col;
  c.globalAlpha = 0.42;
  for (let x = 0; x < w; x += cell) c.fillRect(x, 0, cell / 2, h);
  for (let y = 0; y < h; y += cell) c.fillRect(0, y, w, cell / 2);
  c.globalAlpha = 1;
};
const dots = (c: C, w: number, h: number, ground: string, dot: string, step = 40, r = 4.2) => {
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  c.fillStyle = dot;
  for (let y = 0; y < h + step; y += step) for (let x = 0; x < w + step; x += step) for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.75]]) { c.beginPath(); c.arc(x + dx * step, y + dy * step, r, 0, 7); c.fill(); }
};
const ticking = (c: C, w: number, h: number, paper: string, col: string) => { c.fillStyle = paper; c.fillRect(0, 0, w, h); c.fillStyle = col; for (let x = 0; x < w; x += 30) { c.fillRect(x, 0, 5, h); c.fillRect(x + 11, 0, 2, h); } };
const ruled = (c: C, w: number, h: number, head: string) => { c.fillStyle = B5B.xFBF8F0; c.fillRect(0, 0, w, h); c.fillStyle = B5B.xB7CBE0; for (let y = 44; y < h; y += 46) c.fillRect(0, y, w, 2); c.fillStyle = head; c.fillRect(0, 46, w, 3); };
/** A stitched edge: a dashed thread inset in a sheet (board: dash 13 / 9, 3 px). */
const stitch = (c: C, w: number, h: number, inset: number, col: string) => { c.save(); c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([13, 9]); c.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset); c.restore(); };
/** Black photo corners holding a card, each with its paper-crease highlight. */
const corners = (c: C, w: number, h: number, s = 64) => {
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    c.fillStyle = B5B.x1E1D24;
    c.beginPath(); c.moveTo(cx - dx * 6, cy - dy * 6); c.lineTo(cx + dx * s, cy - dy * 6); c.lineTo(cx - dx * 6, cy + dy * s); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx + dx * (s - 14), cy - dy * 2); c.lineTo(cx - dx * 2, cy + dy * (s - 14)); c.stroke();
  }
};
/** Translucent washi tape with zigzag ends; it holds paper down and never carries a word. */
function tape(c: C, x: number, y: number, w: number, h: number, rot: number, kind: 0 | 1) {
  c.save();
  c.translate(x, y);
  c.rotate((rot * Math.PI) / 180);
  c.beginPath();
  c.moveTo(0, -h / 2); c.lineTo(w, -h / 2);
  for (let i = 1; i <= 6; i++) c.lineTo(w + (i % 2 ? 7 : 0), -h / 2 + (h * i) / 6);
  c.lineTo(0, h / 2);
  for (let i = 5; i >= 0; i--) c.lineTo(i % 2 ? -7 : 0, -h / 2 + (h * i) / 6);
  c.closePath();
  c.clip();
  c.globalAlpha = 0.86;
  if (kind === 0) { c.fillStyle = B5B.xE8B547; c.fillRect(-10, -h, w + 20, 2 * h); c.fillStyle = B5B.xF3D27E; for (let k = -h * 2; k < w + h; k += 24) { c.beginPath(); c.moveTo(k, -h); c.lineTo(k + 10, -h); c.lineTo(k + 10 + 2 * h, h); c.lineTo(k + 2 * h, h); c.fill(); } }
  else { c.fillStyle = B5B.x9FC2B6; c.fillRect(-10, -h, w + 20, 2 * h); c.fillStyle = B5B.xF4F0E6; for (let k = 11; k < w; k += 22) for (let j = -h / 2 + 11; j < h / 2; j += 22) { c.beginPath(); c.arc(k, j, 3.4, 0, 7); c.fill(); } }
  c.restore();
}
/** A ticket stub with a perforated end; its rows are the song's own data. */
function ticket(c: C, e: WorldEnv, x: number, y: number, w: number, h: number, rot: number) {
  const d = dataRows(e);
  const ja = isJa(e);
  sheet(c, x, y, w, h, rot, (g) => {
    g.fillStyle = B5B.xF3E6C4;
    g.fillRect(0, 0, w, h);
    g.fillStyle = mixHex(e.slots.ground, B5B.x000000, 0.1);
    for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(0, (h * (i + 0.5)) / 10, h / 30, 0, 7); g.fill(); }
    g.strokeStyle = B5B.xB3261E; g.lineWidth = 2.5; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = 'rgba(60,40,20,0.45)';
    for (let yy = 22; yy < h - 14; yy += 14) { g.beginPath(); g.arc(w - 120, yy, 2.6, 0, 7); g.fill(); }
    const rows = [d.title ? [d.title, 38, B5B.xB3261E, 700] : undefined, d.artist ? [d.artist, 28, B5B.x1E1D24, 500] : undefined, d.part ? [d.part, 28, B5B.x1E1D24, 500] : undefined].filter(Boolean) as [string, number, string, number][];
    let yy = 34;
    for (const [t, px, ink, wt] of rows) { yy += px; small(g, t, 36, yy, TK(px, ja, wt), px, ink); yy += px * 0.3; }
  });
}
/** A manila tag on a string, an eyelet at its end; its rows are the song's own data. */
function tag(c: C, e: WorldEnv, x: number, y: number, w: number, h: number, rot: number) {
  const d = dataRows(e);
  const ja = isJa(e);
  c.save();
  c.translate(x, y);
  c.rotate((rot * Math.PI) / 180);
  const k = 34;
  const shape = () => { c.beginPath(); c.moveTo(k, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(k, h); c.lineTo(0, h - k); c.lineTo(0, k); c.closePath(); };
  c.save(); c.translate(4, 6); shape(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill(); c.restore();
  shape(); c.fillStyle = B5B.xE6CFA0; c.fill();
  c.strokeStyle = B5B.xEDE3CF; c.lineWidth = 4;
  c.beginPath(); c.moveTo(46, h / 2); c.bezierCurveTo(-40, h / 2 - 30, -120, h / 2 + 60, -260, h / 2 + 20); c.stroke();
  c.fillStyle = B5B.xB88A3E; c.beginPath(); c.arc(46, h / 2, 15, 0, 7); c.fill();
  c.fillStyle = e.slots.ground; c.beginPath(); c.arc(46, h / 2, 8, 0, 7); c.fill();
  const rows = [d.title ? [d.title, 34, 700] : undefined, d.artist ? [d.artist, 28, 500] : undefined, d.part ? [d.part, 28, 500] : undefined].filter(Boolean) as [string, number, number][];
  let yy = 18;
  for (const [t, px, wt] of rows) { yy += px; small(c, t, 84, yy, TK(px, ja, wt), px, B5B.x1E1D24); yy += px * 0.3; }
  c.restore();
}
/** A gold star sticker: die-cut white edge, hard shadow, the star. */
function star(c: C, cx: number, cy: number, r: number, rot: number, s = 1) {
  const path = () => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = ((i * 36 + rot) * Math.PI) / 180; const rr = (i % 2 ? r * 0.45 : r) * s; c.lineTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); } c.closePath(); };
  c.save();
  c.lineJoin = 'round';
  c.translate(2, 3); path(); c.lineWidth = 14 * s; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke(); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
  c.translate(-2, -3); path(); c.strokeStyle = B5B.xFFFFFF; c.stroke(); c.fillStyle = B5B.xFFFFFF; c.fill();
  path(); c.fillStyle = B5B.xD9A93A; c.fill();
  c.restore();
}
/** A torn paper: the fibre core shows white round the colour, the hard shadow under it. */
function tornPaper(c: C, pts: Pt[], fill: string, amp: number, seed: number) {
  const a = torn(pts, amp, seed);
  c.save(); c.translate(4, 6); poly(c, a); c.fillStyle = SHADOW; c.fill(); c.restore();
  for (const [dx, dy] of [[-2, -2], [2, 2]]) { c.save(); c.translate(dx, dy); poly(c, a); c.fillStyle = B5B.xF6F1E6; c.fill(); c.restore(); }
  poly(c, torn(pts, amp * 0.8, seed + 7));
  c.fillStyle = fill;
  c.fill();
}
const paperGrain = (c: C, seed: number) => { const r = rng(seed); c.fillStyle = 'rgba(60,40,20,0.05)'; for (let i = 0; i < 9000; i++) c.fillRect(r() * W, r() * H, 2, 2); };
const keyOf = (e: WorldEnv) => [e.item?.part, e.item?.at].join('|');

/** a: a gingham panel stitched to the page, a cream card in photo corners for the first phrase; the ticket with the data. */
const cardPage: HandGround = (e) => { page(e, 'scrap-card', (c) => {
  const s = e.slots;
  c.fillStyle = s.ground; c.fillRect(0, 0, W, H);
  sheet(c, 200, 170, 1500, 800, -1.2, (g) => { gingham(g, 1500, 800, s.ink2, s.faint); stitch(g, 1500, 800, 22, B5B.xFBF7EE); });
  sheet(c, 230, 236, 1330, 336, 1, (g) => { g.fillStyle = s.faint; g.fillRect(0, 0, 1330, 336); });
  c.save(); c.translate(230 + 665, 236 + 168); c.rotate(Math.PI / 180); c.translate(-665, -168); corners(c, 1330, 336); c.restore();
  ticket(c, e, 1340, 836, 520, 200, -6);
  tape(c, 1800, 800, 130, 48, 38, 0);
  paperGrain(c, 3);
}, keyOf(e)); declareCarrier(e, SET_BANDS['scrapbook/card'].filter((b) => b.part !== 'small' || twoPhrases(e)).map((b) => toPx(b.box)), []); };

/** b: a dotted page, a torn paper laid across it for the line, three gold stars, the manila tag. */
const dotsPage: HandGround = (e) => { page(e, 'scrap-dots', (c) => {
  const s = e.slots;
  dots(c, W, H, s.ground, mixHex(s.faint, s.ground, 0.15));
  tornPaper(c, [[180, 250], [1700, 236], [1712, 860], [190, 880]], s.ink2, 9, 4);
  for (const [x, y, r, a] of [[1600, 290, 34, 8], [1690, 370, 22, -12], [1560, 430, 16, 20]]) if (!meets({ x0: x - r - 10, y0: y - r - 10, x1: x + r + 10, y1: y + r + 10 }, e.rect, 8)) star(c, x, y, r, a);
  tag(c, e, 1240, 760, 470, 190, -4);
  paperGrain(c, 4);
}, keyOf(e)); };

/** c: the whole spread: ticking, dots, gingham and a red sheet overlapping, a torn cream banner across them, two tapes at its ends. */
const spreadPage: HandGround = (e) => { page(e, 'scrap-spread', (c) => {
  const s = e.slots;
  c.fillStyle = mixHex(s.faint, s.ink2, 0.2); c.fillRect(0, 0, W, H);
  sheet(c, -40, -30, 820, 560, 2.5, (g) => ticking(g, 820, 560, s.faint, mixHex(s.ground, B5B.x24365C, 0.6)));
  sheet(c, 1080, -40, 900, 520, -2, (g) => dots(g, 900, 520, B5B.x24365C, B5B.xE9DFC9));
  sheet(c, 1160, 560, 820, 560, 3, (g) => gingham(g, 820, 560, s.ink2, s.faint));
  sheet(c, -30, 600, 720, 520, -3, (g) => { g.fillStyle = s.ground; g.fillRect(0, 0, 720, 520); });
  tornPaper(c, [[120, 330], [1800, 300], [1810, 760], [110, 790]], B5B.xFBF8F0, 12, 9);
  tape(c, 90, 330, 160, 54, -24, 1);
  tape(c, 1700, 280, 170, 54, 22, 0);
  ticket(c, e, 1330, 840, 500, 200, -5);
  paperGrain(c, 5);
}, keyOf(e)); };

/** d: a striped page, two ruled index cards overlapping, a wire clip, tapes; the data in a line under them. */
const indexPage: HandGround = (e) => { page(e, 'scrap-index', (c) => {
  const s = e.slots;
  c.fillStyle = s.ground; c.fillRect(0, 0, W, H);
  c.fillStyle = mixHex(s.ground, B5B.x000000, 0.08);
  for (let x = -60; x < W + 60; x += 120) c.fillRect(x, 0, 60, H);
  sheet(c, 170, 230, 1260, 330, -2, (g) => ruled(g, 1260, 330, B5B.xD97C7C));
  sheet(c, 480, 580, 1340, 330, 1.6, (g) => ruled(g, 1340, 330, B5B.xD97C7C));
  c.save(); c.strokeStyle = B5B.x9DA3AD; c.lineWidth = 7; c.lineCap = 'round';
  c.beginPath(); c.moveTo(250, 320); c.lineTo(250, 218); c.arc(268, 218, 18, Math.PI, 0); c.lineTo(286, 350); c.arc(260, 350, 26, 0, Math.PI); c.lineTo(234, 240); c.stroke(); c.restore();
  tape(c, 1400, 220, 150, 50, 34, 1);
  tape(c, 1790, 600, 150, 50, 36, 0);
  small(c, [dataRows(e).artist, dataRows(e).title, dataRows(e).part].filter(Boolean).join('　'), 200, 960, TK(34, isJa(e)), 34, isLight(s.ground) ? s.ink : s.faint);
  paperGrain(c, 6);
}, keyOf(e)); declareCarrier(e, SET_BANDS['scrapbook/index'].filter((b) => b.part !== 'small' || twoPhrases(e)).map((b) => toPx(b.box)), []); };

const Gs: Record<string, HandGround> = { 'scrapbook/card': cardPage, 'scrapbook/dots': dotsPage, 'scrapbook/spread': spreadPage, 'scrapbook/index': indexPage };
for (const [id, page] of Object.entries(B5B_MIRRORED)) if (Gs[page]) Gs[id] = mirrorGround(Gs[page]);

const INS: Record<string, HandIn> = {
  // a change of part turns the album's page: the old leaf lifts away to the right, its edge throwing a hard shadow
  'album-turn': { sec: 0.5, draw: (e, q) => frame(e, (c) => {
    const x = W * ease(q, 2);
    if (x >= W) return;
    c.fillStyle = SHADOW;
    c.fillRect(x - 10, 0, 10, H);
    c.fillStyle = e.slots.faint;
    c.fillRect(x, 0, W - x, H);
    c.fillStyle = mixHex(e.slots.faint, B5B.x000000, 0.06);
    c.fillRect(x, 0, 18, H);
  }) },
};

/** Free spots for a set piece, away from the words. */
const freeSpot = (e: WorldEnv, spots: Pt[], r: number) => spots.find(([x, y]) => !meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r } as Box, e.rect, 24));
const PIECES: Record<string, Piece> = {
  // gold star stickers pressed on one at a time, each landing from a little above the page
  'star-stickers': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const R = rng(e.seed + 31);
    const spots: Pt[] = [[220, 180], [1700, 170], [1720, 900], [200, 900], [960, 120], [1800, 520], [120, 520]];
    let n = 0;
    for (const [x, y] of spots) {
      if (n >= 4 || meets({ x0: x - 50, y0: y - 50, x1: x + 50, y1: y + 50 }, e.rect, 24)) continue;
      const k = clamp01(q * 5 - n * 0.8);
      n++;
      if (k <= 0) continue;
      star(c, x, y, 26 + R() * 14, (R() - 0.5) * 40, 1 + 0.3 * (1 - ease(k, 3)));
    }
  }) },
  // a second ticket stub is slipped onto the page in a free corner, with the line's part and time on it
  'ticket-stub': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1560, 160], [330, 160], [330, 930], [1560, 930]], 230);
    if (!at) return;
    const k = ease(q / 0.3, 3);
    c.save();
    c.globalAlpha = 1 - clamp01((q - 0.88) / 0.12);
    ticket(c, { ...e, now: e.now + 1e6 }, at[0] - 220 + (1 - k) * 60, at[1] - 90, 440, 180, at[0] > W / 2 ? 5 : -5);
    c.restore();
  }) },
  // a pressed leaf laid in a free corner under a strip of tape
  'pressed-leaf': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1660, 820], [260, 820], [1660, 250], [260, 250]], 200);
    if (!at) return;
    const k = ease(q / 0.3, 2);
    c.save();
    c.globalAlpha = Math.min(k, 1 - clamp01((q - 0.88) / 0.12));
    c.translate(at[0], at[1]);
    c.rotate(at[0] > W / 2 ? -0.5 : 0.5);
    const leaf = () => { c.beginPath(); c.moveTo(0, -150); c.bezierCurveTo(90, -90, 90, 70, 0, 150); c.bezierCurveTo(-90, 70, -90, -90, 0, -150); c.closePath(); };
    c.save(); c.translate(4, 6); leaf(); c.fillStyle = SHADOW; c.fill(); c.restore();
    leaf(); c.fillStyle = B5B.x6E8A4E; c.fill();
    c.strokeStyle = B5B.xC9D6A6; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -140); c.lineTo(0, 170); for (let i = -3; i <= 3; i++) { c.moveTo(0, i * 36); c.lineTo(48, i * 36 - 30); c.moveTo(0, i * 36); c.lineTo(-48, i * 36 - 30); } c.stroke();
    tape(c, -70, 20, 140, 44, -8, 1);
    c.restore();
  }) },
};

export const SCRAP = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
