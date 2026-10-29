import { TestBed } from '@angular/core/testing';
import { BetaJob, BetaSong, NOT_FIXABLE } from './beta';
import { actionAfterMarks, draftKey, fixBody, ReportFormComponent, formatTime, hasDraft, packDraft, ReportDraft, sendLabel, StoredDraft, unpackDraft, validateReport } from './report-form.component';

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

  it('a fix needs marks the server can fix: pictures on 插圖版, timing on any tier', () => {
    expect(validateReport(draft({ marks: [mark({ category: 'picture' })], action: 'fix' }), 10, 'img')).toBeNull();
    expect(validateReport(draft({ marks: [mark({ category: 'picture' })], action: 'fix' }), 10, 'hybrid')).toBe(NOT_FIXABLE);
    expect(validateReport(draft({ marks: [mark({ category: 'timing' })], action: 'fix' }), 10, 'none')).toBeNull();
    expect(validateReport(draft({ marks: [mark({ category: 'timing' }), mark({ category: 'picture' })], action: 'fix' }), 10, 'img')).toBe(NOT_FIXABLE);
    expect(validateReport(draft({ marks: [mark()], action: 'fix' }), 10, 'img')).toBe(NOT_FIXABLE);
    expect(validateReport(draft({ suggestion: 'x', action: 'fix' }), 10, 'img')).toBe(NOT_FIXABLE);
    // a mark without a category is reported as such before the fix rule
    expect(validateReport(draft({ marks: [mark({ category: null })], action: 'fix' }), 10, 'img')).toBe('每個標記請選一個類別');
  });

  it('a redo is sent like any report', () => {
    expect(validateReport(draft({ marks: [mark()], action: 'redo' }), 10, 'none')).toBeNull();
    expect(validateReport(draft({ suggestion: '整首換個方向', action: 'redo' }))).toBeNull();
    expect(validateReport(draft({ action: 'redo' }))).toBe('請標出哪裡有問題，或寫下建議');
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

  it('allows half a second past the video length, like the server', () => {
    expect(validateReport(draft({ marks: [mark({ at: 10.5 })] }), 10)).toBeNull();
    expect(validateReport(draft({ marks: [mark({ at: 9, end: 10.4 })] }), 10)).toBeNull();
    expect(validateReport(draft({ marks: [mark({ at: 10.6 })] }), 10)).toBe('標記超出影片長度');
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

describe('report draft storage (survives the trip to the timing editor)', () => {
  const stored: StoredDraft = { verdict: 'issue', marks: [{ at: 12.3, end: 15, category: 'timing', note: '晚了' }, { at: 40, category: null, note: '' }], suggestion: '整體早 0.2 秒', action: 'fix' };

  it('keys the draft by job id', () => {
    expect(draftKey('m1')).toBe('report:m1');
  });

  it('round-trips verdict, marks (with their end and category), suggestion and action', () => {
    expect(unpackDraft(packDraft(stored))).toEqual(stored);
  });

  it('an untouched form stores nothing', () => {
    expect(packDraft({ verdict: null, marks: [], suggestion: '', action: 'none' })).toBeNull();
    expect(packDraft({ verdict: 'ok', marks: [], suggestion: '', action: 'none' })).not.toBeNull();
  });

  it('drops a missing, malformed or foreign draft instead of throwing, and cleans what it can keep', () => {
    expect(unpackDraft(null)).toBeNull();
    expect(unpackDraft('')).toBeNull();
    expect(unpackDraft('{not json')).toBeNull();
    expect(unpackDraft('[1,2]')).toBeNull();
    expect(unpackDraft(JSON.stringify({ verdict: 'maybe', marks: [{ at: 'x' }, { at: 3, category: 'nope', end: -1 }], suggestion: 7, action: 'delete' })))
      .toEqual({ verdict: null, marks: [{ at: 3, category: null, note: '' }], suggestion: '', action: 'none' });
  });

  it('hasDraft reads the given storage and is false when it throws', () => {
    const store = new Map<string, string>([[draftKey('m1'), packDraft(stored)!]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null };
    expect(hasDraft('m1', storage)).toBe(true);
    expect(hasDraft('m2', storage)).toBe(false);
    expect(hasDraft('m1', { getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(hasDraft('m1', null)).toBe(false);
  });
});

describe('sendLabel and fixBody', () => {
  it('names the action on the button; 沒問題 always sends plainly', () => {
    expect(sendLabel('none', false)).toBe('送出回報');
    expect(sendLabel('fix', false)).toBe('送出回報並修正');
    expect(sendLabel('redo', false)).toBe('送出回報，去製作新版本');
    expect(sendLabel('fix', true)).toBe('送出回報');
  });

  it('explains what the fix does and that the old version stays', () => {
    expect(fixBody('picture')).toContain('圖片拿掉');
    expect(fixBody('timing')).toContain('歌詞時間');
    expect(fixBody('timing')).toContain('原本的版本保留');
    expect(fixBody(undefined)).toBe(fixBody('picture'));
  });
});

describe('actionAfterMarks', () => {
  const m = (...c: (string | null)[]) => c.map((category) => ({ category: category as 'timing' | null }));

  it('drops 修正 only when the named marks no longer allow it', () => {
    expect(actionAfterMarks('fix', m('timing'), 'none')).toBe('fix');
    expect(actionAfterMarks('fix', m('timing', 'lyrics'), 'none')).toBe('none');
    expect(actionAfterMarks('fix', m('picture'), 'none')).toBe('none');
    expect(actionAfterMarks('fix', m('picture'), 'img')).toBe('fix');
    expect(actionAfterMarks('redo', m('lyrics'), 'none')).toBe('redo');
  });

  it('keeps 修正 while a new mark has no category yet', () => {
    expect(actionAfterMarks('fix', m('timing', null), 'none')).toBe('fix');
    expect(actionAfterMarks('fix', [], 'none')).toBe('fix');
  });
});

describe('ReportFormComponent draft', () => {
  const job = { id: 'm1', songId: 's', kind: 'make', tier: 'none', status: 'done', createdAt: '2026-10-27T00:00:00Z' } as BetaJob;
  const song = { id: 's', userId: 'u', title: 'T', artist: '', language: 'ja', createdAt: '2026-10-27T00:00:00Z' } as BetaSong;
  const settle = () => new Promise((r) => setTimeout(r));
  const mount = async (active = false) => {
    const f = TestBed.createComponent(ReportFormComponent);
    f.componentRef.setInput('job', job);
    f.componentRef.setInput('song', song);
    f.componentRef.setInput('active', active);
    await f.whenStable();
    return f;
  };
  const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  const click = async (f: Awaited<ReturnType<typeof mount>>, text: string) => {
    button(f.nativeElement, text).click();
    await f.whenStable();
    await settle();
    await f.whenStable();
  };

  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('stores a new draft after 再回報一次 even when it repeats the report just sent', async () => {
    const sent = { id: 'f1', jobId: 'm1', ok: true, marks: [], suggestion: '', action: 'none', createdAt: '2026-10-28T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => (init?.method === 'POST' ? sent : [sent]) })));
    const f = await mount();
    await click(f, '沒問題');
    expect(sessionStorage.getItem(draftKey('m1'))).not.toBeNull();
    await click(f, '送出');
    expect(sessionStorage.getItem(draftKey('m1'))).toBeNull();
    await click(f, '再回報一次');
    await click(f, '沒問題');
    expect(unpackDraft(sessionStorage.getItem(draftKey('m1')))?.verdict).toBe('ok');
  });

  it('keeps a restored 修正 while a job runs, shown off with its reason', async () => {
    const draft: StoredDraft = { verdict: 'issue', marks: [{ at: 3, category: 'timing', note: '' }], suggestion: '', action: 'fix' };
    sessionStorage.setItem(draftKey('m1'), packDraft(draft)!);
    const f = await mount(true);
    const fix = button(f.nativeElement, '修正');
    expect(fix.getAttribute('aria-checked')).toBe('true');
    expect(fix.getAttribute('aria-disabled')).toBe('true');
    expect(fix.textContent).toContain('這首歌已經在排隊或製作中');
    expect(unpackDraft(sessionStorage.getItem(draftKey('m1')))?.action).toBe('fix');
  });
});
