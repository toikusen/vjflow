// Lyrics as a visitor brings them: plain text, LRC, or a mix. Nothing here assumes the text is well formed, since it
// can come from a file or from a public lyric database. Line timing that is missing is placed between neighbours.

export interface LyricLine {
  text: string;
  start?: number;
  /** An empty stamped line in LRC: the line above stops here (an instrumental break). */
  end?: number;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  title?: string;
  artist?: string;
  /** Lines left out: section labels such as [Chorus], and a line stamped at the same moment as another. */
  skipped: number;
}

export const MAX_LINES = 400;
export const MAX_LINE_CHARS = 200;
export const MAX_LYRIC_CHARS = 40000;
const MAX_LYRIC_BYTES = 1e6;
/** Under this two lines cannot both be read; the later one is pushed on (never dropped). */
export const MIN_LINE_GAP = 0.15;
/** Two LRC stamps closer than this are the one moment (an original and its translation): the first stays. */
const SAME_MOMENT = 0.1;
/** The pace an unstamped line is given, s a character, and the range a line's share stays in. */
const PACE = 0.3;
const SHARE_MIN = 1.5;
const SHARE_MAX = 5;

const TOKEN = /\[([^\]\n]*)\]/g;
const TIME = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/;
/** Digits and a colon that are not a time: a broken stamp, not words. */
const NEAR_TIME = /^\s*\d+\s*:/;
const ONLY_TOKEN = /^\[[^\]\n]*\]$/;
const WORD_STAMP = /<\d+:\d+(?:[.:]\d+)?>/g;
// C0/C1 controls and bidirectional overrides: never wanted in a line, and able to disguise what one says
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g;

/** A lyric file's text. Throws a clear message for what is not text in a known encoding. */
export function decodeLyricFile(bytes: ArrayBuffer) {
  if (bytes.byteLength > MAX_LYRIC_BYTES) throw new Error('這個檔案太大，不像歌詞檔。');
  const head = new Uint8Array(bytes.slice(0, 2));
  const utf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
  try {
    return new TextDecoder(utf16 ? 'utf-16' : 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('這個檔案不是 UTF-8 文字。請用記事本另存成 UTF-8 再匯入。');
  }
}

/** Text from outside with what can never belong in a lyric removed. */
export const cleanText = (text: string) => text.replace(UNSAFE, '');

const stampOf = (token: string) => {
  const m = TIME.exec(token.trim());
  if (!m || Number(m[2]) >= 60) return undefined;
  return Number(m[1]) * 60 + Number(m[2]) + Number(`0.${m[3] ?? '0'}`);
};

/** `[mm:ss.xx]`, rounded so 59.996 s carries into the minutes. */
export function stamp(t: number) {
  const cs = Math.round(Math.max(0, t) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `[${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}]`;
}

/** Lines back to text a person can edit, with the times they have. */
export const formatLines = (lines: readonly LyricLine[]) =>
  lines
    .flatMap((l, i) => {
      const next = lines[i + 1]?.start;
      const stop = l.end !== undefined && (next === undefined || l.end < next - SAME_MOMENT) ? [stamp(l.end)] : [];
      return [`${l.start === undefined ? '' : stamp(l.start)}${l.text}`, ...stop];
    })
    .join('\n');

/**
 * Plain text, LRC, or both in one text. Throws, naming the line, on a stamp that cannot be read. Stamped lines go in time
 * order and an unstamped line stays after the line it followed; a line stamped twice is sung twice.
 */
/** A Markdown heading line: `# Title`, `## Title`. */
export const HEADING = /^#{1,6}\s+(.+)$/;

export function parseLyrics(input: string): ParsedLyrics {
  const text = cleanText(input);
  if (text.length > MAX_LYRIC_CHARS) throw new Error(`歌詞太長（超過 ${MAX_LYRIC_CHARS} 字），請確認貼上的是一首歌。`);
  const tags = new Map<string, string>();
  const rows: { text: string; stamps: number[] }[] = [];
  let skipped = 0;
  for (const [n, raw] of text.split(/\r\n?|\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    // a heading (「# Title」 as lyrics sites and AI songwriters write them) names the song: it is never sung
    const heading = HEADING.exec(line);
    if (heading) {
      if (!tags.has('ti')) tags.set('ti', heading[1].trim());
      skipped++;
      continue;
    }
    if (ONLY_TOKEN.test(line) && !TIME.test(line.slice(1, -1).trim()) && !NEAR_TIME.test(line.slice(1, -1))) {
      const tag = /^([a-zA-Z]+)\s*:(.*)$/.exec(line.slice(1, -1));
      if (tag) tags.set(tag[1].toLowerCase(), tag[2].trim());
      else skipped++;
      continue;
    }
    const stamps: number[] = [];
    const words = line
      .replace(TOKEN, (whole, token: string) => {
        const t = stampOf(token);
        if (t !== undefined) {
          stamps.push(t);
          return '';
        }
        if (NEAR_TIME.test(token)) throw new Error(`第 ${n + 1} 行的時間看不懂：${whole}。格式是 [分:秒.百分秒]，例如 [01:23.45]。`);
        return whole;
      })
      .replace(WORD_STAMP, '')
      .trim();
    if ([...words].length > MAX_LINE_CHARS) throw new Error(`第 ${n + 1} 行太長（超過 ${MAX_LINE_CHARS} 字），請分成幾行，每行一句。`);
    rows.push({ text: words, stamps });
  }
  const offset = Number(tags.get('offset') ?? 0) / 1000 || 0;
  return { ...order(rows, offset, skipped), title: tags.get('ti') || undefined, artist: tags.get('ar') || undefined };
}

/** Rows to lines: a stamped row carries the unstamped rows after it wherever its stamps put it. */
function order(rows: { text: string; stamps: number[] }[], offset: number, skipped0: number) {
  type Group = { at: number; head: string; rest: string[] };
  const lead: string[] = [];
  const groups: Group[] = [];
  const open: Group[] = [];
  for (const r of rows) {
    if (r.stamps.length) {
      open.length = 0;
      for (const s of r.stamps) {
        const g = { at: Math.max(0, s - offset), head: r.text, rest: [] };
        groups.push(g);
        open.push(g);
      }
    } else if (r.text) (open.length ? open.forEach((g) => g.rest.push(r.text)) : lead.push(r.text));
  }
  groups.sort((a, b) => a.at - b.at);
  let skipped = skipped0;
  const lines: LyricLine[] = lead.map((text) => ({ text }));
  let last: number | undefined;
  for (const g of groups) {
    if (last !== undefined && g.at - last < SAME_MOMENT) {
      if (g.head) skipped++;
      continue;
    }
    last = g.at;
    if (g.head) lines.push({ text: g.head, start: g.at });
    else if (lines.length) {
      if (lines.at(-1)!.end === undefined && lines.at(-1)!.start !== undefined) lines.at(-1)!.end = g.at;
    }
    lines.push(...g.rest.map((text) => ({ text })));
  }
  if (lines.length > MAX_LINES) throw new Error(`歌詞太多行（${lines.length} 行，上限 ${MAX_LINES}），請確認貼上的是一首歌。`);
  return { lines, skipped };
}

const shareOf = (text: string) => Math.max(SHARE_MIN, Math.min(SHARE_MAX, [...text.replace(/\s/g, '')].length * PACE));

/** Starts through a run of unstamped lines, sharing the time from `from` to `to` by how long each is. */
const shared = (run: LyricLine[], first: number, from: number, to: number) => {
  const weights = [first, ...run.map((l) => shareOf(l.text))];
  const unit = (to - from) / weights.reduce((s, v) => s + v, 0);
  let at = from;
  return run.map((_, i) => (at += weights[i] * unit));
};

/**
 * Every line with a start: unstamped lines between their stamped neighbours by length, ones ahead of the first stamp or
 * after the last at reading pace, inside the song when its length is known. Undefined when no line has a time at all.
 */
export function placeLines(lines: readonly LyricLine[], duration?: number): (LyricLine & { placed: boolean })[] | undefined {
  const known = lines.flatMap((l, i) => (l.start === undefined ? [] : [i]));
  if (!known.length) return undefined;
  const out = lines.map((l) => ({ ...l, placed: l.start === undefined }));
  const set = (from: number, starts: number[]) => starts.forEach((t, k) => (out[from + k].start = t));
  const [first, last] = [known[0], known.at(-1)!];
  if (first > 0) {
    const need = lines.slice(0, first).reduce((s, l) => s + shareOf(l.text), 0);
    const room = lines[first].start!;
    const from = Math.max(0, room - need);
    set(0, [from, ...shared(lines.slice(1, first), shareOf(lines[0].text), from, room)]);
  }
  known.slice(0, -1).forEach((i, k) => {
    const j = known[k + 1];
    if (j > i + 1) set(i + 1, shared(lines.slice(i + 1, j), shareOf(lines[i].text), lines[i].start!, lines[j].start!));
  });
  if (last < lines.length - 1) {
    const tail = lines.slice(last + 1);
    const from = lines[last].start!;
    const need = [lines[last], ...tail].reduce((s, l) => s + shareOf(l.text), 0);
    const to = duration === undefined ? from + need : Math.min(from + need, Math.max(from, duration - 1));
    set(last + 1, shared(tail, shareOf(lines[last].text), from, to));
  }
  return out;
}

/** Lead before a draft's first line, s, and a draft's lines' shortest stay in beats. */
const DRAFT_LEAD = 0.4;
const DRAFT_MIN_BEATS = 2;

/**
 * A draft of times for lyrics with none: each line a whole number of beats at the assumed tempo, long enough to read by
 * its length, and squeezed to fit when the song's length is known.
 */
export function draftLines(lines: readonly LyricLine[], bpm: number, duration?: number): LyricLine[] {
  const beat = 60 / Math.max(40, Math.min(220, bpm));
  const stays = lines.map((l) => Math.max(DRAFT_MIN_BEATS, Math.ceil(shareOf(l.text) / beat)) * beat);
  const total = stays.reduce((s, v) => s + v, 0);
  const fit = duration === undefined ? 1 : Math.min(1, Math.max(0, duration - DRAFT_LEAD - 1) / Math.max(total, 1e-3));
  let at = DRAFT_LEAD;
  return lines.map((l, i) => {
    const start = +at.toFixed(3);
    at += stays[i] * fit;
    return { text: l.text, start };
  });
}

/** Lines the audio can hold, and how many start past its end (timed for another edit of the song, most likely). */
export function fitToAudio<T extends LyricLine>(lines: readonly T[], duration: number) {
  const kept = lines.filter((l) => (l.start ?? 0) < duration - MIN_LINE_GAP);
  return { kept, dropped: lines.length - kept.length };
}

/**
 * A song's lines as an .lrc file, for subtitles or another editor. With a range (a part exported alone), only the lines
 * sung in it, timed from its start like the video they go with.
 */
export function songLrc(song: { title: string; cues: readonly { text: string; start: number; end: number }[] }, from = 0, to = Infinity) {
  const lines = song.cues.filter((c) => c.end > from && c.start < to).map((c) => ({ text: c.text, start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from }));
  return `[ti:${song.title}]\n${formatLines(lines)}\n`;
}
