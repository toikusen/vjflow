import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { SongTimeline } from './timeline';
import { TreatmentV3, validateTreatment } from './treatment';

const song: SongTimeline = {
  title: 't', duration: 30, tempo: 120,
  beats: Array.from({ length: 60 }, (_, i) => i * 0.5),
  downbeats: Array.from({ length: 15 }, (_, i) => i * 2),
  sections: [], energy: [], energyFps: 10,
  cues: [
    { id: 'c001', start: 10.1, end: 12.9, text: '光る星　夜空', timingSource: 'lrclib', confidence: 'verified' },
    { id: 'c002', start: 13.0, end: 15.9, text: '進む先', timingSource: 'lrclib', confidence: 'verified' },
    { id: 'c003', start: 16.0, end: 19.0, text: '胸に灯す光', timingSource: 'whisper', confidence: 'interpolated' },
  ],
  audio: { mix: 'm.mp3' },
};
const win = { start: 10, end: 20 };

function base(): TreatmentV3 {
  return {
    concept: 'c',
    styleAnchor: { prompt: 'p', palette: { background: '#000000', text: '#ffffff', accent: '#00ffff', line: '#ffffff', glow: '#4488ff' }, fonts: { display: 'Mochiy Pop One', body: 'Zen Kaku Gothic New' } },
    assets: [{ id: 'a1', kind: 'image', prompt: 'night sky' }],
    shots: [
      { id: 's1', start: 10, end: 13, template: 'punch', params: {}, asset: 'a1', camera: 'push', transitionIn: 'flash' },
      { id: 's2', start: 13.07, end: 20, template: 'frame-split', params: {}, camera: 'static', transitionIn: 'cut' },
    ],
    cues: [
      { cueId: 'c001', shot: 's1', emphasis: [{ from: 0, to: 3, method: 'scale' }], accents: [0, 2], enter: 'slam', exit: 'burst' },
      { cueId: 'c002', shot: 's2', enter: 'wipe', exit: 'rise' },
    ],
  };
}

describe('validateTreatment', () => {
  it('accepts a valid treatment, fills defaults and snaps near-boundary shots', () => {
    const r = validateTreatment(base(), song, win, TEMPLATES);
    expect(r.errors).toEqual([]);
    expect(r.treatment.shots[1].start).toBe(13); // snapped to the cue start
    expect(r.treatment.shots[0].end).toBe(13); // shots tile the window
    expect(r.treatment.shots[1].end).toBe(20);
    expect(r.treatment.shots[0].params['keywordWidth']).toBe(0.8);
    expect(r.treatment.cues.map((c) => c.cueId)).toEqual(['c001', 'c002', 'c003']); // c003 got a default style
  });

  it('widens emphasis that cuts a word to the whole phrase', () => {
    const t = base();
    t.cues[0].emphasis = [{ from: 1, to: 2, method: 'scale' }]; // 光[る]星 → 光る
    const r = validateTreatment(t, song, win, TEMPLATES);
    expect(r.errors).toEqual([]);
    expect(r.treatment.cues[0].emphasis![0]).toMatchObject({ from: 0, to: 2 });
    expect(r.fixes.join('\n')).toMatch(/切開了一個詞/);
  });

  it('reports what the director must fix', () => {
    const t = base();
    t.cues.push({ cueId: 'c999', shot: 's1', enter: 'fade', exit: 'fade' });
    t.cues[0].emphasis = [{ from: 2, to: 99, method: 'scale' }];
    t.shots[0].template = 'nope';
    t.shots[1].params = { frameWidth: 'wide' as unknown as number, bogus: 1 };
    const r = validateTreatment(t, song, win, TEMPLATES);
    expect(r.fixes.join("\n")).toMatch(/c999/); // a style for a line not in the song (deleted in the editor) is dropped
    expect(r.errors.join('\n')).not.toMatch(/強調範圍/); // trimmed, not a failed render
    expect(r.fixes.join('\n')).toMatch(/截到句尾/);
    expect(r.treatment.cues[0].emphasis![0].to).toBeLessThan(99);
    expect(r.errors.join('\n')).toMatch(/未知模板 nope/);
    expect(r.errors.join('\n')).toMatch(/沒有參數 bogus/);
    expect(r.errors.join('\n')).toMatch(/frameWidth 必須是數字/);
  });

  it('clamps parameters, drops impossible accents and keeps interpolated cues off the beat', () => {
    const t = base();
    t.shots[0].params = { keywordWidth: 3 };
    t.cues[0].accents = [0, 50];
    t.cues.push({ cueId: 'c003', shot: 's2', accents: [1], enter: 'slam', exit: 'fade' });
    const r = validateTreatment(t, song, win, TEMPLATES);
    expect(r.errors).toEqual([]);
    expect(r.treatment.shots[0].params['keywordWidth']).toBe(0.92);
    expect(r.treatment.cues[0].accents).toEqual([0]);
    const c3 = r.treatment.cues.find((c) => c.cueId === 'c003')!;
    expect([c3.enter, c3.accents]).toEqual(['fade', []]);
    expect(r.fixes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('lyrics edited after the design', () => {
  it('drops the style of a deleted line and styles a line added later', async () => {
    const { validateTreatment } = await import('./treatment');
    const { TEMPLATES } = await import('./templates');
    const song = { title: 't', duration: 20, tempo: 120, beats: [], downbeats: [], sections: [], cues: [{ id: 'new1', start: 2, end: 4, text: '新しい', timingSource: 'lrc', confidence: 'verified' }] } as never;
    const t = { concept: '', styleAnchor: { prompt: '', palette: { background: '#000000', text: '#ffffff', accent: '#ff0000', glow: '#ffffff' } }, assets: [], shots: [{ id: 's1', start: 0, end: 20, template: 'quiet', params: {}, camera: 'static', transitionIn: 'cut' }], cues: [{ cueId: 'gone', shot: 's1', enter: 'fade', exit: 'fade' }] } as never;
    const r = validateTreatment(t, song, { start: 0, end: 20 }, TEMPLATES);
    expect(r.errors).toEqual([]);
    expect(r.treatment.cues.map((c) => c.cueId)).toEqual(['new1']);
  });
});
