import { BetaJob, ConceptSummary } from './beta';
import { acceptBlock, adjustBlock, conceptHead, interludeLines, MAX_NOTE, redoBlock, stillLabel } from './concept';

const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'c', songId: 's', kind: 'concept', tier: 'hybrid', status: 'done', createdAt: '2026-10-28T02:00:00Z', ...o });
const summary = (o: Partial<ConceptSummary> = {}): ConceptSummary => ({ language: 'neon', languageName: '霓虹城市', font: 'Noto Sans TC', palette: [], concept: '故事', stills: [], ...o });

describe('conceptHead', () => {
  it('names the tier, counts this attempt as the server does, and gives the rest price', () => {
    const first = job({ id: 'a', createdAt: '2026-10-28T00:00:00Z', decision: 'redone' });
    const failed = job({ id: 'f', createdAt: '2026-10-28T01:00:00Z', status: 'failed' });
    const c = job({});
    expect(conceptHead(c, [first, failed, c])).toEqual({ title: '故事版的概念', attempt: 2, more: true, rest: 13.5 });
    expect(conceptHead(job({ tier: 'none' }), [job({ tier: 'none' })])).toMatchObject({ title: '文字動態版的概念', attempt: 1, rest: 1.5 });
    expect(conceptHead(job({ tier: 'img' }), [job({ tier: 'img' })]).rest).toBe(3.5);
  });
  it('allows no further try once this tier has 3 attempts', () => {
    const jobs = [job({ id: '1', createdAt: '2026-10-28T00:00:00Z', decision: 'adjusted' }), job({ id: '2', createdAt: '2026-10-28T01:00:00Z', decision: 'redone' }), job({ id: '3' })];
    expect(conceptHead(jobs[2], jobs)).toMatchObject({ attempt: 3, more: false });
    // another tier's attempts do not count
    expect(conceptHead(jobs[2], [...jobs.slice(0, 2).map((j) => ({ ...j, tier: 'img' as const })), jobs[2]])).toMatchObject({ attempt: 1, more: true });
  });
  it('counts only attempts up to this one for 第 n 次', () => {
    const c = job({ id: '1', createdAt: '2026-10-28T00:00:00Z' });
    expect(conceptHead(c, [c, job({ id: '2', createdAt: '2026-10-28T05:00:00Z', status: 'running' })]).attempt).toBe(1);
  });
});

describe('stillLabel', () => {
  it('numbers the still and reads its time from the still_<t>.png name', () => {
    expect(stillLabel('still_75.40.png', 0)).toBe('示意 1 · 1:15');
    expect(stillLabel('frame.png', 2)).toBe('示意 3');
  });
});

describe('interludeLines', () => {
  it('lists the pictures entries with their reasons', () => {
    const s = summary({ interludes: [{ start: 0, end: 12, mode: 'backdrop' }, { start: 95, end: 110.5, mode: 'pictures', reason: '回憶段落' }, { start: 200, end: 210, mode: 'pictures' }] });
    expect(interludeLines(s)).toEqual(['1:35–1:50 放插圖：回憶段落', '3:20–3:30 放插圖']);
  });
  it('says the interludes only change the backdrop when none has pictures', () => {
    expect(interludeLines(summary({ interludes: [{ start: 0, end: 12, mode: 'backdrop' }] }))).toEqual(['間奏只做背景變換']);
    expect(interludeLines(summary({ interludes: [] }))).toEqual(['間奏只做背景變換']);
  });
  it('says nothing when the summary does not record the interludes', () => {
    expect(interludeLines(summary())).toEqual([]);
  });
});

describe('acceptBlock', () => {
  const ok = { concerns: false, confirmed: false, active: false, left: 20, rest: 13.5, submitting: false };
  it('is open when nothing stops it', () => {
    expect(acceptBlock(ok)).toBeNull();
    expect(acceptBlock({ ...ok, left: null })).toBeNull();
  });
  it('waits for 我了解 when the director has concerns', () => {
    expect(acceptBlock({ ...ok, concerns: true })).toBe('勾選上方「我了解」後才能接受');
    expect(acceptBlock({ ...ok, concerns: true, confirmed: true })).toBeNull();
  });
  it('stops while a job runs, when the rest is more than what is left (in cents), and while sending', () => {
    expect(acceptBlock({ ...ok, active: true })).toBe('這首歌已經在排隊或製作中');
    expect(acceptBlock({ ...ok, left: 13.49 })).toBe('餘額不足，請聯絡管理者');
    expect(acceptBlock({ ...ok, left: 0.1 + 0.2 + 13.2 })).toBeNull();
    expect(acceptBlock({ ...ok, submitting: true })).toBe('送出中…');
  });
});

describe('adjustBlock and redoBlock', () => {
  const ok = { active: false, left: 5, submitting: false };
  it('adjust needs a note of 1–500 characters', () => {
    expect(adjustBlock({ ...ok, note: '霓虹少一點' })).toBeNull();
    expect(adjustBlock({ ...ok, note: '   ' })).toBe('填一句意見後才能送出');
    expect(adjustBlock({ ...ok, note: '字'.repeat(MAX_NOTE) })).toBeNull();
    expect(adjustBlock({ ...ok, note: '😀'.repeat(MAX_NOTE + 1) })).toBe('意見最多 500 字');
  });
  it('both stop while a job runs, when $2.5 is more than what is left, and while sending', () => {
    for (const f of [(o: typeof ok) => adjustBlock({ ...o, note: 'x' }), redoBlock]) {
      expect(f(ok)).toBeNull();
      expect(f({ ...ok, active: true })).toBe('這首歌已經在排隊或製作中');
      expect(f({ ...ok, left: 2.49 })).toBe('餘額不足，請聯絡管理者');
      expect(f({ ...ok, submitting: true })).toBe('送出中…');
    }
  });
});
