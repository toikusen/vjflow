import { describe, expect, it } from 'vitest';
import { lampCells, LAMP_TOUCHED } from './lamp-cells';

/** A board from rows of coverage digits (0-9 → 0..0.9). */
const board = (...rows: string[]) => ({ cover: rows.join('').split('').map((d) => Number(d) / 10), cols: rows[0].length, rows: rows.length });
const lit = (b: ReturnType<typeof board>) => {
  const l = lampCells(b.cover, b.cols, b.rows);
  return Array.from({ length: b.rows }, (_, y) => Array.from({ length: b.cols }, (_, x) => (l[y * b.cols + x] ? '#' : '.')).join(''));
};

describe('lampCells: a stroke on a dot-matrix board never breaks or merges', () => {
  it('lights the lamps a stroke covers', () => {
    expect(lit(board('0990', '0990'))).toEqual(['.##.', '.##.']);
  });
  it("closes the gap a thin slanting stroke left (才's ノ)", () => {
    // a shallow slant: well covered at its ends, a lamp it only passes through between them
    expect(lit(board('0055', '0200', '5500'))).toEqual(['..##', '.#..', '##..']);
    expect(lit(board('005', '020', '500'))).toEqual(['..#', '.#.', '#..']);
  });
  it('never fills the gap between two parallel strokes, nor lights a lamp the stroke only brushes', () => {
    expect(lit(board('999', '222', '999'))).toEqual(['###', '...', '###']);
    expect(lit(board('005', '010', '500'))).toEqual(['..#', '...', '#..']);
    expect(LAMP_TOUCHED).toBeGreaterThan(0.1);
  });
});
