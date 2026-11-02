import { describe, expect, it } from 'vitest';
import { formatLines, parseLyrics, placeLines } from './free-lyrics';
import { songFromLines } from './free-song';
import { appliedLines, editorSeed, ESTIMATED, lastWork, loadWork, marksOf, saveWork, Work } from './free-timing';
import type { SongTimeline, TimelineCue } from './timeline';

const cue = (id: string, start: number, end: number, text = id): TimelineCue => ({ id, start, end, text, timingSource: 'lrc', confidence: 'interpolated' });
const memory = () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  return { m, of: () => store };
};
const audio = { name: 'a.mp3', size: 7 };
const work: Work = { lrc: '[00:01.00]甲', title: 't', styleId: 's', seed: 2, marks: ['set', 'guess', ''] };

/** The way a line goes from the editor to the composer: through the lyric box. */
const throughTheBox = (cues: TimelineCue[], duration: number) => {
  const { lines } = parseLyrics(formatLines(appliedLines(cues, duration)));
  return songFromLines(placeLines(lines, duration)!, { title: 'x', bpm: 120, duration, exact: true }).cues;
};

describe('editorSeed', () => {
  const song = { cues: [cue('c1', 1, 2), cue('c2', 3, 4), cue('c3', 5, 6)] } as unknown as SongTimeline;
  it('notes the estimated lines and settles the set ones', () => {
    const { song: seeded, settled } = editorSeed(song, ['set', 'guess', '']);
    expect(seeded.cues.map((c) => c.review)).toEqual([undefined, [ESTIMATED], undefined]);
    expect([...settled]).toEqual(['c1']);
  });
  it('gets the marks back from the editor', () => {
    const { song: seeded, settled } = editorSeed(song, ['', 'guess', 'guess']);
    expect(marksOf(seeded.cues, new Set([...settled, 'c2']))).toEqual(['', 'set', 'guess']);
  });
});

describe('appliedLines through the lyric box', () => {
  it('keeps the starts and ends a person set, long lines included', () => {
    const got = throughTheBox([cue('a', 1.25, 3), cue('b', 10, 22.5), cue('c', 30, 33)], 100);
    expect(got.map((c) => [c.start, c.end])).toEqual([[1.25, 3], [10, 22.5], [30, 33]]);
  });
  it('never loses a line to the box reading two stamps as one moment', () => {
    const got = throughTheBox([cue('a', 10, 10.1), cue('b', 10.1, 10.2), cue('c', 10.2, 10.3), cue('d', 10.3, 12)], 100);
    expect(got.map((c) => c.text)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not let a rounded end swallow the next line', () => {
    const got = throughTheBox([cue('a', 8, 10.004), cue('b', 10.1045, 12)], 100);
    expect(got.map((c) => c.text)).toEqual(['a', 'b']);
  });
  it('keeps a line a large move carried past the end of the audio', () => {
    const got = throughTheBox([cue('a', 90, 95), cue('b', 104, 106)], 100);
    expect(got.map((c) => c.text)).toEqual(['a', 'b']);
  });
});

describe('work across a reload', () => {
  it('comes back for the same file and only that file', () => {
    const s = memory();
    expect(saveWork(audio, work, s.of)).toBe(true);
    expect(loadWork(audio, s.of)).toEqual(work);
    expect(loadWork({ ...audio, size: 8 }, s.of)).toBeUndefined();
    expect(loadWork({ ...audio, name: 'b.mp3' }, s.of)).toBeUndefined();
    expect(lastWork(s.of)).toEqual(audio);
  });
  it('says so when the browser refuses, and reads as nothing when it cannot be read', () => {
    const broken = () => {
      throw new Error('blocked');
    };
    expect(saveWork(audio, work, broken)).toBe(false);
    expect(loadWork(audio, broken)).toBeUndefined();
    expect(lastWork(broken)).toBeUndefined();
  });
  it('reads malformed storage as nothing', () => {
    const s = memory();
    saveWork(audio, work, s.of);
    for (const key of s.m.keys()) s.m.set(key, '{"lrc":7');
    expect(loadWork(audio, s.of)).toBeUndefined();
    expect(lastWork(s.of)).toBeUndefined();
    for (const key of s.m.keys()) s.m.set(key, '{"lrc":"x"}');
    expect(loadWork(audio, s.of)).toBeUndefined();
  });
  it('keeps only known marks', () => {
    const s = memory();
    saveWork(audio, { ...work, marks: ['set', 'x' as never] }, s.of);
    expect(loadWork(audio, s.of)?.marks).toEqual(['set', '']);
  });
});
