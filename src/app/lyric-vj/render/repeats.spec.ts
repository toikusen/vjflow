import { describe, expect, it } from 'vitest';
import { foldRepeats } from './repeats';

const line = (id: string, start: number, end: number, shot: string, budget = true, text = '快使用雙截棍 哼哼哈兮') => ({ cue: { id, text, start, end }, style: { shot, budget } });

describe('foldRepeats', () => {
  it('keeps a composer repeat planned in a shot of its own as its own line (gameshow 雙截棍 c024/c025)', () => {
    const { lines, repeats } = foldRepeats([line('c024', 85.78, 88.16, 'L023'), line('c025', 88.2, 90.56, 'L024')], () => false);
    expect(lines.map((l) => [l.cue.id, l.cue.end])).toEqual([['c024', 88.16], ['c025', 90.56]]);
    expect(repeats.size).toBe(0);
  });

  it('still folds a repeat in the same shot, and any repeat outside the composer', () => {
    const same = foldRepeats([line('a', 0, 1, 'S1'), line('b', 1.2, 2, 'S1')], () => false);
    expect(same.lines.map((l) => [l.cue.id, l.cue.end])).toEqual([['a', 2]]);
    expect(same.repeats.get('a')).toEqual([1.2]);
    const old = foldRepeats([line('a', 0, 1, 'S1', false), line('b', 1.2, 2, 'S2', false)], () => false);
    expect(old.lines.length).toBe(1);
  });

  it('never folds in a chat, nor different words, nor after a gap', () => {
    expect(foldRepeats([line('a', 0, 1, 'S1'), line('b', 1.2, 2, 'S1')], () => true).lines.length).toBe(2);
    expect(foldRepeats([line('a', 0, 1, 'S1'), line('b', 1.2, 2, 'S1', true, '別的')], () => false).lines.length).toBe(2);
    expect(foldRepeats([line('a', 0, 1, 'S1'), line('b', 1.7, 2, 'S1')], () => false).lines.length).toBe(2);
  });
});
