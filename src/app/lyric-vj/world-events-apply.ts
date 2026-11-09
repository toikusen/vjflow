// The approved composition events written back into the composer's plan (Q1 phase 2, docs/research/2026-11-09-q1-phase2.md):
// each world line's seat at its boundary and the switches inside it become its `set` and `repose`, and a line moved to
// a set laid into a page of its own takes that page under it. Nothing else changes: no cut, no ground, no timing is
// added here (composerTreatment translates the plan as it stands, with no switch of its own).
import type { StyleWorld } from './style-world';
import { compositionsOf, pageOf } from './world-shared';
import type { WorldEventPlan } from './world-events';
import type { LineScale } from './render/scale-pose';

interface PlanLine { cue: string; world?: { set: string; exit?: string; repose?: { at: number; set: string; sec?: number; move?: string }[]; seats?: string[]; beat?: { at: number }; cam?: unknown; wipe?: { from: number; sec: number; move: string }; page?: { move: string; at: number; sec: number; draws: string }; scale?: LineScale } }
interface PlanShot { shot: string; lines: PlanLine[]; cuts: { fx: string }[] }

/**
 * Writes `plan`'s approved seats into the composer's plan `p` (a copy is returned): a line's boundary seat (the first
 * event of the line that is not inside it) and its in-line switches, in time order. A set the world lays into its own
 * page moves the shot's page with it (its cuts on the old set's page go to the new set's). Lines whose world declares no
 * capability are returned as they are: their reposes were given.
 */
export function applyWorldEvents<P extends { shots: PlanShot[] }>(p: P, plan: WorldEventPlan, world: StyleWorld, o?: { seats: boolean; scale?: Map<string, LineScale> }): P {
  const out = structuredClone(p);
  // (3b's seats and material moves are written first; Q3 then writes only `scale` and the folded beat, never 3b's fields)
  const scaled = (out: P) => {
    // (Q3 phase 2: each approved scale composition onto its line; a world the scheduler does not take over keeps its seats)
    // (a line-grow the composition folded is that change of size: its beat comes off the line, world-events arbitratePolicies)
    const folded = new Set(plan.events.flatMap((e) => (e.policy?.length ? e.merged ?? [] : [])));
    if (o?.scale) for (const s of out.shots) for (const l of s.lines) {
      const sc = o.scale.get(l.cue);
      if (!sc || !l.world) continue;
      l.world.scale = sc;
      // (kept on the composition: the renderer draws it again if the composition does not reach 1.6× on the real glyphs)
      if (l.world.beat && folded.has(`hold:${(l.world.beat as { kind?: string }).kind}@${l.cue}`)) { l.world.scale = { ...sc, folded: l.world.beat as LineScale['folded'] }; delete l.world.beat; (l.world as { beatSkip?: string }).beatSkip = `folded into the Q3 scale composition ${sc.eventId}`; }
    }
    return out;
  };
  if (o && !o.seats) return scaled(out);
  const page = (set: string) => pageOf(world, set);
  const byLine = new Map<string, { boundary?: string; inLine: { at: number; set: string; sec?: number; move?: string }[] }>();
  const materials = compositionsOf(world.id)?.materials ?? {};
  // (the world's own material moves: an erase is the line before's way out, a page move the line's own page)
  const wipes = new Map<string, NonNullable<NonNullable<PlanLine['world']>['wipe']>>();
  const pages = new Map<string, NonNullable<NonNullable<PlanLine['world']>['page']>>();
  for (const e of plan.events) {
    const id = e.lineIds.at(-1)!;
    const row = byLine.get(id) ?? { inLine: [] };
    const m = e.material ? materials[e.material] : undefined;
    if (e.scope === 'in-line') {
      if ((e.kind === 'layout-seat' || e.kind === 'carrier-swap') && e.seatAfter) row.inLine.push({ at: e.at, set: e.seatAfter, ...(m ? { sec: m.sec, move: e.material } : {}) });
    } else if (row.boundary === undefined && e.kind !== 'camera-reframe' && e.seatAfter) row.boundary = e.seatAfter;
    if (m?.seat === 'over' && e.lineIds.length > 1) wipes.set(e.lineIds[0], { from: e.from, sec: m.sec, move: e.material! });
    if (m?.seat === 'same') pages.set(id, { move: e.material!, at: e.at, sec: m.sec, draws: m.draws });
    byLine.set(id, row);
  }
  const drops = new Set((plan.camDrops ?? []).map((c) => c.lineId));
  for (const s of out.shots)
    for (const l of s.lines) {
      if (l.world && drops.has(l.cue)) delete l.world.cam;
      const wipe = wipes.get(l.cue);
      if (l.world && wipe) Object.assign(l.world, { wipe, exit: materials[wipe.move].draws });
      const move = pages.get(l.cue);
      if (l.world && move) l.world.page = move;
      const row = byLine.get(l.cue) ?? (plan.holdMoves?.some((x) => x.lineId === l.cue) ? { inLine: [] } : undefined);
      if (!l.world || !row) continue;
      const set = row.boundary && row.boundary !== l.world.set && (l.world.seats ?? []).includes(row.boundary) ? row.boundary : l.world.set;
      if (set !== l.world.set) {
        const [from, to] = [page(l.world.set), page(set)];
        if (from && to) for (const c of s.cuts) if (c.fx === from) c.fx = to;
        l.world.set = set;
      }
      // (a hold the plan moved off a handoff: to its legal beat, or dropped)
      const moved = plan.holdMoves?.find((x) => x.lineId === l.cue);
      if (moved && l.world.beat) { if (moved.to === null) delete l.world.beat; else l.world.beat.at = moved.to; }
      const inLine = row.inLine.sort((a, b) => a.at - b.at);
      if (inLine.length) l.world.repose = inLine;
      else delete l.world.repose;
    }
  return scaled(out);
}
