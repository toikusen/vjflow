// stained-glass, rebuilt from its round-2 board (2026-11-04, 風格設計稿_第二輪/stained-glass a–d) and the owner's note on it:
// the board was flat because its glass let no light through. Here the glass is lit from behind: each pane is clearest at
// its middle and deepest at its edge (the light diffusing in it), a band of sun moves slowly across the window and every
// pane it reaches brightens whole, the leads stay dark and crisp, the stone round the opening stays stone. The windows are
// the board's: a wide transom with a jewelled border and quatrefoils, a rose beside a lancet, a rose filling the frame, four
// lancets. The words are an inscription band: one sheet of pale clear glass in a double lead, nothing crossing it, its
// dark painted letters only ever gaining contrast as the light comes round to them.
import type { Piece } from './world-pieces';
import { atBase, clamp01, ease, fract, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { stoneWall } from './world-r2-tex';
import { R2 } from './r2-inks';

type Box = { x0: number; y0: number; x1: number; y1: number };
interface Pane { p: Path2D; tone: string; x: number; y: number; r: number; a: number; solid?: boolean; within?: Path2D }
interface Window { panes: Pane[]; leads: { p: Path2D; w: number; over?: boolean; within?: Path2D }[]; reveals: Path2D[]; openings: Path2D[]; inscriptions: Path2D[]; sweep: [number, number] }
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const rand = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const rectP = (x: number, y: number, w: number, h: number) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
const circleP = (x: number, y: number, r: number) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };
/** A pointed arch: straight sides up to the springing, two arcs meeting at the point. */
const archP = (x: number, y: number, w: number, h: number) => { const r = w * 0.9; return new Path2D(`M${x} ${y + h}V${y + w * 0.62}A${r} ${r} 0 0 1 ${x + w / 2} ${y}A${r} ${r} 0 0 1 ${x + w} ${y + w * 0.62}V${y + h}Z`); };

/** The window's glass colours, from the scheme: cobalt, ruby and amber lead; emerald and violet join from the board's inks. */
const jewels = (e: WorldEnv) => ({ a: e.slots.ink2, b: e.slots.accent, c: e.slots.faint, d: e.slots.plateInk, pale: [R2.pale1, R2.pale2, R2.pale3] });

class Build {
  w: Window;
  R: () => number;
  constructor(sweep: [number, number], seed: number) { this.w = { panes: [], leads: [], reveals: [], openings: [], inscriptions: [], sweep }; this.R = rand(seed); }
  // (a pane laid over earlier glass takes the earlier leads under it away: a quatrefoil over the quarries is whole)
  pane(p: Path2D, tone: string, x: number, y: number, r: number, lead = 0, within?: Path2D) { this.w.panes.push({ p, tone, x, y, r, a: this.R() * Math.PI, within }); this.w.leads.push({ p, w: 0, over: true, within }); if (lead) this.w.leads.push({ p, w: lead, within }); }
  lead(p: Path2D, w: number) { this.w.leads.push({ p, w }); }
  /** Diamond quarries over a box, kept inside `clip` when the window is drawn (the opening clips them). */
  quarries(x0: number, y0: number, w: number, h: number, q: number, pale: string[], within?: Path2D) {
    for (let j = -1; j <= (h / q) * 2 + 1; j++) for (let i = -1; i <= w / q + 1; i++) {
      const [cx, cy] = [x0 + i * q + (j % 2 ? q / 2 : 0), y0 + (j * q) / 2];
      const p = new Path2D();
      p.moveTo(cx, cy - q / 2); p.lineTo(cx + q / 2, cy); p.lineTo(cx, cy + q / 2); p.lineTo(cx - q / 2, cy); p.closePath();
      this.pane(p, pale[Math.floor(this.R() * pale.length)], cx, cy, q / 2, 5, within);
    }
  }
  quatrefoil(cx: number, cy: number, r: number, c1: string, c2: string, c3: string) {
    const l = r * 0.5;
    const out = new Path2D();
    out.arc(cx, cy - l, l * 1.0, Math.PI, 0); out.arc(cx + l, cy, l, -Math.PI / 2, Math.PI / 2); out.arc(cx, cy + l, l, 0, Math.PI); out.arc(cx - l, cy, l, Math.PI / 2, Math.PI * 1.5); out.closePath();
    const sq = rectP(cx - l, cy - l, 2 * l, 2 * l);
    this.pane(out, c1, cx, cy, r, 7);
    this.pane(sq, c2, cx, cy, l, 7);
    this.pane(circleP(cx, cy, l * 0.55), c3, cx, cy, l * 0.55, 7);
  }
  border(x: number, y: number, w: number, h: number, b: number, seg: number, cols: string[]) {
    const put = (px: number, py: number, pw: number, ph: number, k: number) => this.pane(rectP(px, py, pw, ph), cols[k % cols.length], px + pw / 2, py + ph / 2, Math.max(pw, ph) / 2, 6);
    let i = 0;
    for (let px = x; px < x + w - 1; px += seg, i++) { const pw = Math.min(seg, x + w - px); put(px, y, pw, b, i); put(px, y + h - b, pw, b, i + 1); }
    i = 0;
    for (let py = y + b; py < y + h - b - 1; py += seg, i++) { const ph = Math.min(seg, y + h - b - py); put(x, py, b, ph, i + 1); put(x + w - b, py, b, ph, i); }
  }
  /** The rose: a ring of cobalt with a pointed petal on every spoke, an outer ring of paired wedges capped by pale roundels. */
  rose(cx: number, cy: number, R0: number, Rin: number, n: number, j: ReturnType<typeof jewels>) {
    this.w.reveals.push(circleP(cx, cy, R0 + 20));
    this.w.openings.push(circleP(cx, cy, R0 + 20));
    // (the stone round the rose, laid over any glass behind it, its leads gone under it)
    this.w.panes.push({ p: circleP(cx, cy, R0 + 20), tone: R2.reveal, x: cx, y: cy, r: R0, a: 0, solid: true });
    this.w.leads.push({ p: circleP(cx, cy, R0 + 20), w: 0, over: true });
    const at = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const k = R0 / 530;
    const ring = (r0: number, r1: number, a0: number, a1: number, tone: string) => { const p = new Path2D(); p.arc(cx, cy, r1, a0, a1); p.arc(cx, cy, r0, a1, a0, true); p.closePath(); const [x, y] = at((r0 + r1) / 2, (a0 + a1) / 2); this.pane(p, tone, x, y, (r1 - r0) / 2, 7); };
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2, am = (a0 + a1) / 2;
      ring(Rin, Rin + (R0 - Rin) * 0.495, a0, a1, j.a);
      const pet = new Path2D();
      const [bl, br, ml, mr, tip] = [at(Rin + 8, a0 + 0.06), at(Rin + 8, a1 - 0.06), at(Rin + (R0 - Rin) * 0.25, a0 + 0.07), at(Rin + (R0 - Rin) * 0.25, a1 - 0.07), at(Rin + (R0 - Rin) * 0.44, am)];
      const [q1, q2] = [at(Rin + (R0 - Rin) * 0.41, am - 0.07), at(Rin + (R0 - Rin) * 0.41, am + 0.07)];
      pet.moveTo(...bl); pet.lineTo(...ml); pet.quadraticCurveTo(...q1, ...tip); pet.quadraticCurveTo(...q2, ...mr); pet.lineTo(...br); pet.closePath();
      const [px, py] = at(Rin + (R0 - Rin) * 0.25, am);
      this.pane(pet, i % 2 ? j.b : j.c, px, py, (R0 - Rin) * 0.2, 6);
      ring(Rin + (R0 - Rin) * 0.53, R0, a0, am, i % 2 ? j.b : j.a);
      ring(Rin + (R0 - Rin) * 0.53, R0, am, a1, i % 2 ? j.a : j.d);
      const [qx, qy] = at(Rin + (R0 - Rin) * 0.77, am);
      this.pane(circleP(qx, qy, 26 * k), j.pale[0], qx, qy, 26 * k, 5);
    }
    this.lead(circleP(cx, cy, R0), 14);
  }
}

/** The four windows of the board, built round the words' box (the inscription is sized to it, the glass round it fixed);
 * with no line up there is no inscription pane at all, never an empty one. */
function windowOf(kind: string, e: WorldEnv, r: Box | undefined): Window {
  const j = jewels(e);
  if (kind === 'transom') {
    const b = new Build([0.6, 0.8], 3);
    b.w.reveals.push(rectP(46, 36, 1828, 1008));
    b.w.openings.push(rectP(60, 50, 1800, 980));
    b.quarries(60, 50, 1800, 980, 124, j.pale);
    b.border(60, 50, 1800, 980, 58, 150, [j.a, j.b, j.a, j.c]);
    for (const [x, y] of [[275, 265], [1645, 265], [275, 815], [1645, 815]]) b.quatrefoil(x, y, 140, j.a, j.b, j.c);
    const t = r ?? { x0: 600, y0: 370, x1: 1320, y1: 720 };
    const [cx, cy] = [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2];
    const [hw, hh] = [Math.max(540, (t.x1 - t.x0) / 2 + 130), Math.max(240, (t.y1 - t.y0) / 2 + 80)];
    if (r) b.w.inscriptions.push(rectP(cx - hw, cy - hh, hw * 2, hh * 2));
    return b.w;
  }
  if (kind === 'rose-lancet' || kind === 'lancet-rose') {
    // (board b, and the same board mirrored: the rose and the lancet change sides)
    const left = kind === 'lancet-rose';
    const [rx, lx] = left ? [1360, 240] : [560, 1160];
    const b = new Build([0.8, -0.6], 7);
    b.rose(rx, 540, 450, 170, 12, j);
    b.pane(circleP(rx, 540, 170), j.pale[1], rx, 540, 170, 8);
    b.quatrefoil(rx, 540, 156, j.b, j.a, j.c);
    b.w.reveals.push(archP(lx - 14, 36, 548, 1008));
    const arch = archP(lx, 50, 520, 980);
    b.w.openings.push(arch);
    b.quarries(lx, 50, 520, 980, 104, j.pale, arch);
    b.quatrefoil(lx + 260, 240, 150, j.a, j.b, j.c);
    b.lead(arch, 12);
    const t = r ?? { x0: lx + 190, y0: 380, x1: lx + 330, y1: 900 };
    const cx = (t.x0 + t.x1) / 2;
    const hw = Math.min(230, Math.max(150, (t.x1 - t.x0) / 2 + 60));
    if (r) b.w.inscriptions.push(rectP(cx - hw, Math.min(350, t.y0 - 40), hw * 2, Math.max(640, t.y1 + 40 - Math.min(350, t.y0 - 40))));
    return b.w;
  }
  if (kind === 'rose' || kind === 'window') {
    const b = new Build([0.7, 0.71], 11);
    b.w.openings.push(rectP(0, 0, W, H));
    b.quarries(0, 0, 1920, 1080, 140, j.pale);
    b.rose(960, 540, 530, 262, 16, j);
    if (kind === 'window') { b.pane(circleP(960, 540, 262), j.pale[1], 960, 540, 262, 8); b.quatrefoil(960, 540, 240, j.b, j.a, j.c); return b.w; }
    const t = r ?? { x0: 810, y0: 400, x1: 1110, y1: 700 };
    const rad = Math.max(262, Math.hypot(t.x1 - t.x0, t.y1 - t.y0) / 2 + 40);
    if (r) b.w.inscriptions.push(circleP((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, rad));
    return b.w;
  }
  if (kind === 'predella') {
    // four short lancets over a predella: the lancets' quarries and quatrefoils above, the band window's jewelled border below
    const b = new Build([0.6, 0.8], 23);
    const [w0, gap, top, h0] = [330, 86, 40, 520];
    const x0 = (W - (4 * w0 + 3 * gap)) / 2;
    for (let k = 0; k < 4; k++) {
      const x = x0 + k * (w0 + gap);
      const arch = archP(x, top, w0, h0);
      b.w.reveals.push(archP(x - 14, top - 14, w0 + 28, h0 + 28));
      b.w.openings.push(arch);
      b.quarries(x, top, w0, h0, 96, j.pale, arch);
      b.quatrefoil(x + w0 / 2, top + 320, 120, k % 2 ? j.b : j.a, k % 2 ? j.a : j.b, j.c);
      b.lead(arch, 12);
    }
    const [px, py, pw, ph] = [x0, 590, 4 * w0 + 3 * gap, 460];
    const band = rectP(px, py, pw, ph);
    b.w.reveals.push(rectP(px - 14, py - 14, pw + 28, ph + 28));
    b.w.openings.push(band);
    b.quarries(px, py, pw, ph, 100, j.pale, band);
    b.border(px, py, pw, ph, 50, 140, [j.a, j.b, j.a, j.c]);
    b.lead(band, 12);
    const t = r ?? { x0: 560, y0: 780, x1: 1360, y1: 930 };
    const [cx, cy] = [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2];
    const hw = Math.min(pw / 2 - 70, Math.max(420, (t.x1 - t.x0) / 2 + 90));
    const hh = Math.min(ph / 2 - 40, Math.max(110, (t.y1 - t.y0) / 2 + 40));
    if (r) b.w.inscriptions.push(rectP(cx - hw, cy - hh, hw * 2, hh * 2));
    return b.w;
  }
  // four lancets: the inner two carry the inscription's two columns, the outer two a pair of quatrefoils each
  const b = new Build([0.5, 0.87], 20);
  const t = r ?? { x0: 650, y0: 216, x1: 1270, y1: 990 };
  const cx = (t.x0 + t.x1) / 2;
  // (a line that took no break stands in one column, 4.4 sizes wide against two columns' 8.8, a size being 84–150 px:
  // under 700 px it is one, and gets three lancets with the inscription in the middle one)
  const single = t.x1 - t.x0 - 28 < 700;
  const pitch = Math.max(300, (t.x1 - t.x0 - 28) / 2);
  const size = (t.x1 - t.x0 - 28) / (single ? 4.4 : 8.8);
  const w0 = Math.min(330, pitch - 60);
  const [Y, Hh] = [50, 990];
  const centres = single ? [cx - 416, cx, cx + 416] : [cx - pitch / 2 - 416, cx - pitch / 2, cx + pitch / 2, cx + pitch / 2 + 416];
  centres.forEach((mid, k) => {
    const x = mid - w0 / 2;
    b.w.reveals.push(archP(x - 14, Y - 14, w0 + 28, Hh + 28));
    b.w.openings.push(archP(x, Y, w0, Hh));
    b.quarries(x, Y, w0, Hh, 96, j.pale, archP(x, Y, w0, Hh));
    const carries = single ? k === 1 : k === 1 || k === 2;
    if (!carries) { b.quatrefoil(mid, Y + 400, 140, j.a, j.b, j.c); b.quatrefoil(mid, Y + 740, 140, j.d, j.a, j.c); }
    b.lead(archP(x, Y, w0, Hh), 12);
    if (carries) {
      const hw = Math.min(w0 / 2 - 24, Math.max(92, size / 2 + 46));
      const top = Math.min(250, t.y0 - 34);
      if (r) b.w.inscriptions.push(rectP(mid - hw, top, hw * 2, Math.min(Y + Hh - 30, Math.max(t.y1 + 34, 970)) - top));
    }
  });
  return b.w;
}

/** The window's three pictures, kept: the wall with the glass unlit, the glass lit, and the leads. */
function pictures(kind: string, e: WorldEnv) {
  const r = e.rect;
  const box = r ? [r.x0, r.y0, r.x1, r.y1].map((v) => Math.round(v / 16)).join(',') : '-';
  const key = `r2g|${kind}|${e.slots.ink2}|${e.slots.accent}|${e.slots.faint}|${e.slots.plateInk}|${e.slots.ground}|${box}`;
  const win = () => windowOf(kind, e, r);
  let w: Window | undefined;
  const get = () => (w ??= win());
  const opening = (c: Ctx, f: () => void) => { c.save(); const all = new Path2D(); get().openings.forEach((p) => all.addPath(p)); if (get().openings.length) c.clip(all); f(); c.restore(); };
  const dim = kept(`${key}|dim`, W, H, (c) => {
    if (!stoneWall(c)) { c.fillStyle = e.slots.ground; c.fillRect(0, 0, W, H); }
    c.fillStyle = R2.reveal;
    get().reveals.forEach((p) => c.fill(p));
    opening(c, () => get().panes.forEach((p) => {
      if (p.solid) { c.fillStyle = p.tone; c.fill(p.p); return; }
      if (p.within) { c.save(); c.clip(p.within); }
      // unlit glass: the colour deepened, a directional shade of ±16 % across it
      const g = c.createLinearGradient(p.x - Math.cos(p.a) * p.r, p.y - Math.sin(p.a) * p.r, p.x + Math.cos(p.a) * p.r, p.y + Math.sin(p.a) * p.r);
      const base = mixHex(p.tone, R2.black, 0.24);
      g.addColorStop(0, mixHex(base, R2.white, 0.12));
      g.addColorStop(0.55, base);
      g.addColorStop(1, mixHex(base, R2.black, 0.14));
      c.fillStyle = g;
      c.fill(p.p);
      if (p.within) c.restore();
    }));
  });
  const lit = kept(`${key}|lit`, W, H, (c) => opening(c, () => get().panes.forEach((p) => {
    if (p.solid) { c.fillStyle = p.tone; c.fill(p.p); return; }
    if (p.within) { c.save(); c.clip(p.within); }
    // lit glass: clearest at the middle where the light comes straight through, the colour deepening to its leaded edge
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.25);
    g.addColorStop(0, mixHex(p.tone, R2.day, 0.34));
    g.addColorStop(0.5, mixHex(p.tone, R2.day, 0.1));
    g.addColorStop(1, p.tone);
    c.fillStyle = g;
    c.fill(p.p);
    if (p.within) c.restore();
  })));
  const leads = kept(`${key}|lead`, W, H, (c) => {
    c.strokeStyle = R2.lead;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    opening(c, () => get().leads.forEach((l) => {
      if (l.within) { c.save(); c.clip(l.within); }
      if (l.over) { c.globalCompositeOperation = 'destination-out'; c.fill(l.p); c.globalCompositeOperation = 'source-over'; }
      else { c.lineWidth = l.w; c.stroke(l.p); }
      if (l.within) c.restore();
    }));
  });
  return { dim, lit, leads, get };
}

let scratch: OffscreenCanvas | undefined;
/** The lit glass through a mask: `profile` gives the mask's opacity across the sun's band (0 its middle, 1 its edge and beyond). */
function throughBand(c: CanvasRenderingContext2D, lit: OffscreenCanvas, sweep: [number, number], at: number, mid: number, rest: number, mode: GlobalCompositeOperation) {
  const s = (scratch ??= new OffscreenCanvas(W, H));
  const g = s.getContext('2d')!;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.drawImage(lit, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const [nx, ny] = sweep;
  const span = Math.abs(nx) * W + Math.abs(ny) * H;
  const lo = Math.min(0, nx * W) + Math.min(0, ny * H);
  const d = lo - 380 + at * (span + 760);
  const [bx, by] = [nx * d, ny * d];
  const band = g.createLinearGradient(bx - nx * 380, by - ny * 380, bx + nx * 380, by + ny * 380);
  band.addColorStop(0, `rgba(0,0,0,${rest})`);
  band.addColorStop(0.5, `rgba(0,0,0,${mid})`);
  band.addColorStop(1, `rgba(0,0,0,${rest})`);
  g.fillStyle = band;
  g.fillRect(0, 0, W, H);
  c.save();
  c.globalCompositeOperation = mode;
  c.drawImage(s, 0, 0);
  c.restore();
}
/** The light through the glass now: daylight through every pane, and a band of sun crossing that brightens what it reaches past white-balance (added light, so the colour itself glows). */
function lightUp(c: CanvasRenderingContext2D, lit: OffscreenCanvas, sweep: [number, number], e: WorldEnv, at: number, gain = 1) {
  const floor = Math.min(0.9, (0.58 + 0.2 * e.level) * gain);
  throughBand(c, lit, sweep, at, Math.max(floor, gain), floor, 'source-over');
  throughBand(c, lit, sweep, at, 0.24 * gain, 0, 'lighter');
}
/** Where the sun's band is, 0..1 of its pass: one slow pass every nine seconds of the song, the same through every cut. */
const sunAt = (e: WorldEnv) => fract(e.now / 9 + (e.seed % 7) * 0.13);

const glassGround = (kind: string): HandGround => (e) => atBase(e, (c) => {
  const pics = pictures(kind, e);
  c.drawImage(pics.dim, 0, 0);
  // the window is lit as the words come in: a cut opens on glass half dark and the light comes up through it
  lightUp(c, pics.lit, pics.get().sweep, e, sunAt(e), ease(e.age / 0.8, 2));
  c.drawImage(pics.leads, 0, 0);
  // the inscription: one pane of pale clear glass, a double lead round it, nothing inside but the painted words
  for (const p of pics.get().inscriptions) {
    c.fillStyle = e.slots.plate;
    c.fill(p);
    c.save();
    c.clip(p);
    c.globalAlpha = 0.18;
    c.fillStyle = R2.day;
    c.fill(p);
    c.restore();
    c.strokeStyle = R2.lead;
    c.lineWidth = 12;
    c.stroke(p);
  }
});

const Gs: Record<string, HandGround> = {
  'stained-glass/transom': glassGround('transom'),
  'stained-glass/rose-lancet': glassGround('rose-lancet'),
  'stained-glass/lancet-rose': glassGround('lancet-rose'),
  'stained-glass/rose': glassGround('rose'),
  'stained-glass/lancets': glassGround('lancets'),
  'stained-glass/predella': glassGround('predella'),
  // (between lines the rose alone; a line that lands on it gets its inscription, never letters on coloured glass)
  'stained-glass/window': (e) => glassGround(e.rect ? 'rose' : 'window')(e),
};

/** The words' box with a margin: what a piece's light or shadow keeps out of. */
const keepOut = (e: WorldEnv, c: CanvasRenderingContext2D, m: number) => {
  const r = e.rect;
  if (!r) return;
  const p = new Path2D();
  p.rect(-W, -H, W * 3, H * 3);
  p.rect(r.x0 - m, r.y0 - m, r.x1 - r.x0 + 2 * m, r.y1 - r.y0 + 2 * m);
  c.clip(p, 'evenodd');
};
const band = (c: CanvasRenderingContext2D, k: number, tone: string, a: number, mode: GlobalCompositeOperation) => {
  const x = -600 + k * (W + 1200);
  const g = c.createLinearGradient(x - 300, 0, x + 300, 0);
  g.addColorStop(0, `${tone}00`);
  g.addColorStop(0.5, tone);
  g.addColorStop(1, `${tone}00`);
  c.globalCompositeOperation = mode;
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
};
const PIECES: Record<string, Piece> = {
  // the sun comes out: a band of full daylight crosses the whole window once, quickly
  'sun-sweep': { sec: 1.8, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); keepOut(e, c, 40); band(c, q, R2.day, 0.32, 'lighter'); c.restore(); } },
  // a cloud's shadow goes over the glass and the colour sinks for a moment
  'cloud-pass': { sec: 2.2, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); keepOut(e, c, 40); band(c, q, R2.black, 0.45, 'multiply'); c.restore(); } },
  // first light: the window lit from its foot upward
  'dawn-rise': { sec: 2.4, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); keepOut(e, c, 40); const y = H - ease(q, 2) * (H + 400); const g = c.createLinearGradient(0, y + 400, 0, y); g.addColorStop(0, `${R2.day}00`); g.addColorStop(1, R2.day); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.28 * Math.sin(clamp01(q) * Math.PI); c.fillStyle = g; c.fillRect(0, Math.max(0, y), W, H); c.restore(); } },
};
const INS: Record<string, HandIn> = {
  // a change of part: the light goes off the window and comes back on the next one
  'light-turn': { sec: 0.6, draw: (e, q) => atBase(e, (c) => { c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.55 * Math.sin(q * Math.PI); c.fillStyle = R2.black; c.fillRect(0, 0, W, H); c.restore(); }) },
};

export const GLASS = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
