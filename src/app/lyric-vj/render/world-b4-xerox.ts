// xerox, from its boards (2026-11-05, 風格第4批設計稿/xerox a–d, source out/research/boards-b4/boards/xerox.html): a punk
// flyer or zine made on a photocopier. Headline strips cut from a newspaper's mincho, pasted down and copied onto fluoro
// stock: each strip's cut edge survives the copy as a hard dark line with a (3, 3) hard shadow; the lid left open leaves a
// black band with the lamp's grey bands in it and toner specks piling up within 160 px of it; a newspaper photo's screen
// blown up into a halftone disc; a scan streak for a horizon; the original dragged on the glass so the last character's
// edge pulls out into toner rows. Unlike brutalist (a clean poster on a grid with a type area, heads and a red band) there
// is no grid and no head: cut, pasted, off-square, the lid's black and the drag. Real data only: the song's title and
// artist in Courier on a strip, in the opening only (titleNow).
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, hash, kept, mixHex, ObjectPaint, W, WorldEnv } from './world-craft';
import { artistBy, C, halftone, label, rng, titleOf } from './world-b3-shared';
import { B4 } from './b4-inks';

const TONER = B4.x141414;
const LID = B4.x121212;
const GLASS = B4.x151515;
const COURIER = (px: number) => `700 ${px}px "Courier Prime", "Noto Sans TC", monospace`;
type Box = { x0: number; y0: number; x1: number; y1: number };
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const beatOf = (now: number, bpm = 120) => { const b = (now * Math.max(60, bpm)) / 60; return { idx: Math.floor(b), since: ((b - Math.floor(b)) * 60) / Math.max(60, bpm) }; };
/** The opening's data line, in Courier: title, artist. */
const data = (e: WorldEnv, sep: string) => [titleOf(e), artistBy(e)].filter(Boolean).join(sep);

/**
 * The copy's toner, made once a page: sparse specks over the sheet, specks piled up along the open lid's edge (within
 * 160 px, thickest at it), a few clusters, the lamp's streaks; the lid's black with its grey lamp bands.
 */
const toner = (key: string, dens: number, lid: [number, number] | undefined, streaks: [number, number, number][]) => kept(`xx-toner|${key}`, W, H, (c) => {
  const R = rng(7 + key.length);
  c.fillStyle = TONER;
  for (let i = 0; i < 700 * dens; i++) { const s = 1 + R() * 1.4; c.fillRect(R() * W, R() * H, s, s); }
  if (lid) {
    const edge = lid[0] > 0 ? lid[0] : lid[1];
    const dir = lid[0] > 0 ? -1 : 1;
    for (let i = 0; i < 2600 * dens; i++) { const d = R() ** 2.4 * 160; const s = 1 + R() * 2.2; c.fillRect(edge + dir * d, R() * H, s, s * (0.5 + R())); }
  }
  for (let i = 0; i < 9 * dens; i++) { const [x, y] = [R() * W, R() * H]; for (let j = 0; j < 12; j++) c.fillRect(x + (R() - 0.5) * 18, y + (R() - 0.5) * 10, 1.5 + R() * 1.5, 1.5 + R() * 1.5); }
  streaks.forEach(([x, w, a]) => { c.globalAlpha = a; c.fillRect(x, 0, w, H); c.globalAlpha = 1; });
  if (lid) lidBand(c, lid[0], lid[1], R);
});
function lidBand(c: C, x0: number, x1: number, R: () => number) {
  c.fillStyle = LID;
  c.fillRect(x0, 0, x1 - x0, H);
  for (let y = 0; y < H; y += 2) if (R() < 0.35) { const g = 18 + Math.floor(R() * 26); c.fillStyle = `rgb(${g},${g},${g})`; c.fillRect(x0, y, x1 - x0, 1 + Math.floor(R() * 3)); }
}
/** Paper fibre multiplied over the copy (the board's Paper001 at 35 %, here a generated mottle), made once. */
const fibre = () => kept('xx-fibre', W, H, (c) => {
  const R = rng(19);
  for (let i = 0; i < 9000; i++) { c.globalAlpha = 0.03 + 0.05 * R(); c.fillStyle = TONER; c.fillRect(R() * W, R() * H, 1 + R() * 3, 1); }
  c.globalAlpha = 1;
});
/** The blown-up screen of a newspaper photo of a round light: dots grow toward its lit side. */
function disc(c: C, cx: number, cy: number, r: number, step: number, ang: number) {
  halftone(c, cx - r, cy - r, 2 * r, 2 * r, step, (x, y) => { const d = Math.hypot(x - cx, y - cy); if (d > r) return 0; const t = ((x - cx) + (y - cy)) / (r * Math.SQRT2) * 0.5 + 0.5; return step * 0.5 * Math.min(1, 0.12 + 0.95 * t); }, TONER, ang);
}
/** A pasted strip: its hard (3, 3) shadow, the copy-white face, the cut edge left on the copy as a 2 px dark line. */
function strip(c: C, x: number, y: number, w: number, h: number, deg: number, face: string) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate((deg * Math.PI) / 180);
  c.fillStyle = 'rgba(20,20,20,0.55)';
  c.fillRect(-w / 2 + 3, -h / 2 + 3, w + 1, h + 1);
  c.fillStyle = face;
  c.fillRect(-w / 2, -h / 2, w, h);
  c.lineWidth = 2;
  c.strokeStyle = B4.x2A2A2A;
  c.strokeRect(-w / 2, -h / 2, w, h);
  c.restore();
}
/** The sheet's colour now: the scheme's stock; on a loud page every second bar the next fluoro stock (board motion). */
const STOCKS = [B4.xF1E64A, B4.xF27DB4, B4.xF2F1EC, B4.xB9E27A, B4.xF6A75A];
function stock(e: WorldEnv, swap: boolean) {
  if (!swap || e.level < 0.66) return e.paper;
  const bar = Math.floor(beatOf(e.now, e.bpm).idx / 8);
  if (bar % 2 === 0) return e.paper;
  const i = STOCKS.indexOf(e.paper.toUpperCase());
  return STOCKS[(i + 1 + (bar % 3)) % STOCKS.length] ?? e.paper;
}

/** a: fluoro stock, the lid open at the right; the halftone disc behind the first strip; the second strip below it; the data strip low left. */
const strips: HandGround = (e) => frame(e, (c) => {
  c.fillStyle = stock(e, true);
  c.fillRect(0, 0, W, H);
  c.drawImage(toner('a', 1, [1640, W], [[410, 2, 0.5], [1180, 1, 0.6]]), 0, 0);
  disc(c, 1420, 300, 330, 28, 45);
  const r = e.rect;
  // the second strip only under a line split onto it
  // (it grows down round a second part that took two rows)
  if (r && r.y1 > 0.53 * H) strip(c, 520, 560, 960, Math.max(270, r.y1 + 30 - 560), 1.1, e.slots.plate);
  const d = data(e, ' / ');
  if (d && (!r || r.y1 < 860)) { strip(c, 156, 880, Math.min(900, 120 + d.length * 26), 64, -0.6, e.slots.plate); label(c, d, 178, 924, COURIER(30), TONER, 1.8); }
  c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(fibre(), 0, 0); c.restore();
});

/** b: white stock blown out by the lamp; a scan streak lies under the line like a horizon; one burnt pinhole for a star. */
const blown: HandGround = (e) => frame(e, (c) => {
  c.fillStyle = mixHex(e.paper, B4.xF7F6F2, 0.82);
  c.fillRect(0, 0, W, H);
  c.drawImage(toner('b', 0.55, undefined, [[1460, 1, 0.35]]), 0, 0);
  const R = rng(23);
  c.fillStyle = TONER;
  for (let i = 0; i < 9; i++) { const y = 700 + i * 7 + Math.floor(R() * 3); const [x0, x1] = [120 + R() * 200, 1780 - R() * 260]; c.fillRect(x0, y, x1 - x0, i % 3 === 0 ? 3 : 1.5); }
  // the horizon's main line runs out with the lamp as the cut goes on (calm motion), never past its length
  c.fillRect(120, 760, 1660 * Math.min(1, 0.6 + e.age / 3), 6);
  c.beginPath(); c.arc(1520, 240, 9, 0, Math.PI * 2); c.fill();
  for (let j = 0; j < 22; j++) c.fillRect(1520 + (R() - 0.5) * 60, 240 + (R() - 0.5) * 60, 2, 2);
  const r = e.rect;
  if (r && r.y1 > 0.47 * H) strip(c, 560, 470, 640, Math.max(150, Math.min(680, r.y1 + 24) - 470), 0.4, e.slots.plate);
  const t = titleOf(e);
  if (t) label(c, t, 1500, 956, COURIER(26), B4.x3A3A3A, 1.5);
  c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(fibre(), 0, 0); c.restore();
});

/**
 * The drag: rows of toner pulled out to the right from the words' right edge, longer the louder the part, each row breaking
 * up toward its end; never back over the words (the drag page sets its line in one row, world-b4-sets xerox/drag).
 */
function drag(c: C, r: Box, level: number, pulse: number, until: number) {
  const R = rng(Math.round(r.y0));
  const reach = (0.55 + 0.45 * level) * (1 + 0.12 * pulse);
  const h = r.y1 - r.y0;
  const [y0, y1] = [r.y0 + h * 0.1, r.y1 - h * 0.08];
  c.fillStyle = TONER;
  const x0 = r.x1 + 4;
  for (let y = Math.round(y0); y < y1; y++) {
    // in thin bands, as the strokes that reach the edge are: some runs of rows drag, the rows between them do not
    if (hash(Math.floor(y / 4), 3) < 0.55 || R() > 0.7) continue;
    const L = Math.min((120 + 320 * Math.abs(Math.sin(y * 0.019 + 1)) + R() * 60) * reach, until - x0);
    if (L <= 0) continue;
    // the solid run, then the toner thinning out into dashes toward its end
    const solid = L * (0.25 + 0.3 * R());
    c.fillRect(x0, y, solid, 1);
    for (let x = x0 + solid; x < x0 + L; ) { const run = 4 + R() * 26 * (1 - (x - x0) / L); if (R() > 0.35) c.fillRect(x, y, run, 1); x += run + 2 + R() * 10; }
  }
}
/** c: a copy page off-square on the black glass, the lamp's bands in the black; one word on it, dragged in a loud part. */
const dragPage: HandGround = (e) => frame(e, (c) => {
  c.drawImage(kept('xx-glass', W, H, (g) => { g.fillStyle = GLASS; g.fillRect(0, 0, W, H); const R = rng(31); for (let y = 0; y < H; y += 2) if (R() < 0.3) { const v = 20 + Math.floor(R() * 24); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, W, 1 + Math.floor(R() * 2)); } }), 0, 0);
  c.save();
  c.translate(90, 150);
  c.rotate(-0.012);
  c.fillStyle = e.slots.plate;
  c.fillRect(0, 0, 1720, 770);
  c.restore();
  c.drawImage(toner('c', 0.7, undefined, []), 0, 0);
  const r = e.rect;
  if (r && e.level >= 0.5) drag(c, r, e.level, e.pulse, 1790);
  const d = data(e, ' ─ ');
  if (d && (!r || r.y1 < 800)) label(c, d, 160, 872, COURIER(30), TONER, 1.8);
  c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.7; c.drawImage(fibre(), 0, 0); c.restore();
});

/** Where board d's strips stand (world-b4-sets xerox/columns): the first phrase on the right strip, the second on the left. */
export const COLUMN_STRIPS: [number, number, number, number, number][] = [[1336, 86, 196, 900, 1], [1090, 60, 196, 970, -1.2]];
/** d: pink stock, the lid open at the left; a big halftone disc; the line's two phrases down two strips at the right. */
const columns: HandGround = (e) => frame(e, (c) => {
  c.fillStyle = stock(e, false);
  c.fillRect(0, 0, W, H);
  c.drawImage(toner('d', 0.8, [0, 240], [[760, 2, 0.4]]), 0, 0);
  disc(c, 640, 560, 400, 30, 15);
  const r = e.rect;
  if (r) {
    const [[x1, y1, w1, h1, d1], [x2, y2, w2, h2, d2]] = COLUMN_STRIPS;
    // (a strip always reaches past the words it carries, a long column included)
    const reach = (y: number, h: number) => Math.max(h, Math.min(H - 20, r.y1 + 34) - y);
    if (r.x0 < x2 + w2 + 40) strip(c, x2, y2, w2, reach(y2, h2), d2, e.slots.plate);
    strip(c, x1, y1, w1, reach(y1, h1), d1, e.slots.plate);
  }
  const d = data(e, ' — ').toUpperCase();
  // (read down the page's edge; left off a mirrored page, where it would read backwards)
  if (d && c.getTransform().a > 0) { c.save(); c.translate(1626, 110); c.rotate(Math.PI / 2); label(c, d, 0, 0, COURIER(26), TONER, 2); c.restore(); }
  c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(fibre(), 0, 0); c.restore();
});

const Gs: Record<string, HandGround> = { 'xerox/strips': strips, 'xerox/blown': blown, 'xerox/drag': dragPage, 'xerox/columns': columns };

/** The headline strip the line's first part is pasted on (world-b4-sets `xx-strip`): turned a hair, cut edge and hard shadow. */
const xxStrip: ObjectPaint = (c, w, h, s, seed) => {
  const deg = [-0.8, 0.6, -0.5, 0.9][seed % 4];
  strip(c, 0, 0, w, h, deg, s.plate);
};

const keepOut = (e: WorldEnv, m: number): Box => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };
const outside = (c: C, b: Box) => { c.beginPath(); c.rect(0, 0, W, H); c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c.clip('evenodd'); };

const INS: Record<string, HandIn> = {
  // the copier's lamp passes left to right: a white bar with its grey edges, the new copy behind it and plain stock ahead.
  // Never over the words
  'lamp-pass': { sec: 0.42, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const x = -200 + (W + 400) * ease(q, 2);
    c.save();
    if (e.rect) outside(c, keepOut(e, 24));
    // ahead of the lamp the glass shows plain stock; behind it, the new copy
    c.fillStyle = e.paper;
    c.fillRect(x + 84, 0, W, H);
    c.fillStyle = B4.xFBFBF8;
    c.fillRect(x - 70, 0, 140, H);
    c.fillStyle = B4.x9A9A96;
    c.fillRect(x - 84, 0, 10, H);
    c.fillRect(x + 74, 0, 10, H);
    c.restore();
  }) },
};

const PIECES: Record<string, Piece> = {
  // toner sprays out from round the pasted words in hard specks, thick near them and thinning out, and stays
  'toner-spray': { sec: 1.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 40);
    const R = rng(e.seed + 5);
    const k = ease(clamp01(q / 0.5), 2);
    const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const [rx, ry] = [(b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2];
    c.save();
    outside(c, b);
    c.fillStyle = TONER;
    for (let i = 0; i < 2600; i++) {
      const a = R() * Math.PI * 2;
      const d = 1 + R() ** 2.2 * 0.9 * k;
      const s = 1 + R() * 2.6;
      c.fillRect(cx + Math.cos(a) * rx * d + (R() - 0.5) * 30, cy + Math.sin(a) * ry * d * 1.4 + (R() - 0.5) * 30, s, s * (0.5 + R()));
    }
    c.restore();
  }) },
  // two staples punched at the corners of what the words are pasted on, one after the other
  'staple-down': { sec: 1, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 34);
    const at: [number, number, number][] = [[b.x0 + 10, b.y0 - 6, -0.3], [b.x1 - 70, b.y1 + 6, 0.2]];
    at.forEach(([x, y, a], i) => {
      if (q < 0.15 + i * 0.3 || y < 20 || y > H - 20) return;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = 'rgba(20,20,20,0.5)';
      c.fillRect(3, 3, 64, 9);
      c.fillStyle = B4.x8C8C88;
      c.fillRect(0, 0, 64, 9);
      c.fillStyle = TONER;
      c.fillRect(0, 0, 4, 9);
      c.fillRect(60, 0, 4, 9);
      c.restore();
    });
  }) },
  // the lamp leaves a run of hard scan streaks across the free sheet, above or below the words
  'scan-streak': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 50);
    const y0 = b.y0 > 260 ? b.y0 - 120 : b.y1 + 60;
    if (y0 + 70 > H - 30) return;
    const R = rng(Math.round(y0));
    const k = ease(clamp01(q / 0.5), 3);
    c.save();
    outside(c, b);
    c.fillStyle = TONER;
    for (let i = 0; i < 9; i++) { const y = y0 + i * 7 + Math.floor(R() * 3); const [x0, x1] = [100 + R() * 200, (1800 - R() * 260) * k]; if (x1 > x0) c.fillRect(x0, y, x1 - x0, i % 3 === 0 ? 3 : 1.5); }
    c.restore();
  }) },
};

export const XEROX = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'xx-strip': xxStrip } as Record<string, ObjectPaint> };
