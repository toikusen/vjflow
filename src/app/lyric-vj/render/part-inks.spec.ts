// Every ink a hold draws over a line (a key pulse: roll, ink-run, light-sweep, beat-punch; a phrase swap; a whole line's
// settle) reads at 4.5:1 on what each part of the line stands on, not on one carrier for the line (review 2026-11-10:
// card/pair's second row is on the red card its page lays; a roll's purple key ran over it at ≈1.2:1).
import { describe, expect, it } from 'vitest';
import { contrast } from '../contrast';
import { STYLE_WORLDS } from '../style-worlds';
import { holdLineOf } from '../lineplan-core';
import { carrierSlots, inkChecks, partGrounds, READ_MIN } from './hold-room';
import { SET_SPECS } from './world-sets';

describe('hold inks per part', () => {
  const card = STYLE_WORLDS.find((w) => w.id === 'card')!;

  it('card/pair: the second row stands on the red card; no hold ink passes that does not read on it', () => {
    const spec = SET_SPECS['card/pair'];
    for (const slots of card.palette) {
      const grounds = partGrounds(spec, slots);
      expect(grounds).toContain(slots.ink2);
      const c = inkChecks(spec, slots, slots.plateInk);
      if (c.keyOk) for (const g of grounds) expect(contrast(c.key, g)).toBeGreaterThanOrEqual(READ_MIN);
      if (c.settle) for (const g of grounds) expect(contrast(c.settle, g)).toBeGreaterThanOrEqual(READ_MIN);
      // the plan offers no key pulse or settle the renderer would draw below 4.5:1 on either card
      const line = holdLineOf(spec, 0.5, undefined, slots);
      expect(line.keyOk).toBe(c.keyOk);
    }
    // without the red card under row 2 (the line's one carrier, as before) the same key would pass on some scheme
    const one = { ...spec, rowOn: undefined };
    expect(card.palette.some((slots) => inkChecks(one, slots, slots.plateInk).keyOk && !inkChecks(spec, slots, slots.plateInk).keyOk)).toBe(true);
  });

  it('y2k/strips: the foil and clip colours under the glyphs (tones) count; no hold ink passes that misses one', () => {
    const spec = SET_SPECS['y2k/strips'];
    const y2k = STYLE_WORLDS.find((w) => w.id === 'y2k')!;
    for (const slots of y2k.palette) {
      const grounds = partGrounds(spec, slots);
      for (const t of spec.tones!) expect(grounds).toContain(t);
      const c = inkChecks(spec, slots, slots.plateInk);
      if (c.keyOk) for (const g of grounds) expect(contrast(c.key, g)).toBeGreaterThanOrEqual(READ_MIN);
      if (c.settle) for (const g of grounds) expect(contrast(c.settle, g)).toBeGreaterThanOrEqual(READ_MIN);
    }
    // a slot name in tones is the scheme's own colour (cel80s/ending's sky middle is its ink2)
    const cel = STYLE_WORLDS.find((w) => w.id === 'cel80s')!;
    expect(partGrounds(SET_SPECS['cel80s/ending-l'], cel.palette[0])).toContain(cel.palette[0].ink2);
  });

  it('every row ink reads on the carrier its row stands on, in every scheme of its world (data: rowOn, on)', () => {
    for (const w of STYLE_WORLDS) for (const [id, spec] of Object.entries(SET_SPECS)) {
      if (!spec.rowInk || !id.startsWith(`${w.id}/`)) continue;
      const on = carrierSlots(spec);
      if (!on) continue;
      for (const slots of w.palette) spec.rowInk.forEach((ink, r) => {
        const under = spec.rowOn ? [spec.rowOn[Math.min(spec.rowOn.length - 1, r)]] : on;
        const best = Math.max(...under.map((k) => contrast(slots[ink], slots[k])));
        expect(best, `${id} row ${r} ${ink} on ${under.join('/')} (${slots.id ?? ''})`).toBeGreaterThanOrEqual(READ_MIN);
      });
    }
  });
});
