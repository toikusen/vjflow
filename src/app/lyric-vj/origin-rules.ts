// What the audit (origins.ts) asks of a song: a technique few of the 535 videos use is used once or twice, and no
// song is built from one creator's own forms (two at most, the rest in another variant of the same idea).
import { ORIGINS } from './origins';

/** Times a song may use a technique: once when one of the 535 videos uses it, twice when two to four do. */
export function useCap(id: string): number {
  const o = ORIGINS[id];
  if (!o || o.from) return Infinity; // learned from a creator: limitCreators decides
  return o.videos === 1 ? 1 : o.videos >= 2 && o.videos <= 4 ? 2 : Infinity;
}

/** One creator's own forms a song may use. */
export const MAX_PER_CREATOR = 2;

/**
 * Of the own forms a song uses (in the order given, most important first), the ones over MAX_PER_CREATOR for their
 * creator: these must switch to another variant.
 */
export function overCreator(used: string[]): string[] {
  const seen = new Map<string, number>();
  return used.filter((id) => {
    const o = ORIGINS[id];
    if (!o?.own || !o.from) return false;
    seen.set(o.from, (seen.get(o.from) ?? 0) + 1);
    return seen.get(o.from)! > MAX_PER_CREATOR;
  });
}
