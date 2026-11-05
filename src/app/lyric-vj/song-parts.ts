// Which part of the song each line is sung in, for a world that prints it (the thermal receipt's 段落 column, and its
// TOTAL, which is the chorus). One rule for every song: the choruses its lyric repeats show (structure.ts, which needs no
// stored sections and so works for a free song from timed lyrics alone); where the repeats find no chorus, the song's own
// stored sections. Never a per-song list.
import { analyzeStructure, SectionKind } from './structure';
import type { SongTimeline } from './timeline';
import { PART_LABELS } from './labels';

export interface LinePart {
  kind: SectionKind;
  chorus: boolean;
  /** The part's name as a receipt prints it in its 段落 column. */
  label: string;
  /** The stretch of the song this part runs, s (its 小計 on a receipt), and which run of parts it is, 0 up. */
  from: number;
  to: number;
  run: number;
}

/** The 段落 column's words in Chinese, one a kind of part (every language's: labels.ts PART_LABELS). */
export const PART_LABEL = Object.fromEntries(Object.entries(PART_LABELS).map(([k, v]) => [k, v.zh])) as Record<SectionKind, string>;
const KINDS = new Set<string>(Object.keys(PART_LABEL));

type Song = { cues: Pick<SongTimeline['cues'][number], 'id' | 'start' | 'end' | 'text'>[]; duration: number } & Partial<Pick<SongTimeline, 'sections' | 'energy' | 'energyFps' | 'title'>>;

const known = new WeakMap<object, Map<string, LinePart>>();

/** Each line's part, by cue id (read once a song: the plan and the treatment both ask). */
export function lineParts(song: Song): Map<string, LinePart> {
  const hit = known.get(song.cues);
  if (hit) return hit;
  const out = partsOf(song);
  known.set(song.cues, out);
  return out;
}

function partsOf(song: Song): Map<string, LinePart> {
  const cues = [...song.cues].sort((a, b) => a.start - b.start);
  const out = new Map<string, LinePart>();
  if (!cues.length) return out;
  const found = analyzeStructure({ ...song, sections: song.sections ?? [], energy: song.energy ?? [], energyFps: song.energyFps ?? 1 } as SongTimeline).sections;
  const stored = (song.sections ?? []).map((s) => ({ start: s.start, end: s.end, kind: (KINDS.has(s.type ?? '') ? s.type : 'verse') as SectionKind }));
  const repeats = found.some((s) => s.kind === 'chorus');
  const from = repeats || !stored.some((s) => s.kind === 'chorus') ? found : stored;
  let run = -1;
  let was: object | undefined;
  for (const c of cues) {
    const at = c.start + 0.05;
    const s = from.find((x) => at >= x.start && at < x.end);
    const kind = s?.kind ?? 'verse';
    if (run < 0 || s !== was) run++;
    was = s;
    out.set(c.id, { kind, chorus: kind === 'chorus' || kind === 'ochi', label: PART_LABEL[kind], from: s?.start ?? c.start, to: s?.end ?? c.end, run });
  }
  // (lines no part holds run together as one part, from the first's start to the last's end)
  for (const c of cues) {
    const p = out.get(c.id)!;
    const mates = cues.filter((x) => out.get(x.id)!.run === p.run);
    if (from.some((x) => c.start + 0.05 >= x.start && c.start + 0.05 < x.end)) continue;
    Object.assign(p, { from: mates[0].start, to: mates.at(-1)!.end });
  }
  return out;
}

/** The ids of the lines sung in a chorus. */
export const chorusLines = (song: Song) => new Set([...lineParts(song)].filter(([, p]) => p.chorus).map(([id]) => id));

/**
 * The song's closing line, where a receipt prints its TOTAL: the last line of the last chorus (a quiet last chorus,
 * 落ちサビ, is not it; what comes after is left to the world); a song with no chorus closes on its last line.
 */
export function closingLine(song: Song): string | undefined {
  const parts = lineParts(song);
  const cues = [...song.cues].sort((a, b) => a.start - b.start);
  return cues.filter((c) => parts.get(c.id)?.kind === 'chorus').at(-1)?.id ?? cues.at(-1)?.id;
}
