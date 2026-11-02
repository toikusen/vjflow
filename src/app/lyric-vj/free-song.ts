// A song from timed lyrics: lines tapped or from LRC, beats found in the audio or laid evenly from a tempo, no sections.
// All the free flow needs of a song it has no analysis for.
import type { Rhythm } from './beat-detect';
import { MIN_LINE_GAP } from './free-lyrics';
import type { SongTimeline } from './timeline';

const STAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

/** `[mm:ss.xx] words` lines, in time order; a line with several stamps is sung at each. Lines without a stamp are left out. */
export function parseLrc(text: string): { start: number; text: string }[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const words = line.replace(STAMP, '').replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();
      return words ? [...line.matchAll(STAMP)].map((m) => ({ start: Number(m[1]) * 60 + Number(m[2].replace(':', '.')), text: words })) : [];
    })
    .sort((a, b) => a.start - b.start)
    // two lines stamped at one moment cannot both be sung: the first stays
    .filter((l, i, all) => i === 0 || l.start - all[i - 1].start >= 0.1);
}

/** The longest a line with no end of its own stays when the next one is far off, s: past this it is an instrumental, not a held line. */
const LINE_MAX = 6;

export interface SongOptions {
  title: string;
  /** The tempo for an even grid, when there is no rhythm. */
  bpm: number;
  /** The song's length. A line past it stretches the song, unless `exact`. */
  duration?: number;
  /** `duration` is the audio's own: the song is exactly that long, and a video ends with its sound. */
  exact?: boolean;
  /** Beats found in the audio (beat-detect.ts). */
  rhythm?: Rhythm;
}

/** Beats laid evenly from a tempo: the fallback when the audio gives none. */
function evenBeats(bpm: number, duration: number) {
  const step = 60 / Math.max(40, Math.min(220, bpm));
  const beats = Array.from({ length: Math.floor(duration / step) }, (_, i) => +(i * step).toFixed(3));
  return { tempo: 60 / step, beats, downbeats: beats.filter((_, i) => i % 4 === 0) };
}

/** A song from lines that all have a start, in order. Lines closer than can be read are spread, never dropped. */
export function songFromLines(lines: readonly { start?: number; end?: number; text: string }[], o: SongOptions): SongTimeline {
  if (!lines.length) throw new Error('沒有歌詞');
  const starts: number[] = [];
  for (const l of lines) starts.push(Math.max(l.start ?? 0, (starts.at(-1) ?? -MIN_LINE_GAP) + MIN_LINE_GAP));
  const lastStart = starts.at(-1)!;
  const duration = o.exact && o.duration ? o.duration : Math.max(o.duration ?? 0, lastStart + LINE_MAX);
  const cues = lines.map((l, i) => {
    const next = starts[i + 1] ?? duration;
    return { id: `c${String(i + 1).padStart(3, '0')}`, start: +starts[i].toFixed(3), end: +Math.min(next - 0.05, l.end ?? starts[i] + LINE_MAX).toFixed(3), text: l.text };
  });
  const rhythm = o.rhythm ? { tempo: o.rhythm.tempo, beats: o.rhythm.beats, downbeats: o.rhythm.downbeats, beatStrength: o.rhythm.beatStrength } : evenBeats(o.bpm, duration);
  return { title: o.title, duration, ...rhythm, sections: [], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
}

export function songFromLrc(lrc: string, o: SongOptions): SongTimeline {
  const lines = parseLrc(lrc);
  if (!lines.length) throw new Error('沒有讀到帶時間的歌詞。格式是一行一句，例如 [00:12.50] 第一句歌詞');
  return songFromLines(lines, o);
}
