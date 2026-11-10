// Q1 phase 4c (docs/research/2026-11-10-q1-phase4c.md, Codex 2026-11-10 r2 §1): Q1 seat changes and Q2 holds arbitrated
// together, one primary action a line. The candidate half of beatOfLine first, then the joint selector on made-up
// lines, then the final check (jointChecks) on a real job with every part of its contract tampered, the atomic landing
// fallback, and the default path unchanged.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { beatOfLine, holdCandidatesOf, type Cue } from './lineplan-core';
import { ACTION_GAP, holdIdOf, outcomeOf, planWorldEvents, READ_STABLE, SEAM_GAP, type HoldEvent, type JointHold, type PolicyCandidate, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { jointChecks, jointHoldsOf } from './world-events-adapter';
import type { WorldLine } from './render/world-layout';

describe('phase 4c: hold candidates before commitment (lineplan-core)', () => {
  const c: Cue = { id: 'x', start: 1, end: 3.5, text: '我們一起 走過那條 長長的街' };
  const beats = Array.from({ length: 20 }, (_, k) => +(0.5 + k * 0.25).toFixed(2));
  const line = { enterSec: 0.3, inkSettle: true, swapOk: true, key: '長長的街' };
  const taste = { 'ink-swap': 1, 'line-grow': 1 };

  it('beatOfLine commits exactly the first candidate; the candidate list keeps the world\'s order and lists every kind', () => {
    const first = beatOfLine(c, [], beats, [], '', 3, line, taste);
    const all = holdCandidatesOf(c, [], beats, [], '', 3, line, taste, true);
    const one = holdCandidatesOf(c, [], beats, [], '', 3, line, taste);
    expect(Array.isArray(all) && Array.isArray(one)).toBe(true);
    if (!Array.isArray(all) || !Array.isArray(one)) return;
    expect(first).toEqual(all[0].plan);
    expect(one).toEqual([all[0]]);
    expect(all.map((x) => x.plan.kind).sort()).toEqual(['ink-swap', 'line-grow', 'line-ink-settle']);
    // (the world's own order: ranks rise, the whole line's ink last, every slack inside the line)
    expect(all.map((x) => x.rank)).toEqual([...all.map((x) => x.rank)].sort((a, b) => a - b));
    expect(all.at(-1)!.plan.kind).toBe('line-ink-settle');
    for (const x of all) expect(x.slack).toBeGreaterThanOrEqual(0);
  });

  it('a line with no room gives the same skip either way', () => {
    const short: Cue = { ...c, end: 1.5 };
    expect(holdCandidatesOf(short, [], beats, [], '', 3, line, taste, true)).toEqual(beatOfLine(short, [], beats, [], '', 3, line, taste));
  });
});

const A: SeatCandidate = { id: 'w/a', box: { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.3 }, size: 120 };
const B: SeatCandidate = { id: 'w/b', box: { x0: 0.55, y0: 0.6, x1: 0.9, y1: 0.8 }, size: 120 };
const caps: WorldCompositionCaps = { worldId: 'w', kinds: ['layout-seat'], seats: [], carrierRole: 'ground', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'] } };
const words = (start: number, end: number, n: number) => Array.from({ length: n }, (_, k) => ({ text: `p${k}`, from: +(start + ((end - start) * k) / n).toFixed(3), to: +(start + ((end - start) * (k + 1)) / n).toFixed(3) }));
const hc = (lineId: string, seat: string, at: number, sec = 0.3, kind = 'line-grow', rank = 0, slack = 0.5): JointHold => ({ seat, hold: { lineId, at, from: at, to: +(at + sec).toFixed(3), kind }, rank, slack });
const first: WorldEventLine = { id: 'a', show: 0.8, start: 1, end: 3, seats: [A, B], seat: A.id, settled: 1.2 };
const second = (o: Partial<WorldEventLine> = {}): WorldEventLine => ({ id: 'b', show: 3.2, start: 3.4, end: 8, seats: [A, B], seat: A.id, settled: 3.6, words: words(3.4, 8, 4), holdCands: [hc('b', A.id, 4.5), hc('b', B.id, 4.6)], ...o });
const joint = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.1 }], caps, joint: true, seed: 0, ...o });
const of = (plan: ReturnType<typeof planWorldEvents>, id: string) => plan.outcomes!.find((o) => o.lineId === id)!;
const cutsOn = (plan: ReturnType<typeof planWorldEvents>, id: string) => plan.events.filter((e) => e.kind !== 'keep' && e.lineIds.at(-1) === id);

describe('phase 4c: the joint selector (world-events planWorldEvents, joint)', () => {
  it('a hold no longer pins its line: across seeds a quiet line either holds on the seat it keeps or reseats, never both, and the losing hold is not in the plan', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const plan = planWorldEvents(joint([first, second()], { seed }));
      const o = of(plan, 'b');
      seen.add(o.outcome);
      const cuts = cutsOn(plan, 'b');
      const holds = plan.holds.filter((h) => h.lineId === 'b');
      expect(cuts.length + holds.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      if (o.outcome === 'hold') {
        // (on the seat it keeps, measured there: A's candidate, never B's)
        expect(holds).toEqual([hc('b', A.id, 4.5).hold]);
        expect(plan.events.find((e) => e.lineIds.at(-1) === 'b')!.seatAfter).toBe(A.id);
      } else {
        expect([o.outcome, o.reason]).toEqual(['composition', 'supersededByComposition']);
        expect(holds).toEqual([]);
        expect(o.legalHold).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['composition', 'hold']);
  });

  it('a section start tries the compositions first: the reseat wins, the hold is superseded; joint off, the same hold pins the line and keeps its seat', () => {
    const sections = [{ start: 0, energy: 0.1 }, { start: 3.3, energy: 0.1 }];
    const plan = planWorldEvents(joint([first, second()], { sections }));
    expect(of(plan, 'b')).toMatchObject({ outcome: 'composition', reason: 'supersededByComposition' });
    expect(cutsOn(plan, 'b').map((e) => [e.kind, e.scope, e.seatAfter])).toEqual([['layout-seat', 'section', B.id]]);
    expect(plan.holds).toEqual([]);
    // (the old contract: the hold came in decided and pinned the line, its reseat never a candidate)
    const pinned = second({ holdCands: undefined, pinned: 'its line-grow hold was planned on this set (Q2)', inLine: { spans: [] } });
    const old = planWorldEvents({ ...joint([first, pinned], { sections }), joint: undefined, holds: [hc('b', A.id, 4.5).hold] });
    expect(cutsOn(old, 'b')).toEqual([]);
    expect(old.holds).toHaveLength(1);
    expect(old.outcomes).toBeUndefined();
  });

  it('one primary action a line: a boundary reseat leaves no switch inside the same line (joint off too since pairs B)', () => {
    const sections = [{ start: 0, energy: 0.9 }, { start: 3.3, energy: 0.95 }];
    const bare = second({ holdCands: undefined });
    const plan = planWorldEvents(joint([first, bare], { sections }));
    expect(cutsOn(plan, 'b')).toHaveLength(1);
    expect(of(plan, 'b')).toMatchObject({ outcome: 'composition' });
    const old = planWorldEvents({ ...joint([first, bare], { sections }), joint: undefined });
    expect(cutsOn(old, 'b').map((e) => e.scope)).toEqual(['section']);
  });

  it('a hold is legal only clear of every action: one inside a Q4 window is not committed (noSafeCandidate), never moved', () => {
    const handoff = { lineId: 'b', kind: 'link-relay-x', dir: 1, seam: 3.2, dur: 1.6, prepare: 0.3 };
    const plan = planWorldEvents(joint([first, second({ holdCands: [hc('b', A.id, 3.6)] })], { handoffs: [handoff] }));
    expect(of(plan, 'b')).toMatchObject({ outcome: 'composition', reason: 'noSafeCandidate', legalHold: false });
    expect(plan.holds).toEqual([]);
    expect(plan.holdMoves).toBeUndefined();
    // (on the line before: a hold its prepare window overlaps cannot be committed either)
    const p2 = planWorldEvents(joint([{ ...first, holdCands: [hc('a', A.id, 2.75, 0.2)] }, second({ holdCands: undefined })], { handoffs: [handoff] }));
    expect(of(p2, 'a')).toMatchObject({ outcome: 'keep', reason: 'noSafeCandidate' });
  });

  it('the seat before does not fit the line, or the composer changed set: the entrance is the line\'s one action, its hold superseded, whatever the draw', () => {
    for (let seed = 0; seed < 12; seed++) {
      const away = planWorldEvents(joint([first, second({ seats: [B], seat: B.id, holdCands: [hc('b', B.id, 4.5)] })], { seed }));
      expect(of(away, 'b')).toMatchObject({ outcome: 'composition', reason: 'supersededByComposition' });
      expect(away.holds).toEqual([]);
      // (B is the composer's own set, A still legal: its change of set is the scheduler's wish as without the contract)
      const moved = planWorldEvents(joint([first, second({ seat: B.id })], { seed }));
      expect(of(moved, 'b')).toMatchObject({ outcome: 'composition', reason: 'supersededByComposition' });
      expect(cutsOn(moved, 'b').map((e) => e.seatAfter)).toEqual([B.id]);
    }
  });

  it('among a seat\'s holds the world\'s rank wins (line-ink-settle never wins by being shorter), slack only between equal ranks; a line with nothing asked keeps as designed quiet', () => {
    const cands = [hc('b', A.id, 4.5, 0.3, 'line-grow', 0, 0.2), hc('b', A.id, 5, 0.2, 'line-ink-settle', 2, 0.9)];
    const keepers = Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second({ holdCands: cands })], { seed: s }))).filter((p) => of(p, 'b').outcome === 'hold');
    expect(keepers.length).toBeGreaterThan(0);
    for (const p of keepers) expect(p.holds[0].kind).toBe('line-grow');
    // (the higher rank illegal (inside a Q4 window): the settle is the fallback; the first line always commits a legal hold)
    const handoff = { lineId: 'b', kind: 'link-relay-x', dir: 1, seam: 3.2, dur: 1.6, prepare: 0.3 };
    const blocked = [hc('a', A.id, 2.9, 0.3, 'line-grow', 0, 0.2), hc('a', A.id, 1.5, 0.2, 'line-ink-settle', 2, 0.1)];
    const fb = planWorldEvents(joint([{ ...first, holdCands: blocked }, second({ holdCands: undefined })], { handoffs: [handoff] }));
    expect(fb.holds.map((h) => h.kind)).toEqual(['line-ink-settle']);
    // (equal ranks: the larger slack step)
    const tie = [hc('b', A.id, 4.5, 0.3, 'roll', 1, 0.2), hc('b', A.id, 5, 0.2, 'beat-punch', 1, 0.9)];
    for (const p of Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second({ holdCands: tie })], { seed: s }))).filter((x) => of(x, 'b').outcome === 'hold')) expect(p.holds[0].kind).toBe('beat-punch');
    // (no hold, the draw keeps, nothing refused: designed quiet)
    const quiet = Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second({ holdCands: undefined, words: undefined, end: 6 })], { seed: s }))).map((p) => of(p, 'b'));
    expect(quiet.some((o) => o.outcome === 'keep' && o.reason === 'designedQuiet')).toBe(true);
  });

  it('pairs B: a line that came in by a visible composition takes nothing inside it, even where a world still declares an in-line reseat; the refusal is recorded', () => {
    const sections = [{ start: 0, energy: 0.9 }, { start: 3.3, energy: 0.95 }];
    const plan = planWorldEvents(joint([first, second()], { sections }));
    expect(cutsOn(plan, 'b').map((e) => e.scope)).toEqual(['section']);
    expect(of(plan, 'b').actions).toBeUndefined();
    expect(plan.events.some((e) => e.kind === 'layout-seat' && e.scope === 'in-line')).toBe(false);
    // (a kept boundary: still no reseat inside the line, the layout-seat family is no in-line family at all)
    const kept = Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second({ holdCands: undefined })], { seed: s })));
    for (const p of kept) expect(p.events.filter((e) => e.scope === 'in-line')).toEqual([]);
  });

  it('Q3 is never stacked on a committed hold: refused on the hold line, the keep line\'s switch elsewhere, counted once', () => {
    const scale = (lineId: string, at: number): PolicyCandidate => ({ source: 'Q3', lineId, kind: 'layout-seat', at, from: at, to: at, seatAfter: B.id, reason: 'scale', id: `scale:${lineId}`, group: `g:${lineId}`, rank: 0, folds: ['line-grow'] });
    const plans = Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second()], { seed: s, candidates: [scale('b', 3.2)] })));
    const held = plans.find((p) => p.holds.length)!;
    expect(held.policy![0]).toMatchObject({ approved: false });
    expect(held.policy![0].reason).toMatch(/collisionQ2hold/);
    expect(of(held, 'b').outcome).toBe('hold');
    // (joint off, the same hold folds into the scale composition: one action, the hold gone)
    const old = planWorldEvents({ ...joint([first, second({ holdCands: undefined, pinned: 'its line-grow hold was planned on this set (Q2)', inLine: { spans: [] } })], { candidates: [scale('b', 3.2)] }), joint: undefined, holds: [hc('b', A.id, 4.5).hold] });
    expect(old.policy![0].approved).toBe(true);
    // (a keep line: the scale composition is its one switch)
    const keep = Array.from({ length: 24 }, (_, s) => planWorldEvents(joint([first, second({ holdCands: undefined, words: undefined })], { seed: s, candidates: [scale('b', 3.2)] }))).find((p) => p.policy![0].approved)!;
    expect(cutsOn(keep, 'b')).toHaveLength(1);
    expect(of(keep, 'b').outcome).toBe('composition');
  });

  it('joint off, hold candidates are ignored: the plan is the plan without them', () => {
    const a = planWorldEvents({ ...joint([first, second()]), joint: undefined });
    const b = planWorldEvents({ ...joint([first, second({ holdCands: undefined })]), joint: undefined });
    expect(a).toEqual(b);
  });
});

// (雙截棍 / 三年後的大雪 seed 0, on the disk caches)
const NUN = 'out/db/yt_w_fCuUR3lEs/song.json';
const have = existsSync(NUN) && existsSync('out/research/instant/plans/nun/meaning.json');
type DrawnCue = { cueId: string; world?: { set: string; beat?: { kind: string; at: number; sec?: number }; holdCands?: unknown[]; repose?: { at: number; set: string; sec?: number; move?: string }[]; beatSkip?: string } };
describe.skipIf(!have)('phase 4c on real jobs', () => {
  it('art-deco under joint and holds-first: one visible composition a line, no reseat inside a line, the final check clean (pairs B)', () => {
    for (const jointHolds of [true, false]) {
      const f = freeJob(song, { style: style('art-deco'), seed: 0, meaning, worldEvents: true, jointHolds });
      const t = f.treatment.worldEvents!;
      expect(t.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
      expect(t.events.filter((e) => e.kind === 'layout-seat' && e.scope === 'in-line')).toEqual([]);
      expect((t.outcomes ?? []).filter((o) => o.actions)).toEqual([]);
      const per = new Map<string, number>();
      for (const e of t.events) if (['layout-seat', 'carrier-swap', 'page-handoff', 'ground-role', 'camera-reframe'].includes(e.kind)) per.set(e.lineIds.at(-1)!, (per.get(e.lineIds.at(-1)!) ?? 0) + 1);
      expect([...per.values()].every((n) => n <= 1)).toBe(true);
      if (jointHolds) expect(jointChecks(f.job, style('art-deco').world, t)).toEqual([]);
    }
  });

  const song = JSON.parse(readFileSync(NUN, 'utf8'));
  const meaning = JSON.parse(readFileSync('out/research/instant/plans/nun/meaning.json', 'utf8'));
  const style = (id: string) => FREE_STYLES.find((s) => s.id === id)!;

  it('document and silk: every line committed one outcome, the final check is clean, the drawing is the winner', () => {
    for (const id of ['document', 'silk', 'notebook']) {
      const f = freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: true, jointHolds: true });
      const t = f.treatment.worldEvents!;
      expect(t.warnings.filter((w) => w.reason.startsWith('final check')), id).toEqual([]);
      expect(t.outcomes!.length).toBe(f.job.cues.length);
      const cues = f.job.treatment.cues as DrawnCue[];
      for (const o of t.outcomes!) {
        const c = cues.find((x) => x.cueId === o.lineId)!;
        const cuts = t.events.filter((e) => e.kind !== 'keep' && e.lineIds.at(-1) === o.lineId);
        const holds = t.holds.filter((h) => h.lineId === o.lineId);
        expect(cuts.length + holds.length, `${id} ${o.lineId}`).toBeLessThanOrEqual(1);
        expect(!!c.world?.beat, `${id} ${o.lineId} ${o.outcome}`).toBe(o.outcome === 'hold');
        expect(c.world?.holdCands).toBeUndefined();
      }
      expect(t.holds.length).toBe(t.outcomes!.filter((o) => o.outcome === 'hold').length);
      // (deterministic)
      expect(JSON.stringify(freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: true, jointHolds: true }).treatment.worldEvents)).toBe(JSON.stringify(t));
    }
  });

  it('jointChecks: every part of the contract tampered is reported', () => {
    const f = freeJob(song, { style: style('document'), seed: 0, meaning, worldEvents: true, jointHolds: true });
    const t = f.treatment.worldEvents!;
    expect(jointChecks(f.job, style('document').world, t)).toEqual([]);
    const holdLine = t.outcomes!.find((o) => o.outcome === 'hold')!.lineId;
    const compLine = t.outcomes!.find((o) => o.outcome === 'composition' && t.events.some((e) => e.lineIds.at(-1) === o.lineId && e.scope !== 'in-line' && e.kind === 'layout-seat' && !e.fixed))!.lineId;
    const tamper = (edit: (cues: DrawnCue[], table: typeof t) => void) => { const j = structuredClone(f.job); const x = structuredClone(t); edit(j.treatment.cues as DrawnCue[], x); return jointChecks(j, style('document').world, x).map((w) => w.reason); };
    const reports = (re: RegExp, edit: Parameters<typeof tamper>[0]) => expect(tamper(edit).some((r) => re.test(r)), String(re)).toBe(true);
    const cue = (cues: DrawnCue[], id: string) => cues.find((c) => c.cueId === id)!;
    const ev = (o: Partial<WorldEvent>): WorldEvent => ({ id: 'layout-seat:zz:0', lineIds: [holdLine], kind: 'layout-seat', at: 0, from: 0, to: 0, seatBefore: '', seatAfter: '', scope: 'line', changesLight: false, reason: 'test', ...o });
    const h = t.holds.find((x) => x.lineId === holdLine)!;
    // (more than one primary action; the winner not the drawing; a losing hold left behind)
    reports(/takes 2 primary actions/, (_c, x) => x.events.push(ev({ at: h.from - 1, from: h.from - 1, to: h.from - 1 })));
    reports(/drawn as none/, (c) => delete cue(c, holdLine).world!.beat);
    reports(/drawn as line-ink-settle|drawn as \S+ [\d.]+–/, (c) => (cue(c, holdLine).world!.beat!.at += 0.2));
    reports(/the losing hold left a residue/, (c) => (cue(c, compLine).world!.beat = { kind: 'line-ink-settle', at: 1, sec: 0.2 }));
    reports(/stands in the plan's holds on a composition line/, (_c, x) => x.holds.push({ lineId: compLine, kind: 'line-ink-settle', at: 1, from: 1, to: 1.2 }));
    reports(/hold candidates reached the drawing/, (c) => (cue(c, holdLine).world!.holdCands = []));
    reports(/keep committed on \S+, drawn with/, (_c, x) => { const o = x.outcomes!.find((y) => y.lineId === compLine)!; o.outcome = 'keep'; });
    // (the held state to the line's end; READ_STABLE inside a line; the song's clocks)
    reports(/does not stay to the line's end/, (c) => (cue(c, holdLine).world!.repose = [{ at: h.to + 0.1, set: cue(c, holdLine).world!.set }]));
    reports(/runs past the line's end/, (c) => (cue(c, holdLine).world!.beat!.sec = 99));
    const other = t.outcomes!.find((o) => o.outcome === 'hold' && o.lineId !== holdLine)!.lineId;
    reports(new RegExp(`within ${ACTION_GAP}s of layout-seat:zz:0`), (_c, x) => x.events.push(ev({ lineIds: [other], at: h.to + 0.05, from: h.to + 0.05, to: h.to + 0.05 })));
    reports(/within 0.35s of its line's switch/, (_c, x) => { x.events.push(ev({ lineIds: [holdLine], at: h.from - 0.2, from: h.from - 0.3, to: h.from - 0.3 })); });
    reports(new RegExp(`within ${SEAM_GAP}s of`), (_c, x) => { const e = x.events.find((y) => y.lineIds.at(-1) === compLine && y.kind !== 'keep')!; x.events.push(ev({ id: 'layout-seat:zz:1', lineIds: ['zz'], at: e.at + 0.3, from: e.at + 0.3, to: e.at + 0.3 })); });
    // (a composite outcome with no absorbed event; the drawing, not the plan: a composition line drawn in the seat before, a keep line drawn moved)
    reports(/has no absorbed event/, (_c, x) => { x.outcomes!.find((y) => y.lineId === holdLine)!.outcome = 'composite'; });
    const prevOf = (id: string) => { const k = f.job.cues.findIndex((q) => q.id === id); return f.job.cues[Math.max(0, k - 1)].id; };
    reports(/the drawing switches nothing there/, (c) => { cue(c, compLine).world!.set = cue(c, prevOf(compLine)).world!.set; });
    const keepLine = t.outcomes!.find((o) => o.outcome === 'hold' && prevOf(o.lineId) !== o.lineId && cue(f.job.treatment.cues as DrawnCue[], prevOf(o.lineId)).world?.set === cue(f.job.treatment.cues as DrawnCue[], o.lineId).world?.set)?.lineId;
    expect(keepLine).toBeDefined();
    if (keepLine) reports(/the drawing switches there/, (c) => { const w = cue(c, keepLine).world!; w.set = cue(c, compLine).world!.set === w.set ? 'document/receipt' : cue(c, compLine).world!.set; });
    // (two changes on a line: reported on every world, pairs B)
    const two = (x: typeof t) => { const e = x.events.find((y) => y.lineIds.at(-1) === compLine && y.kind !== 'keep')!; x.events.push({ ...e, id: `${e.id}:in`, scope: 'in-line', at: e.at + 1, from: e.at + 1, to: e.at + 1 }); };
    reports(/takes 2 primary actions/, (_c, x) => two(x));
    reports(new RegExp(`without ${READ_STABLE}s of still reading`), (_c, x) => { const e = x.events.find((y) => y.lineIds.at(-1) === compLine && y.kind !== 'keep')!; e.scope = 'in-line'; e.at = e.from = e.to = f.job.cues.find((q) => q.id === compLine)!.end - 0.1; });
  });

  it('freeJob: a committed hold that cannot land is undone on its line alone, the line kept, a contract failure recorded, no hold re-added', () => {
    const base = freeJob(song, { style: style('document'), seed: 0, meaning, worldEvents: true, jointHolds: true });
    let line = '';
    const f = freeJob(song, { style: style('document'), seed: 0, meaning, worldEvents: true, jointHolds: true, trace: (_input, plan) => {
      // (the committed hold moved off every candidate: the apply finds no candidate measured for it, so none is drawn)
      const h = plan.holds[0];
      line = h.lineId;
      Object.assign(h, { at: +(h.at + 0.05).toFixed(3), from: +(h.from + 0.05).toFixed(3), to: +(h.to + 0.05).toFixed(3) });
    } });
    const t = f.treatment.worldEvents!;
    expect(t.outcomes!.find((o) => o.lineId === line)).toMatchObject({ outcome: 'keep', reason: 'landingFailed' });
    expect(t.holds.some((h) => h.lineId === line)).toBe(false);
    expect((f.job.treatment.cues as DrawnCue[]).find((c) => c.cueId === line)!.world!.beat).toBeUndefined();
    const lost = t.warnings.filter((w) => w.reason.startsWith('final check'));
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toMatch(/^final check: contract failure: the committed hold on \S+ did not land \(joint: committed hold:[\w-]+@\S+ .* drawn as none\); the line kept its seat with no hold/);
    // (every other line as the plan without the failure)
    expect(t.holds).toEqual(base.treatment.worldEvents!.holds.filter((h) => h.lineId !== line));
  });

  it('freeJob, joint: a composite that cannot land is undone whole (event and its hold), the line kept, one contract failure, no hold restored alone', () => {
    let line = '';
    const f = freeJob(song, { style: style('document'), seed: 0, meaning, worldEvents: true, jointHolds: true, trace: (input, plan) => {
      const h = plan.holds[0];
      line = h.lineId;
      const l = input.lines.find((x) => x.id === line)!;
      plan.events.push({ id: `carrier-swap:${line}:forced`, lineIds: [line], kind: 'carrier-swap', at: h.to, from: h.to, to: +(h.to + 0.3).toFixed(3), seatBefore: l.seat!, seatAfter: `${l.seat}+nowhere`, scope: 'in-line', changesLight: false, reason: 'forced', material: 'poster-panel', absorbed: { holdId: holdIdOf(h), kind: h.kind, hold: { at: h.at, from: h.from, to: h.to }, materialId: 'poster-panel', ink: '#ffd700', occupancy: { from: h.from, to: +(h.to + 0.3).toFixed(3) }, reason: 'forced' } });
      plan.outcomes!.find((o) => o.lineId === line)!.outcome = 'composite';
    } });
    const t = f.treatment.worldEvents!;
    expect(t.events.some((e) => e.id.endsWith(':forced'))).toBe(false);
    expect(t.holds.some((h) => h.lineId === line)).toBe(false);
    expect(t.outcomes!.find((o) => o.lineId === line)).toMatchObject({ outcome: 'keep', reason: 'landingFailed' });
    expect((f.job.treatment.cues as DrawnCue[]).find((c) => c.cueId === line)!.world!.beat).toBeUndefined();
    const lost = t.warnings.filter((w) => w.reason.startsWith('final check'));
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toMatch(/contract failure: the composite .* the line kept with no hold \(joint\)/);
  });

  it('a keep line whose camera was dropped after the selection says so', () => {
    const l: WorldEventLine = { id: 'x', show: 1, start: 1, end: 3, seats: [A] };
    expect(outcomeOf(l, [], [], { cands: 2, legal: true, mood: 'peak' }, false, true)).toMatchObject({ outcome: 'keep', reason: 'cameraDropped' });
    expect(outcomeOf(l, [], [], { cands: 2, legal: true, mood: 'peak' }, false)).toMatchObject({ outcome: 'keep', reason: 'noSafeCandidate' });
  });

  it('the composer\'s candidates in scheduler terms: one per seat and kind, each its own seat\'s window', () => {
    const w: Pick<WorldLine, 'holdCands'> = { holdCands: [{ seat: 's', beat: { kind: 'line-grow', at: 1, sec: 0.3 }, rank: 0, slack: 0.4 }, { seat: 't', beat: { kind: 'line-ink-settle', at: 1.2, sec: 0.2 }, rank: 1, slack: 0.3 }] };
    expect(jointHoldsOf('c', w as WorldLine)).toEqual([{ seat: 's', hold: { lineId: 'c', at: 1, from: 1, to: 1.3, kind: 'line-grow' }, rank: 0, slack: 0.4 }, { seat: 't', hold: { lineId: 'c', at: 1.2, from: 1.2, to: 1.4, kind: 'line-ink-settle' }, rank: 1, slack: 0.3 }]);
    expect(holdIdOf({ kind: 'line-grow', lineId: 'c' } as HoldEvent)).toBe('hold:line-grow@c');
  });
});

// (the commit before phase 4c, a9a9027: its --q1 fingerprint, default-hash.mts, on the same disk caches)
const BASE_Q1 = 'out/research/q1-1109/hash-4c/base-q1-seed0.json';
describe.skipIf(!have || !existsSync(BASE_Q1))('phase 4c: joint off is the job before it', () => {
  it('scheduler on, joint off: no joint residue (the a9a9027 fingerprint held until the pairs rules); joint asked on a world the scheduler does not take: the default job', () => {
    const rows = JSON.parse(readFileSync(BASE_Q1, 'utf8')).rows as Record<string, string>;
    const song = JSON.parse(readFileSync(NUN, 'utf8'));
    const meaning = JSON.parse(readFileSync('out/research/instant/plans/nun/meaning.json', 'utf8'));
    for (const id of ['document', 'silk', 'art-deco']) {
      const f = freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning, worldEvents: true });
      // (2026-11-10 pairs rules: art-deco's reseats inside a line are gone (B) and every world's ink-swaps need a reason
      // (C), so the --q1 job is no longer a9a9027's byte for byte; the fingerprint is still on disk for the record)
      expect(createHash('sha256').update(JSON.stringify(f.job)).digest('hex').slice(0, 16), id).not.toBe(id === 'art-deco' ? rows[`nun/${id}`] : '');
      expect(JSON.stringify(f.job)).not.toMatch(/holdCands|"outcomes"/);
      const off = freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning, jointHolds: true });
      expect(JSON.stringify(off.job)).toBe(JSON.stringify(freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning }).job));
    }
  });
});
