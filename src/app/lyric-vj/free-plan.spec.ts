import { describe, expect, it } from 'vitest';
import { freeJob, isCalm, validMeaning } from './free-plan';
import type { SongTimeline } from './timeline';

const lines = ['我走過那條路', '風吹過你的臉', '天亮了我還在等', '夜裡的光慢慢熄滅', '我們說好不回頭', '你的名字還在這裡'];
const cues = lines.map((text, i) => ({ id: `c${i + 1}`, start: 8 + i * 5, end: 12 + i * 5, text }));
const song = { title: 'A - B', duration: 45, tempo: 100, beats: Array.from({ length: 75 }, (_, i) => i * 0.6), downbeats: [], sections: [], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;

describe('freeJob', () => {
  it('needs no reading and no sections', () => {
    const { job, palette } = freeJob(song);
    expect(palette).toBe(isCalm(cues) ? 'frost' : 'tea');
    expect(job.treatment.cues.length).toBe(6);
    expect(job.treatment.graphics?.sections.length).toBeGreaterThan(0);
    expect(job.meta?.title).toBe('B');
  });
  it('gives the same job for the same seed, another for another', () => {
    expect(JSON.stringify(freeJob(song, { seed: 2 }).job)).toBe(JSON.stringify(freeJob(song, { seed: 2 }).job));
    expect(freeJob(song, { seed: 1 }).palette).not.toBe(freeJob(song, { seed: 2 }).palette);
    expect(freeJob(song, { seed: 1 }).job.treatment.design?.reroll).toBe(1);
    expect(freeJob(song).job.treatment.design?.reroll).toBeUndefined();
  });
  it('keeps a stored reading to what the song has', () => {
    const m = { palette: 'tide', ground: 'grain', reading: '', parts: [{ from: 'nope', tension: 2, fx: [], what: '' }, { from: 'c2', tension: 2, fx: [], what: '' }], keys: [{ cue: 'c1', phrase: '不在歌裡' }] };
    const v = validMeaning(m, cues)!;
    expect(v.parts.length).toBe(1);
    expect(v.parts[0].from).toBe('c1');
    expect(v.parts[0].tension).toBe(1);
    expect(v.keys).toEqual([]);
    expect(validMeaning({ ...m, palette: 'none' }, cues)).toBeUndefined();
  });
});
