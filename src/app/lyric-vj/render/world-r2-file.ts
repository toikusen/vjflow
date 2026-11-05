// file, rebuilt from its round-2 board (2026-11-04, 風格設計稿_第二輪/file a–d): a case file laid open on its kraft folder.
// The words are entries on a typed case sheet (header cells, punched holes, the red margin, entry numbers, a footer), two
// lines on a library index card between its blue rules, the section sheet on top of a stack with coloured section tabs,
// and two columns of red-ruled letter paper written from the right. Flat paper with hard 3/4 px shadows, no gradients
// and no blacked-out redactions; only real data on the labels (the song's title and artist, the time of the entry).
import { atBase, ease, H, HandGround, HandIn, mixHex, W, WorldEnv } from './world-craft';
import { artistOf, C, label, titleOnly } from './world-b3-shared';
import { kraftOver } from './world-r2-tex';
import { titleNow } from './world-title';
import { R2 } from './r2-inks';
import { headOf, langOfEnv } from '../labels';

const TYPED = (px: number, weight = 400) => `${weight} ${px}px "Courier Prime", "UoqMunThenKhung", "BIZ UDPMincho", serif`;
const OLD = (px: number) => `400 ${px}px "UoqMunThenKhung", "BIZ UDPMincho", serif`;
const SHADOW = 'rgba(60,40,10,0.22)';
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** The entry's own data: the time it was made; the song and its artist only in the song's opening (world-title.ts). */
const facts = (e: WorldEnv) => { const t = titleNow(e); return { title: titleOnly(t), artist: artistOf(t), at: clock(Math.max(0, e.now - e.age)) }; };
const box = (e: WorldEnv, x0: number, y0: number, x1: number, y1: number) => e.rect ?? { x0, y0, x1, y1 };
/** Rows in a block of a fixed set: a set's `max` keeps a two-row block well over one row's height, so its height tells. */
const rowsIn = (h: number, lead: number, hi: number) => (h - 28 > lead * hi * 1.12 ? 2 : 1);

/** The folder: kraft brown and its fibre, and the inset shadow round the frame's edge. */
function folder(c: C, e: WorldEnv) {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  kraftOver(c, 0.8);
}
function edge(c: C) {
  for (const [x0, y0, x1, y1, x, y, w, h] of [[0, 0, 0, 120, 0, 0, W, 120], [0, H, 0, H - 120, 0, H - 120, W, 120], [0, 0, 120, 0, 0, 0, 120, H], [W, 0, W - 120, 0, W - 120, 0, 120, H]]) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(80,50,10,0.22)');
    g.addColorStop(1, 'rgba(80,50,10,0)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  }
}
/** A sheet of the file's paper, its hard shadow down and right, turned a hair about its middle. */
function sheet(c: C, e: WorldEnv, x: number, y: number, w: number, h: number, turn = 0, tone = e.slots.plate) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(turn);
  c.fillStyle = SHADOW;
  c.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  c.fillStyle = tone;
  c.fillRect(-w / 2, -h / 2, w, h);
  c.restore();
}
const rule = (c: C, x0: number, x1: number, y: number, tone: string, t = 2) => { c.fillStyle = tone; c.fillRect(x0, y - t / 2, x1 - x0, t); };
const vrule = (c: C, x: number, y0: number, y1: number, tone: string, t = 2) => { c.fillStyle = tone; c.fillRect(x - t / 2, y0, t, y1 - y0); };
function hole(c: C, e: WorldEnv, x: number, y: number, w: number, h: number) {
  c.fillStyle = mixHex(e.slots.ground, e.slots.ink, 0.22);
  c.beginPath();
  c.roundRect(x, y, w, h, h / 2);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.roundRect(x - 2, y - 3, w, h, h / 2);
  c.rect(x - 10, y - 10, w + 20, h + 20);
  c.fill('evenodd');
  c.restore();
}
/** The typewriter's kick: the sheet jumps 1 px as each character lands, for the entry's first second. */
const kick = (e: WorldEnv) => (e.age < 1.1 && Math.floor(e.age * 14) % 2 ? 1 : 0);
const page = (e: WorldEnv, f: (c: C) => void) => atBase(e, (c) => f(c));

/** a: the case sheet. Header cells, three punched holes, the red margin, an entry number at each row and a rule under it. */
const caseSheet: HandGround = (e) => page(e, (c) => {
  folder(c, e);
  const f = facts(e);
  const ink = e.slots.plateInk;
  // the folder's tab, top right, with the file's name on it
  c.fillStyle = R2.tab;
  c.beginPath();
  c.roundRect(1380, 40, 330, 90, [10, 10, 0, 0]);
  c.fill();
  label(c, (f.title ? `FILE ─ ${f.title}` : 'FILE').slice(0, 22), 1410, 92, TYPED(30, 700), ink, 1);
  c.translate(0, kick(e));
  sheet(c, e, 120, 96, 1680, 930, -0.0035);
  // the header: title, artist, time
  c.strokeStyle = ink;
  c.lineWidth = 2;
  c.strokeRect(340, 140, 1400, 96);
  const r = box(e, 346, 278, 1600, 586);
  const n = rowsIn(r.y1 - r.y0, 1.33, 206);
  // (only real data in the cells: the song's name only in its opening, the entry's time and how many lines it runs)
  // (the heads are typed in English with the song's own word after it: labels.ts headOf)
  const lang = langOfEnv(e);
  const cells = ([[headOf('title', lang), f.title], [headOf('artist', lang), f.artist], [headOf('time', lang), f.at], [headOf('lines', lang), String(n)]] as [string, string][]).filter(([, v]) => v);
  const cw = 1400 / cells.length;
  cells.forEach(([k, v], i) => {
    const x = 340 + i * cw;
    if (i) vrule(c, x, 142, 234, ink);
    label(c, k, x + 20, 168, TYPED(18), ink, 0.7);
    label(c, v.slice(0, 14), x + 20, 216, TYPED(36, 700), ink, 1);
  });
  // (a key word blown up across the sheet runs over the margin: then the holes, the red rule and the numbers give way)
  const margin = r.x0 >= 330;
  if (margin) for (const y of [276, 542, 808]) hole(c, e, 182, y, 38, 38);
  if (margin) vrule(c, 316, 96, 1026, e.slots.accent, 3);
  const size = (r.y1 - r.y0 - 28) / (n * 1.33);
  const top = r.y0 + 14;
  // (a row stands in the middle of its lead: its rule runs in the gap below it, its number beside its middle)
  for (let i = 0; i <= n; i++) {
    const mid = top + (i + 0.5) * size * 1.33;
    if (mid > 930) break;
    if (margin) label(c, String(i + 1).padStart(2, '0'), 240, mid + 14, TYPED(40, 700), i < n ? e.slots.accent : mixHex(e.slots.plate, ink, 0.25), 1);
    if (i < n) rule(c, 340, 1740, mid + size * 0.665, e.slots.faint);
  }
  rule(c, 340, 1740, 956, e.slots.faint);
  label(c, [f.title, f.artist, f.at].filter(Boolean).join(' / '), 360, 996, TYPED(20), ink, 1);
  edge(c);
});

/** b: the library index card: the red head band, blue rules the words sit on, the red margin, the rod hole below. */
const catalogue: HandGround = (e) => page(e, (c) => {
  folder(c, e);
  const f = facts(e);
  const ink = e.slots.plateInk;
  const blue = mixHex(e.slots.ink2, e.slots.plate, 0.55);
  sheet(c, e, 300, 150, 1320, 790, 0.004);
  rule(c, 300, 1620, 272, e.slots.accent, 4);
  label(c, (f.title || `ENTRY ${f.at}`).slice(0, 20), 370, 238, TYPED(30, 700), ink, 1);
  label(c, [f.artist, f.title ? f.at : ''].filter(Boolean).join('  ').slice(0, 24), 1550, 238, TYPED(30), ink, 1, 'right');
  vrule(c, 450, 274, 940, e.slots.accent, 2);
  const r = box(e, 486, 332, 1500, 690);
  const n = rowsIn(r.y1 - r.y0, 1.69, 150);
  const size = (r.y1 - r.y0 - 28) / (n * 1.69);
  const top = r.y0 + 14;
  let last = 0;
  for (let i = 0; i < n; i++) { last = top + (i + 0.5) * size * 1.69 + size * 0.5 + 16; rule(c, 300, 1620, last, blue); }
  if (last + 110 < 900) rule(c, 300, 1620, last + 110, blue);
  label(c, [f.title, `${n} LINE${n > 1 ? 'S' : ''}`].filter(Boolean).join(' ── ').slice(0, 30), 500, Math.min(880, last + 52), TYPED(22), mixHex(ink, e.slots.plate, 0.3), 1);
  hole(c, e, 920, 850, 80, 46);
  edge(c);
});

/** c: the section sheet on top of a stack, each sheet behind it with its numbered tab on the right edge. */
const sections: HandGround = (e) => page(e, (c) => {
  folder(c, e);
  const f = facts(e);
  const ink = e.slots.plateInk;
  const tabs = [R2.tab, e.slots.ink2, e.slots.accent, R2.sage, R2.tab, R2.heather];
  const back = mixHex(e.slots.plate, e.slots.ground, 0.22);
  tabs.forEach((t, i) => {
    sheet(c, e, 120 + i * 12, 70 + i * 10, 1440, 900, 0, back);
    const y = 60 + i * 150;
    c.fillStyle = SHADOW;
    c.beginPath(); c.roundRect(1563 + i * 12, y + 4, 230 - i * 12, 126, [0, 12, 12, 0]); c.fill();
    c.fillStyle = t;
    c.beginPath(); c.roundRect(1560 + i * 12, y, 230 - i * 12, 126, [0, 12, 12, 0]); c.fill();
    label(c, String(i + 1).padStart(2, '0'), 1650, y + 76, TYPED(36, 700), i === 0 || i === 4 ? ink : e.slots.plate, 1);
  });
  // the front sheet slides in from the left as the section opens, its tab first
  const k = ease(e.age / 0.35, 3);
  c.translate(-80 * (1 - k), 0);
  sheet(c, e, 100, 110, 1440, 870);
  c.strokeStyle = ink;
  c.lineWidth = 3;
  c.strokeRect(180, 170, 300, 180);
  label(c, 'TIME', 200, 204, TYPED(20), ink, 1);
  label(c, f.at, 200, 320, OLD(104), e.slots.accent, 0);
  [f.title, f.artist, `ENTRY ${f.at}`].filter(Boolean).forEach((t, i) => label(c, t.slice(0, 26), 520, 200 + i * 38, TYPED(22), ink, 1));
  rule(c, 180, 1460, 390, ink, 3);
  rule(c, 180, 1460, 922, e.slots.faint);
  c.translate(80 * (1 - k), 0);
  edge(c);
});

/** d: red-ruled letter paper (八行箋): the columns from the right, one a written column, the data in the last on the left. */
const letter: HandGround = (e) => page(e, (c) => {
  folder(c, e);
  const f = facts(e);
  const red = e.slots.accent;
  sheet(c, e, 180, 30, 1560, 1020, 0.003);
  const r = box(e, 1270, 152, 1634, 960);
  const pitch = Math.max(120, (r.x1 - r.x0 - 28) / 2);
  const right = r.x1 - 14;
  const [top, bot] = [126, 996];
  const n = Math.max(2, Math.floor((right - 300) / pitch));
  const left = right - n * pitch;
  c.strokeStyle = red;
  c.lineWidth = 3;
  c.strokeRect(left - 14, top - 14, right - left + 28, bot - top + 28);
  c.lineWidth = 1.5;
  c.strokeRect(left, top, right - left, bot - top);
  for (let i = 1; i < n; i++) vrule(c, right - i * pitch, top, bot, red, 2);
  label(c, [f.title, f.artist, f.at].filter(Boolean).join(' ── ').slice(0, 40), left, top - 40, TYPED(22), red, 1);
  // the file's data down the last column, an old official hand
  c.font = OLD(30);
  c.fillStyle = e.slots.plateInk;
  c.textAlign = 'center';
  [...[f.title, f.artist].filter(Boolean).join('　').slice(0, 22)].forEach((ch, i) => c.fillText(ch, left + pitch / 2, top + 60 + i * 34));
  c.textAlign = 'left';
  edge(c);
});

/** Between lines: the folder closed over its papers, their edges showing, the file's tab with the song's name (a line up gets its card). */
const closed: HandGround = (e) => (e.rect ? catalogue(e) : page(e, (c) => {
  folder(c, e);
  const back = mixHex(e.slots.plate, e.slots.ground, 0.22);
  for (let i = 0; i < 4; i++) sheet(c, e, 210 + i * 9, 150 - i * 7, 1500, 860, 0.004 * (i - 1.5), i === 3 ? e.slots.plate : back);
  c.fillStyle = mixHex(e.slots.ground, e.slots.plateInk, 0.06);
  c.fillRect(170, 190, 1580, 860);
  kraftOver(c, 0.5, 170, 190, 1580, 860);
  c.fillStyle = SHADOW;
  c.fillRect(170, 190, 1580, 5);
  c.fillStyle = R2.tab;
  c.beginPath();
  c.roundRect(1300, 120, 360, 76, [10, 10, 0, 0]);
  c.fill();
  label(c, (facts(e).title ? `FILE ─ ${facts(e).title}` : 'FILE').slice(0, 22), 1330, 170, TYPED(30, 700), e.slots.plateInk, 1);
  edge(c);
}));

/** With no line up (an intro, an interlude) every sheet is the closed folder: no empty form, card or letter paper is ever shown. */
const orClosed = (g: HandGround): HandGround => (e) => (e.rect ? g(e) : closed(e));
const Gs: Record<string, HandGround> = { 'file/folder': closed, 'file/case': orClosed(caseSheet), 'file/catalogue': orClosed(catalogue), 'file/sections': orClosed(sections), 'file/letter': orClosed(letter) };

const INS: Record<string, HandIn> = {
  // a change of part: the top sheet is pulled away up and left, the next one's tab pushed to the front
  'sheet-swap': { sec: 0.42, draw: (e, q) => page(e, (c) => { const k = ease(q, 2); c.save(); c.translate(-1500 * k, -140 * k); c.rotate(-0.06 * k); c.fillStyle = SHADOW; c.fillRect(103, 114, 1700, 900); c.fillStyle = e.slots.plate; c.fillRect(100, 110, 1700, 900); c.restore(); }) },
};

export const FILE = { grounds: Gs, ins: INS, pieces: {}, objects: {} };
