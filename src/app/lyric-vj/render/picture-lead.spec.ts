import { describe, expect, it } from 'vitest';
import { PICTURE_MIN, pullPictures } from './picture-lead';

const shots = () => [
  { id: 'L1', start: 0, end: 110.6 },
  { id: 'gap', start: 110.6, end: 114.5 },
  { id: 'L2', start: 114.5, end: 118 },
];
const sections = () => [
  { start: 0, layers: [{ at: 0 }] },
  { start: 110.6, layers: [{ at: 110.6 }] },
  { start: 114.5, layers: [{ at: 114.5 }] },
];

describe('pullPictures: a line never comes in on the picture before its own', () => {
  it('brings the shot after an interlude and its first cut forward to the line\'s entrance (document 雙截棍 c044)', () => {
    const s = shots();
    const g = sections();
    const late = pullPictures(s, g, [{ shot: 'L1', show: 0 }, { shot: 'L2', show: 114.3 }]);
    expect(s[2].start).toBe(114.3);
    expect(s[1].end).toBe(114.3);
    expect(g[2].start).toBe(114.3);
    expect(g[2].layers[0].at).toBe(114.3);
    expect(late.size).toBe(0);
  });

  it('only the first line of a shot moves it, and a line after its shot starts moves nothing', () => {
    const s = shots();
    const g = sections();
    pullPictures(s, g, [{ shot: 'L2', show: 114.6 }, { shot: 'L2', show: 114.0 }]);
    expect(s[2].start).toBe(114.5);
    expect(g[2].start).toBe(114.5);
  });

  it('drops an interlude\'s beat cut the move would leave up less than PICTURE_MIN (document 雙截棍 114.196)', () => {
    const s = shots();
    const g = [...sections().slice(0, 2), { start: 113.638, layers: [] }, { start: 114.196, layers: [] }, { start: 114.5, layers: [{ at: 114.5 }] }];
    const late = pullPictures(s, g, [{ shot: 'L2', show: 114.3 }]);
    expect(g.map((x) => x.start)).toEqual([0, 110.6, 113.638, 114.3]);
    expect(late.size).toBe(0);
  });

  it('keeps a handoff\'s cut already up ahead of the shot (silk 三年後的大雪 c006): only the shot follows the line', () => {
    const s = [{ id: 'L7', start: 18, end: 35.99 }, { id: 'L8', start: 35.99, end: 39.12 }];
    const g = [{ start: 18, layers: [] }, { start: 35.016, layers: [] }, { start: 35.6, layers: [] }];
    const late = pullPictures(s, g, [{ shot: 'L7', show: 18 }, { shot: 'L8', show: 35.88 }]);
    expect(g.map((x) => x.start)).toEqual([18, 35.016, 35.6]);
    expect(s[1].start).toBe(35.88);
    expect(late.size).toBe(0);
  });

  it('never leaves the shot before up less than PICTURE_MIN: the line waits for its picture there, no later than planned', () => {
    const s = [{ id: 'L1', start: 0, end: 114.1 }, { id: 'L2', start: 114.1, end: 114.5 }, { id: 'L3', start: 114.5, end: 118 }];
    const g = [{ start: 0, layers: [] }, { start: 114.1, layers: [] }, { start: 114.5, layers: [{ at: 114.5 }] }];
    const late = pullPictures(s, g, [{ shot: 'L1', show: 0 }, { shot: 'L2', show: 114.1 }, { shot: 'L3', show: 114.3 }]);
    expect(s[2].start).toBe(+(114.1 + PICTURE_MIN).toFixed(3));
    expect(g[2].start).toBe(114.4);
    expect(late.get('L3')).toBe(114.4);
    const s2 = [{ id: 'L1', start: 0, end: 114.4 }, { id: 'L2', start: 114.4, end: 114.5 }, { id: 'L3', start: 114.5, end: 118 }];
    const late2 = pullPictures(s2, [{ start: 0, layers: [] }, { start: 114.4, layers: [] }, { start: 114.5, layers: [] }], [{ shot: 'L3', show: 114.3 }]);
    expect(s2[2].start).toBe(114.5);
    expect(late2.get('L3')).toBe(114.5);
  });
});
