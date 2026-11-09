// The plan's seat geometry (seat-geometry.ts laidSeat, on its rough measure) against the renderer's way of laying the same
// line (world-layout build: slotSpec, then blockOf on the real glyphs' advances). The real advances need a font in a
// browser; here seat-geometry's shapedMeasure stands in for them (CJK and kana an em, spaces and narrow marks a quarter
// em, Latin by shape), and the boxes must agree within the measured gap, a shared shot's slot included. The residual gap is documented in docs/research/2026-11-09-q1-phase3a.md.
import { describe, expect, it } from 'vitest';
import { FREE_STYLES } from '../free-styles';
import { WORLD_COMPOSITIONS, pageSeatsOf } from '../world-shared';
import { boxesMeet, laidSeat, shapedMeasure, slotSpec } from './seat-geometry';
import { pageSeatsFor } from '../lineplan-core';
import { blockOf, SET_SPECS } from './world-sets';

const realish = shapedMeasure;
/** Lines and the most their rough box and type may differ from the shaped-advance ones over every seat and slot (measured
 * 2026-11-09): a run of CJK none; spaces and marks set narrower than the rough 55 can change the rows a set picks. */
const TEXTS: [string, number, number][] = [['快使用雙截棍', 0.001, 0.001], ['如果我有輕功 飛簷走壁', 0.02, 0.035], ['こんなに綺麗じゃん!', 0.035, 0.05], ['あの星あかりを 海の広さを', 0.16, 0.19], ['Baby I love you', 0.32, 0.22]];

describe('seat geometry: the plan lays a line where the renderer does', () => {
  it('a shared shot\'s slot is the renderer\'s own step (slotSpec), and laidSeat takes it', () => {
    const s = SET_SPECS['notebook/spiral'];
    const two = slotSpec(s, { k: 0, of: 2 });
    expect(two.tall).toBeCloseTo(s.tall / 2);
    expect(two.object).toBeUndefined();
    const text = '快使用雙截棍 哼哼哈兮';
    const b = blockOf(text, two, realish);
    const laid = laidSeat(text, 'notebook/spiral', { slot: { k: 0, of: 2 }, measure: realish })!;
    expect(laid.size).toBe(Math.round(b.lines?.length ? Math.max(...b.lines.map((r) => r.size)) : b.size));
  });

  for (const id of Object.keys(WORLD_COMPOSITIONS))
    it(`${id}: every seat, one slot and two: the rough box and type within the measured gap of the shaped-advance ones; a same-page seat offered only where both fit`, () => {
      const world = FREE_STYLES.find((s) => s.id === id)!.world;
      const sets = [...new Set([...world.layouts.lines.map((l) => l.set), ...pageSeatsOf(id)])];
      for (const set of sets)
        for (const slot of [{ k: 0, of: 1 }, { k: 0, of: 2 }])
          for (const [text, boxGap, sizeGap] of TEXTS) {
            const a = laidSeat(text, set, { slot })!;
            const b = laidSeat(text, set, { slot, measure: realish })!;
            const at = `${set} ${slot.of} ${text}`;
            for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(a.box[k] - b.box[k]), `${at} ${k}`).toBeLessThanOrEqual(boxGap);
            expect(Math.abs(a.size - b.size) / b.size, at).toBeLessThanOrEqual(sizeGap);
          }
      for (const x of pageSeatsOf(id))
        for (const [text] of TEXTS)
          if (pageSeatsFor(text, SET_SPECS[x].samePage!, id).includes(x))
            for (const m of [undefined, realish]) {
              const laid = laidSeat(text, x, { measure: m })!;
              expect(laid.size, `${x} ${text}`).toBeGreaterThanOrEqual(SET_SPECS[x].lo);
              for (const p of [...laid.protect, ...(WORLD_COMPOSITIONS[id].protectedRegion ?? [])]) expect(boxesMeet(laid.box, p), `${x} ${text}`).toBe(false);
            }
    });
});
