import { describe, expect, it } from 'vitest';
import { moveEdge } from './timing-edit';

const lines = () => [{ start: 1, end: 5 }, { start: 5, end: 8 }, { start: 9, end: 12 }];

describe('moveEdge', () => {
  it('moves a back-to-back next line with the end it shares', () => {
    expect(moveEdge(lines(), 0, 'end', 6, 60).slice(0, 2)).toEqual([{ start: 1, end: 6 }, { start: 6, end: 8 }]);
    expect(moveEdge(lines(), 0, 'end', 4, 60).slice(0, 2)).toEqual([{ start: 1, end: 4 }, { start: 4, end: 8 }]);
  });

  it('moves a back-to-back previous line with the start it shares', () => {
    expect(moveEdge(lines(), 1, 'start', 4.5, 60).slice(0, 2)).toEqual([{ start: 1, end: 4.5 }, { start: 4.5, end: 8 }]);
  });

  it('keeps the gap before a line that is not joined, and never eats a neighbour', () => {
    expect(moveEdge(lines(), 1, 'end', 10, 60).slice(1)).toEqual([{ start: 5, end: 9 }, { start: 9, end: 12 }]);
    expect(moveEdge(lines(), 0, 'end', 20, 60)[1]).toEqual({ start: 7.9, end: 8 });
    expect(moveEdge(lines(), 2, 'start', 7, 60).slice(1)).toEqual([{ start: 5, end: 7 }, { start: 7, end: 12 }]);
  });
});
