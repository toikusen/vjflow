import { BetaJob, CONCEPT_PRICE, TIER_INFO } from './beta';
import { conceptAttempts, defaultTier, feelingLength, makeBlock, makeBody, MakeState, pendingConcepts, refProblem, rootOf, stripGrid, stripTiles, timingSaveWarning } from './make';

const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'concept', tier: 'hybrid', status: 'done', createdAt: '2026-10-28T00:00:00Z', decision: 'accepted', ...o });
const state = (o: Partial<MakeState> = {}): MakeState => ({ songId: 's', tier: 'hybrid', jobs: [], active: false, left: 20, uploading: false, submitting: false, feeling: '', ...o });

describe('TIER_INFO prices', () => {
  it('carries the concept fee and the rest, adding up to the total', () => {
    // concept 16 + make 12 / 21 / 32 min (stepsMin), the sum the two confirm dialogs state
    expect(TIER_INFO.none).toMatchObject({ concept: 2.5, rest: 1.5, price: 4, min: 28 });
    expect(TIER_INFO.img).toMatchObject({ concept: 2.5, rest: 3.5, price: 6, min: 37 });
    expect(TIER_INFO.hybrid).toMatchObject({ concept: 2.5, rest: 13.5, price: 16, min: 48 });
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

  it('follows a retry chain to its root: a success at any depth counts the chain once, a chain that all failed not at all', () => {
    const chain = [
      job({ id: 'a', status: 'failed', decision: undefined }),
      job({ id: 'b', status: 'failed', retryOf: 'a', auto: true, decision: undefined }),
      job({ id: 'c', status: 'done', retryOf: 'b', decision: undefined }),
    ];
    expect(conceptAttempts(chain, 's', 'hybrid')).toBe(1);
    expect(conceptAttempts(chain.slice(0, 2), 's', 'hybrid')).toBe(0);
    // a retry whose root is missing from the list is a chain of its own
    expect(conceptAttempts(chain.slice(2), 's', 'hybrid')).toBe(1);
    expect(rootOf(chain, chain[2])).toBe('a');
  });
});

describe('defaultTier', () => {
  it('is the first tier without a result, unless a concept awaits a decision: then that tier', () => {
    expect(defaultTier([], 's', [])).toBe('none');
    expect(defaultTier([], 's', ['none'])).toBe('img');
    expect(defaultTier([], 's', ['none', 'img', 'hybrid'])).toBe('none');
    const pending = job({ id: 'c', tier: 'hybrid', decision: undefined });
    expect(defaultTier([pending], 's', [])).toBe('hybrid');
    // decided, running or another song's concepts do not pull the default
    expect(defaultTier([job({ tier: 'hybrid' }), job({ tier: 'img', status: 'running', decision: undefined }), { ...pending, songId: 'x' }], 's', [])).toBe('none');
  });
});

describe('timingSaveWarning', () => {
  it('warns only while a finished concept of this song awaits a decision, naming the version and the concept fee', () => {
    const pending = job({ id: 'c', tier: 'hybrid', decision: undefined });
    expect(timingSaveWarning([pending], 's')).toEqual({
      title: '儲存後，待確認的概念要重新產生',
      body: '這首歌有一個故事版的概念還在等你決定。歌詞時間儲存後，那個概念就不能再接受，要重新產生概念（$2.5）才能製作。現在儲存不會扣款。',
    });
    expect(timingSaveWarning([job({ id: 'c', tier: 'img', decision: undefined })], 's')?.body).toContain('插圖版的概念');
    // decided, unfinished or another song's concepts need no warning
    expect(timingSaveWarning([], 's')).toBeNull();
    expect(timingSaveWarning([job({ decision: 'accepted' })], 's')).toBeNull();
    expect(timingSaveWarning([job({ decision: undefined, status: 'running' })], 's')).toBeNull();
    expect(timingSaveWarning([{ ...pending, songId: 'x' }], 's')).toBeNull();
  });

  it('names every pending version when more than one concept waits (one per version is possible)', () => {
    const none = job({ id: 'n', tier: 'none', decision: undefined, createdAt: '2026-10-28T01:00:00Z' });
    const img = job({ id: 'i', tier: 'img', decision: undefined, createdAt: '2026-10-28T02:00:00Z' });
    expect(timingSaveWarning([none, img], 's')?.body).toBe('這首歌有 2 個概念（插圖版、文字動態版）還在等你決定。歌詞時間儲存後，那些概念就不能再接受，要重新產生概念（每個 $2.5）才能製作。現在儲存不會扣款。');
  });
});

describe('pendingConcepts', () => {
  it('lists every finished, undecided concept of the song, newest first', () => {
    const none = job({ id: 'n', tier: 'none', decision: undefined, createdAt: '2026-10-28T01:00:00Z' });
    const img = job({ id: 'i', tier: 'img', decision: undefined, createdAt: '2026-10-28T02:00:00Z' });
    const jobs = [none, img, job({ id: 'd', decision: 'accepted' }), job({ id: 'r', decision: undefined, status: 'running' }), { ...img, id: 'x', songId: 'x' }];
    expect(pendingConcepts(jobs, 's').map((j) => j.id)).toEqual(['i', 'n']);
    expect(pendingConcepts([], 's')).toEqual([]);
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

  it('stops when the whole version (concept and make) costs more than what is left, in cents, naming the total', () => {
    expect(makeBlock(state({ left: 15.99 }))).toBe('餘額不足以完成這個版本（需 $16），請聯絡管理者');
    expect(makeBlock(state({ left: 16 }))).toBeNull();
    expect(makeBlock(state({ left: 0.1 + 15.9 }))).toBeNull();
    expect(makeBlock(state({ left: null }))).toBeNull();
    // enough for the concept alone is not enough: the accept would be refused afterwards
    expect(makeBlock(state({ left: 3 }))).toBe('餘額不足以完成這個版本（需 $16），請聯絡管理者');
    expect(makeBlock(state({ left: 4, tier: 'none' }))).toBeNull();
    expect(makeBlock(state({ left: 3.99, tier: 'none' }))).toBe('餘額不足以完成這個版本（需 $4），請聯絡管理者');
    expect(makeBlock(state({ left: 5.99, tier: 'img' }))).toBe('餘額不足以完成這個版本（需 $6），請聯絡管理者');
  });

  it('stays off while the make request is on its way, so a second click sends nothing', () => {
    expect(makeBlock(state({ submitting: true }))).toBe('送出中…');
    expect(makeBlock(state({ submitting: true, active: true }))).toBe('目前有工作在進行，完成後才能再製作。');
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
