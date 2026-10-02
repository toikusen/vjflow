// Review edits (spec 3.3): a review may change template params and cue styles only. Assets are changed only when the
// review marks one unusable with a reason; structure (shots, timing, templates) is never touched here.
import { CueStyle, ParamValue, TreatmentV3 } from './treatment';

export interface ReviewEdits {
  shots: { id: string; params: Record<string, ParamValue> }[];
  cues: { cueId: string; enter?: CueStyle['enter']; exit?: CueStyle['exit']; emphasis?: CueStyle['emphasis']; accents?: number[]; rows?: number[] }[];
}

export interface ReviewResult {
  scores: Record<string, number>;
  issues: { target: string; criterion: number; problem: string }[];
  edits: ReviewEdits;
  assetUnusable: { id: string; reason: string }[];
}

/** Returns a new treatment with the allowed edits applied, plus notes on what was ignored. */
export function applyEdits(t: TreatmentV3, edits: ReviewEdits): { treatment: TreatmentV3; ignored: string[] } {
  const out: TreatmentV3 = structuredClone(t);
  const ignored: string[] = [];
  for (const e of edits.shots) {
    const shot = out.shots.find((s) => s.id === e.id);
    if (!shot) {
      ignored.push(`未知鏡頭 ${e.id}`);
      continue;
    }
    shot.params = { ...shot.params, ...e.params };
  }
  for (const e of edits.cues) {
    const cs = out.cues.find((c) => c.cueId === e.cueId);
    if (!cs) {
      ignored.push(`未知歌詞 ${e.cueId}`);
      continue;
    }
    if (e.enter) cs.enter = e.enter;
    if (e.exit) cs.exit = e.exit;
    if (e.emphasis) cs.emphasis = e.emphasis;
    if (e.accents) cs.accents = e.accents;
    if (e.rows) cs.rows = e.rows;
  }
  return { treatment: out, ignored };
}

/** The spec's pass bar for human scoring: mean ≥ 3.5 and no criterion ≤ 2. */
export function passes(scores: Record<string, number>): boolean {
  const v = Object.values(scores);
  return v.length > 0 && v.reduce((s, x) => s + x, 0) / v.length >= 3.5 && v.every((x) => x > 2);
}
