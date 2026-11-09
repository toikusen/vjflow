// The plan's seat geometry (seat-geometry.ts laidSeat, on its rough measure) against the renderer's way of laying the same
// line (world-layout build: slotSpec, then blockOf on the real glyphs' advances). The real advances need a font in a
// browser; here seat-geometry's shapedMeasure stands in for them (CJK and kana an em, spaces and narrow marks a quarter
// em, Latin by shape), and the boxes must agree within the measured gap, a shared shot's slot included. The residual gap is documented in docs/research/2026-11-09-q1-phase3a.md.
import { describe, expect, it } from 'vitest';
import { FREE_STYLES } from '../free-styles';
import { WORLD_COMPOSITIONS, pageSeatsOf } from '../world-shared';
import { boxesMeet, evenMeasure, laidSeat, panelSplit, shapedMeasure, slotSpec, type FracBox } from './seat-geometry';
import { layoutMeasure } from './layout-measure';
import { REAL_ADVANCES } from './seat-agree.fixture';
import { SEAT_TEXTS } from './seat-agree.texts';
import { pageSeatsFor } from '../lineplan-core';
import { blockOf, SET_SPECS } from './world-sets';

const realish = shapedMeasure;
/** Lines and the most their rough box and type may differ from the shaped-advance ones over every seat and slot (measured
 * 2026-11-09): a run of CJK none; spaces and marks set narrower than the rough 55 can change the rows a set picks. */
const TEXTS: [string, number, number][] = [['快使用雙截棍', 0.001, 0.001], ['如果我有輕功 飛簷走壁', 0.02, 0.035], ['こんなに綺麗じゃん!', 0.035, 0.05], ['あの星あかりを 海の広さを', 0.16, 0.19], ['Baby I love you', 0.32, 0.22]];
/** silk/edge-bleed (phase 4): the widest type of any declared set (260 px), where a space or a Latin letter set narrower
 * moves its one-row box furthest (measured 2026-11-10: 0.039 and 0.327); every other set keeps the table above. */
const WIDE_GAP: Record<string, Record<string, number>> = { 'silk/edge-bleed': { 'こんなに綺麗じゃん!': 0.04, 'Baby I love you': 0.33 } };

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
            for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(a.box[k] - b.box[k]), `${at} ${k}`).toBeLessThanOrEqual(WIDE_GAP[set]?.[text] ?? boxGap);
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

describe('phase 3c: plan and picture agree on the real faces', () => {
  // the browser's advances for the test lines (seat-agree.fixture.ts, read by scripts/lyric-vj/seat-agree.mts in the
  // renderer's own Chromium): the renderer lays a line on them (world-layout measureOf); the plan on layout-measure's table
  const fonts = Object.keys(REAL_ADVANCES);
  const real = (font: string) => (x: string) => [...x].reduce((w, c) => w + REAL_ADVANCES[font][c], 0);
  const gap = (a: FracBox, b: FracBox) => Math.max(...(['x0', 'y0', 'x1', 'y1'] as const).map((k) => Math.abs(a[k] - b[k])));

  for (const id of Object.keys(WORLD_COMPOSITIONS))
    it(`${id}: every seat, one slot and two, every test line in every face: the plan's box and type within 1 px of the renderer's`, () => {
      const world = FREE_STYLES.find((s) => s.id === id)!.world;
      const sets = [...new Set([...world.layouts.lines.map((l) => l.set), ...pageSeatsOf(id)])];
      for (const font of fonts)
        for (const set of sets)
          for (const slot of [{ k: 0, of: 1 }, { k: 0, of: 2 }])
            for (const text of SEAT_TEXTS) {
              const [p, r] = [laidSeat(text, set, { slot, font })!, laidSeat(text, set, { slot, measure: SET_SPECS[set].even ? evenMeasure : real(font) })!];
              const at = `${font} ${set} ${slot.of} ${text}`;
              expect(gap(p.boxPx, r.boxPx), at).toBeLessThanOrEqual(1);
              expect(Math.abs(p.size - r.size), at).toBeLessThanOrEqual(1);
            }
    });

  it('blueprint/lettering (an even set): Latin and spaces laid one em a character on both sides, as world-layout measures it', () => {
    expect(SET_SPECS['blueprint/lettering'].even).toBe(true);
    for (const font of fonts)
      for (const text of ['Baby I love you', 'Hold me tight tonight 抱緊我', 'Shine on me tonight forever 抱緊我'])
        for (const slot of [{ k: 0, of: 1 }, { k: 0, of: 2 }]) {
          const [p, r] = [laidSeat(text, 'blueprint/lettering', { slot, font })!, laidSeat(text, 'blueprint/lettering', { slot, measure: evenMeasure })!];
          expect(gap(p.boxPx, r.boxPx), `${font} ${text}`).toBeLessThanOrEqual(1);
          expect(p.size, `${font} ${text}`).toBe(r.size);
        }
  });

  it('art-deco marquee: the scheduler and the renderer split a line the same way, the two boxes within 1 px (spaces and Latin included)', () => {
    let both = 0;
    const latin = new Set<string>();
    for (const font of fonts)
      for (const set of ['art-deco/marquee+panels', 'art-deco/marquee-low+panels'])
        for (const text of SEAT_TEXTS) {
          const [p, r] = [panelSplit(laidSeat(text, set, { font })), panelSplit(laidSeat(text, set, { measure: real(font) }))];
          expect(!!p, `${font} ${set} ${text}`).toBe(!!r);
          if (!p || !r) continue;
          both++;
          if (/[A-Za-z]/.test(text)) latin.add(text);
          expect(Math.max(gap(p.main, r.main), gap(p.panel, r.panel)), `${font} ${set} ${text}`).toBeLessThanOrEqual(1);
        }
    expect(both).toBeGreaterThan(0);
    expect(latin.size, 'a split with Latin and spaces').toBeGreaterThan(0);
  });

  it('the plan offers the panels seat exactly where the split gives two boxes, on the job\'s face', () => {
    for (const font of fonts)
      for (const text of SEAT_TEXTS)
        expect(pageSeatsFor(text, 'art-deco/marquee', 'art-deco', font).includes('art-deco/marquee+panels'), `${font} ${text}`).toBe(!!panelSplit(laidSeat(text, 'art-deco/marquee+panels', { measure: real(font) })));
  });

  it('the parts as drawn hold every glyph the typesetter enlarges (a leading kanji, Latin) and the gap where Latin meets kana', () => {
    const spec = SET_SPECS['art-deco/marquee+panels'];
    const m = layoutMeasure('Huninn');
    const plain = laidSeat('漢字の話です ことばの話', spec, { measure: m })!.parts!;
    const bare = laidSeat('かなのはなしです ことばの話', spec, { measure: m })!.parts!;
    // (a leading kanji sets at 1.18: its row grows up past the em box; a row of kana does not)
    expect(plain.main.y0).toBeLessThan(bare.main.y0);
    const b = blockOf('Hold me tight tonight 抱緊我', spec, m);
    const p = laidSeat('Hold me tight tonight 抱緊我', spec, { measure: m })!.parts!;
    const row = b.lines![0];
    // (wider than its row box: Latin sets at 1.08)
    expect((p.main.x1 - p.main.x0) / 0.75).toBeGreaterThan(row.bw);
  });
});
