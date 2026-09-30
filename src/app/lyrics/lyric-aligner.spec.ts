import { findHoles } from './lyric-aligner.service';

describe('findHoles', () => {
  it('finds long stretches without recognized words, including the edges', () => {
    const w = (start: number, end: number) => ({ text: 'x', start, end });
    expect(findHoles([w(10, 11), w(12, 13), w(40, 41)], 60)).toEqual([[0, 10], [13, 40], [41, 60]]);
    expect(findHoles([w(1, 2), w(5, 6)], 10)).toEqual([]);
    expect(findHoles([], 30)).toEqual([[0, 30]]);
  });
});
