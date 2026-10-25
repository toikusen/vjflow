import { describe, expect, it } from 'vitest';
import { contrast, readable } from './render/runtime';
import { attachmentErrors, checkStyle, STYLES } from './styles';
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

  it('asks for title cards only where the user chose them', () => {
    // the only line starts at 20.5 s: 0–20.5 s is an intro without lyrics
    const errs = (mode: 'none' | 'ends' | 'all') => checkStyle(base(), STYLES['emotional'], song, { start: 0, end: 36 }, 'standard', mode).join('\n');
    expect(errs('ends')).toMatch(/0\.0–20\.5 秒沒有歌詞（intro），要放 title-card/);
    expect(errs('none')).not.toMatch(/title-card/);
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

describe('an interface language (phone)', () => {
  it('wants its lyrics in its own templates, each line marked with who says it, and allows long runs of one template', () => {
    const t = { ...base(), language: 'phone', assets: [] } as unknown as TreatmentV3;
    t.shots = [
      { id: 's1', start: 20, end: 26, template: 'typewriter', params: {}, camera: 'static', transitionIn: 'cut' },
      { id: 's2', start: 26, end: 36, template: 'chat', params: {}, camera: 'static', transitionIn: 'cut' },
    ] as never;
    t.cues = [{ cueId: 'c001', shot: 's2', enter: 'cut', exit: 'cut' }];
    const errs = checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n');
    expect(errs).toMatch(/voice/);
    expect(errs).not.toMatch(/相鄰鏡頭要換版型|至少要 4 種/);
    t.cues = [{ cueId: 'c001', shot: 's1', enter: 'cut', exit: 'cut' }];
    expect(checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n')).toMatch(/介面版型/);
    t.cues = [{ cueId: 'c001', shot: 's2', enter: 'cut', exit: 'cut', voice: 'me' }];
    expect(checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n')).not.toMatch(/介面版型|voice/);
  });
});

describe('phone checks that held nothing before (review 2026-10-14)', () => {
  it('counts a quiet shot that carries lyrics toward the interface share', () => {
    const t = { ...base(), language: 'phone', assets: [] } as unknown as TreatmentV3;
    t.shots = [{ id: 's1', start: 20, end: 36, template: 'quiet', params: {}, camera: 'static', transitionIn: 'cut' }] as never;
    t.cues = [{ cueId: 'c001', shot: 's1', enter: 'cut', exit: 'cut' }];
    expect(checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n')).toMatch(/介面版型/);
  });
  it('stops a sticker that no prop draws and a photo that is not a picture of the song', () => {
    const shot = (attachKind: string, attach: string) => ({ id: 's1', start: 0, end: 9, template: 'chat', params: { attachKind, attach }, camera: 'static', transitionIn: 'cut' });
    const t = { shots: [shot('sticker', 'earth.planet')], assets: [], graphics: { sections: [], storyProps: [] } } as never;
    expect(attachmentErrors(t, true).join()).toMatch(/earth\.planet/);
    expect(attachmentErrors(t, false)).toEqual([]);
    const ok = { shots: [shot('sticker', 'spr:earth.planet')], assets: [], graphics: { sections: [], storyProps: [{ id: 'earth.planet', what: 'x', hero: false }] } } as never;
    expect(attachmentErrors(ok, true)).toEqual([]);
    expect(attachmentErrors({ shots: [shot('photo', 'roof')], assets: [], graphics: undefined } as never, false).join()).toMatch(/roof/);
  });
});

describe('a chosen language over the style', () => {
  it('takes the language\'s templates and picture rule, not the style\'s', () => {
    const t = { ...base(), language: 'phone', assets: [] } as unknown as TreatmentV3;
    t.shots = [{ id: 's1', start: 20, end: 36, template: 'chat', params: {}, camera: 'static', transitionIn: 'cut' }] as never;
    t.cues = [{ cueId: 'c001', shot: 's1', enter: 'cut', exit: 'cut', voice: 'me' }];
    const errs = checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n');
    expect(errs).not.toMatch(/不屬於|沒有素材/);
  });
});

describe('phone input fields', () => {
  it('sends a line sung too fast to read out of the input field', () => {
    const fast = { ...song, cues: [{ id: 'c001', start: 20.5, end: 21.2, text: 'とても長い一行の歌詞です', timingSource: 'lrclib', confidence: 'verified' }] } as unknown as SongTimeline;
    const t = { ...base(), language: 'phone', assets: [] } as unknown as TreatmentV3;
    t.shots = [{ id: 's1', start: 20, end: 36, template: 'input', params: {}, camera: 'static', transitionIn: 'cut' }] as never;
    t.cues = [{ cueId: 'c001', shot: 's1', enter: 'cut', exit: 'cut', voice: 'me' }];
    expect(checkStyle(t, STYLES['emotional'], fast, { start: 20, end: 36 }).join('\n')).toMatch(/唱得太快/);
    expect(checkStyle(t, STYLES['emotional'], song, { start: 20, end: 36 }).join('\n')).not.toMatch(/唱得太快/);
  });
});
