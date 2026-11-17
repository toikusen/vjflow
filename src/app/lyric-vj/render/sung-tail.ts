// A line leaves after its last sung character, never on it: an exit that began while the last word was still being
// sung read as the line being cut off (v3's c004 left 0.12 s before 気 ended).

/**
 * A line's latest sung character time: the largest of its character times, not the last listed — a duet set together
 * (line-shows.ts) lists the first voice's characters, then the second's, and the first may be sung later (opus review).
 */
export const lastSungChar = (charStarts: number[]) => Math.max(...charStarts);

/** Seconds a line stays up past its last sung character before its exit may begin. */
export const SUNG_TAIL = 0.3;

/**
 * The exit time with the sung tail: no earlier than `lastSung + SUNG_TAIL`. The tail is never given up for the next
 * line: where the two would meet, the next line waits (nextShowAfter) — a line cut off on its last word was the worse
 * fault in every review (v3's c004, v4's c002/c004/c009, 2026-11-17).
 */
export function exitAfterSung(exitAt: number, lastSung: number | undefined, tail = SUNG_TAIL): number {
  if (lastSung === undefined) return exitAt;
  return Math.max(exitAt, lastSung + tail);
}

/** The shortest exit a line plays when the next one presses: a blink is still an exit, nothing shorter is. */
export const EXIT_MIN = 0.08;

/**
 * When the next line shows, given this one's exit: its own time where the exit (shortened to EXIT_MIN at the least,
 * `lead` clear before the show) is over by then, else right after the exit — the next line waits for this one to
 * leave rather than this one leaving early. Returns the exit's duration as well.
 */
export function nextShowAfter(exitAt: number, exitSec: number, nextShow: number, lead: number): { show: number; exitDur: number } {
  if (exitSec <= 0) return { show: Math.max(nextShow, exitAt + lead), exitDur: 0 };
  const exitDur = Math.max(EXIT_MIN, Math.min(exitSec, nextShow - lead - exitAt));
  return { show: Math.max(nextShow, exitAt + exitDur + lead), exitDur };
}

/**
 * When the next line shows, given the wait this one's tail asks (`waited`): never past the next line's sung onset (its
 * first sung character) — a line shown after it has been sung is the worse fault — and never earlier than planned
 * (`planned`). Where the cap bites, the two lines are up together for this one's exit.
 */
export function showByOnset(waited: number, planned: number, onset: number): number {
  return Math.max(planned, Math.min(waited, onset));
}

import { READ_FLOOR } from './reading-window';
export { READ_FLOOR };
/**
 * A timed line's exit begins at least this long after its last sung character: one character's reading time at the
 * project's rate (readingSec: 12 characters a second), never a sub-frame flash of the last syllable (opus review).
 */
export const MIN_TAIL = 1 / 12;
/** The lead a line's exit ends before the next line shows (world-handoff EXIT_LEAD). */
const LEAD = 0.02;

/**
 * The earliest a line may begin to leave: READ_FLOOR after it shows, and MIN_TAIL past its last sung character; a line
 * with no character times may blink out over the last moment of its stated end (nothing says a word is still sung).
 */
export function exitFloor(cue: { start: number; end: number; charStarts?: number[] }, show: number, lead = LEAD, tail = MIN_TAIL): number {
  const sung = cue.charStarts?.length ? lastSungChar(cue.charStarts) + tail : cue.end - EXIT_MIN - lead;
  return Math.max(show + READ_FLOOR, sung);
}
/** Whether a line leaving no earlier than `floor` can be gone (cut, at the least) before a line sung from `onset` shows. */
export const handsOver = (floor: number, onset: number, lead = LEAD) => onset >= floor + lead - 1e-9;
/**
 * Two lines whose handover cannot be clean — the next sung before this one may leave (same start, a duet's overlap, a
 * rap line sung into the last syllable) — are shown together in their own rows (line-shows.ts), never one hidden.
 */
export function mustShare(a: { start: number; end: number; text: string; charStarts?: number[] }, b: { start: number; end?: number; text?: string; charStarts?: number[] }, onset = b.charStarts?.[0] ?? b.start, tail = MIN_TAIL): boolean {
  // (sung before this one's floor: no handover at all; between the floor and a lead past it, settleExit cuts this one as
  // the next shows, its lead given up)
  return onset < exitFloor(a, a.start, LEAD, tail) - 1e-9;
}
/**
 * The tail the composer pairs lines by (planPairs): a frame and a little. Pairing every line whose next comes within
 * MIN_TAIL re-plans fast rap so far that the world-event scheduler's own checks fail (3b, 4a, 4c on 雙截棍); the engine
 * sets the rest together (line-shows.ts) where no world event names them, and logs them where one does.
 */
export const PLAN_TAIL = 0.04;

/**
 * This line's exit and the next line's show on one seat: the wait the tail asks (nextShowAfter), capped at the next
 * line's sung onset (showByOnset). Where the cap bites (`capped`), this line is gone before the next shows — its exit
 * ends `lead` before it, shortened and started earlier down to a blink, but never before `floor` (exitFloor). Where even
 * that cannot be (`overlap`: lines that should have been set together and could not), both stay lit — the line is
 * never cut before it is read — and the engine logs it. Layouts that seat two lines apart do not ask this.
 */
export function settleExit(exitFrom: number, exitSec: number, plannedShow: number, onset: number, lead: number, floor: number): { show: number; exitAt: number; exitDur: number; capped: boolean; overlap: boolean } {
  const w = nextShowAfter(exitFrom, exitSec, plannedShow, lead);
  const show = showByOnset(w.show, plannedShow, onset);
  if (show >= w.show - 1e-9) return { show: w.show, exitAt: exitFrom, exitDur: w.exitDur, capped: false, overlap: false };
  const end = show - lead;
  if (exitFrom + EXIT_MIN <= end) return { show, exitAt: exitFrom, exitDur: Math.min(Math.max(exitSec, EXIT_MIN), end - exitFrom), capped: true, overlap: false };
  if (end - EXIT_MIN >= floor - 1e-9) return { show, exitAt: end - EXIT_MIN, exitDur: EXIT_MIN, capped: true, overlap: false };
  // (no room for a blink past the floor: a cut, as late as the floor allows — gone as the next shows, its lead given up
  // where it must be)
  if (end >= floor - 1e-9) return { show, exitAt: floor, exitDur: Math.max(0, end - floor), capped: true, overlap: false };
  if (floor <= show + 1e-9) return { show, exitAt: floor, exitDur: Math.max(0.001, show - floor), capped: true, overlap: false };
  // (the next is sung before this one's floor: both lit, as briefly as the floor allows — a fault, logged)
  return { show, exitAt: floor, exitDur: EXIT_MIN, capped: true, overlap: true };
}

/**
 * The render's sung-tail metric: a line tagged 'kept' that began to leave inside its tail fails, and so do two lines
 * left lit together on one seat (settleExit overlaps); a 'capped' line gave its tail to the next line's onset on
 * purpose (its reason in tailWhy) and passes. `waits` are the lines that showed late so the one before kept its tail.
 */
export function sungTailCheck(cues: { id: string; text: string; lastSung: number; exitAt?: number; tail?: string; tailWhy?: string }[], waits: { id: string; sec: number }[] = [], overlaps: { id: string; next: string; from: number; to: number }[] = []) {
  const failing = cues.filter((c) => c.tail === 'kept' && c.exitAt !== undefined && c.exitAt < c.lastSung + SUNG_TAIL - 0.034).map((c) => ({ id: c.id, text: c.text, lastSung: c.lastSung, exitAt: c.exitAt }));
  const capped = cues.filter((c) => c.tail === 'capped').map((c) => ({ id: c.id, why: c.tailWhy ?? '' }));
  return { ok: !failing.length && !overlaps.length, failing, overlaps, capped, waits };
}
