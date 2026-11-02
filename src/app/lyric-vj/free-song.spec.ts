import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { parseLrc, songFromLines, songFromLrc } from './free-song';

const LRC = '[ar:someone]\n[00:12.50]第一句歌詞\n[00:18]第二句\n沒有時間的行\n[00:30.00][01:10.25]重複的句子\n';

describe('parseLrc', () => {
  it('reads stamped lines in time order and leaves the rest out', () => {
    const lines = parseLrc(LRC);
    expect(lines.map((l) => l.text)).toEqual(['第一句歌詞', '第二句', '重複的句子', '重複的句子']);
    expect(lines[0].start).toBe(12.5);
    expect(lines[3].start).toBeCloseTo(70.25);
  });
});

describe('stamps', () => {
  it('keeps one line of two stamped at one moment', () => {
    expect(parseLrc('[00:05.00]甲\n[00:05.02]乙\n[00:09.00]丙').map((l) => l.text)).toEqual(['甲', '丙']);
  });
});

describe('songFromLrc', () => {
  it('makes a song the composer can plan with no analysis', () => {
    const song = songFromLrc(LRC, { title: 'x', bpm: 120 });
    expect(song.cues[0].end).toBeCloseTo(17.95);
    expect(song.cues[2].end).toBe(36);
    expect(song.beats[1]).toBe(0.5);
    expect(song.duration).toBeCloseTo(76.25);
    const { job } = freeJob(song);
    expect(job.treatment.cues.length).toBe(4);
  });
  it('says what is wrong with lyrics that have no times', () => {
    expect(() => songFromLrc('只有文字', { title: 'x', bpm: 120 })).toThrow('[00:12.50]');
  });
});

describe('songFromLines', () => {
  const rhythm = { tempo: 96, beats: [0.3, 0.925, 1.55], downbeats: [0.3], beatStrength: [1, 0.5, 0.5], confidence: 0.4 };
  it('takes beats found in the audio over the even grid', () => {
    const song = songFromLines([{ start: 1, text: '甲' }], { title: 'x', bpm: 120, duration: 30, exact: true, rhythm });
    expect(song.tempo).toBe(96);
    expect(song.beats).toEqual(rhythm.beats);
    expect(song.beatStrength).toEqual(rhythm.beatStrength);
  });
  it('lays an even grid when the audio gave none', () => {
    expect(songFromLines([{ start: 1, text: '甲' }], { title: 'x', bpm: 120, duration: 30 }).beats[1]).toBe(0.5);
  });
  it('ends with the audio when told its length is exact', () => {
    const song = songFromLines([{ start: 27, text: '甲' }], { title: 'x', bpm: 120, duration: 30, exact: true });
    expect(song.duration).toBe(30);
    expect(song.cues[0].end).toBeCloseTo(29.95);
  });
  it('stops a line where the lyrics say it stops', () => {
    expect(songFromLines([{ start: 1, end: 3, text: '甲' }, { start: 20, text: '乙' }], { title: 'x', bpm: 120 }).cues[0].end).toBe(3);
  });
  it('spreads lines too close to read instead of dropping them', () => {
    const song = songFromLines([{ start: 5, text: '甲' }, { start: 5, text: '乙' }, { start: 5.05, text: '丙' }], { title: 'x', bpm: 120 });
    expect(song.cues.map((c) => c.start)).toEqual([5, 5.15, 5.3]);
    expect(song.cues.every((c) => c.end > c.start)).toBe(true);
  });
  it('keeps an end a person set past the longest an unset line stays', () => {
    const song = songFromLines([{ start: 1, end: 12, text: '甲' }, { start: 20, text: '乙' }], { title: 'x', bpm: 120 });
    expect(song.cues[0].end).toBe(12);
  });
});
