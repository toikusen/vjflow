// From today's free plan to Q3's scale policy (scale-policy.ts), and a trace of today's keyword blow-ups (lineplan-core
// blowOf / blownParts / namedLater, read here, never changed) per sung section with the reason each line was not blown.
// Plan-level only: reading sizes are blockOf() on the line's set with an estimated glyph width, show times are the
// engine's rule without picture pulls (world-events-adapter.ts), and nothing is rendered.
import type { freeJob } from './free-plan';
import { validMeaning } from './free-plan';
import { blowOf, type Meaning } from './lineplan-core';
import { splitCalls } from './calls';
import { blockOf, SET_SPECS, TYPE_FLOOR, type SetSpec } from './render/world-sets';
import { scaleCapsOf } from './scale-caps-draft';
import { estimateMeasure, sungSectionsOf, type Measure, type ScaleInput, type ScaleLine, type ScaleSection } from './scale-policy';
import type { StyleWorld } from './style-world';
import type { SongTimeline } from './timeline';
import { fromFreeJob } from './world-events-adapter';
import { sharedOf } from './world-shared';

type Free = ReturnType<typeof freeJob>;
interface PlanLine { cue: string; world?: { set: string; blow?: { from: number; to: number; stress: string } } }
interface PlanShot { shot: string; lines: PlanLine[]; cuts?: { piece?: string }[] }
interface Cue { id: string; start: number; end: number; text: string }

/** The song's sections with the ids the measurement uses: their index in song.json and their type. */
export const sectionsOf = (song: SongTimeline): ScaleSection[] => (song.sections ?? []).map((s, i) => ({ id: `S${String(i).padStart(2, '0')}:${s.type}`, start: s.start, end: s.end, type: s.type }));

/** The set a line is drawn in as the renderer takes it: a shot two lines share splits the set's height (world-layout.ts specOf). */
function specOf(set: string, of: number): SetSpec | undefined {
  const s = SET_SPECS[set];
  if (!s) return undefined;
  return of > 1 ? { ...s, ...(s.vertical ? { share: s.share / of } : { tall: s.tall / of }), rows: [1, Math.max(1, s.rows[1] - 1)] as [number, number], object: undefined } : s;
}

/**
 * A free plan as the scale policy's input: each sung line with its reading size in its own set (a line with no world set
 * reads at the type floor's top, TYPE_FLOOR.hi), its seat and carrier, the set's clear boxes; the song's sections; the
 * reading's key phrases that really stand in their lines; the world's scale caps. `estimated` lists lines without a set.
 */
export function scaleInputOf(free: Free, song: SongTimeline, world: StyleWorld, o: { seed?: number; songId: string; meaning?: Meaning; measure?: Measure }): ScaleInput & { estimated: string[] } {
  const measure = o.measure ?? estimateMeasure;
  const seed = o.seed ?? 0;
  const ev = fromFreeJob(free, song, world, { seed });
  const cues = free.job.cues as unknown as Cue[];
  const shots = (free.plan as unknown as { shots: PlanShot[] }).shots;
  const shotOf = (id: string) => shots.find((s) => s.lines.some((l) => l.cue === id));
  const shareOf = (id: string) => shotOf(id)?.lines.length ?? 1;
  const estimated: string[] = [];
  const lines: ScaleLine[] = ev.lines.map((l) => {
    const cue = cues.find((c) => c.id === l.id)!;
    const spec = specOf(l.seat ?? '', shareOf(l.id));
    if (!spec) estimated.push(l.id);
    // (the reading size of what the renderer lays: the line's main text, its calls on their own track; phase 2)
    const readingSize = spec ? blockOf(splitCalls(cue.text).main.replace(/[\s　]+/g, ' ').trim(), spec, measure).size : TYPE_FLOOR.hi;
    const clear = (spec?.clear ?? []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
    return { id: l.id, text: cue.text, show: l.show, start: l.start, end: l.end, readingSize, seat: l.seats[0], ...(clear.length ? { clear } : {}), ...(spec ? { track: spec.track } : {}), ...(shareOf(l.id) > 1 ? { sharesFrameWith: shotOf(l.id)!.lines.map((x) => x.cue).filter((x) => x !== l.id) } : {}) };
  });
  const keys = o.meaning ? validMeaning(o.meaning, cues as never)?.keys ?? [] : [];
  return { songId: o.songId, worldId: world.id, seed, lines, sections: sectionsOf(song), keys, caps: scaleCapsOf(world), measure, estimated };
}

// (lineplan-core's blowOf limits, not exported there: mirrored only to name the reason a line was refused)
const BLOW_MIN_LINE = 1.4;

export interface TodayLine { lineId: string; text: string; blown: boolean; word?: string; reason: string; renderer?: string }
export interface TodaySection { sectionId: string; lineIds: string[]; planned: boolean; renderable: boolean; lines: TodayLine[]; why: string }
export interface TodayScale { sungSections: number; plannedSections: number; renderableSections: number; blownLines: number; sections: TodaySection[]; mismatches: string[] }

/**
 * Today's keyword scale, per sung section (the measurement's basis: a line counts in the section it starts in): which
 * line the plan blew up and, for every other line, the first rule that refused it, replayed in composePlan's order —
 * set in a pair shot, not a world line, no stress, a piece took the shot, the meaning part already blew a line, blowOf found no word, a
 * named line later in the part. A blown line the renderer would still drop (a shared shot, a fixed set on an object or
 * a plate, rows kept on carriers: world-layout.ts `blowing`) is marked. `mismatches` lists any line where the replay
 * disagrees with the plan's own blow, so the trace is checked, not assumed.
 */
export function todayScale(free: Free, song: SongTimeline, world: StyleWorld, meaning?: Meaning): TodayScale {
  const cues = free.job.cues as unknown as Cue[];
  const shots = (free.plan as unknown as { shots: PlanShot[] }).shots;
  const m = validMeaning(meaning, cues as never);
  const parts = m?.parts ?? [];
  const keys = m?.keys ?? [];
  const named = (id: string) => keys.find((k) => k.cue === id)?.phrase;
  const index = (id: string) => cues.findIndex((c) => c.id === id);
  const partAt = (id: string) => parts.filter((p) => index(p.from) <= index(id)).at(-1) ?? parts[0];
  const stress = sharedOf(world).stress ?? [];
  const blownBy = new Map<unknown, string>();
  const namedLater = (p: unknown, after: number) => cues.some((x, i) => i > after && partAt(x.id) === p && !!named(x.id) && !!blowOf(x as never, named(x.id)));
  const lines: TodayLine[] = [];
  const mismatches: string[] = [];
  for (const s of shots) {
    s.lines.forEach((l) => {
      const c = cues.find((x) => x.id === l.cue);
      if (!c) return;
      const actual = l.world?.blow;
      const part = partAt(c.id);
      let reason = '';
      // (lines set together in one shot, a pair or list, are composed as the pair: composePlan returns before any blow)
      if (s.lines.length > 1) reason = `pair shot ${s.shot} (${s.lines.length} lines set together): a pair has no blow path`;
      else if (!l.world) reason = 'not a world line (its recipe has no world set): no blow path';
      else if (!stress.length) reason = 'world has no stress kinds';
      else if (s.cuts?.[0]?.piece) reason = `a piece (${s.cuts[0].piece}) took the shot`;
      else if (part && blownBy.has(part)) reason = `meaning part ${parts.indexOf(part!)} (from ${part!.from}) already blew ${blownBy.get(part)}`;
      else if (!blowOf(c as never, named(c.id))) reason = c.end - c.start < BLOW_MIN_LINE ? `line ${(c.end - c.start).toFixed(2)}s < ${BLOW_MIN_LINE}s` : splitCalls(c.text).calls.length ? 'line has a call' : 'blowOf: no whole word of 2–4 glyphs ≤ 60 % of the line (no Latin/digits, no leading particle)';
      else if (!named(c.id) && namedLater(part, index(c.id))) reason = 'a named line later in the same meaning part waits for it';
      const predicted = !reason;
      if (predicted !== !!actual) mismatches.push(`${c.id}: replay ${predicted ? 'blows' : `refuses (${reason})`}, plan ${actual ? 'blows' : 'does not'}`);
      if (actual && part) blownBy.set(part, c.id);
      const spec = l.world ? SET_SPECS[l.world.set] : undefined;
      const renderer = actual ? (s.lines.length > 1 ? `shared shot (${s.lines.length} lines)` : spec?.fixed && (spec.object || spec.ink === 'plateInk') ? `fixed set ${l.world!.set} on ${spec.object ? 'an object' : 'a plate ink'}` : spec?.keepRows ? `set ${l.world!.set} keeps its rows on carriers` : undefined) : undefined;
      const word = actual ? [...c.text].slice(actual.from, actual.to).join('') : undefined;
      lines.push({ lineId: c.id, text: c.text, blown: !!actual, ...(word ? { word } : {}), reason: actual ? (named(c.id) ? 'blown: the reading named it' : 'blown: blowOf fallback (last whole 2–4 glyph word, not a meaning key)') : reason || 'refused (replay found no rule: see mismatches)', ...(renderer ? { renderer: `plan blows, renderer drops it: ${renderer}` } : {}) });
    });
  }
  const timed = lines.map((l) => ({ ...l, start: cues.find((c) => c.id === l.lineId)!.start }));
  const sections = sungSectionsOf(sectionsOf(song), timed).map(({ section, lines: ls }): TodaySection => {
    const planned = ls.some((l) => l.blown);
    const renderable = ls.some((l) => l.blown && !l.renderer);
    // (reasons tallied with their line ids and times taken out: "3× line Ns < 1.4s")
    const generic = (r: string) => r.replace(/\bc\d{3}\b/g, 'cX').replace(/\d+\.\d+s/g, 'Ns').replace(/part \d+/g, 'part N').replace(/shot L\d+/g, 'shot LX');
    const tally = [...ls.reduce((mm, l) => mm.set(generic(l.reason), (mm.get(generic(l.reason)) ?? 0) + 1), new Map<string, number>()).entries()];
    const why = planned ? `blown: ${ls.filter((l) => l.blown).map((l) => `${l.lineId}「${l.word}」`).join(', ')}` : `missed: ${tally.map(([r, n]) => `${n}× ${r}`).join('; ')}`;
    return { sectionId: section.id, lineIds: ls.map((l) => l.lineId), planned, renderable, lines: ls.map(({ start: _s, ...l }) => l), why };
  });
  return { sungSections: sections.length, plannedSections: sections.filter((s) => s.planned).length, renderableSections: sections.filter((s) => s.renderable).length, blownLines: lines.filter((l) => l.blown).length, sections, mismatches };
}
