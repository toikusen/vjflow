// The frozen phase-4 world groups and target (docs/research/2026-11-10-phase4-codex.md §1, 2026-11-10-q1-phase4a.md):
// one definition, imported by every phase-4 measurement (measure-world-events.mts, the phase-4b reports).
/** The original five single-page worlds and the eight added in phase 4 (pictogram is the world `card`). */
export const GROUPS = { five: ['blueprint', 'chalkboard', 'document', 'notebook', 'art-deco'], eight: ['riso', 'silk', 'file', 'card', 'spy', 'popart', 'midcentury', 'screentone'] } as const;
/** The thirteen together: the group the phase-4 target is set on. */
export const THIRTEEN: readonly string[] = [...GROUPS.five, ...GROUPS.eight];
/** The phase-4 design target for the thirteen, plan median without proportional-time boundaries, per 10 s (not a proven ceiling). */
export const TARGET_13 = { fast: 4.0, calm: 4.8 } as const;
/** The headline metric every group is reported by. */
export const HEADLINE = 'medianWiredPlanExclUnreliable' as const;
