import { formatTime, ReportDraft, validateReport } from './report-form.component';

const draft = (o: Partial<ReportDraft>): ReportDraft => ({ ok: false, marks: [], suggestion: '', action: 'none', ...o });
const mark = (o: Partial<ReportDraft['marks'][number]> = {}) => ({ at: 1, category: 'lyrics' as const, note: '', ...o });

describe('formatTime', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(754.2)).toBe('12:34');
  });

  it('treats a bad value as zero', () => {
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('validateReport', () => {
  it('accepts a plain 沒問題, with or without a note', () => {
    expect(validateReport(draft({ ok: true }))).toBeNull();
    expect(validateReport(draft({ ok: true, suggestion: '很好' }))).toBeNull();
  });

  it('a problem report needs a mark or a suggestion', () => {
    expect(validateReport(draft({}))).toBe('請標出哪裡有問題，或寫下建議');
    expect(validateReport(draft({ suggestion: '   ' }))).toBe('請標出哪裡有問題，或寫下建議');
    expect(validateReport(draft({ suggestion: '字太小' }))).toBeNull();
    expect(validateReport(draft({ marks: [mark()] }))).toBeNull();
  });

  it('only 只回報 can be sent for now', () => {
    expect(validateReport(draft({ ok: true, action: 'fix' }))).toBe('修正與重做即將開放');
    expect(validateReport(draft({ ok: true, action: 'redo' }))).toBe('修正與重做即將開放');
  });

  it('every mark needs one category', () => {
    expect(validateReport(draft({ marks: [mark({ category: null })] }))).toBe('每個標記請選一個類別');
  });

  it('checks mark times against each other and the video length', () => {
    expect(validateReport(draft({ marks: [mark({ at: -1 })] }))).toBe('標記的時間不正確');
    expect(validateReport(draft({ marks: [mark({ at: 5, end: 4 })] }))).toBe('標記的時間不正確');
    expect(validateReport(draft({ marks: [mark({ at: 5, end: 5 })] }))).toBeNull();
    expect(validateReport(draft({ marks: [mark({ at: 5, end: 11 })] }), 10)).toBe('標記超出影片長度');
    expect(validateReport(draft({ marks: [mark({ at: 10 })] }), 10)).toBeNull();
    expect(validateReport(draft({ marks: [mark({ at: 999 })] }))).toBeNull();
  });

  it('keeps to the text and mark limits', () => {
    const marks = Array.from({ length: 21 }, () => mark());
    expect(validateReport(draft({ marks }))).toBe('最多標 20 處');
    expect(validateReport(draft({ marks: marks.slice(0, 20) }))).toBeNull();
    expect(validateReport(draft({ suggestion: 'a'.repeat(1001) }))).toBe('建議最多 1000 字');
    expect(validateReport(draft({ suggestion: ` ${'a'.repeat(1000)} ` }))).toBeNull();
    expect(validateReport(draft({ marks: [mark({ note: 'a'.repeat(1001) })] }))).toBe('備註最多 1000 字');
  });
});
