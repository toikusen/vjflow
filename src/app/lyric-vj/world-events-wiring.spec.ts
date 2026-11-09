// Q1 phase 2: the scheduler wired into the free path (docs/research/2026-11-09-q1-phase2.md). The scheduler's own rules
// with the wiring inputs (pinned seats, a hold's room, given reposes, camera moves), the adapter's real inputs, the plan
// written back, and the render path laying only what the table approved.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { LINK_CLEAR, LINK_PREPARE, linkGrounds, sectionClock } from './render/world-handoff';
import { ACTION_GAP, countCuts, LIGHT_GAP, planWorldEvents, READ_STABLE, SEAM_GAP, seatsDiffer, SHORT_LINE, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { capsOf, currentEvents, fromJob, holdRoom, landedEvents, lightGapWarnings, ONE_PAGE_WORLDS, seatIn, shownOf, verifyWorldEvents } from './world-events-adapter';
import { applyWorldEvents } from './world-events-apply';
import { compositionsOf, isPageSeat, pageOf, pageSeatsOf, WORLD_COMPOSITIONS } from './world-shared';
import { SET_SPECS } from './render/world-sets';
import { boxesMeet, laidSeat } from './render/seat-geometry';
import { composePlan, pageSeatsFor, RECIPES } from './lineplan-core';
import { poolOf } from './style-world';

const LEFT: SeatCandidate = { id: 'w/left', box: { x0: 0.05, y0: 0.3, x1: 0.45, y1: 0.6 } };
const RIGHT: SeatCandidate = { id: 'w/right', box: { x0: 0.55, y0: 0.3, x1: 0.95, y1: 0.6 } };
const TOP: SeatCandidate = { id: 'w/top', box: { x0: 0.2, y0: 0.08, x1: 0.8, y1: 0.3 } };
const PAGE_A: SeatCandidate = { ...LEFT, id: 'w/page-a', carrierId: 'ground:a', paged: true };
const PAGE_B: SeatCandidate = { ...RIGHT, id: 'w/page-b', carrierId: 'ground:b', paged: true };
const caps = (kinds: WorldCompositionCaps['kinds'], o: Partial<WorldCompositionCaps> = {}): WorldCompositionCaps => ({ worldId: 'w', kinds, seats: [], carrierRole: 'page', ...o });
const line = (id: string, start: number, end: number, n = 0, seats = [LEFT, RIGHT, TOP]): WorldEventLine => ({
  id, show: start - 0.2, start, end, seats,
  ...(n ? { words: Array.from({ length: n }, (_, k) => ({ text: `p${k}`, from: start + ((end - start) * k) / n, to: start + ((end - start) * (k + 1)) / n })) } : {}),
});
const input = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.9 }], caps: caps(['layout-seat']), seed: 0, ...o });
const cuts = (es: WorldEvent[]) => es.filter((e) => e.kind !== 'keep');
function expectClocks(es: WorldEvent[]) {
  const c = cuts(es);
  for (const [i, a] of c.entries())
    for (const b of c.slice(i + 1)) {
      expect(Math.abs(a.at - b.at), `${a.id} / ${b.id} seams`).toBeGreaterThanOrEqual(SEAM_GAP - 1e-6);
      expect(a.from < b.from ? b.from - a.to : a.from - b.to, `${a.id} / ${b.id} actions`).toBeGreaterThanOrEqual(ACTION_GAP - 1e-6);
      if (a.changesLight && b.changesLight) expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(LIGHT_GAP - 1e-6);
    }
}

describe('planWorldEvents with the wiring inputs', () => {
  it('cross-line spacing: an in-line switch keeps 0.65 s seam and 0.10 s action from the next line, 0.55 s light across lines', () => {
    // a's only sung break is 0.5 s before b shows, b's own seat is pinned: a's switch would sit under the seam floor
    const a = { ...line('a', 0, 3, 0), words: [{ text: 'x', from: 0, to: 2.3 }, { text: 'y', from: 2.3, to: 3 }] };
    const b = { ...line('b', 3, 5), pinned: 'test', seat: 'w/right' };
    const plan = planWorldEvents(input([a, b]));
    expect(plan.events.some((e) => e.scope === 'in-line' && e.lineIds.includes('a'))).toBe(false);
    expect(plan.rejected.some((r) => r.candidate.lineId === 'a' && /seam within 0.65s of b's composed seat/.test(r.reason))).toBe(true);
    // with the break 0.7 s before, the switch lands and both clocks hold
    const a2 = { ...a, words: [{ text: 'x', from: 0, to: 2 }, { text: 'y', from: 2.1, to: 3 }] };
    const ok = planWorldEvents(input([a2, b]));
    expect(ok.events.some((e) => e.scope === 'in-line' && e.at === 2.1)).toBe(true);
    expectClocks(ok.events);
    // a ground's light change 0.2 s from a line's change of carrier: the change gives way (the line keeps the seat before)
    const lit = planWorldEvents(input([line('a', 0, 2, 0, [LEFT]), { ...line('b', 2.4, 4.4, 0, [{ ...PAGE_B, paged: false }, LEFT]), seat: 'w/page-b' }], { lights: [{ at: 2.4, what: 'ground light' }] }));
    for (const e of cuts(lit.events).filter((x) => x.changesLight)) expect(Math.abs(e.at - 2.4) < 0.05 || Math.abs(e.at - 2.4) >= LIGHT_GAP - 1e-6).toBe(true);
    expect(lit.rejected.some((r) => r.candidate.lineId === 'b' && /light change within 0.55s/.test(r.reason))).toBe(true);
    // a line that cannot keep takes its own seat anyway, and the broken clock is reported, not hidden
    const forced = planWorldEvents(input([line('a', 0, 2, 0, [LEFT]), { ...line('b', 2.4, 4.4, 0, [{ ...PAGE_B, paged: false }]) }], { lights: [{ at: 2.5, what: 'ground light' }] }));
    expect(forced.warnings.some((w) => /its own seat breaks spacing: light change/.test(w.reason))).toBe(true);
  });

  it('Q2 vs Q1: an in-line switch stays out of the room a hold keeps (first-set inks before, kept states after)', () => {
    const c = { text: '快使用雙截棍', start: 10, end: 13 };
    // a key run lays the key in the first set: nothing changes set before it is over
    expect(holdRoom(c, { lineId: 'x', kind: 'ink-run', at: 11, from: 11, to: 11.9 }, [])?.spans).toEqual([[11.9 + 0.175, 13]]);
    // a phrase swap is both: no switch inside the line at all
    expect(holdRoom(c, { lineId: 'x', kind: 'ink-swap', at: 11, from: 11, to: 11.3 }, [])?.spans).toEqual([]);
    // a grown block keeps its size to the end: a switch only before it, BEAT_CLEAR clear
    expect(holdRoom(c, { lineId: 'x', kind: 'line-grow', at: 12, from: 12, to: 12.3 }, [])?.spans).toEqual([[10, 11.65]]);
    const l = { ...line('l', 10, 13, 4), inLine: { spans: [[11.9 + 0.175, 13]] as [number, number][] } };
    const plan = planWorldEvents(input([line('a', 7, 9.5), l], { holds: [{ lineId: 'l', kind: 'ink-run', at: 11, from: 11, to: 11.9 }] }));
    for (const e of plan.events.filter((x) => x.scope === 'in-line')) expect(e.at).toBeGreaterThanOrEqual(12.075 - 1e-6);
    expect(plan.holds).toHaveLength(1);
    const none = planWorldEvents(input([line('a', 7, 9.5), { ...line('l', 10, 13, 4), inLine: { spans: [] } }]));
    expect(none.events.some((e) => e.scope === 'in-line')).toBe(false);
    expect(none.rejected.some((r) => /beside its hold/.test(r.reason))).toBe(true);
  });

  it('Q4 vs Q1: a pinned line with a handoff into it is that handoff; a neighbour switch yields to its prepare', () => {
    const lines = [line('a', 0, 2, 0), { ...line('b', 2.2, 4, 0), pinned: 'test', seat: 'w/right' }, { ...line('c', 4.1, 6, 0) }];
    const seam = 2;
    const plan = planWorldEvents(input(lines, { handoffs: [{ lineId: 'c', kind: 'link-relay-x', dir: 0, seam: 3.9, dur: LINK_PREPARE + LINK_CLEAR }] }));
    // b's composed seat at 2.0 and c's handoff at 3.9: both stand, b's counted once
    expect(plan.events.filter((e) => e.lineIds.at(-1) === 'b' && e.scope !== 'in-line')).toHaveLength(1);
    expect(plan.events.find((e) => e.lineIds.at(-1) === 'c' && e.kind === 'page-handoff')?.fixed).toBe(true);
    expect(seam).toBe(2);
    expectClocks(plan.events);
  });

  it('a short line keeps its seat even when the composer moved it: no unpinned switch under SHORT_LINE', () => {
    const plan = planWorldEvents(input([line('a', 0, 2), { ...line('b', 2.1, 2.1 + SHORT_LINE - 0.05), seats: [RIGHT, LEFT], seat: 'w/right' }]));
    const b = plan.events.find((e) => e.lineIds.includes('b'))!;
    expect(b.kind).toBe('keep');
    expect(b.seatAfter).toBe('w/left');
  });

  it('keep shows the line in the seat before only where that seat is its own: else the line takes its own seat', () => {
    const plan = planWorldEvents(input([line('a', 0, 2), { ...line('b', 2.1, 2.5), seats: [RIGHT], seat: 'w/right' }]));
    const b = plan.events.find((e) => e.lineIds.includes('b'))!;
    expect([b.kind, b.seatAfter]).toEqual(['layout-seat', 'w/right']);
  });

  it('the same event is not counted twice: a switch riding the camera and a hold inside a handoff are one cut each', () => {
    const lines = [line('a', 0, 2), { ...line('b', 2.2, 4.2), seats: [RIGHT, LEFT], seat: 'w/right', pinned: 'test' }, line('c', 4.6, 7)];
    const plan = planWorldEvents(input(lines, { cams: [{ lineId: 'b', at: 2.0, sec: 0.5, kind: 'push-through' }], handoffs: [{ lineId: 'c', kind: 'link-seat', dir: 0, seam: 4.4, dur: LINK_PREPARE + LINK_CLEAR }], holds: [{ lineId: 'c', kind: 'ink-run', at: 4.2, from: 4.2, to: 4.5 }] }));
    const b = plan.events.find((e) => e.lineIds.at(-1) === 'b' && e.kind !== 'keep')!;
    expect(b.camera).toBe('push-through');
    expect(plan.events.find((e) => e.kind === 'page-handoff')!.merged).toEqual(['hold:ink-run@c']);
    expect(countCuts(plan.events, [0, 8]).cuts).toBe(2);
  });

  it('capability off: no switch of its own; the composer’s seats and given reposes stand, each counted once', () => {
    const lines = [{ ...line('a', 0, 3, 3), pinned: 'off', given: [{ at: 1.5, seat: 'w/top', reason: 'given' }] }, { ...line('b', 3.2, 6, 3), pinned: 'off', seat: 'w/right' }];
    const plan = planWorldEvents(input(lines, { caps: caps([]) }));
    expect(cuts(plan.events).every((e) => e.fixed)).toBe(true);
    expect(cuts(plan.events).map((e) => [e.kind, e.scope, e.seatAfter])).toEqual([['layout-seat', 'in-line', 'w/top'], ['layout-seat', 'line', 'w/right']]);
    // with nothing pinned or given, a world with no family keeps every line
    const bare = planWorldEvents(input([line('a', 0, 3, 3), line('b', 3.2, 6, 3)], { caps: caps([]) }));
    expect(cuts(bare.events)).toEqual([]);
  });

  it('an in-line switch never takes the words off the carrier they are read on, and never between two pages', () => {
    const plan = planWorldEvents(input([line('a', 0, 3, 4, [PAGE_A, PAGE_B]), line('b', 3.5, 7, 4, [PAGE_A, PAGE_B])]));
    expect(plan.events.some((e) => e.scope === 'in-line')).toBe(false);
  });

  it('a fixed seed gives the same plan with pins, rooms and cameras', () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ ...line(`l${i}`, i * 2, i * 2 + 1.9, 3), ...(i % 3 === 0 ? { pinned: 'x' } : {}), ...(i % 4 === 1 ? { inLine: { spans: [[i * 2, i * 2 + 1]] as [number, number][] } } : {}) }));
    const o = { seed: 3, cams: [{ lineId: 'l5', at: 9.8, sec: 0.5, kind: 'diagonal' }], sections: [{ start: 0, energy: 0.3 }, { start: 9.9, energy: 0.9 }] };
    expect(JSON.stringify(planWorldEvents(input(structuredClone(lines), o)))).toBe(JSON.stringify(planWorldEvents(input(lines, o))));
  });
});

describe('the wiring', () => {
  it('declares the single-page worlds and phase 4\'s, no other; document keeps its camera still and only its own page moves', () => {
    expect(Object.keys(WORLD_COMPOSITIONS).sort()).toEqual([...ONE_PAGE_WORLDS].sort());
    expect(compositionsOf('silk-cold')).toBeUndefined();
    // (phase 3b: the receipt's own tear and feed, never a camera, never a seat change of the scheduler's own)
    expect(WORLD_COMPOSITIONS['document'].kinds).toEqual(['page-handoff']);
    expect(Object.values(WORLD_COMPOSITIONS['document'].materials!).every((m) => m.family === 'page-handoff' && m.seat === 'same')).toBe(true);
    // nothing is taken over by default (2026-11-09 review): only an explicit opt-in schedules them
    for (const c of Object.values(WORLD_COMPOSITIONS)) expect(c.enabled).toBeFalsy();
    // (no move is left pending: each bounded move now has a renderer and is laid only as an approved event)
    for (const c of Object.values(WORLD_COMPOSITIONS)) expect(c.pending ?? {}).toEqual({});
    for (const c of Object.values(WORLD_COMPOSITIONS)) expect(c.allowedAt['camera-reframe'] ?? ['section']).toEqual(['section']);
  });

  it('linkGrounds lays only approved handoffs; the seam clock and layer t0 are unchanged', () => {
    const lines = [
      { id: 'a', show: 7.8, start: 8, shot: 'a', world: { enter: 'own-in', exit: 'edge-relay' } },
      { id: 'b', show: 9.8, start: 10, shot: 'b', world: { enter: 'edge-relay', exit: 'layer-seat' } },
      { id: 'c', show: 11.8, start: 12, shot: 'c', world: { enter: 'own-in', exit: 'own-out' } },
    ];
    const mk = () => [{ start: 7.8, layers: [{}] }, { start: 9.8, layers: [{}] }, { start: 11.8, layers: [{}] }] as { start: number; layers?: { t0?: number }[]; transition?: { kind: string; seam?: number } }[];
    const [all, some] = [mk(), mk()];
    expect(linkGrounds(all, lines).map((x) => x.id)).toEqual(['b', 'c']);
    expect(linkGrounds(some, lines, new Set(['b'])).map((x) => x.id)).toEqual(['b']);
    expect(some[2]).toEqual(mk()[2]);
    expect(some[1]).toEqual(all[1]);
    expect(some[1].layers).toEqual([{ t0: 9.8 }]);
    for (const t of [9.6, 9.7, 9.81, 10.5]) expect(sectionClock(some, t)).toBe(sectionClock(all, t));
  });

  it('applyWorldEvents writes the boundary seat and the in-line switches, and a page set takes its page', () => {
    const world = { layouts: { lines: [{ set: 'w/a', ground: 'w/a' }, { set: 'w/b', ground: 'w/b' }, { set: 'w/c' }] } } as never;
    const p = { shots: [{ shot: 'L1', lines: [{ cue: 'x', world: { set: 'w/a', seats: ['w/b'], repose: [{ at: 1, set: 'w/c' }] } }], cuts: [{ fx: 'w/a' }, { fx: 'other' }] }] };
    const ev = (o: Partial<WorldEvent>): WorldEvent => ({ id: 'e', lineIds: ['x'], kind: 'layout-seat', at: 0, from: 0, to: 0, seatBefore: '', seatAfter: '', scope: 'line', changesLight: false, reason: '', ...o });
    const out = applyWorldEvents(p, { events: [ev({ seatAfter: 'w/b' })], holds: [], rejected: [], warnings: [] }, world);
    expect(out.shots[0].lines[0].world).toEqual({ set: 'w/b', seats: ['w/b'] });
    expect(out.shots[0].cuts.map((c) => c.fx)).toEqual(['w/b', 'other']);
    // a seat the composer did not offer is never written
    expect(applyWorldEvents(p, { events: [ev({ seatAfter: 'w/c' })], holds: [], rejected: [], warnings: [] }, world).shots[0].lines[0].world!.set).toBe('w/a');
    expect(p.shots[0].lines[0].world.set).toBe('w/a');
  });
});

const SONG = 'out/db/yt_w_fCuUR3lEs/song.json';
const MEANING = 'out/research/instant/plans/nun/meaning.json';
describe.skipIf(!existsSync(SONG) || !existsSync(MEANING))('the wired free path on 雙截棍 (seed 0)', () => {
  const song = existsSync(SONG) ? JSON.parse(readFileSync(SONG, 'utf8')) : undefined;
  const meaning = existsSync(MEANING) ? JSON.parse(readFileSync(MEANING, 'utf8')) : undefined;

  it('a world with no capability draws exactly what it drew before, with its one event table added', () => {
    for (const id of ['silk-cold', 'terminal']) {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const before = freeJob(song, { style, seed: 0, meaning, worldEvents: false });
      const after = freeJob(song, { style, seed: 0, meaning });
      expect(after.treatment.worldEvents?.source).toBe('declared-off');
      const { worldEvents: _w, ...rest } = after.job.treatment;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(before.job.treatment));
      expect(capsOf(style.world).kinds).toEqual([]);
    }
  });

  for (const id of ONE_PAGE_WORLDS)
    it(`${id}: every cut in the table is drawn (the plan as drawn counts the same), the same seed the same table, every clock kept`, () => {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const a = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
      expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(a.treatment.worldEvents));
      // the final draw matches its plan: seats, pages, times, handoffs, and the light clock holds
      expect(verifyWorldEvents(a.job, style.world, a.treatment.worldEvents!)).toEqual([]);
      expect(lightGapWarnings(a.job, a.treatment.worldEvents!)).toEqual([]);
      expect(a.treatment.worldEvents!.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
      // every switch at a boundary falls on the line's show, the frame its set is drawn from
      const shows = new Map(shownOf(a.job).rows.map((r) => [r.id, r.show]));
      for (const e of a.treatment.worldEvents!.events.filter((x) => x.scope !== 'in-line' && !['keep', 'page-handoff', 'camera-reframe'].includes(x.kind))) expect(e.at, e.id).toBe(shows.get(e.lineIds.at(-1)!));
      const table = a.treatment.worldEvents!;
      expect(table.source).toBe('declared');
      const win: [number, number] = [76, 101];
      expect(countCuts(currentEvents(a, song, style.world), win).cuts).toBe(countCuts(table.events, win).cuts);
      // the scheduler's own switches keep every clock (pinned and Q4 inputs are reported when they do not)
      const own = table.events.filter((e) => !e.fixed && e.kind !== 'keep');
      expectClocks(own);
      // no in-line switch on a line the aligner did not time
      const inp = fromJob(a.job, song, style.world, { window: win });
      for (const l of inp.lines.filter((x) => !x.words)) expect(table.events.some((e) => e.scope === 'in-line' && !e.fixed && e.lineIds.includes(l.id))).toBe(false);
      // Q2's holds are all in the table, standing or folded into a handoff, and none moved
      const held = (a.treatment.cues as { cueId: string; world?: { beat?: { at: number } } }[]).filter((c) => c.world?.beat);
      expect(table.holds.length + table.events.flatMap((e) => e.merged ?? []).length).toBe(held.length);
      for (const h of table.holds) expect(held.find((c) => c.cueId === h.lineId)!.world!.beat!.at).toBe(h.at);
    });
});

describe('phase-2 review fixes', () => {
  it('a declared seat whitelist is kept: a candidate outside it is never taken, a pinned own seat still stands', () => {
    const C: SeatCandidate = { ...TOP, id: 'w/c' };
    const lines = Array.from({ length: 8 }, (_, i) => line(`l${i}`, i * 2.5, i * 2.5 + 2.4, 3, [i % 2 ? LEFT : RIGHT, C]));
    const plan = planWorldEvents(input(lines, { caps: caps(['layout-seat'], { seats: ['w/left', 'w/right'] }) }));
    for (const e of plan.events) expect(e.seatAfter).not.toBe('w/c');
    const pinned = planWorldEvents(input([line('a', 0, 2), { ...line('b', 2.2, 4, 0, [C]), pinned: 'test', seat: 'w/c' }], { caps: caps(['layout-seat'], { seats: ['w/left', 'w/right'] }) }));
    expect(pinned.events.find((e) => e.lineIds.includes('b'))?.seatAfter).toBe('w/c');
  });

  it('a boundary switch falls on the line show or not at all (no later start the renderer would not keep)', () => {
    // b's show collides with a's in-line seam floor, its start would not: it keeps rather than switch at its start
    const a = { ...line('a', 0, 3, 0), words: [{ text: 'x', from: 0, to: 2.15 }, { text: 'y', from: 2.15, to: 3 }] };
    const plan = planWorldEvents(input([a, { ...line('b', 3, 5), seats: [RIGHT, LEFT], seat: 'w/right' }]));
    for (const e of plan.events.filter((x) => x.lineIds.at(-1) === 'b' && x.scope !== 'in-line')) expect(e.kind === 'keep' || e.at === 2.8).toBe(true);
  });

  it("the composer's lyric handoff is a fixed page handoff with its own window, counted once and protected", () => {
    const plan = planWorldEvents(input([line('a', 0, 2), line('b', 2.6, 5, 3)], { handoffs: [{ lineId: 'b', kind: 'lyric-relay', dir: 0, seam: 2.4, prepare: 0.6, dur: 1.1 }] }));
    const h = plan.events.find((e) => e.kind === 'page-handoff')!;
    expect([h.fixed, h.from, h.at, h.to]).toEqual([true, 1.8, 2.4, 2.9]);
    expect(countCuts(plan.events, [0, 6]).byKind['page-handoff']).toBe(1);
    for (const e of plan.events.filter((x) => x.scope === 'in-line')) expect(e.from).toBeGreaterThanOrEqual(2.9 + ACTION_GAP - 1e-6);
  });
});

describe.skipIf(!existsSync(SONG) || !existsSync(MEANING))('phase-2 review fixes on real songs', () => {
  const load = (db: string, plan: string) => ({ song: JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8')), meaning: existsSync(`out/research/instant/plans/${plan}/meaning.json`) ? JSON.parse(readFileSync(`out/research/instant/plans/${plan}/meaning.json`, 'utf8')) : undefined });
  const nun = existsSync(SONG) ? load('yt_w_fCuUR3lEs', 'nun') : undefined;

  it('the paid pool keeps its reposes: poolOf never marks the five as scheduled', () => {
    for (const id of ONE_PAGE_WORLDS) expect(poolOf(FREE_STYLES.find((s) => s.id === id)!.world, RECIPES).scheduled, id).toBeFalsy();
    const W = poolOf(FREE_STYLES.find((s) => s.id === 'chalkboard')!.world, RECIPES);
    const { plan } = composePlan(nun!.song, { ...nun!.meaning, palette: 'tea' }, false, { reroll: 0, world: W });
    const lines = (plan as unknown as { shots: { lines: { world?: { repose?: unknown[] } }[] }[] }).shots.flatMap((s) => s.lines);
    expect(lines.filter((l) => l.world?.repose?.length).length).toBeGreaterThan(0);
  });

  it('by default the five draw as before; only an opt-in schedules them', () => {
    const style = FREE_STYLES.find((s) => s.id === 'chalkboard')!;
    const before = freeJob(nun!.song, { style, seed: 0, meaning: nun!.meaning, worldEvents: false });
    const plain = freeJob(nun!.song, { style, seed: 0, meaning: nun!.meaning });
    const { worldEvents: _w, ...rest } = plain.job.treatment;
    expect(plain.treatment.worldEvents?.source).toBe('declared-off');
    expect(JSON.stringify(rest)).toBe(JSON.stringify(before.job.treatment));
    expect(freeJob(nun!.song, { style, seed: 0, meaning: nun!.meaning, worldEvents: true }).treatment.worldEvents?.source).toBe('declared');
  });

  it('regressions: art-deco choroin c061 and chalkboard nun c041 switch on their show or keep, the seam clock kept', () => {
    const cases: [string, string, string, string][] = [['art-deco', 'yt_hCCskTJwvuc', 'choroin', 'c061'], ['chalkboard', 'yt_w_fCuUR3lEs', 'nun', 'c041']];
    for (const [id, db, plan, cue] of cases) {
      if (!existsSync(`out/db/${db}/song.json`)) continue;
      const { song, meaning } = load(db, plan);
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
      const show = shownOf(f.job).rows.find((r) => r.id === cue)!.show;
      const own = f.treatment.worldEvents!.events.filter((e) => e.lineIds.at(-1) === cue && e.scope !== 'in-line' && e.kind !== 'keep' && e.kind !== 'camera-reframe');
      for (const e of own) {
        expect(e.at, `${id} ${cue}`).toBe(show);
        for (const x of f.treatment.worldEvents!.events.filter((y) => y !== e && y.kind !== 'keep' && !y.fixed)) expect(Math.abs(x.at - e.at)).toBeGreaterThanOrEqual(SEAM_GAP - 1e-6);
      }
    }
  });

  it('a final draw that does not match its plan is reported by event id, never accepted silently', () => {
    const style = FREE_STYLES.find((s) => s.id === 'blueprint')!;
    const f = freeJob(nun!.song, { style, seed: 0, meaning: nun!.meaning, worldEvents: true });
    const e = f.treatment.worldEvents!.events.find((x) => x.kind === 'layout-seat' && x.scope !== 'in-line')!;
    const job = structuredClone(f.job);
    const cue = (job.treatment.cues as { cueId: string; world?: { set: string } }[]).find((c) => c.cueId === e.lineIds.at(-1))!;
    cue.world!.set = cue.world!.set === 'blueprint/notes' ? 'blueprint/construct' : 'blueprint/notes';
    expect(verifyWorldEvents(job, style.world, f.treatment.worldEvents!).map((w) => w.inputs[0])).toContain(e.id);
    const lit = { events: [...f.treatment.worldEvents!.events, { ...e, id: 'x1', changesLight: true }, { ...e, id: 'x2', at: e.at + 0.2, changesLight: true }] };
    expect(lightGapWarnings(f.job, lit).length).toBeGreaterThan(0);
  });
});

describe('phase 3a: seats by their real geometry (step 2)', () => {
  const world = FREE_STYLES.find((s) => s.id === 'blueprint')!.world;
  it('a seat carries the box its words are really laid in, their type size and its carrier', () => {
    const short = seatIn(world, 'blueprint/construct', '快使用');
    const long = seatIn(world, 'blueprint/construct', '快使用雙截棍 哼哼哈兮');
    expect(short.box && long.box).toBeTruthy();
    expect(short.carrierId).toBe('ground:blueprint/construct');
    // (left-anchored: the same left edge, a longer line runs further right)
    expect(long.box!.x0).toBeCloseTo(short.box!.x0, 2);
    expect(long.box!.x1).toBeGreaterThan(short.box!.x1);
    expect(short.size).toBeGreaterThan(0);
  });
  it('seatsDiffer compares where the words stand, not set names: a longer line in the same place is no move, the same words moved are', () => {
    const a = { id: 's/a', box: { x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.3 }, size: 120, text: 'x' };
    // another set name, another line, the same left edge and size: one composition
    expect(seatsDiffer(a, { id: 's/b', box: { x0: 0.1, y0: 0.2, x1: 0.7, y1: 0.3 }, size: 120, text: 'yyyy' })).toBe(false);
    // the same words, their box moved 0.1: another seat
    expect(seatsDiffer(a, { ...a, id: 's/b', box: { x0: 0.2, y0: 0.2, x1: 0.5, y1: 0.3 } })).toBe(true);
    // the same words a third larger: another seat; another line, a third larger: no (its size follows its length)
    expect(seatsDiffer(a, { ...a, id: 's/b', size: 160 })).toBe(true);
    expect(seatsDiffer(a, { ...a, id: 's/b', size: 160, text: 'other' })).toBe(false);
    expect(seatsDiffer(a, { ...a, id: 's/b', size: 240, text: 'other' })).toBe(true);
    // another carrier is another composition wherever the words stand
    expect(seatsDiffer(a, { ...a, id: 's/b', carrierId: 'card' })).toBe(true);
  });
});

describe.skipIf(!existsSync(SONG) || !existsSync(MEANING))('phase 3a: every event lands as planned (step 1)', () => {
  const song = existsSync(SONG) ? JSON.parse(readFileSync(SONG, 'utf8')) : undefined;
  const meaning = existsSync(MEANING) ? JSON.parse(readFileSync(MEANING, 'utf8')) : undefined;
  for (const id of ONE_PAGE_WORLDS)
    it(`${id}: plan → applyWorldEvents → freeJob draws each event with its kind, seat, page, switch point and window`, () => {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
      const table = f.treatment.worldEvents!;
      const { events, extra } = landedEvents(f.job, style.world, table);
      expect(events).toHaveLength(table.events.length);
      for (const l of events) {
        expect(l.why, l.id).toBeUndefined();
        // (a line no world set lays, a plain lyric in its shot, is drawn with no world seat: kept as it is)
        if (l.plan.kind === 'keep') { expect(l.drawn!.seat, l.id).toBe(SET_SPECS[l.plan.seat] ? l.plan.seat : ''); continue; }
        expect([l.drawn!.kind === l.plan.kind || (l.plan.kind === 'carrier-swap' && l.drawn!.kind === 'layout-seat'), l.drawn!.seat, l.drawn!.page, l.drawn!.at, l.drawn!.from, l.drawn!.to], l.id)
          .toEqual([true, l.plan.seat, l.plan.page, l.plan.at, l.plan.from, l.plan.to].map((x, k) => (k >= 3 ? expect.closeTo(x as number, 2) : x)));
      }
      expect(extra).toEqual([]);
    });

  it('a drawn event moved off its approved time, or a cut drawn the plan does not hold, is reported by id', () => {
    const style = FREE_STYLES.find((s) => s.id === 'chalkboard')!;
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const e = f.treatment.worldEvents!.events.find((x) => x.scope === 'in-line' && x.kind === 'layout-seat')!;
    const job = structuredClone(f.job);
    const cue = (job.treatment.cues as { cueId: string; world?: { repose?: { at: number; set: string }[] } }[]).find((c) => c.cueId === e.lineIds[0])!;
    cue.world!.repose = cue.world!.repose!.map((r) => ({ ...r, at: r.at + 0.2 }));
    const out = verifyWorldEvents(job, style.world, f.treatment.worldEvents!);
    expect(out.map((w) => w.inputs[0])).toContain(e.id);
    expect(out.some((w) => /drawn that the plan does not hold/.test(w.reason))).toBe(true);
  });
});

describe('phase 3a: same-page seats (step 3)', () => {
  it('notebook, art-deco and blueprint declare seats on their own pages, at their least type, taken inside a line; chalkboard and document have none', () => {
    for (const id of ['notebook', 'art-deco', 'blueprint']) {
      const c = compositionsOf(id)!;
      expect(c.allowedAt['layout-seat']).toContain('in-line');
      expect(c.pageSeats).toBe(true);
      expect(pageSeatsOf(id).length).toBeGreaterThan(0);
      expect(c.protectedRegion?.length).toBeGreaterThan(0);
      const world = FREE_STYLES.find((s) => s.id === id)!.world;
      for (const x of pageSeatsOf(id).filter((y) => !SET_SPECS[y].panels)) {
        const main = SET_SPECS[x].samePage!;
        expect(SET_SPECS[x].lo, x).toBeGreaterThanOrEqual(96);
        expect(isPageSeat(x)).toBe(true);
        // (the same page under the words: the same carrier, a different seat)
        expect(pageOf(world, x), x).toBe(pageOf(world, main));
        expect(seatIn(world, x, '快使用雙截棍').carrierId).toBe(seatIn(world, main, '快使用雙截棍').carrierId);
        expect(seatsDiffer(seatIn(world, main, '快使用雙截棍'), seatIn(world, x, '快使用雙截棍')), x).toBe(true);
      }
    }
    expect(compositionsOf('chalkboard')!.pageSeats).toBeUndefined();
    expect(pageSeatsOf('chalkboard')).toEqual([]);
    expect(pageSeatsOf('document')).toEqual([]);
  });

  it('a same-page seat is offered only where the line keeps the world minimum type and stays off the page graphics', () => {
    for (const id of ['notebook', 'art-deco', 'blueprint']) {
      const c = compositionsOf(id)!;
      for (const main of [...new Set(pageSeatsOf(id).map((x) => SET_SPECS[x].samePage!))])
        for (const text of ['快使用', '快使用雙截棍 哼哼哈兮', '如果我有輕功 飛簷走壁 ', 'a much longer line of latin words than any seat takes in one row', '他們兒子我習慣從小就耳濡目染什麼刀槍跟棍棒我都耍的有模有樣']) {
          for (const x of pageSeatsFor(text, main, id)) {
            const laid = laidSeat(text, x)!;
            expect(laid.size, `${x} ${text}`).toBeGreaterThanOrEqual(SET_SPECS[x].lo);
            for (const p of [...laid.protect, ...(c.protectedRegion ?? [])]) expect(boxesMeet(laid.box, p), `${x} ${text}`).toBe(false);
          }
        }
    }
    // (a line too long for the detail strip at the least type is not offered it)
    expect(pageSeatsFor('他們兒子我習慣從小就耳濡目染什麼刀槍跟棍棒我都耍的有模有樣', 'blueprint/construct', 'blueprint')).toEqual([]);
  });
});

const SNOW = 'out/db/yt_5i50aTB7JFo/song.json';
const SNOW_MEANING = 'out/research/instant/plans/snow/meaning.json';
describe.skipIf(!existsSync(SNOW) || !existsSync(SNOW_MEANING) || !existsSync(SONG) || !existsSync(MEANING))('phase 3a: in-line switches to same-page seats on real songs', () => {
  const songs = existsSync(SNOW) && existsSync(SONG) ? [[JSON.parse(readFileSync(SONG, 'utf8')), JSON.parse(readFileSync(MEANING, 'utf8'))], [JSON.parse(readFileSync(SNOW, 'utf8')), JSON.parse(readFileSync(SNOW_MEANING, 'utf8'))]] : [];
  for (const id of ['notebook', 'art-deco', 'blueprint'])
    it(`${id}: at most one in-line switch a line, only at a sung word break, 0.35 s still either side, on the same page, the whitelist kept, the same seed the same table`, () => {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      let seen = 0;
      for (const [song, meaning] of songs) {
        const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
        const table = f.treatment.worldEvents!;
        expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(table));
        expect(verifyWorldEvents(f.job, style.world, table)).toEqual([]);
        const inp = fromJob(f.job, song, style.world);
        const caps = capsOf(style.world);
        for (const e of table.events.filter((x) => !x.fixed && x.kind !== 'keep')) expect(caps.seats, e.id).toContain(e.seatAfter);
        const inLine = table.events.filter((e) => e.scope === 'in-line' && !e.fixed && e.kind !== 'keep');
        seen += inLine.length;
        const byLine = new Map<string, number>();
        for (const e of inLine) {
          const l = inp.lines.find((x) => x.id === e.lineIds[0])!;
          byLine.set(l.id, (byLine.get(l.id) ?? 0) + 1);
          // a sung word break the aligner timed, never a time in proportion
          expect(l.words, e.id).toBeDefined();
          expect(l.words!.slice(1).map((w) => w.from), e.id).toContain(e.at);
          expect(e.at - l.start, e.id).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
          expect(l.end - e.to, e.id).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
          // the same page under the words: nothing is taken from under them, nothing laid over them
          expect(pageOf(style.world, e.seatAfter), e.id).toBe(pageOf(style.world, e.seatBefore));
          const cue = song.cues.find((c: { id: string }) => c.id === l.id);
          const laid = laidSeat(cue.text, e.seatAfter)!;
          if (isPageSeat(e.seatAfter)) {
            expect(laid.size, e.id).toBeGreaterThanOrEqual(SET_SPECS[e.seatAfter].lo);
            for (const p of laid.protect) expect(boxesMeet(laid.box, p), e.id).toBe(false);
          }
        }
        for (const [line, n] of byLine) expect(n, line).toBe(1);
        // no in-line switch on a line the aligner did not time
        for (const l of inp.lines.filter((x) => !x.words)) expect(inLine.some((e) => e.lineIds.includes(l.id)), l.id).toBe(false);
      }
      expect(seen, id).toBeGreaterThan(0);
    });

  it('by default (scheduler off) notebook, art-deco and blueprint draw exactly as before: no same-page seat is offered or drawn', () => {
    for (const id of ['notebook', 'art-deco', 'blueprint']) {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const [song, meaning] = songs[1];
      const plain = freeJob(song, { style, seed: 0, meaning });
      const before = freeJob(song, { style, seed: 0, meaning, worldEvents: false });
      const { worldEvents: _w, ...rest } = plain.job.treatment;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(before.job.treatment));
      expect(JSON.stringify(rest)).not.toMatch(/\+(margin|second|detail)/);
    }
  });
});

describe('phase 3a round 2: still reading after the entrance; Q2/Q4 overlaps resolved', () => {
  it('the 0.35 s before an in-line switch counts from the end of the entrance, not the line start: a short window keeps', () => {
    const words = [{ text: 'x', from: 10, to: 10.5 }, { text: 'y', from: 10.5, to: 13 }];
    // the only sung break is 0.5 s after the start: with no entrance, 0.5 s of still reading, the switch lands
    const open = planWorldEvents(input([line('a', 7, 9.5), { ...line('l', 10, 13), words }]));
    expect(open.events.some((e) => e.scope === 'in-line' && e.at === 10.5)).toBe(true);
    // its entrance lands at 10.3: 0.2 s of still reading before the break, so the line keeps its seat
    const late = planWorldEvents(input([line('a', 7, 9.5), { ...line('l', 10, 13), words, settled: 10.3 }]));
    expect(late.events.some((e) => e.scope === 'in-line')).toBe(false);
    expect(late.rejected.some((r) => r.candidate.lineId === 'l' && /less than 0.35s of still reading/.test(r.reason))).toBe(true);
  });

  it('a scheduled world moves a hold that partly overlaps a handoff to the nearest legal beat, else just clear of it, else drops it; a world without capability only warns', () => {
    const lines = [line('a', 0, 3), line('b', 3.4, 6)];
    const hand = { lineId: 'b', kind: 'link-relay-x', dir: 0, seam: 3.2, dur: LINK_PREPARE + LINK_CLEAR };
    const hold = { lineId: 'a', kind: 'line-grow', at: 2.8, from: 2.8, to: 3.1 };
    const moved = planWorldEvents(input(lines, { handoffs: [hand], holds: [hold], beats: [1, 2, 2.5] }));
    expect(moved.holdMoves).toEqual([expect.objectContaining({ lineId: 'a', from: 2.8, to: 2.5 })]);
    expect(moved.holds[0]).toMatchObject({ at: 2.5, from: 2.5, to: 2.8 });
    expect(moved.warnings.some((w) => /partly overlaps/.test(w.reason))).toBe(false);
    // the hold window clears the handoff by ACTION_GAP
    const w0 = hand.seam - LINK_PREPARE;
    expect(moved.holds[0].to + ACTION_GAP).toBeLessThanOrEqual(w0 + 1e-6);
    // no beat fits: the nearest time just clear of the handoff (2.95 − 0.10 − 0.3)
    const edge = planWorldEvents(input(lines, { handoffs: [hand], holds: [hold], beats: [] }));
    expect(edge.holdMoves?.[0].to).toBeCloseTo(2.549, 3);
    // a line too short for any of it: dropped
    const dropped = planWorldEvents(input([line('a', 2.6, 3), line('b', 3.4, 6)], { handoffs: [hand], holds: [hold], beats: [] }));
    expect(dropped.holdMoves?.[0].to).toBeNull();
    expect(dropped.holds).toEqual([]);
    const off = planWorldEvents(input(lines, { handoffs: [hand], holds: [hold], beats: [2.5], caps: caps([]) }));
    expect(off.holdMoves).toBeUndefined();
    expect(off.warnings.some((w) => /partly overlaps/.test(w.reason))).toBe(true);
  });
});

describe.skipIf(!existsSync('out/db/yt_5i50aTB7JFo/song.json'))('phase 3a round 2 on 大雪: art-deco c014 line-grow no longer overlaps the c015 handoff', () => {
  it('the hold is moved (table holdMoves), drawn at its new beat, and the final check reports no overlap', () => {
    const song = JSON.parse(readFileSync('out/db/yt_5i50aTB7JFo/song.json', 'utf8'));
    const meaning = JSON.parse(readFileSync('out/research/instant/plans/snow/meaning.json', 'utf8'));
    const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const table = f.treatment.worldEvents!;
    expect(table.holdMoves?.some((m) => m.lineId === 'c014' && m.to !== null)).toBe(true);
    expect(table.warnings.filter((w) => /partly overlaps|final check/.test(w.reason))).toEqual([]);
    const cue = (f.treatment.cues as { cueId: string; world?: { beat?: { at: number } } }[]).find((c) => c.cueId === 'c014')!;
    expect(cue.world!.beat!.at).toBe(table.holdMoves!.find((m) => m.lineId === 'c014')!.to);
    // tampered back: the overlap is a final-check failure the gate and the measurement exit on
    const job = structuredClone(f.job);
    (job.treatment.cues as { cueId: string; world?: { beat?: { at: number } } }[]).find((c) => c.cueId === 'c014')!.world!.beat!.at = 68.081;
    expect(verifyWorldEvents(job, style.world, table).some((w) => /partly overlaps/.test(w.reason))).toBe(true);
  });
});
