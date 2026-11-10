// The carrier containment rule and the line clearance (phase 4d round 2, render/carrier-fit.ts), the band sets as their
// pages print them, the balloon tail's proportion, and the reading gate's two declared-geometry rules on synthetic frames.
import { describe, expect, it } from 'vitest';
import { bandFit, edgesOf, gapOf, LINE_CLEAR, reachOf, strokeClear, subtractBox, toPx, type Band, type FracBox } from './carrier-fit';
import { blockOf, SET_SPECS, TYPE_FLOOR, type SetSpec } from './world-sets';
import { layoutMeasure } from './layout-measure';
import { roughMeasure, slotSpec } from './seat-geometry';
import { BALLOON_TAIL, wedgeTail } from './balloon-tail';
import { countMoment, declaredRules, emptyCounts, regressions, RULES, type RuleMoment } from '../reading-rules';
import { frameChange, GRID } from './frame-check';
import { MC_BARS } from './world-b5b-sets';

const TEXT = '三年後的大雪';
// (one row, centred: six CJK ems at up to 150 px)
const plain: SetSpec = { at: [0.5, 0.5], ax: 0, ay: 0, share: 0.5, tall: 0.2, hi: 150, lo: 70, rows: [1, 1], lead: 1.16, track: 0 };
const withBand = (box: FracBox, o: Partial<Band> = {}, s: Partial<SetSpec> = {}): SetSpec => ({ ...plain, ...s, bands: [{ box, ...o }] });
const TEXTS = ['三年後的大雪', '夜晚的橋邊在飄雪', '我再也不在你身邊', '這次我們的手沒牽好', '無盡的思念總是破碎在冬天', '快使用雙截棍 哼哼哈兮', 'あの星あかりを 海の広さを', 'Baby I love you', 'こんなに綺麗じゃん!', '他們兒子我習慣從小就耳濡目染什麼刀槍跟棍棒我都耍的有模有樣'];
const FACES = ['Huninn', 'Chocolate Classical Sans', 'Shippori Antique B1', 'Noto Sans TC', 'Zen Maru Gothic'];

describe('carrier containment: a part read on a band keeps its ink, what is printed with it and a padding inside', () => {
  it('fits: a band with room leaves the line as the set lays it', () => {
    const s = withBand([0.2, 0.3, 0.8, 0.7]);
    const { bands: _b, ...bare } = s;
    expect(blockOf(TEXT, s, roughMeasure)).toEqual(blockOf(TEXT, bare, roughMeasure));
    expect(bandFit(blockOf(TEXT, s, roughMeasure), s).ok).toBe(true);
  });

  it('shrinks: a band too narrow at the reading size sets the line smaller until ink and padding fit', () => {
    const s = withBand([0.27, 0.3, 0.73, 0.7]);
    const b = blockOf(TEXT, s, roughMeasure);
    expect(b.size).toBeLessThan(150);
    expect(b.size).toBeGreaterThanOrEqual(TYPE_FLOOR.lo);
    expect(b.bandMiss).toBeUndefined();
    const f = bandFit(b, s);
    expect(f.ok).toBe(true);
    const band = toPx(s.bands![0].box);
    const pad = 0.35 * b.size;
    expect(f.parts[0].ink.x0 - pad).toBeGreaterThanOrEqual(band.x0 - 1e-6);
    expect(f.parts[0].ink.x1 + pad).toBeLessThanOrEqual(band.x1 + 1e-6);
  });

  it('shrinks to the floor and no further; a band too small even there is a miss (the composer takes another set)', () => {
    // (at the floor, 84 px: six ems and two paddings are 6.7 × 84 = 563 px)
    const near = blockOf(TEXT, withBand([0.345, 0.3, 0.655, 0.7]), roughMeasure);
    expect(near.bandMiss).toBeUndefined();
    expect(near.size).toBeGreaterThanOrEqual(TYPE_FLOOR.lo);
    expect(near.size).toBeLessThan(95);
    const miss = blockOf(TEXT, withBand([0.45, 0.45, 0.55, 0.55]), roughMeasure);
    expect(miss.bandMiss).toBe(true);
    expect(miss.size).toBeLessThanOrEqual(TYPE_FLOOR.lo);
  });

  it('widens: a band its set lets grow is grown round the line instead of shrinking it', () => {
    const s = withBand([0.35, 0.4, 0.65, 0.6], { grow: [0.1, 0.2, 0.9, 0.8] });
    const b = blockOf(TEXT, s, roughMeasure);
    expect(b.size).toBe(150);
    const f = bandFit(b, s);
    expect(f.ok).toBe(true);
    expect(f.parts[0].grown).toBe(true);
    expect(f.parts[0].band.x0).toBeLessThan(0.35 * 1920);
  });

  it('counts what is printed with the letters: a second plate out of register needs room the plain letters do not', () => {
    const s = withBand([0.2, 0.3, 0.8, 0.7], {}, { under: [{ kind: 'mc-reg', tone: 'accent' }] });
    expect(reachOf(s)).toEqual([0, 0, 0.03, 0.022]);
    const b = blockOf(TEXT, s, roughMeasure);
    const f = bandFit(b, s);
    expect(f.parts[0].ink.x1).toBeCloseTo(960 + b.cx + b.w / 2 + 0.03 * b.size, 6);
  });

  it('keeps clear of the band\'s lines: a key plate line within 12 px is a miss until the line is set smaller', () => {
    const plainB = blockOf(TEXT, plain, roughMeasure);
    const x1 = 960 + plainB.cx + plainB.w / 2;
    const line: FracBox = [(x1 + 5) / 1920, 0.3, (x1 + 8) / 1920, 0.7];
    const s = withBand([0.1, 0.2, 0.9, 0.8], { lines: [line] });
    expect(bandFit(plainB, s).parts[0].miss).toBe('line');
    const b = blockOf(TEXT, s, roughMeasure);
    expect(bandFit(b, s).ok).toBe(true);
    expect(gapOf(bandFit(b, s).parts[0].ink, toPx(line))).toBeGreaterThanOrEqual(LINE_CLEAR);
  });
});

describe('the band sets as their pages print them (midcentury, claymation, scrapbook), every face and test line', () => {
  const sets = Object.keys(SET_SPECS).filter((k) => SET_SPECS[k].bands?.length);
  it('declares its bands and, for midcentury, its key plates\' lines', () => {
    expect(sets.sort()).toEqual(['claymation/strips', 'claymation/strips-r', 'midcentury/cut', 'midcentury/cut-r', 'midcentury/sleeve', 'scrapbook/card', 'scrapbook/card-r', 'scrapbook/dots', 'scrapbook/index', 'scrapbook/index-r', 'scrapbook/spread']);
    for (const s of ['midcentury/cut', 'midcentury/cut-r', 'midcentury/sleeve']) for (const b of SET_SPECS[s].bands!) expect(b.lines?.length, s).toBe(4);
    // (the key plate is the bar itself, printed off register by its offset)
    const [x, y, w, h] = MC_BARS.cut.main;
    expect(SET_SPECS['midcentury/cut'].bands![0].lines).toEqual(edgesOf(x + MC_BARS.cut.key[0], y + MC_BARS.cut.key[1], w, h, 6));
  });

  for (const set of ['midcentury/cut', 'midcentury/cut-r', 'midcentury/sleeve', 'claymation/strips', 'claymation/strips-r', 'scrapbook/card', 'scrapbook/card-r', 'scrapbook/index', 'scrapbook/index-r', 'scrapbook/dots', 'scrapbook/spread'])
    it(`${set}: each line either stays on its bands with its padding and 12 px from their lines, or is marked a miss — never drawn over the edge`, () => {
      const spec = SET_SPECS[set];
      let fit = 0;
      for (const font of FACES)
        for (const text of TEXTS) {
          const b = blockOf(text, spec, layoutMeasure(font));
          const f = bandFit(b, spec);
          if (b.bandMiss) continue;
          fit++;
          expect(f.ok, `${font} ${text} ${JSON.stringify(f.parts.map((p) => p.miss))}`).toBe(true);
          for (const p of f.parts) {
            const band = toPx(spec.bands!.find((x) => (x.part ?? 'main') === p.part)!.box);
            expect([p.need.x0 >= band.x0 - 1e-6, p.need.y0 >= band.y0 - 1e-6, p.need.x1 <= band.x1 + 1e-6, p.need.y1 <= band.y1 + 1e-6], `${font} ${text} ${p.part}`).toEqual([true, true, true, true]);
            for (const l of spec.bands!.find((x) => (x.part ?? 'main') === p.part)!.lines ?? []) expect(gapOf(p.ink, toPx(l)), `${font} ${text}`).toBeGreaterThanOrEqual(LINE_CLEAR);
          }
        }
      expect(fit, set).toBeGreaterThan(TEXTS.length * FACES.length * 0.6);
    });

  it('a shared shot\'s two lines are fitted where world-layout draws them, a slot above and below the set\'s place (scrapbook\'s torn paper, choroin c020/c021)', () => {
    let n = 0;
    for (const set of ['scrapbook/dots', 'scrapbook/card', 'midcentury/cut', 'claymation/strips'])
      for (const k of [0, 1])
        for (const text of TEXTS.slice(0, 6)) {
          const spec = slotSpec(SET_SPECS[set], { k, of: 2 });
          const b = blockOf(text, spec, layoutMeasure('Huninn'));
          if (b.bandMiss) continue;
          // (world-layout firstAt)
          const shift = (0.5 - k) * Math.max(b.h + b.size * 0.4, spec.tall * 1080);
          expect(bandFit({ ...b, cy: b.cy + shift }, spec).ok, `${set} ${k} ${text}`).toBe(true);
          n++;
        }
    expect(n).toBeGreaterThan(20);
  });

  it('midcentury\'s cut-r and sleeve lines of the critic\'s frames now fit (they ran 3 px and 7 px from the edge and the key line)', () => {
    for (const [set, text] of [['midcentury/cut-r', '三年後的大雪'], ['midcentury/cut-r', '夜晚的橋邊在飄雪'], ['midcentury/sleeve', '這次我們的手沒牽好'], ['midcentury/sleeve', '三年後的大雪']] as const)
      for (const font of FACES) {
        const b = blockOf(text, SET_SPECS[set], layoutMeasure(font));
        expect(b.bandMiss, `${set} ${font} ${text}`).toBeUndefined();
        expect(bandFit(b, SET_SPECS[set]).ok, `${set} ${font} ${text}`).toBe(true);
      }
  });
});

describe('a page\'s line never comes within 12 px of the words (strokeClear), at every place the words stand', () => {
  const fake = () => { const calls: string[] = []; return { calls, c: { save: () => calls.push('save'), restore: () => calls.push('restore'), beginPath: () => {}, rect: () => {}, clip: () => calls.push('clip') } as unknown as CanvasRenderingContext2D }; };
  it('draws whole with no words, clipped round them otherwise; what it reports as drawn keeps the clearance', () => {
    const lines = SET_SPECS['midcentury/cut'].bands![0].lines!.map(toPx);
    const none = fake();
    expect(strokeClear(none.c, () => none.calls.push('draw'), lines, undefined)).toEqual(lines);
    expect(none.calls).toEqual(['draw']);
    // (the words over the band's right end, as the critic's frame had them, and moved along it a frame at a time)
    for (let dx = -400; dx <= 40; dx += 20) {
      const words = { x0: 900 + dx, y0: 300, x1: 1490 + dx, y1: 440 };
      const f = fake();
      const drawn = strokeClear(f.c, () => f.calls.push('draw'), lines, words);
      expect(f.calls).toEqual(['save', 'clip', 'draw', 'restore']);
      for (const l of drawn) expect(gapOf(l, words), `${dx}`).toBeGreaterThanOrEqual(LINE_CLEAR - 1e-6);
    }
  });
  it('subtractBox cuts a thin line along its length only', () => {
    expect(subtractBox({ x0: 0, y0: 10, x1: 100, y1: 12 }, { x0: 40, y0: 0, x1: 60, y1: 30 })).toEqual([{ x0: 0, y0: 10, x1: 40, y1: 12 }, { x0: 60, y0: 10, x1: 100, y1: 12 }]);
    expect(subtractBox({ x0: 0, y0: 10, x1: 100, y1: 12 }, { x0: 40, y0: 20, x1: 60, y1: 30 })).toEqual([{ x0: 0, y0: 10, x1: 100, y1: 12 }]);
  });
});

describe('a balloon\'s tail is the short wide wedge (cards 2026-11-04-popart-balloon-line, 2026-11-09-screentone-balloon-thin-line)', () => {
  it('its root about 110 px along the rim, its tip at most 96 px off it, never longer than its root, for popart\'s balloon sizes', () => {
    for (const [w, h] of [[1075, 864], [870, 396], [706, 418], [300, 860]]) {
      const [cx, cy, rx, ry] = [w / 2, h / 2, w / 2 - 4, h / 2 - 4];
      for (const dir of [-1, 1]) {
        const t = wedgeTail(cx, cy, rx, ry, [cx + dir * (rx * 0.62 + 40), cy + ry + 40]);
        const [p, q] = [[cx + Math.cos(t.from) * rx, cy + Math.sin(t.from) * ry], [cx + Math.cos(t.to) * rx, cy + Math.sin(t.to) * ry]];
        const root = Math.hypot(p[0] - q[0], p[1] - q[1]);
        // (its length off the rim, from the rim point it is aimed out of: the middle of its root's arc)
        const a = (t.from + t.to - 2 * Math.PI) / 2;
        const len = Math.hypot(t.tip[0] - (cx + Math.cos(a) * rx), t.tip[1] - (cy + Math.sin(a) * ry));
        expect(root, `${w}×${h}`).toBeGreaterThan(BALLOON_TAIL.root * 0.85);
        expect(root, `${w}×${h}`).toBeLessThan(BALLOON_TAIL.root * 1.1);
        expect(len, `${w}×${h}`).toBeLessThanOrEqual(BALLOON_TAIL.len + 1e-6);
        expect(len / root, `${w}×${h}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the reading gate\'s declared-geometry rules (carrier-overflow, rule-crosses-text), one glyph enough', () => {
  const [w, h] = [480, 270];
  // (the band drawn in the frame, 100–400 × 50–150 at 480 × 270, in a mid grey; `drawn` false: a page not on screen)
  const frames = (ink: [number, number, number, number][], drawn = true) => {
    const off = new Uint8ClampedArray(w * h * 4).fill(200);
    if (drawn) for (let y = 50; y < 150; y++) for (let x = 100; x < 400; x++) { const i = (y * w + x) * 4; off[i] = off[i + 1] = off[i + 2] = 120; }
    const on = Uint8ClampedArray.from(off);
    for (const [x0, y0, x1, y1] of ink) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; on[i] = on[i + 1] = on[i + 2] = 20; }
    return { on, off };
  };
  // (a band 400–1600 × 200–600 px of 1080p is 100–400 × 50–150 at 480 × 270; a line along its right edge 16 px off register)
  const declared = [{ carriers: [{ x0: 400, y0: 200, x1: 1600, y1: 600 }], lines: [{ x0: 1613, y0: 214, x1: 1619, y1: 614 }], scope: { x0: 340, y0: 140, x1: 1660, y1: 660 } }];
  const m = (r: { overflow: number; ruleCross: number }): RuleMoment => ({ text: 0.05, box: [0, 0, 1, 1], clip: false, plate: 0, small: false, ink: 0, cross: 0, low: 0, overflow: r.overflow, ruleCross: r.ruleCross });
  it('a line well inside its band: neither', () => {
    const { on, off } = frames([[130, 80, 330, 120]]);
    expect(declaredRules(on, off, w, h, declared)).toEqual({ overflow: 0, ruleCross: 0 });
  });
  it('one glyph past the band\'s end (a few pixels of a long line): carrier-overflow, and within the key line\'s clearance: rule-crosses-text', () => {
    const { on, off } = frames([[130, 80, 380, 120], [380, 80, 404, 120]]);
    const r = declaredRules(on, off, w, h, declared);
    expect(r.overflow).toBeGreaterThanOrEqual(RULES.overflowPixels);
    expect(r.ruleCross).toBeGreaterThanOrEqual(RULES.ruleCrossPixels);
    const c = countMoment(emptyCounts(), m(r), false);
    expect([c['carrier-overflow'], c['rule-crosses-text']]).toEqual([1, 1]);
    // (an absolute count: the one glyph fails the moment however many glyphs read well beside it)
    expect(r.overflow).toBeLessThan(0.05 * 250 * 40);
  });
  it('a glyph wholly past the band\'s end joined to the line counts; a call set apart on the paper does not', () => {
    // (the line runs on, a letter's gap past the band's end; a call 30 px of 1080p above the band, apart from the line)
    expect(declaredRules(...Object.values(frames([[130, 80, 398, 120], [400, 80, 425, 120]])) as [Uint8ClampedArray, Uint8ClampedArray], w, h, declared).overflow).toBeGreaterThanOrEqual(RULES.overflowPixels);
    const call = frames([[130, 80, 330, 120], [150, 35, 220, 42]]);
    expect(declaredRules(call.on, call.off, w, h, declared).overflow).toBe(0);
  });
  it('a band declared by a page that is not on screen (a transition\'s other layer) is not read', () => {
    const { on, off } = frames([[130, 80, 380, 120], [380, 80, 404, 120]], false);
    expect(declaredRules(on, off, w, h, declared)).toEqual({ overflow: 0, ruleCross: 0 });
  });
  it('both rules are absolute: one moment fails whatever the baseline recorded, with no slack', () => {
    const before = { ...emptyCounts(), moments: 489, 'carrier-overflow': 53, 'rule-crosses-text': 194 };
    expect(regressions(before, { ...emptyCounts(), moments: 489, 'carrier-overflow': 1 })).toEqual(['carrier-overflow']);
    expect(regressions(before, { ...emptyCounts(), moments: 489, 'rule-crosses-text': 1 })).toEqual(['rule-crosses-text']);
    expect(regressions(before, { ...emptyCounts(), moments: 489 })).toEqual([]);
  });
});

describe('the frame check: a change of dots or of colour alone is no cut, an outline is (controls)', () => {
  const { w, h } = GRID;
  const ground = (f: (x: number, y: number) => number) => Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)));
  // (popart's halftone at 1/6 scale: dots whose size grows away from a focus that follows the line)
  const dots = (fx: number, fy: number) => (x: number, y: number) => { const [cx, cy] = [Math.round(x / 6) * 6, Math.round(y / 6) * 6]; return Math.hypot(x - cx, y - cy) <= 0.6 + Math.min(2.6, Math.hypot(cx - fx, cy - fy) / 60) ? 60 : 230; };
  const words = (g: number[], b: [number, number, number, number]) => g.map((v, i) => { const [x, y] = [i % w, Math.floor(i / w)]; return x >= b[0] && x < b[2] && y >= b[1] && y < b[3] && (x + y) % 3 === 0 ? 20 : v; });
  const frame = (g: number[], b: [number, number, number, number]) => ({ on: words(g, b), off: g, bare: g });
  const at: [number, number, number, number] = [90, 70, 230, 100];
  it('dots only: the screen re-centred round the next line, the words in the same seat', () => {
    expect(frameChange(frame(ground(dots(160, 85)), at), frame(ground(dots(150, 90)), at)).seen).toBe(false);
  });
  it('colour only: the band under the words printed in another ink', () => {
    const band = (inside: number, out: number) => ground((x, y) => (y > 60 && y < 110 && x > 70 && x < 250 ? inside : out));
    expect(frameChange(frame(band(200, 120), at), frame(band(170, 90), at)).seen).toBe(false);
  });
  it('an outline that comes round the words is still a change', () => {
    const outline = ground((x, y) => ((Math.abs(x - 70) < 2 || Math.abs(x - 250) < 2) && y > 55 && y < 115) || ((Math.abs(y - 55) < 2 || Math.abs(y - 115) < 2) && x > 70 && x < 250) ? 30 : 230);
    expect(frameChange(frame(ground(() => 230), at), frame(outline, at)).seen).toBe(true);
  });
});
