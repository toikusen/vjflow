import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES } from './free-styles';
import { freeJob, withoutEchoes } from './free-plan';
import { composePlan, RECIPES } from './lineplan-core';
import { STYLE_WORLDS } from './style-worlds';
import { HAND_WORLDS } from './style-worlds-hand';
import { partsOf, poolOf, worldHoles, worldRecipes } from './style-world';
import { SET_SPECS } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { LANGUAGES } from './languages';
import type { SongTimeline } from './timeline';

const cueTexts = ['我走過那條路', '風吹過你的臉不再回頭', '天亮了我還在等', '那些話留給了潮汐', '一起走吧', '不要忘記我們的約定', '夜裡的光照亮了街道'];
const songOf = (gap: number): SongTimeline => {
  const cues = Array.from({ length: 28 }, (_, i) => ({ id: `c${i + 1}`, start: 5 + i * gap, end: 5 + i * gap + gap * 0.9, text: cueTexts[i % cueTexts.length] }));
  const end = 5 + 28 * gap + 2;
  return { title: 'x', duration: end, tempo: 120, beats: Array.from({ length: Math.ceil(end * 2) }, (_, i) => i * 0.5), downbeats: [], sections: [{ start: 0, end, type: 'verse', energy: 0.8 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
};

describe('style worlds', () => {
  it('fill the standard', () => {
    expect(STYLE_WORLDS.flatMap(worldHoles)).toEqual([]);
  });
  it('name only parts that exist', () => {
    for (const w of STYLE_WORLDS) {
      for (const l of w.layouts.lines) {
        expect(SET_SPECS[l.set], l.set).toBeDefined();
        for (const e of l.enters) expect(WORLD_ENTERS[e], e).toBeDefined();
        for (const e of l.exits) expect(WORLD_EXITS[e], e).toBeDefined();
        if (l.hold !== 'none') expect(WORLD_HOLDS[l.hold], l.hold).toBeDefined();
      }
      for (const id of w.layouts.shared) expect(RECIPES.some((r) => r.id === id), id).toBe(true);
      expect(LANGUAGES[w.language], w.id).toBeDefined();
      if (w.family === 'print') continue;
      for (const pc of w.pieces) expect(WORLD_PIECES[pc], pc).toBeDefined();
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) expect(WORLD_GROUNDS[g], g).toBeDefined();
      for (const t of w.transitions.own) expect(WORLD_INS[t], t).toBeDefined();
    }
  });
  it('keep a part to one world', () => {
    const sets = STYLE_WORLDS.flatMap((w) => w.layouts.lines.map((l) => l.set));
    expect(new Set(sets).size).toBe(sets.length);
    for (const w of STYLE_WORLDS) for (const l of w.layouts.lines) expect(l.set.startsWith(`${w.id}/`), l.set).toBe(true);
    const first = STYLE_WORLDS.filter((w) => w.family !== 'print');
    const grounds = first.flatMap((w) => partsOf(w).filter((p) => p in WORLD_GROUNDS));
    expect(new Set(grounds).size).toBe(grounds.length);
  });
  it('read in every scheme', () => {
    for (const w of STYLE_WORLDS) for (const s of w.palette) {
      expect(contrast(s.ink, w.standsOnPlate ? s.plate : s.ground), s.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.plateInk, s.plate) >= 4.5 || contrast(s.ink, s.plate) >= 4.5, `${s.id} plate`).toBe(true);
    }
  });
  it('have every part they name, in the worlds of batch 2', () => {
    for (const w of HAND_WORLDS) {
      expect(worldHoles(w), w.id).toEqual([]);
      expect(w.pieces.length, w.id).toBeGreaterThanOrEqual(3);
      for (const p of w.pieces) expect(WORLD_PIECES[p], `${w.id} ${p}`).toBeTruthy();
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) expect(WORLD_GROUNDS[g], `${w.id} ${g}`).toBeTruthy();
      for (const t of w.transitions.own) expect(WORLD_INS[t], `${w.id} ${t}`).toBeTruthy();
      for (const l of w.layouts.lines) {
        expect(SET_SPECS[l.set], l.set).toBeTruthy();
        for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
        for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
        expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
      }
      // a world has light and dark in it, not one mood three times
      expect(new Set(w.palette.map((s) => s.band)).size, w.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('fold a cue too short to read into the same line before it', () => {
    const song = { ...songOf(2.4) };
    const [a, b] = song.cues;
    const echo = { ...song, cues: [a, { ...b, text: a.text, start: a.end, end: a.end + 0.04 }, ...song.cues.slice(2)] };
    const out = withoutEchoes(echo);
    expect(out.cues.length).toBe(song.cues.length - 1);
    expect(out.cues[0].end).toBeCloseTo(a.end + 0.04);
    expect(withoutEchoes(song)).toBe(song);
  });
  it('keep the terminal readable: faces as drawn, real spacing, a desktop that leaves', () => {
    const t = STYLE_WORLDS.find((w) => w.id === 'terminal')!;
    expect(t.material.surface).not.toBe('bitmap');
    for (const l of t.layouts.lines) { expect(SET_SPECS[l.set].lead, l.set).toBeGreaterThanOrEqual(1.3); expect(SET_SPECS[l.set].track, l.set).toBeGreaterThanOrEqual(0.06); }
  });
  it('tie each set piece to the words that ask for it', () => {
    for (const w of HAND_WORLDS) for (const p of w.pieces) expect(w.pieceWords?.[p], `${w.id} ${p}`).toBeInstanceOf(RegExp);
  });
  it('draw only from their own pool, whatever the reroll', () => {
    for (const s of FREE_STYLES.filter((x) => x.world.family !== 'print')) {
      for (const seed of [0, 1, 2]) {
        for (const gap of [2.2, 5]) {
          const { plan } = freeJob(songOf(gap), { style: s, seed });
          const own = new Set(s.world.layouts.lines.map((l) => l.set));
          for (const sh of plan.shots) for (const l of sh.lines as { world?: { set: string } }[]) expect(own.has(l.world?.set ?? ''), `${s.id} ${l.world?.set}`).toBe(true);
          const grounds = new Set([...s.world.grounds.quiet, ...Object.values(s.world.grounds.levels).flat(), s.world.peak.loud, s.world.peak.calm, ...s.world.layouts.lines.flatMap((l) => (l.ground ? [l.ground] : []))]);
          for (const sh of plan.shots) for (const c of sh.cuts) expect(grounds.has(c.fx as string), `${s.id} ${c.fx}`).toBe(true);
        }
      }
    }
  });
  it('hold shared layouts to their share of a song', () => {
    for (const s of FREE_STYLES) {
      const { plan } = freeJob(songOf(2.4), { style: s, seed: 1 });
      const lines = plan.shots.flatMap((sh) => sh.lines as { world?: unknown }[]);
      expect(lines.filter((l) => !l.world).length / lines.length, s.id).toBeLessThanOrEqual(0.45);
      expect(lines.filter((l) => l.world).length / lines.length, s.id).toBeGreaterThanOrEqual(0.3);
    }
  });
  it('leave a plan with no world as it was', () => {
    const song = songOf(2.4);
    const meaning = { palette: 'tea', ground: 'grain', reading: '', parts: [{ from: 'c1', tension: 0.7, fx: [], what: 'x' }], keys: [] };
    const plain = composePlan(song as never, meaning, false, { reroll: 2 });
    expect(JSON.stringify(plain.plan)).not.toContain('world');
    expect(JSON.stringify(plain.plan)).toBe(JSON.stringify(composePlan(song as never, meaning, false, { reroll: 2 }).plan));
    expect(worldRecipes(STYLE_WORLDS[6]).every((r) => r.template === 'world-set')).toBe(true);
    expect(poolOf(STYLE_WORLDS[6], RECIPES).recipes.some((r) => !r.wline)).toBe(false);
  });
  it('change more on a fast song than a calm one', () => {
    const s = FREE_STYLES.find((x) => x.id === 'terminal')!;
    const fast = freeJob(songOf(2.4), { style: s, seed: 0 }).plan.shots.reduce((n, sh) => n + sh.cuts.length, 0);
    const slow = freeJob(songOf(6), { style: s, seed: 0 }).plan.shots.reduce((n, sh) => n + sh.cuts.length, 0);
    expect(fast).toBeGreaterThan(28);
    expect(fast).toBeGreaterThanOrEqual(slow);
  });
});
