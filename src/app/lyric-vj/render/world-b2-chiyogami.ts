// chiyogami: printed paper folded and stacked. The pattern is the picture: each is drawn as a wood-printed repeat with a fine
// gold line, fills the frame, and changes by part. Everything moves as paper does, on a fold: a fan opens, pleats close, a sheet
// is dealt onto the stack. The words sit on a plain folded band, so no pattern ever crosses a stroke.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, inOut, kept, lifted, mixHex, ObjectPaint, Pt, Slots, TAU, trace, W, WorldEnv } from './world-craft';

type G = OffscreenCanvasRenderingContext2D;
export type Motif = 'asanoha' | 'yagasuri' | 'shippo' | 'ichimatsu' | 'kikuhana' | 'uroko' | 'tatewaku';
const MOTIFS: Motif[] = ['asanoha', 'yagasuri', 'shippo', 'kikuhana', 'ichimatsu', 'uroko', 'tatewaku'];
const STEP: Record<Motif, [number, number]> = { asanoha: [180, 312], yagasuri: [120, 200], shippo: [160, 160], ichimatsu: [150, 150], kikuhana: [260, 225], uroko: [150, 130], tatewaku: [240, 200] };
const line = (c: G, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
/** One repeat of a motif. Tones: base, second, third, and the gold line. */
function repeat(c: G, m: Motif, a: string, b: string, d: string, gold: string) {
  const [w, h] = STEP[m];
  c.fillStyle = a;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = gold;
  c.lineWidth = 2.4;
  c.lineJoin = 'round';
  if (m === 'asanoha') {
    // the hemp leaf: six-pointed stars packed on a triangular grid
    const star = (x: number, y: number) => { const r = h / 3; for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + Math.PI / 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); c.stroke(); const u = t + Math.PI / 3; const [x1, y1, x2, y2] = [x + Math.cos(t) * r, y + Math.sin(t) * r, x + Math.cos(u) * r, y + Math.sin(u) * r]; const mx = (x + x1 + x2) / 3; const my = (y + y1 + y2) / 3; c.fillStyle = i % 2 ? b : d; c.beginPath(); c.moveTo(mx, my); c.lineTo(x, y); c.lineTo(x1, y1); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(mx, my); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fillStyle = a; c.fill(); c.stroke(); } };
    star(0, 0); star(w, 0); star(0, h); star(w, h); star(w / 2, h / 2);
  } else if (m === 'yagasuri') {
    // arrow fletching in two facing columns
    [[0, b], [w / 2, d]].forEach(([x, tone], k) => { const [x0, wd] = [x as number, w / 2]; c.fillStyle = tone as string; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + wd / 2, h * 0.28); c.lineTo(x0 + wd, 0); c.lineTo(x0 + wd, h * 0.62); c.lineTo(x0 + wd / 2, h * 0.9); c.lineTo(x0, h * 0.62); c.closePath(); c.fill(); c.stroke(); void k; line(c, [[x0 + wd / 2, h * 0.28], [x0 + wd / 2, h * 0.9]]); });
  } else if (m === 'shippo') {
    // overlapping circles, the lens between them tinted
    const r = w / 2;
    c.fillStyle = b;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h], [r, r]] as Pt[]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.save(); c.clip(); for (const [p, q] of [[0, r], [w, r], [r, 0], [r, h]] as Pt[]) { c.beginPath(); c.arc(p, q, r, 0, TAU); c.fill(); } c.restore(); }
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h], [r, r], [0, r], [w, r], [r, 0], [r, h]] as Pt[]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  } else if (m === 'ichimatsu') {
    c.fillStyle = b;
    c.fillRect(0, 0, w / 2, h / 2);
    c.fillStyle = d;
    c.fillRect(w / 2, h / 2, w / 2, h / 2);
    c.strokeRect(0, 0, w / 2, h / 2);
    c.strokeRect(w / 2, h / 2, w / 2, h / 2);
    c.globalAlpha = 0.5;
    for (let i = 1; i < 6; i++) line(c, [[w / 2, (i * h) / 12], [w, (i * h) / 12]]);
    for (let i = 1; i < 6; i++) line(c, [[(i * w) / 12, h / 2], [(i * w) / 12, h]]);
    c.globalAlpha = 1;
  } else if (m === 'uroko') {
    // scale triangles, each carrying a smaller one
    const tri = (x: number, y: number, tone: string, up: boolean) => { c.fillStyle = tone; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w / 2, y + (up ? -h / 2 : h / 2)); c.lineTo(x + w, y); c.closePath(); c.fill(); c.stroke(); };
    tri(0, h / 2, b, true); tri(-w / 2, h, d, true); tri(w / 2, h, d, true);
  } else if (m === 'tatewaku') {
    // rising steam: two ribbons swelling and pinching up the sheet
    c.fillStyle = b;
    const wave = (x: number, sgn: number) => { c.beginPath(); for (let y = 0; y <= h; y += 6) { const o = sgn * Math.sin((y / h) * TAU) * 34; if (y) c.lineTo(x + o, y); else c.moveTo(x + o, y); } for (let y = h; y >= 0; y -= 6) c.lineTo(x + 34 + sgn * -Math.sin((y / h) * TAU) * 34, y); c.closePath(); c.fill(); c.stroke(); };
    wave(w * 0.25 - 17, 1);
    c.fillStyle = d;
    wave(w * 0.75 - 17, -1);
  } else {
    // chrysanthemum heads scattered in a half-drop
    const flower = (x: number, y: number, r: number, tone: string) => { for (let i = 0; i < 12; i++) { const t = (i / 12) * TAU; c.fillStyle = tone; c.beginPath(); c.ellipse(x + Math.cos(t) * r * 0.62, y + Math.sin(t) * r * 0.62, r * 0.36, r * 0.13, t, 0, TAU); c.fill(); c.stroke(); } c.fillStyle = gold; c.beginPath(); c.arc(x, y, r * 0.2, 0, TAU); c.fill(); };
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]] as Pt[]) flower(x, y, 92, b);
    flower(w / 2, h / 2, 92, d);
  }
}
const patternTile = (m: Motif, s: Slots, turn = 0) => kept(`cg-t|${m}|${s.plate}|${s.accent}|${s.ink2}|${s.faint}|${turn}`, STEP[m][0], STEP[m][1], (c) => { const [a, b, d] = turn === 0 ? [s.plate, s.accent, s.ink2] : turn === 1 ? [s.accent, s.ink2, s.plate] : [s.ink2, s.plate, s.accent]; repeat(c, m, a, b, d, s.faint); });
/** A whole printed sheet, with its fibres and the unevenness of hand printing; a little larger than the frame. */
const printed = (e: WorldEnv, m: Motif, turn = 0) => kept(`cg-s|${m}|${e.slots.plate}|${e.slots.accent}|${e.slots.ink2}|${turn}`, W + 260, H + 260, (c) => {
  c.fillStyle = c.createPattern(patternTile(m, e.slots, turn), 'repeat')!;
  c.fillRect(0, 0, W + 260, H + 260);
  c.globalCompositeOperation = 'multiply';
  c.drawImage(fibred('cg-fibre', e.paper, e.slots.ink2, 1400, W + 260, H + 260), 0, 0);
  c.globalCompositeOperation = 'source-over';
});
const sheetAt = (e: WorldEnv, m: Motif, turn = 0) => e.ctx.drawImage(printed(e, m, turn), -130 - 24 * Math.sin(e.now * 0.18), -130 - 16 * Math.cos(e.now * 0.15));
/** A big fold lying across the frame: the far side a shade lit, the near side in shadow, a soft line along the crease. */
const foldShade = (e: WorldEnv, a: number) => {
  const c = e.ctx;
  c.save();
  const g = c.createLinearGradient(W * 0.2, 0, W * 0.8, H);
  g.addColorStop(0, 'rgba(255,255,255,0.1)');
  g.addColorStop(0.49, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(0,0,0,${0.22 * a})`);
  g.addColorStop(1, 'rgba(0,0,0,0.02)');
  c.fillStyle = g;
  c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
  c.restore();
};
/** The plain band a free line stands on: wrapped right across the sheet, folded at its edges, a gold line inside each. */
export function obi(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 0, 26);
  if (b.y1 - b.y0 > H * 0.7) return;
  atBase(e, (c) => {
    c.globalAlpha = Math.min(1, e.weight * 4);
    lifted(c, 22, 0, 10, 0.45, () => { c.fillStyle = e.paper; c.fillRect(-20, b.y0, W + 40, b.y1 - b.y0); });
    c.drawImage(fibred('cg-obi', e.paper, e.slots.ink2, 700), 0, b.y0, W, b.y1 - b.y0, 0, b.y0, W, b.y1 - b.y0);
    c.fillStyle = e.slots.faint;
    c.fillRect(0, b.y0 + 12, W, 3);
    c.fillRect(0, b.y1 - 15, W, 3);
    c.globalAlpha = 1;
  });
}
const G: Record<string, HandGround> = {};
for (const m of MOTIFS) G[`chiyogami/${m}`] = (e) => { sheetAt(e, m, e.seed % 3); foldShade(e, 1); obi(e); };
G['chiyogami/patchwork'] = (e) => {
  const c = e.ctx;
  // squares of different papers, each a little askew on the stack
  flood(e, e.paper);
  const n = 5;
  const size = W / n;
  atBase(e, () => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < n + 1; i++) {
      const id = i + j * 7;
      const m = MOTIFS[Math.floor(hash(id, e.seed) * MOTIFS.length)];
      c.save();
      c.translate(size * (i - 0.1 + 0.5 * (j % 2)), j * size * 0.86 - 30);
      c.rotate((hash(id, 3) - 0.5) * 0.1 + 0.012 * Math.sin(e.now * 0.7 + id));
      lifted(c, 14, 4, 7, 0.4, () => { c.fillStyle = c.createPattern(patternTile(m, e.slots, id % 3), 'repeat')!; c.fillRect(-size * 0.54, -size * 0.54, size * 1.08, size * 1.08); });
      c.restore();
    }
  });
  obi(e);
};
G['chiyogami/plain-washi'] = (e) => { const c = e.ctx; c.drawImage(fibred('cg-obi', e.paper, e.slots.ink2, 700), 0, 0); atBase(e, () => { const m = MOTIFS[e.seed % MOTIFS.length]; c.save(); c.translate(W * 0.84, -80); c.rotate(0.5); lifted(c, 30, 8, 12, 0.3, () => { c.fillStyle = c.createPattern(patternTile(m, e.slots, 0), 'repeat')!; c.fillRect(-600, -400, 1400, 820); }); c.restore(); c.save(); c.translate(-20, H + 60); c.rotate(-0.5); lifted(c, 30, 8, 12, 0.3, () => { c.fillStyle = c.createPattern(patternTile(MOTIFS[(e.seed + 2) % MOTIFS.length], e.slots, 1), 'repeat')!; c.fillRect(-500, -320, 1200, 640); }); c.restore(); }); };
G['chiyogami/gold-all'] = (e) => { sheetAt(e, 'kikuhana', 1); flood(e, e.slots.faint, 0.1 + 0.12 * e.pulse); obi(e); };
G['chiyogami/one-fold'] = (e) => { G['chiyogami/plain-washi'](e); };

const INS: Record<string, HandIn> = {
  'corner-fold': { sec: 0.4, draw: (e, q) => { const c = e.ctx; atBase(e, () => { const k = (1 - ease(q, 2)) * (W + H) * 1.1; c.save(); c.beginPath(); c.moveTo(W + 10, H + 10); c.lineTo(W + 10 - k, H + 10); c.lineTo(W + 10, H + 10 - k); c.closePath(); c.fillStyle = e.paper; c.fill(); c.restore(); }); } },
};

const pattern = (c: CanvasRenderingContext2D, e: WorldEnv, m: Motif, turn: number) => c.createPattern(patternTile(m, e.slots, turn), 'repeat')!;
const PIECES: Record<string, Piece> = {
  // a folding fan the size of the frame opens from its rivet at the foot of the picture
  'fan-open': { sec: 2.5, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const n = 19;
    const open = q < 0.42 ? ease(q / 0.42, 3) : 1;
    const out = easeIn((q - 0.78) / 0.22, 2);
    const R = 1500;
    const m = MOTIFS[e.seed % MOTIFS.length];
    c.save();
    c.translate(W / 2, H + 240 + out * 1500);
    c.globalAlpha = 1;
    const spread = 1.62 * open;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 - spread + (i / n) * spread * 2;
      const a1 = a0 + (spread * 2) / n;
      c.save();
      c.beginPath();
      c.moveTo(Math.cos(a0) * 160, Math.sin(a0) * 160);
      c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      c.lineTo(Math.cos(a1) * 160, Math.sin(a1) * 160);
      c.closePath();
      c.fillStyle = pattern(c, e, m, i % 2 ? 0 : 1);
      c.fill();
      const g = c.createLinearGradient(Math.cos(a0) * 800, Math.sin(a0) * 800, Math.cos(a1) * 800, Math.sin(a1) * 800);
      g.addColorStop(0, i % 2 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.04)');
      g.addColorStop(1, i % 2 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = e.slots.faint;
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
    c.restore();
    obi(e);
  } },
  // the frame folds up in pleats like a folded paper, and opens on the next sheet
  'pleat-fold': { sec: 2.2, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const n = 12;
    const k = q < 0.5 ? ease(q / 0.5, 3) : 1 - easeIn((q - 0.5) / 0.5, 3);
    const w = W / n;
    const m = MOTIFS[(e.seed + 1) % MOTIFS.length];
    const m2 = MOTIFS[(e.seed + 3) % MOTIFS.length];
    for (let i = 0; i < n; i++) {
      const sq = Math.max(0.02, 1 - k);
      const x = i * w + (w * k) / 2 * (i % 2 ? 1 : 1);
      c.save();
      c.translate(i * w + w / 2, 0);
      c.fillStyle = pattern(c, e, q < 0.5 ? m : m2, i % 3);
      c.scale(sq, 1);
      c.fillRect(-w / 2, 0, w, H);
      c.restore();
      c.save();
      // the back of each pleat as it turns toward us
      const back = w * Math.sin(k * Math.PI * 0.5);
      c.translate(i * w + (i % 2 ? w : 0), 0);
      c.fillStyle = pattern(c, e, q < 0.5 ? m2 : m, i % 3);
      c.fillRect(i % 2 ? -back / 2 : 0, 0, back / 2, H);
      c.fillStyle = `rgba(0,0,0,${0.3 * k})`;
      c.fillRect(i % 2 ? -back / 2 : 0, 0, back / 2, H);
      c.restore();
      void x;
    }
    obi(e);
  } },
  // sheets dealt off a stack, each landing askew on the last, until the frame is paper
  'sheet-deal': { sec: 2.3, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const n = 15;
    const out = easeIn((q - 0.8) / 0.2, 2);
    for (let i = 0; i < n; i++) {
      const k = clamp01((q - i * 0.042) / 0.16);
      if (k <= 0) continue;
      const land = ease(k, 3);
      const [tx, ty] = [W * (0.1 + 0.8 * hash(i, 1 + e.seed % 3)), H * (0.1 + 0.8 * hash(i, 2 + e.seed % 3))];
      const [fx, fy] = [i % 2 ? W * 1.5 : -W * 0.5, H * (0.2 + 0.6 * hash(i, 4))];
      c.save();
      c.translate(fx + (tx - fx) * land, fy + (ty - fy) * land + out * (i % 2 ? H * 1.3 : -H * 1.3));
      c.rotate((hash(i, 5) - 0.5) * 0.7 + (1 - land) * (i % 2 ? 2 : -2));
      lifted(c, 26, 7, 12, 0.42, () => { c.fillStyle = pattern(c, e, MOTIFS[i % MOTIFS.length], i % 3); c.fillRect(-340, -340, 680, 680); });
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.beginPath(); c.moveTo(-340, 340); c.lineTo(340, -340); c.lineTo(340, 340); c.closePath(); c.fill();
      c.restore();
    }
    obi(e);
  } },
  // four corners of a square brought to the centre, then let go: the paper's oldest fold
  'pinwheel-open': { sec: 2.2, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.5 ? ease(q / 0.5, 3) : 1 - easeIn((q - 0.52) / 0.48, 3);
    const m = MOTIFS[(e.seed + 2) % MOTIFS.length];
    const [cx, cy] = [W / 2, H / 2];
    const cornersOf: [Pt, Pt, Pt][] = [[[0, 0], [W, 0], [cx, cy]], [[W, 0], [W, H], [cx, cy]], [[W, H], [0, H], [cx, cy]], [[0, H], [0, 0], [cx, cy]]];
    cornersOf.forEach(([a, b, o], i) => {
      c.save();
      const f = Math.cos((1 - k) * Math.PI * 0.5);
      const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      c.translate(mx, my);
      if (i % 2) c.scale(f, 1); else c.scale(1, f);
      c.translate(-mx, -my);
      trace(c, [a, b, o]);
      c.fillStyle = pattern(c, e, m, i % 3);
      lifted(c, 26, 0, 6, 0.4, () => c.fill());
      c.strokeStyle = e.slots.faint;
      c.lineWidth = 3;
      c.stroke();
      c.restore();
    });
    obi(e);
  } },
};

/** A strip folded from plain paper: a flap at each end, the pattern showing on the inside of the fold. */
const noshi: ObjectPaint = (c, w, h, s, seed, look) => {
  const m = MOTIFS[(seed + look) % MOTIFS.length];
  lifted(c, 18, 5, 10, 0.4, () => { c.fillStyle = s.ground; c.fillRect(0, 0, w, h); });
  c.drawImage(fibred('cg-tag', s.ground, s.ink2, 400, Math.ceil(w), Math.ceil(h)), 0, 0);
  const flap = Math.min(w, h) * 0.2;
  c.fillStyle = c.createPattern(patternTile(m, s, look % 3), 'repeat')!;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, flap * 0.6); c.lineTo(w / 2, flap * 1.1); c.lineTo(0, flap * 0.6); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(0, h); c.lineTo(w, h); c.lineTo(w, h - flap * 0.5); c.lineTo(w / 2, h - flap); c.lineTo(0, h - flap * 0.5); c.closePath(); c.fill();
  c.strokeStyle = s.faint;
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, w - 3, h - 3);
};
const kite: ObjectPaint = (c, w, h, s, seed, look) => {
  // a paper square laid on its point; the corners folded back show the printed side
  const m = MOTIFS[(seed + look + 2) % MOTIFS.length];
  lifted(c, 22, 6, 12, 0.4, () => { c.fillStyle = s.ground; c.fillRect(0, 0, w, h); });
  const q = Math.min(w, h) * 0.3;
  c.fillStyle = c.createPattern(patternTile(m, s, (look + 1) % 3), 'repeat')!;
  for (const [a, b, d] of [[[0, 0], [q, 0], [0, q]], [[w, 0], [w - q, 0], [w, q]], [[0, h], [q, h], [0, h - q]], [[w, h], [w - q, h], [w, h - q]]] as Pt[][]) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath(); c.fill(); c.strokeStyle = s.faint; c.lineWidth = 3; c.stroke(); }
};

export const CHIYOGAMI = { grounds: G, ins: INS, pieces: PIECES, objects: { noshi, 'fold-kite': kite } as Record<string, ObjectPaint> };
void inOut;
