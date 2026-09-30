import { LyricCue } from './lyric.model';

/** A recognized word/token with absolute times in seconds (from ASR word timestamps). */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export type Normalizer = (text: string) => string;

const MATCH = 3;
const MISMATCH = -1;
const GAP = -1;
/** A line needs at least this share of its characters matched to be trusted. */
const MIN_LINE_COVERAGE = 0.25;
const SECONDS_PER_CHAR = 0.3;
/** Show lines slightly before the voice: ASR timestamps run a little late, and reading ahead feels natural. */
const DISPLAY_LEAD = 0.3;
/** A misheard (substituted) char may define a line edge only this close to the nearest exact match. */
const MAX_SUBSTITUTION_REACH = 3;

/** Lowercase and drop everything except letters/digits (any script). */
export const basicNormalize: Normalizer = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Whisper `language` hint from the script the lyrics are written in; undefined = let Whisper detect. */
export function guessLanguage(text: string): string | undefined {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'japanese';
  if (/\p{Script=Hangul}/u.test(text)) return 'korean';
  if (/\p{Script=Han}/u.test(text)) return 'chinese';
  if (/^[\p{Script=Latin}\p{N}\p{P}\p{Z}\s]+$/u.test(text)) return 'english';
  return undefined;
}

/**
 * Aligns known lyric lines to ASR words at character level (overlap alignment:
 * free leading/trailing gaps, so ad-libs, misheard words and lines outside the audio window are tolerated),
 * then derives each line's start/end from its matched characters.
 * Lines without enough matches are interpolated between trusted neighbours.
 */
export function alignLyrics(lines: string[], words: TimedWord[], normalize: Normalizer, window: { start: number; end: number }): LyricCue[] {
  const lyricChars: { ch: string; line: number }[] = [];
  lines.forEach((line, i) => Array.from(normalize(line)).forEach((ch) => lyricChars.push({ ch, line: i })));
  const heard: { ch: string; start: number; end: number }[] = [];
  for (const w of words) {
    const chars = Array.from(normalize(w.text));
    const step = (w.end - w.start) / Math.max(1, chars.length);
    chars.forEach((ch, k) => heard.push({ ch, start: w.start + k * step, end: w.start + (k + 1) * step }));
  }

  const { paired, exact } = overlapAlign(lyricChars.map((c) => c.ch), heard.map((c) => c.ch));
  const spans: ({ start: number; end: number } | null)[] = lines.map((line, i) => {
    const idx = lyricChars.map((c, k) => (c.line === i ? k : -1)).filter((k) => k >= 0);
    const hits = idx.filter((k) => exact[k]).map((k) => paired[k]);
    if (!idx.length || hits.length < Math.max(1, idx.length * MIN_LINE_COVERAGE)) return null;
    // Misheard first/last syllables still sit opposite the right audio, so let substitutions extend the edges.
    const edge = idx.map((k) => paired[k]).filter((j) => j >= 0);
    const firstExact = heard[hits[0]].start;
    const lastExact = heard[hits[hits.length - 1]].end;
    const first = edge.find((j) => heard[j].start >= firstExact - MAX_SUBSTITUTION_REACH) ?? hits[0];
    const last = [...edge].reverse().find((j) => heard[j].end <= lastExact + MAX_SUBSTITUTION_REACH) ?? hits[hits.length - 1];
    return { start: Math.max(window.start, heard[first].start - DISPLAY_LEAD), end: heard[last].end };
  });
  return fillGaps(lines, spans, heard, window);
}

/**
 * For each char of `a`: the index in `b` it sits opposite to (`paired`, match or substitution, -1 for a gap)
 * and whether that pair is an identical char (`exact`).
 */
function overlapAlign(a: string[], b: string[]): { paired: Int32Array; exact: Uint8Array } {
  const n = a.length;
  const m = b.length;
  const paired = new Int32Array(n).fill(-1);
  const exact = new Uint8Array(n);
  if (!n || !m) return { paired, exact };
  const w = m + 1;
  const score = new Float32Array((n + 1) * w);
  // 0 = stop, 1 = diagonal, 2 = up (skip a[i]), 3 = left (skip b[j])
  const trace = new Uint8Array((n + 1) * w);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = score[(i - 1) * w + j - 1] + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH);
      const up = score[(i - 1) * w + j] + GAP;
      const left = score[i * w + j - 1] + GAP;
      let best = diag;
      let dir = 1;
      if (up > best) {
        best = up;
        dir = 2;
      }
      if (left > best) {
        best = left;
        dir = 3;
      }
      score[i * w + j] = best;
      trace[i * w + j] = dir;
    }
  }
  // Free trailing gaps: finish anywhere on the last row or column.
  let bi = n;
  let bj = m;
  let best = -Infinity;
  for (let j = 0; j <= m; j++) if (score[n * w + j] > best) [best, bi, bj] = [score[n * w + j], n, j];
  for (let i = 0; i <= n; i++) if (score[i * w + m] > best) [best, bi, bj] = [score[i * w + m], i, m];

  let i = bi;
  let j = bj;
  while (i > 0 && j > 0) {
    const dir = trace[i * w + j];
    if (dir === 1) {
      paired[i - 1] = j - 1;
      exact[i - 1] = a[i - 1] === b[j - 1] ? 1 : 0;
      i--;
      j--;
    } else if (dir === 2) i--;
    else j--;
  }
  return { paired, exact };
}

type HeardChar = { ch: string; start: number; end: number };

/** Trailing lines may claim at most this many lyric chars per heard char before spilling past the window. */
const TAIL_CAPACITY = 1.25;

/**
 * Places lines the alignment couldn't trust. Where the recognizer still heard *something* (misheard
 * words are real vocal onsets), lines are mapped onto those heard chars by character position;
 * where nothing was heard, they are interpolated in time. Trailing lines that don't fit the heard
 * audio are pushed past the window (most likely sung later).
 */
function fillGaps(
  lines: string[],
  spans: ({ start: number; end: number } | null)[],
  heard: HeardChar[],
  window: { start: number; end: number },
): LyricCue[] {
  const chars = (i: number) => Math.max(1, Array.from(basicNormalize(lines[i])).length);
  const secs = (i: number) => chars(i) * SECONDS_PER_CHAR;
  const starts = spans.map((s) => (s ? s.start : NaN));

  for (let a = 0; a < lines.length; a++) {
    if (spans[a]) continue;
    let b = a;
    while (b < lines.length && !spans[b]) b++;
    const prev = a > 0 ? spans[a - 1] : null;
    const next = b < lines.length ? spans[b] : null;
    placeRun(a, b, prev ? prev.end : window.start, next ? next.start : window.end, !prev, !next);
    a = b;
  }

  function placeRun(a: number, b: number, from: number, to: number, leading: boolean, trailing: boolean): void {
    const run = Array.from({ length: b - a }, (_, k) => a + k);
    const total = run.reduce((sum, i) => sum + chars(i), 0);
    const voice = heard.filter((h) => h.start >= from && h.start < to);
    let overflowAt = b;

    // Only trust heard chars as a map if they actually span the gap; sparse blips would crush lines together.
    const spansGap = voice.length >= 2 && (trailing || voice[voice.length - 1].start - voice[0].start >= (to - from) * 0.5);
    if (spansGap) {
      const scale = trailing ? voice.length / Math.max(total, voice.length) : voice.length / total;
      let cum = 0;
      for (const i of run) {
        if (trailing && cum >= voice.length * TAIL_CAPACITY) {
          overflowAt = i;
          break;
        }
        const h = voice[Math.min(voice.length - 1, Math.floor(cum * scale))];
        starts[i] = Math.max(from, h.start - DISPLAY_LEAD);
        cum += chars(i);
      }
    } else if (leading && !trailing) {
      let t = to;
      for (let k = run.length - 1; k >= 0; k--) starts[run[k]] = t = Math.max(window.start, t - secs(run[k]));
    } else if (!trailing) {
      // Lyrics don't run through an instrumental break: start no earlier than the first voice heard in the gap.
      const begin = voice.length ? Math.max(from, voice[0].start - DISPLAY_LEAD) : from;
      let cursor = begin;
      for (const i of run) {
        starts[i] = cursor;
        cursor += ((to - begin) * chars(i)) / total;
      }
    } else {
      // Nothing heard after the last trusted line: sung later. Nothing heard at all: lay out from the start.
      overflowAt = a;
    }

    let t = leading && trailing && voice.length < 2 ? window.start : Math.max(from, window.end);
    for (let i = overflowAt; i < b; i++) {
      starts[i] = t;
      t += secs(i);
    }
  }

  return lines.map((text, i) => {
    const next = i + 1 < lines.length ? starts[i + 1] : Infinity;
    const ownEnd = spans[i] ? spans[i]!.end + 0.4 : starts[i] + secs(i);
    const end = Math.max(Math.min(next, ownEnd), Math.min(next, starts[i] + 1));
    return { start: starts[i], end, text };
  });
}
