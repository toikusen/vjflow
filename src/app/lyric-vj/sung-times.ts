// When each character of a line is sung, for the paid tiers: a signature moment lands on the sung character, so
// a flat or evenly spread time is not good enough. The song's own charStarts are taken when the aligner trusted
// them; otherwise every alignment the prep left beside song.json (force*.json, mms_alt.json) is matched to the
// line and the trusted ones vote (median per character); then the voice (spread over the voiced frames); then an
// even spread. The source is reported, so a moment on an 'even' line can be refused. No file access here.
import { AsrWord, charTiming } from './align';

export interface AlignedLine { text: string; start: number; end: number; words: (AsrWord & { p?: number })[] }
export interface Alignment { model: string; lines: AlignedLine[] }
export type SungSource = 'song' | 'vote' | 'aligned' | 'voice' | 'even';
export interface SungTimes { times: number[]; source: SungSource; votes: number }
export interface SungCue { text: string; start: number; end: number; charStarts?: number[]; charTimed?: boolean }

const SUNG = /[\p{L}\p{N}]/u;
/** A character the singer voices (letters and digits); marks and spaces take the time of the character before them. */
export const isSungChar = (ch: string) => SUNG.test(ch);

/** An alignment whose words average below this confidence drifted (雙截棍's main pass: its lines matched other verses). */
export const MIN_ALIGN_P = 0.25;
/** An aligned line this far from the cue's start is another singing of the same words. */
const NEAR_SEC = 2.5;

/** The code-point indexes of a line's sung text outside its bracketed asides (calls sung by others). */
export function mainIndexes(text: string): number[] {
  const out: number[] = [];
  let inside = false;
  [...text].forEach((ch, i) => {
    if (/[（(]/.test(ch)) inside = true;
    else if (/[）)]/.test(ch)) inside = false;
    else if (!inside) out.push(i);
  });
  return out;
}

const norm = (s: string) => [...s].filter(isSungChar).join('').toLowerCase();
const mainText = (text: string) => mainIndexes(text).map((i) => [...text][i]).join('');

/** The aligned line singing these words nearest the cue, or undefined. */
export function matchLine(cue: SungCue, lines: AlignedLine[]): AlignedLine | undefined {
  const main = norm(mainText(cue.text));
  const whole = norm(cue.text);
  const same = lines.filter((l) => { const n = norm(l.text); return n === main || n === whole; });
  return same.filter((l) => Math.abs(l.start - cue.start) <= NEAR_SEC).sort((a, b) => Math.abs(a.start - cue.start) - Math.abs(b.start - cue.start))[0];
}

const meanP = (ws: { p?: number }[]) => ws.reduce((s, w) => s + (w.p ?? 1), 0) / Math.max(1, ws.length);

/** One alignment's times for the characters of `text` (undefined where it has none), or undefined when it is not trusted. */
export function timesFrom(cue: SungCue, line: AlignedLine): (number | undefined)[] | undefined {
  if (meanP(line.words) < MIN_ALIGN_P) return undefined;
  const chars = [...cue.text];
  const sung = chars.map((ch, i) => (isSungChar(ch) ? i : -1)).filter((i) => i >= 0);
  const main = mainIndexes(cue.text).filter((i) => isSungChar(chars[i]));
  // the aligned line's own span: its words start there, whether or not it sang the asides
  const lo = line.start;
  const hi = Math.max(cue.end, line.end);
  // a syllable aligner (MMS) writes one word a sung character: by count, over the whole line or its main part
  const syllabic = line.words.every((w) => /^[a-z' -]+$/i.test(w.text.trim()));
  if (syllabic) {
    const onto = line.words.length === sung.length ? sung : line.words.length === main.length ? main : undefined;
    if (!onto) return undefined;
    const out: (number | undefined)[] = chars.map(() => undefined);
    onto.forEach((i, k) => (out[i] = line.words[k].start));
    return out;
  }
  // a character aligner (Whisper words): its characters matched to the line's text, asides included when it sang them
  const onto = norm(line.text) === norm(cue.text) ? sung : main;
  const text = onto.map((i) => chars[i]).join('');
  const r = charTiming(text, line.words, lo, hi);
  if (!r.trusted) return undefined;
  const out: (number | undefined)[] = chars.map(() => undefined);
  onto.forEach((i, k) => (out[i] = r.charStarts[k]));
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Marks and spaces take the character before them; leading ones the first sung character; then the times never go back. */
export function settle(cue: SungCue, times: (number | undefined)[]): number[] {
  const chars = [...cue.text];
  const first = times.find((t) => t !== undefined) ?? cue.start;
  let prev = Math.max(cue.start, first);
  return chars.map((ch, i) => {
    const t = isSungChar(ch) && times[i] !== undefined ? times[i]! : prev;
    prev = Math.min(cue.end + 0.3, Math.max(prev, t));
    return +prev.toFixed(3);
  });
}

/** Characters spread over the frames in which the voice is on (fps frames a second), or evenly when it never is. */
export function voicedSpread(cue: SungCue, active: boolean[], fps: number): number[] | undefined {
  const chars = [...cue.text];
  const sung = chars.map((ch, i) => (isSungChar(ch) ? i : -1)).filter((i) => i >= 0);
  const frames: number[] = [];
  for (let f = Math.floor(cue.start * fps); f < Math.ceil(cue.end * fps) && f < active.length; f++) if (active[f]) frames.push(f);
  if (frames.length < sung.length) return undefined;
  const times: (number | undefined)[] = chars.map(() => undefined);
  sung.forEach((i, k) => (times[i] = frames[Math.floor((k * frames.length) / sung.length)] / fps));
  return settle(cue, times);
}

/** The aligner's own fallback: the characters over the first 80 % of the line, in order. */
export const evenSpread = (cue: SungCue) => settle(cue, [...cue.text].map((_, i, cs) => cue.start + ((cue.end - cue.start) * 0.8 * i) / Math.max(1, cs.length)));

/**
 * The sung time of every code point of the line, with where it came from. Alignments that drifted or matched too
 * little of the line are left out; two or more that agree are voted character by character.
 */
export function sungTimes(cue: SungCue, alignments: Alignment[], voice?: { active: boolean[]; fps: number }): SungTimes {
  const n = [...cue.text].length;
  if (cue.charTimed && cue.charStarts?.length === n) return { times: settle(cue, cue.charStarts), source: 'song', votes: 0 };
  const candidates = alignments.flatMap((a) => {
    const line = matchLine(cue, a.lines);
    const t = line && timesFrom(cue, line);
    return t ? [t] : [];
  });
  if (candidates.length) {
    const voted = [...cue.text].map((_, i) => {
      const xs = candidates.map((c) => c[i]).filter((x): x is number => x !== undefined);
      return xs.length ? median(xs) : undefined;
    });
    return { times: settle(cue, voted), source: candidates.length > 1 ? 'vote' : 'aligned', votes: candidates.length };
  }
  const voiced = voice && voicedSpread(cue, voice.active, voice.fps);
  if (voiced) return { times: voiced, source: 'voice', votes: 0 };
  return { times: evenSpread(cue), source: 'even', votes: 0 };
}

/** Where `word` is sung in the line, outside its asides: the code-point index of its first character, or -1. */
export function wordIndex(text: string, word: string): number {
  if (!word) return -1;
  const chars = [...text];
  const main = new Set(mainIndexes(text));
  const w = [...word];
  for (let i = 0; i + w.length <= chars.length; i++) {
    if (!main.has(i)) continue;
    if (w.every((ch, k) => chars[i + k] === ch)) return i;
  }
  return -1;
}
