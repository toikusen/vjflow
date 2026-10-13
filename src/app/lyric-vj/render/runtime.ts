// What a template gets per cue, and the motion shared by templates (entrances, exits, emphasis, accents).
import * as THREE from 'three';
import { Fonts } from '../fonts';
import { TimelineCue } from '../timeline';
import { CueStyle, Palette, ParamValue, Shot } from '../treatment';
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
export function accentPulse(t: number, accents: number[], decay = 9): number {
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
export function glyphMotion(rt: CueRuntime, g: Glyph, n: number, t: number, stagger: number) {
  stagger *= rt.pace;
  const start = enterAt(rt, g, stagger);
  const enterSec = 0.32 * rt.pace;
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
      opacity = easeOutCubic((t - (rt.style.reveal === 'word' ? start : rt.showFrom)) / 0.3);
      break;
    case 'cut':
      opacity = t >= rt.showFrom ? 1 : 0;
      break;
  }
  // once landed, each glyph keeps a slight wave so a held line still breathes (designer VJs never freeze type)
  const held = clamp01((t - start - enterSec) / 0.6);
  if (held > 0) dy += held * 2.5 * Math.sin((t - start) * 1.7 + g.index * 0.55);
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
  // a cut lands every character at once (glyphMotion ignores the stagger for it)
  const last = rt.style.reveal === 'word' ? revealAt(rt, 1) : rt.style.enter === 'cut' ? rt.showFrom : rt.showFrom + (n - 1) * stagger * rt.pace;
  // seconds per glyph until opaque and back at final scale (back-easing overshoots until the end of its entrance)
  const settle = { slam: 0.34, pop: 0.34, wipe: 0.2, fade: 0.3, cut: 0, ink: 0.6, flap: 0.45, slot: 0.8, focus: 0.6, rise: 0.45 }[rt.style.enter];
  return last + settle * rt.pace;
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
export function readFix(rt: CueRuntime, readable: [number, number], required: number, limit: number): Pick<CueRuntime, 'style' | 'exitAt' | 'exitDur' | 'rushed'> | undefined {
  let short = required - (readable[1] - readable[0]);
  if (short <= 0.05) return undefined;
  const room = Math.max(0, limit - (rt.exitAt + rt.exitDur));
  const hold = Math.min(short, room);
  short -= hold;
  if (short <= 0.05) return { style: rt.style, exitAt: rt.exitAt + hold, exitDur: rt.exitDur, rushed: rt.rushed };
  // rushed: templates that set a line in pieces (scatter, stair rows, typing) put them all up at once
  return { style: { ...rt.style, reveal: 'line', enter: 'cut', exit: 'cut' }, exitAt: Math.max(rt.exitAt, limit - 0.08), exitDur: 0.08, rushed: true };
}
