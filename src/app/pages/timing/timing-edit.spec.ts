import { describe, expect, it } from 'vitest';
import { moveEdge } from './timing-edit';

const lines = () => [{ start: 1, end: 5 }, { start: 5, end: 8 }, { start: 9, end: 12 }];

describe('moveEdge', () => {
  it('pushes a back-to-back next line when the end grows, leaves it when the end shrinks', () => {
    expect(moveEdge(lines(), 0, 'end', 6, 60).slice(0, 2)).toEqual([{ start: 1, end: 6 }, { start: 6, end: 8 }]);
    expect(moveEdge(lines(), 0, 'end', 4, 60).slice(0, 2)).toEqual([{ start: 1, end: 4 }, { start: 5, end: 8 }]);
  });

  it('pushes a back-to-back previous line when the start moves earlier, leaves it when it moves later', () => {
    expect(moveEdge(lines(), 1, 'start', 4.5, 60).slice(0, 2)).toEqual([{ start: 1, end: 4.5 }, { start: 4.5, end: 8 }]);
    expect(moveEdge(lines(), 1, 'start', 6, 60).slice(0, 2)).toEqual([{ start: 1, end: 5 }, { start: 6, end: 8 }]);
  });

  it('keeps the gap before a line that is not joined, and never eats a neighbour', () => {
    expect(moveEdge(lines(), 1, 'end', 10, 60).slice(1)).toEqual([{ start: 5, end: 9 }, { start: 9, end: 12 }]);
    expect(moveEdge(lines(), 0, 'end', 20, 60)[1]).toEqual({ start: 7.9, end: 8 });
    expect(moveEdge(lines(), 2, 'start', 7, 60).slice(1)).toEqual([{ start: 5, end: 7 }, { start: 7, end: 12 }]);
  });
});

describe('snapTo', () => {
  it('lands on the nearest beat or onset within reach, else stays', async () => {
    const { snapTo } = await import('./timing-edit');
    expect(snapTo(10.1, [9.5, 10.0, 10.4], 0.15)).toBe(10.0);
    expect(snapTo(10.2, [9.5, 10.0, 10.45], 0.15)).toBe(10.2);
    expect(snapTo(3, [], 0.15)).toBe(3);
  });
});

describe('splitLine', () => {
  const line = (id: string, start: number, end: number, text: string, extra: { charStarts?: number[]; charTimed?: boolean } = {}) => ({ id, start, end, text, ...extra });

  it('keeps the left id, gives the right half the new id and splits at the playhead', async () => {
    const { splitLine } = await import('./timing-edit');
    const r = splitLine([line('a', 1, 5, '星光')], 'a', 1, 3, 'b');
    expect(r).toEqual({ ok: true, lines: [line('a', 1, 3, '星'), line('b', 3, 5, '光')] });
  });

  it('cuts on grapheme boundaries and carries per-character times to each half', async () => {
    const { splitLine } = await import('./timing-edit');
    const r = splitLine([line('a', 0, 4, '👍🏽好é', { charStarts: [0, 0, 1, 2, 2.5], charTimed: true })], 'a', 2, 1.8, 'b');
    if (!r.ok) throw new Error(r.message);
    expect(r.lines.map((l) => l.text)).toEqual(['👍🏽好', 'é']);
    expect(r.lines[0].charStarts).toEqual([0, 0, 1]);
    expect(r.lines[1].charStarts).toEqual([2, 2.5]);
  });

  it('drops the space at a cut between words, with its character time', async () => {
    const { splitLine } = await import('./timing-edit');
    const r = splitLine([line('a', 0, 4, 'hi yo', { charStarts: [0, 0.5, 1, 2, 2.5] })], 'a', 3, 1.5, 'b');
    if (!r.ok) throw new Error(r.message);
    expect(r.lines.map((l) => [l.text, l.charStarts])).toEqual([['hi', [0, 0.5]], ['yo', [2, 2.5]]]);
  });

  it('maps a caret inside an emoji to the boundary before it', async () => {
    const { graphemeIndexAt } = await import('./timing-edit');
    expect(graphemeIndexAt('a👍🏽b', 1)).toBe(1);
    expect(graphemeIndexAt('a👍🏽b', 3)).toBe(1);
    expect(graphemeIndexAt('a👍🏽b', 5)).toBe(2);
  });

  it('refuses a cut at either end or a time outside the line', async () => {
    const { splitLine } = await import('./timing-edit');
    expect(splitLine([line('a', 1, 5, '星光')], 'a', 0, 3, 'b').ok).toBe(false);
    expect(splitLine([line('a', 1, 5, '星光')], 'a', 2, 3, 'b').ok).toBe(false);
    expect(splitLine([line('a', 1, 5, '星光')], 'a', 1, 5, 'b').ok).toBe(false);
    expect(splitLine([line('a', 1, 5, '星光')], 'a', 1, NaN, 'b').ok).toBe(false);
  });
});

describe('mergeLines', () => {
  const line = (id: string, start: number, end: number, text: string) => ({ id, start, end, text });

  it('keeps repeated words and the first id', async () => {
    const { mergeLines } = await import('./timing-edit');
    expect(mergeLines([line('a', 1, 2, '啦'), line('b', 2, 3, '啦')], 'a')).toEqual({ ok: true, lines: [line('a', 1, 3, '啦啦')] });
  });

  it('puts a space only between two Latin words', async () => {
    const { mergeLines } = await import('./timing-edit');
    const r = mergeLines([line('a', 1, 2, 'hello'), line('b', 2, 3, 'world'), line('c', 3, 4, '你好')], 'a');
    if (!r.ok) throw new Error(r.message);
    expect(r.lines[0].text).toBe('hello world');
    const r2 = mergeLines(r.lines, 'a');
    if (!r2.ok) throw new Error(r2.message);
    expect(r2.lines[0].text).toBe('hello world你好');
  });

  it('refuses the last line', async () => {
    const { mergeLines } = await import('./timing-edit');
    expect(mergeLines([line('a', 1, 2, 'x')], 'a').ok).toBe(false);
  });
});

describe('shiftAll', () => {
  it('moves every line and its character times, without mutating the input', async () => {
    const { shiftAll } = await import('./timing-edit');
    const input = [{ id: 'a', start: 1, end: 2, text: 'x', charStarts: [1.5] }];
    expect(shiftAll(input, 0.5, 10)).toEqual({ ok: true, lines: [{ id: 'a', start: 1.5, end: 2.5, text: 'x', charStarts: [2] }] });
    expect(input[0].start).toBe(1);
  });

  it('refuses the whole shift when any line would leave the song', async () => {
    const { shiftAll } = await import('./timing-edit');
    expect(shiftAll([{ start: 0.1, end: 1 }], -0.2, 10).ok).toBe(false);
    expect(shiftAll([{ start: 9, end: 9.9 }], 0.2, 10).ok).toBe(false);
    expect(shiftAll([{ start: 1, end: 2 }], NaN, 10).ok).toBe(false);
  });
});
