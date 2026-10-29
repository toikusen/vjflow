// What the person sees at the concept gate: the director's reading of the song, its look, and up to six stills at the
// moments the plan itself named as its visual changes (typeplan.json previews), filled up with an even spread.
//   npx tsx scripts/lyric-vj/beta/concept-summary.mts --times <run>   prints the still times, comma separated
//   npx tsx scripts/lyric-vj/beta/concept-summary.mts --write <run>   writes <run>/concept.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Interlude } from '../../../src/app/lyric-vj/treatment';
import { LANGUAGES, type LanguageId } from '../../../src/app/lyric-vj/languages';
import { stillAt } from '../preview.mts';

export interface ConceptSummary {
  language: string; languageName: string; font: string;
  /** Up to 5 unique hex colours from design.colorScript (shadow, highlight, accent in order). */
  palette: string[];
  concept: string; briefReading?: string; concerns?: string; candidateReason?: string;
  /** File names under stills/, in time order. */
  stills: string[];
  /** Per still, what the plan said that moment shows (its previews note), '' for an even-spread fill; absent on an older concept. */
  stillNotes?: string[];
  /** The director's choice per unsung window; `reason` only for pictures entries (a demoted entry's reason stays out). */
  interludes?: { start: number; end: number; mode: 'backdrop' | 'pictures'; reason?: string }[];
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

export const STILLS = 6;

/**
 * The stills' moments, in time order, with what the plan said each shows: first the shots the plan named as its
 * visual changes (typeplan.json previews, the moments a buyer must see to judge the direction), then an even spread
 * fills up to STILLS. Each still is the middle of its shot's first sung line; a point whose shot is taken moves to
 * the next later shot, so no still repeats; fewer shots give fewer stills.
 */
export function stillPicks(run: string): { t: number; note: string }[] {
  const song = read(join(run, 'song.json')) as { duration: number; cues: { start: number; end: number }[] };
  const shots = (read(join(run, 'noimg/treatment.json')) as { shots: { id: string; start: number; end: number }[] }).shots;
  if (!shots.length) throw new Error('沒有鏡頭，無法選示意畫面');
  const planFile = join(run, 'noimg/typeplan.json');
  const previews = existsSync(planFile) ? ((read(planFile) as { previews?: { shot: string; note: string }[] }).previews ?? []) : [];
  const picks: { t: number; note: string }[] = [];
  const take = (i: number, note: string) => {
    for (; i < shots.length; i++) {
      const t = stillAt(shots[i], song.cues as never);
      if (picks.some((p) => p.t === t)) continue;
      picks.push({ t, note });
      return;
    }
  };
  for (const p of previews.slice(0, STILLS)) {
    const i = shots.findIndex((s) => s.id === p.shot);
    if (i >= 0) take(i, p.note ?? '');
  }
  for (let k = 0; k < STILLS && picks.length < STILLS; k++) {
    const at = (song.duration * (k + 0.5)) / STILLS;
    const i = shots.findIndex((s) => s.start <= at && at < s.end);
    take(i < 0 ? shots.length - 1 : i, '');
  }
  return picks.sort((a, b) => a.t - b.t);
}

export const stillTimes = (run: string) => stillPicks(run).map((p) => p.t);

/** The time in a still's name (render.mts writes still_<seconds>.png), or undefined. */
const stillTime = (name: string) => { const m = /^still_(\d+(?:\.\d+)?)\./.exec(name); return m ? Number(m[1]) : undefined; };

/** The concept the gate shows, read from the run's base treatment and stills folder. */
export function summarize(run: string): ConceptSummary {
  const t = read(join(run, 'base/treatment.json'));
  const language: string = t.design?.language ?? t.language ?? '';
  const script: Record<string, string>[] = t.design?.colorScript ?? [];
  const palette = [...new Set(script.flatMap((c) => [c.shadow, c.highlight, c.accent]).filter(Boolean))].slice(0, 5);
  const dir = join(run, 'stills');
  // in time order (a name sort put still_100 before still_24); each still's note from the plan's previews by its time
  const stills = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/.test(f)).sort((a, b) => (stillTime(a) ?? 0) - (stillTime(b) ?? 0) || a.localeCompare(b)) : [];
  const picks = (() => { try { return stillPicks(run); } catch { return undefined; } })();
  const stillNotes = picks ? stills.map((f) => picks.find((p) => p.t === stillTime(f))?.note ?? '') : undefined;
  return {
    language, languageName: LANGUAGES[language as LanguageId]?.name ?? language, font: t.design?.font ?? '', palette,
    concept: t.concept ?? '', briefReading: t.briefReading, concerns: t.concerns, candidateReason: t.candidateReason, stills, ...(stillNotes ? { stillNotes } : {}),
    ...(Array.isArray(t.interludes) ? { interludes: t.interludes.map((e: Interlude) => (e.mode === 'pictures' ? { start: e.start, end: e.end, mode: e.mode, reason: e.reason } : { start: e.start, end: e.end, mode: 'backdrop' as const })) } : {}),
  };
}

export const writeSummary = (run: string) => writeFileSync(join(run, 'concept.json'), JSON.stringify(summarize(run), null, 1));

if (process.argv[1]?.endsWith('concept-summary.mts')) {
  const [mode, run] = process.argv.slice(2);
  if (mode === '--times' && run) console.log(stillTimes(run).join(','));
  else if (mode === '--write' && run) writeSummary(run);
  else { console.error('usage: concept-summary.mts --times|--write <run dir>'); process.exit(2); }
}
