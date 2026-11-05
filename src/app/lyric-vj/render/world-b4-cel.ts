// cel80s, from its board (2026-11-05, 風格第4批設計稿/cel80s a–d; source out/research/boards-b4/boards/cel80s.html): the
// opening and ending of an eighties TV anime. Airbrushed dusk and night skies, four-point glints built of long thin
// diamonds (no glow), hard tapered speed streaks all running one way, a held dark cel band behind the title, a
// diagonal cel split, cloud strata with one lit rim, film grain and a little white dust. The words are the title card
// and the subtitles: italic title lettering in cream with an indigo ring, a magenta ring and a hard shadow
// (world-glyph-b4b), the last phrase in yellow; white subtitles in the dusk; the eyecatch's one word in three sunset
// bands; the ending's two columns. Dark grounds and leaning type keep it apart from idol-live's pastel merch, flat
// buildings and pools keep citypop apart. No perspective grid, no neon outline type, no VHS counter (JIZURA).
import type { Piece } from './world-pieces';
import { clamp01, ease, fract, H, HandGround, HandIn, kept, W, WorldEnv } from './world-craft';
import { artistBy, C, label, rng, titleOf } from './world-b3-shared';
import { B4B } from './b4b-inks';
import { mirrorGround } from './world-b3-shared';
import { B4B_MIRRORED } from './world-b4b-sets';

type Box = { x0: number; y0: number; x1: number; y1: number };
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const LATIN = (px: number) => `400 ${px}px Righteous, "Shippori Antique B1", "Zen Kaku Gothic New", sans-serif`;
const beatOf = (now: number, bpm = 120) => { const b = (now * Math.max(60, bpm)) / 60; return { idx: Math.floor(b), since: (fract(b) * 60) / Math.max(60, bpm) }; };
const meets = (a: Box, b: Box, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
const path = (c: C, pts: [number, number][]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

/** A four-point glint: two long thin diamonds, a short diagonal pair, a white core (board `glint`). Hard edged. */
function glint(c: C, x: number, y: number, L: number, tone: string, k = true) {
  const w = L * 0.07;
  c.fillStyle = tone;
  c.beginPath();
  c.moveTo(x - L, y); c.lineTo(x, y - w); c.lineTo(x + L, y); c.lineTo(x, y + w); c.closePath();
  c.moveTo(x, y - L * 0.8); c.lineTo(x + w, y); c.lineTo(x, y + L * 0.8); c.lineTo(x - w, y); c.closePath();
  c.fill();
  if (k) {
    const [q, v] = [L * 0.32, w * 0.7];
    c.save();
    c.globalAlpha *= 0.85;
    c.beginPath();
    c.moveTo(x - q, y - q); c.lineTo(x + v, y - v); c.lineTo(x + q, y + q); c.lineTo(x - v, y + v); c.closePath();
    c.moveTo(x + q, y - q); c.lineTo(x + v, y + v); c.lineTo(x - q, y + q); c.lineTo(x - v, y - v); c.closePath();
    c.fill();
    c.restore();
  }
  c.fillStyle = B4B.xFFFFFF;
  c.beginPath();
  c.arc(x, y, w * 1.3, 0, Math.PI * 2);
  c.fill();
}
/** Glints that pulse once on each beat (board motion: the glints scale on the beat), those clear of the words. */
function glints(c: C, e: WorldEnv, list: [number, number, number][], tone: string, k = true) {
  const { since } = beatOf(e.now, e.bpm);
  const s = 1 + 0.35 * Math.exp(-since * 9);
  for (const [x, y, L] of list) { if (e.rect && meets({ x0: x - L, y0: y - L, x1: x + L, y1: y + L }, e.rect, 16)) continue; glint(c, x, y, L * s, tone, k); }
}
/** The speed streaks as a strip twice the frame wide (board `streaks`), kept, so they can run left without end. */
const streakStrip = (key: string, y0: number, y1: number, n: number, cols: string[], seed: number) => kept(`cel-streaks|${key}|${cols.join()}`, W * 2, H, (c) => {
  const R = rng(seed);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    const [y, h, x, L] = [y0 + R() * (y1 - y0), 3 + R() * 16, -200 + R() * 1900, 300 + R() * 900];
    c.fillStyle = cols[i % cols.length];
    const X = x + pass * W;
    c.beginPath();
    c.moveTo(X, y); c.lineTo(X + L - h * 6, y); c.lineTo(X + L, y + h / 2); c.lineTo(X + L - h * 6, y + h); c.lineTo(X, y + h); c.closePath();
    c.fill();
  }
});
/** Draws a streak strip run left by `px` (the streaks always run left: board motion). */
const runLeft = (c: C, strip: OffscreenCanvas, px: number) => { const x = -(((px % W) + W) % W); c.drawImage(strip, x, 0); };
/** The film's white dust: a few specks and hairs (board `dust`), fixed per cut. */
function dust(c: C, seed: number, tone: string) {
  const R = rng(seed);
  c.save();
  c.fillStyle = tone;
  c.globalAlpha = 0.55;
  for (let i = 0; i < 40; i++) { const [x, y] = [R() * W, R() * H]; c.beginPath(); c.arc(x, y, 0.8 + R() * 1.6, 0, 7); c.fill(); }
  c.globalAlpha = 0.35;
  c.strokeStyle = tone;
  c.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) { const [x, y] = [R() * W, R() * H]; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y + 10, x + 10 + R() * 30, y + 30 + R() * 30); c.stroke(); }
  c.restore();
}
/** The title and artist in the opening only, in the board's small spaced Latin (board a: JAY CHOU — FANTASY — 2001). */
function credit(c: C, e: WorldEnv, x: number, y: number, align: 'left' | 'right' = 'left') {
  const t = titleOf(e);
  if (!t) return;
  const who = artistBy(e);
  label(c, (who ? `${who} — ${t}` : t).toUpperCase(), x, y, LATIN(24), e.slots.ink, 24 * 0.2, align);
}
const sky = (c: C, stops: [number, string][], x0 = 0, y0 = 0, x1 = 0, y1 = H) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, s]) => g.addColorStop(o, s)); c.fillStyle = g; c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2); };

/** a: the action background, streaks running left, a held dark cel band behind the title edged in magenta and cyan. */
const title: HandGround = (e) => frame(e, (c) => {
  const s = e.slots;
  sky(c, [[0, s.plateInk], [0.55, s.plate], [1, s.ink2]]);
  runLeft(c, streakStrip('a1', 0, H, 90, [B4B.x6A3FA8, B4B.x5A3595, B4B.x8A4DB8], 3), e.now * 340);
  runLeft(c, streakStrip('a2', 0, H, 26, [B4B.xFF9F7A, s.faint, s.ink], 9), e.now * 520);
  // the band holds the title whatever its rows: never shorter than the board's, grown round the words
  const r = e.rect;
  const [top, bot] = [Math.min(170, (r?.y0 ?? 300) - 50), Math.max(770, (r?.y1 ?? 600) + 50)];
  c.fillStyle = s.ground;
  path(c, [[0, top], [W, top - 50], [W, bot - 50], [0, bot]]);
  c.fill();
  c.fillStyle = s.faint;
  path(c, [[0, bot], [W, bot - 50], [W, bot - 36], [0, bot + 14]]);
  c.fill();
  c.fillStyle = s.ink2;
  path(c, [[0, top - 14], [W, top - 64], [W, top - 50], [0, top]]);
  c.fill();
  glints(c, e, [[1720, 210, 70], [1520, 880, 46], [300, 980, 34], [1820, 640, 28]], s.ink);
  dust(c, 1, s.ink);
  if (!r || r.y1 < 860) credit(c, e, 150, 920);
});

/** The dusk strata: long thin cloud cels, a flat dark body and one hard lit rim along the underside (board `strat`). */
function strat(c: C, x: number, y: number, w: number, h: number, body: string, rim: string, seed: number) {
  const r = rng(seed);
  const n = 6;
  const cuts = [...Array.from({ length: n - 1 }, (_, i) => (i + 1 + (r() - 0.5) * 0.7) / n), 1];
  const arcs: [number, number, number, number][] = [];
  let px = x;
  cuts.forEach((u, i) => {
    const xx = x + w * u;
    const bump = h * (0.35 + r() * 1.1) * (i === 0 || i === n - 1 ? 0.6 : 1);
    arcs.push([(px + xx) / 2, y - bump * 1.6, xx, y - (i === n - 1 ? 0 : h * (0.15 + r() * 0.3))]);
    px = xx;
  });
  // one shape twice: the rim pushed down and left, the body over it
  ([[-14, 9, rim], [0, 0, body]] as [number, number, string][]).forEach(([dx, dy, tone]) => {
    c.beginPath();
    c.moveTo(x + dx, y + dy);
    arcs.forEach(([qx, qy, ex, ey]) => c.quadraticCurveTo(qx + dx, qy + dy, ex + dx, ey + dy));
    c.quadraticCurveTo(x + w * 0.55 + dx, y + h * 0.35 + dy, x + dx, y + dy);
    c.closePath();
    c.fillStyle = tone;
    c.fill();
  });
}
/** The dusk sky with its strata and its stars, painted once a scheme and a lyric box (the stars keep off the words). */
const dusky = (e: WorldEnv) => {
  const r = e.rect;
  const box = r ? [r.x0, r.y0, r.x1, r.y1].map((v) => Math.round(v / 24)).join(',') : '-';
  return kept(`cel-dusk|${e.slots.plateInk}|${box}`, W, H, (c) => {
    sky(c, [[0, e.slots.plateInk], [0.45, B4B.x2C1F66], [0.78, B4B.x7A3C8C], [1, B4B.xE0708A]]);
    strat(c, -120, 760, 980, 44, B4B.x33246E, B4B.xF08AA0, 1);
    strat(c, 1100, 700, 940, 36, B4B.x33246E, B4B.xF08AA0, 2);
    strat(c, 260, 880, 1500, 54, B4B.x2A1D5E, B4B.xF6A37E, 3);
    strat(c, -60, 1000, 900, 40, B4B.x24194F, B4B.xE86F8E, 4);
    strat(c, 1180, 1010, 900, 46, B4B.x24194F, B4B.xE86F8E, 5);
    const R = rng(4);
    c.fillStyle = e.slots.ink;
    for (let i = 0; i < 110; i++) {
      const [x, y, rad, a] = [R() * W, R() * 760, 0.8 + R() * 1.8, 0.5 + R() * 0.5];
      if ((y > 260 && y < 600 && x > 320 && x < 1600) || (r && x > r.x0 - 30 && x < r.x1 + 30 && y > r.y0 - 30 && y < r.y1 + 30)) continue;
      c.globalAlpha = a;
      c.beginPath();
      c.arc(x, y, rad, 0, 7);
      c.fill();
    }
    c.globalAlpha = 1;
  });
};
/** The shooting star of board b: a hard tapered tail in three cels and a glint at its head, `k` of the way along. */
function shooting(c: C, e: WorldEnv, k: number, from: [number, number], to: [number, number]) {
  const [hx, hy] = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  const [tx, ty] = [hx - (to[0] - from[0]) * Math.min(k, 1), hy - (to[1] - from[1]) * Math.min(k, 1)];
  const [mx, my] = [hx - (hx - tx) * 0.62, hy - (hy - ty) * 0.62];
  c.save();
  c.globalAlpha = 0.7;
  c.fillStyle = B4B.xB9A6FF;
  path(c, [[tx, ty], [hx, hy - 6], [hx + 6, hy + 2]]);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = e.slots.ink;
  path(c, [[mx, my], [hx, hy - 6], [hx + 2, hy + 6]]);
  c.fill();
  c.restore();
  glint(c, hx + 4, hy, 44, e.slots.ink);
}
/** b: the airbrushed dusk, strata at the foot, one shooting star (it crosses once as the cut opens, then rests). */
const dusk: HandGround = (e) => frame(e, (c) => {
  c.drawImage(dusky(e), 0, 0);
  const r = e.rect;
  if (!r || r.y0 > 200) shooting(c, e, ease(clamp01(e.age / 1.1), 2), [560, 200], [1460, 110]);
  glints(c, e, [[230, 160, 26], [1700, 300, 22], [300, 650, 18], [1680, 680, 20]], e.slots.ink, false);
  dust(c, 2, e.slots.ink);
});

/** c: the eyecatch: a cel split in magenta and cyan with a cream edge, a held dark band with yellow edges, streaks in it. */
const eyecatch: HandGround = (e) => frame(e, (c) => {
  const s = e.slots;
  c.fillStyle = s.ground;
  c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  c.fillStyle = s.ink2;
  path(c, [[-200, -100], [1350, -100], [760, 1180], [-200, 1180]]);
  c.fill();
  c.fillStyle = s.ink;
  path(c, [[1300, 0], [1340, 0], [800, H], [760, H]]);
  c.fill();
  c.fillStyle = s.faint;
  path(c, [[1340, -100], [W + 200, -100], [W + 200, 1180], [760, 1180], [800, H], [1340, 0]]);
  c.fill();
  const r = e.rect;
  const [top, bot] = [Math.min(300, (r?.y0 ?? 400) - 40), Math.max(800, (r?.y1 ?? 700) + 40)];
  c.fillStyle = s.ground;
  c.fillRect(-W * 0.1, top, W * 1.2, bot - top);
  c.fillStyle = s.accent;
  c.fillRect(-W * 0.1, top - 14, W * 1.2, 14);
  c.fillRect(-W * 0.1, bot, W * 1.2, 14);
  c.save();
  c.beginPath();
  c.rect(-W * 0.1, top + 10, W * 1.2, bot - top - 20);
  c.clip();
  runLeft(c, streakStrip('c', top + 10, bot - 10, 30, [B4B.x2E2468, B4B.x352A74], 5), e.now * 420);
  c.restore();
  glints(c, e, [[190, 140, 90], [1720, 170, 60], [1560, 940, 84], [320, 930, 44], [960, 120, 30], [1060, 980, 36]], s.ink);
  dust(c, 3, s.ink);
});

/** d: the ending card: dusk sky at the left with its glints, a diagonal cream edge, the dark panel the columns run down. */
const ending: HandGround = (e) => frame(e, (c) => {
  const s = e.slots;
  sky(c, [[0, B4B.x3B2380], [0.6, s.ink2], [1, B4B.xFF9F7A]]);
  c.fillStyle = s.ground;
  path(c, [[1160, -100], [W + 200, -100], [W + 200, H + 100], [960, H + 100], [980, H]]);
  c.fill();
  c.fillStyle = s.ink;
  path(c, [[1140, -100], [1160, -100], [980, H + 100], [960, H + 100]]);
  c.fill();
  glints(c, e, [[320, 260, 120], [700, 520, 70], [420, 820, 54], [880, 200, 40], [180, 600, 30], [760, 920, 26]], s.ink);
  c.fillStyle = s.ink;
  c.beginPath();
  c.arc(540, 560, 6, 0, 7);
  c.fill();
  dust(c, 4, s.ink);
});

const Gs: Record<string, HandGround> = { 'cel80s/title': title, 'cel80s/dusk': dusk, 'cel80s/eyecatch': eyecatch, 'cel80s/ending': ending };
for (const [id, page] of Object.entries(B4B_MIRRORED)) if (Gs[page]) Gs[id] = mirrorGround(Gs[page]);

const INS: Record<string, HandIn> = {
  // the anime cut: a hard diagonal cel band, magenta then cyan, sweeps across the ground and is gone
  'cel-wipe': { sec: 0.34, draw: (e, q) => frame(e, (c) => {
    const x = -700 + q * (W + 1400);
    c.fillStyle = e.slots.ink2;
    path(c, [[x, 0], [x + 260, 0], [x - 40, H], [x - 300, H]]);
    c.fill();
    c.fillStyle = e.slots.faint;
    path(c, [[x - 320, 0], [x - 120, 0], [x - 420, H], [x - 620, H]]);
    c.fill();
  }) },
};

/** Free spots for a set piece: clear of the words. */
const free = (e: WorldEnv, pts: [number, number, number][]) => pts.filter(([x, y, L]) => !e.rect || !meets({ x0: x - L, y0: y - L, x1: x + L, y1: y + L }, e.rect, 24));

const PIECES: Record<string, Piece> = {
  // glints burst out round the page on the beat, each one held a cel and gone
  'glint-burst': { sec: 1.8, clear: 0, draw: (e, q) => frame(e, (c) => {
    const R = rng(e.seed + 3);
    const spots = free(e, Array.from({ length: 14 }, () => [120 + R() * 1680, 90 + R() * 900, 30 + R() * 70] as [number, number, number]));
    spots.forEach(([x, y, L], i) => { const k = clamp01(q * 2 - i * 0.06); const life = k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; if (life > 0.05) glint(c, x, y, L * (0.4 + 0.6 * life), e.slots.ink); });
  }) },
  // a shooting star crosses the sky once, high, clear of the words
  'shooting-star': { sec: 1.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const high = !e.rect || e.rect.y0 > 260;
    const [a, b]: [[number, number], [number, number]] = high ? [[240, 230], [1700, 70]] : [[240, 1000], [1700, 860]];
    if (q < 0.95) shooting(c, e, ease(q / 0.95, 2), a, b);
  }) },
  // a rush of speed streaks across the top and the foot of the frame, out of the words' way
  'speed-rush': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const r = e.rect;
    const bands: [number, number][] = [[20, r ? Math.max(20, r.y0 - 40) : 300], [r ? Math.min(H - 20, r.y1 + 40) : 780, H - 20]];
    c.save();
    c.globalAlpha = Math.sin(Math.PI * clamp01(q));
    bands.forEach(([y0, y1], k) => { if (y1 - y0 < 40) return; c.save(); c.beginPath(); c.rect(0, y0, W, y1 - y0); c.clip(); runLeft(c, streakStrip(`rush${k}`, 0, H, 70, [e.slots.ink, e.slots.faint, e.slots.ink2], 21 + k), q * 2400); c.restore(); });
    c.restore();
  }) },
};

export const CEL = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
