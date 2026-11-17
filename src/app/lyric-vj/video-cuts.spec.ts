import { describe, expect, it } from 'vitest';
import { previousShots, sceneTake } from './video-cuts';

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

describe('sceneTake: a line that names a place shows its scene panel', () => {
  const frames: Record<string, string> = { S01: 'scene', S12: 'cutout', S14: 'scene' };
  const frameOf = (id: string) => frames[id];
  const has = () => true;
  it('the first cut of a line with a scene shot takes it, in the round window', () => {
    expect(sceneTake({ cue: 'c014', shots: ['S12', 'S01'] }, frameOf, has, false, new Set())).toEqual({ id: 'S01', mode: 'circle' });
  });
  it('a line with a blown-up word shows the panel larger, not nothing (大雪 93 s)', () => {
    expect(sceneTake({ cue: 'c022', shots: ['S14'] }, frameOf, has, true, new Set())).toEqual({ id: 'S14', mode: 'large' });
  });
  it('once per line, and only when the picture exists', () => {
    expect(sceneTake({ cue: 'c022', shots: ['S14'] }, frameOf, has, true, new Set(['c022']))).toBeUndefined();
    expect(sceneTake({ cue: 'c022', shots: ['S14'] }, frameOf, () => false, true, new Set())).toBeUndefined();
    expect(sceneTake({ cue: 'c003', shots: ['S12'] }, frameOf, has, false, new Set())).toBeUndefined();
    expect(sceneTake(undefined, frameOf, has, false, new Set())).toBeUndefined();
  });
});
