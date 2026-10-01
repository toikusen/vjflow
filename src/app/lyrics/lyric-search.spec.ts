import { LyricSearchService, pickEntry, queryFromFileName } from './lyric-search.service';

const entry = (overrides: Partial<Parameters<typeof pickEntry>[0][number]> = {}) => ({
  artistName: 'yosugala',
  trackName: 'indigo',
  duration: 230,
  instrumental: false,
  syncedLyrics: '[00:00.79] 色褪せた空',
  plainLyrics: '色褪せた空',
  ...overrides,
});

describe('queryFromFileName', () => {
  it('drops the extension, separators and release noise', () => {
    expect(queryFromFileName('indigo - yosugala.mp3')).toBe('indigo yosugala');
    expect(queryFromFileName('YOASOBI「夜に駆ける」 Official Music Video.m4a')).toBe('YOASOBI「夜に駆ける」 Official Music Video');
    expect(queryFromFileName('Artist_Song (Official Video).wav')).toBe('Artist Song');
    expect(queryFromFileName('歌手 - 歌名【MV】.mp3')).toBe('歌手 歌名');
  });
});

describe('pickEntry', () => {
  it('keeps only entries whose length matches the audio', () => {
    expect(pickEntry([entry({ duration: 242 })], 230)).toBeNull();
    expect(pickEntry([entry({ duration: 232.5 })], 230)).not.toBeNull();
  });

  it('prefers synced lyrics, then the closest length', () => {
    const plain = entry({ syncedLyrics: null, duration: 230 });
    const synced = entry({ duration: 231.5 });
    expect(pickEntry([plain, synced], 230)).toBe(synced);
    const closer = entry({ duration: 230.2 });
    expect(pickEntry([synced, closer], 230)).toBe(closer);
  });

  it('skips instrumentals and empty lyrics', () => {
    expect(pickEntry([entry({ instrumental: true }), entry({ syncedLyrics: ' ', plainLyrics: '' })], 230)).toBeNull();
  });
});

describe('LyricSearchService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns synced lyrics with their source', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([entry({ duration: 300 }), entry()])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new LyricSearchService().find('indigo - yosugala.mp3', 230.008);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('q=indigo%20yosugala');
    expect(result).toEqual({ text: '[00:00.79] 色褪せた空', synced: true, artist: 'yosugala', title: 'indigo', provider: 'LRCLIB' });
  });

  it('falls back to plain lyrics when no synced version exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([entry({ syncedLyrics: null })]))));
    expect((await new LyricSearchService().find('a.mp3', 230))?.synced).toBe(false);
  });

  it('resolves null instead of throwing when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await new LyricSearchService().find('a.mp3', 230)).toBeNull();
  });
});
