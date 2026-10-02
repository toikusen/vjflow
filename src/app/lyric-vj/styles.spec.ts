import { describe, expect, it } from 'vitest';
import { checkStyle, STYLES } from './styles';
import { SongTimeline } from './timeline';
import { TreatmentV3 } from './treatment';

const song: SongTimeline = {
  title: 't', duration: 60, tempo: 120, beats: [], downbeats: [], energy: [], energyFps: 10,
  sections: [{ start: 0, end: 20, energy: 0.4 }, { start: 20, end: 60, energy: 0.8 }],
  cues: [{ id: 'c001', start: 20.5, end: 23, text: '光る星', timingSource: 'lrclib', confidence: 'verified' }],
  audio: { mix: 'm' },
};
const base = (): TreatmentV3 => ({
  concept: 'c',
  styleAnchor: { prompt: 'p', palette: { background: '#000000', text: '#ffffff', accent: '#00ffff', line: '#ffffff', glow: '#0000ff' }, fonts: { display: 'D', body: 'B' } },
  assets: [{ id: 'i', kind: 'image', prompt: 'sky' }, { id: 'v', kind: 'video', prompt: 'clouds', from: 'i' }],
  shots: [
    { id: 's1', start: 20, end: 26, template: 'punch', params: {}, asset: 'v', camera: 'push', transitionIn: 'flash' },
    { id: 's2', start: 26, end: 32, template: 'frame-split', params: {}, asset: 'i', camera: 'pan', transitionIn: 'wipe' },
    { id: 's3', start: 32, end: 36, template: 'punch', params: {}, asset: 'v', clipStart: 3, camera: 'parallax', transitionIn: 'cut' },
  ],
  cues: [],
});

describe('checkStyle (emotional)', () => {
  it('accepts a treatment that follows the preset', () => {
    expect(checkStyle(base(), STYLES['emotional'], song, { start: 20, end: 36 })).toEqual([]);
  });

  it('flags extra videos, missing assets, one-line shots and off-section flashes', () => {
    const t = base();
    t.assets.push({ id: 'v2', kind: 'video', prompt: 'x', from: 'i' });
    t.shots[1] = { ...t.shots[1], start: 26, end: 28, asset: undefined, transitionIn: 'flash' };
    t.shots[2].start = 28;
    const errs = checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n');
    expect(errs).toMatch(/1–1 段 video/);
    expect(errs).toMatch(/s2 沒有素材/);
    expect(errs).toMatch(/s2 長 2\.0 秒/);
    expect(errs).toMatch(/s2 用了 flash/);
  });
});
