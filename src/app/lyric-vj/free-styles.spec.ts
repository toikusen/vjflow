import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, STYLE_PALETTES, styleFont, styleGroups } from './free-styles';
import { FONTS } from './fonts';
import { LANGUAGES } from './languages';
import { freeJob } from './free-plan';
import type { SongTimeline } from './timeline';

describe('free styles', () => {
  it('belong to real languages', () => {
    expect(FREE_STYLES.length).toBeGreaterThanOrEqual(14);
    for (const s of FREE_STYLES) expect(LANGUAGES[s.from], s.id).toBeDefined();
  });
  it('keep the type readable on their paper', () => {
    for (const [id, p] of Object.entries(STYLE_PALETTES)) {
      expect(contrast(p.ink, p.paper), id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.paper), id).toBeGreaterThanOrEqual(3);
    }
  });
  it('name real palettes and faces', () => {
    for (const s of FREE_STYLES) {
      for (const p of s.palettes) expect(STYLE_PALETTES[p], p).toBeDefined();
      for (const f of Object.values(s.fonts)) expect(FONTS.some((x) => x.family === f), f).toBe(true);
    }
  });
  it('take a Han face for lyrics without kana', () => {
    expect(styleFont(FREE_STYLES[0], '我走過那條路', false)).toBe('Chiron Hei HK');
    expect(styleFont(FREE_STYLES[0], 'さよならの歌', false)).toBe('Zen Kaku Gothic New');
    expect(new Set(FREE_STYLES.map((s) => s.fonts.tc)).size).toBeGreaterThanOrEqual(8);
  });
  it('turn the song plan into their own version', () => {
    const cues = ['我走過那條路', '風吹過你的臉', '天亮了我還在等'].map((text, i) => ({ id: `c${i + 1}`, start: 5 + i * 5, end: 9 + i * 5, text }));
    const song = { title: 'x', duration: 30, tempo: 100, beats: Array.from({ length: 50 }, (_, i) => i * 0.6), downbeats: [], sections: [], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
    const { palette, job } = freeJob(song, { style: FREE_STYLES[0] });
    expect(FREE_STYLES[0].palettes).toContain(palette);
    expect(job.treatment.design?.reroll).toBe(0);
    expect(JSON.stringify(freeJob(song, { style: FREE_STYLES[0], seed: 3 }).job)).toBe(JSON.stringify(freeJob(song, { style: FREE_STYLES[0], seed: 3 }).job));
  });
  it('lists every style once in the picker, the worlds ahead of the print styles', () => {
    const groups = styleGroups();
    expect(groups.flatMap((g) => g.cards.map((c) => c.id)).sort()).toEqual(FREE_STYLES.map((s) => s.id).sort());
    expect(groups[0].cards.map((c) => c.id)).toContain('neon-stage');
    expect(groups.at(-1)!.cards.map((c) => c.id)).toContain('silk');
  });
  it('keeps the picker line short', () => {
    for (const c of styleGroups().flatMap((g) => g.cards)) expect([...c.line].length, c.id).toBeLessThanOrEqual(14);
  });
});
