import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { DECLARED_SCALE_CAPS, type WorldScaleCaps } from './scale-caps-draft';
import { scaleInputOf, todayScale } from './scale-policy-adapter';
import { CAP_H, CAP_W, EDGE_FIT_MIN, estimateMeasure, FRAME, pickScaleContrasts, SCALE_MIN, SCALE_TARGET, sungSectionsOf, withScaleSeats, type ScaleInput, type ScaleLine } from './scale-policy';
import { planWorldEvents, type WorldEventInput } from './world-events';

const RISO = DECLARED_SCALE_CAPS['riso'];
const TONE = DECLARED_SCALE_CAPS['screentone'];
const derived = (id: string, edges: WorldScaleCaps['edges'] = ['bottom', 'left']): WorldScaleCaps => ({ ...RISO, worldId: id, edges, carrierRole: 'ground', candidateWeights: { short: 1, ratio: 1, room: 1, sustain: 1, order: 1 }, source: 'derived' });
const line = (id: string, text: string, start: number, end: number, o: Partial<ScaleLine> = {}): ScaleLine => ({ id, text, show: start - 0.2, start, end, readingSize: 100, seat: { id: `w/${id}`, carrierId: 'sheet' }, ...o });
const input = (lines: ScaleLine[], o: Partial<ScaleInput> = {}): ScaleInput => ({ songId: 'song', worldId: 'riso', seed: 0, lines, sections: [{ id: 'S0', start: 0, end: 100 }], keys: [], caps: RISO, ...o });
const safe = { x0: FRAME.safeX / FRAME.w, y0: FRAME.safeY / FRAME.h, x1: 1 - FRAME.safeX / FRAME.w, y1: 1 - FRAME.safeY / FRAME.h };

describe('sungSectionsOf', () => {
  it('puts a line crossing a boundary in the section it starts in, once, and leaves unsung sections out', () => {
    const sections = [{ id: 'A', start: 0, end: 10 }, { id: 'B', start: 10, end: 20 }, { id: 'C', start: 20, end: 30 }, { id: 'D', start: 30, end: 40 }];
    const got = sungSectionsOf(sections, [{ id: 'x', start: 8, end: 13 }, { id: 'y', start: 10, end: 11 }, { id: 'z', start: 25, end: 34 }]);
    expect(got.map((g) => [g.section.id, g.lines.map((l) => l.id)])).toEqual([['A', ['x']], ['B', ['y']], ['C', ['z']]]);
    expect(got.flatMap((g) => g.lines).length).toBe(3);
  });
});

describe('pickScaleContrasts', () => {
  it('sets a short key phrase at 2.4× reading size and calls it edgeFit', () => {
    const p = pickScaleContrasts(input([line('c1', '我愛你到天荒地老', 1, 4)], { keys: [{ cue: 'c1', phrase: '天荒地老' }] }));
    const s = p.sections[0];
    const c = s.candidates[s.chosen!];
    expect(s.kind).toBe('edgeFit');
    expect(c.source).toBe('meaning');
    expect(c.text).toBe('天荒地老');
    expect(c.ratio).toBeCloseTo(SCALE_TARGET, 2);
    expect(c.targetSize).toBe(240);
    expect(p.edgeFitSections).toBe(1);
  });

  it('caps a long phrase by frameCap (≤ 86 % of the safe width) and counts 1.6–1.8× as an ordinary scale contrast', () => {
    // 9 Han at R = 100: frameCap width = 0.86 × 1792 / (9 + 8 × 0.02) em ≈ 168 px → 1.68×
    const p = pickScaleContrasts(input([line('c1', '一二三四五六七八九', 1, 4)], { keys: [{ cue: 'c1', phrase: '一二三四五六七八九' }] }));
    const c = p.sections[0].candidates.find((x) => x.source === 'meaning')!;
    const emW = 9 + 8 * 0.02;
    expect(c.legal).toBe(true);
    expect(c.ratio).toBeCloseTo((CAP_W * (FRAME.w - 2 * FRAME.safeX)) / emW / 100, 1);
    expect(c.ratio).toBeGreaterThanOrEqual(SCALE_MIN);
    expect(c.ratio).toBeLessThan(EDGE_FIT_MIN);
    expect(c.kind).toBe('scale');
  });

  it('keeps every ink box inside the frame cap: height ≤ 44 % of the frame, width ≤ 86 % of the safe area plus its stress pad', () => {
    for (const phrase of ['愛', '雙截棍', 'Hello World', '一再重演']) {
      const p = pickScaleContrasts(input([line('c1', `${phrase}啊啊`, 1, 4, { readingSize: 180 })], { keys: [{ cue: 'c1', phrase }] }));
      for (const c of p.sections[0].candidates.filter((x) => x.legal)) {
        const b = c.seat!.inkBox;
        const pad = 2 * 0.09 * c.targetSize;
        expect((b.y1 - b.y0) * FRAME.h - pad).toBeLessThanOrEqual(CAP_H * FRAME.h + 2);
        expect((b.x1 - b.x0) * FRAME.w - pad).toBeLessThanOrEqual(CAP_W * (FRAME.w - 2 * FRAME.safeX) + 2);
      }
    }
  });

  it('measures mixed script and long words by glyph width instead of excluding them', () => {
    const p = pickScaleContrasts(input([line('c1', 'Let it go 放手', 1, 4)], { keys: [{ cue: 'c1', phrase: 'Let it go' }] }));
    const c = p.sections[0].candidates.find((x) => x.source === 'meaning')!;
    expect(c.legal).toBe(true);
    expect(estimateMeasure('Let it go')).toBeLessThan(estimateMeasure('放手放手放手放手放'));
  });

  it('sits the ink box on an allowed safe-area edge and runs only the carrier off the frame', () => {
    const p = pickScaleContrasts(input([line('c1', '我愛你到天荒地老', 1, 4)], { keys: [{ cue: 'c1', phrase: '天荒地老' }] }));
    const seat = p.seats[0];
    const { inkBox: b, carrierExtends: car, edge } = seat.scale;
    expect(RISO.edges).toContain(edge);
    expect(b.x0).toBeGreaterThanOrEqual(safe.x0 - 1e-3);
    expect(b.y0).toBeGreaterThanOrEqual(safe.y0 - 1e-3);
    expect(b.x1).toBeLessThanOrEqual(safe.x1 + 1e-3);
    expect(b.y1).toBeLessThanOrEqual(safe.y1 + 1e-3);
    const touches = { bottom: b.y1 - safe.y1, top: safe.y0 - b.y0, left: safe.x0 - b.x0, right: b.x1 - safe.x1 }[edge];
    expect(Math.abs(touches)).toBeLessThan(2e-3);
    const runs = { bottom: car.box.y1 > 1, top: car.box.y0 < 0, left: car.box.x0 < 0, right: car.box.x1 > 1 }[edge];
    expect(runs).toBe(true);
    expect(car.side).toBe(edge);
    expect(car.role).toBe('paper');
    // a fixed page keeps its own carrier: the big word stands on it
    expect(car.carrierId).toBe('sheet');
    expect(seat.seat.carrierId).toBe('sheet');
    // the words after the big word on a bottom edge stand beside it, before it above: reading order kept
    for (const r of seat.scale.restBoxes) {
      expect(r.box.y1).toBeLessThanOrEqual(safe.y1 + 1e-3);
      if (edge === 'bottom' && r.role === 'before') expect(r.box.y1).toBeLessThanOrEqual(b.y0 + 1e-3);
    }
  });

  it('moves to another allowed edge when the page draws its graphics on the first', () => {
    const clear = [{ x0: 0, y0: 0.5, x1: 1, y1: 1 }];
    const p = pickScaleContrasts(input([line('c1', '天荒地老', 1, 4, { clear })], { keys: [{ cue: 'c1', phrase: '天荒地老' }] }));
    expect(p.seats[0].scale.edge).not.toBe('bottom');
    const b = p.seats[0].scale.inkBox;
    expect(b.y1 <= 0.5 + 1e-3 || b.y0 >= 1).toBe(true);
  });

  it('falls back from the key phrase to a whole line, then to a recorded miss, in that order', () => {
    // a named key that fits wins over a whole line that would score higher
    const named = pickScaleContrasts(input([line('a', '一二三四五六七八九十', 1, 4), line('b', '雪', 5, 9)], { keys: [{ cue: 'a', phrase: '一二三' }] }));
    expect(named.sections[0].candidates[named.sections[0].chosen!].source).toBe('meaning');
    // no key named: a short line set whole, claimed as a layout scale, never as a big word
    const whole = pickScaleContrasts(input([line('a', '下雪了', 1, 4)]));
    expect(whole.sections[0].kind).toBe('scale');
    expect(whole.sections[0].candidates[whole.sections[0].chosen!].source).toBe('sectionScale');
    expect(whole.sections[0].candidates[whole.sections[0].chosen!].ratio).toBeGreaterThanOrEqual(SCALE_MIN);
    expect(whole.edgeFitSections).toBe(0);
    // a key in a call is another voice's: refused with its reason, the whole line takes the section
    const call = pickScaleContrasts(input([line('a', '我在這裡(在哪裡)', 1, 4)], { keys: [{ cue: 'a', phrase: '在哪裡' }] }));
    expect(call.sections[0].candidates.find((c) => c.source === 'meaning')!.reasons.join()).toMatch(/call/);
    // nothing reaches 1.6×: a miss, with every candidate's reasons kept
    const long = '這是一句非常非常長而且完全沒有辦法放大到一點六倍的歌詞句子';
    const miss = pickScaleContrasts(input([line('a', long, 1, 4, { readingSize: 150 })]));
    expect(miss.sections[0].kind).toBe('miss');
    expect(miss.sections[0].candidates.every((c) => c.reasons.length > 0)).toBe(true);
    expect(miss.seats).toEqual([]);
    expect(miss.plannedSections).toBe(0);
  });

  it('refuses a line shorter than the scheduler keeps, and one set in a pair shot', () => {
    const p = pickScaleContrasts(input([line('a', '雪', 1, 1.5), line('b', '花', 2, 5, { sharesFrameWith: ['c'] })]));
    expect(p.sections[0].kind).toBe('miss');
    expect(p.sections[0].candidates.map((c) => c.reasons[0])).toEqual([expect.stringMatching(/short line/), expect.stringMatching(/pair shot/)]);
  });

  it('gives the same plan for the same input, and lets the seed choose among near-equal candidates', () => {
    const lines = ['春天', '夏天', '秋天', '冬天'].map((t, i) => line(`c${i}`, `${t}來了`, i * 3 + 1, i * 3 + 3.5));
    const keys = lines.map((l, i) => ({ cue: l.id, phrase: ['春天', '夏天', '秋天', '冬天'][i] }));
    const a = pickScaleContrasts(input(lines, { keys }));
    expect(pickScaleContrasts(input(lines, { keys }))).toEqual(a);
    const picks = new Set(Array.from({ length: 12 }, (_, seed) => pickScaleContrasts(input(lines, { keys, seed })).seats[0].lineId));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('picks at least two different lines across worlds where two or more legal candidates are shared', () => {
    const lines = ['春天', '夏天', '秋天'].map((t, i) => line(`c${i}`, `${t}來了`, i * 3 + 1, i * 3 + 3.5));
    const keys = lines.map((l, i) => ({ cue: l.id, phrase: ['春天', '夏天', '秋天'][i] }));
    const worlds = [RISO, TONE, ...['silk', 'spy', 'card', 'ukiyoe', 'xerox', 'popart'].map((id) => derived(id))];
    const plans = worlds.map((caps) => pickScaleContrasts(input(lines, { keys, caps, worldId: caps.worldId })));
    for (const p of plans) expect(p.sections[0].candidates.filter((c) => c.legal && c.source === 'meaning').length).toBeGreaterThanOrEqual(2);
    expect(new Set(plans.map((p) => p.seats[0].lineId)).size).toBeGreaterThanOrEqual(2);
  });

  it('never shrinks the other lines or the chosen line\'s rest: every line keeps its reading size', () => {
    const lines = [line('a', '我愛你到天荒地老', 1, 4, { readingSize: 120 }), line('b', '一直到最後', 5, 8, { readingSize: 140 })];
    const p = pickScaleContrasts(input(lines, { keys: [{ cue: 'a', phrase: '天荒地老' }] }));
    expect(p.sizes['b']).toEqual({ reading: 140, rest: 140 });
    expect(p.sizes['a'].rest).toBe(120);
    const seat = p.seats[0];
    expect(seat.scale.restSize).toBe(seat.scale.readingSize);
    for (const r of seat.scale.restBoxes) expect((r.box.y1 - r.box.y0) * FRAME.h).toBeGreaterThanOrEqual(120 - 2);
    // the big text is never condensed: its rows are its own characters, all of them
    expect(seat.scale.rows.join('')).toBe('天荒地老');
  });

  it('hands planWorldEvents one layout-seat candidate a section: one event, one count, no separate grow', () => {
    const lines = [line('a', '下雪了', 1, 4), line('b', '天荒地老', 6, 9)];
    const sections = [{ id: 'S0', start: 0, end: 5 }, { id: 'S1', start: 5, end: 10 }];
    const p = pickScaleContrasts(input(lines, { sections, keys: [{ cue: 'b', phrase: '天荒地老' }] }));
    expect(p.seats.map((s) => s.sectionId)).toEqual(['S0', 'S1']);
    expect(new Set(p.seats.map((s) => s.eventId)).size).toBe(2);
    for (const s of p.seats) expect([s.family, s.count, s.replacesGrow, s.from, s.to]).toEqual(['layout-seat', 1, true, s.at, s.at]);
    const ev: WorldEventInput = {
      lines: lines.map((l) => ({ id: l.id, show: l.show, start: l.start, end: l.end, seats: [{ id: `w/${l.id}`, box: { x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.6 } }], seat: `w/${l.id}` })),
      beats: [], sections: [{ start: 0, energy: 0.8 }, { start: 5, energy: 0.8 }], seed: 0,
      caps: { worldId: 'riso', kinds: ['layout-seat'], seats: ['w/a', 'w/b'], carrierRole: 'page' },
    };
    const plan = planWorldEvents(withScaleSeats(ev, p.seats));
    for (const s of p.seats) {
      const carrying = plan.events.filter((e) => e.seatAfter === s.seat.id && e.lineIds.includes(s.lineId) && e.seatBefore !== e.seatAfter);
      const rejected = plan.rejected.filter((r) => r.candidate.seatAfter === s.seat.id);
      expect(carrying.length + rejected.length, s.eventId).toBeLessThanOrEqual(1);
    }
    // the second line's scale seat is a real reseat the scheduler lays once
    expect(plan.events.filter((e) => e.kind === 'layout-seat' && e.lineIds.includes('b'))).toHaveLength(1);
  });
});

const SONGS = [
  { id: 'nun', db: 'out/db/yt_w_fCuUR3lEs/song.json', meaning: 'out/research/instant/plans/nun/meaning.json', sung: 11, risoToday: 6 },
  { id: 'snow', db: 'out/db/yt_5i50aTB7JFo/song.json', meaning: 'out/research/instant/plans/snow/meaning.json', sung: 6, risoToday: 4 },
];
const haveOut = SONGS.every((s) => existsSync(s.db) && existsSync(s.meaning));

describe.skipIf(!haveOut)('scale policy on 雙截棍 and 三年後的大雪 (freeJob, seed 0)', () => {
  const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  for (const s of SONGS) {
    it(`${s.id}: one decision for each of its ${s.sung} sung sections, legal choices only, the same twice`, () => {
      const song = load(s.db);
      const meaning = load(s.meaning);
      for (const id of ['riso', 'screentone']) {
        const style = FREE_STYLES.find((x) => x.id === id)!;
        const free = freeJob(song, { style, seed: 0, meaning });
        const inp = scaleInputOf(free, song, style.world, { seed: 0, songId: s.id, meaning });
        const plan = pickScaleContrasts(inp);
        expect(plan.sungSections).toBe(s.sung);
        expect(plan.sections.flatMap((x) => x.lineIds).length).toBe(new Set(plan.sections.flatMap((x) => x.lineIds)).size);
        for (const sec of plan.sections) {
          if (sec.kind === 'miss') expect(sec.reasons.length).toBeGreaterThan(0);
          else expect(sec.candidates[sec.chosen!].legal).toBe(true);
        }
        expect(plan.seats.length).toBe(plan.plannedSections);
        // the reading names no key in these meanings: nothing may be claimed as a big word
        if (!inp.keys.length) expect(plan.edgeFitSections).toBe(0);
        expect(pickScaleContrasts(scaleInputOf(free, song, style.world, { seed: 0, songId: s.id, meaning }))).toEqual(plan);
      }
    });

    it(`${s.id}: today's trace replays the plan's own blow-ups and gives riso ${s.risoToday} of ${s.sung} sections`, () => {
      const song = load(s.db);
      const meaning = load(s.meaning);
      const style = FREE_STYLES.find((x) => x.id === 'riso')!;
      const today = todayScale(freeJob(song, { style, seed: 0, meaning }), song, style.world, meaning);
      expect(today.mismatches).toEqual([]);
      expect(today.sungSections).toBe(s.sung);
      expect(today.plannedSections).toBe(s.risoToday);
      for (const sec of today.sections.filter((x) => !x.planned)) expect(sec.lines.every((l) => l.reason.length > 0)).toBe(true);
    });
  }
});
