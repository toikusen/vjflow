import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { LyricVjEngine, type RenderJob } from './render/engine';
import { keyFor, bodyInk } from './render/hold-room';
import { SET_SPECS } from './render/world-sets';
import { STYLE_WORLDS } from './style-worlds';
import { INK_HALO } from './render/final-warp.glsl';
import { slotSpec } from './render/seat-geometry';

const SONG = 'out/db/yt_hCCskTJwvuc/song.json';
const MEANING = 'out/research/instant/plans/choroin/meaning.json';

describe('ink decisions are each engine\'s own, from its own job (Codex review 2026-11-16)', () => {
  it('the halo is the job\'s: the default, another, or none; no page-wide flag decides it', () => {
    expect(LyricVjEngine.inkHaloOf({ treatment: {} } as never)).toEqual(INK_HALO);
    expect(LyricVjEngine.inkHaloOf({ treatment: { inkHalo: [8, 12] } } as never)).toEqual([8, 12]);
    expect(LyricVjEngine.inkHaloOf({ treatment: { inkHalo: false } } as never)).toBeUndefined();
    // (the engine and the world lines read their own instance's, never a global another engine set)
    const engine = readFileSync('src/app/lyric-vj/render/engine.ts', 'utf8');
    const layout = readFileSync('src/app/lyric-vj/render/world-layout.ts', 'utf8');
    expect(engine).not.toMatch(/__vjInkHalo\b(?!QA)/);
    expect(engine).not.toContain('__vjInkFx');
    expect(layout).not.toContain('__vjInkFx');
    expect(layout).toContain('fx: rt.inkFx');
  });

  it.skipIf(!existsSync(SONG))('two jobs give two effect boxes, each decided from its own world', () => {
    const song = JSON.parse(readFileSync(SONG, 'utf8'));
    const meaning = JSON.parse(readFileSync(MEANING, 'utf8'));
    const fx = (id: string) => LyricVjEngine.inkFx(freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning }).job as unknown as RenderJob);
    expect(fx('dark-glitch')).not.toEqual(fx('spy'));
    expect(fx('dark-glitch')).toEqual(fx('dark-glitch'));
  });

  it("a copied spec (a seat split, a blow, a scale) decides as its set does when its id is passed (gothic-lolita oxblood)", () => {
    const slots = STYLE_WORLDS.find((w) => w.id === 'gothic-lolita')!.palette.find((s) => s.id === 'oxblood') as never as Parameters<typeof keyFor>[1];
    const spec = SET_SPECS['gothic-lolita/spread-left'];
    const copy = { ...spec };
    const seen = { set: 'gothic-lolita/spread-left', world: 'gothic-lolita' };
    expect(keyFor(copy, slots, slots.ink, seen)).toBe(keyFor(spec, slots, slots.ink));
    expect(bodyInk(copy, slots, slots.plateInk, seen)).toBe(bodyInk(spec, slots, slots.plateInk));
    const split = slotSpec(spec, { k: 0, of: 2 });
    expect(keyFor(split, slots, slots.ink, seen)).toBe(keyFor(spec, slots, slots.ink));
  });
});
