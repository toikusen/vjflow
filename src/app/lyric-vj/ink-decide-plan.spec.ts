import { describe, expect, it } from 'vitest';
import { STYLE_WORLDS } from './style-worlds';
import { fxOfFrame } from './ink-decide';
import { bodyInk, inkChecks, keyFor, WORLD_FX } from './render/hold-room';
import { SET_SPECS } from './render/world-sets';
import { contrast } from './contrast';

describe('one ink decision for the plan and the renderer (M3, Codex: plan and renderer read one decision)', () => {
  const dark = STYLE_WORLDS.find((w) => w.id === 'dark-glitch')!;
  const slots = dark.palette.find((s) => s.id === 'violet-hour') as never as Parameters<typeof bodyInk>[1];
  const spec = SET_SPECS['dark-glitch/overheard'];

  it('every world registers its final effects from its own frame stack', () => {
    expect(WORLD_FX['dark-glitch']).toEqual(fxOfFrame(dark.frameStack));
    expect(Object.keys(WORLD_FX).length).toBe(STYLE_WORLDS.length);
  });

  it("the plan (the set's world's effects) and the renderer (the job's frame, passed in) decide the same inks", () => {
    const plan = inkChecks(spec, slots, slots.ink);
    const renderer = inkChecks(spec, slots, slots.ink, { fx: fxOfFrame(dark.frameStack, true) });
    expect(renderer).toEqual(plan);
    expect(keyFor(spec, slots, slots.ink)).toBe(keyFor(spec, slots, slots.ink, { fx: fxOfFrame(dark.frameStack, true) }));
  });

  it('a decided ink decides to itself, and reads on the ground through the effects; null fx leaves the ink as given', () => {
    const k = keyFor(spec, slots, slots.ink);
    expect(bodyInk(spec, slots, k)).toBe(k);
    expect(contrast(k, slots.ground)).toBeGreaterThanOrEqual(4.8);
    expect(keyFor(spec, slots, slots.ink, { fx: null })).not.toBe(undefined);
  });
});

describe("a hold's new ink reads through the effects, or the hold keeps the line's ink (M3, Codex: drop the swap)", () => {
  it('no key pulse, swap or settle ink that cannot read through the world effects', async () => {
    const { inkChecks: checks } = await import('./render/hold-room');
    const { leastThrough } = await import('./ink-decide');
    const { STYLE_WORLDS: worlds } = await import('./style-worlds');
    const { SET_SPECS: specs } = await import('./render/world-sets');
    const { WORLD_FX: fx, partGrounds } = await import('./render/hold-room');
    let checked = 0;
    for (const w of worlds) for (const scheme of w.palette) for (const part of w.layouts.lines) {
      const spec = specs[part.set];
      if (!spec) continue;
      const slots = scheme as never as Parameters<typeof checks>[1];
      const c = checks(spec, slots, slots.ink);
      const grounds = partGrounds(spec, slots);
      checked++;
      if (c.keyOk) expect(leastThrough(c.key, grounds, fx[w.id])).toBeGreaterThanOrEqual(4.5);
      if (c.settle) expect(leastThrough(c.settle, grounds, fx[w.id])).toBeGreaterThanOrEqual(4.5);
    }
    expect(checked).toBeGreaterThan(50);
  });
});
