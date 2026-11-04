// citypop, redrawn from its board (2026-11-04, 風格第3批設計稿/citypop a–d): the title of an eighties flat-painted poster or
// record sleeve. Architecture and its hard cast shadows, a pool, a posterised night sea with a flat moon, a skyline whose
// windows light floor by floor. No airbrushed sunset, no blur: every shape is a flat colour with a hard edge. Each cover
// is painted by day or by night as its scheme says (the board's a and d are day, b and c night).
import type { Piece } from './world-pieces';
import { clamp01, ease, fract, H, HandGround, HandIn, isLight, kept, ObjectPaint, W, WorldEnv } from './world-craft';
import { artistOf, C, label, rng, titleOnly } from './world-b3-shared';

/** The board's flat inks, by day and by night: one cover, two lights. */
const DAY = { sky: '#45B4E2', sky2: '#8DD5F0', skyTop: '#3AA6D8', facade: '#F7EFDF', facadeShade: '#E7DBC4', wall: '#F2A1B8', wallShade: '#D9809B', white: '#FFFFFF', columnShade: '#E6EEF5', capShade: '#BCCADB', pool: '#1F84C6', glint: '#FFFFFF', tile: '#FFFFFF', grout: '#9FB6C9', coral: '#EC6650', script: '#EC6650' };
const NIGHT = { sky: '#1B2350', sky2: '#2A2865', skyTop: '#141A40', facade: '#2B3466', facadeShade: '#232A57', wall: '#6A3A7E', wallShade: '#4B2E63', white: '#C9CFE6', columnShade: '#AEB6D3', capShade: '#8E97BC', pool: '#15306E', glint: '#F7EFDF', tile: '#3A4478', grout: '#2A3263', coral: '#F2A1B8', script: '#F2A1B8' };
type Inks = typeof DAY;
const inks = (e: WorldEnv): Inks => (isLight(e.paper) ? DAY : NIGHT);
const night = (e: WorldEnv) => !isLight(e.paper);
const SCRIPT = (px: number) => `400 ${px}px Yellowtail, "Noto Serif TC", "Shippori Mincho", serif`;
const SMALL = (px: number) => `600 ${px}px "Noto Serif TC", "Shippori Mincho", serif`;

/** The cover, in frame coordinates, panned very slowly over a cut: a poster being looked across. */
const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const pan = (e: WorldEnv) => -Math.min(18, e.age * 2.2);

/** Water in flat rows of hard-edged crests, half of them lit at a time (the board's pool glints, blinking in place). */
function waves(c: C, x0: number, y0: number, w: number, h: number, seed: number, tone: string, blink: number) {
  const R = rng(seed);
  c.fillStyle = tone;
  c.beginPath();
  for (let r = 0; r < 6; r++) {
    const y = y0 + 22 + (r * (h - 34)) / 6;
    const [L, th] = [70 + r * 14, 3 + r * 0.9];
    let k = 0;
    for (let x = x0 - (r % 2) * L * 0.9; x < x0 + w; x += L * 1.8, k++) {
      if ((k + r + blink + Math.floor(R() * 2)) % 3 === 0) continue;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + L / 2, y - th * 3, x + L, y);
      c.quadraticCurveTo(x + L / 2, y - th, x, y);
      c.closePath();
    }
  }
  c.fill();
}
/** A tiled pool edge. */
function tiles(c: C, P: Inks, x0: number, y0: number, w: number, h: number, sz: number) {
  c.fillStyle = P.tile;
  c.fillRect(x0, y0, w, h);
  c.strokeStyle = P.grout;
  c.lineWidth = 2;
  c.beginPath();
  for (let x = x0; x <= x0 + w; x += sz) { c.moveTo(x, y0); c.lineTo(x, y0 + h); }
  for (let y = y0; y <= y0 + h; y += sz) { c.moveTo(x0, y); c.lineTo(x0 + w, y); }
  c.stroke();
}
const blinkOf = (e: WorldEnv) => Math.floor(e.now * 1.5);

/** a: a facade with a cut shadow on the left (the title is painted on it), a colonnade over the wall, the pool below. */
const facade: HandGround = (e) => page(e, (c) => {
  const P = inks(e);
  c.translate(pan(e), 0);
  c.drawImage(kept(`cp-facade|${e.paper}|${e.slots.ink2}`, W + 40, H, (g) => {
    g.fillStyle = P.sky; g.fillRect(0, 0, W + 40, H);
    g.fillStyle = P.sky2; g.fillRect(0, 560, W + 40, 260);
    g.fillStyle = P.wall; g.fillRect(1150, 250, 810, 620);
    for (const x of [1250, 1470, 1690]) {
      g.fillStyle = P.wallShade;
      g.beginPath(); g.moveTo(x + 90, 250); g.lineTo(x + 300, 250); g.lineTo(x + 300, 870); g.lineTo(x + 90, 870); g.closePath(); g.fill();
      g.fillStyle = P.white; g.fillRect(x, 250, 90, 620);
    }
    g.fillStyle = P.white; g.fillRect(1150, 220, 810, 40);
    g.fillStyle = P.wallShade; g.fillRect(1150, 260, 810, 14);
    g.fillStyle = P.facade; g.fillRect(0, 0, 1150, 870);
    g.fillStyle = P.facadeShade;
    g.beginPath(); g.moveTo(760, 0); g.lineTo(1150, 0); g.lineTo(1150, 870); g.lineTo(1080, 870); g.closePath(); g.fill();
    tiles(g, P, 0, 870, W + 40, 36, 36);
    g.fillStyle = P.pool; g.fillRect(0, 906, W + 40, 174);
  }), 0, 0);
  waves(c, 0, 906, W + 40, 174, 5, P.glint, blinkOf(e));
  c.setTransform(e.base ?? c.getTransform());
  const r = e.rect;
  if (!r) return;
  label(c, titleOnly(e.title), r.x0 + 6, r.y0 - 40, SCRIPT(64), P.script, 0);
  const who = artistOf(e.title);
  if (who) label(c, who, r.x0 + 10, Math.min(850, r.y1 + 60), SMALL(18), e.ink, 6);
});

/** b: the night sea in posterised bands, a flat moon and its broken reflection swaying; stars kept off the title. */
const moon: HandGround = (e) => page(e, (c) => {
  const P = inks(e);
  const bands: [string, number][] = night(e) ? [['#16204A', 0], ['#24275E', 300], ['#3B2C6E', 470], ['#6A3A7E', 570], ['#B65A86', 635]] : [['#3AA6D8', 0], ['#5BBCE6', 300], ['#8DD5F0', 470], ['#F2C9A0', 570], ['#F2A1B8', 635]];
  for (const [tone, y] of bands) { c.fillStyle = tone; c.fillRect(0, y, W, H - y); }
  const disc = night(e) ? '#F7EFDF' : '#FFF4DC';
  c.fillStyle = disc;
  c.beginPath(); c.arc(1440, 470, 150, 0, Math.PI * 2); c.fill();
  c.fillStyle = night(e) ? '#141C44' : '#1F84C6';
  c.fillRect(0, 700, W, 380);
  const R = rng(8);
  const sway = Math.sin(e.now * 0.8) * 14;
  c.strokeStyle = disc;
  c.lineWidth = 8;
  c.lineCap = 'round';
  c.setLineDash([60, 22]);
  for (let i = 0; i < 11; i++) {
    const half = 150 - i * 9 + R() * 20;
    c.beginPath(); c.moveTo(1440 - half + sway * (i % 2 ? 1 : -1), 726 + i * 30); c.lineTo(1440 + half + sway * (i % 2 ? 1 : -1), 726 + i * 30); c.stroke();
  }
  c.setLineDash([]);
  if (night(e)) {
    const r = e.rect;
    c.fillStyle = '#F7EFDF';
    for (let i = 0; i < 60; i++) {
      const [x, y] = [R() * W, R() * 560];
      if (r && x > r.x0 - 60 && x < r.x1 + 60 && y > r.y0 - 120 && y < r.y1 + 60) continue;
      c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
    }
  }
  const r = e.rect;
  if (r) label(c, titleOnly(e.title), r.x0 + 6, r.y0 - 36, SCRIPT(52), night(e) ? '#F2A1B8' : '#B53A2A', 0);
  void P;
});

/** c: the skyline. Three layers of blocks; at night the windows light floor by floor on the beat, by day they are dark glass. */
const skyline: HandGround = (e) => page(e, (c) => {
  const bands: [string, number][] = night(e) ? [['#16204A', 0], ['#2A2865', 360], ['#4B2E73', 520], ['#8C4479', 620]] : [['#3AA6D8', 0], ['#5BBCE6', 360], ['#8DD5F0', 520], ['#CFE9F5', 620]];
  for (const [tone, y] of bands) { c.fillStyle = tone; c.fillRect(0, y, W, H - y); }
  const layers: [string, number, number, number, number, number, number][] = night(e)
    ? [['#2E2F6E', 0, 380, 640, 120, 220, 3], ['#232456', 0.22, 300, 520, 140, 260, 5], ['#151A3E', 0.32, 160, 360, 160, 300, 9]]
    : [['#BFD3E6', 0, 380, 640, 120, 220, 3], ['#9CB8D6', 0.22, 300, 520, 140, 260, 5], ['#7A9CC6', 0.32, 160, 360, 160, 300, 9]];
  const lit = Math.floor(e.age * 2);
  layers.forEach(([tone, win, hmin, hmax, wmin, wmax, seed], li) => {
    const R = rng(seed);
    let x = -40;
    while (x < W + 40) {
      const w = Math.round((wmin + R() * (wmax - wmin)) / 26) * 26 + 8;
      const h = hmin + R() * (hmax - hmin);
      const top = H - h;
      c.fillStyle = tone;
      c.fillRect(x, top, w, h);
      if (R() < 0.35) c.fillRect(x + w * 0.3, top - 34, w * 0.4, 34);
      if (win) {
        c.fillStyle = night(e) ? (R() < 0.6 ? '#F6D9A0' : '#F2A1B8') : '#1B2A5C';
        let floor = 0;
        for (let yy = top + 28; yy < H - 20; yy += 40, floor++) {
          const on = R() < win;
          const part = R() < 0.5;
          // the windows come on from the ground floor up, a floor a beat
          const up = Math.floor((H - yy) / 40);
          if (!on || (night(e) && up > lit * 2 + li)) continue;
          for (let xx = x + 17; xx < x + w - 22; xx += 26) { if (part && R() < 0.45) continue; c.fillRect(xx, yy, 14, 22); }
        }
      }
      x += w + (R() < 0.3 ? 18 : 0);
    }
  });
  const r = e.rect;
  if (r) label(c, titleOnly(e.title), (r.x0 + r.x1) / 2, Math.max(60, r.y0 - 30), SMALL(30), night(e) ? '#F2A1B8' : '#B53A2A', 18, 'center');
});

/** d: a white column (the set's object) throws a long shadow across the wall under a flat sky; its shadow turns slowly. */
const colonnade: HandGround = (e) => page(e, (c) => {
  const P = inks(e);
  c.fillStyle = P.sky; c.fillRect(0, 0, W, H);
  c.fillStyle = P.skyTop; c.fillRect(0, 0, W, 300);
  c.fillStyle = P.wall; c.fillRect(0, 420, W, 660);
  const r = e.rect ?? { x0: 900, y0: 150, x1: 1200, y1: 1000 };
  const [x0, x1] = [Math.min(r.x0 - 60, 860), Math.max(r.x1 + 60, 1240)];
  const lean = 300 + 40 * Math.sin(e.now * 0.05);
  c.fillStyle = P.wallShade;
  c.beginPath(); c.moveTo(x1, 420); c.lineTo(x1 + lean, 420); c.lineTo(x0 + lean - 580, H); c.lineTo(x0 - 200, H); c.closePath(); c.fill();
  tiles(c, P, 0, 1010, x0, 70, 35);
  tiles(c, P, x1, 1010, W - x1, 70, 35);
  label(c, titleOnly(e.title), Math.min(W - 120, x1 + 50), 930, SCRIPT(54), P.script, 0);
});

const Gs: Record<string, HandGround> = { 'citypop/facade': facade, 'citypop/moon': moon, 'citypop/skyline': skyline, 'citypop/colonnade': colonnade };

/** The white column the vertical lines are painted on (board d): shaft, its shaded edge, a capital and its shadow line. */
const column: ObjectPaint = (c, w, h, s) => {
  const cap = 52;
  c.fillStyle = s.plate;
  c.fillRect(30, cap, w - 60, h - cap + 60);
  c.fillStyle = isLight(s.plate) ? '#E6EEF5' : '#AEB6D3';
  c.fillRect(w - 30 - 35, cap, 35, h - cap + 60);
  c.fillStyle = s.plate;
  c.fillRect(0, 10, w, 42);
  c.fillStyle = isLight(s.plate) ? '#BCCADB' : '#8E97BC';
  c.fillRect(0, 52, w, 10);
};

const INS: Record<string, HandIn> = {
  // the next sleeve slides in from the right over the last, flat, no fade
  'sleeve-pull': { sec: 0.6, draw: (e, q) => page(e, (c) => { const x = W * (1 - ease(q, 3)); c.fillStyle = e.paper; c.fillRect(x, 0, W, H); c.fillStyle = isLight(e.paper) ? '#FFFFFF' : '#C9CFE6'; c.fillRect(x - 10, 0, 10, H); }) },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // light runs along the bottom of the cover: hard-edged glints in rows, lit in turn
  'glint-run': { sec: 2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 30);
    if (b.y1 > H - 120) return;
    c.save();
    c.beginPath(); c.rect(W * clamp01(q * 1.4 - 0.4), H - 110, W * 0.5, 110); c.clip();
    waves(c, 0, H - 110, W, 110, 11, night(e) ? '#F7EFDF' : '#FFFFFF', Math.floor(q * 9));
    c.restore();
  }) },
  // stars come out across the top of the night, a few at a time; by day white gulls of light dots
  'star-rise': { sec: 2.2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 60);
    const R = rng(21 + (e.seed % 5));
    c.fillStyle = night(e) ? '#F7EFDF' : '#FFFFFF';
    for (let i = 0; i < 40; i++) {
      const [x, y, at] = [R() * W, R() * H * 0.45, R()];
      if (q < at * 0.7 || (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) continue;
      c.beginPath(); c.arc(x, y, 2.5 + 2 * fract(i * 0.37), 0, Math.PI * 2); c.fill();
    }
  }) },
  // a long hard shadow sweeps across the lower part of the cover, as if the sun moved an hour
  'shadow-turn': { sec: 2.4, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 40);
    const top = Math.max(b.y1, H * 0.62);
    if (top > H - 40) return;
    const x = -600 + ease(q, 2) * (W + 900);
    c.fillStyle = 'rgba(27,42,92,0.22)';
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + 300, top); c.lineTo(x + 40, H); c.lineTo(x - 260, H); c.closePath(); c.fill();
  }) },
};

export const CITYPOP = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'cp-column': column } as Record<string, ObjectPaint> };
