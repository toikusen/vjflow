// From a free plan's render job to the scheduler's input (world-events.ts), and the composition events a plan already
// makes, in the scheduler's own terms, so the two are counted the same way. Every time comes from what the renderer
// uses (Q1 phase 2, docs/research/2026-11-09-q1-phase2.md): a line's show and the linked page moves from line-shows.ts
// (the engine's own steps), a hold's window from the plan's stored event, a phrase only from times the aligner trusted.
import type { freeJob } from './free-plan';
import type { StyleWorld } from './style-world';
import type { SongTimeline, TimelineCue } from './timeline';
import { BEAT_CLEAR, FIRST_SET, growFits, KEPT } from './lineplan-core';
import { wordBreaks } from './phrases';
import { approvedOf, lineShows, type Section as ShownSection } from './render/line-shows';
import { readingSec } from './render/reading-window';
import { SET_SPECS } from './render/world-sets';
import { WORLD_BEATS } from './render/world-beats';
import { WORLD_CAM_SEC } from './render/world-cam';
import { LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import type { WorldLine } from './render/world-layout';
import { compositionsOf, linksOf, pageOf, sharedOf, WORLD_COMPOSITIONS, type BeatKind } from './world-shared';
import { LIGHT_GAP, seatsDiffer, type CameraMove, type InputWarning, type CompositionFamily, type FrameBox, type HandoffCandidate, type HoldEvent, type SeatCandidate, type SungWord, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';

type Free = ReturnType<typeof freeJob>;
type Job = Free['job'];
type Section = Omit<ShownSection, 'layers'> & { layers: (ShownSection['layers'][number] & { paper?: string; ink?: string; dark?: boolean; fx?: string })[] };

/** The five worlds drawn on one page (Codex C): their capability is declared in world-shared.ts compositions. */
export const ONE_PAGE_WORLDS = Object.keys(WORLD_COMPOSITIONS);

/** A set's nominal box, frame fractions, y down: its anchor, which side sits on it, its widest row and its height limit. */
export function seatOf(set: string): SeatCandidate {
  const s = SET_SPECS[set];
  if (!s) return { id: set };
  const [w, h] = s.vertical ? [s.tall * (1080 / 1920), s.share * (1920 / 1080)] : [s.share, s.tall];
  const x0 = s.at[0] - (w * (s.ax + 1)) / 2;
  const y0 = s.at[1] - (h * (s.ay + 1)) / 2;
  const box: FrameBox = { x0: +x0.toFixed(3), y0: +y0.toFixed(3), x1: +(x0 + w).toFixed(3), y1: +(y0 + h).toFixed(3) };
  return { id: set, box, ...(s.object ? { carrierId: s.object } : s.under?.some((u) => u.carrier) ? { carrierId: `${set}:under` } : {}), ...(s.vertical ? { vertical: true } : {}) };
}

/** A world's seat for a set: a set laid into a page of its own is carried by that page (a change of it is a change of page). */
export const seatIn = (world: StyleWorld, set: string): SeatCandidate => {
  const ground = pageOf(world, set);
  return { ...seatOf(set), ...(ground ? { carrierId: `ground:${ground}`, paged: true } : {}) };
};

/**
 * A world's caps for the scheduler: its declared composition capability (world-shared.ts), or capability off (no family:
 * the scheduler only keeps what the composer laid). `derived` gives the phase-1 dry run's caps, read off the world's
 * sets and camera, for comparison only.
 */
export function capsOf(world: StyleWorld, o: { derived?: boolean; off?: boolean } = {}): WorldCompositionCaps {
  const sets = [...new Set(world.layouts.lines.map((l) => l.set))];
  const seats = sets.map((s) => seatIn(world, s));
  const carrierRole: WorldCompositionCaps['carrierRole'] = world.sheet ? 'page' : world.standsOnPlate ? 'plate' : seats.some((s) => s.carrierId) ? 'object' : 'ground';
  const declared = compositionsOf(world.id);
  if (declared && !o.derived && !o.off) return { worldId: world.id, kinds: declared.kinds, seats: declared.seats ?? sets, carrierRole: declared.carrierRole, allowedAt: declared.allowedAt, duration: declared.duration, moves: declared.moves, ...(declared.protectedRegion ? { protectedRegion: declared.protectedRegion } : {}), source: 'declared' };
  if (!o.derived) return { worldId: world.id, kinds: [], seats: sets, carrierRole, source: 'declared-off' };
  const differs = seats.some((a) => seats.some((b) => seatsDiffer(a, b)));
  const kinds: CompositionFamily[] = [
    ...(differs ? ['layout-seat' as const] : []),
    ...(!world.ownMoves && linksOf(world.id).families.length ? ['page-handoff' as const] : []),
    ...(new Set(seats.map((s) => s.carrierId ?? '')).size > 1 ? ['carrier-swap' as const] : []),
    ...(sharedOf(world).camera !== 'still' ? ['camera-reframe' as const] : []),
  ];
  return { worldId: world.id, kinds, seats: sets, carrierRole, source: 'derived', ownPages: true };
}

const PHRASE_GAP = /[\s、，。！？!?,.;；:：「」『』()（）"“”]/;

/**
 * A line's sung phrases, only from per-character times the aligner trusted: split at its spaces and stops, else at its
 * words. Undefined when the timing is not trusted, does not match the text, or does not move (a line sung "all at once").
 */
export function sungWords(c: { text: string; start: number; end: number; charStarts?: number[]; charTimed?: boolean }): SungWord[] | undefined {
  const cs = [...c.text];
  const t = c.charStarts;
  if (!c.charTimed || !t || t.length !== cs.length || t.at(-1)! - t[0] < 0.2 || t.some((x, i) => i > 0 && x < t[i - 1] - 1e-3)) return undefined;
  const heads: number[] = [];
  cs.forEach((ch, i) => { if (!PHRASE_GAP.test(ch) && (i === 0 || PHRASE_GAP.test(cs[i - 1]))) heads.push(i); });
  const starts = heads.length > 1 ? heads : [...wordBreaks(c.text)].filter((k) => k < cs.length && !PHRASE_GAP.test(cs[k])).sort((a, b) => a - b);
  if (starts.length < 2) return undefined;
  return starts.map((k, n) => ({ text: cs.slice(k, starts[n + 1] ?? cs.length).join('').trim(), from: +t[k].toFixed(3), to: +(n + 1 < starts.length ? t[starts[n + 1]] : c.end).toFixed(3) }));
}

/**
 * The job as the renderer sets it, on a copy: its lines in order with their real show times, the linked handoffs laid
 * (with their real windows) and the sections after the pictures were pulled and the pages linked.
 */
export function shownOf(job: Job) {
  const treatment = structuredClone(job.treatment) as unknown as Parameters<typeof lineShows>[0] & { graphics?: { sections: Section[] } };
  const sections = (treatment.graphics?.sections ?? []) as Section[];
  const { styled, showAt, laid } = lineShows(treatment, job.cues as TimelineCue[], job.tempo, sections, approvedOf(job.treatment));
  const linked = sections.filter((s) => s.transition?.kind.startsWith('link-') && s.transition.seam !== undefined).sort((x, y) => x.start - y.start);
  if (linked.length !== laid.length) throw new Error(`linkGrounds laid ${laid.length} handoffs on ${linked.length} sections`);
  const handoffs: HandoffCandidate[] = laid.map((x, k) => ({ lineId: x.id, kind: x.kind, dir: x.dir, seam: +(linked[k].start + linked[k].transition!.seam!).toFixed(3), dur: linked[k].transition!.dur ?? LINK_PREPARE + LINK_CLEAR, prepare: linked[k].transition!.seam! }));
  const rows = styled.map(({ style, cue }, i) => ({ id: cue.id, cue, shot: style.shot, world: style.world as WorldLine | undefined, show: +showAt[i].toFixed(3) }));
  // the composer's own lyric handoffs that survived the engine's gating: a page handoff each, fixed, its whole window
  const lyric: HandoffCandidate[] = styled.flatMap(({ style }, i) => (style.handoff ? [{ lineId: rows[i].id, kind: `lyric-${style.handoff.kind}`, dir: 0, seam: rows[i].show, prepare: +(rows[i].show - style.handoff.from).toFixed(3), dur: +(style.handoff.to - style.handoff.from).toFixed(3) }] : []));
  return { rows, handoffs: [...handoffs, ...lyric].sort((x, y) => x.seam - y.seam), sections };
}

/** What lights a section: every layer's paper, ink and darkness (not only its ground's). */
const lightKey = (s: Section) => s.layers.map((l) => `${l.paper ?? ''}|${l.ink ?? ''}|${l.dark ? 1 : 0}`).join(',');
/** Changes of the frame's light the scheduler does not own: a section lit otherwise than the one before (any layer). */
export function lightsOf(sections: Section[]): { at: number; what: string }[] {
  // (a linked section's light changes at its switch, not when its page starts to come on: render/world-handoff sectionClock)
  const at = (s: Section) => +(s.start + (s.transition?.kind.startsWith('link-') ? s.transition.seam ?? 0 : 0)).toFixed(3);
  return sections.flatMap((s, i) => (i > 0 && lightKey(sections[i - 1]) !== lightKey(s) ? [{ at: at(s), what: `light ${lightKey(sections[i - 1]).slice(0, 40)} → ${lightKey(s).slice(0, 40)}` }] : []));
}

/** A line's Q2 hold as the plan stored it (lineplan-core beatOfLine): its whole window, the plan's own length. */
const holdOf = (id: string, w?: WorldLine): HoldEvent | undefined => {
  const b = w?.beat;
  const sec = b ? b.sec ?? WORLD_BEATS[b.kind as BeatKind]?.sec : undefined;
  return b && sec ? { lineId: id, at: b.at, from: b.at, to: +(b.at + sec).toFixed(3), kind: b.kind } : undefined;
};

/**
 * Where a switch inside a held line may fall, by Q2's own rules (lineplan-core beatOfLine): an event that lays a new ink
 * or a carrier's move belongs to the line's first set (nothing before it is over), one that is kept stays to the line's
 * end (nothing after it), and none lands within BEAT_CLEAR of a change of set. A grown block must have room in the seat
 * it grows in.
 */
export function holdRoom(c: { text: string; start: number; end: number }, hold: HoldEvent | undefined, seats: string[]): WorldEventLine['inLine'] {
  if (!hold) return undefined;
  const kind = hold.kind as BeatKind;
  const [before, after]: [number, number][] = [[c.start, hold.at - BEAT_CLEAR], [hold.to + BEAT_CLEAR / 2, c.end]];
  const spans = (KEPT.has(kind) && FIRST_SET.has(kind) ? [] : KEPT.has(kind) ? [before] : FIRST_SET.has(kind) ? [after] : [before, after]).filter(([a, b]) => b > a);
  const grows = kind === 'line-grow' ? seats.filter((s) => SET_SPECS[s] && growFits(c.text, SET_SPECS[s])) : undefined;
  return { spans, ...(grows ? { seats: grows } : {}) };
}

/** Whether a world's set takes a line's text (its length, a column's no Latin, never the closing set): the dry run's test. */
const fitsSet = (world: StyleWorld, set: string, text: string) => {
  const l = world.layouts.lines.find((x) => x.set === set);
  const n = [...text.replace(/\s/g, '')].length;
  return !l || ((l.max ?? 99) >= n && n >= (l.min ?? 0) && (!l.column || !/[A-Za-z0-9]/.test(text)) && l.closing !== true);
};

/**
 * A free job as the scheduler's input: its shown lines (the composer's seat first, then the seats it found legal), the
 * song's beats and sections, the world's capability, Q2's holds, Q4's linked handoffs, the composer's camera moves into
 * parts and the light changes of its grounds. A world with no capability comes in pinned, its own reposes given.
 * `window` keeps the lines that overlap it and the holds and handoffs on them; `derived` is the phase-1 dry run.
 */
export function fromJob(job: Job, song: SongTimeline, world: StyleWorld, o: { seed?: number; window?: [number, number]; derived?: boolean; off?: boolean } = {}): WorldEventInput {
  const { rows: all, handoffs, sections } = shownOf(job);
  const caps = capsOf(world, { derived: o.derived, off: o.off });
  const on = caps.source !== 'declared-off';
  const [a, b] = o.window ?? [-Infinity, Infinity];
  const rows = all.filter((r) => r.cue.end > a && r.cue.start < b);
  const ids = new Set(rows.map((r) => r.id));
  const shared = new Set(all.filter((r, i) => all.some((x, j) => j !== i && x.shot === r.shot)).map((r) => r.id));
  const lines: WorldEventLine[] = rows.map(({ id, cue, show, world: w, shot }) => {
    const set = w?.set ?? `${shot}:lyric`;
    const own = w ? seatIn(world, set) : { id: set };
    // (the derived dry run offers every set of the world that takes the text, as phase 1 did)
    // (a set laid into a page of its own trades only with another such set: the shot's page goes with the words)
    const paged = (x: string) => !!pageOf(world, x);
    const legal = !w ? [] : o.derived ? caps.seats.filter((s) => s !== set && fitsSet(world, s, cue.text)) : on ? (w.seats ?? []).filter((s) => paged(s) === paged(set)) : (w.repose ?? []).map((r) => r.set);
    const hold = holdOf(id, w);
    const words = sungWords(cue);
    const pinned = !on ? 'composition capability off' : !w ? 'not a world line' : shared.has(id) ? 'shares its shot' : o.derived ? undefined : !w.seats ? 'a set piece or a call keeps its set' : w.blow ? 'a blown-up word keeps its set' : hold ? `its ${hold.kind} hold was planned on this set (Q2)` : undefined;
    // (a blown-up word holds its picture until the line is read: a change of set only after, lineplan-core)
    const read = w?.blow ? cue.start + readingSec(cue.text, cue.start, cue.end) : undefined;
    const room0 = on && !o.derived ? holdRoom(cue, hold, legal) : undefined;
    const room = read === undefined ? room0 : { ...room0, spans: (room0?.spans ?? [[cue.start, cue.end]]).flatMap(([x, y]): [number, number][] => (y > Math.max(x, read) ? [[Math.max(x, read), y]] : [])) };
    return {
      id, show, start: cue.start, end: cue.end, ...(words ? { words } : {}), seats: [own, ...legal.map((s) => seatIn(world, s))], seat: set,
      ...(pinned ? { pinned } : {}), ...(room ? { inLine: room } : {}),
      ...(!on && w?.repose?.length ? { given: w.repose.map((r) => ({ at: r.at, seat: r.set, reason: 'repose (composer, capability off)' })) } : {}),
    };
  });
  const cams: CameraMove[] = rows.flatMap(({ id, world: w }) => (w?.cam && WORLD_CAM_SEC[w.cam.kind] ? [{ lineId: id, at: w.cam.at, sec: WORLD_CAM_SEC[w.cam.kind], kind: w.cam.kind }] : []));
  const inWin = (t: number) => t > a - 3 && t < b + 3;
  return {
    lines,
    beats: (song.beats ?? []).filter(inWin),
    downbeats: (song.downbeats ?? []).filter(inWin),
    sections: (song.sections ?? []).map((s) => ({ start: s.start, energy: s.energy })),
    // (the world's declared seats stay the whitelist for new candidates; a pinned or given seat is the line's own, never widened into it)
    caps,
    holds: rows.flatMap(({ id, world: w }) => { const h = holdOf(id, w); return h ? [h] : []; }),
    handoffs: handoffs.filter((h) => ids.has(h.lineId)),
    lights: lightsOf(sections).filter((l) => inWin(l.at)),
    cams,
    seed: o.seed ?? 0,
  };
}

/** fromJob on a free plan's job (the Q3 and Q5 adapters read its lines, holds and handoffs). */
export const fromFreeJob = (free: { job: Job }, song: SongTimeline, world: StyleWorld, o: { seed?: number; window?: [number, number]; derived?: boolean; off?: boolean } = {}) => fromJob(free.job, song, world, o);

/**
 * The composition events a job already draws, as the scheduler would write them: a line boundary whose set really
 * differs (seatsDiffer), a change of set inside a line (repose), a linked page handoff (Q4) or a line's own handoff, a
 * world camera move into a part. A boundary carrying several is one event; ground fills, wipes, pieces and holds are none.
 * Read off the job as drawn (real shows, line-shows.ts), so it counts a scheduled job's realised plan the same way.
 */
export function currentEvents(free: { job: Job }, _song: SongTimeline, world: StyleWorld): WorldEvent[] {
  const { rows, handoffs } = shownOf(free.job);
  const hands = new Map(handoffs.map((h) => [h.lineId, h]));
  const seat = (set: string) => seatIn(world, set);
  const out: WorldEvent[] = [];
  let here = '';
  const ev = (e: Omit<WorldEvent, 'id' | 'changesLight'> & { changesLight?: boolean }) => out.push({ id: `${e.kind}:${e.lineIds.at(-1)}:${out.length}`, changesLight: false, ...e });
  rows.forEach(({ id, world: w, show, shot }, i) => {
    const set = w?.set ?? `${shot}:lyric`;
    // (a linked page move or the composer's own lyric handoff that survived gating: one page handoff, its whole window)
    const q4 = hands.get(id);
    const moved = i > 0 && seatsDiffer(seat(here), seat(set));
    const cam = w?.cam && WORLD_CAM_SEC[w.cam.kind] ? w.cam : undefined;
    const before = here;
    if (i > 0 && q4) ev({ lineIds: [rows[i - 1].id, id], kind: 'page-handoff', at: q4.seam, from: q4.seam - (q4.prepare ?? LINK_PREPARE), to: q4.seam - (q4.prepare ?? LINK_PREPARE) + q4.dur, seatBefore: before, seatAfter: set, scope: 'line', changesLight: true, reason: q4.kind });
    else if (moved) ev({ lineIds: [id], kind: 'layout-seat', at: show, from: show, to: show, seatBefore: before, seatAfter: set, scope: 'line', reason: 'set changes at the line' });
    else if (i > 0 && cam) ev({ lineIds: [id], kind: 'camera-reframe', at: cam.at, from: cam.at, to: cam.at + WORLD_CAM_SEC[cam.kind], seatBefore: before, seatAfter: set, scope: 'section', reason: `world camera ${cam.kind}` });
    here = set;
    for (const r of w?.repose ?? []) {
      if (!seatsDiffer(seat(here), seat(r.set))) { here = r.set; continue; }
      ev({ lineIds: [id], kind: 'layout-seat', at: r.at, from: r.at, to: r.at, seatBefore: here, seatAfter: r.set, scope: 'in-line', reason: 'repose' });
      here = r.set;
    }
  });
  return out;
}

/**
 * The final job checked against the event plan it carries (2026-11-09 review: the plan was scheduled on the first draw and
 * attached to the second unchecked): every switch at a line's boundary falls on the line's show and the line is drawn in
 * the approved seat (a page set on its page), every switch inside a line is in its repose at the approved time, every
 * approved page handoff is laid with its approved seam and window and no other is. A mismatch is an InputWarning naming
 * the event, never silently accepted.
 */
export function verifyWorldEvents(job: Job, world: StyleWorld, table: { events: WorldEvent[] }): InputWarning[] {
  const { rows, handoffs, sections } = shownOf(job);
  const out: InputWarning[] = [];
  const miss = (id: string, why: string) => out.push({ inputs: [id], reason: `final check: ${why}` });
  const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
  for (const e of table.events) {
    const row = rows.find((r) => r.id === e.lineIds[e.lineIds.length - 1]);
    if (!row) { miss(e.id, 'line not shown'); continue; }
    if (e.scope === 'in-line') {
      if (e.kind === 'layout-seat' && !(row.world?.repose ?? []).some((r) => near(r.at, e.at) && r.set === e.seatAfter)) miss(e.id, `in-line switch to ${e.seatAfter} at ${e.at} not in the drawn repose`);
      continue;
    }
    if (e.kind === 'camera-reframe') {
      if (!row.world?.cam || !near(row.world.cam.at, e.at)) miss(e.id, `camera move at ${e.at} not drawn`);
      continue;
    }
    if (e.kind === 'page-handoff') {
      const h = handoffs.find((x) => x.lineId === row.id);
      if (!h || !near(h.seam, e.at) || !near(h.seam - (h.prepare ?? LINK_PREPARE), e.from) || !near(h.seam - (h.prepare ?? LINK_PREPARE) + h.dur, e.to)) miss(e.id, `handoff ${e.from}–${e.at}–${e.to} not laid as approved (${h ? `${h.seam - (h.prepare ?? LINK_PREPARE)}–${h.seam}` : 'none'})`);
    } else if (e.kind !== 'keep' && !near(e.at, row.show)) miss(e.id, `approved at ${e.at}, drawn from the line's show ${row.show}`);
    const set = row.world?.set;
    if (row.world && SET_SPECS[e.seatAfter] && set !== e.seatAfter) miss(e.id, `drawn in ${set}, approved ${e.seatAfter}`);
    const page = set ? pageOf(world, set) : undefined;
    if (page) {
      const under = [...sections].reverse().find((s) => s.start <= row.cue.start + 1e-3);
      if (under && !under.layers.some((l) => l.fx === page)) miss(e.id, `${set} drawn on page ${under.layers[0]?.fx}, not its own ${page}`);
    }
  }
  const approved = new Set(table.events.filter((e) => e.kind === 'page-handoff').map((e) => e.lineIds[e.lineIds.length - 1]));
  for (const h of handoffs) if (!approved.has(h.lineId)) miss(`${h.kind}@${h.lineId}`, 'a handoff is laid that the plan does not hold');
  return out;
}

/**
 * The whole frame's light across the final job (a world the scheduler takes over): every change of light, the sections'
 * (any layer's paper, ink or darkness, recovery included) and the switches the plan marks as changing it, at least
 * LIGHT_GAP apart; one frame (50 ms) is one change. Each pair closer is an InputWarning.
 */
export function lightGapWarnings(job: Job, table: { events: WorldEvent[] }): InputWarning[] {
  const { sections } = shownOf(job);
  const all = [...lightsOf(sections).map((l) => ({ at: l.at, what: l.what })), ...table.events.filter((e) => e.changesLight && e.kind !== 'keep').map((e) => ({ at: e.at, what: e.id }))].sort((x, y) => x.at - y.at);
  const out: InputWarning[] = [];
  all.forEach((a, i) => { const b = all[i + 1]; if (b && b.at - a.at >= 0.05 && b.at - a.at < LIGHT_GAP) out.push({ inputs: [a.what, b.what], reason: `final check: light changes ${(b.at - a.at).toFixed(2)}s apart at ${a.at.toFixed(2)} (< ${LIGHT_GAP}s)` }); });
  return out;
}
