import { Injectable } from '@angular/core';

/** Lyrics found online for a track. */
export interface LyricSearchResult {
  /** LRC text when time-synced, plain text otherwise. */
  text: string;
  synced: boolean;
  artist: string;
  title: string;
  provider: 'LRCLIB';
}

interface LrclibEntry {
  artistName: string;
  trackName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

/** LRCLIB (https://lrclib.net): free, no key, and sends `access-control-allow-origin: *`. */
const LRCLIB_SEARCH = 'https://lrclib.net/api/search';
/** Allowed length difference between the file and a database entry. */
export const MAX_DURATION_DIFF = 3;
const TIMEOUT_MS = 8000;

/** File name → search query: no extension, separators as spaces, release noise like "(Official Video)" removed. */
export function queryFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[([【「][^)\]】」]*(official|mv|m\/v|video|audio|lyric|歌詞|字幕|高音質|hd|4k)[^)\]】」]*[)\]】」]/gi, ' ')
    .replace(/[-_–—~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best entry for the track: matching length, has lyrics, synced preferred, then the closest length. */
export function pickEntry(entries: LrclibEntry[], duration: number): LrclibEntry | null {
  const usable = entries.filter((e) => !e.instrumental && Math.abs(e.duration - duration) <= MAX_DURATION_DIFF && (e.syncedLyrics?.trim() || e.plainLyrics?.trim()));
  usable.sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  return usable[0] ?? null;
}

/**
 * Looks lyrics up online before falling back to recognizing them from the vocals.
 * Only the cleaned-up file name leaves the browser, never the audio.
 */
@Injectable({ providedIn: 'root' })
export class LyricSearchService {
  /** Resolves null when nothing matches or the service is unreachable; never throws. */
  async find(fileName: string, duration: number): Promise<LyricSearchResult | null> {
    const q = queryFromFileName(fileName);
    if (!q) return null;
    try {
      const res = await fetch(`${LRCLIB_SEARCH}?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const entry = pickEntry((await res.json()) as LrclibEntry[], duration);
      if (!entry) return null;
      const synced = !!entry.syncedLyrics?.trim();
      return { text: (synced ? entry.syncedLyrics! : entry.plainLyrics!).trim(), synced, artist: entry.artistName, title: entry.trackName, provider: 'LRCLIB' };
    } catch (err) {
      console.warn('[lyrics] online lookup failed', err);
      return null;
    }
  }
}
