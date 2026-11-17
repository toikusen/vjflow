import { describe, expect, it } from 'vitest';
import { previousShots } from './video-cuts';

describe('previousShots: the shots on the cuts before a cut', () => {
  const cuts = [{ sprite: 'S23' }, { sprite: 'S17_r300' }, {}, { sprite: 'S04' }];
  const shotOf = (c?: { sprite?: string }) => c?.sprite?.replace(/_r\d+$/, '');
  it('reads nothing before the first cut and one before the second (a top seat on cut 1 or 2 threw, Codex review)', () => {
    expect(previousShots(cuts, 0, shotOf)).toEqual([]);
    expect(previousShots(cuts, 1, shotOf)).toEqual(['S23']);
  });
  it('reads the two cuts before, skipping a cut with no shot', () => {
    expect(previousShots(cuts, 2, shotOf)).toEqual(['S17', 'S23']);
    expect(previousShots(cuts, 3, shotOf)).toEqual(['S17']);
  });
});
