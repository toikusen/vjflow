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
import { momentsCapOf } from './world-shared';
import { MOMENTS_APART } from './signature-moments';
import { DECLARED_SCALE_CAPS } from './scale-caps-draft';
import { pickScaleContrasts, type Measure, type ScalePlan } from './scale-policy';
import { scaleInputOf } from './scale-policy-adapter';
import type { StyleWorld } from './style-world';
import type { SongTimeline } from './timeline';
import type { PolicyCandidate } from './world-events';
import { SCALE_HOLDS } from './render/scale-pose';

/** A free plan's first draw (free-plan.ts freeJob): its job and its plan; structural, so the adapters stay off its return type. */
type Free = { job: RenderJob; plan: unknown };

/**
 * Q3's candidates for a declared world: per sung section (song.json sections, a line in the section it starts in), the
 * chosen seat first and every other legal one after it, as layout-seat candidates of one group (at most one approved a
 * section). A line with no world pose (its recipe has no world set) is refused by the policy, not left out, so the section
 * still counts. Undefined for a world without `scale` (no candidate, no record).
 */
export function scaleCandidates(free: Free, song: SongTimeline, world: StyleWorld, o: { seed: number; songId: string; meaning?: Meaning; measure?: Measure }): { plan: ScalePlan; candidates: PolicyCandidate[] } | undefined {
  const caps = DECLARED_SCALE_CAPS[world.id];
  if (!caps) return undefined;
  const input = scaleInputOf(free as never, song, world, { seed: o.seed, songId: o.songId, meaning: o.meaning, measure: o.measure });
  const estimated = new Set(input.estimated);
  const plan = pickScaleContrasts({ ...input, caps, lines: input.lines.map((l) => (estimated.has(l.id) ? { ...l, refuse: 'not a world line (its recipe has no world set): no scale pose to draw' } : l)) });
  const candidates = plan.ranked.flatMap((seats) => seats.map((c, rank): PolicyCandidate => ({
    source: 'Q3', id: c.eventId, group: c.sectionId, rank, lineId: c.lineId, kind: 'layout-seat', at: c.at, from: c.from, to: c.to,
    seatAfter: c.seat.id, seat: c.seat, changesLight: false, holdsOk: SCALE_HOLDS, folds: ['line-grow'],
    reason: `${c.scale.kind} ${c.scale.source === 'meaning' ? 'key phrase' : 'whole line'} at ${c.scale.ratio}× on the ${c.scale.edge} edge (${c.sectionId})`,
  })));
  return { plan, candidates };
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
  const plan = rankMoments(momentInputOf(free as never, song, world, meaning as never, meaningRef, caps));
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
  const shown = shownBoxes(fromFreeJob(free as never, song, world, { seed: 0 }).lines).map((l) => (blown.has(l.id) ? { ...l, boxes: [{ x0: 0, y0: 0, x1: 1, y1: 1 }] } : l));
  const noRoom: { meaningRef: string; why: string }[] = [];
  const candidates = order.flatMap((c, rank) => {
    if (c.variant !== 'mini') return [momentCandidate(c, rank, free)];
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
