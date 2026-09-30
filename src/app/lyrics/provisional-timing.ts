import { LyricCue } from './lyric.model';

/**
 * PROVISIONAL: spreads plain-text lines evenly across the track.
 * This is a stand-in until forced alignment (lyrics ↔ audio timestamps) exists;
 * replace this function, not its callers.
 */
export function distributeEvenly(lines: string[], duration: number): LyricCue[] {
  if (!lines.length || duration <= 0) return [];
  const slot = duration / lines.length;
  return lines.map((text, i) => ({ start: i * slot, end: (i + 1) * slot, text }));
}
