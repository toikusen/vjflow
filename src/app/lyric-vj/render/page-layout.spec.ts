/// <reference types="node" />
// The screentone whole-page contract under Q3's scale composition (docs/research/2026-11-10-phase4-codex.md §4,
// docs/research/2026-11-10-screentone-page-layout.md): one page laid from the glyphs as drawn, every invariant a check
// (verifyPage), a refusal where no legal page exists.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateMeasure, fitOf } from '../scale-policy';
import { DECLARED_SCALE_CAPS } from '../scale-caps-draft';
import { freeJob } from '../free-plan';
import { FREE_STYLES } from '../free-styles';
import { scaleOf } from '../world-shared';
import { BALLOON, boxInsideOutline, carrierKindOf, inside, NARRATION_PAD, PAGE_H, PAGE_PANEL, PAGE_SAFE, PAGE_W, pageGlyphRoom, pageLayout, selfCrosses, TAIL, verifyPage, type Box, type PageInput, type PageLine, type PageSolution } from './page-layout';
import { scaleLayout, scalePage, type LineScale } from './scale-pose';
import { cutOf } from './world-layout';
import { WORLD_ENTERS, WORLD_EXITS } from './world-motion';

const plan = (o: Partial<LineScale> = {}): LineScale => ({ eventId: 'scale:c1', sectionId: 'S0', kind: 'edgeFit', source: 'meaning', ratio: 2.4, targetSize: 240, readingSize: 100, span: { from: 0, to: 4 }, edge: 'top', rows: ['手沒牽好'], carrierRole: 'panel', carrierId: 'ground:screentone/shout', ...o });
/** A scaled line as the renderer lays it (scaleLayout on a measure), as a page line. */
const laid = (text: string, p: LineScale, reading = 84) => {
  const d = scaleLayout(text, p, reading, { track: 0.04 }, estimateMeasure);
  expect(d.kind).not.toBe('miss');
  return d;
};
const lineOf = (text: string, p: LineScale, id = 'c1'): PageLine => {
  const d = laid(text, p);
  return { id, boxes: d.glyphs.map((g) => ({ x0: g.x - g.size / 2, y0: g.y - g.size / 2, x1: g.x + g.size / 2, y1: g.y + g.size / 2 })), size: d.size, scaled: true, show: 10 };
};
const ok = (input: PageInput): PageSolution => {
  const s = pageLayout(input);
  if (!s.ok) throw new Error(s.why.join('; '));
  expect(verifyPage(s, input)).toEqual([]);
  return s;
};
const row = (x0: number, y0: number, n: number, size: number): Box[] => Array.from({ length: n }, (_, i) => ({ x0: x0 + i * size, y0, x1: x0 + (i + 1) * size, y1: y0 + size }));
const names = (s: PageSolution, input: PageInput) => verifyPage(s, input).map((v) => v.invariant);
/** A scaled line set flush on the safe area's edge (an edgeFit that could not close): its page can only bleed. */
const flush = (edge: 'top' | 'bottom', id = 'c1'): PageLine => ({ id, boxes: [...row(500, edge === 'top' ? PAGE_SAFE.y0 + 8 : PAGE_SAFE.y1 - 208, 4, 200), ...row(560, edge === 'top' ? PAGE_SAFE.y0 + 240 : PAGE_SAFE.y1 - 300, 5, 84)], size: 200, scaled: true, show: 10 });

describe('pageLayout: the whole page round a scaled line', () => {
  // (a line set large on the top edge, like 這次我們的手沒牽好: its words before beside it, the big text flush on the edge)
  const top = (page = 'screentone/shout', text = '這次我們的手沒牽好') => ({ page, edge: 'top' as const, lines: [lineOf(text, plan({ carrierId: `ground:${page}`, span: { from: 5, to: 9 } }))] });

  it('carries every present line exactly once, on one page panel, none empty (oneCarrier, noEmptyPanel, noInnerPanelLine)', () => {
    const input = top();
    const s = ok(input);
    expect(s.panels.length).toBe(1);
    expect(s.panels[0].carries).toEqual(['c1']);
    expect(s.carriers.map((c) => c.line)).toEqual(['c1']);
  });

  it('closes the carrier first when the words leave it room (the fitter\'s closed setting), bleeding only when they do not', () => {
    expect(ok(top()).mode).toBe('closed');
    expect(ok({ page: 'screentone/shout', edge: 'top', lines: [flush('top')] }).mode).toBe('bleed');
  });

  it('bleeds through the declared top edge only, path closed and simple, clipped by no other side (bleedOnlyDeclared, pathSimple, bleedClip)', () => {
    const input = { page: 'screentone/shout', edge: 'top' as const, lines: [flush('top')] };
    const s = ok(input);
    expect(s.mode).toBe('bleed');
    expect(s.panels[0].open).toBe('top');
    const o = s.carriers[0].outline;
    expect(selfCrosses(o)).toBe(false);
    expect(o.some(([, y]) => y < 0)).toBe(true);
    for (const [x, y] of o) {
      expect(x).toBeGreaterThanOrEqual(PAGE_SAFE.x0 + BALLOON.stroke / 2 - 1e-6);
      expect(x).toBeLessThanOrEqual(PAGE_SAFE.x1 - BALLOON.stroke / 2 + 1e-6);
      expect(y).toBeLessThanOrEqual(PAGE_SAFE.y1);
    }
  });

  it('bleeds through the bottom edge as well, the foot moved to the top (bottom bleed)', () => {
    const page = 'screentone/burst';
    const input = { page, edge: 'bottom' as const, lines: [flush('bottom')] };
    const s = ok(input);
    expect(s.mode).toBe('bleed');
    expect(s.panels[0].open).toBe('bottom');
    expect(s.foot).toBe('top');
    expect(s.carriers[0].outline.some(([, y]) => y > PAGE_H)).toBe(true);
    expect(s.carriers[0].outline.every(([, y]) => y >= PAGE_SAFE.y0)).toBe(true);
  });

  it('holds the full glyphs and their padding, all inside the safe area (balloonHolds, glyphsInSafe)', () => {
    const input = top();
    const s = ok(input);
    for (const b of input.lines[0].boxes) {
      expect(boxInsideOutline(s.carriers[0].outline, { x0: b.x0 - BALLOON.pad + 1, y0: b.y0 - BALLOON.pad + 1, x1: b.x1 + BALLOON.pad - 1, y1: b.y1 + BALLOON.pad - 1 })).toBe(true);
      expect(b.x0).toBeGreaterThanOrEqual(PAGE_SAFE.x0);
      expect(b.y1).toBeLessThanOrEqual(PAGE_SAFE.y1);
    }
  });

  it('closes a balloon round words with room inside the safe area (closed mode)', () => {
    const lines: PageLine[] = [{ id: 'c1', boxes: row(700, 420, 4, 120), size: 120, scaled: true }];
    const s = ok({ page: 'screentone/shout', edge: 'top', lines });
    expect(s.mode).toBe('closed');
    expect(s.panels[0].open).toBeUndefined();
    for (const [x, y] of s.carriers[0].outline) expect(x >= PAGE_SAFE.x0 && x <= PAGE_SAFE.x1 && y >= PAGE_SAFE.y0 && y <= PAGE_SAFE.y1).toBe(true);
  });

  it('lays short and long lines, Chinese, Japanese and Latin (cases)', () => {
    const cases: [string, number, number, string[]][] = [
      ['好', 0, 1, ['好']],
      ['這次我們的手沒牽好', 5, 9, ['手沒牽好']],
      ['恋に恋 来い', 0, 3, ['恋に恋']],
      ['ダメ出しはしないで', 0, 4, ['ダメ出し']],
      ['never let go', 6, 12, ['let go']],
      ['I remember the snow', 15, 19, ['snow']],
    ];
    for (const page of ['screentone/shout', 'screentone/balloons', 'screentone/caption'])
      for (const [text, from, to, rows] of cases) {
        const p = plan({ carrierId: `ground:${page}`, span: { from, to }, rows });
        const input = { page, edge: 'top' as const, lines: [lineOf(text, p)] };
        ok(input);
      }
  });

  it('gives the balloon page its short wide wedge tail, spliced into the outline, clear of the words (tailAttached, tailWedge, tailClear)', () => {
    const page = 'screentone/balloons';
    const input = top(page);
    const s = ok(input);
    const c = s.carriers[0];
    expect(c.kind).toBe('oval');
    const t = c.tail!;
    expect(c.outline[t.at]).toBe(t.tip);
    const w = Math.hypot(t.root[0][0] - t.root[1][0], t.root[0][1] - t.root[1][1]);
    const mid = [(t.root[0][0] + t.root[1][0]) / 2, (t.root[0][1] + t.root[1][1]) / 2];
    const len = Math.hypot(t.tip[0] - mid[0], t.tip[1] - mid[1]);
    expect(w).toBeCloseTo(TAIL.root, 0);
    expect(len).toBeLessThanOrEqual(TAIL.len + 1);
    expect(len / w).toBeLessThan(1);
    // (never a separate piece: the tail's tip lies outside the balloon's own body, its root on the outline)
    expect(inside(c.outline.filter((p) => p !== t.tip), t.tip)).toBe(false);
  });

  it('lays the narration and caption pages a narration box, the shout and burst pages a spiky balloon', () => {
    expect(carrierKindOf('screentone/narration')).toBe('box');
    expect(carrierKindOf('screentone/caption-r')).toBe('box');
    expect(carrierKindOf('screentone/burst')).toBe('spiky');
    expect(carrierKindOf('screentone/sfx')).toBe('spiky');
    expect(carrierKindOf('screentone/balloons')).toBe('oval');
    expect(ok(top('screentone/caption')).carriers[0].outline.length).toBe(4);
  });

  it('carries several lines present at once, each in its own carrier, in reading order (several lines, readingOrder, hierarchy, carrierClear)', () => {
    const hero = lineOf('這次我們的手沒牽好', plan({ span: { from: 5, to: 9 } }));
    const other: PageLine = { id: 'c2', boxes: row(700, 820, 5, 60), size: 60, show: 14 };
    const input = { page: 'screentone/shout', edge: 'top' as const, lines: [hero, other] };
    const s = ok(input);
    expect(s.carriers.map((c) => [c.line, c.kind])).toEqual([['c1', 'spiky'], ['c2', 'narration']]);
    expect(s.panels[0].carries.sort()).toEqual(['c1', 'c2']);
    // (the narration box round the other line, with its padding)
    const nb = s.carriers[1].outline;
    expect(nb[0]).toEqual([700 - NARRATION_PAD[0], 820 - NARRATION_PAD[1]]);
  });

  it('refuses the page atomically when a present line has no legal carrier (noPageSolution)', () => {
    const hero = lineOf('這次我們的手沒牽好', plan({ span: { from: 5, to: 9 } }));
    // (a line still standing where the balloon must go: no page carries both)
    const over: PageLine = { id: 'c0', boxes: row(900, 200, 3, 80), size: 80, show: 5 };
    const r = pageLayout({ page: 'screentone/shout', edge: 'top', lines: [hero, over] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why[0]).toMatch(/^noPageSolution:/);
    // (a page bleeds through top or bottom only; and one scaled line a page)
    expect(pageLayout({ page: 'screentone/shout', edge: 'left', lines: [hero] }).ok).toBe(false);
    expect(pageLayout({ page: 'screentone/shout', edge: 'top', lines: [hero, { ...hero, id: 'c9' }] }).ok).toBe(false);
    // (glyphs past the safe area: no page)
    expect(pageLayout({ page: 'screentone/shout', edge: 'top', lines: [{ id: 'c1', boxes: row(10, 100, 3, 200), size: 200, scaled: true }] }).ok).toBe(false);
  });

  it('is pure and seeded: the same input gives the same page', () => {
    const input = top();
    expect(JSON.stringify(pageLayout(input))).toBe(JSON.stringify(pageLayout(input)));
  });
});

describe('verifyPage: each invariant is a check', () => {
  const input: PageInput = { page: 'screentone/balloons', edge: 'top', lines: [flush('top')] };
  const base = ok(input);
  expect(base.mode).toBe('bleed');
  const clone = (): PageSolution => JSON.parse(JSON.stringify(base));

  it('oneCarrier: a line with two carriers, or none', () => {
    const s = clone();
    s.carriers.push({ ...s.carriers[0], kind: 'narration' });
    expect(names(s, input)).toContain('oneCarrier');
    const t = clone();
    t.carriers = [];
    expect(names(t, input)).toContain('oneCarrier');
  });

  it('noEmptyPanel and noInnerPanelLine: an old panel left with no words, overlapping the page panel', () => {
    const s = clone();
    s.panels.push({ pts: [[60, 510], [700, 510], [640, 1000], [60, 1000]], carries: [] });
    const v = names(s, input);
    expect(v).toContain('noEmptyPanel');
    expect(v).toContain('noInnerPanelLine');
  });

  it('bleedOnlyDeclared and bleedClip: a spike off the right side', () => {
    const s = clone();
    const o = s.carriers[0].outline;
    const i = o.findIndex(([x, y]) => x === Math.max(...o.map((p) => p[0])) && y > 0);
    o[i] = [PAGE_W + 30, o[i][1]];
    const v = names(s, input);
    expect(v).toContain('bleedOnlyDeclared');
    expect(v).toContain('bleedClip');
  });

  it('closedInSafe: a closed carrier past the safe area', () => {
    const closedIn: PageInput = { page: 'screentone/shout', edge: 'top', lines: [{ id: 'c1', boxes: row(700, 420, 4, 120), size: 120, scaled: true }] };
    const s = ok(closedIn);
    expect(s.mode).toBe('closed');
    const o = s.carriers[0].outline;
    const i = o.findIndex(([, y]) => y === Math.min(...o.map((p) => p[1])));
    o[i] = [o[i][0], PAGE_SAFE.y0 - 10];
    expect(names(s, closedIn)).toContain('closedInSafe');
  });

  it('pathSimple: an outline that crosses itself', () => {
    const s = clone();
    const o = s.carriers[0].outline;
    [o[3], o[o.length - 3]] = [o[o.length - 3], o[3]];
    expect(names(s, input)).toContain('pathSimple');
  });

  it('balloonHolds: a carrier that no longer holds a glyph and its padding', () => {
    const s = clone();
    const g = input.lines[0].boxes[0];
    s.carriers[0].outline = s.carriers[0].outline.map(([x, y]) => [x, Math.min(y, g.y1 - 4)]);
    expect(names(s, input)).toContain('balloonHolds');
  });

  it('tailAttached, tailWedge, tailClear: a tail torn off, drawn long and thin, or into the words', () => {
    const a = clone();
    a.carriers[0].tail!.at = 0;
    expect(names(a, input)).toContain('tailAttached');
    const b = clone();
    const t = b.carriers[0].tail!;
    t.tip = [t.tip[0], t.tip[1] + 200];
    b.carriers[0].outline[t.at] = t.tip;
    expect(names(b, input)).toContain('tailWedge');
    const c = clone();
    const u = c.carriers[0].tail!;
    const g = input.lines[0].boxes[0];
    u.tip = [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2];
    c.carriers[0].outline[u.at] = u.tip;
    expect(names(c, input)).toContain('tailClear');
  });

  it('panelLineClear and panelSpacing: a frame line through the words, a panel on the frame edge', () => {
    const s = clone();
    const g = input.lines[0].boxes[0];
    s.panels.push({ pts: [[0, g.y0 + 10], [PAGE_W, g.y0 + 10], [PAGE_W, g.y0 + 11], [0, g.y0 + 11]], carries: ['c1'] });
    s.carriers = [];
    const v = names(s, input);
    expect(v).toContain('panelLineClear');
    expect(v).toContain('panelSpacing');
  });

  it('readingOrder and hierarchy: a line sung earlier set below a later one, another line as large as the scaled one', () => {
    const hero = input.lines[0];
    const big = Math.max(...hero.boxes.map((b) => b.y1 - b.y0));
    const other: PageLine = { id: 'c0', boxes: row(300, 900, 2, big + 1), size: big + 1, show: 5 };
    const v = verifyPage(clone(), { ...input, lines: [hero, other] }).map((x) => x.invariant);
    expect(v).toContain('readingOrder');
    expect(v).toContain('hierarchy');
  });
});

describe('the page checks on the lines really present (faces with their lines and shows)', () => {
  const hero = flush('top');
  it('carries no line before its show: a line handed but not shown yet fills nothing (oneCarrier, presence)', () => {
    const later: PageLine = { id: 'c2', boxes: row(700, 820, 5, 60), size: 60, show: 14 };
    const s = ok({ page: 'screentone/shout', edge: 'top', lines: [hero, later], at: 12 });
    expect(s.carriers.map((c) => c.line)).toEqual(['c1']);
    expect(s.panels[0].carries).toEqual(['c1']);
    const both = ok({ page: 'screentone/shout', edge: 'top', lines: [hero, later], at: 15 });
    expect(both.carriers.map((c) => c.line)).toEqual(['c1', 'c2']);
    // (the page laid at 15 s checked at 12 s: it carries a line not shown yet)
    expect(names(both, { page: 'screentone/shout', edge: 'top', lines: [hero, later], at: 12 })).toContain('oneCarrier');
  });

  it('noEmptyPanel, read off the geometry: a panel that holds no present line\'s words, its own list notwithstanding', () => {
    const later: PageLine = { id: 'c2', boxes: row(700, 820, 5, 60), size: 60, show: 14 };
    const input: PageInput = { page: 'screentone/shout', edge: 'top', lines: [hero, later], at: 12 };
    const s = ok(input);
    // (an old lower panel kept for the line to come: no word of a present line stands in it)
    s.panels.push({ pts: [[600, 780], [1500, 780], [1500, 960], [600, 960]], carries: ['c1'] });
    const v = names(s, input);
    expect(v).toContain('noEmptyPanel');
    expect(v).toContain('noInnerPanelLine');
  });

  it('readingOrder from real shows: a line sung earlier left standing below the scaled one refuses the page', () => {
    const earlier: PageLine = { id: 'c0', boxes: row(700, 860, 5, 60), size: 60, show: 6 };
    const r = pageLayout({ page: 'screentone/shout', edge: 'top', lines: [hero, earlier] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why.join(' ')).toContain('readingOrder');
  });

  it('lays the page at every moment the lines on screen change, refusing the whole line if one moment has no page (scalePage)', () => {
    const d = laid('這次我們的手沒牽好', plan({ span: { from: 5, to: 9 } }));
    const ctx = { show: 10, end: 14, others: [] as PageLine[] };
    expect(scalePage(plan({ page: ctx }), d, 'c1')!.ok).toBe(true);
    // (a line still up from 12 s where the balloon stands: the moment 12 s has no page, so the line has none)
    const crowded = scalePage(plan({ page: { ...ctx, others: [{ id: 'c0', boxes: row(900, 200, 3, 80), size: 80, show: 12, end: 13 }] } }), d, 'c1')!;
    expect(crowded.ok).toBe(false);
    expect(!crowded.ok && crowded.why[0]).toMatch(/at 12\.00 s/);
  });

  it('lays no page for a page id no world declares (world-shared WORLD_PAGES)', () => {
    expect(carrierKindOf('popart/balloon')).toBeUndefined();
    expect(pageLayout({ page: 'popart/balloon', edge: 'top', lines: [hero] }).ok).toBe(false);
  });
});

describe('the fitter keeps the page its room (scale-policy fitOf, a `ground:` carrier)', () => {
  it('fits closed first, room on all four sides, and bleeds only when closed cannot reach the bar', () => {
    const caps = { edges: ['top'] as 'top'[], sizeRange: [1.6, 2.4] as [number, number], carrierRole: 'panel' as const };
    const closed = fitOf(['手沒牽好'], '這次我們的', '', { readingSize: 84, track: 0.04 }, caps, estimateMeasure, 'ground:screentone/shout', 1.8);
    expect('seat' in closed && closed.seat.pageMode).toBe('closed');
    if ('seat' in closed) {
      const room = pageGlyphRoom('screentone/shout', 'top', 'closed');
      expect(closed.seat.inkBox.y0 * 1080).toBeGreaterThanOrEqual(room.y0 - 1);
    }
    // (a long line whose closed setting falls short of 2.4×: it bleeds through its declared edge)
    const long = fitOf(['我再也不在你身邊'], '', '', { readingSize: 90, track: 0.04 }, caps, estimateMeasure, 'ground:screentone/shout', 2.39);
    expect('seat' in long && long.seat.pageMode).toBe('bleed');
  });

  it('stands a page-carried ink box inside the page glyph room with the em overhang across, the old page graphics ignored', () => {
    const caps = { edges: ['top', 'bottom'] as ('top' | 'bottom')[], sizeRange: [1.6, 2.4] as [number, number], carrierRole: 'panel' as const };
    for (const page of ['screentone/shout', 'screentone/balloons', 'screentone/caption']) {
      const fit = fitOf(['手沒牽好'], '這次我們的', '', { readingSize: 84, track: 0.04, clear: [{ x0: 0.6, y0: 0.06, x1: 0.97, y1: 0.93 }] }, caps, estimateMeasure, `ground:${page}`);
      expect('seat' in fit).toBe(true);
      if (!('seat' in fit)) continue;
      const room = pageGlyphRoom(page, fit.seat.edge, fit.seat.pageMode);
      const ink = fit.seat.inkBox;
      expect(ink.x0 * 1920).toBeGreaterThanOrEqual(room.x0 - 1e-3);
      expect(ink.x1 * 1920).toBeLessThanOrEqual(room.x1 + 1e-3);
      expect(ink.y1 * 1080).toBeLessThanOrEqual(room.y1 + 1e-3);
    }
  });

  it('leaves a sheet carrier (riso) fitted as before: the safe area, its clear boxes kept', () => {
    const caps = { edges: ['bottom'] as 'bottom'[], sizeRange: [1.6, 2.4] as [number, number], carrierRole: 'paper' as const };
    const fit = fitOf(['天荒地老'], '', '', { readingSize: 90, track: 0.04, clear: [{ x0: 0, y0: 0.5, x1: 1, y1: 1 }] }, caps, estimateMeasure, 'paper:riso');
    expect('why' in fit).toBe(true);
  });

  it('reports the page refusal at plan time and draws no composition on a refused page (scalePage)', () => {
    const d = laid('這次我們的手沒牽好', plan({ span: { from: 5, to: 9 } }));
    expect(scalePage(plan({ carrierId: 'paper:riso' }), d, 'c1')).toBeUndefined();
    const page = scalePage(plan(), d, 'c1')!;
    expect(page.ok).toBe(true);
    const crowded = scalePage(plan(), d, 'c1', [{ id: 'c0', boxes: row(900, 200, 3, 80), size: 80 }])!;
    expect(crowded.ok).toBe(false);
  });

  it('cuts a page-carried composition in and out over its move\'s own time, never moving its glyphs', () => {
    for (const [name, way, m] of [['stack-rise', 'in', WORLD_ENTERS['stack-rise']], ['line-open', 'in', WORLD_ENTERS['line-open']], ['page-flip-out', 'out', WORLD_EXITS['page-flip-out']], ['slice-out', 'out', WORLD_EXITS['slice-out']]] as const) {
      const c = cutOf(m, way)!;
      expect(c.sec).toBe(m.sec);
      expect(c.glyph).toBeUndefined();
      for (const q of [0, 0.3, 0.6, 1]) { const p = c.block!(q, 1); expect([p.dx, p.dy, p.sx, p.sy, p.r].every((x) => x === undefined)).toBe(true); }
      expect(name).toBeTruthy();
    }
    expect(cutOf(WORLD_EXITS['edge-relay'], 'out')).toBe(WORLD_EXITS['edge-relay']);
  });
});

const SNOW = { db: 'out/db/yt_5i50aTB7JFo/song.json', meaning: 'out/research/instant/plans/snow/meaning.json' };
describe.skipIf(!existsSync(SNOW.db) || !existsSync(SNOW.meaning))('screentone re-opened (三年後的大雪)', () => {
  const song = () => JSON.parse(readFileSync(SNOW.db, 'utf8'));
  const meaning = () => JSON.parse(readFileSync(SNOW.meaning, 'utf8'));
  const style = FREE_STYLES.find((s) => s.id === 'screentone')!;

  it('declares screentone without a withholding once its page lays itself whole', () => {
    expect(scaleOf('screentone')).toBeDefined();
    expect(DECLARED_SCALE_CAPS['screentone'].edges).toEqual(['top', 'bottom']);
  });

  it('approves only compositions whose whole page is legal: no call beside them, no linked handoff carrying the page out', () => {
    const s = song();
    const f = freeJob(s, { style, seed: 0, meaning: meaning(), scaleContrast: true, worldEvents: true });
    const scaled = (f.treatment.cues as { cueId: string; world?: { scale?: LineScale } }[]).filter((c) => c.world?.scale);
    expect(scaled.length).toBeGreaterThan(0);
    for (const c of scaled) {
      const text = (f.job.cues as { id: string; text: string }[]).find((x) => x.id === c.cueId)!.text;
      expect(text).not.toMatch(/[（(][^）)]*[）)]/);
    }
    const refused = f.treatment.worldEvents!.policy!.filter((d) => d.source === 'Q3' && !d.approved && /noPageSolution/.test(d.reason));
    for (const d of refused) expect(scaled.some((c) => c.cueId === d.lineId)).toBe(false);
  });

  it('keeps the default output byte-identical (scale off)', () => {
    const s = song();
    const m = meaning();
    expect(JSON.stringify(freeJob(s, { style, seed: 0, meaning: m }).job)).toBe(JSON.stringify(freeJob(s, { style, seed: 0, meaning: m, scaleContrast: false }).job));
    expect(JSON.stringify(freeJob(s, { style, seed: 0, meaning: m }).job)).not.toContain('"scale":{"eventId"');
  });
});

describe('the page panel', () => {
  it('is the board\'s one wide panel, its gutters to the frame', () => {
    expect(PAGE_PANEL).toEqual({ x0: 60, y0: 60, x1: 1860, y1: 1000 });
  });
});
