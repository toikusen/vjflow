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
    // a word stretched over silence (the aligner hangs a line's first word on the gap before it) is sung at its end
    if (dt > 0.8) return cs.map((ch, i) => ({ ch, t: w.end - 0.3 * (cs.length - i) }));
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

/**
 * When each character of a line is sung: the aligner's word times, matched character by character (LCS) to the line,
 * gaps filled from neighbours, shifted so the first character lands on the line's (possibly hand-edited) start and
 * kept inside the line. Times are per code point of `text`.
 */
export function charStartsFor(text: string, words: AsrWord[], start: number, end: number): number[] {
  return charTiming(text, words, start, end).charStarts;
}

/**
 * Per-character times from forced-alignment words. When the first sung character lands up to 1 s after the line's
 * start, the line start moves to it (the line was timed early) instead of the characters shifting back to it.
 * `trusted`: at least 70 % of the characters were matched to the audio, so word-level cuts can follow them.
 */
export function charTiming(text: string, words: AsrWord[], start: number, end: number): { start: number; end: number; charStarts: number[]; trusted: boolean } {
  const chars = [...text];
  const heard = asrChars(words);
  const times: (number | undefined)[] = chars.map(() => undefined);
  const plain = chars.map((c) => strip(c)[0] ?? '');
  const idx = plain.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  for (const [i, j] of lcsPairs(idx.map((i) => plain[i]), heard.map((h) => h.ch))) times[idx[i]] = heard[j].t;
  // fill unmatched characters by interpolating between matched neighbours (or the line edges)
  const known = times.map((t, i) => (t === undefined ? -1 : i)).filter((i) => i >= 0);
  if (!known.length) return { start, end, trusted: false, charStarts: chars.map((_, i) => +(start + ((end - start) * 0.8 * i) / Math.max(1, chars.length)).toFixed(3)) };
  const late = times[known[0]]! - start;
  if (late >= 0 && late <= 1 && times[known[0]]! < end - 0.3) start = times[known[0]]!;
  const shift = start - times[known[0]]!;
  let jumps = 0;
  const out = chars.map((_, i) => {
    if (times[i] !== undefined) return times[i]! + shift;
    const a = known.filter((k) => k < i).pop();
    const b = known.find((k) => k > i);
    if (a === undefined) return start;
    if (b === undefined) return times[a]! + shift;
    return times[a]! + shift + ((times[b]! - times[a]!) * (i - a)) / (b - a);
  });
  // a jump of more than 2 s inside a line is a character matched to a later occurrence (け of the next line):
  // it follows the previous character instead
  let prev = start;
  const charStarts = out.map((t, i) => {
    const jump = i > 0 && t - prev > 2;
    if (jump) jumps++;
    const v = jump ? prev + 0.25 : t;
    return +(prev = Math.min(end - 0.05, Math.max(prev, v))).toFixed(3);
  });
  // a line ends shortly after its last sung character: the aligner stretches the last word over the following
  // instrumental (sweet timer: 夜明けまで越えていけ held 20 s into the interlude)
  const sungEnd = charStarts.length ? charStarts[charStarts.length - 1] + 0.8 : end;
  // only a clear overrun is cut: a held last note (up to ~3 s) keeps the line up
  return { start, end: end - sungEnd > 3 ? Math.max(start + 0.6, sungEnd) : end, charStarts, trusted: jumps === 0 && known.length >= 0.7 * idx.length };
}

/** A bracketed aside — (ふっふー), （I got it） — is a call or backing part: never fed to the aligner. */
export const withoutAsides = (text: string) => text.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim();

/** A shout between lines (てぇてぇ～, にゃにゃ): at most 5 visible characters once asides are removed. */
export const isShout = (text: string) => [...withoutAsides(text).replace(/[\s\p{P}～〜ー~♪]/gu, '')].length <= 5;

/**
 * Times lines from a forced alignment of the MAIN lines only (asides removed, shouts left out: both made the aligner
 * drift and push every following line late), then:
 * - each main line starts at the onset of the voiced stretch holding its aligned start (up to 0.3 s earlier);
 * - each shout takes the last voiced stretch before the next main line, after the previous one;
 * - lines end where the next one starts (or keep their end before a long gap).
 * `main` holds one aligned line per main cue, in order; `spans` are the vocal stem's voiced stretches.
 */
export function alignMainLines(cues: TimelineCue[], main: { words: AsrWord[]; start: number }[], spans: [number, number][]): TimelineCue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const mains = sorted.filter((c) => !isShout(c.text));
  if (mains.length !== main.length) return cues;
  const timed = new Map<string, { start: number; charStarts: number[]; trusted: boolean; lastEnd: number }>();
  let prevEnd = 0;
  mains.forEach((c, i) => {
    const line = main[i];
    const s0 = line.words[0]?.start ?? line.start;
    const holder = spans.filter(([s]) => s <= s0 + 0.1 && s >= s0 - 0.3 && s > prevEnd - 0.05).at(-1);
    const start = holder ? Math.min(holder[0], s0) : s0;
    const r = charTiming(c.text, line.words, start, Math.max(start + 0.5, c.end, line.words.at(-1)?.end ?? start + 1));
    const lastEnd = line.words.at(-1)?.end ?? r.charStarts.at(-1) ?? start;
    // two main lines landing on one start: the aligner collapsed them — leave it to the editor
    const collapsed = i > 0 && Math.abs(start - (timed.get(mains[i - 1].id)?.start ?? -9)) < 0.25;
    timed.set(c.id, { start, charStarts: r.charStarts.map((x) => Math.max(start, x)), trusted: r.trusted && !collapsed, lastEnd });
    prevEnd = lastEnd;
  });
  const out: TimelineCue[] = sorted.map((c, i) => {
    const t = timed.get(c.id);
    if (t) return { ...c, start: +t.start.toFixed(3), charStarts: t.charStarts, charTimed: t.trusted, review: t.trusted ? c.review?.filter((x) => x !== '對齊信心低') : [...new Set([...(c.review ?? []), '對齊信心低'])] };
    const prevMain = sorted.slice(0, i).reverse().find((x) => timed.has(x.id));
    const nextMain = sorted.slice(i + 1).find((x) => timed.has(x.id));
    const lo = prevMain ? timed.get(prevMain.id)!.lastEnd : 0;
    const hi = nextMain ? timed.get(nextMain.id)!.start : Infinity;
    const span = spans.filter(([s, e]) => e > lo - 0.3 && s < hi - 0.25 && e - s > 0.12).at(-1);
    const start = span ? Math.max(span[0], lo - 0.3) : c.start;
    return { ...c, start: +start.toFixed(3), charStarts: undefined, charTimed: false };
  });
  // ends: up to the next line, or the line's own end before a long gap
  return out.map((c, i) => {
    const next = out[i + 1];
    const last = c.charStarts?.at(-1) ?? c.start;
    const end = next && next.start - last < 3 ? next.start : Math.max(last + 0.8, Math.min(c.end, next ? next.start : c.end));
    return { ...c, end: +Math.max(c.start + 0.3, end).toFixed(3) };
  });
}
