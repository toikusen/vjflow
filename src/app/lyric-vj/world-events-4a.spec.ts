// Q1 phase 4a (docs/research/2026-11-10-q1-phase4a.md, Codex 2026-11-10 §3 (b)): an ink-only Q2 hold (ink-swap,
// line-ink-settle) and a declared same-line material move (art-deco poster-panel) as one composite event. Scheduler
// rules on made-up lines first, then the ink check on the real palette, the final check on a real job, the default path.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { ABSORBABLE_HOLDS, ACTION_GAP, countCuts, holdIdOf, planWorldEvents, READ_STABLE, sameWords, type HoldEvent, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { absorbedChecks, absorbRoomOf, failedComposites, holdRoom, verifyWorldEvents, withAbsorb } from './world-events-adapter';
import { WORLD_COMPOSITIONS, type MaterialMove } from './world-shared';
import { absorbInk, inkChecks } from './render/hold-room';
import { SET_SPECS } from './render/world-sets';
import { absorbSeatsFor } from './lineplan-core';
import type { Slots } from './render/world-objects';

const MARQUEE: SeatCandidate = { id: 'w/marquee', box: { x0: 0.2, y0: 0.25, x1: 0.8, y1: 0.6 }, size: 120, carrierId: 'ground:w/marquee', paged: true, page: 'w/marquee' };
const PANELS: SeatCandidate = { ...MARQUEE, id: 'w/marquee+panels', carrierId: 'ground:w/marquee:panels' };
const PANEL: MaterialMove = WORLD_COMPOSITIONS['art-deco'].materials!['poster-panel'];
const deco: WorldCompositionCaps = { worldId: 'w', kinds: ['layout-seat', 'carrier-swap'], seats: [], carrierRole: 'page', allowedAt: { 'carrier-swap': ['in-line'] }, materials: { 'poster-panel': PANEL } };
const words = (start: number, end: number, n: number) => Array.from({ length: n }, (_, k) => ({ text: `p${k}`, from: +(start + ((end - start) * k) / n).toFixed(3), to: +(start + ((end - start) * (k + 1)) / n).toFixed(3) }));
/** A held marquee line 1–5 s, sung words at 1, 2, 3, 4 (a peak part: in-line switches from 1.3 s). */
const held = (kind: string, at: number, sec: number, o: Partial<WorldEventLine> = {}): { line: WorldEventLine; hold: HoldEvent } => {
  const hold: HoldEvent = { lineId: 'a', at, from: at, to: +(at + sec).toFixed(3), kind };
  const absorb = { holdId: holdIdOf(hold), kind, seats: [PANELS.id], inks: { [PANELS.id]: '#d4af37' } };
  return { hold, line: { id: 'a', show: 0.8, start: 1, end: 5, seats: [MARQUEE, PANELS], seat: MARQUEE.id, words: words(1, 5, 4), settled: 1.4, pinned: `its ${kind} hold was planned on this set (Q2)`, inLine: { spans: [], absorb }, ...o } };
};
const input = (lines: WorldEventLine[], holds: HoldEvent[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.9 }], caps: deco, holds, seed: 0, ...o });
const composite = (es: WorldEvent[]) => es.filter((e) => e.absorbed);

describe('phase 4a: limited absorption in the scheduler', () => {
  it('a line-ink-settle hold and the poster-panel at a sung word are one composite event: the hold kept, the occupancy the union, counted once', () => {
    const { line, hold } = held('line-ink-settle', 2.8, 0.25);
    const plan = planWorldEvents(input([line], [hold]));
    const [e] = composite(plan.events);
    expect(e).toBeDefined();
    expect([e.kind, e.scope, e.material, e.curve, e.seatBefore, e.seatAfter]).toEqual(['carrier-swap', 'in-line', 'poster-panel', 'panel-slide', MARQUEE.id, PANELS.id]);
    // the material at a sung word, read still READ_STABLE either side of its own window, its declared time
    expect(line.words!.some((w) => w.from === e.at)).toBe(true);
    expect(e.at - 1.4).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
    expect(5 - e.to).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
    expect(+(e.to - e.from).toFixed(3)).toBe(PANEL.sec);
    // the record: hold id, its original window, the material, the ink, the reason; the occupancy the union
    expect(e.absorbed).toMatchObject({ holdId: 'hold:line-ink-settle@a', kind: 'line-ink-settle', hold: { at: 2.8, from: 2.8, to: 3.05 }, materialId: 'poster-panel', ink: '#d4af37' });
    expect(e.absorbed!.occupancy).toEqual({ from: Math.min(e.from, 2.8), to: Math.max(e.to, 3.05) });
    expect(e.absorbed!.reason).toMatch(/ink-only hold/);
    // the hold is never moved and never dropped from the plan's holds
    expect(plan.holds).toEqual([hold]);
    expect(plan.holdMoves).toBeUndefined();
    // one switch inside the line, one cut in the count
    expect(plan.events.filter((x) => x.scope === 'in-line')).toHaveLength(1);
    expect(countCuts(plan.events, [0, 6]).cuts).toBe(1);
  });

  it('an ink-swap hold is absorbed the same way; the whitelist is exactly ink-swap and line-ink-settle', () => {
    expect([...ABSORBABLE_HOLDS].sort()).toEqual(['ink-swap', 'line-ink-settle']);
    const { line, hold } = held('ink-swap', 2.9, 0.3);
    expect(composite(planWorldEvents(input([line], [hold])).events)).toHaveLength(1);
  });

  it('every other hold kind keeps pinning: even offered an absorb room by hand, no composite, the hold untouched', () => {
    for (const kind of ['line-grow', 'carrier-settle', 'panel-open', 'plate-spread', 'beat-punch', 'ink-run', 'light-sweep', 'roll', 'echo', 'flicker']) {
      const { line, hold } = held(kind, 2.8, 0.25);
      const plan = planWorldEvents(input([line], [hold]));
      expect(composite(plan.events), kind).toEqual([]);
      expect(plan.events.some((x) => x.material === 'poster-panel'), kind).toBe(false);
      expect(plan.holds, kind).toEqual([hold]);
      expect(plan.rejected.some((r) => r.reason.includes(`a ${kind} hold keeps pinning`)), kind).toBe(true);
    }
    // and the adapter offers absorption for no other kind, whatever the composer recorded
    const offer = { seats: [PANELS.id], inks: { [PANELS.id]: '#ffffff' } };
    const h = (kind: string): HoldEvent => ({ lineId: 'a', at: 2, from: 2, to: 2.3, kind });
    for (const kind of ['line-grow', 'carrier-settle', 'panel-open', 'beat-punch']) expect(absorbRoomOf(h(kind), { beatAbsorb: offer }, [PANELS.id]), kind).toBeUndefined();
    for (const kind of ['ink-swap', 'line-ink-settle']) expect(absorbRoomOf(h(kind), { beatAbsorb: offer, beat: { kind: kind as never, at: 2, span: { from: 0, to: 3 } } }, [PANELS.id]), kind).toEqual({ holdId: `hold:${kind}@a`, kind, seats: [PANELS.id], inks: offer.inks, span: { from: 0, to: 3 } });
    // a seat the line is not offered is never absorbed into
    expect(absorbRoomOf(h('ink-swap'), { beatAbsorb: offer }, [])).toBeUndefined();
    // the offer rides over whatever room the line is left (a merge that rebuilds the room keeps it)
    const room = withAbsorb(holdRoom({ text: 'x', start: 1, end: 5 }, h('line-ink-settle'), [PANELS.id]), absorbRoomOf(h('line-ink-settle'), { beatAbsorb: offer }, [PANELS.id]));
    expect(room).toEqual({ spans: [], absorb: { holdId: 'hold:line-ink-settle@a', kind: 'line-ink-settle', seats: [PANELS.id], inks: offer.inks } });
    expect(withAbsorb({ spans: [[1, 2]] }, undefined)).toEqual({ spans: [[1, 2]] });
  });

  it('partial overlap keeps the remaining hold window: the occupancy reaches the hold’s end past the material, the hold whole', () => {
    // the word at 3 s, the material 3.0–3.4; the hold 3.2–3.6 runs on past it
    const { line, hold } = held('line-ink-settle', 3.2, 0.4, { words: [{ text: 'a', from: 1, to: 3 }, { text: 'b', from: 3, to: 5 }] });
    const plan = planWorldEvents(input([line], [hold]));
    const [e] = composite(plan.events);
    expect([e.from, e.to]).toEqual([3, 3.4]);
    expect(e.absorbed!.occupancy).toEqual({ from: 3, to: 3.6 });
    expect(e.absorbed!.hold).toEqual({ at: 3.2, from: 3.2, to: 3.6 });
    expect(plan.holds).toEqual([hold]);
    // an action of another line just past the hold's remaining part (clear of the material's own window, not of the
    // hold's): the union keeps the hold's window, so the composite is refused, the hold stands
    const past: HoldEvent = { lineId: 'z', at: 3.65, from: 3.65, to: 3.8, kind: 'beat-punch' };
    expect(3.65 - 3.4).toBeGreaterThanOrEqual(ACTION_GAP);
    const clash = planWorldEvents(input([line], [hold, past]));
    expect(composite(clash.events)).toEqual([]);
    expect(clash.holds).toEqual([hold, past]);
    expect(clash.rejected.some((r) => /absorb hold:line-ink-settle@a: poster-panel at 3.00: overlaps Q2 beat-punch on z/.test(r.reason))).toBe(true);
  });

  it('the hold is never moved to meet a word: a word break too far from it means the hold stands and the material is refused', () => {
    // words at 1 and 4.2 only: the material at 4.2 is far from the hold at 2.0–2.2 (and too near the line's end anyway)
    const { line, hold } = held('line-ink-settle', 2, 0.2, { words: [{ text: 'a', from: 1, to: 2.5 }, { text: 'b', from: 2.5, to: 5 }] });
    const plan = planWorldEvents(input([line], [hold]));
    expect(composite(plan.events)).toEqual([]);
    expect(plan.holds).toEqual([hold]);
    expect(plan.rejected.some((r) => /not one main action with its hold/.test(r.reason))).toBe(true);
    // no sung words at all: refused at the word layer, hold unmoved
    const bare = planWorldEvents(input([{ ...held('line-ink-settle', 2.8, 0.25).line, words: undefined }], [hold]));
    expect(composite(bare.events)).toEqual([]);
    expect(bare.rejected.some((r) => /no reliable word boundary/.test(r.reason))).toBe(true);
  });

  it('the material keeps its own rules: a seat that moves the words, another page or a protected region is never absorbed into; the clocks hold against every other action', () => {
    const moved = { ...PANELS, box: { x0: 0.2, y0: 0.4, x1: 0.8, y1: 0.75 } };
    expect(sameWords(MARQUEE, moved)).toBe(false);
    expect(sameWords(MARQUEE, { ...PANELS, size: 100 })).toBe(false);
    expect(sameWords(MARQUEE, PANELS)).toBe(true);
    const { line, hold } = held('line-ink-settle', 2.8, 0.25);
    expect(composite(planWorldEvents(input([{ ...line, seats: [MARQUEE, moved] }], [hold])).events)).toEqual([]);
    expect(composite(planWorldEvents(input([{ ...line, seats: [MARQUEE, { ...PANELS, page: 'w/arch' }] }], [hold])).events)).toEqual([]);
    expect(composite(planWorldEvents(input([line], [hold], { caps: { ...deco, materials: { 'poster-panel': { ...PANEL, protectedRegion: [{ x0: 0, y0: 0.5, x1: 1, y1: 1 }] } } } })).events)).toEqual([]);
    // a material that does not declare it absorbs the kind is no partner
    expect(composite(planWorldEvents(input([line], [hold], { caps: { ...deco, materials: { 'poster-panel': { ...PANEL, absorbs: ['ink-swap'] } } } })).events)).toEqual([]);
    // another hold of the song inside the union (3.25–3.4 against 2.8–3.4): the composite the line takes alone is refused
    expect(composite(planWorldEvents(input([line], [hold])).events)).toHaveLength(1);
    const near: HoldEvent = { lineId: 'z', at: 3.25, from: 3.25, to: 3.4, kind: 'beat-punch' };
    const clash = planWorldEvents(input([line], [hold, near]));
    expect(composite(clash.events)).toEqual([]);
    expect(clash.holds).toEqual([hold, near]);
    expect(clash.rejected.some((r) => r.reason.startsWith('absorb hold:line-ink-settle@a'))).toBe(true);
    // a seat that keeps the words but has no held ink recorded is never taken
    expect(composite(planWorldEvents(input([{ ...line, inLine: { spans: [], absorb: { ...line.inLine!.absorb!, inks: {} } } }], [hold])).events)).toEqual([]);
  });

  it('every seat that keeps the words is tried in the seed’s order: one refused passes to the next', () => {
    const OTHER: SeatCandidate = { ...PANELS, id: 'w/marquee+panels2', carrierId: 'ground:w/marquee:panels2' };
    const { line, hold } = held('line-ink-settle', 2.8, 0.25);
    const two: WorldEventLine & { inLine: { spans: [number, number][]; absorb: { inks: Record<string, string> } } } = { ...line, seats: [MARQUEE, PANELS, OTHER], inLine: { spans: [], absorb: { ...line.inLine!.absorb!, seats: [PANELS.id, OTHER.id], inks: { [PANELS.id]: '#d4af37', [OTHER.id]: '#c0c0c0' } } } };
    const picks = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => composite(planWorldEvents(input([two], [hold], { seed })).events)[0]?.seatAfter ?? 'none');
    expect(picks).not.toContain('none');
    // the composite records the ink the hold settles into on the seat it took
    for (const seed of [0, 1, 2, 3]) { const [e] = composite(planWorldEvents(input([two], [hold], { seed })).events); expect(e.absorbed!.ink).toBe(two.inLine.absorb.inks[e.seatAfter]); }
    // one seat that moves the words: whatever the seed's order, the other is taken
    const moved = { ...two, seats: [MARQUEE, { ...PANELS, box: { x0: 0.2, y0: 0.4, x1: 0.8, y1: 0.75 } }, OTHER] };
    for (const seed of [0, 1, 2, 3, 4, 5]) expect(composite(planWorldEvents(input([moved], [hold], { seed })).events)[0]?.seatAfter, `seed ${seed}`).toBe(OTHER.id);
  });

  it('the same input gives the same plan', () => {
    const { line, hold } = held('line-ink-settle', 2.8, 0.25);
    expect(JSON.stringify(planWorldEvents(input([line], [hold], { seed: 3 })))).toBe(JSON.stringify(planWorldEvents(input([line], [hold], { seed: 3 }))));
  });
});

/** A scheme the marquee settles on (none of art-deco's six does: their marquee has no second ink apart enough that reads). */
const SETTLES: Slots = { ground: '#000000', ink: '#ffffff', ink2: '#ffd700', accent: '#ffd700', plate: '#000000', plateInk: '#ffffff', faint: '#333333' };

describe('phase 4a: the hold’s ink on every ground', () => {
  const world = FREE_STYLES.find((s) => s.id === 'art-deco')!.world;
  const [from, to] = [SET_SPECS['art-deco/marquee'], SET_SPECS['art-deco/marquee+panels']];
  it('art-deco as it is: no palette gives the marquee a settle ink, so no seat is ever offered (the hold kind is the real gate)', () => {
    for (const p of world.palette) {
      const slots = p as unknown as Slots;
      expect(inkChecks(from, slots, slots.ink).settle, p.id).toBeUndefined();
      expect(absorbInk('line-ink-settle', from, to, slots, slots.ink, ['ground']).ok, p.id).toBe(false);
      expect(absorbSeatsFor('line-ink-settle', 'art-deco/marquee', ['art-deco/marquee+panels'], 'art-deco', slots), p.id).toBeUndefined();
    }
  });
  it('a scheme that settles: the same held ink on both seats, at 4.5:1 on the old ground, the new and the panel’s black, every blend included; the composer offers the panels seat with it', () => {
    expect(inkChecks(from, SETTLES, SETTLES.ink).settle).toBe('#ffd700');
    expect(absorbInk('line-ink-settle', from, to, SETTLES, SETTLES.ink, PANEL.under as (keyof Slots)[])).toEqual({ ok: true, ink: '#ffd700' });
    // (every same-page seat whose ground keeps the ink, each with its own ink; the scheduler then takes only one that
    // keeps the words' box and type, sameWords: +second moves them)
    expect(absorbSeatsFor('line-ink-settle', 'art-deco/marquee', ['art-deco/marquee+panels', 'art-deco/marquee+second'], 'art-deco', SETTLES)).toEqual({ seats: ['art-deco/marquee+panels', 'art-deco/marquee+second'], inks: { 'art-deco/marquee+panels': '#ffd700', 'art-deco/marquee+second': '#ffd700' } });
    expect(absorbSeatsFor('line-ink-settle', 'art-deco/marquee-low', ['art-deco/marquee-low+panels'], 'art-deco', SETTLES)).toEqual({ seats: ['art-deco/marquee-low+panels'], inks: { 'art-deco/marquee-low+panels': '#ffd700' } });
    // never for a kind that is not absorbable, never in a world with no absorbing material, never onto another page's seat
    expect(absorbSeatsFor('line-grow', 'art-deco/marquee', ['art-deco/marquee+panels'], 'art-deco', SETTLES)).toBeUndefined();
    expect(absorbSeatsFor('line-ink-settle', 'art-deco/marquee', ['art-deco/marquee+panels'], 'notebook', SETTLES)).toBeUndefined();
    expect(absorbSeatsFor('line-ink-settle', 'art-deco/marquee-low', ['art-deco/marquee+panels'], 'art-deco', SETTLES)).toBeUndefined();
  });
  it('an intermediate ground the ink does not read on, a new seat on another ground, a blend that reads low, a kind that is not ink-only: refused', () => {
    expect(absorbInk('line-ink-settle', from, to, { ...SETTLES, faint: '#ffd700' }, SETTLES.ink, ['faint']).ok).toBe(false);
    expect(absorbInk('line-ink-settle', from, { ...to, on: ['plate'] } as typeof to, { ...SETTLES, plate: '#ffe000' }, SETTLES.ink).ok).toBe(false);
    // a mid-grey ground: white and gold each read on it only just, their blends among them must too
    const r = absorbInk('line-ink-settle', from, to, SETTLES, SETTLES.ink, ['faint']);
    expect(r.ok).toBe(true);
    expect(absorbInk('line-ink-settle', from, to, { ...SETTLES, faint: '#767676' }, SETTLES.ink, ['faint']).ok).toBe(false);
    expect(absorbInk('line-grow', from, to, SETTLES, SETTLES.ink).ok).toBe(false);
  });
});

// (たいめい seed 0: seven art-deco lines offered the panels, each with a line-grow hold; one is made an ink settle by hand)
const have = existsSync('out/db/yt_ZQ8mn5fS5_M/song.json');
describe.skipIf(!have)('phase 4a on a real job', () => {
  const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
  const song = JSON.parse(readFileSync('out/db/yt_ZQ8mn5fS5_M/song.json', 'utf8'));
  const meaning = existsSync('out/research/instant/plans/taimei/meaning.json') ? JSON.parse(readFileSync('out/research/instant/plans/taimei/meaning.json', 'utf8')) : undefined;
  type Cue = { cueId: string; shot?: string; world?: { set: string; seats?: string[]; slots?: Slots; beat?: { kind: string; at: number; sec: number; span?: { from: number; to: number } }; repose?: { at: number; set: string; sec?: number; move?: string }[] } };

  /**
   * A scheduled art-deco job with one composite forced in by hand: a line offered the panels, its hold made an ink settle
   * on a scheme that settles (SETTLES: none of art-deco's does), the panels drawn as the hold ends.
   */
  const forged = () => {
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const job = structuredClone(f.job);
    const cues = job.treatment.cues as Cue[];
    const c = cues.find((x) => x.world?.beat && x.world.seats?.some((s) => s.endsWith('+panels')) && !x.world.repose?.length)!;
    const cue = job.cues.find((x) => x.id === c.cueId)!;
    c.world!.slots = SETTLES;
    const beat = c.world!.beat!;
    beat.kind = 'line-ink-settle';
    const seat = c.world!.seats!.find((s) => s.endsWith('+panels'))!;
    const at = +(beat.at + beat.sec).toFixed(3);
    c.world!.repose = [{ at, set: seat, sec: PANEL.sec, move: 'poster-panel' }];
    const hold: HoldEvent = { lineId: c.cueId, at: beat.at, from: beat.at, to: +(beat.at + beat.sec).toFixed(3), kind: 'line-ink-settle' };
    const ev: WorldEvent = { id: `carrier-swap:${c.cueId}:4a`, lineIds: [c.cueId], kind: 'carrier-swap', at, from: at, to: +(at + PANEL.sec).toFixed(3), seatBefore: c.world!.set, seatAfter: seat, scope: 'in-line', changesLight: false, reason: 'test', material: 'poster-panel', curve: 'panel-slide', absorbed: { holdId: holdIdOf(hold), kind: hold.kind, hold: { at: hold.at, from: hold.from, to: hold.to }, materialId: 'poster-panel', ink: '#ffd700', occupancy: { from: hold.from, to: +(at + PANEL.sec).toFixed(3) }, reason: 'test' } };
    const t = f.treatment.worldEvents!;
    const table = { ...t, events: [...t.events, ev], holds: [...t.holds.filter((h) => h.lineId !== c.cueId), hold] };
    return { job, table, ev, c, cue };
  };

  it('a composite drawn as planned passes the absorption checks; every part of its contract tampered is reported', () => {
    const { job, table, ev, c } = forged();
    expect(absorbedChecks(job, style.world, table)).toEqual([]);
    const tamper = (edit: (c: Cue, t: typeof table, e: WorldEvent) => void) => { const j = structuredClone(job); const t = structuredClone(table); edit((j.treatment.cues as Cue[]).find((x) => x.cueId === c.cueId)!, t, t.events.find((y) => y.id === ev.id)!); return absorbedChecks(j, style.world, t).map((w) => w.reason); };
    const reports = (re: RegExp, edit: Parameters<typeof tamper>[0]) => expect(tamper(edit).some((r) => re.test(r)), String(re)).toBe(true);
    reports(/hold is not drawn as planned/, (x) => (x.world!.beat!.at += 0.2));
    reports(/lost from the plan/, (_x, t) => (t.holds = t.holds.filter((h) => h.lineId !== c.cueId)));
    reports(/switches inside the line/, (x) => x.world!.repose!.push({ at: 99, set: x.world!.set }));
    reports(/not drawn on/, (x) => delete x.world!.repose);
    reports(/not one the scheduler may absorb/, (_x, _t, e) => (e.absorbed!.kind = 'line-grow'));
    reports(/is not the union/, (_x, _t, e) => (e.absorbed!.occupancy = { from: e.from, to: e.to }));
    // the phrase, the ink on the final job's own scheme
    reports(/hold's phrase is drawn/, (x) => (x.world!.beat!.span = { from: 0, to: 2 }));
    reports(/ink: the final job holds #ffd700, planned #ffffff/, (_x, _t, e) => (e.absorbed!.ink = '#ffffff'));
    reports(/ink: line-ink-settle: no held ink/, (x) => (x.world!.slots = style.world.palette[0] as unknown as Slots));
    // the words' box and type: a seat that moves them
    reports(/do not keep their box and type/, (x, _t, e) => { e.seatAfter = `${x.world!.set}+second`; x.world!.repose![0].set = e.seatAfter; });
    // the global clocks: another action within 0.10 s of the union, a switch within 0.65 s, a light change within 0.55 s
    const other = (o: Partial<WorldEvent>): WorldEvent => ({ id: 'layout-seat:zz:0', lineIds: ['c000'], kind: 'layout-seat', at: 0, from: 0, to: 0, seatBefore: '', seatAfter: '', scope: 'line', changesLight: false, reason: 'test', ...o });
    reports(/within 0.1s of layout-seat:zz:0/, (_x, t, e) => t.events.push(other({ at: e.to + 0.05, from: e.to + 0.05, to: e.to + 0.3 })));
    reports(/its switch is within 0.65s of layout-seat:zz:0/, (_x, t, e) => t.events.push(other({ at: e.at + 0.6, from: e.to + 0.2, to: e.to + 0.2 })));
    reports(/light change is within 0.55s of layout-seat:zz:0/, (_x, t, e) => { e.changesLight = true; t.events.push(other({ at: e.at + 0.5, from: e.to + 0.2, to: e.to + 0.2, changesLight: true })); });
    reports(/within 0.1s of hold:beat-punch@c000/, (_x, t, e) => t.holds.push({ lineId: 'c000', kind: 'beat-punch', at: e.to + 0.02, from: e.to + 0.02, to: e.to + 0.2 }));
    // the protected region: one over the new seat's words
    const deco = WORLD_COMPOSITIONS['art-deco'];
    const kept = deco.protectedRegion;
    try {
      deco.protectedRegion = [...(kept ?? []), { x0: 0, y0: 0, x1: 1, y1: 1 }];
      expect(absorbedChecks(job, style.world, table).some((w) => /enters a protected region/.test(w.reason))).toBe(true);
    } finally { deco.protectedRegion = kept; }
    // the whole final check names it: a held line's panels only as an approved composite
    const v = verifyWorldEvents(job, style.world, { ...table, events: table.events.filter((e) => e.id !== ev.id) });
    expect(v.some((w) => /its line holds a line-ink-settle/.test(w.reason))).toBe(true);
  });

  it('freeJob: a composite whose landing fails is undone: the final job is the job without it (hold and layout as composed), with a contract failure naming it', () => {
    const base = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    let forcedId = '';
    let line = '';
    // (the plan as made, before the final check: a composite forced in that cannot land, its hold recorded as an ink settle the line does not hold)
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true, trace: (input, plan) => {
      const l = input.lines.find((x) => x.seats.some((s) => s.id.endsWith('+panels')) && plan.holds.some((h) => h.lineId === x.id))!;
      const h = plan.holds.find((x) => x.lineId === l.id)!;
      const seat = l.seats.find((s) => s.id.endsWith('+panels'))!;
      line = l.id;
      forcedId = `carrier-swap:${l.id}:forced`;
      plan.events.push({ id: forcedId, lineIds: [l.id], kind: 'carrier-swap', at: h.to, from: h.to, to: +(h.to + PANEL.sec).toFixed(3), seatBefore: l.seat!, seatAfter: seat.id, scope: 'in-line', changesLight: false, reason: 'forced', material: 'poster-panel', curve: 'panel-slide', absorbed: { holdId: holdIdOf({ kind: 'line-ink-settle', lineId: l.id }), kind: 'line-ink-settle', hold: { at: h.at, from: h.from, to: h.to }, materialId: 'poster-panel', ink: '#ffd700', occupancy: { from: h.from, to: +(h.to + PANEL.sec).toFixed(3) }, reason: 'forced' } });
    } });
    expect(forcedId).not.toBe('');
    const t = f.treatment.worldEvents!;
    expect(t.events.some((e) => e.id === forcedId)).toBe(false);
    // the hold and the line's layout are the composer's: the final job's lines are the job without the composite
    const cueOf = (x: typeof f) => (x.job.treatment.cues as Cue[]).find((c) => c.cueId === line)!;
    expect(cueOf(f).world!.beat).toEqual(cueOf(base).world!.beat);
    expect(cueOf(f).world!.repose).toEqual(cueOf(base).world!.repose);
    expect(JSON.stringify(f.job.treatment.cues)).toBe(JSON.stringify(base.job.treatment.cues));
    expect(t.holds).toEqual(base.treatment.worldEvents!.holds);
    // the failure is in the record, a contract failure, and the material is among the refused
    const lost = t.warnings.filter((w) => w.inputs[0] === forcedId);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toMatch(/^final check: contract failure: the composite hold:line-ink-settle@\S+ \+ poster-panel did not land \(.*hold is not drawn as planned.*\); its hold and the line's layout restored/);
    expect(t.rejected).toBe(base.treatment.worldEvents!.rejected + 1);
    expect(t.warnings.filter((w) => w.reason.startsWith('final check') && w.inputs[0] !== forcedId)).toEqual([]);
  });

  it('failedComposites names only the composites a final check names', () => {
    const ev = { id: 'carrier-swap:x:0', lineIds: ['x'], kind: 'carrier-swap', at: 1, from: 1, to: 1.4, seatBefore: 's', seatAfter: 's+panels', scope: 'in-line', changesLight: false, reason: '', material: 'poster-panel', absorbed: { holdId: 'hold:line-ink-settle@x', kind: 'line-ink-settle', hold: { at: 1, from: 1, to: 1.2 }, materialId: 'poster-panel', ink: '#fff', occupancy: { from: 1, to: 1.4 }, reason: '' } } as WorldEvent;
    const plain = { ...ev, id: 'layout-seat:y:0', lineIds: ['y'], absorbed: undefined } as WorldEvent;
    const out = failedComposites([ev, plain], [{ inputs: ['poster-panel@x'], reason: 'final check: poster-panel at 1 is at no sung word' }, { inputs: ['layout-seat:y:0'], reason: 'final check: something' }]);
    expect(out.failed).toEqual([ev]);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0].reason).toMatch(/^final check: contract failure: the composite hold:line-ink-settle@x \+ poster-panel did not land \(poster-panel at 1 is at no sung word\); its hold and the line's layout restored/);
    expect(failedComposites([ev], [{ inputs: ['other'], reason: 'final check: x' }]).failed).toEqual([]);
  });

  it('scheduled: the same seed the same table, no final-check warning', () => {
    const a = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(a.treatment.worldEvents));
    expect(a.treatment.worldEvents!.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
  });
});

// (the default job against the fingerprint of the commit before phase 4a, default-hash.mts: hash-4a/base-seed0.json at 36cc9b4)
const BASE = 'out/research/q1-1109/hash-4a/base-seed0.json';
describe.skipIf(!existsSync(BASE) || !existsSync('out/db/yt_w_fCuUR3lEs/song.json') || !existsSync('out/research/instant/plans/nun/meaning.json'))('phase 4a: the default job is the base job', () => {
  it('art-deco, document, notebook on 雙截棍, scheduler off: byte for byte the job before phase 4a, no absorb room recorded', () => {
    const rows = JSON.parse(readFileSync(BASE, 'utf8')).rows as Record<string, string>;
    const song = JSON.parse(readFileSync('out/db/yt_w_fCuUR3lEs/song.json', 'utf8'));
    const meaning = JSON.parse(readFileSync('out/research/instant/plans/nun/meaning.json', 'utf8'));
    for (const id of ['art-deco', 'document', 'notebook']) {
      const f = freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning });
      expect(createHash('sha256').update(JSON.stringify(f.job)).digest('hex').slice(0, 16), id).toBe(rows[`nun/${id}`]);
      expect(JSON.stringify(f.job)).not.toMatch(/beatAbsorb|"absorbed"/);
    }
  });
});
