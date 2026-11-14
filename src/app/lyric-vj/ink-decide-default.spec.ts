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

  it('c059 and c031 keep a key of their own hue, moved to read as drawn (premultiplied edges; 2026-11-15)', async () => {
    const { drawnInkOf } = await import('./render/hold-room');
    const { contrast } = await import('./contrast');
    for (const [set, id] of [['dark-glitch/overheard', 'violet-hour'], ['dark-glitch/margin', 'ghost-green']] as const) {
      const slots = STYLE_WORLDS.find((w) => w.id === 'dark-glitch')!.palette.find((s) => s.id === id) as never as Parameters<typeof keyFor>[1];
      const spec = SET_SPECS[set];
      const key = keyFor(spec, slots, slots.ink);
      expect(contrast(drawnInkOf(spec, slots)(key), slots.ground)).toBeGreaterThanOrEqual(4.8);
      // (an accent, not the body's cream: with the fringe gone the decision no longer has to drain it)
      expect(key.toLowerCase()).not.toBe(slots.ink.toLowerCase());
      // (QA: the straight-alpha edge, 0.42, would drain it)
      (globalThis as { __vjEdgeShare?: number }).__vjEdgeShare = 0.42;
      try { expect(keyFor(spec, slots, slots.ink).toLowerCase()).toBe(slots.ink.toLowerCase()); } finally { delete (globalThis as { __vjEdgeShare?: number }).__vjEdgeShare; }
    }
  });

  it("the renderer's key for c059 (violet-hour's accent, 3.6:1 drawn) is the plan's, and moved", () => {
    const slots = STYLE_WORLDS.find((w) => w.id === 'dark-glitch')!.palette.find((s) => s.id === 'violet-hour') as never as Parameters<typeof keyFor>[1];
    const spec = SET_SPECS['dark-glitch/overheard'];
    const renderer = keyFor(spec, slots, slots.ink, { fx: LyricVjEngine.inkFx(job as unknown as RenderJob) });
    expect(renderer).toBe(keyFor(spec, slots, slots.ink));
    expect(renderer.toLowerCase()).not.toBe(keyFor(spec, slots, slots.ink, { fx: null }).toLowerCase());
  });
});
