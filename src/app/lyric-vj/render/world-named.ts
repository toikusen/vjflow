// The lines a plan's world events really name (pure: line-shows.ts, engine.ts and the timing audit read it).

/**
 * The ids of the lines a world event acts on — any event but a plain 'keep', and every hold. Only these are read at the
 * composer's PLAN_TAIL and never set together; every other line of the plan is the engine's to time (opus review: the
 * whole plan was treated as named when it carried a table at all).
 */
export function namedLines(treatment: { worldEvents?: unknown }): Set<string> {
  const we = treatment.worldEvents as { events?: { kind?: string; lineIds?: string[] }[]; holds?: { lineId?: string }[] } | undefined;
  if (!we) return new Set();
  return new Set([...(we.events ?? []).filter((e) => e.kind !== 'keep').flatMap((e) => e.lineIds ?? []), ...(we.holds ?? []).flatMap((h) => (h.lineId ? [h.lineId] : []))]);
}
