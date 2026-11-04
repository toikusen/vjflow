// idol-live, redrawn from its board (2026-11-04, 風格第3批設計稿/idol-live a–d): an idol group's merch, not its stage. The
// words are cut fan lettering (plum letters, each ringed in a member colour, a white cut and a plum keyline: world-glyph-
// loud's fan rings), a concert ticket, a member-colour card set, a setlist and a big lettered card. Pink gingham, paper
// goods with a soft contact shadow, Fredoka labels. No lightsticks, no stage light (the first version's are gone).
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, isLight, kept, mixHex, ObjectPaint, W, WorldEnv } from './world-craft';
import { artistOf, C, label, titleOnly } from './world-b3-shared';
import { MEMBER } from './world-glyph-loud';

const GREY = '#7A6F92';
const FRED = (px: number, w = 700) => `${w} ${px}px Fredoka, "Zen Maru Gothic", "Mochiy Pop One", sans-serif`;
const ZM = (px: number, w = 700) => `${w} ${px}px "Zen Maru Gothic", "Mochiy Pop One", sans-serif`;
const NAMES = ['PINK', 'BLUE', 'MINT', 'LEMON', 'LILAC'];

const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** Pink gingham: two crossing sets of 40 px bands at 22 % (dark schemes: the same weave in plum). */
const gingham = (e: WorldEnv) => kept(`idol-ging|${e.paper}|${e.slots.ink2}`, W, H, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  c.fillStyle = e.slots.ink2;
  c.globalAlpha = isLight(e.paper) ? 0.22 : 0.16;
  for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 40, H);
  for (let y = 0; y < H; y += 80) c.fillRect(0, y, W, 40);
  c.globalAlpha = 1;
});
/** A paper good's contact shadow: a hair under it and a soft fall below (the board's two box-shadows, the only soft thing). */
function goods(c: C, draw: () => void) {
  c.save();
  c.shadowColor = 'rgba(43,33,64,0.30)';
  c.shadowBlur = 40;
  c.shadowOffsetY = 18;
  draw();
  c.restore();
  c.save();
  c.shadowColor = 'rgba(43,33,64,0.08)';
  c.shadowOffsetY = 3;
  draw();
  c.restore();
}

/** a: the fan letters on the gingham, small Fredoka heads in the corners. */
const fan: HandGround = (e) => page(e, (c) => {
  c.drawImage(gingham(e), 0, 0);
  const ink = isLight(e.paper) ? e.ink : '#FFF8FB';
  label(c, artistOf(e.title), 110, 116, FRED(26), ink, 3);
  label(c, titleOnly(e.title), W - 110, 116, FRED(26), ink, 3, 'right');
});

/** b: a concert ticket on lavender: member stripe, header and rule, the line, its info, a dotted tear, the stub. */
const ticket: HandGround = (e) => page(e, (c) => {
  c.fillStyle = isLight(e.paper) ? mixHex(e.paper, '#B79CFF', 0.16) : e.paper;
  c.fillRect(0, 0, W, H);
  const r = e.rect ?? { x0: 340, y0: 410, x1: 1100, y1: 700 };
  const [tw, th] = [Math.max(1420, r.x1 - r.x0 + 560), 560];
  const tx = Math.max(60, Math.min(W - 60 - tw, r.x0 - 90));
  const ty = Math.max(60, Math.min(H - 60 - th, (r.y0 + r.y1) / 2 - th / 2 + 10));
  // it slides in from off the frame at the cut; its stub tears at the line's end
  const slide = (1 - ease(clamp01(e.age / 0.4), 3)) * -(tx + tw);
  c.translate(slide, 0);
  goods(c, () => { c.beginPath(); c.roundRect(tx, ty, tw, th, 26); c.fillStyle = '#FFFFFF'; c.fill(); });
  c.save();
  c.beginPath(); c.roundRect(tx, ty, tw, th, 26); c.clip();
  MEMBER.forEach((m, i) => { c.fillStyle = m; c.fillRect(tx, ty + (th * i) / 5, 28, th / 5 + 1); });
  c.restore();
  const tear = tx + tw - 290;
  label(c, titleOnly(e.title), tx + 90, ty + 88, FRED(24), GREY, 4);
  c.fillStyle = '#2B2140';
  c.fillRect(tx + 90, ty + 112, tear - tx - 170, 3);
  label(c, 'SONG', tx + 90, ty + th - 76, FRED(16), GREY, 2);
  label(c, titleOnly(e.title), tx + 90, ty + th - 40, ZM(30), '#2B2140');
  const who = artistOf(e.title);
  if (who) { label(c, 'ARTIST', tx + 380, ty + th - 76, FRED(16), GREY, 2); label(c, who, tx + 380, ty + th - 40, ZM(30), '#2B2140'); }
  c.strokeStyle = '#CFC6E2';
  c.lineWidth = 5;
  c.setLineDash([2, 10]);
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(tear, ty + 10); c.lineTo(tear, ty + th - 10); c.stroke();
  c.setLineDash([]);
  c.fillStyle = MEMBER[e.seed % MEMBER.length];
  c.beginPath(); c.roundRect(tear + 30, ty + 60, 230, th - 120, 16); c.fill();
  c.save();
  c.translate(tear + 145, ty + 100);
  [...titleOnly(e.title)].slice(0, 6).forEach((ch, i) => label(c, ch, 0, i * 62, ZM(54, 900), '#2B2140', 0, 'center'));
  c.restore();
  // the notches where the tear line meets the edges
  c.fillStyle = isLight(e.paper) ? mixHex(e.paper, '#B79CFF', 0.16) : e.paper;
  for (const y of [ty, ty + th]) { c.beginPath(); c.arc(tear, y, 30, 0, Math.PI * 2); c.fill(); }
});

/** c: the member cards: a stripe of each colour down the frame, a white card in each, one cut letter a card, name and number. */
const cards: HandGround = (e) => page(e, (c) => {
  const r = e.rect ?? { x0: 0, y0: 400, x1: W, y1: 700 };
  // the cards follow the letters: one letter's cell is its size times 1.74 (the set's tracking), a row's height its size
  const size = Math.max(60, Math.min(184, r.y1 - r.y0));
  const step = size * 1.74;
  const n = Math.max(1, Math.round((r.x1 - r.x0 + 0.74 * size) / step));
  const x0 = (r.x0 + r.x1) / 2 - (n * step) / 2;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  for (let i = -1; i <= n; i++) {
    const x = x0 + i * step;
    const m = MEMBER[(((i + e.seed) % 5) + 5) % 5];
    c.fillStyle = m;
    c.fillRect(x, 0, step + 1, H);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (let y = 0; y < H; y += 36) c.fillRect(x, y - 6, step, 12);
    if (i < 0 || i >= n) continue;
    // each card turns over on a beat in turn
    const flip = Math.abs(Math.cos(Math.PI * (1 - clamp01(e.age * 2 - i * 0.5))));
    const turned = e.age * 2 - i * 0.5 >= 0.5;
    c.save();
    c.translate(x + step / 2, 0);
    c.scale(Math.max(0.02, flip), 1);
    c.beginPath(); c.roundRect(-step / 2 + step * 0.094, 150, step * 0.81, 780, 24);
    c.fillStyle = turned ? '#FFFFFF' : m;
    c.fill();
    if (turned) {
      label(c, NAMES[(((i + e.seed) % 5) + 5) % 5], 0, 240, FRED(30), '#2B2140', 4, 'center');
      label(c, `0${i + 1}`, 0, 870, FRED(26, 500), GREY, 4, 'center');
    }
    c.restore();
  }
});

/** d: a setlist card tilted on the gingham at the left, the big lettered card (the set's object) at the right. */
const setlist: HandGround = (e) => page(e, (c) => {
  c.drawImage(gingham(e), 0, 0);
  const r = e.rect ?? { x0: 760, y0: 150, x1: 1160, y1: 950 };
  const right = Math.min(r.x0 - 200, 600);
  if (right < 300) return;
  c.save();
  c.translate(170 + 210, 250 + 280);
  c.rotate(-0.052);
  c.translate(-210, -280);
  goods(c, () => { c.beginPath(); c.roundRect(0, 0, 420, 560, 26); c.fillStyle = '#FFFFFF'; c.fill(); });
  label(c, 'SETLIST', 40, 70, FRED(22), GREY, 3);
  c.fillStyle = '#2B2140';
  c.fillRect(40, 88, 340, 3);
  // one entry: the song itself, the highlighter run across it from left to right as it plays
  const sweep = clamp01(e.age / 1.2);
  c.fillStyle = '#FFDE5C';
  c.beginPath(); c.roundRect(32, 128, 356 * sweep, 50, 6); c.fill();
  label(c, '01', 44, 162, FRED(20), '#2B2140', 2);
  label(c, titleOnly(e.title), 90, 164, ZM(30), '#2B2140');
  label(c, artistOf(e.title), 40, 520, FRED(18, 500), GREY, 3);
  c.restore();
});

const Gs: Record<string, HandGround> = { 'idol-live/fan': fan, 'idol-live/ticket': ticket, 'idol-live/cards': cards, 'idol-live/setlist': setlist };

/** The big lettered card the vertical lines are cut out on (board d): white, plum border, a dotted pink inner line. */
const bigCard: ObjectPaint = (c, w, h, s) => {
  c.beginPath(); c.roundRect(0, 0, w, h, 30); c.fillStyle = s.plate; c.fill();
  c.lineWidth = 5; c.strokeStyle = s.plateInk; c.stroke();
  c.beginPath(); c.roundRect(24, 24, w - 48, h - 48, 20);
  c.lineWidth = 3; c.strokeStyle = '#FF7EB6'; c.setLineDash([2, 12]); c.lineCap = 'round'; c.stroke(); c.setLineDash([]);
};

const INS: Record<string, HandIn> = {
  // the next goods are laid down: a gingham sheet slides over from the left with a soft edge shadow
  'merch-slide': { sec: 0.4, draw: (e, q) => page(e, (c) => { const x = -W + ease(q, 3) * W; c.drawImage(gingham(e), x, 0); }) },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // confetti cut in the member colours falls past the words' sides
  'confetti-cut': { sec: 2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 40);
    for (let i = 0; i < 60; i++) {
      const x = ((i * 157.3 + e.seed * 91) % W);
      const y = -40 + ((q * 1.4 + (i % 7) * 0.13) % 1.2) * (H + 80);
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) continue;
      c.save(); c.translate(x, y); c.rotate(i + q * 6);
      c.fillStyle = MEMBER[i % 5];
      c.fillRect(-9, -5, 18, 10);
      c.restore();
    }
  }) },
  // a row of member-colour stickers is pressed along the bottom edge, one a beat
  'sticker-row': { sec: 1.8, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 30);
    const y = H - 90;
    if (b.y1 > y - 50) return;
    const n = Math.floor(q * 10);
    for (let i = 0; i < Math.min(9, n); i++) {
      const x = 160 + i * 200;
      c.beginPath(); c.arc(x, y, 46, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill();
      c.beginPath(); c.arc(x, y, 38, 0, Math.PI * 2); c.fillStyle = MEMBER[i % 5]; c.fill();
      label(c, `0${(i % 5) + 1}`, x, y + 9, FRED(26), '#2B2140', 1, 'center');
    }
  }) },
  // the ticket's stub tears off along its dotted line and drops away (only on a ticket page)
  'stub-tear': { sec: 1.2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 30);
    const x = Math.min(W - 120, b.x1 + 140);
    const k = ease(q, 2);
    c.save(); c.translate(x, H - 160 + k * 300); c.rotate(0.3 * k);
    c.beginPath(); c.roundRect(-70, -60, 140, 120, 14); c.fillStyle = MEMBER[e.seed % 5]; c.fill();
    c.restore();
  }) },
};

export const IDOL = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'idol-card': bigCard } as Record<string, ObjectPaint> };
