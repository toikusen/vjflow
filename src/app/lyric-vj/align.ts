// Lyric timing from ASR: Whisper word timestamps on the vocal stem, aligned character by character (LCS) to the
// known lyric lines. Lines with enough matched characters are 'aligned'; the rest are placed between their neighbours
// ('interpolated').
import { phraseStarts, TimelineCue } from './timeline';
import { checkLines, ISSUE_LABEL } from './timing-qa';

/**
 * A lyric line as it should appear on screen: fan calls in brackets marked 📣 (e.g. "(📣はるちゃん)") and part
 * markers (member-colour hearts, emoji) are lyric-site annotations, not sung text.
 */
export function cleanLyricLine(line: string): string {
  return line
    .replace(/[(（][^()（）]*📣[^()（）]*[)）]/gu, '')
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AsrWord {
  text: string;
  start: number;
  end: number;
}

// part markers in idol lyrics (🤍🩷 member colours, 📣 calls) are not sung
const strip = (s: string) => [...s.replace(/[\s　、。,.!?！？「」『』()（）~〜…・\-"'“”]|[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').toLowerCase()];

/** Every ASR character with its time (characters of a word share its span evenly). */
function asrChars(words: AsrWord[]): { ch: string; t: number }[] {
  return words.flatMap((w) => {
    const cs = strip(w.text);
    const dt = (w.end - w.start) / Math.max(1, cs.length);
    return cs.map((ch, i) => ({ ch, t: w.start + i * dt }));
  });
}

/** Longest common subsequence pairs (i in a, j in b), in order. O(n·m) memory as bytes: fine for one song. */
export function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const len = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      len[at(i, j)] = a[i] === b[j] ? len[at(i + 1, j + 1)] + 1 : Math.max(len[at(i + 1, j)], len[at(i, j + 1)]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (len[at(i + 1, j)] >= len[at(i, j + 1)]) i++;
    else j++;
  }
  return out;
}

const MIN_MATCH = 0.35; // share of a line's characters that must be heard for its time to be trusted

/**
 * Cues for `lines` timed from `words`. A line starts at its first matched character, shifted back by the
 * characters before it at the line's own pace, and ends where the next line starts (or its last matched character).
 */
export function alignLyrics(lines: string[], words: AsrWord[], duration: number): TimelineCue[] {
  const asr = asrChars(words);
  const lineChars = lines.map(strip);
  const flat: { line: number; k: number; ch: string }[] = lineChars.flatMap((cs, line) => cs.map((ch, k) => ({ line, k, ch })));
  const pairs = lcsPairs(flat.map((x) => x.ch), asr.map((x) => x.ch));
  const hits = lines.map(() => [] as { k: number; t: number }[]);
  for (const [i, j] of pairs) hits[flat[i].line].push({ k: flat[i].k, t: asr[j].t });

  const timed = lines.map((_, li) => {
    // stray matches far from the rest of the line (a character heard elsewhere, or a misplaced Whisper word): split
    // the matches at gaps over 1.5 s and keep the biggest group
    const groups: { k: number; t: number }[][] = [];
    for (const x of hits[li]) {
      const g = groups[groups.length - 1];
      if (g && x.t - g[g.length - 1].t <= 1.5) g.push(x);
      else groups.push([x]);
    }
    const h = groups.reduce((best, g) => (g.length > best.length ? g : best), [] as { k: number; t: number }[]);
    const n = lineChars[li].length;
    if (!n || h.length / n < MIN_MATCH) return undefined;
    // the character pace inside this line, to place unheard leading/trailing characters
    const pace = h.length > 1 ? Math.min(0.5, Math.max(0.06, (h[h.length - 1].t - h[0].t) / Math.max(1, h[h.length - 1].k - h[0].k))) : 0.2;
    // unheard leading characters move the start back, at most 0.6 s (long notes overstate the pace)
    return { start: Math.max(0, h[0].t - Math.min(0.6, h[0].k * Math.min(pace, 0.2))), last: h[h.length - 1].t + (n - 1 - h[h.length - 1].k + 1) * pace };
  });
  // keep the aligned anchors monotonic: a line that lands before the previous anchor is a mismatch
  let prev = -1;
  for (let i = 0; i < timed.length; i++) {
    const x = timed[i];
    if (!x) continue;
    if (x.start <= prev) timed[i] = undefined;
    else prev = x.start;
  }
  const starts = timed.map((x) => x?.start);
  // unaligned lines: spread evenly by character count between the neighbouring anchors
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] !== undefined) continue;
    let j = i;
    while (j < starts.length && starts[j] === undefined) j++;
    const a = i > 0 ? (timed[i - 1]?.last ?? starts[i - 1]!) : 0;
    const b = j < starts.length ? starts[j]! : Math.min(duration, a + (j - i) * 3);
    const weights = lineChars.slice(i, j).map((c) => Math.max(1, c.length));
    const total = weights.reduce((s, w) => s + w, 0);
    let acc = 0;
    for (let k = i; k < j; k++) {
      starts[k] = a + ((b - a) * acc) / total;
      acc += weights[k - i];
    }
    i = j - 1;
  }
  return lines.map((text, i) => {
    const start = starts[i]!;
    const next = i + 1 < lines.length ? starts[i + 1]! : duration;
    const end = Math.min(next, Math.max(start + 0.5, timed[i]?.last ?? next));
    return {
      id: `c${String(i + 1).padStart(3, '0')}`,
      start: +start.toFixed(3),
      end: +end.toFixed(3),
      text,
      timingSource: 'whisper' as const,
      confidence: timed[i] ? ('aligned' as const) : ('interpolated' as const),
    };
  });
}

/**
 * Moves aligned cue starts to the nearest point where singing resumes (vocal-stem phrase starts) within
 * -0.4..+0.8 s: Whisper word starts run early, the stem says when the voice actually comes in.
 */
export function snapToPhrases(cues: TimelineCue[], phrases: number[]): TimelineCue[] {
  const out = cues.map((c) => ({ ...c }));
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c.confidence !== 'aligned') continue;
    const lo = Math.max(c.start - 0.4, i > 0 ? out[i - 1].start + 0.3 : 0);
    const cand = phrases.filter((p) => p >= lo && p <= c.start + 0.8);
    if (!cand.length) continue;
    const p = cand.reduce((best, x) => (Math.abs(x - c.start) < Math.abs(best - c.start) ? x : best));
    c.start = +p.toFixed(3);
    if (i > 0) out[i - 1].end = Math.min(out[i - 1].end, c.start);
    c.end = Math.max(c.end, c.start + 0.5);
  }
  return out;
}

/**
 * Line ends from the vocal stem: a line stays until its singing stops (+0.3 s hold), never past the next line, and a
 * raw end that runs into an instrumental is pulled back to where the voice stopped. `active` is 100 fps.
 */
export function endsFromVocals<T extends { start: number; end: number }>(cues: T[], active: boolean[], fps = 100): T[] {
  return cues.map((c, i) => {
    const next = cues[i + 1]?.start ?? active.length / fps;
    const limit = Math.min(next, c.end + 1.5);
    let last = -1;
    for (let f = Math.floor(c.start * fps); f < Math.floor(limit * fps); f++) if (active[f]) last = f;
    if (last < 0) return c;
    const end = Math.min(next, last / fps + 0.3);
    return { ...c, end: +Math.max(c.start + 0.5, end).toFixed(3) };
  });
}

export interface ForcedLine {
  start: number;
  end: number;
  /** Mean word probability from the aligner (0..1). */
  conf: number;
}

/** Below this the aligner was guessing: indigo's two misplaced lines scored 0.10 and 0.41, correct ones mostly ≥ 0.7. */
export const MIN_FORCED_CONF = 0.5;

/**
 * Line timing from two independent aligners and the vocal stem. Forced alignment (known text placed on the audio)
 * leads; the transcribe-and-match result (`heard`) backs it up. A line passes on its own only if the aligner was sure,
 * the two agree (when both have it), the order holds and the vocal stem confirms start and end; otherwise it keeps
 * the best guess and lists why it needs a human check.
 */
export function combineTimings(lines: string[], forced: ForcedLine[], heard: TimelineCue[], active: boolean[], fps = 100): TimelineCue[] {
  if (forced.length !== lines.length) return heard.map((c) => ({ ...c, review: [...(c.review ?? []), '強制對齊失敗，只有聽寫結果'] }));
  let prev = -Infinity;
  const cues: TimelineCue[] = lines.map((text, i) => {
    const f = forced[i];
    const h = heard[i];
    const review: string[] = [];
    let start = f.start;
    let end = f.end;
    const heardOk = h?.confidence === 'aligned';
    let altStart: number | undefined;
    if (f.conf < MIN_FORCED_CONF) {
      review.push('對齊信心低');
      if (heardOk) [start, end] = [h.start, h.end];
    } else if (heardOk && Math.abs(h.start - f.start) > 0.8) {
      review.push('兩種對齊結果不一致');
      altStart = +h.start.toFixed(3);
    }
    if (start <= prev) {
      review.push('順序錯亂');
      if (heardOk && h.start > prev) [start, end] = [h.start, h.end];
    }
    prev = Math.max(prev, start);
    return {
      id: `c${String(i + 1).padStart(3, '0')}`,
      start: +start.toFixed(3),
      end: +Math.max(start + 0.5, end).toFixed(3),
      text,
      timingSource: 'whisper' as const,
      confidence: 'aligned' as const,
      review,
      ...(altStart !== undefined ? { altStart } : {}),
    };
  });
  const refined = endsFromVocals(snapToPhrases(cues, phraseStarts(active, fps)), active, fps);
  const checks = checkLines(refined, active);
  return refined.map((c, i) => {
    const review = [...(c.review ?? []), ...checks[i].issues.map((k) => ISSUE_LABEL[k])];
    return review.length ? { ...c, review } : { ...c, review: undefined };
  });
}
