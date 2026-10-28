// A picture fix on a copied run: every picture of the saved type plan that shows while a marked range plays is taken
// out, so `typeplan.mts --plan` rebuilds the treatment without it and no model is called. The pictures are a cut's
// sprite, a part's kept items (keep.items, shown through the part) and the thread's sprite (shown in the shots whose
// level, or the level before, is above 0). Cut times use typeplan's own helpers (cutTimes, holdGap, landedEnd).
// A blanked cut's sprite is also taken from the cuts after it that would now show it (blankFollowers).
// A base treatment without interludes (a run made before them) gets every unsung window as pictures, so the rebuild
// changes only the marked ranges (keptInterludes).
// Exit 3 (stderr NOTHING_TO_REMOVE) when the ranges hold no picture: a render would only repeat the old video.
// usage: npx tsx scripts/lyric-vj/beta/fix-apply.mts --run <run dir> --kind picture --ranges '[{"at":2,"end":4}]'
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { unsungWindows } from '../../../src/app/lyric-vj/structure';
import { feltTempo } from '../../../src/app/lyric-vj/timeline';
import type { Interlude } from '../../../src/app/lyric-vj/treatment';
import { cutTimes, holdGap, landedEnd } from '../interludes.mts';
import { POINT_SPAN } from './feedback.mts';

export const NOTHING_TO_REMOVE = '標記的範圍裡沒有可以拿掉的圖';
export const KEEP_REASON = '保留原版（修正不改間奏）';

export interface FixPlan {
  format?: { pace?: string };
  parts?: { from: string; keep?: { style: string; items: { sprite: string; word: string }[] } }[];
  thread?: { sprite?: string };
  shots: { shot: string; level?: number; cuts: { beat: number; sprite: string }[] }[];
}
/** The song's shots (with the hold between cuts typeplan applies in each), its felt beats and its length. */
export interface FixTimeline { shots: { id: string; start: number; end: number; gap: number }[]; beats: number[]; duration: number }

/** Each cut of the plan with the seconds it shows, in plan order (a cut of a shot the timeline lacks is left out). */
export function cutSpans(plan: FixPlan, tl: FixTimeline) {
  return plan.shots.flatMap((ps) => {
    const s = tl.shots.find((x) => x.id === ps.shot);
    if (!s) return [];
    const sorted = [...ps.cuts].sort((x, y) => x.beat - y.beat);
    const times = cutTimes(tl.beats, s, sorted);
    return sorted.map((cut, i) => ({ cut, start: times[i], end: landedEnd(times, i, s.gap, s.end) }));
  });
}

/** Each part with the seconds it holds the screen: from its first shot to the next part's (the last to the song end). */
export function partSpans(plan: FixPlan, tl: FixTimeline) {
  const parts = plan.parts ?? [];
  const at = (id: string) => tl.shots.find((x) => x.id === id)?.start;
  return parts.map((part, k) => ({ part, start: at(part.from) ?? 0, end: (k + 1 < parts.length ? at(parts[k + 1].from) : undefined) ?? tl.duration }));
}

/** A copy of the plan without the pictures that show while any range plays, and how many pictures went. */
export function applyPictureFix(plan: FixPlan, ranges: { at: number; end?: number }[], tl: FixTimeline): { plan: FixPlan; removed: number } {
  const next = structuredClone(plan);
  const spans = ranges.map((r) => ({ at: r.at, end: r.end ?? r.at + POINT_SPAN }));
  const hit = (start: number, end: number) => spans.some((r) => start < r.end && end > r.at);
  let removed = 0;
  const blanked = new Set<FixPlan['shots'][number]['cuts'][number]>();
  for (const { cut, start, end } of cutSpans(next, tl)) {
    if (!cut.sprite || !hit(start, end)) continue;
    blanked.add(cut);
    removed++;
  }
  removed += blankFollowers(next, tl, blanked);
  for (const { part, start, end } of partSpans(next, tl)) {
    if (!hit(start, end)) continue;
    for (const item of part.keep?.items ?? []) {
      if (!item.sprite) continue;
      item.sprite = '';
      removed++;
    }
  }
  if (next.thread?.sprite) {
    // the thread eases from the level of the shot before, so a shot after one with the thread up shows it too
    const levels = new Map(next.shots.map((x) => [x.shot, x.level ?? 0]));
    const shows = tl.shots.some((s, i) => ((levels.get(s.id) ?? 0) > 0 || (i > 0 && (levels.get(tl.shots[i - 1].id) ?? 0) > 0)) && hit(s.start, s.end));
    if (shows) {
      next.thread.sprite = '';
      removed++;
    }
  }
  return { plan: next, removed };
}

/**
 * typeplan seats a sprite out when the cut before showed the same one at another side (sameSpot), so blanking a shown
 * cut can bring that same sprite back on the cut after it. Blanking only turns the previous shown sprite from X into
 * none, which matters only to a next landed cut that carries X; a landed cut with any other sprite, or none, decides
 * the same either way and leaves the same state behind. So the change travels only along the unbroken run of landed
 * cuts carrying X after the blanked one (cuts that do not land are passed over, as typeplan does). Every cut of that
 * run loses X, and so does every later cut of the blanked cut's own shot. Blanks `blanked` too; returns how many
 * more cuts lost their picture.
 */
function blankFollowers(plan: FixPlan, tl: FixTimeline, blanked: Set<FixPlan['shots'][number]['cuts'][number]>): number {
  // typeplan's order: the treatment's shots, each shot's cuts by beat; a cut lands as in buildCuts
  let lastLanded = -Infinity;
  const order = tl.shots.flatMap((s) => {
    const sorted = [...(plan.shots.find((x) => x.shot === s.id)?.cuts ?? [])].sort((x, y) => x.beat - y.beat);
    const times = cutTimes(tl.beats, s, sorted);
    return sorted.map((cut, i) => {
      const landed = times[i] < s.end - 0.05 && (i === 0 || times[i] - lastLanded >= s.gap);
      if (landed) lastLanded = times[i];
      return { cut, shot: s.id, landed, sprite: cut.sprite };
    });
  });
  const more = new Set<FixPlan['shots'][number]['cuts'][number]>();
  order.forEach((o, k) => {
    if (!blanked.has(o.cut)) return;
    for (const later of order.slice(k + 1)) if (later.shot === o.shot && later.sprite === o.sprite) more.add(later.cut);
    for (const later of order.slice(k + 1)) {
      if (later.sprite === o.sprite) more.add(later.cut);
      else if (later.landed) break;
    }
  });
  for (const c of blanked) c.sprite = '';
  let n = 0;
  for (const c of more) {
    if (blanked.has(c) || !c.sprite) continue;
    c.sprite = '';
    n++;
  }
  return n;
}

type Song = Parameters<typeof feltTempo>[0] & { duration?: number; sections?: { start: number; end: number; type: string }[] };

/** The timeline typeplan built the plan against: the run's shots, its felt beats and each shot's hold (holdGap). */
export function fixTimeline(song: Song, treatment: { shots: { id: string; start: number; end: number }[] }, plan: FixPlan): FixTimeline {
  const felt = feltTempo(song);
  const chorus = (start: number) => song.sections?.find((x) => start >= x.start && start < x.end)?.type === 'chorus';
  return {
    shots: treatment.shots.map((s) => ({ id: s.id, start: s.start, end: s.end, gap: holdGap(plan.format?.pace, chorus(s.start), 60 / felt.tempo) })),
    beats: felt.beats,
    duration: song.duration ?? song.cues.at(-1)?.end ?? 0,
  };
}

/**
 * The interludes a fix writes into its copied base treatment: none when the treatment has its own (the director's
 * decision, even an empty list), else every unsung window as pictures. A run made before interludes existed showed
 * pictures in every window, and the rebuild would otherwise read the missing entries as backdrop and strip them all.
 */
export function keptInterludes(treatment: { interludes?: Interlude[] }, song: Parameters<typeof unsungWindows>[0]): Interlude[] | undefined {
  if (treatment.interludes) return undefined;
  return unsungWindows(song).map((w) => ({ start: w.start, end: w.end, mode: 'pictures' as const, reason: KEEP_REASON }));
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
  if (!r.removed) {
    console.error(NOTHING_TO_REMOVE);
    process.exit(3);
  }
  writeJson(file, r.plan);
  // the run's own copy (written by rename, so a link to the source would be replaced, never followed)
  const kept = keptInterludes(treatment, song);
  if (kept) writeJson(join(a.run, 'base', 'treatment.json'), { ...treatment, interludes: kept });
  writeJson(join(a.run, 'fix.json'), { kind: 'picture', ranges, removed: r.removed, at: new Date().toISOString() });
  console.log(`fix-apply: ${r.removed} pictures removed in ${ranges.length} ranges`);
}
