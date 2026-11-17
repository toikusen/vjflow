// A line leaves after its last sung character, never on it: an exit that began while the last word was still being
// sung read as the line being cut off (v3's c004 left 0.12 s before 気 ended).

/** Seconds a line stays up past its last sung character before its exit may begin. */
export const SUNG_TAIL = 0.3;

/**
 * The exit time with the sung tail: no earlier than `lastSung + SUNG_TAIL`, but never so late that the exit would
 * run into the next line's showing (`latest`, the exit start that still clears it). When the two conflict, the next
 * line wins — a line covered by the next is worse than one cut short.
 */
export function exitAfterSung(exitAt: number, lastSung: number | undefined, latest: number): number {
  if (lastSung === undefined) return exitAt;
  return Math.min(Math.max(exitAt, lastSung + SUNG_TAIL), Math.max(exitAt, latest));
}
