// What a template gets per cue, and the motion shared by templates (entrances, exits, emphasis, accents).
import * as THREE from 'three';
import { Fonts } from '../fonts';
import { TimelineCue } from '../timeline';
import { CueStyle, EnterKind, Palette, ParamValue, Shot } from '../treatment';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, Glyph, hash } from './glyphs';

/** Text shows this long before the voice so it is readable on the first sung syllable. */
export const LEAD = 0.2; // shown a little before the voice so it is read as it is sung (0.2 s)
export const EXIT_SEC = 0.28;

export interface CueRuntime {
  cue: TimelineCue;
  style: CueStyle;
  shot: Shot;
  params: Record<string, ParamValue>;
  palette: Palette;
  fonts: Required<Fonts>;
  showFrom: number;
  /** Exit animation starts here and lasts `exitDur` (ends before the next cue shows). */
  exitAt: number;
  exitDur: number;
  /** Absolute times of the beats this cue hits. */
  accentTimes: number[];
  /** 0.35..1: motion speed-up for short lines (1 = a line of ≥ 2 s). */
  pace: number;
  /** The line is sung faster than it can be read (chars / 12 + 1 s): show it whole at once, no staggering. */
  rushed?: boolean;
  /** The director's entrance and reveal, before pacing and readFix changed them (for the render check). */
  planned?: Pick<CueStyle, 'enter' | 'reveal'>;
  /** What pacing and readFix changed, in order. */
  adjust?: PaceAdjust[];
  /** The entrance plays on every character at once (a quick entrance with no per-character stagger). */
  together?: boolean;
  /** When the later lines of the same shot show (stack and couplet move earlier lines aside as they arrive). */
  later?: number[];
  /** Those later lines' texts, in the same order (chat sizes their bubbles to push this one up by). */
  laterText?: string[];
  /** Every line of the shot, in order (chat sets its close-up from the first). */
  shotText?: string[];
  /** The voice of the shot's first line (chat takes its close-up from that side). */
  firstVoice?: 'me' | 'them';
  /** This line's place among the lines of its shot (0 = first). */
  order?: number;
  /** The song's seed: a drawn effect's look (how many shards, how hard they fly) is its own in each song. */
  song?: number;
  /** The song's tempo (a held line's heartbeat thumps with it). */
  bpm?: number;
}

/** Per-frame effects templates can request from the post stack. */
export interface FrameFx {
  /** Transition white flash (0..1). */
  flash: number;
  /** Accent hit: brighten and bloom, never a white wash (0..1). */
  hit: number;
  shake: number;
}

export interface CueLayer {
  group: THREE.Group;
  update(t: number, fx: FrameFx): void;
  /** [from, to]: when every character is fully opaque and settled. */
  readable(): [number, number];
  /** Laid out in frame px from edge to edge (lyric lanes): neither fitted into the safe area nor drifted. */
  framed?: boolean;
}

export interface ShotLayer {
  group: THREE.Group;
  update(t: number, fx: FrameFx): void;
}

/** What a shot-level layer may need besides its params: fonts and the song's identity (title cards). */
export interface ShotContext {
  fonts: Required<Fonts>;
  meta: { title: string; artist: string };
  /** The paired Latin face (artist names, tags). */
  accentFont: string;
  /** The group logo, when one was uploaded. */
  logo?: THREE.Texture;
  /** A loaded picture by asset id (a photo, or a prop sprite as spr:<id>), for layouts that show one. */
  texture?: (id: string) => THREE.Texture | undefined;
  /** The lines of a shot as they will show (text and time), once the cues are laid out. */
  lines?: (shotId: string) => { text: string; at: number }[];
}

export interface TemplateRenderer {
  cue(rt: CueRuntime): CueLayer;
  /** Optional decoration that lives for the whole shot (frames, lines, title cards). */
  shot?(shot: Shot, params: Record<string, ParamValue>, palette: Palette, ctx: ShotContext): ShotLayer;
  /** The shot layer shows for the whole shot, not only around its lines (title cards have none). */
  standalone?: boolean;
  /** Lines stay up past their own time: until the shot ends ('shot'), or until the line after next shows ('next'). */
  persist?: 'shot' | 'next';
}

/** Strength of the most recent accent at time t (exponential decay after each hit). */
/**
 * Rest pose: while a line's box is measured (where it sits, what must make room for it), the decorative motion — the
 * held wave and the beat pulses — is left out, so measuring a hundredth of a second earlier or later does not move the
 * box (a 4 px wave swing moved 雙截棍's prop to the other side of the frame).
 */
let restPose = false;
export function measureAtRest<T>(f: () => T): T {
  restPose = true;
  try {
    return f();
  } finally {
    restPose = false;
  }
}

export function accentPulse(t: number, accents: number[], decay = 9): number {
  if (restPose) return 0;
  let p = 0;
  for (const a of accents) if (t >= a) p = Math.max(p, Math.exp(-(t - a) * decay));
  return p;
}

export function emphasisOf(rt: CueRuntime, index: number) {
  return rt.style.emphasis?.find((e) => index >= e.from && index < e.to)?.method;
}

/**
 * Marks which character of `text` each glyph shows, walking forward from `from`; returns where it stopped so the
 * next part continues from there. Spaces in either string are skipped.
 */
export function tagSource(glyphs: Glyph[], text: string, from = 0): number {
  const src = [...text];
  let p = from;
  for (const g of glyphs) {
    if (/\s/.test(g.char)) continue;
    let q = p;
    while (q < src.length && src[q] !== g.char) q++;
    if (q < src.length) {
      g.src = q;
      p = q + 1;
    }
  }
  return p;
}

/**
 * Word reveal: characters appear at one steady rate over the first 45 % of the line (0.3–1.5 s), then the whole
 * line holds. Not tied to per-character sung times: those are too imprecise and made reveals stutter and the last
 * word flash before a cut.
 */
export function revealAt(rt: CueRuntime, frac: number): number {
  // the whole line is up within a quarter of its time (at most 0.8 s): a reveal over half the line left fast songs'
  // lines whole on screen for too little time to be read
  const span = Math.min(0.8, Math.max(0.2, 0.25 * (rt.exitAt - rt.showFrom)));
  return rt.showFrom + clamp01(frac) * span;
}

const fracOf = (rt: CueRuntime, g: Glyph) => (g.src ?? g.index) / Math.max(1, [...rt.cue.text].length - 1);

/** When glyph g starts entering: its place in the steady word reveal, else the line's stagger. */
export function enterAt(rt: CueRuntime, g: Glyph, stagger: number): number {
  if (rt.style.reveal === 'word') return revealAt(rt, fracOf(rt, g));
  if (rt.together) return rt.showFrom;
  return rt.showFrom + g.index * stagger;
}

/**
 * Applies enter/exit motion to one glyph. Returns the scale and opacity multipliers and offsets so templates can
 * combine them with their own layout. `stagger` is the delay between characters.
 */
/** slam, pop and wipe run over this many seconds × pace; a fade always takes FADE_SEC (it is not sped up). */
const PACED_SEC = 0.32;
const FADE_SEC = 0.3;

/**
 * Seconds from a glyph's start until it has landed (opaque, in place, within 5 % of its size), as it is drawn:
 * glyphMotion's entrances and text-fx's drawn ones (DRAWN; wipe is within 5 % of its slide at 0.21). The readable
 * estimates use this same table, so what is measured is what is shown.
 */
/** The drawn entrances' timing (text-fx.ts draws with these; enterSec reads them), in seconds × pace. */
export const DRAWN = {
  ink: { line: 0.28, fillFrom: 0.22, fill: 0.34 },
  /** One fold per this many seconds, through at most `faces` other characters. */
  flap: { fold: 0.07, faces: 6 },
  slot: { reel: 0.55, land: 0.25 },
  rise: { sec: 0.45 },
  focus: { sec: 0.6 },
  /** Random signs flicker through each place, this long each, before the character settles. */
  decode: { fold: 0.045, faces: 8 },
  slice: { sec: 0.4 },
  flip: { sec: 0.45 },
  stretch: { sec: 0.55 },
  /** The line's characters swap places and run home along small arcs (kittenjam 洗牌重排). */
  shuffle: { sec: 0.7 },
  /** Falls under gravity and bounces lower each time, squashing on each landing (Motion Prompt #123, MIT). */
  squash: { sec: 1.1 },
  /** Backs off and squashes to wind up, then shoots home and wobbles (Motion Prompt #121, MIT). */
  windup: { sec: 0.85 },
  /** The whole line waits faint while a ball hops from character to character as each is sung (kittenjam 卡拉OK小球). */
  karaoke: { sec: 0.25 },
} as const;

export function enterSec(enter: EnterKind, pace: number): number {
  const paced: Record<EnterKind, number> = {
    cut: 0, fade: 0, slam: PACED_SEC, pop: PACED_SEC, wipe: 0.21,
    ink: DRAWN.ink.fillFrom + DRAWN.ink.fill, flap: DRAWN.flap.fold * DRAWN.flap.faces, slot: DRAWN.slot.reel + DRAWN.slot.land, rise: DRAWN.rise.sec, focus: DRAWN.focus.sec,
    decode: DRAWN.decode.fold * DRAWN.decode.faces, slice: DRAWN.slice.sec, flip: DRAWN.flip.sec, stretch: DRAWN.stretch.sec,
    shuffle: DRAWN.shuffle.sec, squash: DRAWN.squash.sec, windup: DRAWN.windup.sec, karaoke: DRAWN.karaoke.sec, settle: PACED_SEC * MOTION_SEC.settle, flicker: PACED_SEC * MOTION_SEC.flicker,
    dash: PACED_SEC * MOTION_SEC.dash, drop: PACED_SEC * MOTION_SEC.drop, zoom: PACED_SEC * MOTION_SEC.zoom, gather: PACED_SEC * MOTION_SEC.gather, spin: PACED_SEC * MOTION_SEC.spin, prelight: PACED_SEC, spread: PACED_SEC * MOTION_SEC.spread, swing: PACED_SEC * MOTION_SEC.swing,
  };
  return enter === 'fade' ? FADE_SEC : paced[enter] * pace;
}

/** The motion entrances' length as a multiple of PACED_SEC (a drop needs room to bounce, a gather to travel). */
const MOTION_SEC = { dash: 0.8, drop: 1.5, zoom: 0.9, gather: 1.3, spin: 1.1, spread: 1.4, swing: 2.4, settle: 2.2, flicker: 1.6 } as const;
/** Bounces twice on the way in (a gravity drop landing on an unseen floor). */
const bounce = (p: number) => {
  const x = clamp01(p);
  if (x < 0.6) return (x / 0.6) ** 2;
  if (x < 0.85) return 1 - 0.12 * Math.sin(((x - 0.6) / 0.25) * Math.PI);
  return 1 - 0.04 * Math.sin(((x - 0.85) / 0.15) * Math.PI);
};

/**
 * A drawn line effect's look in this song (a shake's reach, a hop's height, a fall's bounce): a value in [lo, hi] fixed
 * by the song and the key, the lyric's counterpart of the moves' knobs (knobs.ts), so the same effect differs by song.
 */
export const songVary = (rt: Pick<CueRuntime, 'song'>, key: string, lo: number, hi: number) => {
  let h = rt.song ?? 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return lo + hash(h % 100003, 3.7) * (hi - lo);
};

export function glyphMotion(rt: CueRuntime, g: Glyph, n: number, t: number, stagger: number) {
  stagger *= rt.pace;
  const start = enterAt(rt, g, stagger);
  const enterSec = PACED_SEC * rt.pace;
  let scale = 1;
  let opacity = 1;
  let dx = 0;
  let dy = 0;
  let rot = 0;
  const p = (t - start) / enterSec;
  const m = (k: keyof typeof MOTION_SEC) => clamp01((t - start) / (enterSec * MOTION_SEC[k]));
  const side = g.index - (n - 1) / 2;
  // the song's own reach for each motion (how far, how big, how much it turns); never its timing, which the reading
  // checks (enterSec, settledAt) count on, and held motions only ever smaller than the motion room (motionPad) allows
  const v = (key: string, lo: number, hi: number) => songVary(rt, key, lo, hi);
  switch (rt.style.enter) {
    case 'dash': {
      const q = m('dash');
      dx = -900 * v('dash.far', 0.7, 1.2) * (1 - easeOutCubic(q)) ** 3;
      opacity = clamp01(q * 6);
      break;
    }
    case 'drop':
      // y is up (the camera's): it starts above its place and falls onto it (with -520 it rose up from below)
      dy = 520 * v('drop.far', 0.7, 1.2) * (1 - bounce(m('drop')));
      opacity = clamp01(m('drop') * 5);
      break;
    case 'zoom':
      scale = 1 + 3 * v('zoom.depth', 0.6, 1.3) * (1 - easeOutCubic(m('zoom')));
      opacity = clamp01(m('zoom') * 3);
      break;
    case 'gather': {
      const q = easeOutCubic(m('gather')), a = hash(g.index, rt.cue.start + 3) * Math.PI * 2;
      const reach = v('gather.reach', 0.7, 1.3);
      dx = Math.cos(a) * 520 * reach * (1 - q);
      dy = Math.sin(a) * 320 * reach * (1 - q);
      rot = (hash(g.index, 11) - 0.5) * 2.4 * v('gather.turn', 0.5, 1.3) * (1 - q);
      opacity = clamp01(m('gather') * 2.5);
      break;
    }
    case 'spin':
      rot = -Math.PI * 2 * (v('spin.dir', 0, 1) < 0.5 ? 1 : -1) * (v('spin.turns', 0, 1) < 0.3 ? 0.5 : 1) * (1 - easeOutCubic(m('spin')));
      scale = easeOutBack(m('spin'));
      opacity = clamp01(m('spin') * 3);
      break;
    case 'prelight':
      // the whole line shows faint ahead of the voice, each character lights as it comes
      opacity = t >= rt.showFrom - 0.4 ? v('prelight.faint', 0.12, 0.3) + (1 - v('prelight.faint', 0.12, 0.3)) * clamp01(p * 3) : 0;
      break;
    case 'spread':
      dx = -side * 46 * v('spread.gap', 0.6, 1.4) * (1 - easeOutCubic(m('spread')));
      opacity = easeOutCubic(m('spread'));
      break;
    case 'swing': {
      const q = m('swing');
      rot = 0.5 * v('swing.arc', 0.6, 1.2) * Math.cos(q * 9) * (1 - q) * (q < 1 ? 1 : 0);
      dy = -60 * (1 - easeOutCubic(clamp01(q * 3)));
      opacity = clamp01(q * 6);
      break;
    }
    case 'settle': {
      // shivers hard as it lands and calms down to still (kittenjam 顫抖穩定): the shake decays with the entrance
      const q = m('settle'), f = Math.floor((t - start) * songVary(rt, 'settle.fps', 18, 30)), amp = (1 - easeOutCubic(q)) * (q < 1 ? 1 : 0) * songVary(rt, 'settle.amp', 0.65, 1.2);
      dx = (hash(g.index, f) - 0.5) * 34 * amp;
      dy = (hash(g.index + 7, f) - 0.5) * 22 * amp;
      rot = (hash(g.index + 3, f) - 0.5) * 0.3 * amp;
      opacity = clamp01(q * 8);
      break;
    }
    case 'flicker': {
      // a neon tube striking: dark, two short blinks at their own moments, then on for good (kittenjam 霓虹閃爍)
      const s = songVary(rt, 'flicker.seed', 0, 50), q = m('flicker'), a = 0.15 + 0.25 * hash(g.index, 41 + s), b = 0.5 + 0.2 * hash(g.index, 43 + s);
      opacity = q >= 0.85 ? 1 : (q > a && q < a + 0.08) || (q > b && q < b + 0.12) ? 0.85 : q > 0.7 ? 0.35 : 0;
      break;
    }
    case 'slam':
      scale = 1 + 1.4 * v('slam.size', 0.6, 1.2) * (1 - easeOutBack(p));
      opacity = clamp01(p * 4);
      dy = (1 - easeOutCubic(p)) * 40 * v('slam.drop', 0.5, 1.5);
      break;
    case 'pop':
      scale = easeOutBack(p);
      opacity = clamp01(p * 3);
      break;
    case 'wipe':
      opacity = clamp01(p * 2.5);
      dx = (1 - easeOutCubic(p)) * -24 * v('wipe.far', 0.7, 1.4);
      break;
    case 'fade':
      opacity = easeOutCubic((t - (rt.style.reveal === 'word' ? start : rt.showFrom)) / FADE_SEC);
      break;
    case 'cut':
      opacity = t >= rt.showFrom ? 1 : 0;
      break;
  }
  // once landed, each glyph keeps a slight wave so a held line still breathes (designer VJs never freeze type)
  const held = clamp01((t - start - enterSec) / 0.6);
  const idle = rt.style.idle;
  const since = Math.max(0, t - start - enterSec);
  if (held > 0 && !restPose)
    switch (idle) {
      case 'still':
        break;
      case 'drift': // the line slides slowly up and right while it is held
        dx += since * 6 * v('idle.drift', 0.6, 1);
        dy -= since * 3 * v('idle.drift', 0.6, 1);
        break;
      case 'push': // a slow push in, as a camera would
        scale *= 1 + Math.min(0.08, since * 0.03);
        dx += side * Math.min(0.08, since * 0.03) * 30;
        break;
      case 'wave': // a water wave through the characters
        dy += held * 9 * v('idle.wave', 0.6, 1) * Math.sin(t * v('idle.waveSpeed', 2.4, 3.6) - g.index * 0.7);
        break;
      case 'float': // each character bobs on its own
        dy += held * 6 * v('idle.float', 0.6, 1) * Math.sin(t * v('idle.floatSpeed', 1.1, 1.8) + hash(g.index, 5) * 6.28);
        rot += held * 0.04 * Math.sin(t * 1.1 + g.index);
        break;
      case 'shake': // a nervous tremble
        dx += held * (hash(g.index, Math.floor(t * v('idle.shakeHz', 14, 22))) - 0.5) * 5 * v('idle.shake', 0.7, 1);
        dy += held * (hash(g.index + 9, Math.floor(t * v('idle.shakeHz', 14, 22))) - 0.5) * 5 * v('idle.shake', 0.7, 1);
        break;
      case 'boil': {
        // stop motion: every character redrawn a little off its place eight times a second (Motion Prompt #128/#136)
        const f = Math.floor(t * songVary(rt, 'boil.fps', 6, 10)), amp = songVary(rt, 'boil.amp', 0.7, 1.3);
        dx += held * (hash(g.index, f + 101) - 0.5) * 7 * amp;
        dy += held * (hash(g.index + 5, f + 101) - 0.5) * 6 * amp;
        rot += held * (hash(g.index + 9, f + 101) - 0.5) * 0.12;
        scale *= 1 + held * (hash(g.index + 13, f + 101) - 0.5) * 0.06;
        break;
      }
      case 'thump': {
        // a heartbeat with the song: a double lub-dub on every beat, a quick swell that drops straight back (Motion Prompt #125)
        const beat = 60 / (rt.bpm ?? 120), ph = (((t - rt.showFrom) % beat) + beat) % beat / beat;
        const G = (c: number, w: number) => Math.exp(-(((ph - c) / w) ** 2));
        scale *= 1 + held * v('idle.thump', 0.6, 1) * (0.05 * G(0.17, 0.055) + 0.03 * G(0.37, 0.06));
        break;
      }
      case 'hop': // the characters hop one after another, never dipping under the line (kittenjam 逐字彈跳)
        dy += held * songVary(rt, 'hop.h', 10, 22) * Math.max(0, Math.sin(t * songVary(rt, 'hop.speed', 3.2, 5) - g.index * 0.6)) ** 2;
        break;
      default:
        dy += held * 2.5 * Math.sin((t - start) * 1.7 + g.index * 0.55);
    }
  if (t > rt.exitAt && rt.style.exit !== 'cut') {
    const q = (t - rt.exitAt - g.index * Math.min(0.02, rt.exitDur / Math.max(1, n) / 2)) / rt.exitDur;
    const e = easeInCubic(q);
    switch (rt.style.exit) {
      case 'burst': {
        const ang = hash(g.index, rt.cue.start) * Math.PI * 2;
        dx += Math.cos(ang) * 260 * v('burst.far', 0.7, 1.4) * e;
        dy += Math.sin(ang) * 260 * v('burst.far', 0.7, 1.4) * e;
        rot += (hash(g.index, 7) - 0.5) * 1.2 * v('burst.turn', 0.5, 1.5) * e;
        scale *= 1 + 0.4 * e;
        break;
      }
      case 'rise':
        dy += 36 * v('rise.far', 0.7, 1.6) * e;
        break;
      case 'drop': // falls out of the bottom of the frame, characters a little apart
        dy -= 620 * e * e * (0.8 + 0.4 * hash(g.index, 13));
        rot += (hash(g.index, 17) - 0.5) * 0.6 * v('dropout.turn', 0.4, 1.6) * e;
        break;
      case 'shrink':
        scale *= 1 - v('shrink.to', 0.7, 0.9) * e;
        break;
      case 'dash':
        dx += 1100 * e * e * (v('dashout.dir', 0, 1) < 0.5 ? 1 : -1);
        break;
      case 'dust': { // breaks into drifting specks
        const a = hash(g.index, rt.cue.start + 1) * Math.PI * 2;
        const wind = v('dust.wind', 0.4, 1.6);
        dx += Math.cos(a) * 70 * e + 60 * wind * e;
        dy -= 90 * e + Math.sin(a) * 40 * e;
        scale *= 1 - 0.6 * e;
        rot += (hash(g.index, 19) - 0.5) * 2 * e;
        break;
      }
      case 'spin':
        rot += Math.PI * 1.5 * (v('spinout.dir', 0, 1) < 0.5 ? 1 : -1) * e;
        scale *= 1 - 0.7 * e;
        break;
      case 'zoom': // through the lens
        scale *= 1 + 3.5 * v('zoomout.depth', 0.6, 1.3) * e;
        break;
      case 'melt': // runs down, each character at its own rate
        dy -= 160 * v('melt.run', 0.6, 1.4) * e * (0.5 + hash(g.index, 23));
        scale *= 1 - 0.2 * e;
        break;
      case 'domino': {
        // each character tips over its lower right corner onto the next, in turn (kittenjam 骨牌倒下); y is up
        // the song's row falls one way (right or left) at its own pace
        const lag = songVary(rt, 'domino.lag', 0.3, 0.6), side = songVary(rt, 'domino.side', 0, 1) < 0.5 ? 1 : -1;
        const d = (rt.exitDur * lag) / Math.max(1, n - 1), k = easeInCubic((t - rt.exitAt - (side > 0 ? g.index : n - 1 - g.index) * d) / (rt.exitDur * (1 - lag)));
        const a = -side * (Math.PI / 2) * k, w = (side * g.advance) / 2, h = g.advance / 2;
        dx += w - w * Math.cos(a) - h * Math.sin(a);
        dy += -h - w * Math.sin(a) + h * Math.cos(a);
        rot += a;
        opacity *= 1 - clamp01((k - 0.7) / 0.3);
        break;
      }
    }
    // a domino keeps each character up until it has fallen
    if (rt.style.exit !== 'domino') opacity *= 1 - clamp01(q);
  } else if (t > rt.exitAt + rt.exitDur || (rt.style.exit === 'cut' && t > rt.exitAt)) opacity = 0;
  return { scale, opacity, dx, dy, rot };
}

/** When the last character has finished entering (all opaque and within 5 % of final scale). */
export function settledAt(rt: CueRuntime, n: number, stagger: number) {
  // a cut and a whole-line fade bring every character in at once (glyphMotion ignores the stagger for them)
  const together = rt.together || rt.style.enter === 'cut' || rt.style.enter === 'fade';
  const last = rt.style.reveal === 'word' ? revealAt(rt, 1) : together ? rt.showFrom : rt.showFrom + (n - 1) * stagger * rt.pace;
  return last + enterSec(rt.style.enter, rt.pace);
}

export const color = (hex: string, boost = 1) => new THREE.Color(hex).multiplyScalar(boost);

import { contrast } from '../contrast';
export { contrast };

/** Lightens a text colour toward white until it reaches WCAG 4.5:1 against the (dark) background colour. */
export function readable(hex: string, background: string, min = 4.5): string {
  const n = parseInt(hex.slice(1), 16);
  const light = contrast(background, '#000000') > contrast(background, '#ffffff');
  for (let k = 0; k <= 1.0001; k += 0.05) {
    // on a light background the colour darkens toward black instead of lightening toward white
    const toward = light ? 0 : 255;
    const c = '#' + [16, 8, 0].map((sh) => { const v = (n >> sh) & 255; return Math.round(v + (toward - v) * k).toString(16).padStart(2, '0'); }).join('');
    if (contrast(c, background) >= min) return c;
  }
  return light ? '#000000' : '#ffffff';
}

/** Seconds a line needs on screen, fully in, to be read: chars / 12 + 1 s, at most 90 % of the time it is sung. */
export const readingSec = (text: string, start: number, end: number) => Math.min([...text.replace(/\s/g, '')].length / 12 + 1, 0.9 * (end - start + 0.4));

/**
 * What to change so a line that is not up long enough to be read gets its reading time: first it holds into the free
 * time after it (up to `limit`, when the next line or the shot's end needs the screen); if that is not enough it lands
 * at once (no word-by-word reveal, no drawn entrance) and leaves on a cut at `limit`. Undefined when it reads already.
 * Applies to every template and effect alike: it works from the readable window the built layer reports.
 */
export function readFix(rt: CueRuntime, readable: [number, number], required: number, limit: number): Pick<CueRuntime, 'style' | 'exitAt' | 'exitDur' | 'rushed' | 'adjust'> | undefined {
  let short = required - (readable[1] - readable[0]);
  if (short <= 0.05) return undefined;
  const room = Math.max(0, limit - (rt.exitAt + rt.exitDur));
  const hold = Math.min(short, room);
  short -= hold;
  if (short <= 0.05) return { style: rt.style, exitAt: rt.exitAt + hold, exitDur: rt.exitDur, rushed: rt.rushed, adjust: [...(rt.adjust ?? []), 'read-hold'] };
  // rushed: templates that set a line in pieces (scatter, stair rows, typing) put them all up at once
  return { style: { ...rt.style, reveal: 'line', enter: 'cut', exit: 'cut' }, exitAt: Math.max(rt.exitAt, limit - 0.08), exitDur: 0.08, rushed: true, adjust: [...(rt.adjust ?? []), 'read-cut'] };
}

/**
 * fast-cut / fast-short: a line sung faster than it reads lost a slow entrance (to a cut, or to a short one);
 * fast-line / tight-line: its word reveal became a whole-line entrance; read-hold: readFix only kept it up longer;
 * read-short: instead of that cut, a quick entrance that still leaves the reading time; read-cut: readFix landed it at
 * once and cut it out.
 */
export type PaceAdjust = 'fast-cut' | 'fast-short' | 'fast-line' | 'tight-line' | 'read-hold' | 'read-short' | 'read-cut';

/** Entrances too slow for a line sung faster than it reads (pop and fade are quick enough to keep). */
const SLOW_ENTERS = new Set<EnterKind>(['ink', 'slam', 'wipe', 'flap', 'slot', 'focus', 'rise', 'shuffle', 'squash', 'windup', 'karaoke', 'settle', 'flicker']);
/** The quick entrance closest in feel: impacts pop, the rest fade. */
const SHORT_ENTER = (e: EnterKind): EnterKind => (e === 'slam' || e === 'flap' || e === 'slot' ? 'pop' : 'fade');

/**
 * Pacing before a line is built: a line sung faster than it reads (rushed) comes up whole, and a slow entrance becomes
 * a cut, or with `shortEnter` a quick entrance (readFix still cuts it when even that leaves too little reading time);
 * a line with little time to spare (tight) is not spelled out word by word.
 */
export function paceStyle(style: CueStyle, cue: { start: number; end: number; text: string }, shortEnter = false): { style: CueStyle; rushed: boolean; adjust: PaceAdjust[] } {
  const chars = [...cue.text.replace(/\s/g, '')].length;
  const len = cue.end - cue.start;
  const rushed = len < chars / 12 + 1;
  const tight = len < chars / 12 + 1.6;
  const adjust: PaceAdjust[] = [];
  let out = style;
  if (style.reveal === 'word' && (rushed || tight)) {
    out = { ...out, reveal: 'line' };
    adjust.push(rushed ? 'fast-line' : 'tight-line');
  }
  if (rushed) {
    out = { ...out, reveal: 'line' };
    if (SLOW_ENTERS.has(style.enter)) {
      out = { ...out, enter: shortEnter ? SHORT_ENTER(style.enter) : 'cut' };
      adjust.push(shortEnter ? 'fast-short' : 'fast-cut');
    }
  }
  return { style: out, rushed, adjust };
}

/**
 * The line again with a quick entrance, whole and with its pieces all up at once: what readFix tries before a cut when
 * quick entrances are on. Undefined when there is nothing quicker than a cut to try.
 */
export function quickEntrance(rt: CueRuntime, together = false): CueRuntime | undefined {
  if (rt.style.enter === 'cut') return undefined;
  const enter = rt.style.enter === 'pop' || rt.style.enter === 'fade' ? rt.style.enter : SHORT_ENTER(rt.style.enter);
  return { ...rt, style: { ...rt.style, reveal: 'line', enter }, rushed: true, together: together || rt.together, adjust: [...(rt.adjust ?? []), 'read-short'] };
}

export type ReadingFix = Pick<CueRuntime, 'style' | 'exitAt' | 'exitDur' | 'rushed' | 'adjust' | 'together'>;

/**
 * Gives a built line its reading time. `measure` builds the line with a timing and returns its readable window.
 * readFix holds it longer or lands it on a cut; with `shortEnter`, before that cut a quick entrance is tried (held
 * longer if need be) and kept only if the line built with it, as it will be drawn, still reads. Undefined = as it is.
 */
export function fitReading(rt: CueRuntime, measure: (r: CueRuntime) => [number, number], need: number, limit: number, shortEnter = false, together = false): ReadingFix | undefined {
  const fix = readFix(rt, measure(rt), need, limit);
  const quick = fix?.adjust?.at(-1) === 'read-cut' && shortEnter ? quickEntrance(rt, together) : undefined;
  if (!quick) return fix;
  const again = readFix(quick, measure(quick), need, limit);
  if (again && again.adjust?.at(-1) !== 'read-hold') return fix;
  const kept: ReadingFix = { style: quick.style, exitAt: quick.exitAt, exitDur: quick.exitDur, rushed: true, together: quick.together, adjust: quick.adjust, ...again };
  const [from, to] = measure({ ...rt, ...kept });
  return to - from >= need - 0.05 ? kept : fix;
}

/**
 * A line's measured (rest) rectangle grown by how far the type layer's own motion can carry it while it plays, so the
 * objects that make room for it clear it in every frame: the kick's 5 % scale (loud sections only) and the drift's
 * 1.2 % growth, both about the frame centre, the sway (13 / 6 px), the drift (14 / 8 px), the kick's 10 px jump and
 * the 2.5 px wave. Worst case and fixed, so it never moves with when the box was measured. Frame px, y down.
 */
export function motionPad(r: { x0: number; y0: number; x1: number; y1: number }, kick: boolean, w = 1920, h = 1080) {
  const grow = (kick ? 1.05 : 1) * 1.012 - 1;
  const dx = (x: number) => Math.abs(x - w / 2) * grow + 13 + 14 + 2.5;
  const dy = (y: number) => Math.abs(y - h / 2) * grow + 6 + 8 + 2.5 + (kick ? 10 : 0);
  return { x0: r.x0 - dx(r.x0), y0: r.y0 - dy(r.y0), x1: r.x1 + dx(r.x1), y1: r.y1 + dy(r.y1) };
}

/** A planned entrance that never plays: the line was meant to enter with motion and lands on a cut instead. */
export const entranceLost = (planned: Pick<CueStyle, 'enter'>, final: Pick<CueStyle, 'enter'>) => planned.enter !== 'cut' && final.enter === 'cut';

/**
 * The share of a line's box where `text` reads below 3:1 over a photo inset: the box (pixels `img`, its top left at
 * x0, y0 in frame px) is cut in ~48 px cells, each read on its mean (halftone dots or a star average out; a picture
 * under part of the line does not). Cells off the photos do not count against the line: bands and shapes are part of
 * the design its colour was chosen on, and a photo is what stays behind the words when there is no room.
 */
/**
 * Whether a line is rebuilt light in a dark halo: its own type falls short over more than `threshold` of its box, and
 * light type falls short over less of it (over a pale photo the line's own dark ink reads better than light type on a
 * thin keyline; a tie keeps the colour the line was given).
 */
export const guardLine = (share: number, light: number, threshold: number) => share > threshold && light < share;

export function poorShare(img: { data: ArrayLike<number>; width: number; height: number }, x0: number, y0: number, text: string, photos: { x0: number; y0: number; x1: number; y1: number }[]): number {
  const { data: d, width: w, height: h } = img;
  if (!photos.length || !w || !h) return 0;
  const cols = Math.max(1, Math.round(w / 48));
  const rows = Math.max(1, Math.round(h / 48));
  const cells = Array.from({ length: cols * rows }, () => [0, 0, 0, 0]);
  for (let i = 0; i < d.length; i += 4 * 97) {
    const p = i / 4;
    const c = cells[Math.min(rows - 1, Math.floor((Math.floor(p / w) / h) * rows)) * cols + Math.min(cols - 1, Math.floor(((p % w) / w) * cols))];
    c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; c[3]++;
  }
  const hx = (v: number, k: number) => Math.round(v / k).toString(16).padStart(2, '0');
  const onPhoto = (k: number) => {
    const [x, y] = [x0 + ((k % cols) + 0.5) * (w / cols), y0 + (Math.floor(k / cols) + 0.5) * (h / rows)];
    return photos.some((q) => x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1);
  };
  const filled = cells.flatMap((c, k) => (c[3] ? [{ c, k }] : []));
  if (!filled.length) return 0;
  return filled.filter(({ c, k }) => onPhoto(k) && contrast(text, `#${hx(c[0], c[3])}${hx(c[1], c[3])}${hx(c[2], c[3])}`) < 3).length / filled.length;
}
