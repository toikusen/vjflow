// The one way a same-page seat is built (Q1 phases 3a and 4; world-shared pageSeats, lineplan-core pageSeatsFor): the set
// it stands beside, as it is (its inks, surface, lean, fixed, its page's graphics as `clear` unless given), with no split
// part, at its own place and size. Nothing is added that the page does not already draw round its words.
import type { SetSpec } from './world-sets';

/** A seat on `of`'s page, from `base` (the spec of `of`) with no split, at `o`'s place and size. */
export function pageSeat(base: SetSpec, of: string, o: Partial<SetSpec>): SetSpec {
  const { split: _split, ...s } = base;
  return { ...s, ...o, samePage: of };
}
