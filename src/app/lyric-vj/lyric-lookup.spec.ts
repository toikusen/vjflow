import { describe, expect, it } from 'vitest';
import { LOOKUP_URL, LyricHit, readHits, searchLyrics, syncedMatch, titleParts } from './lyric-lookup';

const rec = (over: object = {}) => ({ id: 1, trackName: '歌', artistName: '人', albumName: '碟', duration: 200, instrumental: false, plainLyrics: '甲\n乙', syncedLyrics: '[00:01.00]甲\n[00:05.00]乙', ...over });
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

describe('readHits', () => {
  it('reads a record', () => {
    expect(readHits([rec()])).toEqual([{ id: 1, track: '歌', artist: '人', album: '碟', duration: 200, synced: '[00:01.00]甲\n[00:05.00]乙', plain: '甲\n乙' }]);
  });

  it('puts synced entries first and leaves out what cannot be used', () => {
    const got = readHits([rec({ id: 1, syncedLyrics: null }), rec({ id: 2 }), rec({ id: 3, instrumental: true }), rec({ id: 4, syncedLyrics: null, plainLyrics: null }), rec({ id: 5, trackName: 7 }), rec({ id: 'x' }), null, 'x']);
    expect(got.map((h) => h.id)).toEqual([2, 1]);
  });

  it('treats a synced text it cannot read as plain', () => {
    expect(readHits([rec({ syncedLyrics: '[00:99.00]甲' })])[0].synced).toBeUndefined();
    expect(readHits([rec({ syncedLyrics: '沒有時間' })])[0].synced).toBeUndefined();
  });

  it('strips what must not reach a line, and caps what is far too long', () => {
    const got = readHits([rec({ trackName: '歌‮名\u0007', plainLyrics: 'x'.repeat(40001), syncedLyrics: '[00:01.00]甲‮' })])[0];
    expect(got.track).toBe('歌名');
    expect(got.plain).toBeUndefined();
    expect(got.synced).toBe('[00:01.00]甲');
    expect(readHits([rec({ trackName: 'n'.repeat(500) })])[0].track.length).toBe(200);
  });

  it('refuses a body that is not a list', () => {
    expect(() => readHits({ a: 1 })).toThrow('看不懂');
    expect(() => readHits(null)).toThrow('看不懂');
  });

  it('shows no more than ten', () => {
    expect(readHits(Array.from({ length: 20 }, (_, i) => rec({ id: i + 1 }))).length).toBe(10);
  });
});

describe('searchLyrics', () => {
  it('sends the title and artist and nothing else about the visitor', async () => {
    const calls: [string, RequestInit][] = [];
    await searchLyrics(' 世界 ', ' Ado ', (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return json([rec()]);
    }) as typeof fetch);
    const [url, init] = calls[0];
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(LOOKUP_URL);
    expect([...u.searchParams.keys()]).toEqual(['track_name', 'artist_name']);
    expect(u.searchParams.get('track_name')).toBe('世界');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(Object.keys(init.headers as object)).toEqual(['Lrclib-Client']);
  });

  it('leaves the artist out when it is blank', async () => {
    let url = '';
    await searchLyrics('歌', ' ', (async (u: string) => ((url = u), json([]))) as typeof fetch);
    expect(new URL(url).searchParams.has('artist_name')).toBe(false);
  });

  it('honours Retry-After in what it says', async () => {
    const f = (async () => json({}, { status: 429, headers: { 'retry-after': '30' } })) as unknown as typeof fetch;
    await expect(searchLyrics('歌', '', f)).rejects.toThrow('30 秒');
  });

  it('turns failures into something a person can read', async () => {
    await expect(searchLyrics('歌', '', (async () => { throw new TypeError('x'); }) as typeof fetch)).rejects.toThrow('連不上');
    await expect(searchLyrics('歌', '', (async () => json({}, { status: 503 })) as unknown as typeof fetch)).rejects.toThrow('503');
    await expect(searchLyrics('歌', '', (async () => new Response('<html>')) as unknown as typeof fetch)).rejects.toThrow('看不懂');
  });
});

describe('titleParts', () => {
  it('reads the form the title field asks for', () => {
    expect(titleParts(' Ado - 世界のつづき ')).toEqual({ track: '世界のつづき', artist: 'Ado' });
  });
  it('takes a title with no artist as a title', () => {
    expect(titleParts('mix')).toEqual({ track: 'mix', artist: '' });
    expect(titleParts('')).toEqual({ track: '', artist: '' });
  });
});

describe('syncedMatch', () => {
  const hit = (id: number, duration: number, synced?: string): LyricHit => ({ id, track: 'x', artist: '', album: '', duration, synced });
  const mine = ['どうして あの日', '遊んだ海の', 'Hello, World!'];
  const theirs = '[00:01.00]どうして、あの日\n[00:03.00]遊んだ海の\n[00:05.00]hello world';
  it('finds the entry that is these lyrics, whatever the punctuation', () => {
    expect(syncedMatch([hit(1, 200, theirs)], mine, 200)?.id).toBe(1);
  });
  it('turns down a song that only shares the title', () => {
    expect(syncedMatch([hit(1, 200, '[00:01.00]別的歌\n[00:03.00]別的詞')], mine, 200)).toBeUndefined();
  });
  it('turns down an entry with no times', () => {
    expect(syncedMatch([hit(1, 200)], mine, 200)).toBeUndefined();
  });
  it('prefers the entry nearest the audio among equals', () => {
    expect(syncedMatch([hit(1, 230, theirs), hit(2, 204, theirs)], mine, 200)?.id).toBe(2);
  });
});
