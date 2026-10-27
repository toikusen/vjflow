import { BetaJob, BetaSong, songStage } from './beta';

const song: BetaSong = { id: 's', userId: 'u', title: 'T', artist: '', language: 'ja', createdAt: '2026-10-27T00:00:00Z' };
const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'prep', status: 'done', createdAt: '2026-10-27T00:00:00Z', ...o });

describe('songStage', () => {
  it('waits for the preparation, then the timing', () => {
    expect(songStage(song, [])).toEqual({ step: 'preparing', label: '等待上傳' });
    expect(songStage(song, [job({ status: 'running', phase: '分離人聲' })])).toEqual({ step: 'preparing', label: '分離人聲' });
    expect(songStage(song, [job({ status: 'failed' })])).toEqual({ step: 'prepFailed' });
    expect(songStage(song, [job({})])).toEqual({ step: 'timing' });
  });

  it('a confirmed song shows each version by its latest job', () => {
    const s = { ...song, confirmedAt: '2026-10-27T01:00:00Z' };
    const jobs = [
      job({}),
      job({ id: 'a', kind: 'make', tier: 'img', status: 'failed', createdAt: '2026-10-27T02:00:00Z' }),
      job({ id: 'b', kind: 'make', tier: 'img', status: 'done', createdAt: '2026-10-27T03:00:00Z' }),
      job({ id: 'c', kind: 'make', tier: 'hybrid', status: 'running', phase: '畫故事畫面', createdAt: '2026-10-27T04:00:00Z' }),
      job({ id: 'd', kind: 'make', tier: 'none', status: 'admin', createdAt: '2026-10-27T05:00:00Z' }),
    ];
    expect(songStage(s, jobs)).toEqual({ step: 'ready', making: [{ tier: 'hybrid', label: '畫故事畫面' }], done: ['img'], held: ['none'], failed: [] });
  });
});
