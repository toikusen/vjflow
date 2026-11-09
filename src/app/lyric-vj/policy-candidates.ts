// Q3 and Q5 as candidate inputs of the song's one scheduler (docs/research/2026-11-09-q3q5-codex.md §2, §6; phase 2
// 2026-11-10): the scale policy's ranked seats a sung section at a time, and the moment policy's candidates that passed
// every hard floor on their own, ranked, become PolicyCandidates (world-events.ts) for planWorldEvents() to arbitrate
// after Q2 and Q4 are protected and Q1 is laid. Only a world that declares the capability (world-shared.ts WORLD_SCALE,
// WORLD_MOMENTS) gets any; the reading on disk is the only source of meaning. Pure, $0: no network, no clock.
import type { RenderJob } from './render/engine';
import type { Meaning } from './lineplan-core';
import { declaredMomentCaps } from './moment-caps-draft';
import { MOMENTS_PER_SONG, rankMoments, type MomentCandidateResult, type MomentPlan } from './moment-policy';
import { momentInputOf } from './moment-policy-adapter';
import { avoidOf, miniRegion, shownBoxes } from './mini-moments';
import { fromFreeJob } from './world-events-adapter';
import { momentsCapOf, scaleOf } from './world-shared';
import { MOMENTS_APART } from './signature-moments';
import { DECLARED_SCALE_CAPS } from './scale-caps-draft';
import { pickScaleContrasts, type LayoutSeatCandidate, type Measure, type ScalePlan } from './scale-policy';
import { splitCalls } from './calls';
import { scaleLayout, type LineScale } from './render/scale-pose';
import { shapedMeasure } from './render/seat-geometry';
import { blockOf, SET_SPECS } from './render/world-sets';
import { scaleInputOf } from './scale-policy-adapter';
import type { StyleWorld } from './style-world';
import type { SongTimeline } from './timeline';
import type { PolicyCandidate } from './world-events';
import { SCALE_HOLDS } from './render/scale-pose';
import { LIFT_MIN, liftRoom } from './render/line-moment';

/** A free plan's first draw (free-plan.ts freeJob): its job and its plan; structural, so the adapters stay off its return type. */
type Free = { job: RenderJob; plan: unknown };

/**
 * Q3's candidates for a declared world: per sung section (song.json sections, a line in the section it starts in), the
 * chosen seat first and every other legal one after it, as layout-seat candidates of one group (at most one approved a
 * section). A line with no world pose (its recipe has no world set) is refused by the policy, not left out, so the section
 * still counts. Undefined for a world without `scale` (no candidate, no record).
 */
export function scaleCandidates(free: Free, song: SongTimeline, world: StyleWorld, o: { seed: number; songId: string; meaning?: Meaning; measure?: Measure }): { plan: ScalePlan; candidates: PolicyCandidate[]; unrealizable: { id: string; why: string }[] } | undefined {
  // (a withheld declaration gives no candidate: world-shared scaleOf)
  const caps = scaleOf(world.id) ? DECLARED_SCALE_CAPS[world.id] : undefined;
  if (!caps) return undefined;
  const input = scaleInputOf(free, song, world, { seed: o.seed, songId: o.songId, meaning: o.meaning, measure: o.measure });
  const estimated = new Set(input.estimated);
  const plan = pickScaleContrasts({ ...input, caps, lines: input.lines.map((l) => (estimated.has(l.id) ? { ...l, refuse: 'not a world line (its recipe has no world set): no scale pose to draw' } : l)) });
  // (a seat whose composition does not reach 1.6× on the shaped measure is not offered: a line-grow is folded only into a
  // composition that will be drawn; the renderer still gives it back on a miss, render/scale-pose beatUnderScale)
  const texts = new Map(free.job.cues.map((c) => [c.id, c.text]));
  const unrealizable: { id: string; why: string }[] = [];
  const realizable = (c: LayoutSeatCandidate) => {
    const why = scaleMissOf(c, texts.get(c.lineId) ?? '');
    if (why) unrealizable.push({ id: c.eventId, why });
    return !why;
  };
  const candidates = plan.ranked.flatMap((seats) => seats.filter(realizable).map((c, rank): PolicyCandidate => ({
    source: 'Q3', id: c.eventId, group: c.sectionId, rank, lineId: c.lineId, kind: 'layout-seat', at: c.at, from: c.from, to: c.to,
    seatAfter: c.seat.id, seat: c.seat, changesLight: false, holdsOk: SCALE_HOLDS, folds: ['line-grow'],
    reason: `${c.scale.kind} ${c.scale.source === 'meaning' ? 'key phrase' : 'whole line'} at ${c.scale.ratio}× on the ${c.scale.edge} edge (${c.sectionId})`,
  })));
  return { plan, candidates, unrealizable };
}

/** An approved seat as the line's scale composition (render/scale-pose.ts LineScale): its span on the drawn text (calls on their own track). */
export function lineScaleOf(c: LayoutSeatCandidate, text: string, eventId = c.eventId): LineScale | undefined {
  const { map } = splitCalls(text);
  const kept = c.scale.span.from < map.length ? map.slice(c.scale.span.from, c.scale.span.to).filter((m) => m >= 0) : [];
  if (!kept.length) return undefined;
  return { eventId, sectionId: c.sectionId, kind: c.scale.kind, source: c.scale.source, ratio: c.scale.ratio, targetSize: c.scale.targetSize, readingSize: c.scale.readingSize, span: { from: kept[0], to: kept.at(-1)! + 1 }, edge: c.scale.edge, rows: c.scale.rows, carrierRole: c.scale.carrierExtends.role, carrierId: c.scale.carrierExtends.carrierId };
}

/** Why a seat's composition misses 1.6× when laid as the renderer lays it, on the shaped glyph measure; '' when it does not. */
export function scaleMissOf(c: LayoutSeatCandidate, text: string): string {
  const ls = lineScaleOf(c, text);
  const spec = SET_SPECS[c.seat.id.split('+scale:')[0]];
  if (!ls || !spec) return ls ? '' : 'no span on the drawn text';
  const main = splitCalls(text).main;
  const reading = blockOf(main.replace(/[\s　]+/g, ' ').trim(), spec, spec.even ? (x: string) => [...x].length * 100 : shapedMeasure).size;
  const d = scaleLayout(main, ls, reading, spec, shapedMeasure);
  return d.kind === 'miss' ? `unrealizable: ${d.why ?? 'under 1.6× as drawn'}` : '';
}

/**
 * Q5's candidates for a declared world: the reading's moments through every hard floor on their own (Q2 holds and Q4
 * handoffs protected there), then ranked (the policy's own choice first, its repetition penalty included, then the rest
 * by score), each with its variant's whole occupied window, one group a reading's moment, budgeted two a song, 30 s
 * apart, one a section. The scheduler approves; nothing here moves a semantic onset. Undefined without capability.
 */
export function momentCandidates(free: Free, song: SongTimeline, world: StyleWorld, meaning: Meaning | undefined, meaningRef: string): { plan: MomentPlan; candidates: PolicyCandidate[]; noRoom: { meaningRef: string; why: string }[] } | undefined {
  const caps = declaredMomentCaps(world);
  if (!caps) return undefined;
  const plan = rankMoments(momentInputOf(free, song, world, meaning, meaningRef, caps));
  const chosen = plan.chosen.map((c) => c.index);
  const passed = plan.candidates.filter((c) => !c.failed);
  const order = [...passed].sort((a, b) => {
    const [x, y] = [chosen.indexOf(a.index), chosen.indexOf(b.index)];
    if (x >= 0 || y >= 0) return (x < 0 ? Infinity : x) - (y < 0 ? Infinity : y);
    return b.score!.total - a.score!.total || a.at! - b.at! || a.index - b.index;
  });
  // a mini's own region beside the words up in its window (mini-moments.ts miniRegion): none, no mini (Codex §5)
  // (every seat a line may stand in: a world the scheduler does not take over lists its composer's changes of set there)
  // (a line whose key word is blown up is drawn in a pose of its own, not in its set's box: the whole frame is its)
  const blown = new Set((free.job.treatment.cues as { cueId: string; world?: { blow?: unknown } }[]).filter((c) => c.world?.blow).map((c) => c.cueId));
  const shown = shownBoxes(fromFreeJob(free, song, world, { seed: 0 }).lines).map((l) => (blown.has(l.id) ? { ...l, boxes: [{ x0: 0, y0: 0, x1: 1, y1: 1 }] } : l));
  const noRoom: { meaningRef: string; why: string }[] = [];
  const lines = fromFreeJob(free, song, world, { seed: 0 }).lines;
  const texts = new Map(free.job.cues.map((c) => [c.id, splitCalls(c.text).main]));
  const worldLine = new Set((free.job.treatment.cues as { cueId: string; world?: unknown }[]).filter((c) => c.world).map((c) => c.cueId));
  const candidates = order.flatMap((c, rank) => {
    if (c.variant !== 'mini') return [momentCandidate(c, rank, free)];
    // (a type-only mini moves the sung words themselves in their own seat: only a world line has that pose, and a
    // blown-up line's pose is not its seat; else no form carries it, noForm)
    if (c.family === 'type-only') {
      const actor = c.ask!.cues.at(-1)!;
      const seat = lines.find((l) => l.id === actor)?.seats[0]?.box;
      if (!worldLine.has(actor) || blown.has(actor) || !seat) { noRoom.push({ meaningRef: c.meaningRef, why: 'noForm: no world pose of the line to move its own words in' }); return []; }
      // (and only where its set leaves the words room to move without reaching another row or glyph)
      const set = lines.find((l) => l.id === actor)?.seats[0]?.id ?? '';
      if (liftRoom(set, texts.get(actor) ?? '') < LIFT_MIN) { noRoom.push({ meaningRef: c.meaningRef, why: `noForm: ${set} leaves its rows no room to move (< ${LIFT_MIN} em)` }); return []; }
      return [{ ...momentCandidate(c, rank, free), protectedRegion: seat }];
    }
    const region = miniRegion(avoidOf(shown, c.window!.from, c.window!.to), momentsCapOf(world.id)!.miniShare);
    if (!region) { noRoom.push({ meaningRef: c.meaningRef, why: 'no free region of 15 % of the frame beside the words up in its window' }); return []; }
    return [{ ...momentCandidate(c, rank, free), protectedRegion: region }];
  });
  return { plan, candidates, noRoom };
}

const momentCandidate = (c: MomentCandidateResult, rank: number, free: Free): PolicyCandidate => {
  const ask = c.ask!;
  const actor = ask.cues.at(-1)!;
  return {
    source: 'Q5', id: `moment:${actor}:${ask.form}/${ask.variant}`, group: c.meaningRef, rank, lineId: actor, kind: 'signature-moment',
    at: c.at!, from: c.window!.from, to: c.window!.to, changesLight: c.variant === 'big', protectedRegion: c.area!.box,
    budget: { key: 'Q5', max: MOMENTS_PER_SONG, apart: MOMENTS_APART, section: String(c.sectionIndex) },
    meaningRef: c.meaningRef, cueIds: [...ask.cues], variant: c.variant, score: c.score!.total,
    reason: `${ask.form}/${ask.variant} 「${ask.word}」 ${c.variant}${c.family && c.variant === 'mini' ? ` (${c.family})` : ''}, score ${c.score!.total}${free.job.cues.some((x) => x.id === actor) ? '' : ' (line not in the job)'}`,
  };
};
