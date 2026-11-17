// A line leaves after its last sung character, never on it: an exit that began while the last word was still being
// sung read as the line being cut off (v3's c004 left 0.12 s before 気 ended).

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
