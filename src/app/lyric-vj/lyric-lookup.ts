// The public lyric database LRCLIB, called from the browser. Only the title and artist typed leave the tab. What comes
// back is someone else's text: every field is checked and cleaned here and shown only as plain text.
import { cleanText, MAX_LYRIC_CHARS, parseLyrics } from './free-lyrics';

export const LOOKUP_URL = 'https://lrclib.net/api/search';
/** LRCLIB asks clients to name themselves; browsers may not set User-Agent, so it takes this header instead. */
const CLIENT = 'vjflow-free/0.1';
const TIMEOUT_MS = 12000;
const MAX_HITS = 10;
const MAX_NAME = 200;

export interface LyricHit {
  id: number;
  track: string;
  artist: string;
  album: string;
  duration: number;
  /** LRC text, when the entry has usable times. */
  synced?: string;
  plain?: string;
}

const name = (v: unknown) => (typeof v === 'string' ? cleanText(v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '');
const lyric = (v: unknown) => (typeof v === 'string' && v.length <= MAX_LYRIC_CHARS && v.trim() ? cleanText(v) : undefined);
const syncedOk = (text: string | undefined) => {
  if (!text) return undefined;
  try {
    return parseLyrics(text).lines.some((l) => l.start !== undefined) ? text : undefined;
  } catch {
    return undefined;
  }
};

/** The usable entries of a response, whatever shape it arrived in: synced ones first. */
export function readHits(body: unknown): LyricHit[] {
  if (!Array.isArray(body)) throw new Error('歌詞庫的回應看不懂，請稍後再試。');
  const hits = body.flatMap((r: unknown): LyricHit[] => {
    const x = (r ?? {}) as Record<string, unknown>;
    if (typeof x !== 'object' || x['instrumental'] === true || !Number.isSafeInteger(x['id'])) return [];
    const [synced, plain] = [syncedOk(lyric(x['syncedLyrics'])), lyric(x['plainLyrics'])];
    const track = name(x['trackName']);
    if (!track || (!synced && !plain)) return [];
    return [{ id: x['id'] as number, track, artist: name(x['artistName']), album: name(x['albumName']), duration: Number.isFinite(x['duration']) ? (x['duration'] as number) : 0, synced, plain }];
  });
  return hits.sort((a, b) => Number(!!b.synced) - Number(!!a.synced)).slice(0, MAX_HITS);
}

/** The form's 「歌手 - 歌名」 as a query; with no separator the whole text is the title. */
export function titleParts(title: string) {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title.trim());
  return m ? { track: m[2], artist: m[1] } : { track: title.trim(), artist: '' };
}

/** Share of the pasted lines an entry must also have: the title came from a file name, so it proves nothing by itself. */
const SAME_SONG = 0.5;
const bare = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The synced entry that is the lyrics the person pasted, if there is one: most lines in common, then nearest in length. */
export function syncedMatch(hits: readonly LyricHit[], pasted: readonly string[], seconds: number): LyricHit | undefined {
  const mine = pasted.map(bare).filter(Boolean);
  const scored = hits.flatMap((hit) => {
    if (!hit.synced) return [];
    const theirs = new Set(parseLyrics(hit.synced).lines.map((l) => bare(l.text)));
    const share = mine.filter((t) => theirs.has(t)).length / Math.max(1, mine.length);
    return share >= SAME_SONG ? [{ hit, share, off: Math.abs(hit.duration - seconds) }] : [];
  });
  return scored.sort((a, b) => b.share - a.share || a.off - b.off)[0]?.hit;
}

/** Searches by title and artist. Throws a message fit to show when it fails. */
export async function searchLyrics(title: string, artist: string, fetcher: typeof fetch = fetch.bind(globalThis)): Promise<LyricHit[]> {
  const query = new URLSearchParams({ track_name: title.trim(), ...(artist.trim() ? { artist_name: artist.trim() } : {}) });
  let res: Response;
  try {
    res = await fetcher(`${LOOKUP_URL}?${query}`, { headers: { 'Lrclib-Client': CLIENT }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error('連不上歌詞庫，請檢查網路或稍後再試。');
  }
  if (res.status === 429) throw new Error(`歌詞庫請求太頻繁，請等 ${Number(res.headers.get('retry-after')) || 60} 秒後再試。`);
  if (!res.ok) throw new Error(`歌詞庫暫時無法使用（${res.status}），請稍後再試。`);
  return readHits(await res.json().catch(() => null));
}
