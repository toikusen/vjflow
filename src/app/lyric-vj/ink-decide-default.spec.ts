import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { LyricVjEngine, type RenderJob } from './render/engine';
import { keyFor, WORLD_FX } from './render/hold-room';
import { SET_SPECS } from './render/world-sets';
import { STYLE_WORLDS } from './style-worlds';

const SONG = 'out/db/yt_hCCskTJwvuc/song.json';
const MEANING = 'out/research/instant/plans/choroin/meaning.json';

describe.skipIf(!existsSync(SONG))('M3 is on by default, in the renderer as in the plan (2026-11-15: it was off on every free job)', () => {
  const { job } = freeJob(JSON.parse(readFileSync(SONG, 'utf8')), { style: FREE_STYLES.find((s) => s.id === 'dark-glitch')!, seed: 0, meaning: JSON.parse(readFileSync(MEANING, 'utf8')) });

  it("a free job's renderer decides through its world's effects, the plan's own; off only when asked", () => {
    const fx = LyricVjEngine.inkFx(job as unknown as RenderJob);
    expect(fx).toBeDefined();
    expect(fx).toEqual(WORLD_FX['dark-glitch']);
    expect(LyricVjEngine.inkFx({ ...job, treatment: { ...job.treatment, inkDecide: false } } as unknown as RenderJob)).toBeNull();
  });

  it("the renderer's key for c059 (violet-hour's accent, 3.6:1 drawn) is the plan's, and moved", () => {
    const slots = STYLE_WORLDS.find((w) => w.id === 'dark-glitch')!.palette.find((s) => s.id === 'violet-hour') as never as Parameters<typeof keyFor>[1];
    const spec = SET_SPECS['dark-glitch/overheard'];
    const renderer = keyFor(spec, slots, slots.ink, { fx: LyricVjEngine.inkFx(job as unknown as RenderJob) });
    expect(renderer).toBe(keyFor(spec, slots, slots.ink));
    expect(renderer.toLowerCase()).not.toBe(keyFor(spec, slots, slots.ink, { fx: null }).toLowerCase());
  });
});
