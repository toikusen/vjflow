// From today's free plan to the moment policy's input (moment-policy.ts), and today's free moment gate (free-plan.ts
// freeMoments) taken apart stage by stage, so the two can be counted side by side. Plan-level only: nothing is rendered,
// and nothing here reaches the network (the reading is whatever meaning.json the caller read from disk).
import { FREE_MOMENTS_MAX, validMeaning, withoutEchoes } from './free-plan';
import type { RenderJob } from './render/engine';
import type { Cue, Meaning } from './lineplan-core';
import { momentCapsOf, type WorldMomentCaps } from './moment-caps-draft';
import type { MomentInput, ProtectedEvent } from './moment-policy';
import { checkMoments, type MomentAsk } from './signature-moments';
import { analyzeStructure } from './structure';
import type { StyleWorld } from './style-world';
import type { SongTimeline } from './timeline';
import { LINK_PREPARE } from './render/world-handoff';
import { fromFreeJob } from './world-events-adapter';

/** A free plan's draw, structurally (no cycle through freeJob's return type). */
type Free = { job: RenderJob; plan: unknown };

/**
 * A free plan as the policy's input: the plan's cues, the song's sections (the ochi stretch marked from analyzeStructure),
 * beats, the world's derived moment caps, each line's own seat box, and the protected events today's plan carries: Q2
 * holds and Q4 linked handoffs (their whole windows). Q1 is not protected over Q5 (Codex §6: Q5 and Q1 are arbitrated
 * together), and Q3 has no events yet.
 */
export function momentInputOf(free: Free, song: SongTimeline, world: StyleWorld, meaning: { moments?: unknown[] } | undefined, meaningRef: string, caps: WorldMomentCaps = momentCapsOf(world)): MomentInput {
  const ev = fromFreeJob(free, song, world, { seed: 0 });
  const ochi = analyzeStructure(song).ochi;
  const sections = (song.sections ?? []).map((s) => ({ start: s.start, end: s.end, type: s.type, ...(ochi && (s.start + s.end) / 2 >= ochi.start && (s.start + s.end) / 2 < ochi.end ? { ochi: true } : {}) }));
  const prot: ProtectedEvent[] = [
    ...(ev.holds ?? []).map((h) => ({ id: `hold:${h.kind}@${h.lineId}`, source: 'Q2' as const, at: h.at, from: h.from, to: h.to, changesLight: false })),
    ...(ev.handoffs ?? []).map((h) => ({ id: `${h.kind}@${h.lineId}`, source: 'Q4' as const, at: h.seam, from: h.seam - (h.prepare ?? LINK_PREPARE), to: h.seam - (h.prepare ?? LINK_PREPARE) + h.dur, changesLight: h.changesLight ?? true })),
  ];
  const seats = Object.fromEntries(ev.lines.flatMap((l) => (l.seats[0]?.box ? [[l.id, l.seats[0].box]] : [])));
  return {
    meaning,
    meaningRef,
    cues: free.job.cues.map((c) => ({ id: c.id, start: c.start, end: c.end, text: c.text, ...(c.charStarts ? { charStarts: c.charStarts } : {}), ...(c.charTimed ? { charTimed: true } : {}) })),
    sections,
    beats: song.beats ?? [],
    downbeats: song.downbeats ?? [],
    tempo: song.tempo,
    caps,
    protected: prot,
    seats,
  };
}

/** Today's gate, stage by stage: what each stage removes, in the order freeMoments applies them. */
export interface TodayGate {
  asks: number;
  /** validMeaning: asks on lines the song does not have. */
  unknownLine: number;
  /** checkMoments drops, by reason class (order-dependent spacing and count caps included). */
  checkMoments: Record<string, number>;
  notChorus: number;
  notDownbeat: number;
  overCap: number;
  kept: number;
  reason?: 'noMeaningCandidate';
}

const classOf = (reason: string) =>
  /no such form|not drawn yet|known lines|echo needs|echoed line|repeat, not an echo|struck line must|takes one line/.test(reason) ? 'legalCue'
  : /is negated here/.test(reason) ? 'negated'
  : /not in the line|part of the word|hangs off|is not a .* word|too long for|not in the earlier line|too short to carry/.test(reason) ? 'evidence'
  : /no sung times/.test(reason) ? 'timing'
  : /struck before|read whole/.test(reason) ? 'reading'
  : /call beside/.test(reason) ? 'shout'
  : /within .* s of another moment|more than/.test(reason) ? 'spacingOrCap'
  : 'other';

/** free-plan.ts freeMoments taken apart (same song preparation, same guards, same order), world-independent. */
export function todayGate(song0: SongTimeline, meaning: Meaning | undefined): TodayGate {
  const song = withoutEchoes(song0);
  const raw = meaning?.moments ?? [];
  const valid = validMeaning(meaning, song.cues as Cue[]);
  const asks = (valid?.moments ?? []) as MomentAsk[];
  const out: TodayGate = { asks: raw.length, unknownLine: raw.length - asks.length, checkMoments: {}, notChorus: 0, notDownbeat: 0, overCap: 0, kept: 0 };
  if (!raw.length) return { ...out, reason: 'noMeaningCandidate' };
  const sungOf = (id: string) => { const c = song.cues.find((x) => x.id === id); return c?.charStarts?.length ? { times: c.charStarts, source: 'line' } : undefined; };
  const { kept, dropped } = checkMoments(asks, song.cues, sungOf);
  for (const d of dropped) out.checkMoments[classOf(d.reason)] = (out.checkMoments[classOf(d.reason)] ?? 0) + 1;
  const chorusAt = (t: number) => song.sections.some((x) => x.type === 'chorus' && t >= x.start && t < x.end);
  const near = 30 / Math.max(40, song.tempo || 120);
  const onDownbeat = (t: number) => (song.downbeats ?? []).some((d) => Math.abs(d - t) <= near);
  const inChorus = kept.filter((m) => chorusAt(m.at));
  const onBeat = inChorus.filter((m) => onDownbeat(m.at));
  out.notChorus = kept.length - inChorus.length;
  out.notDownbeat = inChorus.length - onBeat.length;
  out.overCap = Math.max(0, onBeat.length - FREE_MOMENTS_MAX);
  out.kept = Math.min(FREE_MOMENTS_MAX, onBeat.length);
  return out;
}
