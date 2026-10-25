// A song's stage (StageLayer): one place in perspective where a story is acted by things, LYKY's craft made shared
// (2026-10-23). A surface running to a horizon, one light source the shadows fall away from, things standing at depth
// (further is smaller and higher), and a script of what happens to them: they arrive, fall over, are taken away, dim,
// move; the light rises and goes out; a thread ties two things and is cut. The camera looks at the same place from
// another distance or angle as the story goes. A writer (storyplan.mts) only fills these in: the drawing is fixed,
// so every song gets the same hand-tuned craft for no drawing cost.
import type { Rgb } from './graphics';

export type StageAction = 'in' | 'out' | 'fall' | 'move' | 'dim' | 'light' | 'tie' | 'cut';
export const STAGE_ACTIONS: readonly StageAction[] = ['in', 'out', 'fall', 'move', 'dim', 'light', 'tie', 'cut'];
export type StageFrame = 'wide' | 'close' | 'low' | 'top';
export const STAGE_FRAMES: readonly StageFrame[] = ['wide', 'close', 'low', 'top'];

export interface StageThing {
  /** Sprite id (printed in the song's inks). */
  sprite: string;
  /** Where it stands: x across (0 left .. 1 right), z depth (0 far .. 1 near). */
  x: number;
  z: number;
  /** Size relative to the frame height at the front (0.15 .. 0.6). */
  size: number;
}

export interface StageCue {
  at: number;
  action: StageAction;
  /** The things it acts on (indices); tie and cut take two. */
  things: number[];
  /** move: where to; light: the light's level 0..1. */
  to?: { x: number; z: number };
  level?: number;
}

export interface StageLayer {
  surface: 'table' | 'ground' | 'water' | 'floor';
  /** The light: where it stands across the frame (0..1), its colour, its level at the start (0 dark .. 1 full). */
  light: { x: number; color: Rgb; level: number };
  things: StageThing[];
  script: StageCue[];
  shots: { at: number; frame: StageFrame; focus: number }[];
  ink: Rgb;
  paper: Rgb;
  accent: Rgb;
}

type Draw = { ctx: CanvasRenderingContext2D; t: number; W: number; H: number; art: (id: string) => CanvasImageSource | undefined; busy?: [number, number, number, number][] };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => {
  const k = clamp(x);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
/** The horizon's height on the frame: the surface runs from it to the bottom edge. */
export const HORIZON = 0.46;

/** Where a spot of the surface lands on the frame: further is higher and closer together; and its scale. */
export function project(x: number, z: number, W: number, H: number) {
  const y0 = H * HORIZON, depth = 0.18 + 0.82 * clamp(z);
  return { x: W / 2 + (x - 0.5) * W * (0.55 + 0.55 * depth), y: y0 + (H - y0) * depth * 0.92, s: 0.45 + 0.55 * depth };
}

/** A thing's state at t from the script: where it is, how present (0..1), how fallen (0..1), how lit. */
export function thingAt(script: StageCue[], i: number, base: StageThing, t: number) {
  const mine = script.filter((c) => c.things.includes(i) && c.at <= t);
  const arrive = script.find((c) => c.action === 'in' && c.things.includes(i));
  const present = arrive ? easeOut((t - arrive.at) / 0.7) : 1;
  const out = mine.filter((c) => c.action === 'out').at(-1);
  const gone = out ? ease((t - out.at) / 0.9) : 0;
  const fall = mine.filter((c) => c.action === 'fall').at(-1);
  const fallen = fall ? easeOut((t - fall.at) / 0.45) : 0;
  const dim = mine.filter((c) => c.action === 'dim').at(-1);
  let pos = { x: base.x, z: base.z };
  for (const m of mine.filter((c) => c.action === 'move' && c.to)) {
    const k = ease((t - m.at) / 1.4);
    pos = { x: pos.x + (m.to!.x - pos.x) * k, z: pos.z + (m.to!.z - pos.z) * k };
  }
  return { ...pos, alpha: present * (1 - gone) * (dim ? 1 - 0.5 * ease((t - dim.at) / 1) : 1), fallen, shown: present > 0 && gone < 1 };
}

/** The light's level at t: eased from each light cue to the next. */
export function lightAt(s: Pick<StageLayer, 'light' | 'script'>, t: number): number {
  let level = s.light.level;
  for (const c of s.script.filter((x) => x.action === 'light' && x.at <= t)) level = level + ((c.level ?? level) - level) * ease((t - c.at) / 1.6);
  return level;
}

/** The camera at t: the shot's zoom and centre, eased over 0.8 s from the shot before. */
export function cameraAt(s: Pick<StageLayer, 'shots' | 'things'>, t: number, W: number, H: number) {
  const view = (f: StageFrame, focus: number) => {
    const th = s.things[Math.max(0, Math.min(s.things.length - 1, focus))];
    const p = th ? project(th.x, th.z, W, H) : { x: W / 2, y: H * 0.7 };
    // (a close shot at 1.9 cropped the bridge to a corner and the things to their halves: 1.45 keeps the thing whole)
    if (f === 'close') return { zoom: 1.45, cx: p.x, cy: p.y - H * 0.1, squash: 1 };
    if (f === 'low') return { zoom: 1.2, cx: p.x, cy: H * 0.6, squash: 1.08 };
    if (f === 'top') return { zoom: 1.1, cx: W / 2, cy: H * 0.68, squash: 0.8 };
    return { zoom: 1, cx: W / 2, cy: H / 2, squash: 1 };
  };
  // the camera never looks past the stage's edges
  const keep = (v: { zoom: number; cx: number; cy: number; squash: number }) => {
    const hw = W / (2 * v.zoom), hh = H / (2 * v.zoom * v.squash);
    return { ...v, cx: Math.min(W - hw, Math.max(hw, v.cx)), cy: Math.min(H - hh, Math.max(hh, v.cy)) };
  };
  const past = s.shots.filter((x) => x.at <= t);
  const cur = past.at(-1), prev = past.at(-2);
  const a = keep(prev ? view(prev.frame, prev.focus) : view('wide', 0)), b = keep(cur ? view(cur.frame, cur.focus) : view('wide', 0));
  const k = cur ? ease((t - cur.at) / 0.8) : 1;
  return { zoom: a.zoom + (b.zoom - a.zoom) * k, cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, squash: a.squash + (b.squash - a.squash) * k };
}

/** The stage at song second t. */
export function drawStage(s: StageLayer, d: Draw) {
  const { ctx, t, W, H } = d;
  const level = lightAt(s, t);
  const cam = cameraAt(s, t, W, H);
  ctx.save();
  // the camera: about the shot's centre, a low or high angle stretching or flattening the surface
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom * cam.squash);
  ctx.translate(-cam.cx, -cam.cy);
  const y0 = H * HORIZON;
  // the surface, in the paper's colour shaded toward the ink at the front
  const g = ctx.createLinearGradient(0, y0, 0, H);
  // the surface sinks toward the night ink as the light goes down
  g.addColorStop(0, mix(s.paper, s.ink, 0.25 * (1 - level)));
  g.addColorStop(1, mix(s.paper, s.ink, 0.28 + 0.35 * (1 - level)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-W, y0);
  ctx.lineTo(W * 2, y0);
  ctx.lineTo(W * 2, H * 1.6);
  ctx.lineTo(-W, H * 1.6);
  ctx.fill();
  // its grain running to the vanishing point: table planks, paving joints, ripples, floorboards
  ctx.strokeStyle = mix(s.paper, s.ink, 0.35);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  const vx = W / 2, vy = y0 - H * 0.35;
  if (s.surface === 'water') {
    for (let i = 1; i < 14; i++) {
      const y = y0 + (H - y0) * (i / 14) ** 1.6;
      ctx.beginPath();
      for (let x = -W * 0.2; x < W * 1.2; x += 24) ctx.lineTo(x, y + Math.sin(x / 60 + t * 0.8 + i) * (1 + i * 0.3));
      ctx.stroke();
    }
  } else {
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(vx + (i / 10) * W * 0.18, y0);
      ctx.lineTo(vx + ((i / 10) * W * 1.6), H * 1.4);
      ctx.stroke();
    }
    if (s.surface !== 'table') for (let i = 1; i < 9; i++) {
      const y = y0 + (H - y0) * (i / 9) ** 1.7;
      ctx.beginPath();
      ctx.moveTo(-W, y);
      ctx.lineTo(W * 2, y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // the back edge
  ctx.strokeStyle = s.ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-W, y0);
  ctx.lineTo(W * 2, y0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // the pool of light on the surface
  const lx = W * s.light.x;
  const pool = ctx.createRadialGradient(lx, y0 + (H - y0) * 0.45, 10, lx, y0 + (H - y0) * 0.45, W * 0.55);
  pool.addColorStop(0, rgba(s.light.color, 0.55 * level));
  pool.addColorStop(1, rgba(s.light.color, 0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pool;
  ctx.fillRect(-W, y0 - H * 0.4, W * 3, H * 2);
  ctx.globalCompositeOperation = 'source-over';
  // the things, far first
  const states = s.things.map((th, i) => ({ th, i, st: thingAt(s.script, i, th, t) })).filter((x) => x.st.shown).sort((a, b) => a.st.z - b.st.z);
  const tops: Record<number, [number, number]> = {};
  for (const { th, i, st } of states) {
    const p = project(st.x, st.z, W, H);
    const img = d.art(th.sprite) as (CanvasImageSource & { width: number; height: number }) | undefined;
    const h = H * th.size * p.s;
    const w = img && img.height ? (img.width / img.height) * h : h;
    tops[i] = [p.x, p.y - h * (1 - st.fallen * 0.7)];
    ctx.save();
    ctx.globalAlpha = st.alpha;
    // its shadow, thrown away from the light, longer when the light is low
    const away = Math.sign(p.x - lx) || 1;
    ctx.fillStyle = `rgba(0,0,0,${(0.12 + 0.18 * level).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(p.x + away * w * (0.15 + 0.25 * level), p.y, w * (0.45 + 0.3 * level), Math.max(4, h * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    if (img) {
      ctx.translate(p.x, p.y);
      // fallen: laid over on its side
      ctx.rotate(st.fallen * (Math.PI / 2) * (i % 2 ? 1 : -1));
      ctx.drawImage(img, -w / 2, -h, w, h);
      // lit on the side facing the light, a little
      if (level > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = st.alpha * 0.18 * level;
        ctx.drawImage(img, -w / 2, -h, w, h);
      }
    }
    ctx.restore();
  }
  // threads tied between things, until cut (the two ends then drop)
  for (const tie of s.script.filter((c) => c.action === 'tie' && c.at <= t && c.things.length === 2)) {
    const [a, b] = tie.things;
    const cut = s.script.find((c) => c.action === 'cut' && c.at >= tie.at && c.at <= t && c.things.includes(a) && c.things.includes(b));
    const pa = tops[a], pb = tops[b];
    if (!pa || !pb) continue;
    const grow = easeOut((t - tie.at) / 0.9), drop = cut ? easeOut((t - cut.at) / 1.1) : 0;
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2 + Math.abs(pb[0] - pa[0]) * 0.12;
    ctx.save();
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1 - drop * 0.7;
    ctx.beginPath();
    if (!cut) {
      ctx.moveTo(pa[0], pa[1]);
      const ex = pa[0] + (pb[0] - pa[0]) * grow, ey = pa[1] + (pb[1] - pa[1]) * grow;
      ctx.quadraticCurveTo((pa[0] + ex) / 2, my, ex, ey);
    } else {
      ctx.moveTo(pa[0], pa[1]);
      ctx.quadraticCurveTo(pa[0], my + 200 * drop, mx - 30, my + 260 * drop);
      ctx.moveTo(pb[0], pb[1]);
      ctx.quadraticCurveTo(pb[0], my + 200 * drop, mx + 30, my + 260 * drop);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // the light falls off away from its pool: the room darkens as the light goes down
  const dark = ctx.createRadialGradient(lx, H * 0.6, W * 0.15, lx, H * 0.6, W * 0.9);
  // tinted with the song's ink (a night), not grey
  dark.addColorStop(0, rgba(s.ink, 0.12 * (1 - level)));
  dark.addColorStop(1, rgba(s.ink, 0.6 * (1 - level)));
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
}

function hex(c: Rgb): [number, number, number] {
  const n = parseInt(c.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: Rgb, b: Rgb, k: number): Rgb {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}
function rgba(c: Rgb, a: number): string {
  return `rgba(${hex(c).join(',')},${clamp(a).toFixed(3)})`;
}
