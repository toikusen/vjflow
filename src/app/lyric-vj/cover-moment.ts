// A song's cover is one frame of its own video; this picks the moment. Shared by the song page (the free video, drawn
// in the tab), the beta server (a paid video, with ffmpeg) and the backfill script, so a cover means the same moment
// whichever made it.

export interface CoverLine { start: number; end: number; text: string }
export interface CoverSection { start: number; end: number; type?: string }

/** How far into the chosen line the frame is taken: past its entrance, before its exit. */
const INTO_LINE = 0.7;

const visibleLength = (text: string) => [...text.replace(/\s/g, '')].length;

/**
 * The line a cover shows: the first line of the first chorus when the song's sections name one, else the first line at
 * least as long as the median line (a short interjection or a lone title reads badly as a cover). Undefined when the
 * song has no line with words.
 */
export function coverLine<T extends CoverLine>(lines: readonly T[], sections: readonly CoverSection[] = []): T | undefined {
  const sung = lines.filter((l) => visibleLength(l.text) > 0 && l.end > l.start).sort((a, b) => a.start - b.start);
  if (!sung.length) return undefined;
  const chorus = sections.filter((s) => s.type === 'chorus').sort((a, b) => a.start - b.start)[0];
  const first = chorus && sung.find((l) => l.start >= chorus.start && l.start < chorus.end);
  if (first) return first;
  const lengths = sung.map((l) => visibleLength(l.text)).sort((a, b) => a - b);
  const median = lengths[Math.floor((lengths.length - 1) / 2)];
  return sung.find((l) => visibleLength(l.text) >= median) ?? sung[0];
}

/** The time, s, of a song's cover frame: inside its cover line, once the line is fully on screen. */
export function coverMoment(lines: readonly CoverLine[], sections: readonly CoverSection[] = []): number | undefined {
  const line = coverLine(lines, sections);
  return line && line.start + (line.end - line.start) * INTO_LINE;
}
