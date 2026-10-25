// Story components: pre-built behaviours that carry one thread through a song (a hero prop that appears, cracks,
// shatters, gathers and returns at the end; a prop flying in on a curve; cards piling up on the beat; a thread that
// grows, ties and is cut; a prop popping in on a word). The director only places them in time (look.story); every
// frame they become ordinary layers (sprite / thread / card) that make room for the lyrics like any other.
// Mined from 30 story-arc analyses (out_story/candidates.md): A bookend, B+C hero state arc, D cards, E fly, F thread,
// I pop.
import type { Rgb } from './graphics';

const W = 1920;
const H = 1080;

/** A point in the look's coordinates: x, y in -1..1, 0 the centre, y up. */
type Pt = [number, number];

export type HeroState = 'show' | 'hide' | 'crack' | 'shatter' | 'gather' | 'glow';
/**
 * How a prop moves while it is up, after its own nature (a still prop read as a sticker; random jumps and flashes
 * read as noise): hang swings from its top like a pendulum, flutter beats its wings now and then and drifts, roll
 * comes in rolling and comes to rest, sit settles and only breathes, drift floats slowly, still does not move at all
 * (a sign, a building: the director's call).
 */
export type Motion = 'hang' | 'flutter' | 'roll' | 'sit' | 'drift' | 'still';

export type StoryItem =
  /** One prop that carries the song: its states in time (a bookend is a show at the start and again at the end). */
  | { kind: 'hero'; prop: string; aspect?: number; lift?: Rgb; motion?: Motion; x: number; y: number; size: number; states: { at: number; state: HeroState }[]; glow?: Rgb }
  /** A prop flies in along a curve from one side; it lands at (x, y) and stays until `until`, or flies through. */
  | { kind: 'fly'; prop: string; aspect?: number; lift?: Rgb; motion?: Motion; at: number; dur: number; from: 'left' | 'right' | 'top' | 'bottom'; x: number; y: number; size: number; trail?: Rgb; until?: number; through?: boolean }
  /** Cards (chat bubbles, notes, polaroids) land one by one every `every` seconds and clear together at `to`. */
  | { kind: 'cards'; from: number; to: number; every: number; style: 'bubble' | 'note' | 'polaroid'; texts: string[]; props?: string[]; x: number; y: number; color: Rgb; ink: Rgb }
  /** A thread grows from a to b (bend: sideways bow, -1..1), may tie a loop in its middle, and may be cut. */
  | { kind: 'thread'; from: number; to: number; a: Pt; b: Pt; bend?: number; loop?: boolean; cut?: number; color: Rgb; width?: number }
  /** A prop pops in on a word and leaves after `dur`. */
  | { kind: 'pop'; prop: string; aspect?: number; lift?: Rgb; motion?: Motion; at: number; dur: number; x: number; y: number; size: number }
  /** A prop circles (x, y) on a tilted ellipse of radius r from `from` to `to`, nearer (bigger) at the bottom. */
  | { kind: 'orbit'; prop: string; aspect?: number; lift?: Rgb; from: number; to: number; x: number; y: number; r: number; size: number; period?: number; tilt?: number }
  /** A prop travels through waypoints from `from` to `to`, leaving a dotted trail, and rests at the last one. */
  | { kind: 'journey'; prop: string; aspect?: number; lift?: Rgb; motion?: Motion; from: number; to: number; pts: Pt[]; size: number; trail?: Rgb; until?: number }
  /** One shape turning into the next on keywords (a cube → a star → a heart): each step's prop from its time on. */
  | { kind: 'morph'; steps: { at: number; prop: string }[]; aspects?: Record<string, number>; until: number; x: number; y: number; size: number }
  /** A chapter card: a short label ("第一章 夏") slides in at a section start and leaves after `dur`. */
  | { kind: 'chapter'; at: number; dur: number; text: string; x: number; y: number; color: Rgb; ink: Rgb }
  /** Weightless props drifting and slowly turning across the frame from `from` to `to`. */
  | { kind: 'float'; props: string[]; aspects?: Record<string, number>; from: number; to: number; size: number };

/** The per-frame layers story items become (drawn by drawStory). Sizes are fractions of the frame height. */
/** `ref` names the story item a layer comes from, unique per item (`pop#7:horse`; QA reports only, drawing ignores it). */
/** `key`: content that matters now (a hero at a turn of its story, a card about the line being sung): it is placed
 * before the rest when the frame is crowded and does not leave for want of room (graphics.ts avoidAll). */
export type StoryLayer = { ref?: string; key?: boolean } & (
  | { kind: 'sprite'; asset: string; aspect?: number; lift?: Rgb; pass?: boolean; x: number; y: number; size: number; rot?: number; sx?: number; pivot?: 'top'; opacity?: number; crack?: number; shatter?: number; seed?: number; glow?: Rgb; trail?: { color: Rgb; pts: Pt[] } }
  | { kind: 'thread'; pts: Pt[]; color: Rgb; width: number; opacity?: number }
  | { kind: 'card'; style: 'bubble' | 'note' | 'polaroid' | 'chapter'; text: string; asset?: string; x: number; y: number; w: number; h: number; rot: number; scale: number; color: Rgb; ink: Rgb; opacity?: number }
);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOutBack = (k: number) => 1 + 2.70158 * (clamp01(k) - 1) ** 3 + 1.70158 * (clamp01(k) - 1) ** 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Index of the last element passing `f` (findLastIndex is past this project's ES target). */
const lastIndex = <T>(xs: T[], f: (x: T, i: number) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i], i)) return i;
  return -1;
};
const bez = (p0: Pt, c: Pt, p1: Pt, k: number): Pt => [lerp(lerp(p0[0], c[0], k), lerp(c[0], p1[0], k), k), lerp(lerp(p0[1], c[1], k), lerp(c[1], p1[1], k), k)];
/**
 * A prop's movement at rest: offsets in look units, rotation in radians, horizontal scale (wing beats). Smooth and
 * periodic, every prop on its own phase (n).
 */
function idle(motion: Motion, t: number, n: number): { dx: number; dy: number; rot: number; sx: number } {
  const p = n * 1.7;
  switch (motion) {
    case 'hang':
      // a pendulum stirred by a breeze: a slow swing with a slower gust over it
      return { dx: 0, dy: 0, rot: 0.09 * Math.sin(t * 1.9 + p) + 0.05 * Math.sin(t * 0.55 + p), sx: 1 };
    case 'flutter': {
      // rests with wings open, and every few seconds beats them a few times while it shifts a little
      const burst = Math.max(0, Math.sin(t * 0.9 + p) - 0.55) / 0.45;
      return { dx: 0.01 * Math.sin(t * 0.7 + p), dy: 0.012 * Math.sin(t * 1.1 + p) + burst * 0.02, rot: 0.04 * Math.sin(t * 0.8 + p), sx: 1 - burst * 0.55 * Math.abs(Math.sin(t * 16)) };
    }
    case 'drift':
      return { dx: 0.015 * Math.sin(t * 0.4 + p), dy: 0.02 * Math.sin(t * 0.6 + p), rot: 0.03 * Math.sin(t * 0.5 + p), sx: 1 };
    case 'still':
      return { dx: 0, dy: 0, rot: 0, sx: 1 };
    default:
      // sit / roll at rest: only a breath
      return { dx: 0, dy: 0.004 * Math.sin(t * 1.2 + p), rot: 0, sx: 1 };
  }
}

/**
 * How a prop arrives over `k` 0..1 (and how it leaves when k runs backwards): sit drops in under gravity and settles
 * with a damped wobble, roll comes in from the side turning, the others ease in from just above. dy/dx in look units.
 */
function arrive(motion: Motion, k: number, fromRight: boolean): { dx: number; dy: number; rot: number; opacity: number } {
  const u = clamp01(k);
  if (motion === 'roll') {
    const d = (1 - easeOut(u)) * (fromRight ? 0.7 : -0.7);
    return { dx: d, dy: 0, rot: -d * 6, opacity: Math.min(1, u * 4) };
  }
  if (motion === 'sit') {
    // a fall (ease-in) for the first 60 %, then a small damped rock as it settles
    const fall = u < 0.6 ? 0.35 * (1 - (u / 0.6) ** 2) : 0;
    const rock = u < 0.6 ? 0 : 0.08 * Math.exp(-(u - 0.6) * 9) * Math.sin((u - 0.6) * 30);
    return { dx: 0, dy: fall, rot: rock, opacity: Math.min(1, u * 5) };
  }
  return { dx: 0, dy: 0.06 * (1 - easeOut(u)), rot: 0, opacity: easeOut(u) };
}

/** Seconds a state change takes to play. */
const TURN: Record<HeroState, number> = { show: 0.5, hide: 0.5, crack: 0.8, shatter: 1.2, gather: 1.2, glow: 0.6 };

/**
 * The hero's key moments (density proposal §3.2): from 1 s before each turn of its story (its entrance, a crack, a
 * shatter, a gather, a glow; not a hide) to 1.5 s after the turn has played.
 */
export const heroKey = (states: { at: number; state: HeroState }[], t: number) => states.some((s) => s.state !== 'hide' && t >= s.at - 1 && t <= s.at + TURN[s.state] + 1.5);

/** The hero at t: whether it is up, how cracked, how far into a shatter (1 = pieces gone), glowing. */
export function heroAt(states: { at: number; state: HeroState }[], t: number): { visible: number; crack: number; shatter: number; glow: number } | undefined {
  const s = [...states].sort((a, b) => a.at - b.at);
  const i = lastIndex(s, (x) => x.at <= t);
  if (i < 0) return undefined;
  const cur = s[i];
  const k = clamp01((t - cur.at) / TURN[cur.state]);
  // cracks stay from the crack until the hero is whole again (a gather or a fresh show after a hide)
  const lastWhole = lastIndex(s, (x, j) => j <= i && (x.state === 'gather' || (x.state === 'show' && s[j - 1]?.state === 'hide')));
  const lastCrack = lastIndex(s, (x, j) => j <= i && x.state === 'crack');
  const crack = lastCrack > lastWhole ? (lastCrack === i ? k : 1) : 0;
  switch (cur.state) {
    case 'show':
    case 'crack':
      return { visible: s[i - 1]?.state === 'hide' || i === 0 ? easeOut(k) : 1, crack, shatter: 0, glow: 0 };
    case 'glow':
      return { visible: 1, crack, shatter: 0, glow: easeOut(k) };
    case 'hide':
      return k >= 1 ? undefined : { visible: 1 - easeOut(k), crack, shatter: 0, glow: 0 };
    case 'shatter':
      return k >= 1 ? undefined : { visible: 1, crack, shatter: easeOut(k), glow: 0 };
    case 'gather':
      return { visible: 1, crack: 0, shatter: 1 - easeOut(k), glow: 0 };
  }
}

/** The point a fraction u (0..1) of the way along a polyline, by length. */
export function along(pts: Pt[], u: number): Pt {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = clamp01(u) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    d -= seg[i];
  }
  return pts[0];
}

/** Where a fly starts: just off the frame on its side, level with (or above) where it lands. */
const entry = (from: 'left' | 'right' | 'top' | 'bottom', x: number, y: number): Pt =>
  from === 'left' ? [-1.35, y + 0.3] : from === 'right' ? [1.35, y + 0.3] : from === 'top' ? [x - 0.4, 1.4] : [x - 0.4, -1.4];

/** The layers of every story item at t. Pure: the same t gives the same frame. */
/**
 * The times the story's set of objects changes: a card lands or the pile clears, the hero turns, a prop comes or goes.
 * Making room decides once per stretch between such times (and line changes), so nothing hops about in between.
 */
export function storyEvents(items: StoryItem[]): number[] {
  return items.flatMap((it) => {
    switch (it.kind) {
      case 'hero':
        return it.states.map((s) => s.at);
      case 'cards': {
        const count = it.style === 'polaroid' ? (it.props?.length ?? 0) : it.texts.length;
        return [...Array.from({ length: count }, (_, k) => it.from + k * it.every).filter((x) => x <= it.to), it.to];
      }
      case 'fly':
      case 'pop':
      case 'chapter':
        return [it.at, it.at + it.dur];
      case 'morph':
        return [...it.steps.map((s) => s.at), it.until];
      default:
        return [it.from, it.to];
    }
  });
}

export function storyLayers(items: StoryItem[], t: number): StoryLayer[] {
  const out: StoryLayer[] = [];
  items.forEach((it, n) => {
    switch (it.kind) {
      case 'hero': {
        const h = heroAt(it.states, t);
        if (!h) return;
        const m = idle(it.motion ?? 'drift', t, n);
        out.push({ ref: `hero#${n}:${it.prop}`, kind: 'sprite', asset: `spr:${it.prop}`, aspect: it.aspect, lift: it.lift, x: it.x + m.dx, y: it.y + m.dy + 0.05 * (1 - h.visible), size: it.size, opacity: h.visible, crack: h.crack, shatter: h.shatter, seed: n * 17 + 3, glow: h.glow ? it.glow ?? '#FFF4C8' : undefined, rot: m.rot, sx: m.sx, pivot: it.motion === 'hang' ? 'top' : undefined, key: heroKey(it.states, t) || undefined });
        return;
      }
      case 'fly': {
        const end = it.through ? (it.until ?? it.at + it.dur * 2) : (it.until ?? Infinity);
        if (t < it.at || t > end + 0.5) return;
        const p0 = entry(it.from, it.x, it.y);
        const p1: Pt = [it.x, it.y];
        const c: Pt = [lerp(p0[0], p1[0], 0.5), Math.max(p0[1], p1[1]) + 0.35];
        // through: the curve carries on past the landing point and off the far side
        const p2: Pt = [it.x + (it.x - p0[0]) * 0.9, it.y + 0.25];
        const k = (t - it.at) / it.dur;
        const path = (u: number): Pt => (u <= 1 ? bez(p0, c, p1, u) : bez(p1, [lerp(p1[0], p2[0], 0.5), p1[1] - 0.15], p2, u - 1));
        const u = it.through ? Math.min(2, k) : easeOut(k);
        const here = path(u);
        const ahead = path(Math.min(2, u + 0.02));
        // the trail: the last stretch of the path, dotted behind the prop
        const trail = it.trail && k < (it.through ? 2 : 1.6) ? { color: it.trail, pts: Array.from({ length: 24 }, (_, i) => path(Math.max(0, u - 0.6 + (0.6 * i) / 23))) } : undefined;
        const leave = it.until !== undefined && !it.through ? 1 - clamp01((t - it.until) / 0.5) : 1;
        const flying = k < 1 || it.through;
        const motion = it.motion ?? 'flutter';
        // in flight: banked along the path, wings beating fast; landed: the prop's own rest movement
        const m = flying ? { dx: 0, dy: 0, rot: Math.atan2(-(ahead[1] - here[1]), ahead[0] - here[0]) * 0.25, sx: motion === 'flutter' ? 0.55 + 0.45 * Math.abs(Math.cos(t * 18)) : 1 } : idle(motion, t, n);
        out.push({ ref: `fly#${n}:${it.prop}`, kind: 'sprite', pass: flying, asset: `spr:${it.prop}`, aspect: it.aspect, lift: it.lift, x: here[0] + m.dx, y: here[1] + m.dy, size: it.size, rot: m.rot, sx: m.sx, opacity: leave, trail });
        return;
      }
      case 'pop': {
        if (t < it.at || t > it.at + it.dur + 0.4) return;
        const motion = it.motion ?? 'sit';
        const a = arrive(motion, (t - it.at) / (motion === 'roll' ? 1.2 : 0.7), it.x > 0);
        const m = idle(motion, t, n);
        // leaving: it sinks a little as it fades, never blinks out
        const outK = clamp01((t - it.at - it.dur) / 0.4);
        out.push({ ref: `pop#${n}:${it.prop}`, kind: 'sprite', asset: `spr:${it.prop}`, aspect: it.aspect, lift: it.lift, x: it.x + a.dx + m.dx, y: it.y + a.dy + m.dy - outK * 0.04, size: it.size, opacity: a.opacity * (1 - outK), rot: a.rot + m.rot, sx: m.sx, pivot: motion === 'hang' ? 'top' : undefined });
        return;
      }
      case 'orbit': {
        if (t < it.from || t > it.to + 0.6) return;
        const a = ((t - it.from) / (it.period ?? 6)) * Math.PI * 2;
        const near = Math.sin(a); // 1 at the bottom of the ellipse: nearest the viewer
        const fade = Math.min(1, (t - it.from) / 0.6) * (1 - clamp01((t - it.to) / 0.6));
        // it passes behind the lyrics (dimmed while it crosses them) instead of jumping out of their way every lap
        out.push({ ref: `orbit#${n}:${it.prop}`, kind: 'sprite', asset: `spr:${it.prop}`, aspect: it.aspect, lift: it.lift, pass: true, x: it.x + it.r * Math.cos(a), y: it.y - it.r * (it.tilt ?? 0.35) * near, size: it.size * (0.85 + 0.15 * near), rot: 0.08 * Math.cos(a), opacity: fade });
        return;
      }
      case 'journey': {
        const end = it.until ?? it.to + 3;
        if (t < it.from || t > end + 0.5 || it.pts.length < 2) return;
        const u = easeInOut(clamp01((t - it.from) / Math.max(0.5, it.to - it.from)));
        const here = along(it.pts, u);
        const ahead = along(it.pts, Math.min(1, u + 0.01));
        const moving = t < it.to;
        const m = moving ? { dx: 0, dy: 0.01 * Math.sin(t * 6), rot: Math.atan2(ahead[1] - here[1], Math.abs(ahead[0] - here[0]) + 1e-6) * 0.2, sx: 1 } : idle(it.motion ?? 'sit', t, n);
        const trail = it.trail && t < it.to + 1.5 ? { color: it.trail, pts: Array.from({ length: 28 }, (_, i) => along(it.pts, Math.max(0, u - 0.35 + (0.35 * i) / 27))) } : undefined;
        const opacity = Math.min(1, (t - it.from) / 0.4) * (1 - clamp01((t - end) / 0.5));
        out.push({ ref: `journey#${n}:${it.prop}`, kind: 'sprite', asset: `spr:${it.prop}`, aspect: it.aspect, lift: it.lift, pass: moving, x: here[0] + m.dx, y: here[1] + m.dy, size: it.size, rot: m.rot, sx: m.sx, opacity, trail });
        return;
      }
      case 'morph': {
        const steps = [...it.steps].sort((a, b) => a.at - b.at);
        const i = lastIndex(steps, (s) => s.at <= t);
        if (i < 0 || t > it.until + 0.5) return;
        const leave = 1 - clamp01((t - it.until) / 0.5);
        const m = idle('drift', t, n);
        const k = clamp01((t - steps[i].at) / 0.7);
        const base = { kind: 'sprite' as const, x: it.x + m.dx, y: it.y + m.dy, rot: m.rot };
        // the old shape folds edge-on as the new one opens out of it with a small overshoot
        if (i > 0 && k < 1) {
          const prev = steps[i - 1].prop;
          out.push({ ...base, ref: `morph#${n}:${prev}`, asset: `spr:${prev}`, aspect: it.aspects?.[prev], size: it.size, sx: Math.max(0.02, 1 - easeOut(k * 2)), opacity: leave * (1 - clamp01(k * 2 - 0.5)) });
        }
        const cur = steps[i].prop;
        const grow = i === 0 ? easeOut(k) : easeOutBack(clamp01(k * 1.4 - 0.3));
        out.push({ ...base, ref: `morph#${n}:${cur}`, asset: `spr:${cur}`, aspect: it.aspects?.[cur], size: it.size * Math.max(0.02, grow), opacity: leave * Math.min(1, k * 3) });
        return;
      }
      case 'chapter': {
        if (t < it.at || t > it.at + it.dur + 0.5) return;
        const inK = easeOut((t - it.at) / 0.6);
        const outK = clamp01((t - it.at - it.dur) / 0.5);
        out.push({ ref: `chapter#${n}:${it.text}`, kind: 'card', style: 'chapter', text: it.text, x: it.x - (1 - inK) * 0.25, y: it.y + outK * 0.06, w: 0.3, h: 0.1, rot: 0, scale: 1, color: it.color, ink: it.ink, opacity: Math.min(1, inK * 1.5) * (1 - outK) });
        return;
      }
      case 'float': {
        if (t < it.from || t > it.to + 1) return;
        const fade = Math.min(1, (t - it.from) / 1) * (1 - clamp01(t - it.to));
        it.props.forEach((p, j) => {
          // each on its own slow Lissajous path inside the frame, turning a little, never in step with the others
          const s = t - it.from;
          const x = 0.72 * Math.sin(s * 0.11 * (1 + j * 0.27) + j * 2.1);
          const y = 0.55 * Math.cos(s * 0.08 * (1 + j * 0.19) + j * 1.3);
          out.push({ ref: `float#${n}[${j}]:${p}`, kind: 'sprite', asset: `spr:${p}`, aspect: it.aspects?.[p], pass: true, x, y, size: it.size * (0.8 + 0.4 * ((j * 0.618) % 1)), rot: (j % 2 ? 1 : -1) * 0.12 * s + j, opacity: fade });
        });
        return;
      }
      case 'cards': {
        if (t < it.from || t > it.to + 0.4) return;
        const clear = 1 - clamp01((t - it.to) / 0.4);
        const count = it.style === 'polaroid' ? (it.props?.length ?? 0) : it.texts.length;
        for (let k = 0; k < count; k++) {
          const at = it.from + k * it.every;
          if (t < at) break;
          // paper: it drifts down swaying side to side and settles at its own small tilt
          const u = clamp01((t - at) / 0.9);
          const land = 1;
          const sway = (1 - u) * Math.sin(u * 9);
          const rot = Math.sin(k * 2.3 + n) * 0.08 + sway * 0.25;
          const fallY = (1 - easeOut(u)) * 0.22;
          const fallX = sway * 0.03;
          const [w, h] = it.style === 'polaroid' ? [0.2, 0.26] : it.style === 'note' ? [0.24, 0.16] : [0.26, 0.1];
          // the pile steps down-right but every card stays wholly inside the frame
          const cx = Math.min(1 - w * 1.05, Math.max(-1 + w * 1.05, it.x + k * 0.07));
          const cy = Math.min(1 - h * 1.1, Math.max(-1 + h * 1.1, it.y - k * 0.09));
          out.push({ ref: `cards#${n}[${k}]:${it.texts[k] ?? it.props?.[k] ?? ''}`, kind: 'card', style: it.style, text: it.texts[k] ?? '', asset: it.props?.[k] ? `spr:${it.props[k]}` : undefined, x: cx + fallX, y: cy + fallY, w, h, rot, scale: land * (0.9 + 0.1 * clear), color: it.color, ink: it.ink, opacity: clear * Math.min(1, u * 3) });
        }
        return;
      }
      case 'thread': {
        if (t < it.from) return;
        const grow = easeOut((t - it.from) / Math.max(0.4, Math.min(2.5, it.to - it.from)));
        const bend = it.bend ?? 0.3;
        const mid: Pt = [(it.a[0] + it.b[0]) / 2 - (it.b[1] - it.a[1]) * bend, (it.a[1] + it.b[1]) / 2 + (it.b[0] - it.a[0]) * bend];
        const N = 80;
        const pts: Pt[] = [];
        for (let i = 0; i <= N * grow; i++) {
          const u = i / N;
          let p = bez(it.a, mid, it.b, u);
          // a knot: one small loop round the middle
          if (it.loop && u > 0.42 && u < 0.58) {
            const a = ((u - 0.42) / 0.16) * Math.PI * 2;
            p = [p[0] + Math.sin(a) * 0.06, p[1] + (1 - Math.cos(a)) * 0.08];
          }
          pts.push(p);
        }
        if (it.cut === undefined || t < it.cut) {
          out.push({ kind: 'thread', pts, color: it.color, width: it.width ?? 5 });
          return;
        }
        // cut: the two halves drop away from the middle and fade
        const k = clamp01((t - it.cut) / 0.9);
        if (k >= 1) return;
        const half = Math.floor(pts.length / 2);
        for (const part of [pts.slice(0, half), pts.slice(half)]) {
          out.push({ kind: 'thread', pts: part.map(([x, y], i) => [x, y - easeOut(k) * 0.3 * (part === pts.slice(0, half) ? i / half : 1 - i / Math.max(1, part.length))]), color: it.color, width: it.width ?? 5, opacity: 1 - k });
        }
        return;
      }
    }
  });
  return out;
}

/** The on-screen box of a story layer in pixels (for making room for the lyrics), if it has one. */
export function storyRect(l: StoryLayer): { x0: number; y0: number; x1: number; y1: number } | undefined {
  if (l.kind === 'thread') return undefined;
  const px = W / 2 + l.x * (W / 2);
  const py = H / 2 - l.y * (H / 2);
  // a sprite's box uses its picture's aspect (width / height, from the library); without it, a square
  const [w, h] = l.kind === 'card' ? [l.w * W * l.scale, l.h * H * l.scale] : [l.size * H * (l.aspect ?? 1), l.size * H];
  return { x0: px - w / 2, y0: py - h / 2, x1: px + w / 2, y1: py + h / 2 };
}

/** Draws one story layer. `image` returns a loaded sprite or scene by asset id. */
export function drawStory(ctx: CanvasRenderingContext2D, l: StoryLayer, image: (asset?: string) => CanvasImageSource | undefined) {
  if (l.kind === 'thread') {
    if (l.pts.length < 2) return;
    ctx.globalAlpha *= l.opacity ?? 1;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(W / 2 + x * (W / 2), H / 2 - y * (H / 2)) : ctx.moveTo(W / 2 + x * (W / 2), H / 2 - y * (H / 2))));
    ctx.stroke();
    return;
  }
  const px = W / 2 + l.x * (W / 2);
  const py = H / 2 - l.y * (H / 2);
  if (l.kind === 'card') return card(ctx, l, px, py, image);
  const img = image(l.asset) as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return;
  const h = l.size * H;
  const w = (h * img.width) / img.height;
  if (l.trail) {
    // a dotted trail behind a flying prop, thinning toward its tail
    ctx.save();
    ctx.fillStyle = l.trail.color;
    l.trail.pts.forEach(([x, y], i) => {
      ctx.globalAlpha = (i / l.trail!.pts.length) * 0.8;
      ctx.beginPath();
      ctx.arc(W / 2 + x * (W / 2), H / 2 - y * (H / 2), 3 + (i / l.trail!.pts.length) * 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  ctx.globalAlpha *= l.opacity ?? 1;
  // a hanging prop turns about its top edge (where its string is), anything else about its centre
  if (l.pivot === 'top') {
    ctx.translate(px, py - h / 2);
    ctx.rotate(l.rot ?? 0);
    ctx.translate(0, h / 2);
  } else {
    ctx.translate(px, py);
    ctx.rotate(l.rot ?? 0);
  }
  if (l.sx !== undefined && l.sx !== 1) ctx.scale(l.sx, 1);
  if (l.shatter && l.shatter > 0) return shards(ctx, img, w, h, l.shatter, l.seed ?? 0);
  if (l.glow) {
    // a warm halo built up in two passes (one soft pass was barely visible on a light ground)
    ctx.shadowColor = l.glow;
    ctx.shadowBlur = h * 0.3;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.shadowBlur = h * 0.12;
  }
  if (l.lift && !l.glow) {
    // a prop the tone of its ground (落ちた風鈴: pale glass on cream paper) gets a soft contrasting halo to stand on
    ctx.shadowColor = l.lift;
    ctx.shadowBlur = h * 0.1;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.shadowBlur = h * 0.04;
  }
  if (!l.crack) {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return;
  }
  // cracks drawn only over the prop's own pixels (source-atop on a copy), growing from one point
  const c = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
  const cc = c.getContext('2d')!;
  cc.drawImage(img, 0, 0, w, h);
  cc.globalCompositeOperation = 'source-atop';
  cc.strokeStyle = 'rgba(20,16,20,0.85)';
  cc.lineWidth = Math.max(2, h * 0.008);
  const seed = l.seed ?? 0;
  for (let b = 0; b < 5; b++) {
    let [x, y] = [w * 0.48, h * 0.42];
    let a = (b / 5) * Math.PI * 2 + seed;
    cc.beginPath();
    cc.moveTo(x, y);
    const steps = Math.ceil(7 * l.crack);
    for (let s = 0; s < steps; s++) {
      a += Math.sin(seed + b * 3.1 + s * 1.7) * 0.6;
      x += Math.cos(a) * h * 0.07;
      y += Math.sin(a) * h * 0.07;
      cc.lineTo(x, y);
    }
    cc.stroke();
  }
  ctx.drawImage(c, -w / 2, -h / 2);
}

/** The prop broken into triangles that fly out from its centre (k: 0 whole … 1 gone), spinning and fading. */
function shards(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, k: number, seed: number) {
  const n = 4;
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++)
      for (const tri of [0, 1]) {
        const x0 = (gx / n - 0.5) * w;
        const y0 = (gy / n - 0.5) * h;
        const cw = w / n;
        const ch = h / n;
        const pts = tri ? [[x0, y0], [x0 + cw, y0], [x0, y0 + ch]] : [[x0 + cw, y0], [x0 + cw, y0 + ch], [x0, y0 + ch]];
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const r = Math.sin((gx * 7 + gy * 13 + tri * 5 + seed) * 12.9898) * 0.5 + 0.5;
        const d = Math.hypot(cx, cy) || 1;
        const dist = k * (h * 0.9 + r * h * 0.8);
        ctx.save();
        ctx.globalAlpha *= 1 - k * k;
        ctx.translate(cx + (cx / d) * dist, cy + (cy / d) * dist + k * k * h * 0.5);
        ctx.rotate(k * (r - 0.5) * 6);
        ctx.translate(-cx, -cy);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
}

function card(ctx: CanvasRenderingContext2D, l: Extract<StoryLayer, { kind: 'card' }>, px: number, py: number, image: (asset?: string) => CanvasImageSource | undefined) {
  if (l.scale <= 0) return;
  const w = l.w * W;
  const h = l.h * H;
  ctx.globalAlpha *= l.opacity ?? 1;
  ctx.translate(px, py);
  ctx.rotate(l.rot);
  ctx.scale(l.scale, l.scale);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = l.style === 'polaroid' ? '#FBF8F1' : l.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, l.style === 'bubble' ? h * 0.45 : l.style === 'chapter' ? 2 : 6);
  if (l.style === 'bubble') {
    // the speech tail at the lower left
    ctx.moveTo(-w * 0.32, h / 2 - 2);
    ctx.lineTo(-w * 0.4, h / 2 + h * 0.35);
    ctx.lineTo(-w * 0.2, h / 2 - 2);
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (l.style === 'polaroid') {
    const img = image(l.asset) as (CanvasImageSource & { width: number; height: number }) | undefined;
    const iw = w * 0.86;
    const ih = h * 0.68;
    ctx.fillStyle = l.color;
    ctx.fillRect(-iw / 2, -h / 2 + w * 0.07, iw, ih);
    if (img?.width) {
      const s = Math.min(iw / img.width, ih / img.height) * 0.9;
      ctx.drawImage(img, -img.width * s / 2, -h / 2 + w * 0.07 + ih / 2 - img.height * s / 2, img.width * s, img.height * s);
    }
  }
  if (l.style === 'note') {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (let y = -h / 2 + h * 0.3; y < h / 2; y += h * 0.22) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 14, y);
      ctx.lineTo(w / 2 - 14, y);
      ctx.stroke();
    }
  }
  if (l.style === 'chapter') {
    // a bar of the ink down the left edge: a section label, not a sticky note
    ctx.fillStyle = l.ink;
    ctx.fillRect(-w / 2, -h / 2, h * 0.12, h);
  }
  if (!l.text) return;
  ctx.fillStyle = l.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = Math.round(h * (l.style === 'polaroid' ? 0.1 : l.style === 'note' || l.style === 'chapter' ? 0.44 : 0.34));
  const face = (n: number) => `600 ${n}px "Zen Maru Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.font = face(fs);
  while (fs > 12 && ctx.measureText(l.text).width > w * 0.86) ctx.font = face(--fs);
  ctx.fillText(l.text, 0, l.style === 'polaroid' ? h / 2 - h * 0.13 : 0, w * 0.9);
}

/** What the director wrote for the story: the props to draw (props.mts) and the items placed in time. */
export interface StoryPlan {
  props: { id: string; what: string; hero: boolean }[];
  items: (StoryItem & { why?: string })[];
}

// a song has one thread: one hero, a few flights and pops, at most two card piles and one thread line
const MAX: Record<StoryItem['kind'], number> = { hero: 1, fly: 3, pop: 4, cards: 2, thread: 1, orbit: 1, journey: 1, morph: 1, chapter: 5, float: 1 };
const MOTIONS: Motion[] = ['hang', 'flutter', 'roll', 'sit', 'drift', 'still'];

/**
 * Repairs the director's story against the song: times inside it, coordinates on screen, known props and motions,
 * at most MAX of each kind (the earliest kept). Returns the items to keep and what was changed.
 */
export function validateStory(plan: StoryPlan | undefined, duration: number): { items: StoryItem[]; fixes: string[] } {
  const fixes: string[] = [];
  if (!plan?.items?.length) return { items: [], fixes };
  const known = new Set((plan.props ?? []).map((p) => p.id));
  const count: Partial<Record<StoryItem['kind'], number>> = {};
  const clampXY = (v: unknown, lim = 0.95) => Math.max(-lim, Math.min(lim, Number(v) || 0));
  const time = (v: unknown) => Math.max(0, Math.min(duration, Number(v) || 0));
  const items: StoryItem[] = [];
  for (const raw of [...plan.items].sort((a, b) => first(a) - first(b))) {
    const it = { ...raw } as StoryItem & { why?: string; prop?: string; props?: string[]; motion?: Motion };
    if (!(it.kind in MAX)) continue;
    if ((count[it.kind] ?? 0) >= MAX[it.kind]) {
      fixes.push(`故事元件 ${it.kind} 超過 ${MAX[it.kind]} 個，移除`);
      continue;
    }
    if ('prop' in it && it.prop !== undefined && !known.has(it.prop)) {
      fixes.push(`故事元件用到沒列在道具清單的 ${it.prop}，移除`);
      continue;
    }
    if (it.motion && !MOTIONS.includes(it.motion)) delete it.motion;
    if ('x' in it) it.x = clampXY(it.x);
    if ('y' in it) it.y = clampXY(it.y);
    if ('size' in it) it.size = Math.max(0.08, Math.min(0.6, Number(it.size) || 0.25));
    if (it.kind === 'hero') it.states = (it.states ?? []).map((s) => ({ at: time(s.at), state: s.state })).filter((s) => ['show', 'hide', 'crack', 'shatter', 'gather', 'glow'].includes(s.state));
    if (it.kind === 'fly' || it.kind === 'pop') it.at = time(it.at);
    if (it.kind === 'fly') it.dur = Math.max(0.8, Math.min(4, Number(it.dur) || 2));
    if (it.kind === 'pop') it.dur = Math.max(1, Math.min(10, Number(it.dur) || 4));
    if (it.kind === 'cards') it.every = Math.max(0.4, Number(it.every) || 1.5);
    if (it.kind === 'cards' || it.kind === 'thread') {
      it.from = time(it.from);
      it.to = Math.max(it.from + 0.5, time(it.to));
    }
    if (it.kind === 'cards') it.props = (it.props ?? []).filter((p) => known.has(p));
    if (it.kind === 'orbit' || it.kind === 'journey' || it.kind === 'float') {
      it.from = time(it.from);
      it.to = Math.max(it.from + 1, time(it.to));
    }
    if (it.kind === 'orbit') {
      it.r = Math.max(0.1, Math.min(0.7, Number(it.r) || 0.4));
      it.period = Math.max(3, Math.min(20, Number(it.period) || 6));
    }
    if (it.kind === 'journey') it.pts = (it.pts ?? []).map(([x, y]) => [clampXY(x), clampXY(y)] as Pt);
    if (it.kind === 'journey' && it.pts.length < 2) continue;
    if (it.kind === 'morph') {
      it.steps = (it.steps ?? []).filter((s) => known.has(s.prop)).map((s) => ({ at: time(s.at), prop: s.prop }));
      it.until = time(it.until ?? duration);
      if (it.steps.length < 2) {
        fixes.push('故事元件 morph 少於兩個形狀，移除');
        continue;
      }
    }
    if (it.kind === 'chapter') {
      it.at = time(it.at);
      it.dur = Math.max(1.5, Math.min(6, Number(it.dur) || 3));
      it.text = String(it.text ?? '').trim().slice(0, 16);
      if (!it.text) continue;
    }
    if (it.kind === 'float') {
      it.props = (it.props ?? []).filter((p) => known.has(p)).slice(0, 5);
      if (!it.props.length) continue;
    }
    if (it.kind === 'hero' && !it.states.length) continue;
    delete it.why;
    count[it.kind] = (count[it.kind] ?? 0) + 1;
    items.push(it);
  }
  return { items, fixes };
}

const first = (it: StoryItem) =>
  it.kind === 'hero' ? Math.min(...(it.states ?? []).map((s) => s.at), Infinity) : it.kind === 'morph' ? Math.min(...(it.steps ?? []).map((s) => s.at), Infinity) : it.kind === 'fly' || it.kind === 'pop' || it.kind === 'chapter' ? it.at : it.from;

