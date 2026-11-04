// Word sync from the line director's asks (word-sync.ts): each ask through the guards with the song's sung times and
// what the plan made of the line, the kept ones written onto the plan's lines (sung times and reveal 'sung'), which
// typeplan --plan and free-plan's composerTreatment carry onto the treatment's cues for the renderer.
import { checkWordSync, SyncDropped, SyncLine, WordSync, WordSyncAsk } from '../../src/app/lyric-vj/word-sync';
import { SungTimes } from '../../src/app/lyric-vj/sung-times';

/** Layouts that cut a line into pieces as it is sung: they land their own pieces (linedirect-core SPLIT_LAYOUTS). */
export const SPLIT_LAYOUTS = new Set(['build-cut', 'beat-cut', 'panel-route']);

export interface SyncPlanLine { cue: string; handoff?: unknown; sung?: number[]; reveal?: string; [k: string]: unknown }
export interface SyncPlan { shots: { lyric: { template: string }; lines: SyncPlanLine[] }[] }

/** What the plan made of each line, for the guards: its layout's kind, whether it shares its shot, a handoff on it. */
export function planLinesOf(plan: SyncPlan): Map<string, SyncLine> {
  const out = new Map<string, SyncLine>();
  for (const ps of plan.shots) for (const l of ps.lines ?? []) out.set(l.cue, { split: SPLIT_LAYOUTS.has(ps.lyric.template), together: (ps.lines?.length ?? 0) > 1, handoff: !!l.handoff });
  return out;
}

/** The asks through the guards on this song and plan; the kept ones written onto the plan's lines. */
export function planWordSync(plan: SyncPlan, cues: { id: string; start: number; end: number; text: string }[], asks: WordSyncAsk[], times: Map<string, SungTimes>): { kept: WordSync[]; dropped: SyncDropped[] } {
  const lines = planLinesOf(plan);
  const { kept, dropped } = checkWordSync(asks, cues, (id) => times.get(id), (id) => lines.get(id));
  const byCue = new Map(kept.map((k) => [k.cue, k]));
  for (const ps of plan.shots) for (const l of ps.lines ?? []) {
    const k = byCue.get(l.cue);
    if (k) Object.assign(l, { sung: k.times, reveal: 'sung' });
  }
  return { kept, dropped };
}
