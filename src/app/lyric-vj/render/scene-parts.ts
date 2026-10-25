// The storyboard's parts, drawn on the graphics canvas: the stage's light, an LED wall and a band across the frame.
// The parts draw their own lines (scene.ts says which text is up when); the same drawing serves the frame and the
// readability check, which draws a frame with and without one text and measures what of it can be seen.
import { splitCalls } from '../calls';
import { callSec as callSecOf, emWidth, leadNeed, MIN_CALL_PX, MIN_LEAD_PX, partRoom, posterPhrases, resolveTime, wrapRows, Scene, ScenePart, SceneSong, ShownText, shownTexts } from '../scene';

const W = 1920;
const H = 1080;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 3;
const rng = (seed: number) => {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const off = (w = W, h = H) => {
  const o = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  return [o, o.getContext('2d')!] as const;
};
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const str = (p: ScenePart, k: string, d: string) => (typeof p.params?.[k] === 'string' ? (p.params[k] as string) : d);
const num = (p: ScenePart, k: string, d: number) => (typeof p.params?.[k] === 'number' ? (p.params[k] as number) : d);

/** The face scene parts set their lines in unless a part names its own. */
export const SCENE_FONT = 'Zen Kaku Gothic New';
/** Every face the parts may set type in (loaded for any storyboard). */
export const SCENE_FONTS = [SCENE_FONT, 'Mochiy Pop One', 'M PLUS Rounded 1c', 'Space Mono'];

export interface SceneFrame {
  t: number;
  /** Index of the last beat (the crowd's sync moves switch on it). */
  beat?: number;
  /** Seconds since the last beat. */
  since: number;
  /** Hide this text (the check draws a frame without it). */
  hide?: ShownText;
  /** Draw only this text, on nothing (the check's reference ink). */
  only?: ShownText;
  /** The scene before ended on a flash: two white frames as this one starts. */
  enterFlash?: boolean;
  /** This scene ends on lights out and t is in its last beat: everything dark. */
  exitDark?: boolean;
  /** The camera's push-in (moments): the whole scene scaled about the frame's centre. */
  zoom?: number;
  /** For each echoed word, how many times it was sung in the scenes before (an echo keeps growing across scenes). */
  carry?: Record<string, number>;
  /** The drops and the finale in this scene: an echo bursts to fill the frame on each. */
  bursts?: number[];
}

/** Where a part drew a text, and at what type size (collected for the check). */
export interface DrawnText {
  text: ShownText;
  rect: { x0: number; y0: number; x1: number; y1: number };
  /** The text's box corners in frame px (rotated with its part). */
  quad?: [number, number][];
  /** A text set in several places (a poster's rows, a line's fan boards): each place's corners. */
  quads?: [number, number][][];
  px: number;
}

/** Draws a scene at t: its parts in z order. Returns where each shown text was drawn. */
export function drawScene(ctx: Ctx, scene: Scene, song: SceneSong, f: SceneFrame): DrawnText[] {
  // the camera's push (a build-up, a drop's punch) scales everything about the centre; the boxes handed to the check
  // are scaled with it, so they stay where the type is drawn
  const z = f.zoom ?? 1;
  if (z !== 1) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    const out = drawScene(ctx, scene, song, { ...f, zoom: 1 });
    ctx.restore();
    const map = ([x, y]: [number, number]): [number, number] => [W / 2 + (x - W / 2) * z, H / 2 + (y - H / 2) * z];
    return out.map((d) => ({ ...d, px: d.px * z, rect: { x0: map([d.rect.x0, 0])[0], y0: map([0, d.rect.y0])[1], x1: map([d.rect.x1, 0])[0], y1: map([0, d.rect.y1])[1] }, quad: d.quad?.map(map), quads: d.quads?.map((q) => q.map(map)) }));
  }
  const every = shownTexts(scene, song);
  const shown = every.filter((x) => f.t >= x.from && f.t < x.to);
  const drawn: DrawnText[] = [];
  for (const p of [...scene.parts].sort((a, b) => a.z - b.z)) {
    const mine = shown.filter((x) => x.partId === p.id);
    const visible = f.only ? mine.filter((x) => same(x, f.only!)) : mine.filter((x) => !f.hide || !same(x, f.hide));
    const ev = events(p, scene, song, f.t);
    if (p.kind === 'stage' && !f.only) stage(ctx, p, f, ev);
    if (p.kind === 'led') drawn.push(...led(ctx, p, f, visible, every.filter((x) => x.partId === p.id), ev, !f.only));
    if (p.kind === 'band') drawn.push(...band(ctx, p, f, visible, mine, !f.only));
    if (p.kind === 'poster') drawn.push(...poster(ctx, p, f, visible, mine, scene, song));
    if (p.kind === 'ticket') drawn.push(...ticket(ctx, p, f, visible, mine, scene, song, !f.only));
    if (p.kind === 'fans') drawn.push(...fans(ctx, p, f, visible, mine, scene, song, !f.only));
    if (p.kind === 'badge') drawn.push(...badges(ctx, p, f, visible, mine, !f.only));
    if (p.kind === 'shout') drawn.push(...shout(ctx, p, f, visible, mine, scene, song));
    if (p.kind === 'echo' && !f.only) echo(ctx, p, f, every.filter((x) => x.partId === p.id), scene, song);
    if (p.kind === 'object') drawn.push(...objects(ctx, p, f, mine, !f.only));
    if (p.kind === 'title') drawn.push(...titleCard(ctx, p, f, !f.only));
  }
  if (!f.only && f.exitDark) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  if (!f.only) {
    // a flash anywhere in the scene, or into it from the scene before, is two frames of pure white (a fading wash reads
    // as grey)
    if (f.enterFlash && f.t >= scene.start && f.t < scene.start + 0.067) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
    }
    const flash = scene.parts.some((p) => (p.events ?? []).some((e) => e.kind === 'flash' && inFlash(resolveTime(e.at, scene, song)?.t, f.t)));
    if (flash) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
    }
  }
  return drawn;
}

const same = (a: ShownText, b: ShownText) => a.partId === b.partId && a.cueId === b.cueId && a.text === b.text && a.at === b.at;
const inFlash = (at: number | undefined, t: number) => at !== undefined && t >= at && t < at + 0.067;

/** Whether the part's lights are off at t (a blackout until a lightsUp). */
function events(p: ScenePart, scene: Scene, song: SceneSong, t: number) {
  const list = (p.events ?? []).map((e) => ({ kind: e.kind, t: resolveTime(e.at, scene, song)?.t ?? Infinity })).sort((a, b) => a.t - b.t);
  const last = list.filter((e) => (e.kind === 'blackout' || e.kind === 'lightsUp') && e.t <= t).pop();
  return { dark: last?.kind === 'blackout', flashAt: list.filter((e) => e.kind === 'flash' && e.t <= t).pop()?.t };
}

// ---------- stage light ----------
function stage(ctx: Ctx, p: ScenePart, f: SceneFrame, ev: { dark: boolean }) {
  const base = str(p, 'base', '#050505');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  if (ev.dark) return;
  const color = str(p, 'color', '#FFFFFF');
  const look = str(p, 'look', 'spot');
  // the bright looks: a room of fan goods, not a dark stage
  if (look === 'gingham' || look === 'stripes' || look === 'bokeh') {
    pastel(ctx, look, base, color, f.t, Math.exp(-f.since * 8));
    return;
  }
  const pulse = Math.exp(-f.since * 8);
  const glow = (x: number, y: number, ang: number, len: number, spread: number, a: number, seed: number) => beam(ctx, x, y, ang, len, spread, color, a, f.t, seed);
  if (look === 'spot') glow(W / 2 + num(p, 'x', 0.55) * (W / 2), -40, -num(p, 'x', 0.55) * 0.75 + Math.sin(f.t * 0.7) * 0.04, 1500, 0.2, 0.45 + 0.2 * pulse, 2);
  if (look === 'sweep')
    [-1, 1].forEach((side, i) => glow(W / 2 + side * W * 0.42, -60, -side * 0.25 + side * Math.sin(f.t * 2.1) * 0.25, 1400, 0.14, 0.32 + 0.3 * pulse, 4 + i));
  if (look === 'backlight') for (let i = 0; i < 7; i++) glow(W / 2 + (i - 3) * 60, H + 40, Math.PI + (i - 3) * 0.28, 1500, 0.06, 0.35 + 0.2 * pulse, 10 + i);
  const crowd = p.params?.['penlights'];
  if (Array.isArray(crowd) && crowd.length) penlights(ctx, crowd as string[], 90, 900, 34, 12, f.t, pulse, str(p, 'crowd', 'sticks'), str(p, 'crowdMotion', 'wave'), f.beat ?? 0);
  // the floor and the dark around the edges
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/** Gingham (base and a lighter colour crossing), diagonal stripes drifting over a base-to-colour wash, or stage bokeh
 * in fan colours over a base glow; a soft halftone in the corner of each. */
function pastel(ctx: Ctx, look: string, base: string, color: string, t: number, pulse: number) {
  if (look === 'gingham') {
    const s = 46, d = (t * 20) % (s * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45;
    for (let x = -s * 2 + d; x < W; x += s * 2) ctx.fillRect(x, 0, s, H);
    for (let y = -s * 2 + d; y < H; y += s * 2) ctx.fillRect(0, y, W, s);
    ctx.globalAlpha = 1;
  }
  if (look === 'stripes') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, base);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFFFFF';
    const d = (t * 60) % 120;
    for (let i = -12; i < 30; i++) {
      ctx.save();
      ctx.translate(i * 120 + d, 0);
      ctx.rotate(-0.5);
      ctx.fillRect(0, -400, 50, H + 800);
      ctx.restore();
    }
    ctx.restore();
  }
  if (look === 'bokeh') {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7);
    g.addColorStop(0, color);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = rng(9);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'blur(6px)';
    for (let i = 0; i < 46; i++) {
      const rr = 30 + r() * 90, x = r() * W, y = r() * H;
      ctx.globalAlpha = (0.18 + r() * 0.25) * (0.7 + 0.5 * pulse);
      ctx.fillStyle = ['#FFD23F', '#5FE0C8', '#62B6FF', '#FFFFFF'][i % 4];
      ctx.beginPath();
      ctx.arc(x + Math.sin(t + i) * 20, y, rr, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let y = 0; y < H; y += 22)
    for (let x = 0; x < W; x += 22) {
      const k = Math.max(0, 1 - Math.hypot(x - W * 0.85, y - H * 0.15) / 900) * 22 * 0.45;
      if (k > 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, k, 0, 7);
        ctx.fill();
      }
    }
  ctx.restore();
}

/** A light cone through haze: soft edge, hot lamp, dust drifting in the beam. */
function beam(ctx: Ctx, x: number, y: number, ang: number, len: number, spread: number, color: string, a: number, t: number, seed: number) {
  const r = rng(seed);
  const [o, g] = off();
  g.translate(x, y);
  g.rotate(ang);
  const grd = g.createLinearGradient(0, 0, 0, len);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(-8, 0);
  g.lineTo(8, 0);
  g.lineTo(len * spread, len);
  g.lineTo(-len * spread, len);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 220; i++) {
    const k = (r() + t * 0.02 * (0.5 + r())) % 1;
    g.fillStyle = `rgba(255,255,255,${0.55 * r()})`;
    g.fillRect((r() - 0.5) * 2 * len * spread * k, k * len, 2, 2);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = a;
  ctx.filter = 'blur(14px)';
  ctx.drawImage(o, 0, 0);
  ctx.filter = 'none';
  ctx.drawImage(o, 0, 0);
  const lg = ctx.createRadialGradient(x, y, 0, x, y, 120);
  lg.addColorStop(0, 'rgba(255,255,255,1)');
  lg.addColorStop(0.15, color);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(x - 120, y - 120, 240, 240);
  ctx.restore();
}

/** Penlights in the crowd: out-of-focus sticks low in the frame, raised on the beat. */
/**
 * The crowd low in the frame, out of focus: what they hold (sticks, heart lights, uchiwa silhouettes, phone lights) and
 * how they move (wave: each its own sway; sync: all as one on the beat; pulse: still, flashing on the beat). Each
 * song's crowd is its own: the same crowd in two songs reads as the same video.
 */
function penlights(ctx: Ctx, colors: string[], n: number, y0: number, size: number, blur: number, t: number, pulse: number, hold = 'sticks', motion = 'wave', beatIndex = 0) {
  const r = rng(5);
  // shapes other than sticks must read as what they are: larger, fewer, nearly sharp (blurred they were all dots)
  const look = { sticks: [1, 1, 1], hearts: [1.8, 0.2, 0.55], uchiwa: [2.4, 0.15, 0.4], phones: [1.3, 0.12, 0.6] }[hold] ?? [1, 1, 1];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < Math.round(n * look[2]); i++) {
    const x = r() * W, y = y0 + r() * (H - y0), s = size * look[0] * (0.5 + r()), ph = r() * 6, a0 = 0.45 + 0.5 * r();
    ctx.filter = `blur(${blur * look[1] * (0.5 + r())}px)`;
    ctx.fillStyle = hold === 'phones' ? '#F4F6FF' : colors[i % colors.length];
    ctx.globalAlpha = motion === 'pulse' ? a0 * (0.35 + 0.65 * pulse) : a0;
    ctx.save();
    if (motion === 'sync') {
      // the whole crowd as one: every hand swings the same way, switching on each beat
      const side = beatIndex % 2 ? 1 : -1;
      ctx.translate(x + side * 14, y - pulse * 30);
      ctx.rotate(side * 0.4 * (1 - pulse * 0.3));
    } else if (motion === 'pulse') ctx.translate(x, y);
    else {
      ctx.translate(x + Math.sin(t * 3 + ph) * 10, y - pulse * 26 * (0.5 + r()));
      ctx.rotate(Math.sin(t * 2.2 + ph) * 0.35);
    }
    ctx.beginPath();
    if (hold === 'hearts') {
      const k = s * 0.5;
      ctx.moveTo(0, k * 0.9);
      ctx.bezierCurveTo(-k * 1.6, -k * 0.2, -k * 0.7, -k * 1.4, 0, -k * 0.5);
      ctx.bezierCurveTo(k * 0.7, -k * 1.4, k * 1.6, -k * 0.2, 0, k * 0.9);
    } else if (hold === 'uchiwa') {
      ctx.ellipse(0, -s * 0.4, s * 0.6, s * 0.55, 0, 0, 7);
      ctx.rect(-s * 0.06, 0, s * 0.12, s * 0.8);
    } else if (hold === 'phones') ctx.roundRect(-s * 0.18, -s * 0.32, s * 0.36, s * 0.64, s * 0.06);
    else ctx.roundRect(-s * 0.22, -s, s * 0.44, s * 2, s * 0.22);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---------- LED wall ----------
const ledCache = new Map<string, { w: number; h: number; on: Uint8Array }>();
/** Text as an on/off dot grid sampled from a smooth heavy face `rows` dots high (a pixel font scaled up lost the
 * strokes of 優勝). */
function ledSample(text: string, rows: number, font: string) {
  const key = `${rows}|${font}|${text}`;
  const hit = ledCache.get(key);
  if (hit) return hit;
  const [, mg] = off(10, 10);
  mg.font = `900 ${rows}px "${font}"`;
  const w = Math.ceil(mg.measureText(text).width) + 2;
  const [o, g] = off(w, rows * 1.15);
  g.font = `900 ${rows}px "${font}"`;
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 1, rows * 0.58);
  const d = g.getImageData(0, 0, o.width, o.height).data;
  const on = new Uint8Array(o.width * o.height);
  for (let i = 0; i < on.length; i++) on[i] = d[i * 4 + 3] > 120 ? 1 : 0;
  const v = { w: o.width, h: o.height, on };
  ledCache.set(key, v);
  return v;
}
const LED_ROWS = 30;

/**
 * The wall behind the stage. 'one' shows the newest text across it; 'row' keeps a burst of calls side by side, the
 * dots shrinking to fit them all. A new text lights white for two frames, then the wall's colour.
 */
function led(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], ev: { dark: boolean }, background: boolean): DrawnText[] {
  const color = str(p, 'color', '#FF1F4B');
  const font = str(p, 'font', SCENE_FONT);
  const cy = H / 2 - num(p, 'y', 0.2) * (H / 2);
  const area = num(p, 'height', 0.62) * H;
  const unlitPitch = 16;
  if (background) {
    // an LED wall is a black panel, on a bright ground as much as on a dark stage (its lit dots read against it)
    ctx.save();
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, cy - area / 2, W, area);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = cy - area / 2 + unlitPitch / 2; y < cy + area / 2; y += unlitPitch) for (let x = unlitPitch / 2; x < W; x += unlitPitch) {
      ctx.beginPath();
      ctx.arc(x, y, unlitPitch * 0.36, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  // 'one': the newest text across the wall; 'row': the current batch, every call of it in the place and size it has
  // from the batch's first (calls not yet shouted keep their places dark)
  // `mine` is every text of the part, shown or not yet: a batch is laid out whole from its first call
  const upAll = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at);
  const row = str(p, 'mode', 'one') === 'row';
  const cur = upAll[upAll.length - 1];
  if (ev.dark || !cur) {
    const idle = str(p, 'idle', '');
    if (idle && background && !ev.dark) {
      // the idle text is the wall at rest: small, dim, drifting (big, it fought the stage light for the frame)
      const s = ledSample(idle, LED_ROWS, font);
      const ip = Math.min(8, (area * 0.45) / s.h);
      dots(ctx, s, (W - s.w * ip) / 2 - ((f.t * 40) % 160) + 80, cy - (s.h * ip) / 2, ip, mix(color, 0.22));
    }
    return [];
  }
  const set = row ? mine.filter((x) => x.batch === cur.batch).sort((a, b) => a.at - b.at) : [cur];
  const rows = row ? Math.max(...set.map((x) => x.row ?? 0)) + 1 : 1;
  const gap = LED_ROWS * 0.6;
  const samples = set.map((x) => ledSample(x.text, LED_ROWS, font));
  const rowCols = Array.from({ length: rows }, (_, r) => set.reduce((s, x, k) => ((x.row ?? 0) === r ? s + samples[k].w + (s ? gap : 0) : s), 0));
  const lineH = LED_ROWS * 1.15;
  const pitch = Math.min(area / (lineH * rows + (rows - 1) * LED_ROWS * 0.3), (W * 0.94) / Math.max(...rowCols));
  const out: DrawnText[] = [];
  const pulse = Math.exp(-f.since * 8);
  const xAt = rowCols.map((c) => (W - c * pitch) / 2);
  set.forEach((it, k) => {
    const r = it.row ?? 0;
    const s = samples[k];
    const x = xAt[r];
    xAt[r] += (s.w + gap) * pitch;
    const y = cy - ((lineH * rows + (rows - 1) * LED_ROWS * 0.3) * pitch) / 2 + r * (lineH + LED_ROWS * 0.3) * pitch;
    if (!(f.t >= it.from && f.t < it.to) || !visible.includes(it)) return;
    const fresh = f.t - it.at < 0.067 && f.t >= it.at;
    const [T, tg] = off();
    dots(tg, s, x, y, pitch, fresh ? '#FFFFFF' : color);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.8 + 0.2 * pulse;
    ctx.filter = `blur(${pitch * 0.9}px)`;
    ctx.drawImage(T, 0, 0);
    ctx.restore();
    // the lit dots themselves are paint, not light: screened over a pale part they vanished
    ctx.drawImage(T, 0, 0);
    out.push({ text: it, rect: { x0: x, y0: y, x1: x + s.w * pitch, y1: y + s.h * pitch }, px: LED_ROWS * pitch });
  });
  return out;
}
function dots(ctx: Ctx, s: { w: number; h: number; on: Uint8Array }, x0: number, y0: number, pitch: number, color: string) {
  ctx.fillStyle = color;
  for (let j = 0; j < s.h; j++)
    for (let i = 0; i < s.w; i++)
      if (s.on[j * s.w + i]) {
        ctx.beginPath();
        ctx.arc(x0 + i * pitch + pitch / 2, y0 + j * pitch + pitch / 2, pitch * 0.42, 0, 7);
        ctx.fill();
      }
}
const mix = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
};

// ---------- band ----------
/**
 * A band across the frame at an angle carrying the lead. Each line slides in as it shows; 'stack' keeps the line
 * before above it, smaller, while the next is sung. Type is fitted to the band's length (never under MIN_LEAD_PX: the
 * check refuses that).
 */
function band(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], background: boolean): DrawnText[] {
  const up = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).slice(-2);
  if (!up.length) return [];
  const ang = (num(p, 'angle', -4) * Math.PI) / 180;
  const cy = H / 2 - num(p, 'y', -0.42) * (H / 2);
  const font = str(p, 'font', SCENE_FONT);
  const fill = str(p, 'color', '#FFFFFF');
  const ink = str(p, 'ink', '#000000');
  const len = W * 0.82;
  const max = num(p, 'size', 160);
  const stacked = up.length === 2;
  // both rows keep the size they came in at: the earlier line moves up, it never shrinks
  const rowH = () => max * 1.25;
  const h = up.length * rowH() + max * 0.25;
  const newest = up[up.length - 1];
  const slide = 1 - easeOut((f.t - newest.from) / 0.18);
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.rotate(ang);
  if (background) {
    ctx.fillStyle = fill;
    ctx.fillRect(-W, -h / 2, W * 2, h);
    ctx.fillStyle = ink;
    ctx.fillRect(-W, -h / 2 - 12, W * 2, 8);
  }
  const out: DrawnText[] = [];
  let y = -h / 2 + max * 0.12;
  up.forEach((it, k) => {
    const want = max;
    ctx.font = `900 ${want}px "${font}"`;
    const w = ctx.measureText(it.text).width;
    const size = Math.min(want, (want * len) / Math.max(1, w));
    y += rowH();
    if (visible.includes(it)) {
      ctx.font = `900 ${size}px "${font}"`;
      ctx.fillStyle = ink;
      ctx.globalAlpha = stacked && k === 0 ? 0.7 : 1;
      const dx = -len / 2 - (it === newest ? slide * W : 0);
      ctx.fillText(it.text, dx, y - size * 0.25);
      ctx.globalAlpha = 1;
      const tw = Math.min(w, len);
      // the rect in frame px: the rotated text's box, as an axis-aligned bound
      const corners = [[dx, y - size * 1.05], [dx + tw, y - size * 1.05], [dx, y], [dx + tw, y]].map(([px, py]) => [W / 2 + px * Math.cos(ang) - py * Math.sin(ang), cy + px * Math.sin(ang) + py * Math.cos(ang)]);
      const quad = [corners[0], corners[1], corners[3], corners[2]] as [number, number][];
      out.push({ text: it, quad, rect: { x0: Math.min(...corners.map((c) => c[0])), y0: Math.min(...corners.map((c) => c[1])), x1: Math.max(...corners.map((c) => c[0])), y1: Math.max(...corners.map((c) => c[1])) }, px: size });
    }
  });
  ctx.restore();
  return out;
}

// ---------- poster ----------
/**
 * A line set as a poster: its phrases stacked down the frame, staggered, each slamming in as it is sung. `big` names
 * the phrase set huge, `accent` the one in the accent colour. Sizes are fitted to the frame (never under MIN_LEAD_PX:
 * the check refuses that).
 */
function poster(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], scene: Scene, song: SceneSong): DrawnText[] {
  const cur = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).pop();
  if (!cur || !visible.includes(cur)) return [];
  const font = inkFont((str(p, 'style', 'slab') as InkStyle), str(p, 'font', ''));
  const big = str(p, 'big', ''), accent = str(p, 'accent', '');
  const ink = str(p, 'color', '#FFFFFF'), hot = str(p, 'accentColor', '#FF1F4B');
  const phrases = posterPhrases(cur.text);
  // first fit each row to its share of the width, then scale all to the frame's height
  const widthOf = (t: string, size: number) => {
    ctx.font = `900 ${size}px "${font}"`;
    return ctx.measureText(t).width;
  };
  let sizes = phrases.map((ph) => {
    // the big word may span rows once a long phrase is broken (引きちぎり踊れ！ → 引きちぎり | 踊れ！)
    const isBig = !!big && (ph.text.includes(big) || big.includes(ph.text));
    const room = W * (isBig ? 0.72 : 0.5);
    const cap = isBig ? 430 : 200;
    return Math.min(cap, (100 * room) / Math.max(1, widthOf(ph.text, 100)));
  });
  // the poster's area: `height` of the frame centred on `y` (room left for a band or badges beside it)
  const areaH = num(p, 'height', 0.86) * H, areaY = H / 2 - num(p, 'y', 0) * (H / 2);
  const total = sizes.reduce((s, x) => s + x * 1.12, 0);
  if (total > areaH) sizes = sizes.map((x) => (x * areaH) / total);
  const out: DrawnText[] = [];
  let y = areaY - sizes.reduce((s, x) => s + x * 1.12, 0) / 2;
  const x0 = W * 0.06;
  let rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const quads: [number, number][][] = [];
  phrases.forEach((ph, k) => {
    const size = sizes[k];
    y += size * 1.12;
    const at = sungAt(cur, ph.start, scene, song);
    if (f.t < at - 0.05) return;
    const w = widthOf(ph.text, size);
    // staggered: the rows step right, a huge row starts further in
    const x = Math.min(W - w - W * 0.04, x0 + (k % 3) * W * 0.12);
    const pop = 1 + 0.25 * (1 - easeOut((f.t - at + 0.05) / 0.14));
    ctx.save();
    ctx.translate(x, y - size * 0.18);
    ctx.scale(pop, pop);
    inkText(ctx, ph.text, 0, 0, size, (str(p, 'style', 'slab') as InkStyle), { font: str(p, 'font', ''), color: accent && ph.text.includes(accent) ? hot : ink });
    ctx.restore();
    rect = { x0: Math.min(rect.x0, x), y0: Math.min(rect.y0, y - size * 1.05), x1: Math.max(rect.x1, x + w), y1: Math.max(rect.y1, y) };
    quads.push([[x, y - size * 1.05], [x + w, y - size * 1.05], [x + w, y], [x, y]]);
  });
  if (rect.x1 > rect.x0) out.push({ text: cur, rect, quads, px: Math.min(...sizes) });
  return out;
}

// ---------- shared: when a character is sung, type materials, boxes ----------
/** When character k of a shown text is sung (a lead text has had its calls taken out: mapped back onto the line). */
function sungAt(x: ShownText, k: number, scene: Scene, song: SceneSong): number {
  const cue = song.cues.find((c) => c.id === x.cueId);
  if (!cue) return x.at;
  const split = splitCalls(cue.text);
  const full = x.role === 'lead' && split.calls.length ? split.map.indexOf(k) : [...cue.text].join('').indexOf(x.text) >= 0 ? [...cue.text.slice(0, cue.text.indexOf(x.text))].length + k : k;
  return resolveTime({ cue: cue.id, char: Math.max(0, Math.min([...cue.text].length - 1, full)) }, scene, song)?.t ?? x.at;
}

/** How many characters of a shown text are sung by t. */
const sungCount = (x: ShownText, t: number, scene: Scene, song: SceneSong) => [...x.text].filter((_, k) => sungAt(x, k, scene, song) <= t + 0.08).length;

export type InkStyle = 'slab' | 'sticker' | 'round' | 'print';
/** Parts whose type is outlined (sticker or round): read by fill against keyline, so that is what is measured. */
const OUTLINED = (p: ScenePart | undefined) => !!p && (['fans', 'badge', 'shout'].includes(p.kind) || (p.kind === 'poster' && ['sticker', 'round'].includes(String(p.params?.['style']))));
/** The face each type material is set in unless a part names its own. */
const inkFont = (style: InkStyle, font: string) => font || (style === 'sticker' ? 'Mochiy Pop One' : style === 'slab' ? SCENE_FONT : 'M PLUS Rounded 1c');
const inkWeight = (style: InkStyle) => (style === 'sticker' ? 400 : 900);

/**
 * One row of type in a material, left-aligned at (x, y) on its baseline: slab (heavy gothic, flat), print (flat), round
 * (white with a thin dark keyline, a fan's cut letters), sticker (a fill with a soft shine, a white keyline, a dark outer
 * keyline stepped into a short extrusion). Returns its width.
 */
function inkText(ctx: Ctx, text: string, x: number, y: number, size: number, style: InkStyle, o: { font?: string; color?: string; color2?: string; dark?: string; align?: CanvasTextAlign } = {}): number {
  const font = `${inkWeight(style)} ${size}px "${inkFont(style, o.font ?? '')}"`;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const w = ctx.measureText(text).width;
  // the keyline is the fill's opposite: a dark keyline round dark type filled its counters in (てぇてぇ's chorus read
  // as one dark blob)
  const dark = o.dark ?? (hexLight(o.color ?? (style === 'sticker' ? '#FFD23F' : '#FFFFFF')) ? '#4A1838' : '#FFFFFF');
  if (style === 'round') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = size * 0.14;
    ctx.strokeText(text, x + 3, y + 5);
    ctx.lineWidth = size * 0.1;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = o.color ?? '#FFFFFF';
    ctx.fillText(text, x, y);
  } else if (style === 'sticker') {
    const depth = Math.round(size * 0.07);
    ctx.strokeStyle = dark;
    ctx.lineWidth = size * 0.26;
    for (let d = depth; d >= 0; d -= 2) ctx.strokeText(text, x + d * 0.6, y + d);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.16;
    ctx.strokeText(text, x, y);
    const [b, g] = off(w + size, size * 1.6);
    g.font = font;
    g.textBaseline = 'alphabetic';
    g.fillStyle = o.color ?? '#FFD23F';
    g.fillText(text, size / 2, size * 1.2);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, size * 0.2, 0, size * 1.25);
    gr.addColorStop(0, o.color ?? '#FFD23F');
    gr.addColorStop(1, o.color2 ?? o.color ?? '#FF9F1C');
    g.fillStyle = gr;
    g.fillRect(0, 0, b.width, b.height);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(0, 0, b.width, size * 0.62);
    const bx = o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0;
    ctx.drawImage(b, x - bx - size / 2, y - size * 1.2);
  } else {
    ctx.fillStyle = o.color ?? '#FFFFFF';
    ctx.fillText(text, x, y);
  }
  ctx.restore();
  return w;
}

/** Whether a #rrggbb colour is not dark (relative luminance over 0.12); anything unparsed counts as light. */
function hexLight(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  // only truly dark fills take a light keyline: a mid pink (#FF5A7A, 0.30) swapped to white went soft on a pale ground
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255) > 0.12;
}

/** A box (x0..x1, y0..y1 in a part's own space) as frame corners, the part placed at (cx, cy) and turned by ang. */
function quadAt(cx: number, cy: number, ang: number, x0: number, y0: number, x1: number, y1: number): Pick<DrawnText, 'rect' | 'quad'> {
  const q = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][]).map(([x, y]) => [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)] as [number, number]);
  return { quad: q, rect: { x0: Math.min(...q.map((p) => p[0])), y0: Math.min(...q.map((p) => p[1])), x1: Math.max(...q.map((p) => p[0])), y1: Math.max(...q.map((p) => p[1])) } };
}
const dropShadow = (ctx: Ctx, fn: () => void, blur = 30, dy = 18, a = 0.28) => {
  ctx.save();
  ctx.shadowColor = `rgba(74,24,56,${a})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  fn();
  ctx.restore();
};
/** The size a text's rows take in a box of `w` px with `rows` rows at most (never above `max`). */
function fitRows(ctx: Ctx, text: string, w: number, rows: number, max: number, style: InkStyle, font: string): { rows: string[]; size: number } {
  // every way to break it into 1..rows rows; the one that sets it largest wins (two rows of 商売／繁盛！ beat one small row)
  ctx.font = `${inkWeight(style)} 100px "${inkFont(style, font)}"`;
  const em = emWidth(text);
  const options = [...Array.from({ length: rows }, (_, k) => wrapRows(text, Math.max(1, em / (k + 1) + 1), k + 1) ?? (k ? undefined : [text])), wrapRows(text, w / MIN_LEAD_PX, rows)].filter((x): x is string[] => !!x);
  const sized = options.map((lines) => {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    return { rows: lines, size: Math.min(max, (100 * w) / Math.max(1, widest), (max * rows) / lines.length) };
  });
  return sized.sort((a, b) => b.size - a.size)[0];
}

// ---------- ticket ----------
/**
 * A cheki ticket per line, dropping in from above as the line comes; the line printed on its face as it is sung (two
 * rows at most). A peel event tears the face off along the perforation and throws it away; `timer` counts down to it.
 */
function ticket(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], scene: Scene, song: SceneSong, background: boolean): DrawnText[] {
  const cur = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).pop();
  const w = num(p, 'w', 1420), h = num(p, 'h', 560);
  if (!cur) {
    // the ticket is gone; the staff's timer stays, stuck on TIME UP
    if (background && p.params?.['timer'] && (p.events ?? []).some((e) => e.kind === 'peel' && (resolveTime(e.at, scene, song)?.t ?? Infinity) <= f.t))
      timerChip(ctx, W / 2 + num(p, 'x', 0) * (W / 2) + w * 0.32, H / 2 - num(p, 'y', 0) * (H / 2) - h * 0.6, 'TIME UP', Math.floor(f.t * 6) % 2 === 0);
    return [];
  }
  const cx = W / 2 + num(p, 'x', 0) * (W / 2), cy0 = H / 2 - num(p, 'y', 0) * (H / 2);
  const ang = (num(p, 'angle', -3) * Math.PI) / 180;
  const stub = str(p, 'color', '#FF3D8B');
  const peels = (p.events ?? []).filter((e) => e.kind === 'peel').map((e) => resolveTime(e.at, scene, song)?.t ?? Infinity);
  const peelAt = peels.filter((x) => x >= cur.from).sort((a, b) => a - b)[0] ?? Infinity;
  const peel = easeOut((f.t - peelAt) / 0.45);
  const drop = 1 - easeOut((f.t - cur.from) / 0.3);
  const cy = cy0 - drop * 900;
  const stubX = w / 2 - 300, fw = w - 300;
  const out: DrawnText[] = [];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang + drop * 0.2);
  if (background) {
    dropShadow(ctx, () => {
      ctx.fillStyle = stub;
      ctx.beginPath();
      ctx.roundRect(stubX, -h / 2, 300, h, [0, 26, 26, 0]);
      ctx.fill();
    }, 30, 16, 0.25);
    ctx.save();
    ctx.translate(w / 2 - 150, 0);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '400 60px "Mochiy Pop One"';
    ctx.fillText(str(p, 'stub', '特典券'), 0, -20);
    ctx.font = '700 30px "Space Mono"';
    ctx.fillText(str(p, 'serial', 'No.0046'), 0, 40);
    ctx.restore();
  }
  // the face, torn off along the perforation and thrown up and away
  ctx.save();
  ctx.translate(stubX, -h / 2);
  ctx.rotate(-peel * 0.9);
  ctx.translate(-stubX - peel * 900, h / 2 - peel * 700);
  if (background) {
    dropShadow(ctx, () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, fw, h, [26, 0, 0, 26]);
      ctx.fill();
    }, 40, 24, 0.3);
    ctx.fillStyle = '#FFFFFF';
    for (let yy = -h / 2 + 18; yy < h / 2; yy += 30) {
      ctx.beginPath();
      ctx.arc(stubX, yy, 7, 0, 7);
      ctx.fill();
    }
    ctx.font = '700 28px "Space Mono"';
    ctx.fillStyle = stub;
    ctx.fillText(str(p, 'title', 'CHEKI × 1'), -w / 2 + 60, -h / 2 + 70);
    ctx.fillRect(-w / 2 + 60, -h / 2 + 90, fw - 120, 4);
  }
  if (visible.includes(cur)) {
    const fit = fitRows(ctx, cur.text, fw - 120, 2, 120, 'print', '');
    const shown = sungCount(cur, f.t, scene, song);
    let left = shown;
    fit.rows.forEach((row, i) => {
      const part = [...row].slice(0, Math.max(0, left)).join('');
      left -= [...row].length;
      inkText(ctx, part, -w / 2 + 60, -h / 2 + 130 + (i + 1) * fit.size * 1.2, fit.size, 'print', { color: i === 0 ? stub : '#4A1838' });
    });
    if (peel < 0.05) {
      const top = -h / 2 + 130, bottom = top + fit.rows.length * fit.size * 1.2 + fit.size * 0.25;
      out.push({ text: cur, ...quadAt(cx, cy, ang, -w / 2 + 60, top, -w / 2 + 60 + fw - 120, bottom), px: fit.size });
    }
  }
  ctx.restore();
  ctx.restore();
  // the staff's timer, counting down to the peel
  if (background && p.params?.['timer'] && peelAt < Infinity) {
    const left = Math.max(0, peelAt - f.t);
    timerChip(ctx, cx + w * 0.32, cy0 - h * 0.6, left === 0 ? 'TIME UP' : `00:${String(Math.ceil(left)).padStart(2, '0')}`, left === 0 || (left < 0.6 && Math.floor(f.t * 8) % 2 === 0));
  }
  return out;
}

function timerChip(ctx: Ctx, x: number, y: number, text: string, lit: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.08);
  dropShadow(ctx, () => {
    ctx.fillStyle = '#4A1838';
    ctx.beginPath();
    ctx.roundRect(-200, -60, 400, 120, 60);
    ctx.fill();
  });
  ctx.font = '700 60px "Space Mono"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = lit ? '#FFFFFF' : '#FF4D6D';
  ctx.fillText(text, 30, 4);
  ctx.restore();
}

// ---------- fan boards ----------
const FAN_COLORS = ['#FF6FAE', '#62B6FF', '#5FE0C8', '#FFD23F'];
/** One uchiwa per phrase of the line, popping up from below as the phrase is sung and swaying on the beat. */
function fans(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], scene: Scene, song: SceneSong, background: boolean): DrawnText[] {
  const cur = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).pop();
  if (!cur) return [];
  const r = num(p, 'r', 270);
  const cy = H / 2 - num(p, 'y', -0.15) * (H / 2);
  const colors = Array.isArray(p.params?.['colors']) && (p.params['colors'] as string[]).length ? (p.params['colors'] as string[]) : FAN_COLORS;
  const phrases = posterPhrases(cur.text, false);
  // every board of the line set at the size of its smallest: a line's type does not change as its boards come up
  const size = Math.min(...phrases.map((ph) => fitRows(ctx, ph.text, r * 1.55, 2, r * 0.5, 'round', '').size));
  const pulse = Math.exp(-f.since * 8);
  const out: DrawnText[] = [];
  phrases.forEach((ph, k) => {
    const at = sungAt(cur, ph.start, scene, song) - 0.12;
    if (f.t < at) return;
    const x = (W * (k + 0.5)) / phrases.length;
    const rise = 1 - easeOut((f.t - at) / 0.3);
    const ang = (k - (phrases.length - 1) / 2) * 0.12 + Math.sin(f.t * 5 + k) * 0.04;
    const y = cy + rise * 700 - pulse * 18;
    const col = colors[k % colors.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (background) {
      dropShadow(ctx, () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(-r * 0.09, r * 0.8, r * 0.18, r * 0.9, r * 0.06);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.06, r * 0.96, 0, 0, 7);
        ctx.fill();
      });
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.85, 0, 0, 7);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.85, 0, 0, 7);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(-r, r * 0.2, 2 * r, r);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.5, r * 0.6, r * 0.18, -0.3, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    if (visible.includes(cur)) {
      const fit = { ...fitRows(ctx, ph.text, r * 1.55, 2, r * 0.5, 'round', ''), size };
      const lh = fit.size * 1.12;
      fit.rows.forEach((row, i) => inkText(ctx, row, 0, (i - (fit.rows.length - 1) / 2) * lh + fit.size * 0.38, fit.size, 'round', { align: 'center' }));
      // the whole line's box is the union of its boards; each board reported on its own quad
      if (rise < 0.05) out.push({ text: cur, ...quadAt(x, y, ang, -r * 0.8, -lh * fit.rows.length * 0.5 - fit.size * 0.2, r * 0.8, lh * fit.rows.length * 0.5 + fit.size * 0.1), px: fit.size });
    }
    ctx.restore();
  });
  return mergeBoards(out);
}
/** A line shown on several boards is one text to the check: its boxes merged (size: the smallest board's). */
function mergeBoards(list: DrawnText[]): DrawnText[] {
  if (list.length <= 1) return list;
  const rect = { x0: Math.min(...list.map((d) => d.rect.x0)), y0: Math.min(...list.map((d) => d.rect.y0)), x1: Math.max(...list.map((d) => d.rect.x1)), y1: Math.max(...list.map((d) => d.rect.y1)) };
  return [{ text: list[0].text, rect, quads: list.map((d) => d.quad!), px: Math.min(...list.map((d) => d.px)) }];
}

// ---------- badges ----------
/** A tin badge pinned for each call as it is shouted, in a row from (x, y) leftwards. */
function badges(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], background: boolean): DrawnText[] {
  const r = num(p, 'r', 180);
  const face = str(p, 'color', '#FF3D8B');
  const x0 = W / 2 + num(p, 'x', 0.65) * (W / 2), y0 = H / 2 - num(p, 'y', 0.45) * (H / 2);
  const up = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at);
  const out: DrawnText[] = [];
  up.forEach((it, k) => {
    const x = x0 - k * r * 2.3, y = y0 + (k % 2) * r * 0.4;
    const s = Math.max(0.001, easeBack((f.t - it.at + 0.05) / 0.22));
    const ang = -0.15 + (k % 2) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(s, s);
    if (background) {
      dropShadow(ctx, () => {
        ctx.fillStyle = '#D9D2DA';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 7);
        ctx.fill();
      });
      const rim = ctx.createLinearGradient(-r, -r, r, r);
      rim.addColorStop(0, '#FFFFFF');
      rim.addColorStop(1, '#A89AA6');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, 7);
      ctx.fill();
    }
    if (visible.includes(it)) {
      const fit = fitRows(ctx, it.text, r * 1.6, 2, r * 0.55, 'round', 'Mochiy Pop One');
      fit.rows.forEach((row, i) => inkText(ctx, row, 0, (i - (fit.rows.length - 1) / 2) * fit.size * 1.1 + fit.size * 0.36, fit.size, 'round', { font: 'Mochiy Pop One', align: 'center' }));
      if (s > 0.97) out.push({ text: it, ...quadAt(x, y, ang, -r * 0.8, -fit.size * fit.rows.length * 0.6, r * 0.8, fit.size * fit.rows.length * 0.6), px: fit.size });
    }
    if (background) {
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = r * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, Math.PI * 1.08, Math.PI * 1.45);
      ctx.stroke();
    }
    ctx.restore();
  });
  return out;
}
const easeBack = (k: number) => {
  k = clamp01(k);
  return 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
};

// ---------- shout ----------
/** A shout as sticker type: each character popping in as it is shouted, the word shaking on each, held a moment. */
function shout(ctx: Ctx, p: ScenePart, f: SceneFrame, visible: ShownText[], mine: ShownText[], scene: Scene, song: SceneSong): DrawnText[] {
  const cur = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).pop();
  if (!cur || !visible.includes(cur)) return [];
  const n = Math.max(1, sungCount(cur, f.t, scene, song));
  const chars = [...cur.text];
  // a closing mark comes with the last sound
  const shown = chars.slice(0, n >= chars.filter((c) => !/[！？!?]/.test(c)).length ? chars.length : n).join('');
  const last = sungAt(cur, Math.min(chars.length - 1, n - 1), scene, song);
  const k = clamp01((f.t - last) / 0.18);
  const jiggle = k >= 1 ? 0 : Math.sin(k * 40) * 16 * (1 - k);
  const ang = (num(p, 'angle', -4) * Math.PI) / 180;
  const y = H / 2 - num(p, 'y', 0.5) * (H / 2);
  ctx.font = `400 100px "Mochiy Pop One"`;
  const size = Math.min(num(p, 'size', 230), (100 * W * 0.8) / Math.max(1, ctx.measureText(cur.text).width));
  ctx.save();
  ctx.translate(W / 2 + jiggle, y);
  ctx.rotate(ang);
  const s = 1 + 0.15 * Math.exp(-f.since * 8);
  ctx.scale(s, s);
  ctx.font = `400 ${size}px "Mochiy Pop One"`;
  const full = ctx.measureText(cur.text).width;
  inkText(ctx, shown, -full / 2, size * 0.35, size, 'sticker', { color: str(p, 'color', '#FFD23F'), color2: str(p, 'color2', '#FF9F1C') });
  ctx.restore();
  return [{ text: cur, ...quadAt(W / 2, y, ang, -full / 2 - size * 0.15, -size * 0.75, full / 2 + size * 0.15, size * 0.5), px: size }];
}

// ---------- story objects and the title ----------
type Picture = CanvasImageSource & { width: number; height: number };
let pictureOf: (prop: string) => Picture | undefined = () => undefined;
let songMeta = { title: '', artist: '' };
/** The story's drawn props (spr:<id>) and the song's title, as the engine has them. */
export function setScenePictures(fn: typeof pictureOf, meta?: { title: string; artist: string }) {
  pictureOf = fn;
  if (meta) songMeta = meta;
}

/**
 * A story prop in the frame, like the ticket: it comes in as its line is sung (pops, drops or slides in), then only
 * breathes a little — no drifting, no wobble — until the scene ends or the part's next prop takes its place.
 */
function objects(ctx: Ctx, p: ScenePart, f: SceneFrame, mine: ShownText[], draw: boolean): DrawnText[] {
  const cur = mine.filter((x) => f.t >= x.from && f.t < x.to).sort((a, b) => a.at - b.at).pop();
  if (!cur) return [];
  const pic = pictureOf(cur.text);
  const h = Math.min(0.6, Math.max(0.1, num(p, 'size', 0.3))) * H;
  const w = pic ? (h * pic.width) / Math.max(1, pic.height) : h;
  const cx = W / 2 + num(p, 'x', 0.55) * (W / 2), cy = H / 2 - num(p, 'y', 0) * (H / 2);
  const ang = (num(p, 'angle', 0) * Math.PI) / 180;
  const k = clamp01((f.t - cur.from) / 0.35);
  const motion = str(p, 'motion', 'pop');
  const breathe = 1 + 0.015 * Math.sin(f.t * 2.2 + cx * 0.01);
  let dx = 0, dy = 0, sc = breathe;
  if (motion === 'drop') dy = -(1 - easeBack(k)) * (cy + h);
  else if (motion === 'slide') dx = (1 - easeOut(k)) * (cx > W / 2 ? W : -W) * 0.6;
  else sc *= Math.max(0.001, easeBack(k));
  if (draw && pic) {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(ang);
    ctx.scale(sc, sc);
    dropShadow(ctx, () => ctx.drawImage(pic, -w / 2, -h / 2, w, h), 28, 14, 0.25);
    ctx.restore();
  }
  // its box goes to the check as an obstacle (type over a prop is a collision), once it has landed
  return k >= 1 ? [{ text: cur, ...quadAt(cx, cy, ang, -w * 0.45, -h * 0.45, w * 0.45, h * 0.45), px: 0 }] : [];
}

/** The song's title and artist, set large: an opening (or a closing) that says what is playing. */
function titleCard(ctx: Ctx, p: ScenePart, f: SceneFrame, draw: boolean): DrawnText[] {
  if (!songMeta.title || !draw) return [];
  const style = str(p, 'style', 'sticker') as InkStyle;
  const cy = H / 2 - num(p, 'y', 0.1) * (H / 2);
  ctx.font = `${inkWeight(style)} 100px "${inkFont(style, '')}"`;
  const size = Math.min(280, (100 * W * 0.8) / Math.max(1, ctx.measureText(songMeta.title).width));
  inkText(ctx, songMeta.title, W / 2, cy, size, style, { align: 'center', color: str(p, 'color', '#FFFFFF') });
  if (songMeta.artist) inkText(ctx, songMeta.artist, W / 2, cy - size * 1.15, Math.max(64, size * 0.42), style === 'sticker' ? 'round' : style, { align: 'center', color: str(p, 'accent', '#FF5FA2') });
  return [];
}

// ---------- echo ----------
/**
 * A word of the line repeated behind everything: each time it is sung one more copy lands — 'stack' piles them up
 * the frame, each larger; 'fill' sets them row after row until the frame is full of the word.
 */
function echo(ctx: Ctx, p: ScenePart, f: SceneFrame, mine: ShownText[], scene: Scene, song: SceneSong) {
  const word = mine[0]?.text;
  if (!word) return;
  // every time the word is sung in the part's lines, up to t
  const times: number[] = [];
  for (const x of mine) {
    const cue = song.cues.find((c) => c.id === x.cueId);
    if (!cue) continue;
    const text = [...cue.text.replace(/︕/g, '！').replace(/︖/g, '？')].join('');
    for (let k = text.indexOf(word); k >= 0; k = text.indexOf(word, k + 1)) {
      const t = resolveTime({ cue: cue.id, char: [...text.slice(0, k)].length }, scene, song)?.t;
      if (t !== undefined && t <= f.t) times.push(t);
    }
  }
  // the copies sung in the scenes before stay (already landed: no pop), and on a drop or the finale the word bursts
  // across the whole frame, staggered, a moment brighter
  const carried = f.carry?.[word] ?? 0;
  for (let k = 0; k < carried; k++) times.push(-Infinity);
  const burst = (f.bursts ?? []).filter((b) => b <= f.t).pop();
  if (burst !== undefined) for (let k = 0; k < 8; k++) if (burst + k * 0.05 <= f.t) times.push(burst + k * 0.05);
  if (!times.length) return;
  const style = str(p, 'style', 'slab') as InkStyle;
  const color = str(p, 'color', '#FFFFFF');
  const base = Math.min(0.5, Math.max(0.1, num(p, 'alpha', 0.28)));
  const alpha = burst === undefined ? base : Math.min(0.7, base * (1 + 0.8 * Math.exp(-(f.t - burst) / 0.5)));
  const fill = str(p, 'mode', 'stack') === 'fill';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${inkWeight(style)} 100px "${inkFont(style, '')}"`;
  const w100 = Math.max(1, ctx.measureText(word).width);
  times.sort((a, b) => a - b);
  // a full frame holds seven rows: past that the word does not stack on itself (rows drawn twice read as smudged
  // type), the rows already there darken instead
  if (fill && times.length > 7) {
    ctx.globalAlpha = Math.min(0.75, alpha * (1 + 0.08 * (times.length - 7)));
    times.splice(0, times.length - 7);
  }
  times.forEach((t, k) => {
    const pop = 1 + 0.2 * (1 - easeOut((f.t - t) / 0.18));
    if (fill) {
      // rows of the word across the frame, alternating direction, each row one sung time
      const size = H / 7;
      const y = size * (k % 7) + size * 0.85;
      const shift = ((f.t * 80 * (k % 2 ? 1 : -1)) % ((w100 * size) / 100 + size * 0.5)) - size;
      for (let x = shift; x < W; x += (w100 * size) / 100 + size * 0.5) inkText(ctx, word, x, y, size * pop, 'print', { color, font: inkFont(style, '') });
    } else {
      if (k >= 6 && k < times.length - 1) return; // a pile of six, the newest on top: more read as a smear
      const size = Math.min(H * 0.9, 140 * (1 + Math.min(k, 6) * 0.45));
      const x = W / 2 - ((w100 * size) / 100) / 2;
      inkText(ctx, word, x, H * 0.95 - k * size * 0.42, size * pop, 'print', { color, font: inkFont(style, '') });
    }
  });
  ctx.restore();
}

// ---------- the check ----------
export interface SceneTextQa {
  cueId: string;
  partId: string;
  text: string;
  at: number;
  /** Worst over the steady samples: share of the text's own ink that shows (another part in front hides the rest). */
  visible: number;
  /** Worst contrast against what is under it, as finished (WCAG ratio of mean luminances). */
  contrast: number;
  /** Worst shape match: the drawn change (frame with it minus frame without) against its ink (blur and glow lower it). */
  shape: number;
  /** Type size at each steady sample (px). */
  px: number[];
  /** The times measured. */
  samples: number[];
  upSec: number;
  needSec: number;
  uncertain: boolean;
  problems: string[];
}

const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};

/** A finished frame as the viewer gets it (after every post pass), with or without one text (the engine renders it). */
export type GrabFrame = (t: number, hide?: ShownText) => Promise<ImageData>;

const quadsOf = (d: DrawnText): [number, number][][] => d.quads ?? [d.quad ?? [[d.rect.x0, d.rect.y0], [d.rect.x1, d.rect.y0], [d.rect.x1, d.rect.y1], [d.rect.x0, d.rect.y1]]];
/** Whether two texts' boxes cross by more than a sliver (convex quads, separating axes, shrunk by 4 % each way). */
export function collide(a: DrawnText, b: DrawnText): boolean {
  return quadsOf(a).some((qa) => quadsOf(b).some((qb) => crossing(qa, qb)));
}
function crossing(qa: [number, number][], qb: [number, number][]): boolean {
  const shrink = (q: [number, number][]) => {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
    return q.map(([x, y]) => [cx + (x - cx) * 0.96, cy + (y - cy) * 0.96] as [number, number]);
  };
  const [p, q] = [shrink(qa), shrink(qb)];
  for (const poly of [p, q])
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
      const nx = y2 - y1, ny = x1 - x2;
      const proj = (r: [number, number][]) => r.map(([x, y]) => x * nx + y * ny);
      const [pa, pb] = [proj(p), proj(q)];
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  return true;
}

/**
 * Measures every text a scene shows on finished frames (the bloom and grade come after the parts are drawn: the
 * canvas alone read 19.8:1 for a band the bloom had washed grey), through its whole time up: settled after it comes
 * in, after every other text of the scene comes or goes while it is up, in the middle; and, for collisions only, as
 * it comes in and as it leaves. The ink drawn alone says where to look; the frames with and without it say what of
 * it shows, against what, and how sharply.
 */
export async function checkScene(scene: Scene, song: SceneSong, sinceAt: (t: number) => number, grab: GrabFrame, cam: (t: number) => number = () => 1, settleAfter = 0): Promise<SceneTextQa[]> {
  const shown = shownTexts(scene, song).filter((x) => x.role !== 'echo');
  // a story prop is a picture, not type: it is an obstacle to the texts (drawScene returns its box), never measured
  // as one (before its picture is drawn it read as "0 px, not drawn")
  const all = shown.filter((x) => x.role !== 'object');
  const changes = [...new Set(shown.flatMap((x) => [x.from, x.to]).filter((t) => Number.isFinite(t)))];
  const out: SceneTextQa[] = [];
  for (const x of all) {
    // read once it has come in, and once the transition into the scene is over
    const settle = Math.max(x.from + 0.25, settleAfter);
    const steady = [...new Set([settle, (x.from + x.to) / 2, ...changes.filter((c) => c > settle && c < x.to - 0.1).flatMap((c) => [c - 0.02, c + 0.25])])]
      .filter((t) => t >= settle - 1e-6 && t < x.to - 0.02)
      .sort((a, b) => a - b);
    const edges = [x.from + 0.06, x.to - 0.03].filter((t) => t > x.from && t < x.to);
    const need = x.role === 'lead' ? leadNeed(x.cueId, x.text, song) : callSecOf(x.text);
    const qa: SceneTextQa = { cueId: x.cueId, partId: x.partId, text: x.text, at: x.at, visible: 1, contrast: Infinity, shape: 1, px: [], samples: [], upSec: x.to - x.from, needSec: need, uncertain: x.uncertain, problems: [] };
    out.push(qa);
    const add = (p: string) => !qa.problems.includes(p) && qa.problems.push(p);
    if (!steady.length && x.to - x.from > 0.1) add(`整句都在轉場裡（${x.from.toFixed(2)}–${x.to.toFixed(2)} 秒），讀不到`);
    if (qa.upSec < need - 0.05) add(`停留 ${qa.upSec.toFixed(1)} 秒，至少 ${need.toFixed(1)} 秒`);
    for (const t of [...steady, ...edges].sort((a, b) => a - b)) {
      const f = { t, since: sinceAt(t), zoom: cam(t) };
      const [, probe] = off();
      const drawnAll = drawScene(probe, scene, song, f);
      const drawn = drawnAll.find((d) => same(d.text, x));
      qa.samples.push(+t.toFixed(2));
      if (!drawn) {
        if (steady.includes(t)) add(`${t.toFixed(2)} 秒沒有畫出來`);
        continue;
      }
      // two texts on each other is a collision whatever share of the ink still shows (red call dots across a lead
      // line left 90 % of it visible and unreadable); checked while it comes in and leaves as well
      // within one part the part lays its texts out (a band's stacked rows, a wall's row of calls)
      for (const o of drawnAll) if (o.text.partId !== x.partId && collide(drawn, o)) add(`${t.toFixed(2)} 秒和${o.text.partId}的「${o.text.text}」疊在一起`);
      if (!steady.includes(t)) continue;
      qa.px.push(Math.round(drawn.px));
      const r = drawn.rect;
      const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0)), x1 = Math.min(W, Math.ceil(r.x1)), y1 = Math.min(H, Math.ceil(r.y1));
      if (x1 <= x0 || y1 <= y0) {
        add('畫在畫面外');
        continue;
      }
      const [, cc] = off();
      drawScene(cc, scene, song, { ...f, only: x });
      const pa = (await grab(t)).data, pb = (await grab(t, x)).data, pc = cc.getImageData(0, 0, W, H).data;
      let ink = 0, seen = 0, standsOut = 0, either = 0, sharp = 0, lands = 0, la = 0, lb = 0;
      const own: number[] = [];
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * W + xx) * 4;
          const isInk = pc[i + 3] >= 128;
          const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
          const strong = d > 160;
          // only ink that differs from what is under it can show (ink the colour of its ground is a contrast matter):
          // what shows, and how sharply, is measured on that ink
          const stand = isInk && Math.abs(pc[i] - pb[i]) + Math.abs(pc[i + 1] - pb[i + 1]) + Math.abs(pc[i + 2] - pb[i + 2]) > 60;
          if (stand || strong) either++;
          if (stand && strong) sharp++;
          if (!isInk) continue;
          ink++;
          own.push(lum(pa[i], pa[i + 1], pa[i + 2]));
          if (stand) {
            standsOut++;
            if (d > 60) seen++;
          }
          if (!strong) continue;
          // contrast where the text actually lands (an LED's ink box holds the dark gaps between its dots)
          lands++;
          la += lum(pa[i], pa[i + 1], pa[i + 2]);
          lb += lum(pb[i], pb[i + 1], pb[i + 2]);
        }
      const visible = standsOut ? seen / standsOut : 0;
      const shape = either ? sharp / either : 0;
      const [hi, lo] = [Math.max(la, lb) / Math.max(1, lands), Math.min(la, lb) / Math.max(1, lands)];
      // a sticker or a fan's cut letters carry their own contrast: the fill against the dark keyline around it
      own.sort((p1, p2) => p1 - p2);
      const q = (k: number) => own[Math.min(own.length - 1, Math.floor(k * own.length))] ?? 0;
      const inner = own.length ? (q(0.85) + 0.05) / (q(0.15) + 0.05) : 1;
      const outlined = OUTLINED(scene.parts.find((pp) => pp.id === x.partId));
      const contrast = outlined ? inner : Math.max((hi + 0.05) / (lo + 0.05), inner);
      qa.visible = Math.min(qa.visible, visible);
      qa.shape = Math.min(qa.shape, shape);
      qa.contrast = Math.min(qa.contrast, contrast);
      const min = x.role === 'call' ? MIN_CALL_PX : MIN_LEAD_PX;
      if (drawn.px < min) add(`字太小（${Math.round(drawn.px)}px，至少 ${min}px）`);
      if (visible < 0.85) add(`${t.toFixed(2)} 秒被擋住（只看得到 ${Math.round(visible * 100)}%）`);
      if (shape < 0.5) add(`${t.toFixed(2)} 秒字形不清楚（輪廓吻合 ${Math.round(shape * 100)}%）`);
      if (contrast < 3) add(`${t.toFixed(2)} 秒對比不足（${contrast.toFixed(1)}:1，至少 3:1）`);
    }
    // a text keeps its size while it is up: a wall shrinking every call to fit the next reads as jitter
    if (qa.px.length > 1 && Math.max(...qa.px) / Math.min(...qa.px) > 1.1) add(`顯示期間字級變了（${Math.max(...qa.px)}→${Math.min(...qa.px)}px）`);
  }
  return out;
}

/** For a scene, how many times each echoed word was sung in the storyboard's scenes before it. */
export function echoCarry(scenes: Scene[], scene: Scene, song: SceneSong): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sc of scenes.slice(0, scenes.indexOf(scene)))
    for (const p of sc.parts.filter((x) => x.kind === 'echo')) {
      const word = String(p.params?.['word'] ?? '').replace(/︕/g, '！').replace(/︖/g, '？');
      if (!word) continue;
      for (const l of p.lines ?? []) {
        const text = (song.cues.find((c) => c.id === l.cueId)?.text ?? '').replace(/︕/g, '！').replace(/︖/g, '？');
        out[word] = (out[word] ?? 0) + Math.max(0, text.split(word).length - 1);
      }
    }
  return out;
}
