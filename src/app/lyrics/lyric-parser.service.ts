import { Injectable } from '@angular/core';
import { LyricCue, ParsedLyrics } from './lyric.model';
import { distributeEvenly } from './provisional-timing';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const MAX_CUE_LENGTH = 8;

/**
 * Parses pasted lyrics. LRC (`[mm:ss.xx]line`) keeps its timestamps;
 * plain text falls back to provisional even timing.
 */
export function parseLyrics(input: string, duration: number): ParsedLyrics {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const timed: { start: number; text: string }[] = [];
  for (const line of lines) {
    const tags = [...line.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const text = line.replace(TIME_TAG, '').trim();
    for (const [, mm, ss] of tags) timed.push({ start: Number(mm) * 60 + Number(ss.replace(':', '.')), text });
  }

  if (timed.length) {
    timed.sort((a, b) => a.start - b.start);
    const cues: LyricCue[] = [];
    timed.forEach((c, i) => {
      if (!c.text || c.start >= duration) return;
      const next = timed[i + 1]?.start ?? duration;
      cues.push({ start: c.start, end: Math.min(next, c.start + MAX_CUE_LENGTH, duration), text: c.text });
    });
    return { cues, timing: 'timestamped' };
  }

  // Lines like "[ar:Artist]" are LRC metadata, not lyrics.
  const plain = lines.filter((l) => !/^\[[a-z]+:.*\]$/i.test(l));
  return { cues: distributeEvenly(plain, duration), timing: 'provisional' };
}

@Injectable({ providedIn: 'root' })
export class LyricParserService {
  parse(input: string, duration: number): ParsedLyrics {
    return parseLyrics(input, duration);
  }
}
