// The alignments a song's prep left beside song.json, read for sung-times.ts: the alternate stem's passes first
// (force_main_alt, mms_alt: the ones the timing vote trusts most), then the main stem's. The vocal stem, when it is
// there, is the fallback before an even spread.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Alignment, SungCue, sungTimes, SungTimes } from '../../src/app/lyric-vj/sung-times';
import { vocalActivity } from '../../src/app/lyric-vj/timeline';
import { decode } from './media.mts';

export const ALIGNMENT_FILES = ['force_main_alt.json', 'mms_alt.json', 'force_alt.json', 'force_main.json', 'force.json'];

/** Every alignment file in the song's folder that parses, in order of trust. */
export function loadAlignments(songDir: string): Alignment[] {
  return ALIGNMENT_FILES.flatMap((f) => {
    const p = join(songDir, f);
    if (!existsSync(p)) return [];
    try {
      const d = JSON.parse(readFileSync(p, 'utf8')) as Partial<Alignment>;
      return Array.isArray(d.lines) ? [{ model: String(d.model ?? f), lines: d.lines }] : [];
    } catch {
      return [];
    }
  });
}

export interface SongForTimes { cues: (SungCue & { id: string })[]; audio?: { vocals?: string } }

/** Per-character sung times of each line, with their source, for a song at `songFile`. */
export function sungTimesOf(song: SongForTimes, songFile: string, withVoice = true): Map<string, SungTimes> {
  const dir = dirname(songFile);
  const alignments = loadAlignments(dir);
  const vocals = song.audio?.vocals;
  let voice: { active: boolean[]; fps: number } | undefined;
  const voiceOnce = () => {
    if (voice || !withVoice || !vocals || !existsSync(vocals)) return voice;
    voice = { active: vocalActivity(decode(vocals, 22050), 22050), fps: 100 };
    return voice;
  };
  const out = new Map<string, SungTimes>();
  for (const c of song.cues) {
    const first = sungTimes(c, alignments);
    // the voice is decoded only when a line needs it
    out.set(c.id, first.source === 'even' ? sungTimes(c, alignments, voiceOnce()) : first);
  }
  return out;
}
