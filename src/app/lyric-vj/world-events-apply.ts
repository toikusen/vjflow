// The approved composition events written back into the composer's plan (Q1 phase 2, docs/research/2026-11-09-q1-phase2.md):
// each world line's seat at its boundary and the switches inside it become its `set` and `repose`, and a line moved to
// a set laid into a page of its own takes that page under it. Nothing else changes: no cut, no ground, no timing is
// added here (composerTreatment translates the plan as it stands, with no switch of its own).
import type { StyleWorld } from './style-world';
import type { WorldEventPlan } from './world-events';

interface PlanLine { cue: string; world?: { set: string; repose?: { at: number; set: string }[]; seats?: string[] } }
interface PlanShot { shot: string; lines: PlanLine[]; cuts: { fx: string }[] }

/**
 * Writes `plan`'s approved seats into the composer's plan `p` (a copy is returned): a line's boundary seat (the first
 * event of the line that is not inside it) and its in-line switches, in time order. A set the world lays into its own
 * page moves the shot's page with it (its cuts on the old set's page go to the new set's). Lines whose world declares no
 * capability are returned as they are: their reposes were given.
 */
export function applyWorldEvents<P extends { shots: PlanShot[] }>(p: P, plan: WorldEventPlan, world: StyleWorld): P {
  const out = structuredClone(p);
  const page = (set: string) => world.layouts.lines.find((l) => l.set === set)?.ground;
  const byLine = new Map<string, { boundary?: string; inLine: { at: number; set: string }[] }>();
  for (const e of plan.events) {
    const id = e.lineIds.at(-1)!;
    const row = byLine.get(id) ?? { inLine: [] };
    if (e.scope === 'in-line') {
      if (e.kind === 'layout-seat' && e.seatAfter) row.inLine.push({ at: e.at, set: e.seatAfter });
    } else if (row.boundary === undefined && e.kind !== 'camera-reframe' && e.seatAfter) row.boundary = e.seatAfter;
    byLine.set(id, row);
  }
  for (const s of out.shots)
    for (const l of s.lines) {
      const row = byLine.get(l.cue);
      if (!l.world || !row) continue;
      const set = row.boundary && row.boundary !== l.world.set && (l.world.seats ?? []).includes(row.boundary) ? row.boundary : l.world.set;
      if (set !== l.world.set) {
        const [from, to] = [page(l.world.set), page(set)];
        if (from && to) for (const c of s.cuts) if (c.fx === from) c.fx = to;
        l.world.set = set;
      }
      const inLine = row.inLine.sort((a, b) => a.at - b.at);
      if (inLine.length) l.world.repose = inLine;
      else delete l.world.repose;
    }
  return out;
}
