// The type floor at every place a world line's size is decided (render/type-floor.ts, docs/research/2026-11-12-type-floor.md).
import { describe, expect, it } from 'vitest';
import type { Glyph } from './glyphs';
import { fitAtFloor, floorOf, heldScale, layFloorOf, leastOf, shearGain, TYPE_FLOOR, underFloor } from './type-floor';
import { blowPose } from './world-layout';
import { blockOf, SET_SPECS, type SetSpec } from './world-sets';
import { slotSpec } from './seat-geometry';
import { setWordSafe } from '../phrases';
import { CALL_SIZE } from './engine';

const em = (s: string) => [...s].length * 100;
/** Lines of the five measured songs that some step set small before 2026-11-12 (phase 4d round 6 and the drawn scan). */
const LONG = [
  'きゅんとさせてほしい 恋に恋しているんです︕',
  '教拳腳武術的老闆練鐵沙掌 耍楊家槍',
  'フィクションみたいな恋したい でも”繋がり”はNG',
  '為人耿直不屈 一身正氣',
  '店裡面的媽媽桑 茶道有三段',
  '什麼兵器? 最喜歡雙截棍柔中帶剛',
  '想要去河南嵩山學少林跟武當',
  'ああしたいこうしたいが止まらないのに現実は…リアル',
  'はるか！ぴあの！りほ！なみ！とうか！',
  '快使用雙截棍 哼哼哈兮',
  '風生水起',
];

describe('the type floor (one rule)', () => {
  it("is the set's lo or the product's floor, whichever is larger, with half a pixel for rounding", () => {
    expect(floorOf({ lo: 70 })).toBe(TYPE_FLOOR.lo);
    expect(floorOf({ lo: 110 })).toBe(110);
    expect(underFloor(83.6)).toBe(false);
    expect(underFloor(83.4)).toBe(true);
    expect(leastOf({ size: 154, lines: [{ size: 154 }, { size: 83 }] })).toBe(83);
    expect(leastOf({ size: 120 })).toBe(120);
  });
});

describe('a scale put on type already set (heldScale: the stack stepping back, the typesetter\'s particle; fitAtFloor: the frame fit)', () => {
  it('keeps the type at the floor, never above its own size', () => {
    expect(heldScale(0.7, 96)).toBeCloseTo(TYPE_FLOOR.lo / 96);
    expect(heldScale(0.7, 200)).toBe(0.7);
    expect(heldScale(0.78, 100)).toBeCloseTo(0.84);
    expect(heldScale(0.78, 60)).toBe(1);
  });
  it('lifts the frame fit to the floor as far as the words alone fit, never below the fit of the whole', () => {
    expect(fitAtFloor(0.91, 86, 84, 1)).toBeCloseTo(84 / 86);
    expect(fitAtFloor(0.91, 86, 84, 0.95)).toBeCloseTo(0.95);
    expect(fitAtFloor(0.91, 86, 84, 0.8)).toBeCloseTo(0.91);
    expect(fitAtFloor(0.98, 120, 84, 1)).toBe(0.98);
  });
});

describe('a set never lays a line under the floor unmarked (blockOf: split parts, frame fit, bands, a shared shot)', () => {
  it('every set, every slot of a shared shot: each part at the floor, or the line marked floorMiss for the composer', () => {
    setWordSafe(true);
    try {
      for (const [id, given] of Object.entries(SET_SPECS))
        for (const slot of [undefined, { k: 0, of: 2 }, { k: 1, of: 2 }])
          for (const text of LONG) {
            const spec: SetSpec = slotSpec(given, slot);
            const b = blockOf(text, spec, em);
            if (!b.floorMiss) expect(leastOf(b), `${id} ${slot?.k ?? '-'} ${text}`).toBeGreaterThanOrEqual(layFloorOf(spec) - 0.5);
          }
    } finally {
      setWordSafe(false);
    }
  }, 60000);
  it('keeps a split line\'s small part at the floor (the hero gives way) or lays the line whole (xerox blown-r, screentone shout, notebook dotted, brutalist headline)', () => {
    for (const [id, text] of [['xerox/blown-r', LONG[0]], ['screentone/shout', LONG[1]], ['notebook/dotted', LONG[2]], ['brutalist/headline', LONG[4]]] as const) {
      const b = blockOf(text, SET_SPECS[id], em);
      if (b.floorMiss) continue;
      expect(leastOf(b), id).toBeGreaterThanOrEqual(layFloorOf(SET_SPECS[id]) - 0.5);
    }
  });
  it('marks a column too long for the frame at the floor instead of setting it small (the frame fit)', () => {
    const column: SetSpec = { at: [0.5, 0.05], ax: 0, ay: -1, share: 0.08, tall: 0.9, hi: 120, lo: 70, rows: [1, 1], lead: 1.05, track: 0.05, vertical: true };
    const b = blockOf('あいうえおかきくけこさしすせそたちつてと', column, em);
    expect(b.floorMiss).toBe(true);
    // a short one fits and is not marked
    expect(blockOf('あいうえお', column, em).floorMiss).toBeUndefined();
  });
  it('wraps a long row in the set\'s own rows before it marks the line', () => {
    const wide: SetSpec = { at: [0.5, 0.5], ax: 0, ay: 0, share: 0.5, tall: 0.6, hi: 150, lo: 70, rows: [1, 3], lead: 1.16, track: 0 };
    const b = blockOf('あいうえおかきくけこさしすせそたちつてとなにぬねの', wide, em);
    expect(b.floorMiss).toBeUndefined();
    expect(b.rows.length).toBeGreaterThan(1);
    expect(leastOf(b)).toBeGreaterThanOrEqual(TYPE_FLOOR.lo);
  });
});

describe('the floor as drawn: through the set\'s shear (type size is the em height)', () => {
  it('reads the vertical axis of the map, never above 1: a narrow face is condensed, not small', () => {
    expect(shearGain(undefined)).toBe(1);
    expect(shearGain([0.75, 0, 0, 1])).toBe(1);
    expect(shearGain([0.85, 0, 0, 1])).toBe(1);
    expect(shearGain([1, 0, Math.tan((-9 * Math.PI) / 180), 1])).toBe(1);
    expect(shearGain([Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0, 1])).toBe(1);
    expect(shearGain([1, 0, 0, 0.8])).toBeCloseTo(0.8);
    expect(shearGain([1.3, 0, 0, 1.3])).toBe(1);
  });
  it('lays a set that squashes its height at the floor over its gain, in whole pixels', () => {
    expect(layFloorOf({ lo: 70, shear: [1, 0, 0, 0.8] })).toBe(105);
    expect(layFloorOf({ lo: 130, shear: [1, 0, 0, 0.8] })).toBe(130);
    expect(layFloorOf({ lo: 70, shear: [0.75, 0, 0, 1] })).toBe(TYPE_FLOOR.lo);
    expect(layFloorOf({ lo: 70 })).toBe(TYPE_FLOOR.lo);
  });
  it('every art-deco set, every slot: at the floor as an em height, or marked floorMiss', () => {
    setWordSafe(true);
    try {
      for (const [id, given] of Object.entries(SET_SPECS).filter(([k]) => k.startsWith('art-deco/')))
        for (const slot of [undefined, { k: 0, of: 2 }])
          for (const text of LONG) {
            const spec = slotSpec(given, slot);
            const b = blockOf(text, spec, em);
            if (!b.floorMiss) expect(leastOf(b) * shearGain(spec.shear), `${id} ${slot?.k ?? '-'} ${text}`).toBeGreaterThanOrEqual(TYPE_FLOOR.lo - 0.5);
          }
    } finally {
      setWordSafe(false);
    }
  }, 60000);
});

describe('the words round a blown-up word (blowPose)', () => {
  const glyphs = (text: string, tex: number): Glyph[] => [...text].map((char, i) => ({ char, advance: tex, x: 0, y: 0, index: i, src: i }) as unknown as Glyph);
  it('stand at the floor at least, or the word is not blown up', () => {
    const spec = SET_SPECS['popart/balloon'];
    for (const [text, from, to] of [['快使用雙截棍哼哼哈兮', 3, 6], ['きゅんとさせてほしい恋に恋しているんです', 0, 2], ['風生水起', 0, 2], ['あいうえおかきくけこさしすせそたちつてとなにぬね好き', 24, 26]] as const) {
      for (const normal of [84, 100, 130]) {
        const p = blowPose(glyphs(text, 200), from, to, normal, 200, spec);
        if (!p) continue;
        const small = p.sizes!.filter((_, i) => i < from || i >= to).map((s) => s * 200);
        for (const s of small) expect(s, `${text} ${normal}`).toBeGreaterThanOrEqual(layFloorOf(spec) - 0.5);
      }
    }
  });
  it('a lead-in too long to stand across the frame at the floor leaves the word as set', () => {
    const text = 'あいうえおかきくけこさしすせそたちつてとなにぬね好き';
    expect(blowPose(glyphs(text, 200), 24, 26, 100, 200, SET_SPECS['popart/balloon'])).toBeUndefined();
  });
});

describe("a line's calls", () => {
  it('are set at the floor: sung words too', () => {
    expect(CALL_SIZE).toBeGreaterThanOrEqual(TYPE_FLOOR.lo);
  });
});
