// The things that carry a lyric in a style world: a printer's paper tape, a sign box, a run of LED modules, one loaded stroke
// of ink, a title card, a leaded light, a bound page. Each is painted once for a line from the world's colour slots and moves
// with the words as one piece. Every detail is what the object is really made of; none of it is data.
import { mixHex, roughEdge, tornLine, Pt } from './material';
import { brushStroke } from './world-ink';
import { handInked, HandObject, handObjects } from './world-packs';

export type WorldObject = 'transcript-tape' | 'sign-box' | 'sign-blade' | 'tty-pane' | 'tty-split' | 'led-strip' | 'led-module' | 'led-pillar' | 'ink-stroke' | 'title-card' | 'caption-band' | 'card-corner' | 'book-page' | 'book-leaf' | 'cameo' | HandObject;

/** The colours a part may use: a world's scheme by meaning, never a value of the part's own. */
export interface Slots { ground: string; ink: string; ink2: string; accent: string; plate: string; plateInk: string; faint: string }

/** Space kept round an object for its shadow, px. */
export const OBJECT_MARGIN = 48;

type Ctx = OffscreenCanvasRenderingContext2D;
const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const trace = (c: Ctx, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const shadow = (c: Ctx, blur: number, dy: number, a = 0.5) => { c.shadowColor = `rgba(0,0,0,${a})`; c.shadowBlur = blur; c.shadowOffsetY = dy; c.shadowOffsetX = dy * 0.5; };
const noShadow = (c: Ctx) => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; };
const rounded = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

/** Fine streaks along a surface: the grain a thing got from how it was made. */
function streaks(c: Ctx, x: number, y: number, w: number, h: number, seed: number, n: number, alongX: boolean, tone: string, alpha: number) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.strokeStyle = tone;
  for (let i = 0; i < n; i++) {
    c.globalAlpha = alpha * (0.3 + 0.7 * hash(i, seed));
    c.lineWidth = 0.6 + 1.6 * hash(i, seed + 1);
    const p = hash(i, seed + 2);
    const [q, l] = [hash(i, seed + 3), 0.1 + 0.5 * hash(i, seed + 4)];
    c.beginPath();
    if (alongX) { c.moveTo(x + q * w, y + p * h); c.lineTo(x + (q + l) * w, y + p * h + 1); } else { c.moveTo(x + p * w, y + q * h); c.lineTo(x + p * w + 1, y + (q + l) * h); }
    c.stroke();
  }
  c.restore();
}

/** A log spiral laid down with a tapering pen, the unit every engraved flourish here is built from. */
function scroll(c: Ctx, x: number, y: number, a0: number, r0: number, turns: number, dir: number, width: number) {
  const n = 40;
  let [px, py] = [x, y];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const a = a0 + dir * turns * Math.PI * 2 * k;
    const r = r0 * (1 - k) ** 1.4;
    const step = (r0 * 3.2 * turns) / n;
    const [nx, ny] = [px + Math.cos(a) * step * (1 - k * 0.8), py + Math.sin(a) * step * (1 - k * 0.8)];
    c.lineWidth = Math.max(0.5, width * (1 - k) ** 0.8);
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(nx, ny);
    c.stroke();
    [px, py] = [nx, ny];
    if (r < 0.2) break;
  }
}

/** A corner of engraved flourish, growing out of (x, y) into the page. */
function filigree(c: Ctx, x: number, y: number, dx: number, dy: number, size: number, tone: string) {
  c.save();
  c.strokeStyle = tone;
  c.lineCap = 'round';
  const base = Math.atan2(dy, dx);
  [[0, 1, 1], [-0.65, -1, 0.8], [0.65, 1, 0.8], [-1.05, 1, 0.55], [1.05, -1, 0.55]].forEach(([off, dir, k]) => scroll(c, x, y, base + off, size * k, 0.86, dir, 2.2 * k + 0.7));
  c.restore();
}


/** Tape torn off a thermal printer: thin paper curling at its ends, lit only by whatever is near. */
function tape(c: Ctx, w: number, h: number, s: Slots, seed: number) {
  const n = 24;
  const [left, right] = [tornLine(n, seed, 15), tornLine(n, seed + 3, 15)];
  const out: Pt[] = [...left.map((o, i): Pt => [6 + Math.abs(o), (h * i) / n]), ...[...right].reverse().map((o, i): Pt => [w - 6 - Math.abs(o), (h * (n - i)) / n])];
  shadow(c, 26, 12, 0.7);
  c.fillStyle = s.plate;
  trace(c, out);
  c.fill();
  noShadow(c);
  c.save();
  c.clip();
  const lit = c.createLinearGradient(0, 0, w, 0);
  lit.addColorStop(0, 'rgba(0,0,0,0.62)');
  lit.addColorStop(0.35, 'rgba(0,0,0,0.05)');
  lit.addColorStop(0.72, 'rgba(0,0,0,0)');
  lit.addColorStop(1, 'rgba(0,0,0,0.5)');
  c.fillStyle = lit;
  c.fillRect(0, 0, w, h);
  const roll = c.createLinearGradient(0, 0, 0, h);
  roll.addColorStop(0, 'rgba(0,0,0,0.34)');
  roll.addColorStop(0.16, 'rgba(0,0,0,0)');
  roll.addColorStop(0.86, 'rgba(0,0,0,0)');
  roll.addColorStop(1, 'rgba(0,0,0,0.26)');
  c.fillStyle = roll;
  c.fillRect(0, 0, w, h);
  streaks(c, 0, 0, w, h, seed, 150, true, s.plateInk, 0.09);
  // the print head leaves a band where it ran hot
  c.fillStyle = s.faint;
  c.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) c.fillRect(0, h * (0.2 + 0.3 * i) + 8 * hash(i, seed), w, 1.4);
  if (look === 1) { c.globalAlpha = 0.5; for (let x = 14; x < w; x += 26) { c.beginPath(); c.arc(x, 9, 3, 0, Math.PI * 2); c.arc(x, h - 9, 3, 0, Math.PI * 2); c.fill(); } }
  c.restore();
}

function signBox(c: Ctx, w: number, h: number, s: Slots, seed: number, tall: boolean) {
  const r = 26;
  shadow(c, 44, 22, 0.75);
  c.fillStyle = s.plate;
  rounded(c, 0, 0, w, h, r);
  c.fill();
  noShadow(c);
  c.save();
  rounded(c, 0, 0, w, h, r);
  c.clip();
  streaks(c, 0, 0, w, h, seed, 180, !tall, s.ink, 0.05);
  const edge = c.createLinearGradient(0, 0, w, h);
  edge.addColorStop(0, 'rgba(255,255,255,0.08)');
  edge.addColorStop(0.5, 'rgba(255,255,255,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = edge;
  c.fillRect(0, 0, w, h);
  c.restore();
  // the return's lip, then one border tube with its dark blocked-out jump where the glass was bent back
  c.strokeStyle = mixHex(s.plate, s.ink, 0.22);
  c.lineWidth = 3;
  rounded(c, 7, 7, w - 14, h - 14, r - 6);
  c.stroke();
  const inset = 26;
  const per = 2 * (w + h - 4 * inset);
  const gap = 34;
  c.setLineDash([per * 0.62, gap, per * 0.3, gap]);
  c.lineDashOffset = seed % 200;
  c.lineWidth = 7;
  c.strokeStyle = s.accent;
  c.shadowColor = s.accent;
  c.shadowBlur = 26;
  rounded(c, inset, inset, w - inset * 2, h - inset * 2, 16);
  c.stroke();
  c.stroke();
  noShadow(c);
  c.lineWidth = 2.4;
  c.strokeStyle = mixHex(s.accent, s.ink, 0.72);
  c.stroke();
  c.setLineDash([]);
  if (look === 1) { c.lineWidth = 5; c.strokeStyle = s.ink2; c.shadowColor = s.ink2; c.shadowBlur = 18; rounded(c, inset + 16, inset + 16, w - (inset + 16) * 2, h - (inset + 16) * 2, 10); c.stroke(); noShadow(c); }
  if (look === 2) { c.fillStyle = s.plateInk; for (let x = 44; x < w - 30; x += 46) for (const y of [13, h - 13]) { c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill(); } }
  // screws and the transformer lead
  c.fillStyle = mixHex(s.plate, s.ink, 0.35);
  [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2); c.fill(); });
  c.strokeStyle = 'rgba(0,0,0,0.7)';
  c.lineWidth = 3;
  c.beginPath();
  if (tall) { c.moveTo(w / 2, h); c.bezierCurveTo(w / 2 + 10, h + 12, w / 2 - 12, h + 22, w / 2 + 4, h + 44); } else { c.moveTo(w * 0.12, h); c.bezierCurveTo(w * 0.13, h + 16, w * 0.09, h + 24, w * 0.1, h + 44); }
  c.stroke();
}

/** A window round the line: title bar, three lights, the same window the desktop's other windows are. */
function ttyBox(c: Ctx, w: number, h: number, s: Slots, _seed: number) {
  const bar = 54;
  shadow(c, 40, 14, 0.6);
  c.fillStyle = s.plate;
  rounded(c, 0, 0, w, h, 16);
  c.fill();
  noShadow(c);
  c.save();
  rounded(c, 0, 0, w, h, 16);
  c.clip();
  c.fillStyle = mixHex(s.plate, s.ink, 0.86);
  c.fillRect(0, 0, w, bar);
  c.restore();
  [s.accent, s.ink2, s.ink].forEach((tone, i) => { c.fillStyle = tone; c.beginPath(); c.arc(30 + i * 34, bar / 2, 11, 0, Math.PI * 2); c.fill(); });
  c.strokeStyle = s.ink;
  c.globalAlpha = 0.7;
  c.lineWidth = 2;
  rounded(c, 1, 1, w - 2, h - 2, 16);
  c.stroke();
  c.globalAlpha = 1;
}

const LAMP = 9;
function ledPanel(c: Ctx, w: number, h: number, s: Slots, seed: number, moduleW: number) {
  shadow(c, 30, 14, 0.7);
  c.fillStyle = s.plate;
  rounded(c, 0, 0, w, h, 6);
  c.fill();
  noShadow(c);
  // every lamp is there whether it is lit or not; the odd one sits a little dimmer
  c.fillStyle = s.faint;
  for (let y = 10; y < h - 8; y += LAMP)
    for (let x = 10; x < w - 8; x += LAMP) {
      c.globalAlpha = 0.34 + 0.2 * hash(x, y + seed);
      c.beginPath();
      c.arc(x, y, 2.1, 0, Math.PI * 2);
      c.fill();
    }
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.lineWidth = 2;
  c.beginPath();
  for (let x = moduleW; x < w - 20; x += moduleW) { c.moveTo(x, 4); c.lineTo(x, h - 4); }
  c.stroke();
  c.strokeStyle = mixHex(s.plate, s.ink, 0.2);
  c.lineWidth = 3;
  rounded(c, 1.5, 1.5, w - 3, h - 3, 5);
  c.stroke();
}

/** One loaded stroke across the block: wet and whole under the words, running dry past them. */
function inkStroke(c: Ctx, w: number, h: number, s: Slots, seed: number) {
  const bow = [0.06, -0.08, 0.02][look];
  c.drawImage(brushStroke(seed + 1 + look, [[6, h * (0.5 + bow * 0.4)], [w * 0.5, h * (0.5 - bow)], [w + 40, h * (0.5 + bow)]], h * 0.86, s.plate, w, h, [0.8, 0.72, 0.76][look]), 0, 0);
}

function titleCard(c: Ctx, w: number, h: number, s: Slots, seed: number) {
  shadow(c, 34, 0, 0.8);
  c.fillStyle = s.plate;
  c.fillRect(0, 0, w, h);
  noShadow(c);
  streaks(c, 0, 0, w, h, seed, 40, false, s.plateInk, 0.05);
  c.strokeStyle = s.plateInk;
  c.globalAlpha = 0.86;
  c.lineWidth = 3.4;
  c.strokeRect(28, 28, w - 56, h - 56);
  c.lineWidth = 1.2;
  c.strokeRect(40, 40, w - 80, h - 80);
  c.globalAlpha = 0.9;
  // the title artist's brush: a leaf spray in each corner, thick to thin, never ruled
  const spray = Math.min(150, h * 0.3);
  c.lineCap = 'round';
  if (look) c.lineWidth = 2;
  if (look === 2) { const r = Math.min(70, h * 0.14); [[40, 40], [w - 40, 40], [w - 40, h - 40], [40, h - 40]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = s.plate; c.fill(); c.stroke(); c.beginPath(); c.arc(x, y, r * 0.7, 0, Math.PI * 2); c.stroke(); }); }
  if (look === 0) [[40, 40, 1, 1], [w - 40, 40, -1, 1], [w - 40, h - 40, -1, -1], [40, h - 40, 1, -1]].forEach(([x, y, dx, dy]) => {
    c.save();
    c.translate(x, y);
    c.scale(dx, dy);
    c.fillStyle = s.plateInk;
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      const [px, py] = [spray * (1 - k) * 0.96 + 8, spray * k * 0.96 + 8];
      c.save();
      c.translate(px, py);
      c.rotate(Math.PI / 4 + (i - 3) * 0.28);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(26, -12, 54 - 3 * Math.abs(i - 3), 0);
      c.quadraticCurveTo(26, 12, 0, 0);
      c.fill();
      c.restore();
    }
    c.lineWidth = 3;
    c.strokeStyle = s.plateInk;
    c.beginPath();
    c.moveTo(spray, 8);
    c.quadraticCurveTo(spray * 0.4, spray * 0.4, 8, spray);
    c.stroke();
    c.restore();
  });
  // a rule with a lozenge at the middle of top and foot, as the title artist would finish a card
  [62, h - 62].forEach((y) => {
    c.beginPath();
    c.moveTo(w * 0.34, y);
    c.lineTo(w * 0.66, y);
    c.lineWidth = 1.2;
    c.stroke();
    c.save();
    c.translate(w / 2, y);
    c.rotate(Math.PI / 4);
    c.fillStyle = s.plateInk;
    c.fillRect(-4.5, -4.5, 9, 9);
    c.restore();
  });
  c.globalAlpha = 1;
}

function bookPage(c: Ctx, w: number, h: number, s: Slots, seed: number, gutter: -1 | 0 | 1) {
  shadow(c, 42, 18, 0.72);
  c.fillStyle = s.plate;
  trace(c, roughEdge([[0, 0], [w, 0], [w, h], [0, h]], seed, 1.6, 26));
  c.fill();
  noShadow(c);
  // foxing, and the page falling away into the gutter
  for (let i = 0; i < 26; i++) {
    const [x, y, r] = [hash(i, seed) * w, hash(i, seed + 1) * h, 8 + 34 * hash(i, seed + 2)];
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(60,30,10,${0.06 * hash(i, seed + 3)})`);
    g.addColorStop(1, 'rgba(60,30,10,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (gutter) {
    const g = c.createLinearGradient(gutter < 0 ? 0 : w, 0, gutter < 0 ? 90 : w - 90, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  c.strokeStyle = s.accent;
  c.lineWidth = 2.6;
  c.strokeRect(30, 30, w - 60, h - 60);
  c.lineWidth = 1;
  c.strokeRect(38, 38, w - 76, h - 76);
  const size = Math.min(78, Math.min(w, h) * 0.13) * (look === 2 ? 1.5 : 1);
  if (look === 1) { c.strokeRect(50, 50, w - 100, h - 100); c.fillStyle = s.accent; [[w / 2, 44], [w / 2, h - 44], [44, h / 2], [w - 44, h / 2]].forEach(([x, y]) => { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-7, -7, 14, 14); c.restore(); }); return; }
  [[38, 38, 1, 1], [w - 38, 38, -1, 1], [w - 38, h - 38, -1, -1], [38, h - 38, 1, -1]].forEach(([x, y, dx, dy]) => filigree(c, x, y, dx, dy, size, s.accent));
  [-1, 1].forEach((d) => filigree(c, w / 2, d < 0 ? 38 : h - 38, 0, -d, size * 0.62, s.accent));
}

function cameo(c: Ctx, w: number, h: number, s: Slots) {
  const [cx, cy, a, b] = [w / 2, h / 2, w / 2 - 14, h / 2 - 14];
  shadow(c, 34, 14, 0.7);
  c.fillStyle = s.plate;
  c.beginPath();
  c.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2);
  c.fill();
  noShadow(c);
  c.strokeStyle = s.accent;
  c.lineWidth = 5;
  c.stroke();
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(cx, cy, a - 14, b - 14, 0, 0, Math.PI * 2);
  c.stroke();
  // the beaded bezel
  c.fillStyle = s.accent;
  const n = Math.round((a + b) * 1.1 / 9);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    c.beginPath();
    c.arc(cx + Math.cos(t) * (a - 7), cy + Math.sin(t) * (b - 7), 3.2, 0, Math.PI * 2);
    c.fill();
  }
  filigree(c, cx, cy - b + 18, 0, 1, 42, s.accent);
  filigree(c, cx, cy + b - 18, 0, -1, 42, s.accent);
}

/** Which of a world object's makes this song gets: same object, another hand. */
let look = 0;
const PAINT: Record<WorldObject, (c: Ctx, w: number, h: number, s: Slots, seed: number) => void> = {
  'transcript-tape': tape,
  'sign-box': (c, w, h, s, seed) => signBox(c, w, h, s, seed, false),
  'sign-blade': (c, w, h, s, seed) => signBox(c, w, h, s, seed, true),
  'tty-pane': ttyBox,
  'tty-split': ttyBox,
  'led-strip': (c, w, h, s, seed) => ledPanel(c, w, h, s, seed, [288, 192, 432][look]),
  'led-module': (c, w, h, s, seed) => ledPanel(c, w, h, s, seed, [288, 144, 216][look]),
  'led-pillar': (c, w, h, s, seed) => ledPanel(c, w, h, s, seed, 2000),
  'ink-stroke': inkStroke,
  'title-card': titleCard,
  // a printed title strip, opaque: a see-through band read as a grey bar under the words (2026-11-04 audit)
  'caption-band': (c, w, h, s) => { c.fillStyle = s.plate; c.globalAlpha = 1; c.fillRect(0, 0, w, h); c.globalAlpha = 0.8; c.fillStyle = s.plateInk; c.fillRect(0, 7, w, 1.4); c.fillRect(0, h - 8, w, 1.4); c.globalAlpha = 1; },
  'card-corner': (c, w, h, s) => { shadow(c, 16, 0, 0.7); c.fillStyle = s.plate; c.fillRect(0, 0, w, h); noShadow(c); c.strokeStyle = s.plateInk; c.lineWidth = 1.6; c.strokeRect(12, 12, w - 24, h - 24); },
  'book-page': (c, w, h, s, seed) => bookPage(c, w, h, s, seed, 0),
  'book-leaf': (c, w, h, s, seed) => bookPage(c, w, h, s, seed, seed % 2 ? -1 : 1),
  cameo,
  ...(Object.fromEntries(Object.entries(handObjects).map(([k, f]) => [k, (c: Ctx, w: number, h: number, s: Slots, seed: number) => f(c, w, h, s, seed, look)])) as Record<HandObject, (c: Ctx, w: number, h: number, s: Slots, seed: number) => void>),
};

/** The colour the words take on this object. */
export const objectInk = (o: WorldObject, s: Slots) => (['sign-box', 'sign-blade', 'tty-pane', 'tty-split', 'led-strip', 'led-module', 'led-pillar', ...handInked].includes(o) ? s.ink : s.plateInk);

const painted = new Map<string, OffscreenCanvas>();
/** The object for a block `w` × `h`, shadow margin included in the canvas. Kept: chorus lines come back with the same one. */
export function paintObject(o: WorldObject, w: number, h: number, s: Slots, seed: number, variant = 0): OffscreenCanvas {
  const [qw, qh] = [Math.ceil(w / 12) * 12, Math.ceil(h / 12) * 12];
  const key = `${o}|${qw}|${qh}|${s.plate}|${s.accent}|${s.ink}|${seed % 4}|${variant}`;
  const hit = painted.get(key);
  if (hit) return hit;
  const cv = new OffscreenCanvas(qw + OBJECT_MARGIN * 2, qh + OBJECT_MARGIN * 2);
  const c = cv.getContext('2d')!;
  c.translate(OBJECT_MARGIN, OBJECT_MARGIN);
  look = variant;
  PAINT[o](c, qw, qh, s, seed % 4);
  if (painted.size > 40) painted.delete(painted.keys().next().value!);
  painted.set(key, cv);
  return cv;
}
