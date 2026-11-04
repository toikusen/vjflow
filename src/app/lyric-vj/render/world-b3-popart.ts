// popart, redrawn from its board (2026-11-04, 風格第3批設計稿/popart a–d): a page of a sixties comic. The words are the
// panel's lines: spoken ones in a balloon, the narrator's in a caption box, a shout as a sound effect over a burst. Panels
// have key-black borders on cream newsprint; shading is Ben-Day halftone on a turned lattice; the colour plates sit a
// hair (5, 3) off the key. Each set brings its own page (a set's `ground`), laid out round where the words stand.
import type { Piece } from './world-pieces';
import { clamp01, ease, easeIn, H, HandGround, HandIn, ObjectPaint, W, WorldEnv } from './world-craft';
import { burstPath, focusOf, halftone, label, onPage, rng, sparklePath, speedLines, still, titleOf } from './world-b3-shared';
import { B3 } from './b3-inks';

const K = (e: { slots: { ink: string } }) => e.slots.ink;
/** The board's register slip: colour plates sit this far off the key. */
const SLIP: [number, number] = [5, 3];
const BORDER = 8;
/** The process plates and the newsprint the panels are printed on (the board's own values): a page's arrangement comes from the scheme. */
const STOCK = B3.xF3EBD7;
const CYAN = B3.x1E9FD6;
const DEEP = B3.x16307A;
const LABEL_FACE = (px: number, w = 700) => `${w} ${px}px "Noto Sans TC", "Noto Serif JP", sans-serif`;

type G = OffscreenCanvasRenderingContext2D;
/** A panel: its colour plate clipped to it and slipped off register, then the key drawn on it, then the key border. */
function panel(c: G, k: string, x: number, y: number, w: number, h: number, plate: (g: G) => void, key?: (g: G) => void) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.save();
  c.translate(...SLIP);
  plate(c);
  c.restore();
  key?.(c);
  c.restore();
  c.lineWidth = BORDER;
  c.strokeStyle = k;
  c.strokeRect(x, y, w, h);
}
/** A caption tag: yellow plate, key border, small bold type (board a's 「雙截棍 ─ 副歌」, real data only). */
function tag(c: G, text: string, x: number, y: number, px: number, plate: string, k: string, right = false) {
  if (!text) return;
  c.font = LABEL_FACE(px);
  (c as unknown as CanvasRenderingContext2D).letterSpacing = `${px * 0.08}px`;
  const w = c.measureText(text).width + px * 1.5;
  const h = px * 1.75;
  const x0 = right ? x - w : x;
  c.fillStyle = plate;
  c.fillRect(x0, y, w, h);
  c.lineWidth = 5;
  c.strokeStyle = k;
  c.strokeRect(x0, y, w, h);
  label(c, text, x0 + px * 0.75, y + px * 1.22, LABEL_FACE(px), k, px * 0.08);
}

/** a: two panels, the balloon's in the wide one with speed lines toward it; the narrow one is the next beat's colour. */
const strip = (mirror: boolean): HandGround => (e) => onPage(e, still(e, mirror ? 'pop-strip-r' : 'pop-strip', (c) => {
  const s = e.slots;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const wide: [number, number] = mirror ? [720, 1140] : [60, 1140];
  const narrow: [number, number] = mirror ? [60, 632] : [1228, 632];
  // a line split in two (world-split.ts) has its last phrase in the narrow panel: that panel gets the burst it is shouted in
  const r = e.rect;
  const shout = !!r && (mirror ? r.x0 < narrow[0] + narrow[1] - 40 : r.x1 > narrow[0] + 40);
  const balloonBox = r && shout ? (mirror ? { ...r, x0: Math.max(r.x0, wide[0]) } : { ...r, x1: Math.min(r.x1, wide[0] + wide[1]) }) : r;
  const [fx, fy] = balloonBox ? [(balloonBox.x0 + balloonBox.x1) / 2, (balloonBox.y0 + balloonBox.y1) / 2] : [mirror ? 1320 : 600, 500];
  panel(c, K(e), wide[0], 60, wide[1], 960, (g) => {
    g.fillStyle = STOCK;
    g.fillRect(wide[0] - 10, 50, wide[1] + 20, 980);
    halftone(g, wide[0], 60, wide[1], 960, 16, (x, y) => Math.min(6.2, 1.2 + (Math.hypot(x - fx, y - fy) / 700) * 5.5), s.ink2);
  }, (g) => speedLines(g, fx, fy, 470, 1300, 90, 9, K(e), 7 + (e.seed % 5)));
  panel(c, K(e), narrow[0], 60, narrow[1], 960, (g) => {
    g.fillStyle = s.faint;
    g.fillRect(narrow[0] - 10, 50, narrow[1] + 20, 980);
    halftone(g, narrow[0], 60, narrow[1], 960, 15, (_x, y) => Math.max(0, ((y - 420) / 600) * 6.5), s.accent, 15);
  }, (g) => {
    const [bx, by] = [narrow[0] + narrow[1] / 2, 540];
    speedLines(g, bx, shout ? by : 470, shout ? 300 : 120, 900, 46, 5, K(e), 11 + (e.seed % 3));
    if (!shout) return;
    // the burst round the shouted phrase: plate white, key line, points past the words
    burstPath(g, bx, by, narrow[1] / 2 - 36, 330, 14, 0.2, 5 + (e.seed % 5));
    g.lineJoin = 'miter';
    g.lineWidth = 14;
    g.strokeStyle = K(e);
    g.stroke();
    g.fillStyle = s.plate;
    g.fill();
  });
  tag(c, titleOf(e), wide[0] + 38, 98, 30, s.faint, K(e));
}));

/** b: one wide panel, a dot sky fading down to a printed sea, sparkles; the caption box (the set's object) sits up left. */
const sea: HandGround = (e) => onPage(e, still(e, 'pop-sea', (c) => {
  const s = e.slots;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  panel(c, K(e), 60, 60, 1800, 960, (g) => {
    g.fillStyle = STOCK;
    g.fillRect(50, 50, 1820, 980);
    halftone(g, 60, 60, 1800, 700, 18, (_x, y) => Math.max(0, 7.4 - ((y - 60) / 700) * 6.8), CYAN, 15);
    g.fillStyle = CYAN;
    g.fillRect(60, 760, 1800, 260);
    halftone(g, 60, 760, 1800, 260, 14, (_x, y) => Math.max(0, ((y - 760) / 260) * 5.5), DEEP, 75);
  }, (g) => {
    const R = rng(5 + (e.seed % 7));
    g.fillStyle = s.plate;
    g.beginPath();
    for (let r = 0; r < 9; r++) {
      const yy = 785 + r * 26 + r * r * 1.2;
      for (let i = 0; i < 10 + r * 2; i++) {
        const x = 80 + R() * 1760;
        const len = 40 + R() * 110 + r * 12;
        const w = 1.2 + r * 0.35;
        const y = yy + R() * 8;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y - w * 2, x + len, y);
        g.quadraticCurveTo(x + len / 2, y + w * 1.4, x, y);
      }
    }
    g.fill();
    g.fillStyle = K(e);
    g.fillRect(60, 757, 1800, 5);
    const r = e.rect;
    // the sparkles keep off the caption box
    const clear = (x: number, y: number) => !r || x < r.x0 - 140 || x > r.x1 + 160 || y < r.y0 - 140 || y > r.y1 + 160;
    for (const [x, y, rr] of [[1240, 170, 46], [1520, 300, 28], [1700, 140, 20], [1380, 430, 16], [1100, 620, 22], [1640, 520, 34], [1820, 330, 12]]) {
      if (!clear(x, y)) continue;
      sparklePath(g, x, y, rr);
      g.fillStyle = s.plate;
      g.fill();
      g.lineWidth = 4;
      g.lineJoin = 'round';
      g.strokeStyle = K(e);
      g.stroke();
    }
  });
  const r = e.rect;
  if (r) {
    const t = titleOf(e);
    c.font = LABEL_FACE(26);
    const w = c.measureText(t).width + 24 + t.length * 5;
    c.fillStyle = STOCK;
    c.fillRect(r.x0 - 46, r.y1 + 128, w, 38);
    label(c, t, r.x0 - 34, r.y1 + 156, LABEL_FACE(26), K(e), 5);
  }
}));

/** c: the panel blows open: the second plate flooded, dots out from the middle, speed lines, a white burst. */
const blast: HandGround = (e) => onPage(e, still(e, 'pop-blast', (c) => {
  const s = e.slots;
  c.fillStyle = s.ink2;
  c.fillRect(0, 0, W, H);
  halftone(c, 0, 0, W, H, 20, (x, y) => Math.max(0, 8.5 - (Math.hypot(x - 960, y - 540) / 1100) * 9), s.faint, 30);
  speedLines(c, 960, 540, 640, 1500, 120, 14, K(e), 21 + (e.seed % 4));
  burstPath(c, 960, 540, 860, 470, 22, 0.12, 9 + (e.seed % 5));
  c.fillStyle = s.plate;
  c.fill();
  c.lineWidth = 10;
  c.lineJoin = 'miter';
  c.strokeStyle = K(e);
  c.stroke();
  tag(c, titleOf(e), 1810, 940, 34, s.faint, K(e), true);
}));

/** d: a manga page read right to left: a tall pale panel, a thin speed-line panel, a tall coloured one. */
const triptych: HandGround = (e) => onPage(e, still(e, 'pop-trip', (c) => {
  const s = e.slots;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  panel(c, K(e), 1080, 60, 780, 960, (g) => {
    g.fillStyle = STOCK;
    g.fillRect(1070, 50, 800, 980);
    halftone(g, 1080, 60, 780, 960, 16, (x) => Math.min(6, 1 + ((x - 1080) / 780) * 5.5), s.accent, 15);
  });
  panel(c, K(e), 880, 60, 172, 960, (g) => {
    g.fillStyle = s.faint;
    g.fillRect(870, 50, 200, 980);
  }, (g) => speedLines(g, 966, 540, 0, 1400, 70, 5, K(e), 4));
  panel(c, K(e), 60, 60, 792, 960, (g) => {
    g.fillStyle = s.ink2;
    g.fillRect(50, 50, 820, 980);
    halftone(g, 60, 60, 792, 960, 16, (_x, y) => Math.max(0, 6.6 - ((y - 60) / 960) * 5), s.faint, 45);
  });
}));

const Gs: Record<string, HandGround> = {
  'popart/strip': strip(false),
  'popart/strip-r': strip(true),
  'popart/sea': sea,
  'popart/blast': blast,
  'popart/triptych': triptych,
};

const INS: Record<string, HandIn> = {
  // the page turns: the next page is pulled across from the right edge, its key-black edge leading
  'panel-flip': { sec: 0.3, draw: (e, q) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); const x = W * (1 - ease(q, 3)); c.fillStyle = e.paper; c.fillRect(x, 0, W, H); c.fillStyle = K(e); c.fillRect(x - BORDER, 0, BORDER, H); c.restore(); } },
};

/** Draws `f` in frame coordinates. */
const framed = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** The lyric box with a margin: what a piece must keep out of. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // the speed lines close in on the words on the hit and spring back, never inside the words' box
  'speed-close': { sec: 1.2, clear: 0, draw: (e, q) => framed(e, (c) => {
    const b = keepOut(e, 60);
    const [fx, fy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const r0 = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2;
    const k = q < 0.3 ? ease(q / 0.3, 3) : 1 - easeIn((q - 0.3) / 0.7, 2);
    speedLines(c, fx, fy, r0 + 420 * (1 - k), 2000, 110, 10, K(e), 31 + (e.seed % 7));
  }) },
  // the halftone breathes in from the frame's edge on the beat, kept off the words
  'dot-breathe': { sec: 1.6, clear: 0, draw: (e, q) => framed(e, (c) => {
    const b = keepOut(e, 90);
    const k = Math.sin(clamp01(q) * Math.PI);
    halftone(c, 0, 0, W, H, 22, (x, y) => {
      const out = Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1);
      return out <= 0 ? 0 : Math.min(9, (out / 300) * 9) * k;
    }, e.slots.ink2, 30);
  }) },
  // the page is turned under the words: a cream sheet with a key edge crosses behind them, left to right
  'comic-page-turn': { sec: 0.9, clear: 0, draw: (e, q) => framed(e, (c) => {
    const x = W * ease(q, 2);
    c.fillStyle = e.paper;
    c.fillRect(0, 0, x, H);
    c.fillStyle = K(e);
    c.fillRect(x - BORDER, 0, BORDER, H);
  }) },
};

/**
 * The speech balloon round the words (board a): an ellipse filling the object, its tail out of the lower corner, key line round
 * both. `side`: the tail leaves sideways and its tip stays above the balloon's foot (board d's tall balloons, which reach the
 * frame's foot: a tail hung below them was cut off by the frame).
 */
const balloon = (corner: 'left' | 'right', side = false): ObjectPaint => (c, w, h, s) => {
  const [cx, cy, rx, ry] = [w / 2, h / 2, w / 2 - 4, h / 2 - 4];
  const dir = corner === 'left' ? -1 : 1;
  const angle = (deg: number) => ((corner === 'left' ? 180 - deg : deg) * Math.PI) / 180;
  const [a0, a1] = side ? [angle(34), angle(46)] : [angle(62), angle(80)];
  const tip: [number, number] = side ? [cx + dir * rx * 1.3, cy + ry * 0.96] : [cx + dir * (rx * 0.62 + 40), cy + ry + 40];
  // one contour: the rim the long way round from one root of the tail to the other, out to the tip and back. Drawn as an
  // ellipse plus a separate triangle, the rim between the roots was stroked across the tail's mouth (owner 2026-11-04)
  const [from, to] = a0 > a1 ? [a0, a1] : [a1, a0];
  const shape = () => { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, from, to + Math.PI * 2); c.lineTo(...tip); c.closePath(); };
  shape();
  c.lineJoin = 'round';
  c.lineWidth = 16;
  c.strokeStyle = s.plateInk;
  c.stroke();
  shape();
  c.fillStyle = s.plate;
  c.fill();
};
/** Board d's two tall balloons, one a column: the first phrase's on the right (read first), its tail low left; the second's on the left. */
const twinBalloons: ObjectPaint = (c, w, h, s) => {
  const pad = 70;
  const step = (w - pad * 2) / 2;
  // (a line that would not break in two stands as one column in one balloon)
  // (one column is 9.4 sizes wide at 84–150 px, two are 18.8: 1500 px of words lies between them, so the balloons follow the columns)
  const cols: [number, 'left' | 'right'][] = w - pad * 2 < 1500 ? [[w / 2, 'left']] : [[pad + step * 0.5, 'right'], [w - pad - step * 0.5, 'left']];
  // the balloons stay inside board d's panels (the frame's middle 952 px less their keyline), widening to hold the column:
  // set as tall as the object, they stood past the panels' black frame above and below (owner 2026-11-04)
  const PANEL_RY = (H - 2 * 60 - BORDER) / 2 - 12;
  const colHalf = Math.min(w - pad * 2, 120) / 2 + 18;
  const reach = (cols.length > 1 ? step * 0.5 + pad : w / 2) + 44;
  for (const [cx, corner] of cols) {
    const base = Math.min(220, step * 0.24 + 120);
    // the column's half length with a margin, against the panel's half height: the ellipse must hold its corners
    const k = (h / 2 - 88 + 12) / PANEL_RY;
    const need = k < 0.97 ? colHalf / Math.sqrt(1 - k * k) : Infinity;
    const inPanel = h / 2 - 6 > PANEL_RY && need <= reach / 1.3;
    const ry = inPanel ? PANEL_RY : h / 2 - 6;
    const rx = inPanel ? Math.min(reach / 1.3, Math.max(base, need)) : base;
    c.save();
    c.translate(cx - rx, h / 2 - ry - 4);
    balloon(corner, true)(c, rx * 2, ry * 2 + 8, s, 0, 0);
    c.restore();
  }
};
/** The narrator's caption box (board b): cream, a key border, its shadow printed hard down and right. */
const caption: ObjectPaint = (c, w, h, s) => {
  c.fillStyle = s.plateInk;
  c.fillRect(14, 14, w, h);
  c.fillStyle = s.plate;
  c.fillRect(0, 0, w, h);
  c.lineWidth = 6;
  c.strokeStyle = s.plateInk;
  c.strokeRect(3, 3, w - 6, h - 6);
};

export const POPART = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'pop-balloon': balloon('left'), 'pop-balloon-r': balloon('right'), 'pop-twin-balloons': twinBalloons, 'pop-caption': caption } as Record<string, ObjectPaint> };
