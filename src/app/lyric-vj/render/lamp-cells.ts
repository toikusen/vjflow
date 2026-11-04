// Which lamps of a dot-matrix board a character lights. Legibility is absolute (owner): a stroke never breaks. Lit
// only where the stroke covers most of a lamp, a thin slanting stroke left gaps a lamp wide and fell apart (LED 看板's
// 「才」: its ノ was three loose dots). A lamp the stroke passes through is lit too when it closes such a gap, and only
// then: a lamp in the gap between two strokes has no ink on it, so strokes never merge.

/** Coverage at which a lamp is lit on its own. */
export const LAMP_LIT = 0.3;
/** Coverage that shows the stroke passes through a lamp (not the soft edge of one beside it): enough to light it where it joins two lit lamps. */
export const LAMP_TOUCHED = 0.15;

// the pairs of lit neighbours a gap lamp may join: the diagonal and the knight's steps of a slanting stroke. Never
// straight across, nor where lit lamps stand straight across it: that lamp is the gap between two parallel strokes (a
// level or upright stroke covers its lamps evenly and has no gaps of its own)
const PAIRS: [number, number, number, number][] = [
  [-1, -1, 1, 1], [1, -1, -1, 1],
  [-1, -1, 1, 0], [-1, -1, 0, 1], [1, -1, -1, 0], [1, -1, 0, 1], [-1, 0, 1, 1], [0, -1, 1, 1], [1, 0, -1, 1], [0, -1, -1, 1],
];

/**
 * The lit lamps (1) of a cols x rows board from each lamp's ink coverage (0..1, row by row): those covered at LAMP_LIT,
 * then, twice over, the touched lamps lying between two lit ones, so a gap of up to two lamps along a stroke closes.
 */
export function lampCells(cover: ArrayLike<number>, cols: number, rows: number): Uint8Array {
  const lit = new Uint8Array(cols * rows);
  for (let i = 0; i < lit.length; i++) lit[i] = cover[i] >= LAMP_LIT ? 1 : 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && lit[y * cols + x] === 1;
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (lit[i] || cover[i] < LAMP_TOUCHED) continue;
        // lit lamps straight across on both sides: this lamp is between two strokes, not on one
        if ((on(x, y - 1) && on(x, y + 1)) || (on(x - 1, y) && on(x + 1, y))) continue;
        if (PAIRS.some(([ax, ay, bx, by]) => on(x + ax, y + ay) && on(x + bx, y + by))) add.push(i);
      }
    if (!add.length) break;
    for (const i of add) lit[i] = 1;
  }
  return lit;
}
