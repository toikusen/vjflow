// A ground that turns behind a sung line (lineplan-core's turn, review 2026-11-10 of the no-in-line-reseat fix): the
// words stay where they are, so the turn is kept only when everything they are read on stays. Shared by the composer,
// which drops a turn that fails, and the final check on the drawn job (world-events-adapter turnChecks).
import { contrast } from '../contrast';
import { carrierSlots, groundsUnder, READ_MIN } from './hold-room';
import { objectInk, type Slots } from './world-objects';
import { SET_SPECS } from './world-sets';

/** What the frame is lit by under a line: the print's ink and paper, and whether it is turned dark (free-plan's layer). */
export interface TurnPrint { ink?: string; paper?: string; dark?: boolean }

/**
 * The ink a world line's words are drawn in, as world-layout resolves it: the set's own ink slot, its object's ink, the
 * world's fixed ink, else the print's type colour under the line (a dark print turns paper and ink over).
 */
export function lineInkOf(set: string, slots: Slots, fixedInk: boolean, print: TurnPrint = {}): string {
  const spec = SET_SPECS[set];
  if (spec?.ink) return slots[spec.ink];
  if (spec?.object) return objectInk(spec.object, slots);
  if (fixedInk) return slots.ink;
  return (print.dark ? print.paper : print.ink) ?? slots.ink;
}

/** The background a print lays under words standing on it directly. */
const backOf = (print: TurnPrint) => (print.dark ? print.ink : print.paper);

/**
 * Why a turn of ground to `fx` inside a line on `set` would take something from the words, or undefined when it keeps
 * them: (1) a set laid into its page (`page`, world-shared pageOf) stands on that page: only that page may stay under it;
 * (2) a ground that is another set's page (`pages`) brings that set's carrier under these words; (3) every part of the
 * line stands on a carrier of its own (hold-room carrierSlots; not a split line's small part, not a blown-up word's first
 * pose, which stand on the ground): what a new ground draws under words standing on it is the picture's (the engine's
 * backdropAt, from pixels), which the plan cannot read (2026-11-10 gate: dark-glitch, neon-stage, silk-cold and a blown
 * silent-film line lost ink or pixels after their turn); (4) the line's ink must
 * read no worse on the grounds under the words after the turn than before it (hold-room groundsUnder: its carrier, else
 * the print's background), and at READ_MIN when it did before. What the picture draws under the words (the engine's
 * backdropAt, from pixels) the plan cannot see: the reading gate samples every turn for it (style-gate-reading turns).
 */
export function turnTakes(o: { set: string; page?: string; pages: ReadonlySet<string>; fx: string; slots: Slots; ink: string; before: TurnPrint; after: TurnPrint; blown?: boolean }): string | undefined {
  if (o.page && o.fx !== o.page) return `the set stands on its page ${o.page}: a turn to ${o.fx} takes its carrier away`;
  if (o.pages.has(o.fx) && o.fx !== o.page) return `${o.fx} is another set's page: its carrier would come under the words`;
  const spec = SET_SPECS[o.set];
  if (!spec) return `no set ${o.set}`;
  if (!carrierSlots(spec) || spec.split || o.blown) return `the words stand on the ground itself (${o.blown ? 'a blown-up word' : spec.split ? 'a split part' : 'no carrier'}): the plan cannot read what ${o.fx} draws under them`;
  const worst = (p: TurnPrint) => Math.min(...groundsUnder(spec, o.slots, { background: backOf(p) }).map((g) => contrast(o.ink, g)));
  const [was, now] = [worst(o.before), worst(o.after)];
  if (now < was - 1e-6) return `the ink reads worse after the turn (${was.toFixed(2)} → ${now.toFixed(2)}:1)`;
  if (now < READ_MIN && was >= READ_MIN) return `the ink reads ${now.toFixed(2)}:1 on the ground after the turn (under ${READ_MIN})`;
  return undefined;
}
