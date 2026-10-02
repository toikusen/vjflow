// What a template gets per cue, and the motion shared by templates (entrances, exits, emphasis, accents).
import * as THREE from 'three';
import { TimelineCue } from '../timeline';
import { CueStyle, Palette, ParamValue, Shot } from '../treatment';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, Glyph, hash } from './glyphs';

/** Text shows this long before the voice so it is readable on the first sung syllable. */
export const LEAD = 0.12;
export const EXIT_SEC = 0.28;

export interface CueRuntime {
  cue: TimelineCue;
  style: CueStyle;
  shot: Shot;
  params: Record<string, ParamValue>;
  palette: Palette;
  fonts: { display: string; body: string };
  showFrom: number;
  /** Exit animation starts here and lasts `exitDur` (ends before the next cue shows). */
  exitAt: number;
  exitDur: number;
  /** Absolute times of the beats this cue hits. */
  accentTimes: number[];
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

export interface TemplateRenderer {
  cue(rt: CueRuntime): CueLayer;
  /** Optional decoration that lives for the whole shot (frames, lines). */
  shot?(shot: Shot, params: Record<string, ParamValue>, palette: Palette): ShotLayer;
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
 * Applies enter/exit motion to one glyph. Returns the scale and opacity multipliers and offsets so templates can
 * combine them with their own layout. `stagger` is the delay between characters.
 */
export function glyphMotion(rt: CueRuntime, g: Glyph, n: number, t: number, stagger: number) {
  const start = rt.showFrom + g.index * stagger;
  let scale = 1;
  let opacity = 1;
  let dx = 0;
  let dy = 0;
  let rot = 0;
  const p = (t - start) / 0.32;
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
      opacity = easeOutCubic((t - rt.showFrom) / 0.3);
      break;
    case 'cut':
      opacity = t >= rt.showFrom ? 1 : 0;
      break;
  }
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
  const last = rt.showFrom + (n - 1) * stagger;
  // seconds per glyph until opaque and back at final scale (back-easing overshoots until the end of its 0.32 s)
  const settle = { slam: 0.34, pop: 0.34, wipe: 0.2, fade: 0.3, cut: 0 }[rt.style.enter];
  return last + settle;
}

export const color = (hex: string, boost = 1) => new THREE.Color(hex).multiplyScalar(boost);

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Lightens a text colour toward white until it reaches WCAG 4.5:1 against the (dark) background colour. */
export function readable(hex: string, background: string, min = 4.5): string {
  const n = parseInt(hex.slice(1), 16);
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const c = '#' + [16, 8, 0].map((sh) => { const v = (n >> sh) & 255; return Math.round(v + (255 - v) * k).toString(16).padStart(2, '0'); }).join('');
    if (contrast(c, background) >= min) return c;
  }
  return '#ffffff';
}
