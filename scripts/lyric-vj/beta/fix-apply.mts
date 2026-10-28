// A picture fix on a copied run: every cut of the saved type plan that shows while a marked range plays loses its
// picture (sprite ''), so `typeplan.mts --plan` rebuilds the treatment without them and no model is called.
// Cut times follow typeplan's buildCuts: a shot's first cut at the shot start, later cuts on the shot's felt beats,
// each running until the next cut that lands (landedEnd) or the shot end.
// usage: npx tsx scripts/lyric-vj/beta/fix-apply.mts --run <run dir> --kind picture --ranges '[{"at":2,"end":4}]'
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { feltTempo } from '../../../src/app/lyric-vj/timeline';
import { landedEnd } from '../interludes.mts';
import { POINT_SPAN } from './feedback.mts';

export interface FixPlan { format?: { pace?: string }; shots: { shot: string; cuts: { beat: number; sprite: string }[] }[] }
/** The song's shots (with the hold between cuts typeplan applies in each) and its felt beats. */
export interface FixTimeline { shots: { id: string; start: number; end: number; gap: number }[]; beats: number[] }

/** Each cut of the plan with the seconds it shows, in plan order (a cut of a shot the timeline lacks is left out). */
export function cutSpans(plan: FixPlan, tl: FixTimeline) {
  return plan.shots.flatMap((ps) => {
    const s = tl.shots.find((x) => x.id === ps.shot);
    if (!s) return [];
    const bs = tl.beats.filter((b) => b >= s.start && b < s.end);
    const sorted = [...ps.cuts].sort((x, y) => x.beat - y.beat);
    const times = sorted.map((c, k) => (k === 0 ? s.start : (bs[c.beat] ?? s.end)));
    return sorted.map((cut, i) => ({ cut, start: times[i], end: landedEnd(times, i, s.gap, s.end) }));
  });
}

/** A copy of the plan whose cuts overlapping any range show no picture, and how many pictures went. */
export function applyPictureFix(plan: FixPlan, ranges: { at: number; end?: number }[], tl: FixTimeline): { plan: FixPlan; removed: number } {
  const next = structuredClone(plan);
  const spans = ranges.map((r) => ({ at: r.at, end: r.end ?? r.at + POINT_SPAN }));
  let removed = 0;
  for (const { cut, start, end } of cutSpans(next, tl)) {
    if (!cut.sprite || !spans.some((r) => start < r.end && end > r.at)) continue;
    cut.sprite = '';
    removed++;
  }
  return { plan: next, removed };
}

type Song = Parameters<typeof feltTempo>[0] & { sections?: { start: number; end: number; type: string }[] };

/** The timeline typeplan built the plan against: the run's shots, its felt beats and each shot's hold (gapAt). */
export function fixTimeline(song: Song, treatment: { shots: { id: string; start: number; end: number }[] }, plan: FixPlan): FixTimeline {
  const felt = feltTempo(song);
  const pace = plan.format?.pace;
  const gapOf = (start: number) => {
    const chorus = song.sections?.find((x) => start >= x.start && start < x.end)?.type === 'chorus';
    const held = pace === 'held' || (pace === 'mixed' && !chorus);
    return held ? Math.max(1.2, (4 * 60) / felt.tempo) : 0.45;
  };
  return { shots: treatment.shots.map((s) => ({ id: s.id, start: s.start, end: s.end, gap: gapOf(s.start) })), beats: felt.beats };
}

const writeJson = (file: string, v: unknown) => {
  writeFileSync(`${file}.tmp`, JSON.stringify(v, null, 1));
  renameSync(`${file}.tmp`, file);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: a } = parseArgs({ options: { run: { type: 'string' }, kind: { type: 'string' }, ranges: { type: 'string' } } });
  if (!a.run || a.kind !== 'picture' || !a.ranges) {
    console.error('usage: fix-apply.mts --run <run dir> --kind picture --ranges <json>');
    process.exit(2);
  }
  const ranges = JSON.parse(a.ranges) as { at: number; end?: number }[];
  // a picture fix exists only for the img tier, whose plan is img/typeplan.json
  const file = join(a.run, 'img', 'typeplan.json');
  const plan = JSON.parse(readFileSync(file, 'utf8')) as FixPlan;
  const song = JSON.parse(readFileSync(join(a.run, 'song.json'), 'utf8')) as Song;
  const treatment = JSON.parse(readFileSync(join(a.run, 'base', 'treatment.json'), 'utf8'));
  const r = applyPictureFix(plan, ranges, fixTimeline(song, treatment, plan));
  writeJson(file, r.plan);
  writeJson(join(a.run, 'fix.json'), { kind: 'picture', ranges, removed: r.removed, at: new Date().toISOString() });
  console.log(`fix-apply: ${r.removed} pictures removed in ${ranges.length} ranges`);
}
