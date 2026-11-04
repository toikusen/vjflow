// card 節拍閃卡, rebuilt from its round-2 board (2026-11-04, 風格設計稿_第二輪/card a–d): flash cards that turn over on the
// beat. One main card on the table with the deck beside it (its backs up, waiting), one level card for a calm song, a hand
// fanned across the top with the beat card in front, and a pair: the second card lands on the first one's corner, never on
// its words. The card's corner pictogram (quarter disc, triangle, square, bar) is the beat of the bar, the four pips at
// its top right count it; the big same-colour shape on the table is that beat's pictogram blown up. Cards have a 12 px
// edge and a hard (22, 30) shadow; no blur, no glow. Words only ever stand on a single flat card face.
import { atBase, clamp01, ease, H, HandGround, HandIn, mixHex, W, WorldEnv } from './world-craft';
import { C, label, titleOnly } from './world-b3-shared';
import { R2 } from './r2-inks';
import { titleNow } from './world-title';

const LABEL = (px: number) => `800 ${px}px "Chiron GoRound TC", "Zen Maru Gothic", sans-serif`;
const SHADOW = 'rgba(10,8,20,0.30)';
const shade = (hex: string, f: number) => mixHex(hex, R2.black, 1 - f);
/** The beat of the bar, 0–3, from the song's tempo and its last beat (two a second without one). */
const beatOf = (e: WorldEnv) => { const bpm = e.bpm && e.bpm > 30 ? e.bpm : 120; return ((Math.round((e.now - (e.since ?? 0)) * (bpm / 60)) % 4) + 4) % 4; };
/** Half a turn about the card's middle: the width it shows (edge-on at the half). */
const turnOf = (k: number) => Math.max(0.02, Math.abs(Math.cos(Math.PI * clamp01(k))));

/** A pictogram for a beat: quarter disc, triangle, square, bar. */
function pict(c: C, k: number, x: number, y: number, s: number, tone: string) {
  c.fillStyle = tone;
  c.beginPath();
  if (k === 0) { c.moveTo(x, y); c.lineTo(x + s, y); c.arc(x, y, s, 0, Math.PI / 2); c.closePath(); }
  else if (k === 1) { c.moveTo(x, y + s); c.lineTo(x + s / 2, y); c.lineTo(x + s, y + s); c.closePath(); }
  else if (k === 2) c.rect(x, y, s, s);
  else c.rect(x, y + s * 0.35, s, s * 0.3);
  c.fill();
}
function pips(c: C, on: number, x: number, y: number, tone: string) {
  c.strokeStyle = tone;
  c.fillStyle = tone;
  c.lineWidth = 4;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + 11 + i * 36, y + 11, 9, 0, Math.PI * 2); c.stroke(); if (i === on) c.fill(); }
}
/** The card's back: one bold diagonal stripe, never a word. */
function back(c: C, w: number, h: number, a: string, b: string) {
  c.save();
  c.beginPath();
  c.roundRect(-w / 2 + 22, -h / 2 + 22, w - 44, h - 44, 16);
  c.clip();
  c.fillStyle = a;
  c.fillRect(-w / 2, -h / 2, w, h);
  c.rotate(Math.PI / 4);
  c.fillStyle = b;
  const r = Math.hypot(w, h);
  for (let x = -r; x < r; x += 56) c.fillRect(x, -r, 28, 2 * r);
  c.restore();
}
interface Card { x: number; y: number; w: number; h: number; rot: number; face: string; sx?: number; shadow?: boolean; inner?: (c: C, w: number, h: number) => void }
/** One flash card about its middle: the hard shadow, the 12 px edge below, the face; `sx` is how far it is turned (1 face up). */
function card(c: C, k: Card) {
  const sx = k.sx ?? 1;
  c.save();
  c.translate(k.x + k.w / 2, k.y + k.h / 2);
  c.rotate(k.rot);
  c.scale(sx, 1);
  const r = 30;
  if (k.shadow !== false) { c.fillStyle = SHADOW; c.beginPath(); c.roundRect(-k.w / 2 + 22, -k.h / 2 + 30, k.w, k.h, r); c.fill(); }
  c.fillStyle = shade(k.face, 0.72);
  c.beginPath(); c.roundRect(-k.w / 2, -k.h / 2 + 12, k.w, k.h, r); c.fill();
  c.fillStyle = k.face;
  c.beginPath(); c.roundRect(-k.w / 2, -k.h / 2, k.w, k.h, r); c.fill();
  if (k.inner) k.inner(c, k.w, k.h);
  c.restore();
}
/** The table: its colour and the beat's pictogram blown up in a corner, in the table's own deeper tone. */
function table(c: C, e: WorldEnv, beat: number, corner = 0) {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  const s = 780;
  const [x, y] = corner ? [W - s * 0.72, H - s * 0.72] : [-s * 0.28, -s * 0.28];
  pict(c, beat, x, y, s, e.slots.faint);
}
const page = (e: WorldEnv, f: (c: C) => void) => atBase(e, (c) => f(c));
/** How far the card has turned face up: it turns over as its line arrives (the words' weight coming up, slower on a calm
 * song) and stays face up while they stand on it, so a line changing place while it is sung never stands on a card's
 * back or edge; with no words up there is no card at all, never an empty face. */
function faceUp(e: WorldEnv) {
  const k = e.level < 0.34 ? ease(e.weight, 2) : e.weight;
  const arriving = e.age < 0.6;
  return { sx: arriving ? turnOf(1 - k) : 1, face: !arriving || k >= 0.5 };
}
/** The face's furniture: the beat pictogram and numeral top left, the pips top right, the song's title along the foot. */
const furniture = (e: WorldEnv, beat: number, tone: string, foot: string, pictTone = tone) => (c: C, w: number, h: number) => {
  pict(c, beat, -w / 2 + 52, -h / 2 + 48, 64, pictTone);
  label(c, String(beat + 1), -w / 2 + 132, -h / 2 + 104, LABEL(56), tone, 0);
  pips(c, beat, w / 2 - 210, -h / 2 + 58, tone);
  if (foot) label(c, foot, -w / 2 + 122, h / 2 - 50, LABEL(28), mixHex(e.slots.plateInk, e.slots.plate, 0.45), 0);
};

/** a/b: the main card round the words (the flash card on the beat tilted, the calm one level), the deck waiting at its right. */
const onTable: HandGround = (e) => page(e, (c) => {
  const beat = beatOf(e);
  table(c, e, beat);
  const r = e.rect;
  if (!r) return;
  // the calm card stands level and higher; the beat card leans (the sets' own anchors, world-r2-sets.ts)
  const lean = r.y0 > 400 ? -0.035 : 0;
  const [x0, y0] = [r.x0 - 106, r.y0 - 214];
  const x1 = Math.min(W - 70, Math.max(r.x1 + 120, x0 + (lean ? 1380 : 1420)));
  const y1 = r.y1 + (lean ? 170 : 190);
  if (x1 + 380 < W) {
    card(c, { x: x1 - 120, y: y0 + 20, w: 420, h: y1 - y0, rot: 0.1, face: e.slots.plate, inner: (g, w, h) => back(g, w, h, R2.tomato, shade(R2.tomato, 0.82)) });
    card(c, { x: x1 - 70, y: y0 + 100, w: 420, h: y1 - y0, rot: 0.16, face: e.slots.plate, inner: (g, w, h) => back(g, w, h, R2.grape, shade(R2.grape, 0.82)) });
  }
  card(c, { x: x0 + 10, y: y0 + 14, w: x1 - x0, h: y1 - y0, rot: lean * 1.4, face: shade(e.slots.plate, 0.93) });
  const up = faceUp(e);
  const foot = titleOnly(titleNow(e));
  card(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: lean, face: e.slots.plate, sx: up.sx, inner: up.face ? furniture(e, beat, e.slots.accent, foot) : (g, w, h) => back(g, w, h, e.slots.accent, shade(e.slots.accent, 0.82)) });
});

/** c: a hand of nine cards fanned across the top, each with its beat's shape; the beat card in front. */
const fan: HandGround = (e) => page(e, (c) => {
  const beat = beatOf(e);
  table(c, e, beat, 1);
  const faces = [R2.grape, R2.pine, R2.mustard, R2.tomato];
  const spread = ease(e.age / 0.5, 3);
  for (let i = 0; i < 9; i++) {
    const a = ((-44 + i * 11) * spread * Math.PI) / 180;
    const [cx, cy] = [960 + 1180 * Math.sin(a), 1560 - 1180 * Math.cos(a)];
    card(c, { x: cx - 190, y: cy - 280, w: 380, h: 560, rot: a, face: faces[i % 4], inner: (g) => pict(g, i % 4, -110, -150, 220, e.slots.plate) });
  }
  const r = e.rect ?? { x0: 486, y0: 648, x1: 1300, y1: 902 };
  const [x0, y0] = [r.x0 - 140, r.y0 - 128];
  const x1 = Math.min(W - 60, Math.max(r.x1 + 110, x0 + 1180));
  const y1 = Math.min(H - 40, r.y1 + 80);
  card(c, { x: x0 + 10, y: y0 + 14, w: x1 - x0, h: y1 - y0, rot: -0.026, face: shade(e.slots.plate, 0.92) });
  const up = faceUp(e);
  card(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: -0.017, face: e.slots.plate, sx: up.sx, inner: up.face ? furniture(e, beat, e.slots.accent, '') : (g, w, h) => back(g, w, h, e.slots.accent, shade(e.slots.accent, 0.82)) });
});

/** d: the pair. The first row on a cream card, the second on the red card that lands on its corner, below its words. */
const pair: HandGround = (e) => page(e, (c) => {
  const beat = beatOf(e);
  table(c, e, beat, 1);
  const r = e.rect ?? { x0: 190, y0: 276, x1: 1700, y1: 1020 };
  // a line with no break to take (a phrase of kana run together) stays one row: then it is one card, the beat card
  if ((r.y1 - r.y0) / Math.max(1, r.x1 - r.x0) < 0.4) return onTable(e);
  const [lead, stair] = [2.84, 2.28];
  const s = Math.max(60, (r.y1 - r.y0 - 28) / (2 * lead));
  const top = r.y0 + 14;
  const longest = r.x1 - r.x0 - 28 - stair * s;
  const rows = [{ x: r.x0 + 14, cy: top + s * lead * 0.5 }, { x: r.x0 + 14 + stair * s, cy: top + s * lead * 1.5 }];
  const up = faceUp(e);
  const second = ease((e.age - 0.18) / 0.3, 3);
  rows.forEach((row, i) => {
    const [x0, x1] = [row.x - (i ? 72 : 94), Math.min(W - 50, Math.max(row.x + longest + 96, row.x + (i ? 1290 : 1156)))];
    const [hh, face, tone] = [i ? 210 : 220, i ? e.slots.ink2 : e.slots.plate, i ? e.slots.plate : e.slots.accent];
    const k: Card = { x: x0, y: row.cy - hh - 20 + (i ? -60 * (1 - second) : 0), w: x1 - x0, h: hh * 2, rot: i ? 0.035 : -0.044, face, sx: i ? turnOf(1 - second) : up.sx };
    const shown = i ? second >= 0.5 && up.face : up.face;
    card(c, { ...k, inner: shown ? (g, w, h) => { pict(g, i ? 3 : 1, -w / 2 + 46, -h / 2 + 40, 60, tone); pips(g, i ? (beat + 1) % 4 : beat, w / 2 - 200, -h / 2 + 52, tone); } : (g, w, h) => back(g, w, h, i ? R2.grape : e.slots.accent, shade(i ? R2.grape : e.slots.accent, 0.82)) });
  });
});

/** Between lines: the deck face down in the middle, two cards beside it, nothing written (a line up gets its card). */
const deck: HandGround = (e) => (e.rect ? onTable(e) : page(e, (c) => {
  const beat = beatOf(e);
  table(c, e, beat);
  for (let i = 0; i < 5; i++) card(c, { x: 760 - i * 3, y: 300 - i * 4, w: 420, h: 600, rot: 0.02 * (i - 2), face: e.slots.plate, shadow: i === 0, inner: (g, w, h) => back(g, w, h, e.slots.accent, shade(e.slots.accent, 0.82)) });
  card(c, { x: 300, y: 330, w: 420, h: 600, rot: -0.12, face: e.slots.plate, inner: (g, w, h) => back(g, w, h, R2.pine, shade(R2.pine, 0.82)) });
  card(c, { x: 1220, y: 330, w: 420, h: 600, rot: 0.12, face: e.slots.plate, inner: (g, w, h) => back(g, w, h, R2.tomato, shade(R2.tomato, 0.82)) });
}));

const Gs: Record<string, HandGround> = { 'card/table': onTable, 'card/fan': fan, 'card/pair': pair, 'card/deck': deck };

const INS: Record<string, HandIn> = {
  // a change of part: the deck is cut, a run of cards thrown across from the right, each a beat's colour, never over the words' card
  'deck-cut': { sec: 0.4, draw: (e, q) => page(e, (c) => { const faces = [R2.grape, R2.pine, R2.mustard, R2.tomato]; const r = e.rect; if (r) { const p = new Path2D(); p.rect(-W, -H, 3 * W, 3 * H); p.rect(r.x0 - 150, r.y0 - 240, r.x1 - r.x0 + 300, r.y1 - r.y0 + 450); c.clip(p, 'evenodd'); } for (let i = 0; i < 6; i++) { const k = ease(q * 1.5 - i * 0.08, 2); if (k <= 0 || k >= 1) continue; card(c, { x: W + 100 - k * (W + 700), y: 180 + i * 60, w: 420, h: 600, rot: -0.2 + 0.08 * i, face: faces[i % 4] }); } }) },
};

export const CARD = { grounds: Gs, ins: INS, pieces: {}, objects: {} };
