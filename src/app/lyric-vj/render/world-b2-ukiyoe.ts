// ukiyoe: a woodblock print being made. Flat plates, one key block, bokashi wiped by hand along one edge, kasumi bands that part
// the distance and carry the words. Everything is what a printer's blocks can do; no figure, no tiled wave pattern.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, inOut, isLight, kept, lifted, mixHex, ObjectPaint, Pt, Slots, span, TAU, tiled, trace, W, WorldEnv } from './world-craft';

const key = (e: WorldEnv) => (isLight(e.paper) ? e.slots.ink : mixHex(e.slots.ink2, e.paper, 0.2));
/** A ridge that closes on itself over `w`, so a scroll never shows a seam. */
const ridge = (x: number, w: number, seed: number) => { let y = 0; for (const [f, a] of [[1, 1], [2, 0.62], [3, 0.44], [5, 0.3], [8, 0.18], [13, 0.11], [21, 0.06]]) y += a * Math.sin((x / w) * TAU * f + hash(f, seed) * TAU); return y; };

/** The sheet: washi, then bokashi wiped along the top and a second along the horizon, with the baren's streaks through both. */
const sheet = (e: WorldEnv, deep: number, low: string) => kept(`uk-sheet|${e.paper}|${e.slots.ink2}|${low}|${deep}`, W, H, (c) => {
  c.drawImage(fibred('washi', e.paper, e.slots.faint, 2600), 0, 0);
  const top = c.createLinearGradient(0, 0, 0, H * deep);
  top.addColorStop(0, e.slots.ink2);
  top.addColorStop(0.32, e.slots.ink2);
  top.addColorStop(1, `${e.slots.ink2}00`);
  c.fillStyle = top;
  c.fillRect(0, 0, W, H * deep);
  const dawn = c.createLinearGradient(0, H * 0.34, 0, H * 0.72);
  dawn.addColorStop(0, `${low}00`);
  dawn.addColorStop(1, low);
  c.fillStyle = dawn;
  c.fillRect(0, H * 0.34, W, H * 0.66);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 420; i++) { c.globalAlpha = 0.03 + 0.05 * hash(i, 8); c.fillRect(0, hash(i, 9) * H, W, 1 + 2 * hash(i, 10)); }
  c.globalCompositeOperation = 'destination-over';
  c.globalAlpha = 1;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
});
const RANGE_W = 2880;
/** A range of hills in one flat plate, the crest printed darker by a wiped gradient, the key block's line over it. */
const range = (e: WorldEnv, base: number, high: number, tone: string, seed: number) => kept(`uk-range|${tone}|${seed}|${e.paper}|${base}|${high}`, RANGE_W, H, (c) => {
  const pts: Pt[] = [];
  for (let x = -120; x <= RANGE_W + 120; x += 8) pts.push([x, H * base - high * (0.5 + 0.28 * ridge(x, RANGE_W, seed))]);
  const body: Pt[] = [...pts, [RANGE_W + 120, H], [-120, H]];
  trace(c, body);
  c.fillStyle = tone;
  c.fill();
  c.save();
  c.clip();
  // the crest wiped darker: the same outline, shifted down, kept out of the gradient
  c.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 48; k++) {
    c.globalAlpha = 0.024;
    c.strokeStyle = mixHex(tone, e.slots.ink, 0.72);
    c.lineWidth = 26 + k * 5.4;
    trace(c, pts, false);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = key(e);
  c.lineWidth = 3;
  c.lineJoin = 'round';
  trace(c, pts, false);
  c.stroke();
});
/** One tier of a kasumi band: long, round-ended, stepped at both ends. */
function tiers(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const r = h / 2;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.roundRect(x + w * (0.08 + 0.1 * hash(seed, 1)), y - h * 0.62, w * (0.5 + 0.2 * hash(seed, 2)), h, r);
  c.roundRect(x + w * (0.24 + 0.14 * hash(seed, 3)), y + h * 0.62, w * (0.6 + 0.12 * hash(seed, 4)), h, r);
  c.fill();
}
/** Mist drawn across the whole print where a free line stands, feathered like the bokashi: the print fades out above and below the words. */
export function mistUnderWords(e: WorldEnv, tone = e.paper, a = 0.94) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 0, 34);
  // a tall narrow line stands on its slip: only rows of words need the mist
  if (b.x1 - b.x0 < W * 0.4) return;
  const soft = 150;
  atBase(e, (c) => {
    const g = c.createLinearGradient(0, b.y0 - soft, 0, b.y1 + soft);
    const [s0, s1] = [soft / (b.y1 - b.y0 + soft * 2), 1 - soft / (b.y1 - b.y0 + soft * 2)];
    g.addColorStop(0, `${tone}00`);
    g.addColorStop(s0 * 0.85, tone);
    g.addColorStop(s1 + (1 - s1) * 0.15, tone);
    g.addColorStop(1, `${tone}00`);
    c.globalAlpha = a * Math.min(1, e.weight * 4);
    c.fillStyle = g;
    c.fillRect(-20, b.y0 - soft, W + 40, b.y1 - b.y0 + soft * 2);
    c.globalAlpha = 1;
  });
}
/** Foam piled round the words in a piece: the same paper, its edge the crest's. */
function foamUnderWords(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 16, 8);
  atBase(e, (c) => {
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < 90; i++) {
      const t = i / 90;
      const side = t * 4;
      const f = side % 1;
      const [x, y] = side < 1 ? [b.x0 + (b.x1 - b.x0) * f, b.y0] : side < 2 ? [b.x1, b.y0 + (b.y1 - b.y0) * f] : side < 3 ? [b.x1 - (b.x1 - b.x0) * f, b.y1] : [b.x0, b.y1 - (b.y1 - b.y0) * f];
      blobs.push([x + (hash(i, 2) - 0.5) * 18, y + (hash(i, 3) - 0.5) * 18, 24 + 30 * hash(i, 4)]);
    }
    c.strokeStyle = key(e);
    c.lineWidth = 6;
    blobs.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); });
    c.fillStyle = e.paper;
    blobs.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r - 2, 0, TAU); c.fill(); });
    c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  });
}
const drift = (e: WorldEnv, tone: string, y: number, h: number, speed: number, seed: number, a = 1) => {
  const c = e.ctx;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = tone;
  const span0 = W * 1.5;
  const x = ((e.now * speed + hash(seed, 7) * span0) % span0) - W * 0.5;
  tiers(c, x, y, W * 0.74, h, seed);
  tiers(c, x - span0, y, W * 0.74, h, seed);
  c.restore();
};
/** Long swells seen from the side, each with its line of foam fingers. */
const SWELL_W = 2400;
const swellRow = (e: WorldEnv, row: number) => kept(`uk-swell|${e.slots.ink2}|${e.paper}|${row}`, SWELL_W, 420, (c) => {
  const n = 5 + row;
  const crest = (x: number) => 150 + 66 * Math.sin((x / SWELL_W) * TAU * n) ** 3 + 26 * Math.sin((x / SWELL_W) * TAU * (n * 2 + 1) + row);
  const pts: Pt[] = [];
  for (let x = 0; x <= SWELL_W; x += 6) pts.push([x, crest(x)]);
  const g = c.createLinearGradient(0, 80, 0, 420);
  g.addColorStop(0, mixHex(e.slots.ink2, e.paper, 0.1 + 0.06 * row));
  g.addColorStop(0.5, e.slots.ink2);
  g.addColorStop(1, mixHex(e.slots.ink2, e.slots.ink, 0.3));
  c.fillStyle = g;
  trace(c, [...pts, [SWELL_W, 420], [0, 420]]);
  c.fill();
  // the lines the cutter leaves along a swell
  c.strokeStyle = mixHex(e.slots.ink2, e.paper, 0.5);
  c.lineWidth = 2;
  for (let k = 1; k < 7; k++) { c.globalAlpha = 0.7 - k * 0.08; c.beginPath(); pts.forEach(([x, y], i) => { const yy = y + k * 34 + 8 * Math.sin(x * 0.01 + k); return i ? c.lineTo(x, yy) : c.moveTo(x, yy); }); c.stroke(); }
  c.globalAlpha = 1;
  c.fillStyle = e.paper;
  for (let i = 0; i < 900; i++) {
    const x = (i / 900) * SWELL_W;
    if (Math.sin((x / SWELL_W) * TAU * n) < 0.25) continue;
    const y = crest(x);
    const l = 14 + 26 * hash(i, row);
    c.beginPath();
    c.moveTo(x - 7, y + 4);
    c.quadraticCurveTo(x - 2, y - l * 0.8, x + l * 0.7, y - l * 0.3 * hash(i, 3));
    c.quadraticCurveTo(x + 2, y - l * 0.2, x + 6, y + 5);
    c.fill();
  }
  c.strokeStyle = key(e);
  c.lineWidth = 2.6;
  trace(c, pts, false);
  c.stroke();
});
const rainTile = (e: WorldEnv, tone: string) => kept(`uk-rain|${tone}`, 900, 900, (c) => {
  c.strokeStyle = tone;
  c.lineCap = 'butt';
  for (let i = 0; i < 620; i++) {
    const [x, y, l] = [hash(i, 2) * 900, hash(i, 3) * 900, 150 + 330 * hash(i, 4)];
    c.lineWidth = 0.9 + 1.5 * hash(i, 5);
    c.globalAlpha = 0.5 + 0.5 * hash(i, 6);
    for (const [dx, dy] of [[0, 0], [900, 0], [0, 900], [-900, 0], [0, -900]]) { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx - l * 0.26, y + dy + l); c.stroke(); }
  }
  c.globalAlpha = 1;
});
/**
 * How far a band of land or sea drops so its highest point stands clear below a row of words: the mist under the words
 * never slices a peak or a crest into a sliver. `top` is the highest the band reaches when it is not moved.
 */
const dropFor = (e: WorldEnv, top: number) => {
  const r = e.rect;
  if (!r || e.weight <= 0 || r.x1 - r.x0 < W * 0.4) return 0;
  return Math.min(H * 0.3, Math.max(0, r.y1 + H * 0.12 - top)) * Math.min(1, e.weight * 4);
};
/** The foreground lost in mist, as in a Hiroshige print: the land is a band across the middle, the bottom of the sheet bare paper. */
const lowMist = (e: WorldEnv, drop = 0) => {
  const c = e.ctx;
  // the mist rises with the land only half as far: a dropped band keeps its foot in the mist, the bottom of the sheet stays paper
  const y = Math.min(H * 0.74, H * 0.68 + drop * 0.5);
  const g = c.createLinearGradient(0, y, 0, y + H * 0.12);
  g.addColorStop(0, `${e.paper}00`);
  g.addColorStop(1, e.paper);
  c.fillStyle = g;
  c.fillRect(-20, y, W + 40, H - y + 20);
};
const hills = (e: WorldEnv) => {
  const c = e.ctx;
  const pan = -e.now * (10 + 16 * e.level);
  const d = dropFor(e, H * 0.56 - 330);
  tiled(c, range(e, 0.56, 300, mixHex(e.slots.faint, e.slots.ink2, 0.3), e.seed % 3), pan * 0.4, d);
  drift(e, e.paper, H * 0.52 + d, 58, 5, e.seed, 0.92);
  tiled(c, range(e, 0.68, 260, mixHex(e.slots.ink2, e.paper, 0.1), (e.seed % 3) + 5), pan * 0.9, d);
  lowMist(e, d);
  drift(e, mixHex(e.paper, e.slots.faint, 0.3), H * 0.74 + d, 44, 9, e.seed + 2, 0.9);
};
const GROUNDS: Record<string, HandGround> = {
  'ukiyoe/far-range': (e) => { e.ctx.drawImage(sheet(e, 0.5, e.slots.faint), 0, 0); hills(e); drift(e, e.paper, H * 0.2, 46, -7, e.seed + 5, 0.9); mistUnderWords(e); },
  'ukiyoe/dawn': (e) => { e.ctx.drawImage(sheet(e, 0.36, e.slots.accent), 0, 0); hills(e); mistUnderWords(e); },
  'ukiyoe/open-sky': (e) => { e.ctx.drawImage(sheet(e, 0.62, e.slots.faint), 0, 0); drift(e, e.paper, H * 0.32, 54, 6, e.seed, 0.9); drift(e, e.paper, H * 0.72, 66, -5, e.seed + 1, 0.92); mistUnderWords(e); },
  'ukiyoe/sea-swell': (e) => {
    const c = e.ctx;
    c.drawImage(sheet(e, 0.42, e.slots.faint), 0, 0);
    const d = dropFor(e, H * 0.3 + 70);
    [0, 1, 2, 3].forEach((row) => tiled(c, swellRow(e, row), e.now * (row % 2 ? -1 : 1) * (22 + row * 18) * (0.6 + e.level) + 30 * Math.sin(e.now * 0.7 + row), H * 0.3 + d + row * 104 + 12 * Math.sin(e.now * 0.9 + row * 1.4)));
    lowMist(e, d);
    mistUnderWords(e);
  },
  'ukiyoe/rain': (e) => {
    const c = e.ctx;
    c.drawImage(sheet(e, 0.86, mixHex(e.slots.faint, e.slots.ink2, 0.5)), 0, 0);
    const d = dropFor(e, H * 0.66 - 420);
    tiled(c, range(e, 0.66, 380, mixHex(e.slots.ink2, e.paper, 0.34), e.seed % 3), -e.now * 3, d);
    lowMist(e, d);
    flood(e, mixHex(e.slots.ink2, e.paper, 0.4), 0.16);
    const [tile, tone] = [rainTile(e, key(e)), 0];
    const y = (e.now * 620) % 900;
    const x = (-e.now * 160) % 900;
    for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) { c.globalAlpha = 0.72 + tone; c.drawImage(tile, x + i * 900, y + j * 900 - 900); }
    c.globalAlpha = 1;
    mistUnderWords(e);
  },
  'ukiyoe/snow-night': (e) => {
    const c = e.ctx;
    c.drawImage(sheet(e, 1, mixHex(e.slots.ink2, e.paper, 0.2)), 0, 0);
    const d = dropFor(e, H * 0.64 - 350);
    tiled(c, range(e, 0.64, 320, mixHex(e.paper, e.slots.faint, 0.28), e.seed % 3), -e.now * 2, d);
    lowMist(e, d);
    c.fillStyle = e.paper;
    for (let i = 0; i < 300; i++) { const k = fractOf(hash(i, 5) + e.now * (0.03 + 0.05 * hash(i, 6))); c.globalAlpha = 0.5 + 0.5 * hash(i, 7); c.beginPath(); c.arc(hash(i, 8) * W + 26 * Math.sin(e.now * 0.6 + i), k * H, 1.6 + 3.4 * hash(i, 9), 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    mistUnderWords(e);
  },
  'ukiyoe/full-storm': (e) => { GROUNDS['ukiyoe/rain'](e); },
  'ukiyoe/one-boat-mist': (e) => { e.ctx.drawImage(sheet(e, 0.3, e.slots.faint), 0, 0); drift(e, mixHex(e.paper, e.slots.faint, 0.5), H * 0.5, 80, 3, e.seed, 0.9); mistUnderWords(e); },
};
const fractOf = (x: number) => x - Math.floor(x);

const INS: Record<string, HandIn> = {
  // a band of mist crosses and the next print is behind it
  'kasumi-slide': { sec: 0.56, draw: (e, q) => {
    const c = e.ctx;
    c.fillStyle = e.paper;
    atBase(e, () => { const x = W * 1.4 - q * W * 2.9; [0.1, 0.34, 0.58, 0.82].forEach((y, i) => { const off = i % 2 ? 180 : 0; c.beginPath(); c.roundRect(x + off, H * (y - 0.14), W * 1.5, H * 0.3, 70); c.roundRect(x + off - 130, H * (y - 0.04), W * 1.7, H * 0.13, 40); c.fill(); }); });
  } },
};

/** The great swell, drawn as one heaving shape: body bands, then the crest breaking into claws of foam. */
function bigWave(c: CanvasRenderingContext2D, e: WorldEnv, k: number, lean: number, seed: number, floor = 0) {
  const s = e.slots;
  const crestX = W * (0.16 + 0.72 * lean);
  const top = Math.max(H * (1.1 - 1.0 * k), floor);
  const front = (t: number): Pt => {
    // from the trough on the right, up the back and over the lip
    const x = crestX + (W * 1.1) * (1 - t) - 240 * Math.sin(t * Math.PI) * k;
    const y = H * 1.05 - (H * 1.05 - top) * inOut(t) ** 1.1;
    return [x, y];
  };
  const back = (t: number): Pt => [crestX - W * 0.86 * t, top + (H * 1.05 - top) * inOut(t) ** 0.8];
  const lip = (t: number): Pt => { const a = -1.3 + t * 3.6; const r = 250 * (1 - t * 0.74) * k; return [crestX + 120 * k + Math.cos(a) * r + 90 * t * k, top + 230 * k + Math.sin(a) * r]; };
  const edge: Pt[] = [];
  for (let t = 0; t <= 1; t += 0.02) edge.push(front(t));
  for (let t = 0; t <= 1; t += 0.05) edge.push(lip(t));
  const tail = lip(1);
  edge.push([tail[0] - 110 * k, tail[1] + 40 * k]);
  for (let t = 0; t <= 1; t += 0.02) edge.push(back(t));
  edge.push([W * 1.3, H * 1.1]);
  c.save();
  // (on a night print the sea takes the sky's own lighter blue, or the wave would sink into it)
  const body = isLight(e.paper) ? s.ink2 : s.faint;
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, mixHex(body, s.ink2, 0.3));
  g.addColorStop(0.5, body);
  g.addColorStop(1, mixHex(body, e.paper, 0.26));
  trace(c, edge);
  c.fillStyle = g;
  c.fill();
  c.clip();
  // bands of the swell running with the face
  c.lineCap = 'round';
  for (let b = 0; b < 12; b++) {
    c.strokeStyle = b % 3 === 0 ? mixHex(body, s.plate, 0.5) : mixHex(body, s.ink2, 0.5);
    c.lineWidth = b % 3 === 0 ? 7 : 3;
    c.globalAlpha = 0.86;
    c.beginPath();
    for (let t = 0; t <= 1.01; t += 0.03) { const [x, y] = front(t); const d = 34 + b * 52; const [px, py] = [x - d * 0.96 * (0.4 + t), y + d * 0.82]; t ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
  }
  c.restore();
  c.globalAlpha = 1;
  // foam: claws along the lip, curling forward
  c.fillStyle = e.paper;
  c.strokeStyle = key(e);
  c.lineWidth = 3;
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const [x, y] = lip(t);
    const len = (40 + 90 * hash(i, seed)) * k;
    const a = 2 + (hash(i, seed + 1) - 0.5) * 0.7 + t * 1.6;
    const [ex, ey] = [x + Math.cos(a) * len, y + Math.sin(a) * len];
    c.beginPath();
    c.moveTo(x - 20, y - 12);
    c.quadraticCurveTo(x + Math.cos(a - 1.1) * len * 0.7, y + Math.sin(a - 1.1) * len * 0.7, ex, ey);
    c.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.4, y + Math.sin(a + 0.6) * len * 0.4, x + 20, y + 14);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // gofun spray thrown ahead of the crest
  for (let i = 0; i < 160; i++) {
    const [x, y] = [crestX + 40 + hash(i, seed + 4) * 620 * k, top + hash(i, seed + 5) * 520 * k];
    c.beginPath();
    c.arc(x, y + 90 * k * hash(i, 3), 2 + 6 * hash(i, 7), 0, TAU);
    c.fill();
  }
}

const PIECES: Record<string, Piece> = {
  'great-swell': { sec: 2.6, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.5 ? ease(q / 0.5, 2) : 1;
    // a row of words high on the sheet rides above the wave: the whole wave, lip and claws, rises to just below it
    const r = e.rect && e.weight > 0 && e.rect.x1 - e.rect.x0 >= W * 0.4 && e.rect.y1 < H * 0.62 ? e.rect : undefined;
    const floor = r ? r.y1 + 60 : 0;
    bigWave(c, e, k, 0.14 + 0.5 * inOut(q), e.seed, floor);
    if (q > 0.62) { const f = easeIn((q - 0.62) / 0.38, 2); c.fillStyle = e.paper; c.globalAlpha = 1; for (let i = 0; i < 7; i++) { const x = W * 1.3 - f * (W * 2.6) + (i % 2) * 220; c.beginPath(); c.roundRect(x, (i * H) / 7, W * 1.7, H / 7 + 40, 60); c.fill(); } }
    if (!r) foamUnderWords(e);
  } },
  'kasumi-part': { sec: 2.2, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const open = q < 0.3 ? 1 - ease(q / 0.3, 3) : easeIn((q - 0.34) / 0.66, 2);
    for (let i = 0; i < 7; i++) {
      const y = ((i - 0.3) / 6) * H;
      const dir = i % 2 ? 1 : -1;
      c.fillStyle = [e.paper, mixHex(e.paper, e.slots.faint, 0.5), mixHex(e.paper, e.slots.faint, 0.22)][i % 3];
      tiers(c, W * 0.5 - W * 0.8 + dir * open * W * (1.35 + 0.12 * i), y, W * 1.6, H / 5.4, i + e.seed);
    }
    mistUnderWords(e);
  } },
  'scroll-unroll': { sec: 2.4, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const s = e.slots;
    // a handscroll opened from the middle: what is not yet opened is still wound on the rollers
    const open = ease(clamp01(q * 1.5), 2.4);
    const out = easeIn((q - 0.8) / 0.2, 2);
    const half = W * 0.5 * open;
    const rollW = 118;
    const paper = fibred('washi', mixHex(e.paper, s.ink2, 0.92), s.faint, 1500);
    c.save();
    c.drawImage(paper, 0, 0, W / 2 - half, H, 0, 0, W / 2 - half, H);
    c.drawImage(paper, W / 2 + half, 0, W / 2 - half, H, W / 2 + half, 0, W / 2 - half, H);
    for (const side of [-1, 1]) {
      const x = W / 2 + side * (half + (out * W) / 2);
      c.save();
      c.translate(x, 0);
      if (out > 0) c.globalAlpha = 1 - out;
      lifted(c, 30, -side * 16, 0, 0.5, () => { c.fillStyle = s.plate; c.fillRect(-rollW / 2, -20, rollW, H + 40); });
      const g = c.createLinearGradient(-rollW / 2, 0, rollW / 2, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      c.fillStyle = g;
      c.fillRect(-rollW / 2, -20, rollW, H + 40);
      c.strokeStyle = s.plateInk;
      c.globalAlpha = 0.5 * (1 - out);
      c.lineWidth = 2;
      for (let y = 40; y < H; y += 120) { c.beginPath(); c.moveTo(-rollW / 2, y); c.quadraticCurveTo(0, y + 16, rollW / 2, y); c.stroke(); }
      c.restore();
    }
    c.restore();
  } },
  'plate-pull': { sec: 2.1, clear: 0, draw: (e, q) => {
    // the print pulled plate by plate: bare paper, the sky block, each range, every one landing off register and settling
    const c = e.ctx;
    const out = easeIn((q - 0.84) / 0.16, 2);
    const land = (at: number, f: (dx: number, dy: number) => void) => { const k = (q - at) / 0.16; if (k <= 0) return; const off = (1 - ease(k, 4)) * 34; c.save(); c.globalAlpha = clamp01(k * 5); f(off * (at * 37 % 2 > 1 ? 1 : -1), -off * 0.6); c.restore(); };
    c.save();
    c.globalAlpha = 1 - out;
    c.drawImage(fibred('washi', e.paper, e.slots.faint, 2600), 0, 0);
    land(0.06, (x, y) => c.drawImage(sheet(e, 0.56, e.slots.accent), x, y));
    land(0.26, (x, y) => tiled(c, range(e, 0.66, 340, mixHex(e.slots.faint, e.slots.ink2, 0.4), e.seed % 3), x - 200, y));
    land(0.44, (x, y) => tiled(c, range(e, 0.84, 300, mixHex(e.slots.ink2, e.slots.ink, 0.1), (e.seed % 3) + 5), x - 700, y));
    land(0.62, (x, y) => { c.fillStyle = e.paper; tiers(c, x + W * 0.06, y + H * 0.2, W * 0.7, 56, e.seed); });
    c.restore();
    mistUnderWords(e);
  } },
};

const cartouche: ObjectPaint = (c, w, h, s, seed, look) => {
  // the title slip: a coloured strip printed with a fine double line
  const tone = [s.plate, mixHex(s.plate, s.accent, 0.4), s.plate][look];
  lifted(c, 14, 3, 6, 0.3, () => { c.fillStyle = tone; c.fillRect(0, 0, w, h); });
  c.save();
  c.drawImage(fibred('slip', tone, s.plateInk, 500, Math.ceil(w), Math.ceil(h)), 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.2)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = s.plateInk;
  c.lineWidth = 5;
  c.strokeRect(14, 14, w - 28, h - 28);
  c.lineWidth = 1.6;
  c.strokeRect(25, 25, w - 50, h - 50);
  c.restore();
  void seed;
};
const shikishi: ObjectPaint = (c, w, h, s, seed) => {
  lifted(c, 22, 4, 10, 0.34, () => { c.fillStyle = s.ground; c.fillRect(0, 0, w, h); });
  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  for (let i = 0; i < 420; i++) { c.fillStyle = s.accent; c.globalAlpha = 0.5 * hash(i, seed + 2); const [x, y] = [hash(i, seed) * w, hash(i, seed + 1) * h]; if (Math.abs(y / h - 0.5) < 0.34 && Math.abs(x / w - 0.5) < 0.4) continue; c.beginPath(); c.ellipse(x, y, 1 + 4 * hash(i, 3), 1 + 3 * hash(i, 4), hash(i, 5) * 3, 0, TAU); c.fill(); }
  c.restore();
  c.globalAlpha = 1;
  c.strokeStyle = s.ink;
  c.lineWidth = 3;
  c.strokeRect(9, 9, w - 18, h - 18);
};

export const UKIYOE = { grounds: GROUNDS, ins: INS, pieces: PIECES, objects: { cartouche, shikishi } as Record<string, ObjectPaint> };
