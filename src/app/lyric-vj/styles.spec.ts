import { describe, expect, it } from 'vitest';
import { contrast, readable } from './render/runtime';
import { checkStyle, STYLES } from './styles';
import { sceneCount } from './tiers';
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

describe('sceneCount', () => {
  it('scales scenes with the window per tier', () => {
    expect(sceneCount('standard', { start: 0, end: 16 })).toBe(1);
    expect(sceneCount('standard', { start: 0, end: 89 })).toBe(5);
    expect(sceneCount('rich', { start: 0, end: 89 })).toBe(12);
    expect(sceneCount('rich', { start: 0, end: 600 })).toBe(36);
  });
});

describe('checkStyle (emotional)', () => {
  it('accepts a treatment that follows the preset', () => {
    expect(checkStyle(base(), STYLES['emotional'], song, { start: 20, end: 36 })).toEqual([]);
  });

  it('flags extra videos, missing assets, one-line shots and off-section flashes', () => {
    const t = base();
    t.assets.push({ id: 'v2', kind: 'video', prompt: 'x', from: 'i' });
    t.shots[1] = { ...t.shots[1], start: 26, end: 28, asset: undefined, transitionIn: 'flash' }; // right after s1's flash
    t.shots[2].start = 28;
    const errs = checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n');
    expect(errs).toMatch(/video（1–1 段）/); // 16 s window → one scene
    expect(errs).toMatch(/s2 沒有素材/);
    expect(errs).toMatch(/s2 長 2\.0 秒/);
    expect(errs).toMatch(/s1、s2 連續使用 flash/);
  });

  it('enforces the tier: no video in still, most scenes used in rich', () => {
    expect(checkStyle(base(), STYLES['emotional'], song, { start: 20, end: 36 }, 'still').join('\n')).toMatch(/不可有 video/);
    expect(checkStyle(base(), STYLES['emotional'], song, { start: 20, end: 36 }, 'rich').join('\n')).toMatch(/要 2–2 張 image/);
  });

  it('asks for template variety', () => {
    const t = base();
    t.shots[1].template = 'punch';
    const errs = checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n');
    expect(errs).toMatch(/s1、s2 連續使用 punch/);
    expect(errs).toMatch(/只用了 1 種版型/);
  });
});

describe('readable', () => {
  it('lightens a blue accent until it reads on a dark blue background', () => {
    expect(contrast('#3b5bff', '#0a1030')).toBeLessThan(4.5);
    const c = readable('#3b5bff', '#0a1030');
    expect(contrast(c, '#0a1030')).toBeGreaterThanOrEqual(4.5);
    expect(readable('#ffffff', '#0a1030')).toBe('#ffffff');
  });
});
