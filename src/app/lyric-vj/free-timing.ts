// What the free tier knows about its lines beyond their times, and how the work survives a reload. The lyric box stays
// the one copy of the times; a mark says where a line's time came from, by position in the box.
import { reflow } from '../pages/timing/timing-edit';
import { LyricLine, MAX_LYRIC_CHARS, MIN_LINE_GAP } from './free-lyrics';
import type { SongTimeline, TimelineCue } from './timeline';

/** `set`: a person placed it. `guess`: estimated and not looked at yet. Empty: as its LRC gave it. */
export type LineMark = '' | 'set' | 'guess';

export const ESTIMATED = '時間是估算的';

/** The song as the timing editor opens it: lines still estimated carry a note, and lines already set are settled. */
export function editorSeed(song: SongTimeline, marks: readonly LineMark[]) {
  const cues: TimelineCue[] = song.cues.map((c, i) => ({ ...c, timingSource: 'lrc', confidence: 'interpolated', ...(marks[i] === 'guess' ? { review: [ESTIMATED] } : {}) }));
  return { song: { ...song, cues }, settled: new Set(cues.filter((_, i) => marks[i] === 'set').map((c) => c.id)) };
}

export const marksOf = (cues: readonly TimelineCue[], settled: ReadonlySet<string>): LineMark[] => cues.map((c) => (settled.has(c.id) ? 'set' : c.review?.length ? 'guess' : ''));

/**
 * The editor's lines as the lyric box holds them. They go through text, where two stamps closer than a moment are one
 * line, so they are spread first; an end close to the next start says nothing the next start does not say.
 */
export function appliedLines(cues: readonly TimelineCue[], duration: number): LyricLine[] {
  const lines = reflow(cues, duration);
  return lines.map((c, i) => ({ text: c.text, start: c.start, ...(i + 1 < lines.length && c.end >= lines[i + 1].start - MIN_LINE_GAP ? {} : { end: c.end }) }));
}

export interface Work {
  lrc: string;
  title: string;
  styleId: string;
  seed?: number;
  marks: LineMark[];
}

export interface LastWork {
  name: string;
  size: number;
}

type Store = () => Pick<Storage, 'getItem' | 'setItem'>;

const LAST_KEY = 'free-work-last';
const workKey = (a: LastWork) => `free-work:${a.size}:${a.name}`;

const parsed = (store: Store, key: string): Record<string, unknown> | undefined => {
  try {
    const v: unknown = JSON.parse(store().getItem(key) ?? 'null');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const browser: Store = () => localStorage;

/** Stores the work of this audio file; false when the browser would not keep it (blocked, full). */
export function saveWork(audio: LastWork, work: Work, store = browser) {
  try {
    store().setItem(workKey(audio), JSON.stringify(work));
    store().setItem(LAST_KEY, JSON.stringify(audio));
    return true;
  } catch {
    return false;
  }
}

/** The stored work of this audio file; anything malformed or from elsewhere reads as none. */
export function loadWork(audio: LastWork, store = browser): Work | undefined {
  const v = parsed(store, workKey(audio));
  if (typeof v?.['lrc'] !== 'string' || v['lrc'].length > MAX_LYRIC_CHARS || !Array.isArray(v['marks'])) return undefined;
  const seed = v['seed'];
  return {
    lrc: v['lrc'],
    title: typeof v['title'] === 'string' ? v['title'] : '',
    styleId: typeof v['styleId'] === 'string' ? v['styleId'] : '',
    ...(Number.isSafeInteger(seed) ? { seed: seed as number } : {}),
    marks: v['marks'].map((m: unknown) => (m === 'set' || m === 'guess' ? m : '')),
  };
}

/** The audio file last worked on: a page cannot get the file back, only say which to pick. */
export function lastWork(store = browser): LastWork | undefined {
  const v = parsed(store, LAST_KEY);
  return typeof v?.['name'] === 'string' && Number.isSafeInteger(v['size']) ? { name: v['name'], size: v['size'] as number } : undefined;
}
