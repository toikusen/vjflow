// A line sung again straight away (いつまでも ×3) stays up as one line that pulses on each repeat: three cuts in three
// seconds could not be read. The line composer budgets each line's reading against its own cuts, so a repeat it gave a
// shot of its own keeps that shot: merged, gameshow 雙截棍 c024 ran on to 90.56 s over the cut at 88.2 into c025's set
// piece, its card gone (reading gate delta 34).

const norm = (x: string) => x.replace(/[\s、。,.!?！？「」]/g, '');

export interface RepeatLine {
  cue: { id: string; text: string; start: number; end: number };
  style: { shot: string; budget?: boolean };
}

/**
 * Folds each straight repeat into the line before it (its end runs on, its start becomes a pulse), except in a chat
 * (`keepsAll`: every message stays) and except a composer line planned in a shot of its own. Returns the lines left
 * (copies; the input is untouched) and each kept line's repeat times.
 */
export function foldRepeats<T extends RepeatLine>(lines: T[], keepsAll: (x: T) => boolean): { lines: T[]; repeats: Map<string, number[]> } {
  const repeats = new Map<string, number[]>();
  const out: T[] = [];
  for (const x of lines) {
    const prev = out[out.length - 1];
    const ownShot = !!x.style.budget && x.style.shot !== prev?.style.shot;
    if (prev && !keepsAll(x) && !ownShot && norm(prev.cue.text) === norm(x.cue.text) && x.cue.start - prev.cue.end < 0.6) {
      prev.cue = { ...prev.cue, end: x.cue.end };
      repeats.set(prev.cue.id, [...(repeats.get(prev.cue.id) ?? []), x.cue.start]);
    } else out.push({ ...x });
  }
  return { lines: out, repeats };
}
