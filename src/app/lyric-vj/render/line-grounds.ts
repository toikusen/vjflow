// The composer's own backdrops: things done to one sheet of paper. Torn layers, offcuts, overprinted tints, a dot screen,
// ruled margins, a woodblock, stitches, tape, punched holes, creases. Each keeps to where the words are not, so the line
// never needs a clearing cut round it. Kept out of KINETIC_FX: the director's list of moves does not offer them.
import type { SymbolName } from '../treatment';
import { SIGN_PATHS } from './signs';
import { cornerRoom, Edge, edgeRoom, edgesByRoom, mixHex, ovalOf, Pt, scrapsOutside, shortCracks, roughEdge, tornLine, insetOutline, contactShadow, Box } from './material';
import { vary } from './knobs';

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const ease = (x: number, p = 3) => 1 - (1 - Math.min(1, Math.max(0, x))) ** p;

export interface GroundEnv {
  ctx: CanvasRenderingContext2D;
  /** Seconds since the cut. */
  age: number;
  paper: string;
  ink: string;
  accent: string;
  seed: number;
  song?: number;
  mood?: number;
  /** The words' box this cut, frame px, y down. */
  rect?: Box;
  /** How much of a line is up over this cut, 0..1. */
  weight?: number;
  /** The song's own sign, if it has one. */
  mark?: SymbolName;
  pulse: number;
}

/** A point on an edge: `u` along it, `v` in from it, frame px. */
const onEdge = (edge: Edge, u: number, v: number): Pt => (edge === 'top' ? [u, v] : edge === 'bottom' ? [u, H - v] : edge === 'left' ? [v, u] : [W - v, u]);
const lengthOf = (edge: Edge) => (edge === 'top' || edge === 'bottom' ? W : H);

const trace = (ctx: CanvasRenderingContext2D, pts: Pt[], close = true) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
};

/** A piece laid on the sheet: its contact shadow, its fill. */
const lay = (ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, lift: number) => {
  const s = contactShadow(lift);
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${s.alpha})`;
  ctx.shadowBlur = s.blur;
  ctx.shadowOffsetX = s.dx;
  ctx.shadowOffsetY = s.dy;
  ctx.fillStyle = fill;
  trace(ctx, pts);
  ctx.fill();
  ctx.restore();
};

const hairline = (ctx: CanvasRenderingContext2D, pts: Pt[], color: string, alpha: number, width = 1.4, close = true) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  trace(ctx, pts, close);
  ctx.stroke();
  ctx.restore();
};

/** A torn sheet standing `depth` in from an edge; `core` is the pale torn thickness showing along the tear. */
function tornSheet(e: GroundEnv, edge: Edge, depth: number, fill: string, seed: number, core: string, lift: number) {
  const n = 96;
  const len = lengthOf(edge);
  const tear = tornLine(n, seed, Math.max(12, depth * 0.13));
  const front = tear.map((off, i) => onEdge(edge, -80 + ((len + 160) * i) / n, depth + off));
  const pts: Pt[] = [onEdge(edge, -80, -80), ...front, onEdge(edge, len + 80, -80)];
  lay(e.ctx, pts, fill, lift);
  // the paper's white core, a few px wide, uneven: what tells a tear from a cut
  const inner = tear.map((off, i) => onEdge(edge, -80 + ((len + 160) * i) / n, depth + off - (2.5 + 3.5 * hash(i, seed))));
  e.ctx.fillStyle = core;
  e.ctx.globalAlpha = 0.85;
  trace(e.ctx, [...front, ...[...inner].reverse()]);
  e.ctx.fill();
  e.ctx.globalAlpha = 1;
}

/** Room on an edge, less what the small tier beside the words may take. */
const roomOf = (e: GroundEnv, edge: Edge) => edgeRoom(e.rect, W, H)[edge] - (e.rect ? 66 : 0);
const bestEdge = (e: GroundEnv, turn = 0) => { const list = edgesByRoom(e.rect, W, H); return list[(turn % 2 + 2) % 2]; };

/** Corners nearest last: the ones furthest from the words first. */
const corners = (e: GroundEnv): Pt[] => {
  const all: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
  return all.sort((a, b) => cornerRoom(e.rect, b[0], b[1], W, H) - cornerRoom(e.rect, a[0], a[1], W, H));
};

const pressings = new Map<string, HTMLCanvasElement>();
/** A sign as a rubber stamp leaves it: one ink, a few places the paper's tooth did not take it. */
function pressed(s: SymbolName, ink: string) {
  const key = `${s}|${ink}`;
  const hit = pressings.get(key);
  if (hit) return hit;
  const cv = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const c = cv.getContext('2d')!;
  c.fillStyle = ink;
  c.strokeStyle = ink;
  SIGN_PATHS[s](c);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) c.fillRect(hash(i, 2) * 128, hash(i, 3) * 128, 1 + 2 * hash(i, 4), 1 + hash(i, 5));
  pressings.set(key, cv);
  return cv;
}

const GROUNDS: Record<string, (e: GroundEnv) => void> = {
  /** Torn sheets stacked up from the edge with the most room, each slipping a little as the cut lands. */
  deckle(e) {
    const edge = bestEdge(e, e.seed);
    const room = Math.min(300, Math.max(70, roomOf(e, edge) - 46));
    const n = Math.round(vary(e, 'deckle.n', 2, 3.4));
    const core = mixHex(e.paper, '#ffffff', 0.72);
    for (let i = 0; i < n; i++) {
      const share = 1 - i / n;
      const d = room * share * vary(e, 'deckle.step', 0.86, 1) * (0.86 + 0.14 * ease(e.age / (0.3 + i * 0.09))) + Math.sin(e.age * 0.4 + i) * 3;
      const tone = i === n - 1 ? mixHex(e.paper, e.accent, 0.5) : mixHex(e.paper, e.ink, 0.06 + i * 0.12);
      tornSheet(e, edge, d, tone, e.seed * 7 + i * 31, core, 12);
    }
  },
  /** Offcuts left on the sheet in the corners away from the words: a colour, its fine partner line, a shadow. */
  offcut(e) {
    const [a, b] = corners(e);
    [[a, e.accent], [b, mixHex(e.paper, e.ink, 0.7)]].forEach(([c, tone], i) => {
      const [cx, cy] = c as Pt;
      const size = Math.min(vary(e, 'offcut.size', 330, 520) * (i ? 0.72 : 1), Math.max(120, cornerRoom(e.rect, cx, cy, W, H) * 1.06));
      const dir: Pt = [cx ? -1 : 1, cy ? -1 : 1];
      const tilt = (hash(e.seed, i) - 0.5) * 0.5 + 0.004 * Math.sin(e.age * 0.5);
      const slide = (1 - ease(e.age / 0.34)) * size * 0.5;
      const out = 90;
      const raw: Pt[] = [[-out, -out], [size * (1 + 0.32 * tilt), -out], [size * (0.74 - 0.24 * tilt), size * (0.52 + 0.3 * tilt)], [-out, size * (0.9 - 0.3 * tilt)]];
      const pts = roughEdge(raw, e.seed + i * 5, 3.2, 40).map(([x, y]): Pt => [cx + dir[0] * (x - slide), cy + dir[1] * (y - slide)]);
      lay(e.ctx, pts, tone as string, 11);
      hairline(e.ctx, insetOutline(raw, 15).map(([x, y]): Pt => [cx + dir[0] * (x - slide), cy + dir[1] * (y - slide)]), e.paper, 0.6, 1.5);
    });
  },
  /** Two slim bars of tint printed out of register against the block: they mark its corner, nothing lies under the words. */
  overprint(e) {
    const { ctx } = e;
    const r = e.rect ?? { x0: W * 0.22, y0: H * 0.3, x1: W * 0.78, y1: H * 0.7 };
    const k = vary(e, 'overprint.tint', 0.22, 0.34);
    const [thick, gap] = [vary(e, 'overprint.thick', 16, 28), vary(e, 'overprint.gap', 18, 30)];
    const grow = ease(e.age / 0.34);
    const off = vary(e, 'overprint.off', 5, 11);
    const bar = (x0: number, y0: number, x1: number, y1: number, seed: number) => roughEdge([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], seed, 1.2, 40);
    const across = (r.x1 - r.x0) * vary(e, 'overprint.reach', 0.34, 0.58) * grow;
    const down = (r.y1 - r.y0) * vary(e, 'overprint.drop', 0.5, 0.86) * grow;
    const fromRight = e.seed % 2 === 0;
    const [ex, sx] = fromRight ? [r.x1 + gap, -1] : [r.x0 - gap, 1];
    const y = r.y0 - gap > thick + 40 ? r.y0 - gap : r.y1 + gap + thick;
    const up = y < r.y0;
    const a = bar(Math.min(ex, ex + sx * across), up ? y - thick : y - thick, Math.max(ex, ex + sx * across), y, e.seed + 3);
    const b = bar(ex - sx * thick, up ? y - thick : y - down, ex, up ? y + down : y, e.seed + 9);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = mixHex('#ffffff', mixHex(e.accent, e.ink, 0.5), k);
    trace(ctx, a);
    ctx.fill();
    ctx.fillStyle = mixHex('#ffffff', mixHex(e.paper, e.ink, 0.5), k);
    trace(ctx, b);
    ctx.fill();
    ctx.restore();
    hairline(ctx, a.map(([px, py]): Pt => [px + off, py - off]), e.ink, 0.28, 1.1);
  },
  /** A dot screen rising off one edge, its dots shrinking away to bare paper before they reach the words. */
  dotscreen(e) {
    const edge = bestEdge(e, e.seed + 1);
    const room = Math.min(380, Math.max(90, roomOf(e, edge) - 26));
    const pitch = vary(e, 'dotscreen.pitch', 15, 24);
    const angle = vary(e, 'dotscreen.angle', 0.2, 0.62);
    const { ctx } = e;
    ctx.fillStyle = mixHex(e.paper, e.ink, 0.62);
    const [cs, sn] = [Math.cos(angle), Math.sin(angle)];
    const len = lengthOf(edge);
    ctx.beginPath();
    const reach = room * ease(e.age / 0.42) * (1 + 0.05 * Math.sin(e.age * 0.9));
    for (let i = -6; i * pitch < len + 200; i++)
      for (let j = -6; j * pitch < room + 200; j++) {
        const [u, v] = [i * pitch * cs - j * pitch * sn, i * pitch * sn + j * pitch * cs];
        if (v < -10 || v > reach || u < -20 || u > len + 20) continue;
        const r = pitch * 0.5 * (1 - v / reach) ** 0.8;
        if (r < 0.7) continue;
        const [x, y] = onEdge(edge, u, v);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    ctx.fill();
  },
  /** Ruled margins above and below the words, drawn out from one side; one accent rule beside them. */
  ledger(e) {
    const { ctx } = e;
    const r = e.rect ?? { x0: W * 0.3, y0: H * 0.34, x1: W * 0.7, y1: H * 0.66 };
    const gap = vary(e, 'ledger.gap', 22, 34);
    const n = Math.round(vary(e, 'ledger.n', 3, 6));
    const k = ease(e.age / 0.7);
    const dirR = e.seed % 2 === 0;
    ctx.strokeStyle = mixHex(e.paper, e.ink, 0.55);
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    const row = (y: number) => { const [a, b] = dirR ? [0, W * k] : [W, W * (1 - k)]; ctx.moveTo(a, y); ctx.lineTo(b, y); };
    for (let i = 0; i < n; i++) {
      const [up, down] = [H * 0.06 + i * gap, H * 0.94 - i * gap];
      if (up < r.y0 - 22) row(up);
      if (down > r.y1 + 22) row(down);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const x = r.x0 > W - r.x1 ? Math.min(r.x0 - 40, W * 0.08) : Math.max(r.x1 + 40, W * 0.92);
    if (x < 20 || x > W - 20 || (x > r.x0 - 24 && x < r.x1 + 24)) return;
    ctx.fillStyle = e.accent;
    ctx.fillRect(x, H * (1 - k) * 0.5, 2.4, H * k);
    ctx.fillRect(x + 7, H * (1 - k) * 0.5, 1.1, H * k);
  },
  /** A woodblock print standing off one side: the ink starved in streaks along the grain, the paper showing through. */
  block(e) {
    const { ctx } = e;
    const edge = bestEdge(e, e.seed);
    const room = Math.max(90, Math.min(edge === 'left' || edge === 'right' ? W * 0.3 : H * 0.34, roomOf(e, edge) - 40));
    const len = lengthOf(edge);
    const press = 1 - 0.018 * (1 - ease(e.age / 0.2));
    const span: [number, number] = [len * (0.08 + hash(e.seed, 1) * 0.3), len * (0.66 + hash(e.seed, 2) * 0.26)];
    const raw = roughEdge([onEdge(edge, span[0], -60), onEdge(edge, span[0] - room * 0.16, room * 0.78), onEdge(edge, span[0] + room * 0.1, room), onEdge(edge, span[1], room * 0.92), onEdge(edge, span[1] + room * 0.14, -60)], e.seed, 3.5, 30);
    const pts = raw.map(([x, y]): Pt => [W / 2 + (x - W / 2) * press, H / 2 + (y - H / 2) * press]);
    ctx.fillStyle = e.accent;
    trace(ctx, pts);
    ctx.fill();
    ctx.save();
    trace(ctx, pts);
    ctx.clip();
    ctx.strokeStyle = e.paper;
    const along = edge === 'left' || edge === 'right' ? 0 : 1;
    for (let i = 0; i < 90; i++) {
      const [a, b] = [hash(i, e.seed + 3), hash(i, e.seed + 4)];
      ctx.globalAlpha = 0.1 + 0.25 * hash(i, e.seed + 5);
      ctx.lineWidth = 0.8 + 2.4 * hash(i, 7);
      const [x, y] = along ? [a * W, H * b] : [W * a, b * H];
      const l = 60 + 240 * hash(i, 8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (along ? l : 6), y + (along ? 6 : l));
      ctx.stroke();
    }
    ctx.restore();
    hairline(ctx, pts.map(([x, y]): Pt => [x + 9, y - 7]), e.ink, 0.35, 1.2);
  },
  /** A running stitch round the margin, sewn on over the first second and more. */
  stitch(e) {
    const { ctx } = e;
    const r = e.rect;
    const inset = Math.min(vary(e, 'stitch.in', 34, 58), r ? Math.max(18, Math.min(r.x0, r.y0, W - r.x1, H - r.y1) - 16) : 58);
    const [dash, gap] = [vary(e, 'stitch.dash', 18, 30), vary(e, 'stitch.gap', 11, 16)];
    const path: Pt[] = [[inset, inset], [W - inset, inset], [W - inset, H - inset], [inset, H - inset], [inset, inset]];
    const total = 2 * (W + H - 4 * inset);
    const k = ease(e.age / 1.4, 2) * total;
    let at = 0;
    ctx.lineCap = 'round';
    path.slice(0, -1).forEach((a, i) => {
      const b = path[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (let s = 0; s + dash < len; s += dash + gap) {
        if (at + s > k) return;
        const wob = (hash(i * 31 + s, e.seed) - 0.5) * 2.4;
        const [x0, y0, x1, y1] = [a[0] + ux * s + uy * wob, a[1] + uy * s - ux * wob, a[0] + ux * (s + dash) - uy * wob, a[1] + uy * (s + dash) + ux * wob];
        ctx.strokeStyle = 'rgba(0,0,0,0.24)';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(x0 + 1.2, y0 + 2);
        ctx.lineTo(x1 + 1.2, y1 + 2);
        ctx.stroke();
        ctx.strokeStyle = e.accent;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      at += len;
    });
  },
  /** Strips of paper tape holding the sheet down at the corners away from the words. */
  washi(e) {
    const { ctx } = e;
    const n = Math.round(vary(e, 'washi.n', 2, 3.4));
    corners(e).slice(0, n).forEach(([cx, cy], i) => {
      const len = vary(e, 'washi.len', 440, 560);
      const wide = vary(e, 'washi.wide', 62, 92);
      const a = (cx ? -1 : 1) * (cy ? -1 : 1) * (0.62 + hash(e.seed, i) * 0.3);
      const k = ease(e.age / (0.26 + i * 0.07));
      const [x, y] = [cx + (cx ? -1 : 1) * 118, cy + (cy ? -1 : 1) * 118];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-a);
      const half = (len / 2) * k;
      const teeth = 7;
      const end = (s: number): Pt[] => Array.from({ length: teeth + 1 }, (_, j) => [s * (half + (j % 2 ? 5 : 0)), -wide / 2 + (j * wide) / teeth]);
      const strip: Pt[] = [...end(-1), ...end(1).reverse()];
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 3;
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = mixHex(e.paper, i % 2 ? e.ink : e.accent, i % 2 ? 0.34 : 0.56);
      trace(ctx, strip);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save();
      trace(ctx, strip);
      ctx.clip();
      ctx.strokeStyle = e.paper;
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.6;
      const step = vary(e, 'washi.step', 12, 20);
      ctx.beginPath();
      for (let s = -half - wide; s < half + wide; s += step) {
        ctx.moveTo(s, -wide / 2);
        ctx.lineTo(s + wide * 0.7, wide / 2);
      }
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    });
  },
  /** A binding: punched holes down the edge away from the words, one ruled line beside them. */
  punched(e) {
    const { ctx } = e;
    const left = !e.rect || e.rect.x0 >= W - e.rect.x1;
    const n = Math.round(vary(e, 'punched.n', 6, 10));
    const r = vary(e, 'punched.r', 13, 20);
    const at = vary(e, 'punched.at', 48, 72);
    const x = left ? at : W - at;
    const show = ease(e.age / 0.5);
    for (let i = 0; i < n; i++) {
      if ((i + 0.5) / n > show + 0.02) continue;
      const y = (H * (i + 0.5)) / n;
      ctx.fillStyle = mixHex(e.ink, e.paper, 0.1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      // what the hole's far lip casts, and the light on the near one
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.arc(x + r * 0.5, y + r * 0.7, r * 1.04, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r + 0.8, 0.2, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = e.accent;
    ctx.globalAlpha = 0.8;
    const lx = left ? at + r + 26 : W - at - r - 26 - 2;
    ctx.fillRect(lx, 0, 2, H * show);
    ctx.globalAlpha = 1;
  },
  /** The sheet folded and opened out once: creases that only turn the light, faint enough to lie under anything. */
  crease(e) {
    const { ctx } = e;
    const lines: [number, boolean][] = [[W * (0.28 + hash(e.seed, 1) * 0.44), true], [H * (0.3 + hash(e.seed, 2) * 0.4), false]];
    const k = 0.5 + 0.5 * ease(e.age / 0.8);
    for (const [at, down] of lines) {
      const width = vary(e, 'crease.w', 60, 110);
      const g = down ? ctx.createLinearGradient(at - width, 0, at + width, 0) : ctx.createLinearGradient(0, at - width, 0, at + width);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.49, `rgba(0,0,0,${0.075 * k})`);
      g.addColorStop(0.51, `rgba(255,255,255,${0.1 * k})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  },
  /** A big sheet in the accent torn away down one side, peeling further as the cut lands. */
  peel(e) {
    const edge = bestEdge(e, e.seed);
    const side = edge === 'left' || edge === 'right';
    const room = Math.max(120, Math.min(side ? W * 0.42 : H * 0.42, roomOf(e, edge) - 30));
    tornSheet(e, edge, room * (0.72 + 0.28 * ease(e.age / 0.3)), e.accent, e.seed * 3, mixHex(e.paper, '#ffffff', 0.8), 20);
  },
  /** Hairline ovals spreading off-centre round the words, at rest as a frame for them; nothing ever crosses the block. */
  'soft-rings'(e) {
    const { ctx } = e;
    const r = e.rect ?? { x0: W * 0.34, y0: H * 0.38, x1: W * 0.66, y1: H * 0.62 };
    const o = ovalOf(r, 30);
    const [sx, sy] = [(e.seed % 2 ? 1 : -1) * vary(e, 'rings.off', 40, 110), (e.seed % 3 ? 1 : -1) * vary(e, 'rings.lift', 18, 48)];
    const n = Math.round(vary(e, 'rings.n', 4, 7));
    const gap = vary(e, 'rings.gap', 46, 84);
    ctx.strokeStyle = mixHex(e.paper, e.ink, 0.6);
    for (let i = 0; i < n; i++) {
      const k = ease((e.age - i * 0.09) / 0.8);
      if (k <= 0) continue;
      const grow = (i + 1) * gap * k;
      ctx.globalAlpha = 0.6 * (1 - i / (n + 1));
      ctx.lineWidth = 1.5 - i * 0.12;
      ctx.beginPath();
      ctx.ellipse(o.cx + sx, o.cy + sy, o.a + Math.abs(sx) + grow, o.b + Math.abs(sy) + grow * 0.72, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  /** Offcuts of this sheet turning slowly along the margins: they ease to a stop while a line is up, and nothing crosses it. */
  'paper-drift'(e) {
    const { ctx } = e;
    const bits = scrapsOutside(Math.round(vary(e, 'drift.n', 9, 15)), e.seed, e.rect, W, H);
    const settled = 1.4 * (1 - (1 - Math.min(1, e.age / 1.4)) ** 2);
    const clock = settled + (1 - (e.weight ?? 0)) * Math.max(0, e.age - settled);
    const tones = [mixHex(e.paper, '#ffffff', 0.5), mixHex(e.paper, e.ink, 0.22), mixHex(e.paper, e.accent, 0.5)];
    bits.forEach((b, i) => {
      const a = b.rot + clock * (0.1 + 0.16 * hash(i, 8)) * (i % 2 ? 1 : -1);
      const pts: Pt[] = Array.from({ length: 4 }, (_, k) => { const q = a + (k / 4) * TAU + hash(i + k, 9) * 0.9; const r = b.r * (0.6 + 1.1 * hash(i, k + 3)); return [b.x + Math.cos(q) * r * 1.5 + (i % 2 ? 7 : -7) * clock, b.y + Math.sin(q) * r - 5 * clock] as Pt; });
      lay(ctx, roughEdge(pts, e.seed + i, 1.1, 9), tones[b.tone], 4);
    });
  },
  /** A corner fan of a few paper leaves opens, and the song's own sign is pressed on the widest once it has: a signing-off, not a seal. */
  'fold-mark'(e) {
    const { ctx } = e;
    const [cx, cy] = corners(e)[0];
    const room = cornerRoom(e.rect, cx, cy, W, H);
    if (room < 250) return;
    const R = Math.min(vary(e, 'fold.r', 300, 380), room * 0.98);
    const n = Math.round(vary(e, 'fold.leaves', 3, 5));
    const start = cx ? (cy ? Math.PI : Math.PI / 2) : cy ? Math.PI * 1.5 : 0;
    const span = Math.PI / 2;
    const w = span / n;
    for (let i = n - 1; i >= 0; i--) {
      const k = ease((e.age - i * 0.05) / 0.34);
      if (k <= 0) continue;
      const [a0, a1] = [start + i * w * k, start + (i + 1) * w * k];
      const r = R * (0.82 + 0.18 * hash(i, e.seed));
      const arc = Array.from({ length: 9 }, (_, q) => { const a = a0 + ((a1 - a0) * q) / 8; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt; });
      lay(ctx, [[cx, cy], ...arc], mixHex(e.paper, i % 2 ? e.accent : e.ink, i % 2 ? 0.34 : 0.12), 6);
      hairline(ctx, [[cx, cy], arc[0]], e.ink, 0.3, 1, false);
    }
    if (!e.mark || e.age < 0.4) return;
    const press = Math.min(1, (e.age - 0.4) / 0.1);
    const size = R * 0.34 * (1.3 - 0.3 * press);
    const mid = start + w * (Math.floor(n / 2) + 0.5);
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * R * 0.6, cy + Math.sin(mid) * R * 0.6);
    ctx.rotate((hash(e.seed, 5) - 0.5) * 0.5);
    ctx.globalAlpha = press * 0.86;
    ctx.drawImage(pressed(e.mark, e.ink), -size / 2, -size / 2, size, size);
    ctx.restore();
  },
  /** One side of the sheet torn back in a fibrous crack or two, the same side all song; it only stirs when no line is up. */
  'paper-edge'(e) {
    const edge = (['left', 'top', 'right', 'bottom'] as Edge[])[Math.abs(e.song ?? e.seed) % 4];
    const room = edgeRoom(e.rect, W, H)[edge];
    const depth = Math.min(vary(e, 'edge.depth', 54, 96), room - 26);
    if (depth < 24) return;
    const n = 320;
    const len = lengthOf(edge);
    const tear = tornLine(n, Math.abs(e.song ?? e.seed) % 97, depth * 0.3);
    // long uneven scoops where the sheet came away, each its own width; never a notch that repeats
    const scoops = Array.from({ length: 3 }, (_, i) => ({ at: 0.08 + 0.3 * i + 0.22 * hash(i, Math.abs(e.song ?? e.seed) % 89), wide: 0.06 + 0.13 * hash(i + 4, Math.abs(e.song ?? e.seed) % 83), deep: depth * (0.22 + 0.42 * hash(i + 8, Math.abs(e.song ?? e.seed) % 79)) }));
    const stir = (1 - (e.weight ?? 0)) * 4 * Math.sin(e.age * 0.5);
    const at = (i: number, less = 0): Pt => {
      const u = i / n;
      const bite = scoops.reduce((a, b) => { const q = Math.max(0, 1 - Math.abs(u - b.at) / b.wide); return a + b.deep * q * q * (3 - 2 * q); }, 0);
      return onEdge(edge, -80 + ((len + 160) * i) / n, depth + tear[i] - bite - less + stir);
    };
    const front = Array.from({ length: n + 1 }, (_, i) => at(i));
    lay(e.ctx, [onEdge(edge, -80, -80), ...front, onEdge(edge, len + 80, -80)], mixHex(e.paper, e.ink, 0.2), 9);
    e.ctx.fillStyle = mixHex(e.paper, '#ffffff', 0.72);
    // the white core runs wider where the fibres pulled
    trace(e.ctx, [...front, ...Array.from({ length: n + 1 }, (_, i) => at(n - i, 2 + 7 * tear[n - i] ** 2 / Math.max(1, (depth * 0.2) ** 2) + 2.5 * hash(n - i, 7)))]);
    e.ctx.fill();
  },
  /** Broken zigzag rows of the paper's own grey along the roomiest margins, unevenly spaced; they run one way and stand still for a line. */
  herringbone(e) {
    const { ctx } = e;
    const pitch = vary(e, 'herring.pitch', 38, 56);
    const run = vary(e, 'herring.run', 26, 42);
    const shift = (1 - (e.weight ?? 0)) * e.age * vary(e, 'herring.speed', 20, 42);
    ctx.strokeStyle = mixHex(e.paper, e.ink, 0.24);
    ctx.lineWidth = vary(e, 'herring.w', 2, 3.2);
    ctx.lineJoin = 'miter';
    for (const edge of edgesByRoom(e.rect, W, H).filter((x) => x === 'top' || x === 'bottom')) {
      const room = Math.min(250, roomOf(e, edge));
      if (room < 60) continue;
      let v = 18;
      for (let r = 0; v < room; r++) {
        const y = edge === 'top' ? v : H - v;
        ctx.beginPath();
        for (let i = -2; (i - 2) * run < W + 80; i++) {
          // a run of the row is left out here and there, and never in the same place
          const gone = hash(i >> 2, r * 7 + e.seed) < 0.22;
          const x = i * run + (shift + r * run * 0.5) % (run * 2);
          const py = y + (i % 2 ? pitch * 0.34 : 0);
          if (gone) ctx.moveTo(x, py);
          else ctx.lineTo(x, py);
        }
        ctx.stroke();
        v += pitch * (0.8 + 0.5 * hash(r, e.seed + 3));
      }
    }
  },
  /** A low flattened sun at the frame's corner, cut by the water line, with uneven strips of its light under it. Always a corner thing. */
  'horizon-light'(e) {
    const { ctx } = e;
    const low = ([[0, H], [W, H]] as Pt[]).sort((a, b) => cornerRoom(e.rect, b[0], b[1], W, H) - cornerRoom(e.rect, a[0], a[1], W, H))[0];
    const room = cornerRoom(e.rect, low[0], low[1], W, H);
    const below = edgeRoom(e.rect, W, H).bottom;
    if (room < 240 || below < 150) return;
    const sea = H - Math.min(below - 34, vary(e, 'sun.sea', 120, 180));
    const r = Math.min(vary(e, 'sun.r', 120, 170), (H - sea) * 1.1, room * 0.42);
    const dir = low[0] ? -1 : 1;
    const x = low[0] + dir * vary(e, 'sun.in', 150, 260);
    const lift = (1 - ease(e.age / 0.8)) * r * 0.4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, sea);
    ctx.clip();
    lay(ctx, Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * TAU; return [x + Math.cos(a) * r * 1.2, sea - r * 0.14 + lift + Math.sin(a) * r * 0.74] as Pt; }), e.accent, 4);
    ctx.restore();
    hairline(ctx, [[low[0] - dir * 10, sea], [x + dir * r * 3, sea]], e.ink, 0.45, 1.4, false);
    ctx.fillStyle = mixHex(e.paper, e.accent, 0.62);
    for (let i = 0; i < 6; i++) {
      const y = sea + 12 + i * (H - sea - 16) / 6;
      const w = r * (1.9 - i * 0.2) * (0.5 + 0.7 * hash(i, e.seed));
      const off = (hash(i, e.seed + 1) - 0.5) * r * 0.5 + Math.sin(e.age * 0.9 + i) * 3;
      ctx.fillRect(x + off - w / 2, y, w * ease(e.age / 0.6), 2.5 + 3 * hash(i, e.seed + 2));
    }
  },
  /** A few short glaze cracks with one fork each in the margin near a corner, off the words and apart from one another. */
  'surface-crack'(e) {
    const { ctx } = e;
    const [cx, cy] = corners(e)[0];
    const r = e.rect ?? { x0: W * 0.3, y0: H * 0.4, x1: W * 0.7, y1: H * 0.6 };
    const blocked = (x: number, y: number) => x < 0 || x > W || y < 0 || y > H || (x > r.x0 - 50 && x < r.x1 + 50 && y > r.y0 - 100 && y < r.y1 + 100);
    const grow = ease(e.age / 0.3, 2);
    for (const p of shortCracks(Math.round(vary(e, 'crackle.n', 3, 4.4)), e.seed, cx, cy, W, H, blocked)) {
      const n = Math.ceil(p.length * grow);
      if (n < 2) continue;
      hairline(ctx, p.slice(0, n).map(([x, y]): Pt => [x + 1.2, y + 1.4]), '#ffffff', 0.5, 1.2, false);
      hairline(ctx, p.slice(0, n), e.ink, 0.75, 1.6, false);
    }
  },
  /** A disc rising off the edge with the most room, cut by a line screen: the sun of a print, not of a screen. */
  disc(e) {
    const { ctx } = e;
    const edge = bestEdge(e, e.seed);
    const room = roomOf(e, edge) - 34;
    if (room < 90) return;
    const r = Math.min(vary(e, 'disc.r', 300, 520), room * 1.02);
    const len = lengthOf(edge);
    const rise = (1 - ease(e.age / 0.5)) * r * 0.5;
    const along = len * (0.24 + 0.52 * hash(e.seed, 3));
    const [x, y] = onEdge(edge, along, -r * 0.06 - rise + Math.sin(e.age * 0.4) * 4);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = e.accent;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = e.paper;
    const step = vary(e, 'disc.step', 15, 24);
    for (let i = 0; i * step < r * 1.1; i++) {
      const v = i * step;
      const [ax, ay] = onEdge(edge, along - r, v * 1 + r * 0.2);
      const [bx, by] = onEdge(edge, along + r, v + r * 0.2 + Math.max(0, step * (0.12 + 0.05 * i)));
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) || Math.max(1, step * (0.12 + 0.05 * i)), Math.abs(by - ay) || Math.max(1, step * (0.12 + 0.05 * i)));
    }
    ctx.restore();
    ctx.strokeStyle = e.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 10, y - 7, r + 11, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
  /** A patch of hand hatching in the corner away from the words, drawn stroke by stroke on the beat of the cut. */
  hatch(e) {
    const { ctx } = e;
    const [cx, cy] = corners(e)[0];
    const size = Math.min(vary(e, 'hatch.size', 420, 640), Math.max(150, cornerRoom(e.rect, cx, cy, W, H) * 1.1));
    const n = Math.round(size / vary(e, 'hatch.gap', 11, 18));
    const k = Math.floor(ease(e.age / 0.6, 2) * n);
    const [dx, dy] = [cx ? -1 : 1, cy ? -1 : 1];
    ctx.strokeStyle = mixHex(e.paper, e.ink, 0.74);
    ctx.lineCap = 'round';
    for (let i = 0; i < k; i++) {
      const q = i / n;
      const s = size * (1 - q);
      const off = size * q;
      const j = (hash(i, e.seed) - 0.5) * 22;
      ctx.lineWidth = 1 + 1.6 * hash(i, e.seed + 1);
      ctx.beginPath();
      ctx.moveTo(cx + dx * (off + j), cy);
      ctx.lineTo(cx, cy + dy * (off - j));
      ctx.stroke();
      if (s < 10) break;
    }
  },
};

/**
 * A strong ground as what it is: a flood of ink laid on a paler sheet, so a thin uneven margin of bare paper runs round the
 * frame, with the wood's grain in the flood. Frame px, drawn over the cut's move and under the sheet.
 */
export function drawFlood(ctx: CanvasRenderingContext2D, seed: number, paper: string, ink: string, accent: string) {
  const dim = mixHex(paper, ink, 0.2);
  const lit = mixHex(paper, '#ffffff', 0.16);
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const y = hash(i, seed + 2) * H;
    ctx.strokeStyle = i % 3 ? dim : lit;
    ctx.globalAlpha = 0.14 + 0.16 * hash(i, seed + 3);
    ctx.lineWidth = 1 + 3 * hash(i, seed + 4) ** 2;
    const x0 = hash(i, seed + 5) * W * 0.8;
    const len = 300 + 900 * hash(i, seed + 6);
    const bow = 18 * (hash(i, seed + 7) - 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(x0 + len / 2, y + bow, x0 + len, y + bow * 0.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const inset = 20;
  const edge = roughEdge([[inset, inset], [W - inset, inset], [W - inset, H - inset], [inset, H - inset]], seed + 11, 3.2, 70);
  ctx.fillStyle = mixHex(accent, '#ffffff', 0.25);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill('evenodd');
}

export const LINE_GROUNDS = Object.keys(GROUNDS);
export const isLineGround = (fx: string) => fx in GROUNDS;
export const drawLineGround = (e: GroundEnv, fx: string) => GROUNDS[fx]?.(e);
