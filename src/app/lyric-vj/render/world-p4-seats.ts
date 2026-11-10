// Seats on the same sheet for the first five worlds of Q1 phase 4 (docs/research/2026-11-10-phase4-codex.md §2, the table;
// docs/research/2026-11-10-q1-phase4b.md): another reading area of the paper, card or case sheet a line is already read
// on, built from the line's own set (its inks, surface, lean, the page's graphics as `clear`) with no split part, a size
// down, offered only to a world the scheduler takes over (world-shared pageSeats, lineplan-core pageSeatsFor) at no less
// than its own `lo`. Nothing is drawn for a seat that the world does not already draw round its words.
//   riso  paper-seat: the stair and the right-hand block of the same sheet trade places (the approved stair, the
//         bottom-right type area); the tilted centre line sets level into the bottom-right type area. At a line or a
//         part only (換句優先: no switch inside a line).
//   silk  poster-seat: the bleed block at the poster's head, the top slab at its foot, on the poster's own left and right
//         edge axes; the vertical column has none. Taken only at a line or a part (no switch inside a line).
//   file  case-seat: the next entry down the same case sheet, the lower blue rules of the same index card; the sheet and
//         the card draw their rules and numbers round the words as they do now (world-r2-file.ts), never a fake field.
//   card  card-seat: the same card dealt on the other side of the table (the board's card and type proportions); the
//         card is drawn round the words (world-r2-card.ts onTable), its furniture moving with them (CARD_ROOM). Taken
//         only at a line (a flip counts only where the reading composition differs).
//   spy   slash-seat: the opposite slash of the same title frame, a size down, at the slash's own lean; the centre
//         diagonal's line cut down to the low slash. At a line or a part only (no switch inside a line).
// Rows 6–7 of the table (docs/research/2026-11-10-q1-phase4d.md):
//   popart     balloon-seat: the whole carrier relation moves with the line. The balloon (its keyline and short wide
//              tail, world-b3-popart balloon) is drawn round the words, so a smaller balloon low in the same wide panel
//              takes the speed lines' and the dots' focus with it (the page reads e.rect); the narrator's caption box set
//              in the sea panel's other corner. The dots re-centring round a line is no cut: only the laid boxes count
//              (seatsDiffer). The sound effect and the twin columns keep their own page and have none.
//   midcentury poster-seat: the dusk sleeve's other reading area, low right under the atomic burst, the kidney and
//              boomerang left where they are: the words stay in cream on the dusk ground they are read on. The cut and
//              sleeve bars are fixed colour planes the page prints at their place, each holding its phrase (the second
//              only when the line splits): a seat off them would leave the words off their plane or a bar empty, so
//              they have none; the planes climb under their own short shout and have none. A colour change is no cut.
import type { SetSpec } from './world-sets';
import { pageSeat } from './page-seat';

type Box = [number, number, number, number];

const seat = (specs: Record<string, SetSpec>, of: string, o: Partial<SetSpec>): SetSpec => pageSeat(specs[of], of, o);

/** The case sheet's fixed graphics (world-r2-file caseSheet): the folder tab, the header cells, the footer rule and line. */
const CASE_CLEAR: Box[] = [[0.71, 0.03, 0.9, 0.13], [0.17, 0.12, 0.91, 0.23], [0.17, 0.88, 0.91, 0.94]];
/** The index card's head band and the rod hole at its foot (world-r2-file catalogue). */
const CARD_CLEAR: Box[] = [[0.15, 0.13, 0.85, 0.26], [0.47, 0.78, 0.53, 0.84]];
/**
 * A flash card is drawn round its words (world-r2-card onTable: its pictogram, numeral and pips 214 px above them, its
 * foot 170 px below), so its furniture moves with them and no fixed region of the table holds it: the card's room is the
 * seat's own anchor and height (top at 464 / 364 px, foot at most 910 px), tested in world-events-phase4.spec.ts.
 */
export const CARD_ROOM = { above: 214, below: 170 };

/**
 * popart's panels on the strip page (world-b3-popart strip: the wide panel 60–1200 px and the narrow one 1228–1860 px,
 * both 60–1020 px high, mirrored on strip-r), frame fractions [x0, y0, x1, y1] like every `clear`: a balloon seat keeps
 * off the other panel, and its balloon, keyline and tail stay inside its own (world-events-phase4d.spec.ts, on carrierBox
 * and render/balloon-tail wedgeTail).
 */
const fr = (x0: number, y0: number, x1: number, y1: number): Box => [x0 / 1920, y0 / 1080, x1 / 1920, y1 / 1080];
export const POP_PANELS: Record<string, { own: Box; other?: Box }> = {
  'popart/balloon': { own: fr(60, 60, 1200, 1020), other: fr(1219, 54, 1862, 1026) },
  'popart/balloon-r': { own: fr(720, 60, 1860, 1020), other: fr(58, 54, 701, 1026) },
  'popart/narration': { own: fr(60, 60, 1860, 1020) },
  'popart/narration-r': { own: fr(60, 60, 1860, 1020) },
};
/** The balloon's keyline, px (world-b3-popart balloon: 16 px, half of it outside the rim); its tail is render/balloon-tail's. */
export const POP_TAIL = { line: 16 };
/** The caption box's hard shadow, px down and right (world-b3-popart caption). */
export const POP_SHADOW = 14;

export function phase4Seats(specs: Record<string, SetSpec>): Record<string, SetSpec> {
  return {
    // riso: the stair's line set in the sheet's bottom-right type area, flush right, no stair; the right-hand block's line
    // stepped up the sheet's top-left stair (each taken at a line boundary only: riso is 換句優先)
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
    'card/main+right': seat(specs, 'card/main', { at: [0.865, 0.43], ax: 1, ay: -1, share: 0.56, tall: 0.36, hi: 170, lo: 100, rows: [1, 2]}),
    'card/calm+right': seat(specs, 'card/calm', { at: [0.792, 0.337], ax: 1, ay: -1, share: 0.56, tall: 0.4, hi: 150, lo: 100, rows: [1, 2]}),
    // spy: the low slash's line cut to the high slash, the high slash's to the low one, each a size down
    'spy/low-slash+high': seat(specs, 'spy/low-slash', { at: [0.94, 0.22], ax: 1, ay: 0, flush: 1, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
    'spy/high-slash+low': seat(specs, 'spy/high-slash', { at: [0.06, 0.8], ax: -1, ay: 0, flush: -1, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
    'spy/diagonal+low': seat(specs, 'spy/diagonal', { at: [0.06, 0.8], ax: -1, ay: 0, flush: -1, tilt: -0.09, share: 0.52, tall: 0.3, hi: 150, lo: 100, rows: [1, 2] }),
    // popart: a smaller balloon low in the wide panel (either side), its tail clear of the panel's foot; the caption box in
    // the sea panel's lower right corner, hugging its words (the board's caption is drawn round them)
    'popart/balloon+low': seat(specs, 'popart/balloon', { at: [0.36, 0.66], share: 0.28, tall: 0.22, hi: 150, lo: 100, rows: [1, 2], pad: [130, 90], fill: [0.34, 0.34], clear: [POP_PANELS['popart/balloon'].other!] }),
    'popart/balloon-r+low': seat(specs, 'popart/balloon-r', { at: [0.64, 0.66], share: 0.28, tall: 0.22, hi: 150, lo: 100, rows: [1, 2], pad: [130, 90], fill: [0.34, 0.34], clear: [POP_PANELS['popart/balloon-r'].other!] }),
    'popart/narration+foot': seat(specs, 'popart/narration', { at: [0.92, 0.86], ax: 1, ay: 1, share: 0.36, tall: 0.24, hi: 110, lo: 100, rows: [1, 2], fill: [0, 0] }),
    'popart/narration-r+foot': seat(specs, 'popart/narration-r', { at: [0.08, 0.86], ax: -1, ay: 1, share: 0.36, tall: 0.24, hi: 110, lo: 100, rows: [1, 2], fill: [0, 0] }),
    // midcentury: the dusk line low right, flush right, a smaller stair, off the burst and the kidney (the set's clear)
    'midcentury/dusk+right': seat(specs, 'midcentury/dusk', { at: [0.93, 0.82], ax: 1, ay: 1, flush: 1, stair: 1, share: 0.31, tall: 0.34, hi: 150, lo: 100, rows: [1, 2] }),
  };
}
