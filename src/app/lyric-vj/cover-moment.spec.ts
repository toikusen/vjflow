import { describe, expect, it } from 'vitest';
import { coverLine, coverMoment } from './cover-moment';

const line = (start: number, text: string, end = start + 2) => ({ start, end, text });

describe('coverLine', () => {
  const lines = [line(1, 'ah'), line(4, '夜をこえて行こう'), line(8, '君と'), line(12, 'サビの最初の一行'), line(16, '続く行もある')];

  it('takes the first line of the first chorus', () => {
    const sections = [{ start: 0, end: 10, type: 'verse' }, { start: 20, end: 30, type: 'chorus' }, { start: 10, end: 20, type: 'chorus' }];
    expect(coverLine(lines, sections)?.text).toBe('サビの最初の一行');
  });

  it('without a chorus, takes the first line at least as long as the median', () => {
    expect(coverLine(lines)?.text).toBe('夜をこえて行こう');
    expect(coverLine(lines, [{ start: 0, end: 30, type: 'verse' }])?.text).toBe('夜をこえて行こう');
  });

  it('falls back to the median rule when the chorus has no line', () => {
    expect(coverLine(lines, [{ start: 40, end: 50, type: 'chorus' }])?.text).toBe('夜をこえて行こう');
  });

  it('counts characters, not spaces, and skips empty or zero-length lines', () => {
    const odd = [line(0, '   '), line(2, 'abcdefghi', 2), line(3, 'a b c'), line(5, 'abcd'), line(7, 'abcde')];
    expect(coverLine(odd)?.text).toBe('abcd');
  });

  it('reads lines in time order whatever order they come in', () => {
    expect(coverLine([line(9, 'later long line'), line(1, 'first long line')])?.text).toBe('first long line');
  });

  it('is undefined for a song with no words', () => {
    expect(coverLine([])).toBeUndefined();
    expect(coverLine([line(1, ' ')])).toBeUndefined();
  });
});

describe('coverMoment', () => {
  it('lands inside the line, past its entrance', () => {
    const t = coverMoment([line(10, 'only line here', 14)])!;
    expect(t).toBeGreaterThan(12);
    expect(t).toBeLessThan(14);
  });

  it('is undefined with nothing to show', () => {
    expect(coverMoment([])).toBeUndefined();
  });
});
