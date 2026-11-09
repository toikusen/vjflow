import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import { ACTION_GAP, countCuts, LIGHT_GAP, planWorldEvents, READ_STABLE, SEAM_GAP, SHORT_LINE, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { currentEvents, fromFreeJob, sungWords } from './world-events-adapter';

const LEFT: SeatCandidate = { id: 'w/left', box: { x0: 0.05, y0: 0.3, x1: 0.45, y1: 0.6 } };
const RIGHT: SeatCandidate = { id: 'w/right', box: { x0: 0.55, y0: 0.3, x1: 0.95, y1: 0.6 } };
const TOP: SeatCandidate = { id: 'w/top', box: { x0: 0.2, y0: 0.08, x1: 0.8, y1: 0.3 } };
const CARD: SeatCandidate = { id: 'w/card', box: { x0: 0.25, y0: 0.55, x1: 0.75, y1: 0.9 }, carrierId: 'card' };
const caps = (kinds: WorldCompositionCaps['kinds'], o: Partial<WorldCompositionCaps> = {}): WorldCompositionCaps => ({ worldId: 'w', kinds, seats: [], carrierRole: 'page', ...o });
/** A line from `start` to `end`, sung in `n` even phrases (none when n is 0), every seat a candidate. */
const line = (id: string, start: number, end: number, n = 0, seats = [LEFT, RIGHT, TOP]): WorldEventLine => ({
  id, show: start - 0.2, start, end, seats,
  ...(n ? { words: Array.from({ length: n }, (_, k) => ({ text: `p${k}`, from: start + ((end - start) * k) / n, to: start + ((end - start) * (k + 1)) / n })) } : {}),
});
const input = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.8 }], caps: caps(['layout-seat', 'page-handoff', 'camera-reframe'], { ownPages: true }), seed: 0, ...o });
const cuts = (es: WorldEvent[]) => es.filter((e) => e.kind !== 'keep');

/** Every scheduled pair keeps the seam clock, the action gap and the light clock. */
function expectClocks(es: WorldEvent[], lights: number[] = []) {
  const c = cuts(es);
  for (const [i, a] of c.entries())
    for (const b of c.slice(i + 1)) {
      expect(Math.abs(a.at - b.at), `${a.id} / ${b.id} seams`).toBeGreaterThanOrEqual(SEAM_GAP - 1e-6);
      const gap = a.from < b.from ? b.from - a.to : a.from - b.to;
      expect(gap, `${a.id} / ${b.id} actions`).toBeGreaterThanOrEqual(ACTION_GAP - 1e-6);
      if (a.changesLight && b.changesLight) expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(LIGHT_GAP - 1e-6);
    }
  for (const t of lights) for (const e of c.filter((x) => x.changesLight)) expect(Math.abs(e.at - t) < 0.05 || Math.abs(e.at - t) >= LIGHT_GAP - 1e-6, `${e.id} vs light at ${t}`).toBe(true);
}

describe('planWorldEvents', () => {
  it('keeps the light clock across lines and sections, not only inside a line', () => {
    // a ground's light changes at 2.3 (a section boundary); the next line's reseat onto a card would change it again 0.3 s later
    const lines = [line('a', 0, 2.2), line('b', 2.6, 4.6, 0, [CARD, LEFT])];
    lines[1].seat = 'w/card';
    const plan = planWorldEvents(input(lines, { sections: [{ start: 0, energy: 0.8 }, { start: 2.5, energy: 0.8 }], lights: [{ at: 2.1, what: 'ground cut' }] }));
    const b = plan.events.find((e) => e.lineIds.includes('b') && e.scope !== 'in-line')!;
    expect(b.kind === 'keep' || !b.changesLight || Math.abs(b.at - 2.1) >= LIGHT_GAP).toBe(true);
    expect(plan.rejected.some((r) => r.candidate.lineId === 'b' && /light change/.test(r.reason))).toBe(true);
    expectClocks(plan.events, [2.1]);
  });

  it('a switch on the very frame of a ground cut is that one light change', () => {
    const lines = [line('a', 0, 2.2), line('b', 2.6, 4.6, 0, [CARD, LEFT])];
    lines[1].seat = 'w/card';
    const plan = planWorldEvents(input(lines, { sections: [{ start: 0, energy: 0.8 }, { start: 2.5, energy: 0.8 }], lights: [{ at: 2.4, what: 'ground cut' }] }));
    const b = plan.events.find((e) => e.lineIds.includes('b') && e.kind !== 'keep')!;
    expect([b.at, b.changesLight]).toEqual([2.4, true]);
  });

  it('never moves a Q4 handoff; a candidate it collides with goes elsewhere or is dropped with a reason', () => {
    const lines = [line('a', 0, 2), line('b', 2, 2.6), line('c', 2.7, 5, 3)];
    const seam = 2;
    const plan = planWorldEvents(input(lines, { handoffs: [{ lineId: 'b', kind: 'link-relay-x', dir: 0, seam, dur: LINK_PREPARE + LINK_CLEAR }] }));
    const h = plan.events.find((e) => e.kind === 'page-handoff' && e.fixed)!;
    expect([h.at, h.from, h.to]).toEqual([seam, seam - LINK_PREPARE, seam + LINK_CLEAR]);
    // c shows at 2.5, inside the handoff's clear and under the seam floor: its reseat is dropped (a boundary switch falls
    // on the show the set is drawn from, or not at all) and the line keeps
    expect(plan.rejected.some((r) => r.candidate.lineId === 'c' && r.candidate.at === 2.5 && /Q4 link-relay-x/.test(r.reason))).toBe(true);
    expect(plan.events.find((e) => e.lineIds.includes('c') && e.scope !== 'in-line')?.kind).toBe('keep');
    // with no later window it is dropped, and the line keeps
    const tight = planWorldEvents(input([line('a', 0, 2), line('b', 2, 2.4), line('c', 2.5, 5, 3)], { handoffs: [{ lineId: 'b', kind: 'link-relay-x', dir: 0, seam, dur: LINK_PREPARE + LINK_CLEAR }] }));
    expect(tight.events.find((e) => e.lineIds.includes('c') && e.scope !== 'in-line')?.kind).toBe('keep');
    expectClocks(plan.events);
  });

  it('two page handoffs side by side need about 0.70 s between seams', () => {
    const at = (gap: number) => {
      // (b is up long enough for a page to hand over out of it: world-handoff.ts upLongEnough)
      const lines = [line('a', -3, 1.75), line('b', 1.8, 2 + gap - 0.1), line('c', 2 + gap + 0.2, 6)];
      lines[2].show = 2 + gap;
      return planWorldEvents(input(lines, { sections: [{ start: -3, energy: 0.8 }, { start: 2 + gap - 0.05, energy: 0.8 }], handoffs: [{ lineId: 'b', kind: 'link-seat', dir: 0, seam: 2, dur: LINK_PREPARE + LINK_CLEAR }] }));
    };
    expect(at(0.66).events.some((e) => e.lineIds.includes('c') && e.kind === 'page-handoff')).toBe(false);
    expect(at(0.75).events.some((e) => e.lineIds.includes('c') && e.kind === 'page-handoff')).toBe(true);
  });

  it('keeps every Q2 hold; an in-line switch goes to another word break, or none', () => {
    const l = line('a', 0, 4, 4);
    const prev = line('p', -3, -0.3);
    // the hold covers the middle break (2.0) and the one after (3.0): only 1.0 is left
    const plan = planWorldEvents(input([prev, l], { holds: [{ lineId: 'a', at: 1.6, from: 1.6, to: 3.2, kind: 'ink-run' }] }));
    expect(plan.holds).toHaveLength(1);
    const inLine = plan.events.filter((e) => e.scope === 'in-line');
    for (const e of inLine) expect(e.to < 1.6 - ACTION_GAP || e.from > 3.2 + ACTION_GAP).toBe(true);
    const blocked = planWorldEvents(input([prev, l], { holds: [{ lineId: 'a', at: 0.5, from: 0.5, to: 3.6, kind: 'roll' }] }));
    expect(blocked.events.filter((e) => e.scope === 'in-line')).toHaveLength(0);
    expect(blocked.rejected.some((r) => /Q2 roll/.test(r.reason))).toBe(true);
  });

  it('a hold inside a handoff is that handoff: one event, counted once', () => {
    const lines = [line('a', 0, 2), line('b', 2, 4)];
    const plan = planWorldEvents(input(lines, { holds: [{ lineId: 'a', at: 1.8, from: 1.8, to: 2.2, kind: 'plate-slip' }], handoffs: [{ lineId: 'b', kind: 'link-seat', dir: 0, seam: 2, dur: 0.6 }] }));
    expect(plan.holds).toHaveLength(0);
    const h = plan.events.find((e) => e.kind === 'page-handoff')!;
    expect(h.merged).toEqual(['hold:plate-slip@a']);
    expect(countCuts([...plan.events, h], [0, 4]).byKind['page-handoff']).toBe(1);
  });

  it('a hold only partly inside a handoff keeps its whole window protected, and is reported (capability off; a scheduled world moves or drops it: world-events-wiring.spec.ts)', () => {
    // handoff 2.05–2.65 (seam 2.3); the hold runs on to 5.0: nothing may land in 2.65–5.0 either
    const lines = [line('a', 0, 2.3), line('b', 2.3, 6, 6)];
    const plan = planWorldEvents(input(lines, { caps: caps([]), beats: [4.5], holds: [{ lineId: 'b', at: 2.4, from: 2.4, to: 5, kind: 'ink-run' }], handoffs: [{ lineId: 'b', kind: 'link-seat', dir: 0, seam: 2.3, dur: 0.6 }] }));
    expect(plan.holds).toHaveLength(1);
    expect(plan.events.find((e) => e.kind === 'page-handoff')?.merged).toBeUndefined();
    for (const e of cuts(plan.events).filter((x) => !x.fixed)) expect(e.to < 2.4 - ACTION_GAP || e.from > 5 + ACTION_GAP, `${e.id} at ${e.at}`).toBe(true);
    expect(plan.warnings.some((w) => /partly overlaps/.test(w.reason))).toBe(true);
  });

  it('keeps two Q4 inputs that break spacing as given, with a warning', () => {
    const lines = [line('a', 0, 2), line('b', 2, 2.5), line('c', 2.5, 5)];
    const plan = planWorldEvents(input(lines, { handoffs: [{ lineId: 'b', kind: 'link-seat', dir: 0, seam: 2, dur: 0.6 }, { lineId: 'c', kind: 'link-seat', dir: 0, seam: 2.5, dur: 0.6 }] }));
    expect(plan.events.filter((e) => e.fixed).map((e) => e.at)).toEqual([2, 2.5]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].reason).toMatch(/Q4 inputs break spacing/);
  });

  it('says why when no in-line family has anywhere to go', () => {
    const plan = planWorldEvents(input([line('p', -3, -0.4, 0, [LEFT]), line('a', 0, 3, 3, [LEFT])], { caps: caps(['layout-seat']) }));
    expect(plan.events.filter((e) => e.scope === 'in-line')).toHaveLength(0);
    expect(plan.rejected.some((r) => r.candidate.lineId === 'a' && /no family target/.test(r.reason))).toBe(true);
  });

  it('switch points keep 0.65 s and actions 0.10 s apart through a dense run', () => {
    const lines = Array.from({ length: 14 }, (_, i) => line(`l${i}`, i * 0.9, i * 0.9 + 0.85, 2));
    const plan = planWorldEvents(input(lines, { beats: lines.map((l) => l.start + 0.4) }));
    expect(cuts(plan.events).length).toBeGreaterThan(0);
    expectClocks(plan.events);
  });

  it('a very short line keeps its seat and switches its words on time', () => {
    const plan = planWorldEvents(input([line('a', 0, 2), line('b', 2.1, 2.1 + SHORT_LINE - 0.1, 2), line('c', 3.5, 6)]));
    const b = plan.events.filter((e) => e.lineIds.includes('b'));
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('keep');
    expect(b[0].reason).toMatch(/short line/);
  });

  it('no reliable word boundary: no in-line switch, none faked by proportional time', () => {
    const plan = planWorldEvents(input([line('p', -3, -0.4), line('a', 0, 5)]));
    expect(plan.events.filter((e) => e.scope === 'in-line')).toHaveLength(0);
    expect(plan.rejected.some((r) => r.candidate.lineId === 'a' && /no reliable word boundary/.test(r.reason))).toBe(true);
  });

  it('an in-line switch lands on a sung word break with still reading either side', () => {
    const plan = planWorldEvents(input([line('p', -3, -0.4), line('a', 0, 3, 3)], { beats: [1, 2] }));
    const e = plan.events.find((x) => x.scope === 'in-line')!;
    expect([1, 2]).toContain(e.at);
    expect(e.at - 0).toBeGreaterThanOrEqual(READ_STABLE);
    expect(3 - e.to).toBeGreaterThanOrEqual(READ_STABLE);
    expect(plan.events.filter((x) => x.scope === 'in-line' && x.lineIds[0] === 'a')).toHaveLength(1);
  });

  it('countCuts excludes the first frame and the keeps, and counts a listed-twice event once', () => {
    const e = (id: string, at: number, kind: WorldEvent['kind'] = 'layout-seat'): WorldEvent => ({ id, lineIds: ['x'], kind, at, from: at, to: at, seatBefore: 'a', seatAfter: 'b', scope: 'line', changesLight: false, reason: '' });
    const r = countCuts([e('first', 0), e('x', 2), e('x', 2), e('same-frame', 2.02, 'camera-reframe'), e('k', 3, 'keep'), e('y', 5)], [0, 10]);
    expect(r.cuts).toBe(2);
    expect(r.planCutsPer10).toBe(2);
    expect(r.readingSeatChanges).toBe(2);
  });

  it('a fixed seed gives the same plan', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`l${i}`, i * 2, i * 2 + 1.9, 3));
    const sections = [{ start: 0, energy: 0.3 }, { start: 8, energy: 0.6 }, { start: 16, energy: 0.9 }];
    const a = planWorldEvents(input(lines, { seed: 7, sections }));
    expect(JSON.stringify(planWorldEvents(input(structuredClone(lines), { seed: 7, sections })))).toBe(JSON.stringify(a));
    expect(JSON.stringify(planWorldEvents(input(lines, { seed: 8, sections })))).not.toBe(JSON.stringify(a));
  });

  it('rule 11: a fast ten-line run is not ten full page handoffs, and keeps where the composer keeps', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(`l${i}`, i * 1.25, i * 1.25 + 1.2, 2, [LEFT, RIGHT, TOP, CARD]));
    lines.forEach((l, i) => (l.seat = i % 4 < 2 ? 'w/card' : 'w/left'));
    const plan = planWorldEvents(input(lines, { caps: caps(['layout-seat', 'page-handoff', 'carrier-swap', 'camera-reframe'], { ownPages: true }) }));
    const pages = plan.events.filter((e) => e.kind === 'page-handoff');
    expect(pages.length).toBeLessThan(5);
    expect(plan.events.filter((e) => e.kind === 'keep').length).toBeGreaterThan(0);
    for (const p of pages) expect(p.reason).toMatch(/section start|carrier ends/);
  });

  it('a quiet part hands its page over only at a section start', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line(`l${i}`, i * 3, i * 3 + 2.8, 0, [LEFT, CARD]));
    lines.forEach((l, i) => (l.seat = i % 2 ? 'w/card' : 'w/left'));
    const plan = planWorldEvents(input(lines, { sections: [{ start: 0, energy: 0.1 }, { start: 11.5, energy: 0.12 }, { start: 30, energy: 0.9 }] }));
    for (const p of plan.events.filter((e) => e.kind === 'page-handoff')) expect(p.reason).toMatch(/section start/);
  });

  it('schedules only the families the world allows, and only on approved seats', () => {
    const lines = Array.from({ length: 6 }, (_, i) => line(`l${i}`, i * 2.5, i * 2.5 + 2.4, 3));
    const plan = planWorldEvents(input(lines, { caps: caps(['camera-reframe'], { seats: ['w/left'] }), sections: [{ start: 0, energy: 0.8 }, { start: 7, energy: 0.8 }], cams: [{ lineId: 'l3', at: 7.3, sec: 0.5, kind: 'push-through' }] }));
    expect(cuts(plan.events).map((e) => e.kind)).toEqual(['camera-reframe']);
    for (const e of plan.events) expect(['w/left', '']).toContain(e.seatAfter);
  });
});

const SONG = 'out/db/yt_w_fCuUR3lEs/song.json';
const MEANING = 'out/research/instant/plans/nun/meaning.json';
describe.skipIf(!existsSync(SONG) || !existsSync(MEANING))('planWorldEvents on 雙截棍 76–101 (freeJob, seed 0)', () => {
  const song = existsSync(SONG) ? JSON.parse(readFileSync(SONG, 'utf8')) : undefined;
  const meaning = existsSync(MEANING) ? JSON.parse(readFileSync(MEANING, 'utf8')) : undefined;
  for (const id of ['chalkboard', 'brutalist']) {
    it(`${id}: the plan keeps every clock, every Q2/Q4 input and the untimed lines whole`, () => {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      const free = freeJob(song, { style, seed: 0, meaning });
      const inp = fromFreeJob(free, song, style.world, { seed: 0, window: [76, 101] });
      expect(inp.lines.length).toBeGreaterThanOrEqual(10);
      expect(inp.lines.length).toBeLessThanOrEqual(13);
      const plan = planWorldEvents(inp);
      expect(JSON.stringify(planWorldEvents(fromFreeJob(free, song, style.world, { seed: 0, window: [76, 101] })))).toBe(JSON.stringify(plan));
      expectClocks(plan.events, (inp.lights ?? []).map((l) => l.at));
      // Q4 kept as given, Q2 kept or folded into a handoff
      for (const h of inp.handoffs ?? []) expect(plan.events.some((e) => e.fixed && e.at === h.seam)).toBe(true);
      expect(plan.holds.length + plan.events.flatMap((e) => e.merged ?? []).length).toBe((inp.holds ?? []).length);
      // c020–c023 have no trusted per-character times: nothing moves inside them
      for (const l of inp.lines.filter((x) => !x.words)) expect(plan.events.some((e) => e.scope === 'in-line' && e.lineIds.includes(l.id))).toBe(false);
      const n = countCuts(plan.events, [76, 101]);
      // at most a boundary and one in-line switch a line
      expect(n.cuts).toBeLessThanOrEqual(2 * inp.lines.length);
      expect(n.cuts).toBeGreaterThan(0);
      expect(plan.events.filter((e) => e.kind === 'keep').length).toBeGreaterThan(0);
      expect(countCuts(currentEvents(free, song, style.world), [76, 101]).cuts).toBeGreaterThan(0);
    });
  }

  it('reads a phrase only where the aligner trusted the line', () => {
    const cues = song.cues as { id: string; text: string; start: number; end: number; charStarts?: number[]; charTimed?: boolean }[];
    expect(sungWords(cues.find((c) => c.id === 'c020')!)).toBeUndefined();
    const w = sungWords(cues.find((c) => c.id === 'c024')!)!;
    expect(w.map((x) => x.text)).toEqual(['快使用雙截棍', '哼哼哈兮']);
    expect(w[1].from).toBeGreaterThan(w[0].from);
  });
});
