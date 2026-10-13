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
  /** When the later lines of the same shot show (stack and couplet move earlier lines aside as they arrive). */
  later?: number[];
  /** This line's place among the lines of its shot (0 = first). */
  order?: number;
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
} as const;

export function enterSec(enter: EnterKind, pace: number): number {
  const paced: Record<EnterKind, number> = {
    cut: 0, fade: 0, slam: PACED_SEC, pop: PACED_SEC, wipe: 0.21,
    ink: DRAWN.ink.fillFrom + DRAWN.ink.fill, flap: DRAWN.flap.fold * DRAWN.flap.faces, slot: DRAWN.slot.reel + DRAWN.slot.land, rise: DRAWN.rise.sec, focus: DRAWN.focus.sec,
  };
  return enter === 'fade' ? FADE_SEC : paced[enter] * pace;
}

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
  switch (rt.style.enter) {
    case 'slam':
      scale = 1 + 1.4 * (1 - easeOutBack(p));
      opacity = clamp01(p * 4);
      dy = (1 - easeOutCubic(p)) * 40;
      break;
    case 'pop':
      scale = easeOutBack(p);
      opacity = clamp01(p * 3);
      break;
    case 'wipe':
      opacity = clamp01(p * 2.5);
      dx = (1 - easeOutCubic(p)) * -24;
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
  if (held > 0 && !restPose) dy += held * 2.5 * Math.sin((t - start) * 1.7 + g.index * 0.55);
  if (t > rt.exitAt && rt.style.exit !== 'cut') {
    const q = (t - rt.exitAt - g.index * Math.min(0.02, rt.exitDur / Math.max(1, n) / 2)) / rt.exitDur;
    const e = easeInCubic(q);
    switch (rt.style.exit) {
      case 'burst': {
        const ang = hash(g.index, rt.cue.start) * Math.PI * 2;
        dx += Math.cos(ang) * 260 * e;
        dy += Math.sin(ang) * 260 * e;
        rot += (hash(g.index, 7) - 0.5) * 1.2 * e;
        scale *= 1 + 0.4 * e;
        break;
      }
      case 'rise':
        dy += 36 * e;
        break;
    }
    opacity *= 1 - clamp01(q);
  } else if (t > rt.exitAt + rt.exitDur || (rt.style.exit === 'cut' && t > rt.exitAt)) opacity = 0;
  return { scale, opacity, dx, dy, rot };
}

/** When the last character has finished entering (all opaque and within 5 % of final scale). */
export function settledAt(rt: CueRuntime, n: number, stagger: number) {
  // a cut and a whole-line fade bring every character in at once (glyphMotion ignores the stagger for them)
  const together = rt.style.enter === 'cut' || rt.style.enter === 'fade';
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
 * fast-cut: a line sung faster than it reads lost a slow entrance to a cut; fast-line / tight-line: its word reveal
 * became a whole-line entrance; read-hold: readFix only kept it up longer; read-cut: readFix landed it at once and cut
 * it out.
 */
export type PaceAdjust = 'fast-cut' | 'fast-line' | 'tight-line' | 'read-hold' | 'read-cut';

/** Entrances too slow for a line sung faster than it reads (pop and fade are quick enough to keep). */
const SLOW_ENTERS = new Set<EnterKind>(['ink', 'slam', 'wipe', 'flap', 'slot', 'focus', 'rise']);

/**
 * Pacing before a line is built: a line sung faster than it reads (rushed) comes up whole and a slow entrance becomes
 * a cut; a line with little time to spare (tight) is not spelled out word by word.
 */
export function paceStyle(style: CueStyle, cue: { start: number; end: number; text: string }): { style: CueStyle; rushed: boolean; adjust: PaceAdjust[] } {
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
      out = { ...out, enter: 'cut' };
      adjust.push('fast-cut');
    }
  }
  return { style: out, rushed, adjust };
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
