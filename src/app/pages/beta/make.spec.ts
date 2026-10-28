import { BetaJob, CONCEPT_PRICE, TIER_INFO } from './beta';
import { conceptAttempts, feelingLength, makeBlock, makeBody, MakeState, refProblem, stripGrid, stripTiles } from './make';

const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'concept', tier: 'hybrid', status: 'done', createdAt: '2026-10-28T00:00:00Z', decision: 'accepted', ...o });
const state = (o: Partial<MakeState> = {}): MakeState => ({ songId: 's', tier: 'hybrid', jobs: [], active: false, left: 14.5, uploading: false, feeling: '', ...o });

describe('TIER_INFO prices', () => {
  it('carries the concept fee and the rest, adding up to the total', () => {
    expect(TIER_INFO.none).toMatchObject({ concept: 2.5, rest: 1.5, price: 4, min: 25 });
    expect(TIER_INFO.img).toMatchObject({ concept: 2.5, rest: 3.5, price: 6, min: 30 });
    expect(TIER_INFO.hybrid).toMatchObject({ concept: 2.5, rest: 13.5, price: 16, min: 45 });
    expect(CONCEPT_PRICE).toBe(2.5);
  });
});

describe('makeBody', () => {
  it('sends the tier and the refs, and leaves out an empty feeling and 交給導演', () => {
    expect(makeBody({ tier: 'none', feeling: '  ', style: null, refs: [] })).toEqual({ tier: 'none', refs: [] });
  });

  it('trims the feeling and names the style', () => {
    expect(makeBody({ tier: 'img', feeling: ' 深夜城市 \n', style: 'silkscreen', refs: ['ref-1.jpg', 'ref-3.png'] }))
      .toEqual({ tier: 'img', concept: '深夜城市', style: 'silkscreen', refs: ['ref-1.jpg', 'ref-3.png'] });
  });

  it('copies the refs, so a later change to the form cannot change a sent body', () => {
    const refs = ['ref-1.jpg'];
    const b = makeBody({ tier: 'hybrid', feeling: '', style: null, refs });
    refs.push('ref-2.jpg');
    expect(b.refs).toEqual(['ref-1.jpg']);
  });
});

describe('feelingLength', () => {
  it('counts characters the way the server does (an emoji is one)', () => {
    expect(feelingLength('宮崎駿')).toBe(3);
    expect(feelingLength('🌙夜')).toBe(2);
  });
});

describe('conceptAttempts', () => {
  it('mirrors the server: retries do not count, a concept that failed with all its retries does not count', () => {
    const jobs = [
      job({ id: 'a' }),
      job({ id: 'b', decision: 'adjusted' }),
      job({ id: 'c', status: 'failed', decision: undefined }),
      job({ id: 'c2', status: 'failed', retryOf: 'c', decision: undefined }),
      job({ id: 'd', status: 'failed', decision: undefined }),
      job({ id: 'd2', status: 'done', retryOf: 'd' }),
      job({ id: 'x', tier: 'img' }),
      job({ id: 'y', songId: 'other' }),
      job({ id: 'm', kind: 'make' }),
    ];
    expect(conceptAttempts(jobs, 's', 'hybrid')).toBe(3);
    expect(conceptAttempts(jobs, 's', 'img')).toBe(1);
    expect(conceptAttempts(jobs, 's', 'none')).toBe(0);
  });
});

describe('makeBlock', () => {
  it('lets a ready song with money make', () => {
    expect(makeBlock(state())).toBeNull();
  });

  it('waits for the running job first', () => {
    expect(makeBlock(state({ active: true, left: 0 }))).toBe('目前有工作在進行，完成後才能再製作。');
  });

  it('stops while this tier has a concept nobody decided on (another tier may go)', () => {
    const jobs = [job({ decision: undefined })];
    expect(makeBlock(state({ jobs }))).toBe('這個版本有一個概念還沒決定');
    expect(makeBlock(state({ jobs, tier: 'img' }))).toBeNull();
    expect(makeBlock(state({ jobs: [job({ decision: undefined, status: 'failed' })] }))).toBeNull();
  });

  it('stops after 3 concept attempts for the tier', () => {
    const jobs = ['a', 'b', 'c'].map((id) => job({ id }));
    expect(makeBlock(state({ jobs }))).toBe('這個版本已試過 3 次概念，請聯絡管理者');
    expect(makeBlock(state({ jobs, tier: 'none' }))).toBeNull();
  });

  it('stops when the concept fee is more than what is left, in cents', () => {
    expect(makeBlock(state({ left: 2.49 }))).toBe('餘額不足，請聯絡管理者');
    expect(makeBlock(state({ left: 2.5 }))).toBeNull();
    expect(makeBlock(state({ left: 0.1 + 2.4 }))).toBeNull();
    expect(makeBlock(state({ left: null }))).toBeNull();
  });

  it('waits for an upload and refuses a feeling over 500 characters', () => {
    expect(makeBlock(state({ uploading: true }))).toBe('參考圖上傳中，請稍候。');
    expect(makeBlock(state({ feeling: '字'.repeat(500) }))).toBeNull();
    expect(makeBlock(state({ feeling: '字'.repeat(501) }))).toBe('想要的感覺最多 500 字');
  });
});

describe('refProblem', () => {
  it('takes jpeg, png and webp up to 10 MB while fewer than 5 are there', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(refProblem({ type, size: 10_000_000 }, 4)).toBeNull();
  });

  it('says why a file is refused, in the server copy', () => {
    expect(refProblem({ type: 'image/gif', size: 10 }, 0)).toBe('請上傳 jpg、png 或 webp 圖片');
    expect(refProblem({ type: '', size: 10 }, 0)).toBe('請上傳 jpg、png 或 webp 圖片');
    expect(refProblem({ type: 'image/png', size: 10_000_001 }, 0)).toBe('圖片太大（上限 10 MB）');
    expect(refProblem({ type: 'image/png', size: 0 }, 0)).toBe('沒有收到圖片');
    expect(refProblem({ type: 'image/png', size: 10 }, 5)).toBe('參考圖最多 5 張');
  });
});

describe('style strip tiles', () => {
  it('reads the frame grid from the strip size (270 px high 16:9 frames)', () => {
    expect(stripGrid(1920, 540)).toEqual({ cols: 4, rows: 2 });
    expect(stripGrid(2400, 270)).toEqual({ cols: 5, rows: 1 });
    expect(stripGrid(960, 270)).toEqual({ cols: 2, rows: 1 });
  });

  it('falls back to one frame for an odd or unknown size', () => {
    expect(stripGrid(0, 0)).toEqual({ cols: 1, rows: 1 });
    expect(stripGrid(400, 600)).toEqual({ cols: 1, rows: 1 });
  });

  it('picks the first three frames, row by row, repeating when the strip has fewer', () => {
    expect(stripTiles({ cols: 4, rows: 2 })).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }]);
    expect(stripTiles({ cols: 2, rows: 1 })).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 0 }]);
    expect(stripTiles({ cols: 1, rows: 1 })).toEqual([{ col: 0, row: 0 }, { col: 0, row: 0 }, { col: 0, row: 0 }]);
  });
});
