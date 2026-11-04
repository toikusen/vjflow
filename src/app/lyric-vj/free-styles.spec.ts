import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS, recommendStyle, STYLE_PALETTES, styleFont, styleGroups } from './free-styles';
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
    expect(groups.flatMap((g) => g.cards.map((c) => c.id)).sort()).toEqual(FREE_STYLES.filter((s) => !HELD_WORLDS.has(s.id)).map((s) => s.id).sort());
    expect(groups[0].cards.map((c) => c.id)).toContain('neon-stage');
    expect(groups.at(-1)!.cards.map((c) => c.id)).toContain('silk');
  });
  it('keeps the picker line short', () => {
    for (const c of styleGroups().flatMap((g) => g.cards)) expect([...c.line].length, c.id).toBeLessThanOrEqual(14);
  });
});

describe('recommendStyle', () => {
  const lines = (n: number, text: string, sec: number) => Array.from({ length: n }, (_, i) => ({ start: i * sec, end: i * sec + sec * 0.9, text }));
  it('opens a slow song in ink, film, paper or quiet print, and a busy one in light, bold print, strokes or paper', async () => {
    const { FREE_STYLES, recommendStyle } = await import('./free-styles');
    const fam = (id: string) => FREE_STYLES.find((s) => s.id === id)!.world.family;
    const slow = recommendStyle({ title: '雪', cues: lines(10, '雪がふる', 4) });
    const busy = recommendStyle({ title: 'Drift', cues: lines(10, '一二三四五六七八九十一二三四五', 2) });
    expect(['wet', 'film', 'layered', 'print']).toContain(fam(slow));
    expect(['emissive', 'print', 'stroke', 'layered']).toContain(fam(busy));
  });
  it('never opens in a world too particular to offer unasked, and always opens a song the same way', async () => {
    const { recommendStyle } = await import('./free-styles');
    const picks = Array.from({ length: 60 }, (_, i) => recommendStyle({ title: `song ${i}`, cues: lines(8, '一二三四五六七八九十', 2) }));
    expect(picks.some((p) => ['dark-glitch', 'terminal', 'file', 'gothic-lolita'].includes(p))).toBe(false);
    expect(new Set(picks).size).toBeGreaterThan(3);
    expect(recommendStyle({ title: 'song 1', cues: lines(8, '一二三四五六七八九十', 2) })).toBe(picks[1]);
  });

  it('hold back worlds being redrawn from the picker and defaults', () => {
    const listed = styleGroups().flatMap((g) => g.cards.map((c) => c.id));
    for (const id of HELD_WORLDS) expect(listed, id).not.toContain(id);
    for (let i = 0; i < 40; i++) expect(HELD_WORLDS.has(recommendStyle({ title: `song ${i}`, cues: lines(8, '一二三四五六七八九十', i % 2 ? 2 : 6) }))).toBe(false);
    expect(FREE_STYLES.some((s) => HELD_WORLDS.has(s.id))).toBe(true);
  });
});
