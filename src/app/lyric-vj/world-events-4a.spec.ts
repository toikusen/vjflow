// Q1 phase 4a (docs/research/2026-11-10-q1-phase4a.md, Codex 2026-11-10 §3 (b)): an ink-only Q2 hold (ink-swap,
// line-ink-settle) and a declared same-line material move (art-deco poster-panel) as one composite event. Scheduler
// rules on made-up lines first, then the ink check on the real palette, the final check on a real job, the default path.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { ABSORBABLE_HOLDS, ACTION_GAP, countCuts, holdIdOf, planWorldEvents, READ_STABLE, sameWords, type HoldEvent, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { absorbedChecks, failedComposites, holdRoom, verifyWorldEvents } from './world-events-adapter';
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
  const absorb = { holdId: holdIdOf(hold), kind, seats: [PANELS.id], ink: '#d4af37' };
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
    const c = { text: 'x', start: 1, end: 5 };
    for (const kind of ['line-grow', 'carrier-settle', 'panel-open', 'beat-punch']) expect(holdRoom(c, { lineId: 'a', at: 2, from: 2, to: 2.3, kind }, [PANELS.id], { seats: [PANELS.id], ink: '#fff' })?.absorb, kind).toBeUndefined();
    for (const kind of ['ink-swap', 'line-ink-settle']) expect(holdRoom(c, { lineId: 'a', at: 2, from: 2, to: 2.3, kind }, [PANELS.id], { seats: [PANELS.id], ink: '#fff' })?.absorb, kind).toEqual({ holdId: `hold:${kind}@a`, kind, seats: [PANELS.id], ink: '#fff' });
    // a seat the line is not offered is never absorbed into
    expect(holdRoom(c, { lineId: 'a', at: 2, from: 2, to: 2.3, kind: 'ink-swap' }, [], { seats: [PANELS.id], ink: '#fff' })?.absorb).toBeUndefined();
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
    // another hold of the song within ACTION_GAP of the union: refused by the clocks
    const near: HoldEvent = { lineId: 'z', at: 3.25, from: 3.25, to: 3.4, kind: 'beat-punch' };
    const clash = planWorldEvents(input([line], [hold, near]));
    for (const e of composite(clash.events)) expect(e.absorbed!.occupancy.to + ACTION_GAP <= near.from + 1e-6 || e.absorbed!.occupancy.from >= near.to + ACTION_GAP - 1e-6).toBe(true);
  });

  it('the same input gives the same plan', () => {
    const { line, hold } = held('line-ink-settle', 2.8, 0.25);
    expect(JSON.stringify(planWorldEvents(input([line], [hold], { seed: 3 })))).toBe(JSON.stringify(planWorldEvents(input([line], [hold], { seed: 3 }))));
  });
});

describe('phase 4a: the hold’s ink on every ground', () => {
  const world = FREE_STYLES.find((s) => s.id === 'art-deco')!.world;
  const slots = world.palette[0] as unknown as Slots;
  const [from, to] = [SET_SPECS['art-deco/marquee'], SET_SPECS['art-deco/marquee+panels']];
  it('art-deco marquee → panels: the settle ink is the same on both seats and reads at 4.5:1 on the old ground, the new and the panel’s black, every blend included', () => {
    const r = absorbInk('line-ink-settle', from, to, slots, slots.ink, PANEL.under as (keyof Slots)[]);
    const settle = inkChecks(from, slots, slots.ink).settle;
    if (settle) expect(r).toEqual({ ok: true, ink: settle });
    else expect(r.ok).toBe(false);
    // the composer offers the panels seat for it exactly when the check passes
    const offered = absorbSeatsFor('line-ink-settle', 'art-deco/marquee', ['art-deco/marquee+panels', 'art-deco/marquee+second'], 'art-deco', slots);
    expect(offered?.seats ?? []).toEqual(r.ok ? ['art-deco/marquee+panels'] : []);
    // never for a kind that is not absorbable, never in a world with no absorbing material
    expect(absorbSeatsFor('line-grow', 'art-deco/marquee', ['art-deco/marquee+panels'], 'art-deco', slots)).toBeUndefined();
    expect(absorbSeatsFor('line-ink-settle', 'notebook/main', ['notebook/main+margin'], 'notebook', slots)).toBeUndefined();
  });
  it('a ground the move lays under the words that the ink does not read on, a new seat that would settle another ink, or a low base: refused', () => {
    const settle = inkChecks(from, slots, slots.ink).settle;
    if (!settle) return;
    // an intermediate ground the settle ink cannot read on (its own colour)
    const low = { ...slots, faint: settle };
    expect(absorbInk('line-ink-settle', from, to, low, slots.ink, ['faint']).ok).toBe(false);
    // the new seat on another ground: the settled ink is re-picked or reads low: refused
    const lit = { ...slots, plate: settle };
    expect(absorbInk('line-ink-settle', from, { ...to, on: ['plate'] } as typeof to, lit, slots.ink).ok).toBe(false);
    expect(absorbInk('line-grow', from, to, slots, slots.ink).ok).toBe(false);
  });
});

// (たいめい seed 0: seven art-deco lines offered the panels, each with a line-grow hold; one is made an ink settle by hand)
const have = existsSync('out/db/yt_ZQ8mn5fS5_M/song.json');
describe.skipIf(!have)('phase 4a on a real job', () => {
  const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
  const song = JSON.parse(readFileSync('out/db/yt_ZQ8mn5fS5_M/song.json', 'utf8'));
  const meaning = existsSync('out/research/instant/plans/taimei/meaning.json') ? JSON.parse(readFileSync('out/research/instant/plans/taimei/meaning.json', 'utf8')) : undefined;
  type Cue = { cueId: string; shot?: string; world?: { set: string; seats?: string[]; beat?: { kind: string; at: number; sec: number }; repose?: { at: number; set: string; sec?: number; move?: string }[] } };

  /** A scheduled art-deco job with one composite forced in by hand: a line offered the panels, its hold made an ink settle, the panels drawn at a word. */
  const forged = () => {
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const job = structuredClone(f.job);
    const cues = job.treatment.cues as Cue[];
    const c = cues.find((x) => x.world?.beat && x.world.seats?.some((s) => s.endsWith('+panels')) && !x.world.repose?.length)!;
    const cue = job.cues.find((x) => x.id === c.cueId)!;
    const beat = c.world!.beat!;
    beat.kind = 'line-ink-settle';
    const seat = c.world!.seats!.find((s) => s.endsWith('+panels'))!;
    const at = +(beat.at + beat.sec).toFixed(3);
    c.world!.repose = [{ at, set: seat, sec: PANEL.sec, move: 'poster-panel' }];
    const hold: HoldEvent = { lineId: c.cueId, at: beat.at, from: beat.at, to: +(beat.at + beat.sec).toFixed(3), kind: 'line-ink-settle' };
    const ev: WorldEvent = { id: `carrier-swap:${c.cueId}:4a`, lineIds: [c.cueId], kind: 'carrier-swap', at, from: at, to: +(at + PANEL.sec).toFixed(3), seatBefore: c.world!.set, seatAfter: seat, scope: 'in-line', changesLight: false, reason: 'test', material: 'poster-panel', curve: 'panel-slide', absorbed: { holdId: holdIdOf(hold), kind: hold.kind, hold: { at: hold.at, from: hold.from, to: hold.to }, materialId: 'poster-panel', ink: '#ffffff', occupancy: { from: hold.from, to: +(at + PANEL.sec).toFixed(3) }, reason: 'test' } };
    const t = f.treatment.worldEvents!;
    const table = { ...t, events: [...t.events, ev], holds: [...t.holds.filter((h) => h.lineId !== c.cueId), hold] };
    return { job, table, ev, c, cue };
  };

  it('a composite drawn as planned passes the absorption checks; the hold moved, lost, a second switch, the panels undrawn, or a kind not absorbable is reported', () => {
    const { job, table, ev, c } = forged();
    const clean = absorbedChecks(job, style.world, table);
    expect(clean).toEqual([]);
    const tamper = (edit: (c: Cue, t: typeof table) => void) => { const j = structuredClone(job); const t = structuredClone(table); edit((j.treatment.cues as Cue[]).find((x) => x.cueId === c.cueId)!, t); return absorbedChecks(j, style.world, t).map((w) => w.reason); };
    expect(tamper((x) => (x.world!.beat!.at += 0.2)).some((r) => /hold is not drawn as planned/.test(r))).toBe(true);
    expect(tamper((_x, t) => (t.holds = t.holds.filter((h) => h.lineId !== c.cueId))).some((r) => /lost from the plan/.test(r))).toBe(true);
    expect(tamper((x) => x.world!.repose!.push({ at: 99, set: x.world!.set })).some((r) => /switches inside the line/.test(r))).toBe(true);
    expect(tamper((x) => delete x.world!.repose).some((r) => /not drawn on/.test(r))).toBe(true);
    expect(tamper((_x, t) => { const e = t.events.find((y) => y.id === ev.id)!; e.absorbed!.kind = 'line-grow'; }).some((r) => /not one the scheduler may absorb/.test(r))).toBe(true);
    expect(tamper((_x, t) => { const e = t.events.find((y) => y.id === ev.id)!; e.absorbed!.occupancy = { from: e.from, to: e.to }; }).some((r) => /is not the union/.test(r))).toBe(true);
    // the whole final check names it: a held line's panels only as an approved composite
    const v = verifyWorldEvents(job, style.world, { ...table, events: table.events.filter((e) => e.id !== ev.id) });
    expect(v.some((w) => /its line holds a line-ink-settle/.test(w.reason))).toBe(true);
  });

  it('a composite whose landing fails is undone with a contract failure naming it; nothing else is', () => {
    const ev = { id: 'carrier-swap:x:0', lineIds: ['x'], kind: 'carrier-swap', at: 1, from: 1, to: 1.4, seatBefore: 's', seatAfter: 's+panels', scope: 'in-line', changesLight: false, reason: '', material: 'poster-panel', absorbed: { holdId: 'hold:line-ink-settle@x', kind: 'line-ink-settle', hold: { at: 1, from: 1, to: 1.2 }, materialId: 'poster-panel', ink: '#fff', occupancy: { from: 1, to: 1.4 }, reason: '' } } as WorldEvent;
    const plain = { ...ev, id: 'layout-seat:y:0', lineIds: ['y'], absorbed: undefined } as WorldEvent;
    const out = failedComposites([ev, plain], [{ inputs: ['poster-panel@x'], reason: 'final check: poster-panel at 1 is at no sung word' }, { inputs: ['layout-seat:y:0'], reason: 'final check: something' }]);
    expect(out.failed).toEqual([ev]);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0].reason).toMatch(/^final check: contract failure: the composite hold:line-ink-settle@x \+ poster-panel did not land \(poster-panel at 1 is at no sung word\); its hold and the line's layout restored/);
    expect(failedComposites([ev], [{ inputs: ['other'], reason: 'final check: x' }]).failed).toEqual([]);
  });

  it('by default (scheduler off) the job is the job as before: no absorb room recorded, no composite; scheduled, the same seed the same table', () => {
    const plain = freeJob(song, { style, seed: 0, meaning });
    const before = freeJob(song, { style, seed: 0, meaning, worldEvents: false });
    const { worldEvents: _w, ...rest } = plain.job.treatment;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(before.job.treatment));
    expect(JSON.stringify(plain.job)).not.toMatch(/beatAbsorb|"absorbed"/);
    const a = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(a.treatment.worldEvents));
    expect(a.treatment.worldEvents!.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
  });
});
