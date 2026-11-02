import { describe, expect, it } from 'vitest';
import { reflow } from './timing-edit';
import { localChips, localTag, peaksOf } from './timing-view';

describe('reflow', () => {
  const ordered = (l: { start: number; end: number }[]) => l.every((c, i) => c.end > c.start && (!i || c.start > l[i - 1].start) && (!l[i + 1] || c.end <= l[i + 1].start));
  const line = (id: string, start: number, end = start + 2) => ({ id, start, end });

  it('leaves lines that are already fine alone', () => {
    const list = [line('a', 1), line('b', 5), line('c', 9)];
    expect(reflow(list, 100)).toEqual(list);
  });
  it('puts a run that overran a fixed line back in front of it', () => {
    const got = reflow([line('a', 30), line('b', 41), line('c', 44), line('d', 40)], 100, (c) => c.id === 'a' || c.id === 'd');
    expect(got.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(got[0].start).toBe(30);
    expect(got[3].start).toBe(40);
    expect(ordered(got)).toBe(true);
  });
  it('pushes on a line the moved line landed past', () => {
    const got = reflow([line('a', 30), line('b', 25), line('c', 70)], 100, (c) => c.id === 'a');
    expect(got[0].start).toBe(30);
    expect(got[1].start).toBeCloseTo(30.15);
    expect(got[2].start).toBe(70);
    expect(ordered(got)).toBe(true);
  });
  it('keeps every line inside the song, past its end included', () => {
    const got = reflow([line('a', 90), line('b', 104), line('c', 109)], 100);
    expect(got).toHaveLength(3);
    expect(got.at(-1)!.end).toBeLessThanOrEqual(100);
    expect(got.at(-1)!.start).toBeLessThan(100 - 0.15);
    expect(ordered(got)).toBe(true);
  });
  it('fits more lines than the song has room for at the usual gap', () => {
    const got = reflow(Array.from({ length: 300 }, (_, i) => line(`l${i}`, i)), 12);
    expect(got).toHaveLength(300);
    expect(got.every((c, i) => !i || c.start > got[i - 1].start)).toBe(true);
    expect(got.at(-1)!.start).toBeLessThan(12);
  });
});

describe('local copy', () => {
  it('names a line by where its time came from', () => {
    expect(localTag('yellow', { listening: false, verified: false }).label).toBe('估算的');
    expect(localTag('ok', { listening: false, verified: true }).label).toBe('已對過');
    expect(localTag('ok', { listening: false, verified: false }).label).toBe('歌詞檔的時間');
    expect(localTag('ok', { listening: true, verified: true }).tone).toBe('now');
  });
  it('reports no check that did not run', () => {
    expect(localChips({ yellow: 2, ok: 3 }).map((c) => c.label)).toEqual(['2 句是估算的', '3 句有時間']);
  });
});

describe('peaksOf', () => {
  it('takes the loudest sample of each 10 ms', () => {
    const samples = new Float32Array(250);
    samples[3] = -0.5;
    samples[120] = 0.25;
    expect([...peaksOf(samples, 10000)]).toEqual([0.5, 0.25]);
  });
});
