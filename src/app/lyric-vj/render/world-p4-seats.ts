// Seats on the same sheet for the first five worlds of Q1 phase 4 (docs/research/2026-11-10-phase4-codex.md §2, the table;
// docs/research/2026-11-10-q1-phase4b.md): another reading area of the paper, card or case sheet a line is already read
// on, built from the line's own set (its inks, surface, lean, the page's graphics as `clear`) with no split part, a size
// down, offered only to a world the scheduler takes over (world-shared pageSeats, lineplan-core pageSeatsFor) at no less
// than its own `lo`. Nothing is drawn for a seat that the world does not already draw round its words.
//   riso  paper-seat: the stair and the right-hand block of the same sheet trade places (the approved stair, the
//         bottom-right type area); the tilted centre line sets level into the bottom-right type area.
//   silk  poster-seat: the bleed block at the poster's head, the top slab at its foot, on the poster's own left and right
//         edge axes; the vertical column has none. Taken only at a line or a part (no switch inside a line).
//   file  case-seat: the next entry down the same case sheet, the lower blue rules of the same index card; the sheet and
//         the card draw their rules and numbers round the words as they do now (world-r2-file.ts), never a fake field.
//   card  card-seat: the same card dealt on the other side of the table (the board's card and type proportions); the
//         card is drawn round the words (world-r2-card.ts onTable), so its furniture's room above and its foot below are
//         the seat's `clear`. Taken only at a line (a flip counts only where the reading composition differs).
//   spy   slash-seat: the opposite slash of the same title frame, a size down, at the slash's own lean; the centre
//         diagonal's line cut down to the low slash.
import type { SetSpec } from './world-sets';

type Box = [number, number, number, number];

/** A seat on `of`'s sheet: `of` as it is (inks, surface, lean, fixed) with no split, at `o`'s place and size. */
const seat = (specs: Record<string, SetSpec>, of: string, o: Partial<SetSpec>): SetSpec => {
  const { split: _split, ...s } = specs[of];
  return { ...s, ...o, samePage: of };
};

/** The case sheet's fixed graphics (world-r2-file caseSheet): the folder tab, the header cells, the footer rule and line. */
const CASE_CLEAR: Box[] = [[0.71, 0.03, 0.9, 0.13], [0.17, 0.12, 0.91, 0.23], [0, 0.88, 1, 1]];
/** The index card's head band and the rod hole at its foot (world-r2-file catalogue). */
const CARD_CLEAR: Box[] = [[0.15, 0.13, 0.85, 0.26], [0.47, 0.78, 0.53, 0.84]];
/** A flash card's furniture above its words (pictogram, numeral, pips: 214 px) and its foot (170 px), world-r2-card onTable. */
const TABLE_CLEAR: Box[] = [[0, 0, 1, 0.2], [0, 0.84, 1, 1]];

export function phase4Seats(specs: Record<string, SetSpec>): Record<string, SetSpec> {
  return {
    // riso: the stair's line set in the sheet's bottom-right type area, flush right, no stair; the right-hand block's line
    // stepped up the sheet's top-left stair
    'riso/offset-stair+drop': seat(specs, 'riso/offset-stair', { at: [0.94, 0.86], ax: 1, ay: 1, flush: 1, stair: 0, share: 0.52, tall: 0.4, hi: 150, lo: 100, rows: [1, 2] }),
    'riso/drop-right+stair': seat(specs, 'riso/drop-right', { at: [0.08, 0.14], ax: -1, ay: -1, flush: -1, stair: 1.1, share: 0.66, tall: 0.5, hi: 150, lo: 100, rows: [2, 3] }),
    'riso/tilted+drop': seat(specs, 'riso/tilted', { at: [0.94, 0.86], ax: 1, ay: 1, flush: 1, tilt: 0, share: 0.52, tall: 0.4, hi: 150, lo: 100, rows: [1, 2] }),
    // silk: the bleed block on the left edge axis at the poster's head; the top slab on the right edge axis at its foot
    'silk/edge-bleed+head': seat(specs, 'silk/edge-bleed', { at: [0.04, 0.1], ax: -1, ay: -1, flush: -1, share: 0.7, tall: 0.4, hi: 220, lo: 120, rows: [1, 2] }),
    'silk/top-slab+foot': seat(specs, 'silk/top-slab', { at: [0.96, 0.9], ax: 1, ay: 1, flush: 1, share: 0.6, tall: 0.4, hi: 200, lo: 120, rows: [1, 2] }),
    // file: the next entry down the case sheet, between the first entry's place and the footer; the index card's lower rules
    'file/case+next': seat(specs, 'file/case', { at: [0.1875, 0.84], ax: -1, ay: 1, share: 0.68, tall: 0.3, hi: 160, lo: 100, rows: [1, 2], clear: CASE_CLEAR }),
    'file/catalogue+next': seat(specs, 'file/catalogue', { at: [0.26, 0.74], ax: -1, ay: 1, share: 0.56, tall: 0.26, hi: 130, lo: 100, rows: [1, 2], clear: CARD_CLEAR }),
    // card: the beat card and the calm card dealt on the table's right, rows kept flush left on the face
    'card/main+right': seat(specs, 'card/main', { at: [0.865, 0.43], ax: 1, ay: -1, share: 0.56, tall: 0.36, hi: 170, lo: 100, rows: [1, 2], clear: TABLE_CLEAR }),
    'card/calm+right': seat(specs, 'card/calm', { at: [0.792, 0.337], ax: 1, ay: -1, share: 0.56, tall: 0.4, hi: 150, lo: 100, rows: [1, 2], clear: TABLE_CLEAR }),
    // spy: the low slash's line cut to the high slash, the high slash's to the low one, each a size down
    'spy/low-slash+high': seat(specs, 'spy/low-slash', { at: [0.94, 0.22], ax: 1, ay: 0, flush: 1, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
    'spy/high-slash+low': seat(specs, 'spy/high-slash', { at: [0.06, 0.8], ax: -1, ay: 0, flush: -1, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
    'spy/diagonal+low': seat(specs, 'spy/diagonal', { at: [0.06, 0.8], ax: -1, ay: 0, flush: -1, tilt: -0.09, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
  };
}
