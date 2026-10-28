// What the person sees at the concept gate: the director's reading of the song, its look, and three stills.
//   npx tsx scripts/lyric-vj/beta/concept-summary.mts --times <run>   prints the three still times, comma separated
//   npx tsx scripts/lyric-vj/beta/concept-summary.mts --write <run>   writes <run>/concept.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, type LanguageId } from '../../../src/app/lyric-vj/languages';
import { stillAt } from '../preview.mts';

export interface ConceptSummary {
  language: string; languageName: string; font: string;
  /** Up to 5 unique hex colours from design.colorScript (shadow, highlight, accent in order). */
  palette: string[];
  concept: string; briefReading?: string; concerns?: string; candidateReason?: string;
  /** File names under stills/. */
  stills: string[];
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/** The middle of the first sung line of the shots at 20 %, 50 % and 80 % of the song. */
export function stillTimes(run: string): number[] {
  const song = read(join(run, 'song.json')) as { duration: number; cues: { start: number; end: number }[] };
  const shots = (read(join(run, 'noimg/treatment.json')) as { shots: { id: string; start: number; end: number }[] }).shots;
  return [0.2, 0.5, 0.8].map((f) => {
    const at = song.duration * f;
    const shot = shots.find((s) => s.start <= at && at < s.end) ?? shots.at(-1)!;
    return stillAt(shot, song.cues as never);
  });
}

/** The concept the gate shows, read from the run's base treatment and stills folder. */
export function summarize(run: string): ConceptSummary {
  const t = read(join(run, 'base/treatment.json'));
  const language: string = t.design?.language ?? t.language ?? '';
  const script: Record<string, string>[] = t.design?.colorScript ?? [];
  const palette = [...new Set(script.flatMap((c) => [c.shadow, c.highlight, c.accent]).filter(Boolean))].slice(0, 5);
  const dir = join(run, 'stills');
  const stills = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/.test(f)).sort() : [];
  return {
    language, languageName: LANGUAGES[language as LanguageId]?.name ?? language, font: t.design?.font ?? '', palette,
    concept: t.concept ?? '', briefReading: t.briefReading, concerns: t.concerns, candidateReason: t.candidateReason, stills,
  };
}

export const writeSummary = (run: string) => writeFileSync(join(run, 'concept.json'), JSON.stringify(summarize(run), null, 1));

if (process.argv[1]?.endsWith('concept-summary.mts')) {
  const [mode, run] = process.argv.slice(2);
  if (mode === '--times' && run) console.log(stillTimes(run).join(','));
  else if (mode === '--write' && run) writeSummary(run);
  else { console.error('usage: concept-summary.mts --times|--write <run dir>'); process.exit(2); }
}
