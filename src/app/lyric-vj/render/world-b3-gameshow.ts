// gameshow, redrawn from its board (2026-11-04, 風格第3批設計稿/gameshow a–d): a quiz show's graphics. The words are the
// question card (a white chevron banner with a lettered tab), the answer cells A–D, the hint card with its timer, a
// letter a tile on the number board. Studio blue backdrop of angled flat panels, hard offset shadows in deep navy, gold
// underlines, Bungee letters and numbers; TV scanlines and a vignette as the finish. Square corners, primary colours.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, ObjectPaint, W, WorldEnv } from './world-craft';
import { C, label, rng, titleOnly } from './world-b3-shared';

const B = '#1636B8';
const BD = '#0B1A5C';
const BL = '#2B4FD6';
const EDGE = '#3D62E8';
const R = '#C8102E';
const G = '#FFB400';
const WH = '#FFFFFF';
const K = '#111428';
const BUNGEE = (px: number) => `400 ${px}px Bungee, "Noto Sans TC", "Zen Kaku Gothic New", sans-serif`;

const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** The finish: TV scanlines (2 of every 4 px at 7 %) and the board's navy vignette. */
function finish(c: CanvasRenderingContext2D) {
  c.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2);
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0.6, 'rgba(0,0,20,0)');
  g.addColorStop(1, 'rgba(0,0,20,0.35)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
/** The studio set: the scheme's backdrop with two big angled panels and their lit edges. */
function studio(c: C, e: WorldEnv) {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const poly = (pts: number[], tone: string) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = tone; c.fill(); };
  const [panel, edge] = e.paper === B ? [BL, EDGE] : ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.22)'];
  poly([0, 0, 760, 0, 420, 1080, 0, 1080], panel);
  poly([1500, 0, 1920, 0, 1920, 1080, 1180, 1080], panel);
  poly([760, 0, 800, 0, 460, 1080, 420, 1080], edge);
  poly([1460, 0, 1500, 0, 1180, 1080, 1140, 1080], edge);
}
/** A chevron banner with its navy shadow, a gold underline and, at its left, a lettered tab. */
function banner(c: C, x: number, y: number, w: number, h: number, fill: string, tab: string, tabFill: string, tabInk: string) {
  const k = h * 0.32;
  const shape = (dx: number, dy: number) => { c.beginPath(); c.moveTo(x + k + dx, y + dy); c.lineTo(x + w + dx, y + dy); c.lineTo(x + w + k + dx, y + h / 2 + dy); c.lineTo(x + w + dx, y + h + dy); c.lineTo(x + k + dx, y + h + dy); c.lineTo(x + dx, y + h / 2 + dy); c.closePath(); };
  shape(14, 14); c.fillStyle = BD; c.fill();
  shape(0, 0); c.fillStyle = fill; c.fill();
  c.fillStyle = G;
  c.fillRect(x + k, y + h - 12, w - k, 12);
  if (!tab) return;
  c.fillStyle = tabFill;
  const tw = Math.min(h * 0.9, 200);
  c.fillRect(x - 40, y - 30, tw, h + 60);
  label(c, tab, x - 40 + tw / 2, y + h * 0.5 + h * 0.18, BUNGEE(Math.min(120, h * 0.52)), tabInk, 0, 'center');
}

/** a: the question round. The banner and the answer cells are the sets' objects; the set gives the title head. */
const round: HandGround = (e) => page(e, (c) => {
  studio(c, e);
  label(c, titleOnly(e.title), 150, 126, BUNGEE(30), G, 1.2);
  finish(c);
});

/** b: the hint card round the words, its red head, and a timer of twelve cells going out one by one. */
const hint: HandGround = (e) => page(e, (c) => {
  studio(c, e);
  const r = e.rect ?? { x0: 400, y0: 420, x1: 1200, y1: 700 };
  const [x, y] = [Math.max(80, r.x0 - 70), Math.max(70, r.y0 - 170)];
  const w = Math.max(1260, r.x1 - x + 120);
  const h = Math.max(600, r.y1 - y + 90);
  // the card is pushed in from the left at the cut, its head first
  const push = (1 - ease(clamp01(e.age / 0.3), 3)) * -(x + w);
  c.translate(push, 0);
  c.fillStyle = BD; c.fillRect(x + 16, y + 16, w, h);
  c.fillStyle = WH; c.fillRect(x, y, w, h);
  c.fillStyle = R; c.fillRect(x, y, w, 96);
  label(c, 'HINT', x + 50, y + 70, BUNGEE(52), WH, 2);
  label(c, titleOnly(e.title), x + w - 50, y + 64, BUNGEE(30), WH, 1, 'right');
  const n = 12;
  const cw = (w + 14) / n - 14;
  const out = Math.min(n, Math.floor(e.age / 0.45));
  for (let i = 0; i < n; i++) {
    const cx = x + i * (cw + 14);
    c.fillStyle = BD; c.fillRect(cx + 8, y + h + 58, cw, 46);
    c.fillStyle = i < n - out ? G : BL; c.fillRect(cx, y + h + 50, cw, 46);
  }
  label(c, 'TIME', x, Math.min(H - 30, y + h + 150), BUNGEE(30), WH, 2);
  c.translate(-push, 0);
  finish(c);
});

/** c: the number board, eight by five; the line's row is the set's object, ringed in gold; the tiles flip colour on the beat. */
const board: HandGround = (e) => page(e, (c) => {
  c.fillStyle = BD;
  c.fillRect(0, 0, W, H);
  const r = e.rect ?? { x0: 600, y0: 450, x1: 1320, y1: 630 };
  const [gap, rows] = [14, 5];
  const tw = (W - 120 - 7 * gap) / 8;
  const th = (H - 120 - (rows - 1) * gap) / rows;
  const step = tw + gap;
  const cx = (r.x0 + r.x1) / 2;
  // columns are laid from the line's centre, so its letters sit on tiles whatever its length
  const n = Math.max(1, Math.round((r.x1 - r.x0 + 0.288 * 176) / step));
  const first = cx - (n / 2) * step + gap / 2;
  const col0 = Math.floor((first - 40) / step);
  const flip = Math.floor(e.now * 2);
  const pal = [B, R, WH, G, B, R, B, BL];
  for (let row = 0; row < rows; row++) {
    const y = 60 + row * (th + gap);
    for (let k = -col0 - 1; first + k * step < W; k++) {
      const x = first + k * step;
      if (x + tw < 0) continue;
      const mid = row === 2 && k >= 0 && k < n;
      if (mid) continue;
      const R0 = rng(4 + row * 31 + k * 7 + Math.floor((flip + row + k) / 3));
      R0();
      const f = pal[Math.floor(R0() * pal.length)];
      c.fillStyle = f; c.fillRect(x, y, tw, th);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + th - 10, tw, 10);
      const num = row * 8 + (((k + col0 + 8) % 8) + 8) % 8 + 1;
      label(c, String(num), x + tw / 2, y + th / 2 + 26, BUNGEE(64), f === WH || f === G ? K : WH, 0, 'center');
    }
  }
  c.strokeStyle = G;
  c.lineWidth = 10;
  c.strokeRect(first - 10, 60 + 2 * (th + gap) - 10, n * step - gap + 20, th + 20);
  finish(c);
});

/** d: question and answer: two chevron banners, the question white with a gold Q tab, the answer gold with a red A tab. */
const qa: HandGround = (e) => page(e, (c) => {
  studio(c, e);
  const r = e.rect ?? { x0: 566, y0: 270, x1: 1500, y1: 820 };
  // (the block is two rows of 2.9 sizes each: its height is 5.8 sizes)
  const size = Math.max(60, (r.y1 - r.y0) / 5.8);
  const [y1, y2] = [(r.y0 + r.y1) / 2 - size * 1.45, (r.y0 + r.y1) / 2 + size * 1.45];
  const x = Math.max(120, r.x0 - 200);
  const w = Math.max(1240, r.x1 - x + 80);
  banner(c, x, y1 - 115, w, 230, WH, 'Q', G, K);
  banner(c, x, y2 - 115, w, 230, G, 'A', R, WH);
  finish(c);
});

const Gs: Record<string, HandGround> = { 'gameshow/round': round, 'gameshow/hint': hint, 'gameshow/board': board, 'gameshow/qa': qa };

/** The question banner the line stands in (board a): white chevron, navy shadow, gold underline, red Q tab at its left. */
const qBanner: ObjectPaint = (c, w, h) => banner(c, 60, 30, w - 130, h - 60, WH, 'Q', R, WH);
/** The answer cells (board a): one white cell a letter, its gold A–D tag, navy shadow. The row's height gives the letter size. */
const answerCells: ObjectPaint = (c, w, h) => {
  const size = h - 220;
  const step = size * 1.714;
  const n = Math.max(1, Math.round((w - 140 + 0.714 * size) / step));
  for (let i = 0; i < n; i++) {
    const cx = 70 + size / 2 + i * step;
    const [x, y, cw, ch] = [cx - size * 0.76, 110 - size * 0.24, size * 1.52, size * 1.57];
    c.fillStyle = BD; c.fillRect(x + 12, y + 12, cw, ch);
    c.fillStyle = WH; c.fillRect(x, y, cw, ch);
    c.fillStyle = G; c.fillRect(x, y, size * 0.43, size * 0.38);
    label(c, 'ABCDEFGH'[i] ?? '', x + size * 0.215, y + size * 0.3, BUNGEE(size * 0.26), K, 0, 'center');
  }
};
/** The board row's tiles under the letters (board c): white, a shade along their foot. */
const rowTiles: ObjectPaint = (c, w, h) => {
  const size = 176;
  const step = (W - 120 - 7 * 14) / 8 + 14;
  const n = Math.max(1, Math.round((w + 0.288 * size) / step));
  const tw = step - 14;
  const x0 = w / 2 - (n * step - 14) / 2;
  for (let i = 0; i < n; i++) {
    c.fillStyle = WH; c.fillRect(x0 + i * step, h / 2 - 90, tw, 180);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x0 + i * step, h / 2 + 80, tw, 10);
  }
};

const INS: Record<string, HandIn> = {
  // the next set is pushed in from the left, a blue panel with a gold leading edge
  'panel-push': { sec: 0.3, draw: (e, q) => page(e, (c) => { const x = -W + ease(q, 3) * W; c.fillStyle = e.paper; c.fillRect(x, 0, W, H); c.fillStyle = G; c.fillRect(x + W - 14, 0, 14, H); }) },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // the timer: twelve cells along the bottom go out one by one over the piece (kept below the words)
  'timer-drain': { sec: 2.4, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 20);
    if (b.y1 > H - 110) return;
    const n = 12;
    const cw = (W - 240 + 14) / n - 14;
    const out = Math.floor(q * (n + 1));
    for (let i = 0; i < n; i++) { const x = 120 + i * (cw + 14); c.fillStyle = BD; c.fillRect(x + 8, H - 92, cw, 40); c.fillStyle = i < n - out ? G : BL; c.fillRect(x, H - 100, cw, 40); }
  }) },
  // tiles round the frame's edge flip to gold and back on the beat, a ring of them
  'board-flip': { sec: 1.6, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 30);
    const s = 96;
    const k = Math.floor(q * 8);
    for (let x = 0; x < W; x += s) for (const y of [0, H - s]) { if (y + s > b.y0 && y < b.y1 && x + s > b.x0 && x < b.x1) continue; c.fillStyle = (x / s + k) % 2 ? G : R; c.fillRect(x + 4, y + 4, s - 8, s - 8); }
  }) },
  // the correct-answer flash: gold chevrons slide in from both sides toward the words and stop short of them
  'right-answer': { sec: 1.2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 60);
    const k = Math.sin(clamp01(q) * Math.PI);
    const y = (b.y0 + b.y1) / 2;
    c.fillStyle = G;
    for (let i = 0; i < 3; i++) {
      const lx = Math.min(b.x0 - 20, -120 + k * (b.x0 + 60)) - i * 70;
      const rx = Math.max(b.x1 + 20, W + 120 - k * (W - b.x1 + 60)) + i * 70;
      c.beginPath(); c.moveTo(lx - 40, y - 60); c.lineTo(lx, y); c.lineTo(lx - 40, y + 60); c.lineTo(lx - 70, y + 60); c.lineTo(lx - 30, y); c.lineTo(lx - 70, y - 60); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(rx + 40, y - 60); c.lineTo(rx, y); c.lineTo(rx + 40, y + 60); c.lineTo(rx + 70, y + 60); c.lineTo(rx + 30, y); c.lineTo(rx + 70, y - 60); c.closePath(); c.fill();
    }
  }) },
};

export const GAMESHOW = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'gs-q-banner': qBanner, 'gs-answer-cells': answerCells, 'gs-row-tiles': rowTiles } as Record<string, ObjectPaint> };
