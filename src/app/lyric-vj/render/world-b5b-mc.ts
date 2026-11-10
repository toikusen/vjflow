// midcentury, from its board (2026-11-06, 風格第5批設計稿/midcentury a–d; source out/research/boards-b5/boards/midcentury.html),
// pushed, as the review asked, from "generic retro" to unmistakable fifties modern: the screen-printed record sleeve and
// the Saul Bass title. Every shape is cut from coloured paper with a slightly rough edge and printed in flat screen-print
// ink (mustard, teal, orange-red, olive, cream, black) on cream stock, plates overlapping in multiply and out of register:
// - the atomic starburst (thin spikes of two lengths round a hub, ball ends on the long ones) and the sputnik;
// - the boomerang (two tapering arms at an open angle, round tips) and the kidney (a three-lobed amoeba);
// - Bass's cut-paper figure: a column of rough black bars, each at its own small angle, an orange square beside it;
// - each colour bar printed with its black key plate a few pixels off, the way a hand-pulled print misses;
// - litho specks: the stock's tooth and stray ink, crisp, no blur.
// No waves anywhere: the flat sea of the first board was citypop's. No buildings, pools or night views (citypop), no
// halftone dots or comic panels (popart), no gradients. Small print: the song's title and artist in its opening only
// (world-title.ts), then the line's part and start time, set wide in the face, separated by long rules.
import type { Piece } from './world-pieces';
import { clamp01, ease, HandGround, HandIn, mixHex, WorldEnv } from './world-craft';
import { C, mirrorGround, onPage, rng, still } from './world-b3-shared';
import { B5B } from './b5b-inks';
import { B5B_MIRRORED, MC_BARS, SET_BANDS } from './world-b5b-sets';
import { declareCarrier, LINE_CLEAR, strokeClear, subtractBox, toPx } from './carrier-fit';
import { dataLine, frame, H, isJa, meets, page, small, twoPhrases, W } from './world-b5b-shared';

type Pt = [number, number];
const SM = (px: number, ja: boolean) => `400 ${px}px ${ja ? '"Shippori Antique B1"' : '"Chocolate Classical Sans"'}, "Noto Sans TC", sans-serif`;
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;

/** A hand-cut edge: the polygon's sides walked with a small seeded jitter (scissors, not a ruler). */
function cut(pts: Pt[], amp: number, seed: number, step = 5): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [];
  let o = 0;
  pts.forEach(([x0, y0], k) => {
    const [x1, y1] = pts[(k + 1) % pts.length];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(L / step));
    const [nx, ny] = [-(y1 - y0) / L, (x1 - x0) / L];
    for (let i = 0; i < n; i++) { o = o * 0.6 + (r() - 0.5) * amp; const t = i / n; out.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); }
  });
  return out;
}
const path = (c: C, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
/** A cut shape printed in one ink. */
const shape = (c: C, pts: Pt[], fill: string, seed: number, amp = 2.2) => { path(c, cut(pts, amp, seed)); c.fillStyle = fill; c.fill(); };
/** A colour bar and its black key plate printed a few pixels out of register (a rough keyline, down and right). */
function bar(c: C, x: number, y: number, w: number, h: number, fill: string, key: string, seed: number, off: Pt = [16, 14], words?: WorldEnv['rect']) {
  shape(c, rect(x, y, w, h), fill, seed);
  // (the key plate's line is never drawn within LINE_CLEAR of the words: render/carrier-fit strokeClear)
  strokeClear(c, () => {
    path(c, cut(rect(x + off[0], y + off[1], w, h), 1.5, seed + 40));
    c.strokeStyle = key;
    c.lineWidth = MC_BARS.keyWidth;
    c.stroke();
  }, [], words);
}
/** The atomic starburst: `n` thin spikes round a hub, long and short in turn, a ball at the end of each long one. */
function starburst(c: C, x: number, y: number, r: number, fill: string, n = 12, rot = 0) {
  c.fillStyle = fill;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const L = i % 2 ? r * 0.55 : r;
    const w = r * 0.045;
    const [ux, uy, px, py] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    c.beginPath(); c.moveTo(x + px * w, y + py * w); c.lineTo(x + ux * L, y + uy * L); c.lineTo(x - px * w, y - py * w); c.closePath(); c.fill();
    if (!(i % 2)) { c.beginPath(); c.arc(x + ux * L, y + uy * L, r * 0.07, 0, 7); c.fill(); }
  }
  c.beginPath(); c.arc(x, y, r * 0.12, 0, 7); c.fill();
}
/** A four-point twinkle star (the board's), thin. */
function twinkle(c: C, x: number, y: number, r: number, fill: string) {
  const k = r * 0.14;
  c.fillStyle = fill;
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + k, y - k); c.lineTo(x + r, y); c.lineTo(x + k, y + k); c.lineTo(x, y + r); c.lineTo(x - k, y + k); c.lineTo(x - r, y); c.lineTo(x - k, y - k); c.closePath(); c.fill();
}
/** The boomerang: two arms from a round elbow at an open angle, each bending a little and tapering to a round tip (printed
 * opaque: its parts overlap at the elbow). */
function boomerang(c: C, x: number, y: number, s: number, rot: number, fill: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  c.fillStyle = fill;
  for (const dir of [-1, 1]) {
    // the arm's centre line, bending toward the open side, and its half width, from the elbow out
    const at = (t: number): Pt => [dir * 150 * t, 70 * t - 26 * Math.sin(Math.PI * t)];
    const half = (t: number) => 30 - 14 * t;
    const L: Pt[] = [];
    const R: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const [p, q] = [at(Math.max(0, t - 0.01)), at(Math.min(1, t + 0.01))];
      const n = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const [nx, ny] = [-(q[1] - p[1]) / n, (q[0] - p[0]) / n];
      const [cx, cy] = at(t);
      L.push([cx + nx * half(t), cy + ny * half(t)]);
      R.push([cx - nx * half(t), cy - ny * half(t)]);
    }
    const [tx, ty] = at(1);
    const a0 = Math.atan2(L[24][1] - ty, L[24][0] - tx);
    const tip: Pt[] = Array.from({ length: 13 }, (_, k) => { const a = a0 - (Math.PI * k) / 12; return [tx + Math.cos(a) * half(1), ty + Math.sin(a) * half(1)]; });
    const pts = [...L, ...tip, ...R.reverse()];
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.fill();
  }
  c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
  c.restore();
}
/** The kidney: a bean, one long side drawn in, the other full, a closed smooth outline. */
function kidney(c: C, x: number, y: number, rx: number, ry: number, fill: string, seed: number) {
  const tilt = (rng(seed)() - 0.5) * 0.4;
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = 1 - 0.42 * Math.exp(-((a - Math.PI * 1.5) ** 2) / 0.22) + 0.06 * Math.cos(2 * a);
    const [px, py] = [Math.cos(a) * rx * r, Math.sin(a) * ry * r];
    const [qx, qy] = [px * Math.cos(tilt) - py * Math.sin(tilt), px * Math.sin(tilt) + py * Math.cos(tilt)];
    if (i) c.lineTo(x + qx, y + qy); else c.moveTo(x + qx, y + qy);
  }
  c.closePath();
  c.fill();
}
/** Bass's figure: a column of rough black bars, each at its own small angle, an orange square beside it. */
function bassColumn(c: C, x: number, y: number, h: number, key: string, accent: string, seed: number) {
  const r = rng(seed);
  let yy = y;
  for (let i = 0; i < 5 && yy < y + h; i++) {
    const [w, hh, a] = [44 + r() * 26, 90 + r() * 90, (r() - 0.5) * 0.5];
    c.save(); c.translate(x, yy + hh / 2); c.rotate(a); shape(c, rect(-w / 2, -hh / 2, w, hh), key, seed + i, 1.6); c.restore();
    yy += hh + 22 + r() * 30;
  }
  shape(c, rect(x - 120, y + h * 0.42, 46, 46), accent, seed + 9);
}
/** The stock's tooth and stray ink: crisp specks, dark and light. */
function litho(c: C, seed: number, dens = 1) {
  const r = rng(seed);
  c.fillStyle = 'rgba(30,27,24,0.42)';
  for (let i = 0; i < 9000 * dens; i++) { const s = r() < 0.9 ? 1 : 2; c.fillRect(r() * W, r() * H, s, s); }
  c.fillStyle = 'rgba(255,250,235,0.5)';
  for (let i = 0; i < 5000 * dens; i++) c.fillRect(r() * W, r() * H, 1, 1);
}
/** Tells the reading gate the bars this frame's line is read on and their key plates' lines (the set's own bands, the second only where it is printed). */
const declareBands = (e: WorldEnv, set: string) => {
  const bands = SET_BANDS[set].filter((b) => b.part !== 'small' || twoPhrases(e));
  // (the key plates' lines as drawn: cleared round the words, strokeClear)
  const r = inked(e.rect);
  const keep = r && { x0: r.x0 - LINE_CLEAR, y0: r.y0 - LINE_CLEAR, x1: r.x1 + LINE_CLEAR, y1: r.y1 + LINE_CLEAR };
  declareCarrier(e, bands.map((b) => toPx(b.box)), bands.flatMap((b) => (b.lines ?? []).map(toPx)).flatMap((l) => (keep ? subtractBox(l, keep) : [l])));
};
/** The words' box grown by the second plate's reach (REGISTER, 0.03 em: under 8 px at the sets' largest 190 px). */
const REG_REACH = 8;
const inked = (r: WorldEnv['rect']) => r && { x0: r.x0 - REG_REACH, y0: r.y0 - REG_REACH, x1: r.x1 + REG_REACH, y1: r.y1 + REG_REACH };
const keyOf = (e: WorldEnv) => `${e.item?.part}|${e.item?.at}`;
/** A ground that is dark at dusk: the teal ink run deeper with black. */
const duskOf = (e: WorldEnv) => mixHex(e.slots.ink2, e.slots.ink, 0.45);

/** a: the first phrase on a mustard bar, the rest on a teal bar, both out of register with their key plate; Bass's cut column
 * at the right with its orange square; a boomerang and a starburst. */
const cutPage: HandGround = (e) => { page(e, 'mc-cut', (c) => {
  const s = e.slots;
  const { main, small: second } = MC_BARS.cut;
  c.fillStyle = s.ground; c.fillRect(0, 0, W, H);
  bar(c, main[0], main[1], main[2], main[3], s.plate, s.ink, 1, undefined, inked(e.rect));
  if (twoPhrases(e)) bar(c, second[0], second[1], second[2], second[3], s.ink2, s.ink, 2, undefined, inked(e.rect));
  bassColumn(c, 1640, 120, 860, s.ink, s.accent, 4);
  boomerang(c, 1300, 950, 0.95, -0.2, s.accent);
  starburst(c, 1530, 140, 70, s.ink2, 12, 0.2);
  small(c, dataLine(e, ' ── '), 206, 186, SM(30, isJa(e)), 30, s.ink, 5);
  litho(c, 3);
}, keyOf(e)); declareBands(e, 'midcentury/cut'); };

/** b: dusk: the line in cream; an atomic starburst and two twinkles up at the right; a kidney and a boomerang laid over each
 * other low at the left (the overlap a third ink). */
const duskPage: HandGround = (e) => { page(e, 'mc-dusk', (c) => {
  const s = e.slots;
  c.fillStyle = duskOf(e); c.fillRect(0, 0, W, H);
  starburst(c, 1500, 190, 110, s.plate, 16, 0.1);
  for (const [x, y, r] of [[1760, 120, 22], [1300, 110, 16], [1740, 420, 18], [300, 140, 20]] as [number, number, number][]) if (!meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, e.rect, 10)) twinkle(c, x, y, r, s.faint);
  kidney(c, 380, 960, 380, 150, mixHex(s.ink2, s.faint, 0.3), 5);
  boomerang(c, 660, 930, 1.5, 0.12, s.plate);
  // (where the mustard lies over the kidney, the two plates print a third ink)
  c.save(); c.globalCompositeOperation = 'multiply'; c.beginPath(); c.rect(0, 0, W, H); c.clip(); kidney(c, 380, 960, 380, 150, mixHex(s.ink2, s.faint, 0.3), 5); c.restore();
  small(c, dataLine(e, ' ── '), 306, 220, SM(28, isJa(e)), 28, s.plate, 5);
  litho(c, 4, 0.6);
}, keyOf(e)); };

/** The planes' inks in turn: each takes black type at 4.5:1 or better. */
const planeInks = (e: WorldEnv) => [e.slots.plate, B5B.x9CC4BC, B5B.xE9A07A, mixHex(e.slots.ink2, e.slots.faint, 0.62)];
/** c: a short line climbing a row of cut planes, a character a plane, each plane's dark side cut beside it; a starburst. */
const planesPage: HandGround = (e) => { page(e, 'mc-planes', (c) => {
  const s = e.slots;
  c.fillStyle = s.ground; c.fillRect(0, 0, W, H);
  const r = e.rect ?? { x0: 200, y0: 160, x1: 1720, y1: 920 };
  const n = [...(e.item?.text ?? '').replace(/[\s\p{P}\p{S}]/gu, '')].length;
  // (planes only under a short line climbing them: a longer line on this page, a later one in its shot, stands on the stock)
  const climbs = n >= 2 && n <= 6 && !!e.rect && (e.rect.y1 - e.rect.y0) > (e.rect.x1 - e.rect.x0) * 0.2;
  // (the set's own numbers: each character a size wide, 0.62 of a size apart, each 0.56 of a size above the one before)
  const size = (r.x1 - r.x0) / (n + 0.62 * (n - 1));
  const inks = planeInks(e);
  for (let i = 0; climbs && i < n; i++) {
    const cx = r.x0 + size / 2 + i * size * 1.62;
    const cy = r.y1 - size * 0.55 - i * size * 0.56;
    const [x0, x1, top] = [cx - size * 0.8, cx + size * 0.62, cy - size * 0.78];
    shape(c, [[x0, top + size * 0.12], [x1, top - size * 0.12], [x1 + 6, H + 20], [x0 + 6, H + 20]], inks[i % inks.length], 10 + i);
    shape(c, [[x1, top - size * 0.12], [x1 + size * 0.2, top + size * 0.04], [x1 + size * 0.2, H + 20], [x1 + 6, H + 20]], s.ink, 20 + i, 1);
  }
  starburst(c, 230, 260, 90, s.ink, 12, 0.3);
  boomerang(c, 380, 120, 0.7, 0.3, s.accent);
  small(c, dataLine(e, ' ── '), 150, 96, SM(30, isJa(e)), 30, s.ink, 5);
  litho(c, 5);
}, `${keyOf(e)}|${e.item?.text}`); };

/** d: a record sleeve: the first phrase in cream on a black bar, the rest in black on a cream bar, a thin orange upright;
 * boomerangs and a starburst at the right; the data under the bars. */
const sleevePage: HandGround = (e) => { page(e, 'mc-sleeve', (c) => {
  const s = e.slots;
  const { main, mainKey, small: second, smallKey } = MC_BARS.sleeve;
  c.fillStyle = s.ground; c.fillRect(0, 0, W, H);
  bar(c, main[0], main[1], main[2], main[3], s.ink, s.accent, 30, [mainKey[0], mainKey[1]], inked(e.rect));
  if (twoPhrases(e)) bar(c, second[0], second[1], second[2], second[3], s.faint, s.ink, 31, [smallKey[0], smallKey[1]], inked(e.rect));
  shape(c, rect(1430, 520, 40, 240), s.accent, 33);
  boomerang(c, 1640, 300, 1.2, -0.35, s.ink2);
  boomerang(c, 1680, 840, 0.9, 2.8, s.accent);
  starburst(c, 1700, 560, 80, s.ink, 12, 0.15);
  small(c, dataLine(e, ' ── '), 186, 880, SM(30, isJa(e)), 30, s.ink, 5);
  litho(c, 6);
}, keyOf(e)); declareBands(e, 'midcentury/sleeve'); };

const Gs: Record<string, HandGround> = { 'midcentury/cut': cutPage, 'midcentury/dusk': duskPage, 'midcentury/planes': planesPage, 'midcentury/sleeve': sleevePage };
for (const [id, page] of Object.entries(B5B_MIRRORED)) if (Gs[page]) Gs[id] = mirrorGround(Gs[page]);

const INS: Record<string, HandIn> = {
  // a change of part: a mustard cut panel, its edge angled, wipes across in four hard steps, its key plate off register
  'cut-wipe': { sec: 0.32, draw: (e, q) => frame(e, (c) => {
    // (a narrow cut band, not a sheet: it is over in a third of a second and never stands under a line being read)
    const k = stepsOf(q, 4);
    if (k >= 1) return;
    const x = -300 + (W + 600) * k;
    shape(c, [[x, -20], [x + 220, -20], [x - 40, H + 20], [x - 260, H + 20]], e.slots.plate, 7, 2);
    path(c, cut([[x + 234, -20], [x - 26, H + 20]], 1.5, 8));
    c.strokeStyle = e.slots.ink; c.lineWidth = 4; c.stroke();
  }) },
};

const freeSpot = (e: WorldEnv, spots: Pt[], r: number) => spots.find(([x, y]) => !meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, e.rect, 24));
const PIECES: Record<string, Piece> = {
  // a sputnik in a free corner, its rods turning a notch at a time (limited animation), the second plate off register
  'sputnik': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[300, 880], [1400, 900], [300, 210], [1400, 190]], 150);
    if (!at) return;
    c.save();
    c.globalAlpha = Math.min(ease(q / 0.15, 2), 1 - clamp01((q - 0.88) / 0.12));
    const rot = stepsOf(q, 8) * Math.PI * 0.5;
    starburst(c, at[0] + 8, at[1] + 6, 120, e.slots.accent, 8, rot);
    starburst(c, at[0], at[1], 120, e.slots.ink, 8, rot);
    c.fillStyle = e.slots.plate; c.beginPath(); c.arc(at[0], at[1], 34, 0, 7); c.fill();
    c.restore();
  }) },
  // a boomerang thrown across the top of the frame in hard steps, turning as it goes
  'boomerang-fly': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const k = stepsOf(q, 10);
    const y = e.rect && e.rect.y0 < 260 ? 980 : 130;
    const [x0, x1] = [-200, W + 200];
    boomerang(c, x0 + (x1 - x0) * k, y + Math.sin(k * Math.PI) * -40, 0.9, k * Math.PI * 4, e.slots.accent);
  }) },
  // the atom: three cut orbits round a nucleus in a free corner, the orbits printed one plate after another
  'atom-orbit': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1640, 820], [280, 820], [1640, 240], [280, 240]], 160);
    if (!at) return;
    c.save();
    c.globalAlpha = 1 - clamp01((q - 0.88) / 0.12);
    c.lineWidth = 9;
    const n = Math.min(3, Math.floor(q * 9));
    for (let i = 0; i < n; i++) { c.strokeStyle = [e.slots.ink, e.slots.ink2, e.slots.accent][i]; c.beginPath(); c.ellipse(at[0], at[1], 140, 46, (i * Math.PI) / 3, 0, 7); c.stroke(); }
    c.fillStyle = e.slots.accent; c.beginPath(); c.arc(at[0], at[1], 22, 0, 7); c.fill();
    c.restore();
  }) },
};

export const MC = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
