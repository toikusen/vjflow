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
import { WORLD_ENTERS } from './render/world-motion';
import { enterSec as lineEnterSec } from './render/enter-sec';
import type { EnterKind } from './treatment';
import { WORLD_CAM_SEC } from './render/world-cam';
import { EXIT_LEAD, LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import type { WorldLine } from './render/world-layout';
import { compositionsOf, isPageSeat, linksOf, pageOf, pageSeatsOf, sharedOf, WORLD_COMPOSITIONS, type BeatKind } from './world-shared';
import { boxesMeet, laidSeat, panelSplit } from './render/seat-geometry';
import { absorbInk } from './render/hold-room';
import { lineFace } from './fonts';
import { DEFAULT_DESIGN } from './design';
import { ABSORBABLE_HOLDS, ACTION_GAP, BEAT_SNAP, holdIdOf, LIGHT_GAP, READ_STABLE, sameWords, SEAM_GAP, seatsDiffer, type AbsorbedHold, type AbsorbRoom, type CameraMove, type InputWarning, type LineOutcome, type CompositionFamily, type FrameBox, type HandoffCandidate, type HoldEvent, type JointHold, type SeatCandidate, type SungWord, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';

type Free = ReturnType<typeof freeJob>;
type Job = Free['job'];
type Section = Omit<ShownSection, 'layers'> & { layers: (ShownSection['layers'][number] & { paper?: string; ink?: string; dark?: boolean; fx?: string })[] };

/** The face each line of a job is set in (fonts.ts lineFace: the engine's own choice), as a lookup by its text. */
export const jobFaces = (job: Job) => (text: string) => lineFace(text, job.fonts, job.treatment.design?.accentFont ?? DEFAULT_DESIGN.accentFont);
/**
 * The faces a job's scheduled world was laid on (Q1 phase 3c): the job's own when its event table is the scheduler's
 * (`declared`); a job the scheduler did not take keeps the old plan measure (its record is unchanged).
 */
export const scheduledFaces = (job: Job): ((text: string) => string) | undefined => ((job.treatment as { worldEvents?: { source?: string } }).worldEvents?.source === 'declared' ? jobFaces(job) : undefined);

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

/**
 * A world's seat for a set: a set laid into a page of its own is carried by that page (a change of it is a change of
 * page; two seats on one page share it). Given the line's words, the box is where they are really laid (render/
 * seat-geometry.ts, after layout: rows, size, shear, a split line's parts), with their type size; a seat the scheduler
 * adds on a page (world-shared pageSeats) carries that page's graphics as the regions its words keep off.
 */
export const seatIn = (world: StyleWorld, set: string, text?: string, faces?: (text: string) => string): SeatCandidate => {
  const ground = pageOf(world, set);
  const laid = text !== undefined ? laidSeat(text, set, { font: faces?.(text) }) : undefined;
  // (a seat that carries the page's own layout on panels of its own, poster-panel: the same page, another carrier)
  const panels = SET_SPECS[set]?.panels ? ':panels' : '';
  return {
    ...seatOf(set),
    ...(laid ? { box: laid.box, size: laid.size, text, ...(isPageSeat(set) && laid.protect.length ? { protect: laid.protect } : {}) } : {}),
    ...(ground ? { carrierId: `ground:${ground}${panels}`, paged: true, page: ground } : {}),
  };
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
  // (a world's declared seats, or all of its sets and the seats it adds on their pages)
  if (declared && !o.derived && !o.off) return { worldId: world.id, kinds: declared.kinds, seats: declared.seats ?? [...sets, ...pageSeatsOf(world.id)], carrierRole: declared.carrierRole, allowedAt: declared.allowedAt, duration: declared.duration, moves: declared.moves, ...(declared.protectedRegion ? { protectedRegion: declared.protectedRegion } : {}), ...(declared.materials ? { materials: declared.materials } : {}), ...(declared.entranceAndInLine ? { entranceAndInLine: true } : {}), source: 'declared' };
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

/** How near a sung word's start a switch must fall to count as at that word: the scheduler's own snap (world-events BEAT_SNAP). */
export const SUNG_NEAR = BEAT_SNAP;
/** Whether `t` falls at a word the line really sings (the aligner's trusted times), not at a proportional guess. */
export const sungAt = (words: SungWord[] | undefined, t: number) => !!words?.some((w) => Math.abs(w.from - t) <= SUNG_NEAR);

const r3 = (x: number) => +x.toFixed(3);
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
  const rows = styled.map(({ style, cue }, i) => ({ id: cue.id, cue, shot: style.shot, world: style.world as WorldLine | undefined, show: +showAt[i].toFixed(3), enter: style.enter as string | undefined }));
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
  // (a growing block's page is drawn round it at its grown size from the start: panels built round its parts would stand
  // off the words until it grows, so a seat carried on panels is never one a grow may move into)
  const grows = kind === 'line-grow' ? seats.filter((s) => SET_SPECS[s] && !SET_SPECS[s].panels && growFits(c.text, SET_SPECS[s])) : undefined;
  return { spans, ...(grows ? { seats: grows } : {}) };
}

/**
 * What a held line offers for absorption (Q1 phase 4a, Codex 2026-11-10 §3 (b)): an ink-only hold (ABSORBABLE_HOLDS)
 * the composer found keeps its ink on these of the line's legal seats (WorldLine beatAbsorb), with the ink it settles
 * into on each and an ink-swap's phrase; undefined for every other kind, whatever the composer recorded. Kept apart from
 * holdRoom so whatever narrows the line's room (a blown-up word's reading, a world's own seat rules) carries it as is.
 */
export function absorbRoomOf(hold: HoldEvent | undefined, w: Pick<WorldLine, 'beatAbsorb' | 'beat'> | undefined, seats: string[]): AbsorbRoom | undefined {
  const offer = w?.beatAbsorb;
  if (!hold || !offer || !ABSORBABLE_HOLDS.has(hold.kind)) return undefined;
  const merge = offer.seats.filter((s) => seats.includes(s) && !!offer.inks[s]);
  return merge.length ? { holdId: holdIdOf(hold), kind: hold.kind, seats: merge, inks: Object.fromEntries(merge.map((s) => [s, offer.inks[s]])), ...(w?.beat?.span ? { span: w.beat.span } : {}) } : undefined;
}
/** A line's in-line room with its absorption offer laid on last (phase 4a): never dropped by a room rebuilt before it. */
export const withAbsorb = (room: WorldEventLine['inLine'], absorb: AbsorbRoom | undefined): WorldEventLine['inLine'] => (absorb ? { ...(room ?? { spans: [] }), absorb } : room);

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
export function fromJob(job: Job, song: SongTimeline, world: StyleWorld, o: { seed?: number; window?: [number, number]; derived?: boolean; off?: boolean; joint?: boolean } = {}): WorldEventInput {
  const { rows: all, handoffs, sections } = shownOf(job);
  const caps = capsOf(world, { derived: o.derived, off: o.off });
  const on = caps.source !== 'declared-off';
  // (phase 4c: the composer's holds come in as candidates on each seat, none decided; only a scheduled world)
  const joint = !!o.joint && on && !o.derived;
  // (a scheduled world's seats are laid on the renderer's own measure of the job's face; off, the old record as it was)
  const faces = on && !o.derived ? jobFaces(job) : undefined;
  const [a, b] = o.window ?? [-Infinity, Infinity];
  const rows = all.filter((r) => r.cue.end > a && r.cue.start < b);
  const ids = new Set(rows.map((r) => r.id));
  const shared = new Set(all.filter((r, i) => all.some((x, j) => j !== i && x.shot === r.shot)).map((r) => r.id));
  const lines: WorldEventLine[] = rows.map(({ id, cue, show, world: w, shot, enter }) => {
    const set = w?.set ?? `${shot}:lyric`;
    const own = w ? seatIn(world, set, cue.text, faces) : { id: set };
    // (the derived dry run offers every set of the world that takes the text, as phase 1 did)
    // (a set laid into a page of its own trades only with another such set: the shot's page goes with the words)
    const paged = (x: string) => !!pageOf(world, x);
    const legal = !w ? [] : o.derived ? caps.seats.filter((s) => s !== set && fitsSet(world, s, cue.text)) : on ? (w.seats ?? []).filter((s) => paged(s) === paged(set)) : (w.repose ?? []).map((r) => r.set);
    const hold = holdOf(id, w);
    const cands = joint ? jointHoldsOf(id, w) : undefined;
    // (the hold the composer would have committed on its own set: the one an absorption offer was found for)
    const ownHold = cands?.filter((h) => h.seat === set).sort((x, y) => x.rank - y.rank)[0]?.hold;
    const words = sungWords(cue);
    const pinned = !on ? 'composition capability off' : !w ? 'not a world line' : shared.has(id) ? 'shares its shot' : o.derived ? undefined : !w.seats ? 'a set piece or a call keeps its set' : w.blow ? 'a blown-up word keeps its set' : hold ? `its ${hold.kind} hold was planned on this set (Q2)` : undefined;
    // (a blown-up word holds its picture until the line is read: a change of set only after, lineplan-core)
    const read = w?.blow ? cue.start + readingSec(cue.text, cue.start, cue.end) : undefined;
    const room0 = on && !o.derived ? holdRoom(cue, hold, legal) : undefined;
    const absorb = on && !o.derived ? absorbRoomOf(joint ? ownHold : hold, w, legal) : undefined;
    // (joint: no hold is decided, so the line's in-line room is the whole line until a hold is committed; an absorption
    // offer rides on that room, never as an empty one)
    const room1 = read === undefined ? (joint && absorb ? { spans: [[cue.start, cue.end]] as [number, number][] } : room0) : { ...room0, spans: (room0?.spans ?? [[cue.start, cue.end]]).flatMap(([x, y]): [number, number][] => (y > Math.max(x, read) ? [[Math.max(x, read), y]] : [])) };
    // (phase 4a: the absorption offer goes on last, over whatever room the line was left)
    const room = withAbsorb(room1, absorb);
    // (the longest the line's entrance can take: the world's own move at full pace, or the line's drawn entrance; the
    // renderer runs either at its pace, never longer: world-layout enterDur, enter-sec.ts)
    const entrance = Math.max(w ? WORLD_ENTERS[w.enter]?.sec ?? 0 : 0, enter ? lineEnterSec(enter as never, 1) || 0 : 0);
    return {
      id, show, start: cue.start, end: cue.end, ...(words ? { words } : {}), settled: +(show + entrance).toFixed(3), seats: [own, ...legal.map((s) => seatIn(world, s, cue.text, faces))], seat: set,
      ...(pinned ? { pinned } : {}), ...(room ? { inLine: room } : {}), ...(shared.has(id) ? { sharesShot: true } : {}), ...(cands?.length ? { holdCands: cands } : {}),
      // (a given repose whose time no sung word stands at is the composer's proportional guess: kept, labelled, counted)
      ...(!on && w?.repose?.length ? { given: w.repose.map((r) => ({ at: r.at, seat: r.set, reason: 'repose (composer, capability off)', ...(sungAt(words, r.at) ? {} : { unreliable: true }) })) } : {}),
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
    ...(joint ? { joint: true } : {}),
    seed: o.seed ?? 0,
  };
}

/** A line's hold candidates as the composer listed them on each seat (phase 4c, WorldLine holdCands), in the scheduler's terms. */
export function jointHoldsOf(id: string, w: WorldLine | undefined): JointHold[] {
  return (w?.holdCands ?? []).flatMap((c) => {
    const sec = c.beat.sec ?? WORLD_BEATS[c.beat.kind as BeatKind]?.sec;
    return sec ? [{ seat: c.seat, hold: { lineId: id, at: c.beat.at, from: c.beat.at, to: +(c.beat.at + sec).toFixed(3), kind: c.beat.kind }, rank: c.rank, slack: c.slack }] : [];
  });
}

/** fromJob on a free plan's job (the Q3 and Q5 adapters read its lines, holds and handoffs). */
export const fromFreeJob = (free: { job: Job }, song: SongTimeline, world: StyleWorld, o: { seed?: number; window?: [number, number]; derived?: boolean; off?: boolean } = {}) => fromJob(free.job, song, world, o);

/**
 * The composition events a job already draws, as the scheduler would write them: a line boundary whose set really
 * differs (seatsDiffer), a change of set inside a line (repose), a linked page handoff (Q4) or a line's own handoff, a
 * world camera move into a part. A boundary carrying several is one event; ground fills, wipes, pieces and holds are none.
 * Read off the job as drawn (real shows, line-shows.ts), so it counts a scheduled job's realised plan the same way.
 */
export function currentEvents(free: { job: Job }, _song: SongTimeline | undefined, world: StyleWorld, faces = scheduledFaces(free.job)): WorldEvent[] {
  const { rows, handoffs } = shownOf(free.job);
  const hands = new Map(handoffs.map((h) => [h.lineId, h]));
  const out: WorldEvent[] = [];
  let here = '';
  let at: SeatCandidate | undefined;
  const ev = (e: Omit<WorldEvent, 'id' | 'changesLight'> & { changesLight?: boolean }) => out.push({ id: `${e.kind}:${e.lineIds.at(-1)}:${out.length}`, changesLight: false, ...e });
  rows.forEach(({ id, cue, world: w, show, shot }, i) => {
    const set = w?.set ?? `${shot}:lyric`;
    const seat = (x: string) => seatIn(world, x, cue.text, faces);
    // (a linked page move or the composer's own lyric handoff that survived gating: one page handoff, its whole window)
    const q4 = hands.get(id);
    const moved = i > 0 && seatsDiffer(at, seat(set));
    const cam = w?.cam && WORLD_CAM_SEC[w.cam.kind] ? w.cam : undefined;
    const before = here;
    // (the line before wiped by the world's own erase as this one shows: one reseat, its window the wipe's)
    const wipe = i > 0 ? rows[i - 1].world?.wipe : undefined;
    if (i > 0 && q4) ev({ lineIds: [rows[i - 1].id, id], kind: 'page-handoff', at: q4.seam, from: q4.seam - (q4.prepare ?? LINK_PREPARE), to: q4.seam - (q4.prepare ?? LINK_PREPARE) + q4.dur, seatBefore: before, seatAfter: set, scope: 'line', changesLight: true, reason: q4.kind });
    else if (i > 0 && w?.page) ev({ lineIds: [rows[i - 1].id, id], kind: 'page-handoff', at: w.page.at, from: w.page.at, to: +(w.page.at + w.page.sec).toFixed(3), seatBefore: before, seatAfter: set, scope: 'line', reason: w.page.move, move: w.page.move, material: w.page.move, ...(compositionsOf(world.id)?.materials?.[w.page.move]?.counts === 'seen' ? { holdLevel: true } : {}) });
    else if (moved && wipe) ev({ lineIds: [rows[i - 1].id, id], kind: 'layout-seat', at: show, from: wipe.from, to: +(wipe.from + wipe.sec).toFixed(3), seatBefore: before, seatAfter: set, scope: 'line', reason: wipe.move, move: wipe.move, material: wipe.move });
    // (a Q3 scale composition is the line's switch at its show, whether or not its set changes: one event)
    else if (w?.scale && !moved) ev({ lineIds: [id], kind: 'layout-seat', at: show, from: show, to: show, seatBefore: before, seatAfter: `${set}+scale:${w.scale.edge}`, scope: 'line', reason: `scale ${w.scale.eventId}` });
    else if (moved) ev({ lineIds: [id], kind: 'layout-seat', at: show, from: show, to: show, seatBefore: before, seatAfter: set, scope: 'line', reason: 'set changes at the line' });
    else if (i > 0 && cam) ev({ lineIds: [id], kind: 'camera-reframe', at: cam.at, from: cam.at, to: cam.at + WORLD_CAM_SEC[cam.kind], seatBefore: before, seatAfter: set, scope: 'section', reason: `world camera ${cam.kind}` });
    here = set;
    at = seat(set);
    for (const r of w?.repose ?? []) {
      const to = seat(r.set);
      // (a repose by the world's own carrier move is a carrier swap over its own time)
      if (seatsDiffer(at, to)) ev({ lineIds: [id], kind: r.move ? 'carrier-swap' : 'layout-seat', at: r.at, from: r.at, to: +(r.at + (r.sec ?? 0)).toFixed(3), seatBefore: here, seatAfter: r.set, scope: 'in-line', reason: r.move ?? 'repose', ...(r.move ? { move: r.move, material: r.move } : {}) });
      here = r.set;
      at = to;
    }
  });
  return out;
}

/** One planned event as the final job draws it: its kind, seat, page, switch point and window on both sides. */
export interface Landing {
  id: string;
  plan: { kind: WorldEvent['kind']; seat: string; page?: string; at: number; from: number; to: number };
  drawn?: { kind: WorldEvent['kind']; seat: string; page?: string; at: number; from: number; to: number };
  same: boolean;
  why?: string;
}

/**
 * Every event of a plan side by side with what the final job draws (Q1 phase 3a step 1, docs/research/2026-11-09-q1-
 * phase2-codex.md §5.1): a cut is found among the job's own composition events (currentEvents, read off the drawn job
 * with real shows) on the same line, at the same switch point, of the same kind, into the same seat, on the same page,
 * over the same window; a keep finds no cut at its line's boundary and the line drawn in the seat it kept. A drawn cut
 * no plan event claims is `extra`. Times agree to 2 ms.
 */
export function landedEvents(job: Job, world: StyleWorld, table: { events: WorldEvent[] }, faces = scheduledFaces(job)): { events: Landing[]; extra: WorldEvent[] } {
  const { rows, sections } = shownOf(job);
  const drawn = currentEvents({ job }, undefined, world, faces);
  const claimed = new Set<WorldEvent>();
  const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
  const pageUnder = (row: (typeof rows)[number]) => [...sections].reverse().find((s) => s.start <= row.cue.start + 1e-3)?.layers.find((l) => l.fx && pageOf(world, row.world?.set ?? '') === l.fx)?.fx;
  const inLine = (e: WorldEvent) => e.scope === 'in-line';
  // (a plan's carrier swap is drawn as a change of set whose carrier changes: the job's events name it a reseat)
  const kindOk = (p: WorldEvent['kind'], d: WorldEvent['kind']) => p === d || (p === 'carrier-swap' && d === 'layout-seat');
  const events = table.events.map((e): Landing => {
    const line = e.lineIds.at(-1)!;
    const row = rows.find((r) => r.id === line);
    const plan = { kind: e.kind, seat: e.seatAfter, page: pageOf(world, e.seatAfter), at: e.at, from: e.from, to: e.to };
    if (!row) return { id: e.id, plan, same: false, why: 'line not shown' };
    const mine = drawn.filter((d) => d.lineIds.at(-1) === line && inLine(d) === inLine(e));
    if (e.kind === 'keep') {
      const cut = mine.find((d) => !inLine(d) && d.kind !== 'camera-reframe');
      const seat = row.world?.set ?? '';
      const d = { kind: (cut?.kind ?? 'keep') as WorldEvent['kind'], seat, page: pageUnder(row), at: row.show, from: row.show, to: row.show };
      const why = cut ? `kept, drawn with a ${cut.kind} at ${cut.at}` : SET_SPECS[e.seatAfter] && seat !== e.seatAfter ? `kept ${e.seatAfter}, drawn in ${seat}` : undefined;
      return { id: e.id, plan, drawn: d, same: !why, ...(why ? { why } : {}) };
    }
    const d = mine.find((x) => !claimed.has(x) && near(x.at, e.at) && kindOk(e.kind, x.kind)) ?? mine.find((x) => !claimed.has(x) && near(x.at, e.at));
    if (!d) return { id: e.id, plan, same: false, why: e.material ? `approved material move ${e.material} not drawn on ${line} at ${e.at}` : `no ${e.kind} drawn on ${line} at ${e.at}` };
    claimed.add(d);
    const seat = e.kind === 'camera-reframe' ? e.seatAfter : d.seatAfter;
    const got = { kind: d.kind, seat, page: pageOf(world, seat), at: d.at, from: d.from, to: d.to };
    const why = [
      // (an approved material move must be drawn as that move, never as the plain switch beside it)
      (e.material ?? '') !== (d.material ?? '') && `approved material move ${e.material ?? 'none'} not drawn (drawn: ${d.material ?? 'a plain ' + d.kind})`,
      !kindOk(e.kind, d.kind) && `kind ${e.kind} drawn as ${d.kind}`,
      e.kind !== 'camera-reframe' && SET_SPECS[e.seatAfter] && seat !== e.seatAfter && `seat ${e.seatAfter} drawn as ${seat}`,
      plan.page !== got.page && `page ${plan.page} drawn as ${got.page}`,
      (!near(d.from, e.from) || !near(d.to, e.to)) && `window ${e.from}–${e.to} drawn ${d.from}–${d.to}`,
    ].filter(Boolean).join('; ');
    return { id: e.id, plan, drawn: got, same: !why, ...(why ? { why } : {}) };
  });
  // (a camera move the job draws into a line that also changes seat is that one switch: the plan's event carries it)
  const extra = drawn.filter((d) => !claimed.has(d) && !table.events.some((e) => e.camera && d.kind === 'camera-reframe' && e.lineIds.at(-1) === d.lineIds.at(-1)));
  return { events, extra };
}

/**
 * The final job checked against the event plan it carries (2026-11-09 review: the plan was scheduled on the first draw and
 * attached to the second unchecked): every switch at a line's boundary falls on the line's show and the line is drawn in
 * the approved seat (a page set on its page), every switch inside a line is in its repose at the approved time, every
 * approved page handoff is laid with its approved seam and window and no other is. A mismatch is an InputWarning naming
 * the event, never silently accepted.
 */
export function verifyWorldEvents(job: Job, world: StyleWorld, table: { events: WorldEvent[]; holds?: HoldEvent[] }, faces = scheduledFaces(job)): InputWarning[] {
  const { rows, handoffs, sections } = shownOf(job);
  const out: InputWarning[] = [];
  const miss = (id: string, why: string) => out.push({ inputs: [id], reason: `final check: ${why}` });
  const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
  for (const e of table.events) {
    const row = rows.find((r) => r.id === e.lineIds[e.lineIds.length - 1]);
    if (!row) { miss(e.id, 'line not shown'); continue; }
    if (e.scope === 'in-line') {
      if ((e.kind === 'layout-seat' || e.kind === 'carrier-swap') && !(row.world?.repose ?? []).some((r) => near(r.at, e.at) && r.set === e.seatAfter && (r.move ?? undefined) === (e.material ?? undefined))) miss(e.id, `in-line ${e.kind} to ${e.seatAfter} at ${e.at} not in the drawn repose`);
      continue;
    }
    if (e.kind === 'camera-reframe') {
      if (!row.world?.cam || !near(row.world.cam.at, e.at)) miss(e.id, `camera move at ${e.at} not drawn`);
      continue;
    }
    if (e.kind === 'page-handoff' && e.material) {
      // (the world's own page move: drawn on the line, not as a linked handoff)
      const p = row.world?.page;
      if (!p || p.move !== e.material || !near(p.at, e.at) || !near(p.at + p.sec, e.to)) miss(e.id, `${e.material} ${e.from}–${e.to} not drawn on ${row.id}`);
      if (handoffs.some((x) => x.lineId === row.id)) miss(e.id, `${e.material} drawn over a linked handoff`);
    } else if (e.kind === 'page-handoff') {
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
  // the world's material moves as drawn, each against its own declaration (world-shared materials), not only its plan:
  // an erase starts once every line before is sung and read still (clearOfSung), ends EXIT_LEAD before the next line
  // shows, no other line up meanwhile, the old words off its protected region; a page move once the line before is
  // sung, on a line long enough; a carrier swap at a sung word, READ_STABLE still either side of it
  const materials = compositionsOf(world.id)?.materials ?? {};
  const sungBefore = (k: number) => Math.max(-Infinity, ...rows.slice(0, k).map((x) => x.cue.end));
  rows.forEach((r, i) => {
    const wp = r.world?.wipe;
    if (!wp) return;
    const name = `${wp.move}@${r.id}`;
    const next = rows[i + 1];
    const m = materials[wp.move];
    if (!next || !table.events.some((e) => e.material === wp.move && e.lineIds.at(-1) === next.id && near(e.from, wp.from) && near(e.to, wp.from + wp.sec))) return void miss(name, `a ${wp.move} is drawn on ${r.id} that the plan does not hold`);
    if (!m) return void miss(name, `${wp.move} is not a move ${world.id} declares`);
    if (wp.from < sungBefore(i + 1) + m.clearOfSung - 1e-6) miss(name, `${wp.move} on ${r.id} starts ${wp.from}, before the lines up to it are sung and read still (${r3(sungBefore(i + 1))} + ${m.clearOfSung}s)`);
    if (wp.from + wp.sec > next.show - EXIT_LEAD + 1e-6) miss(name, `${wp.move} on ${r.id} ends ${r3(wp.from + wp.sec)}, after ${next.id} shows (${next.show} − ${EXIT_LEAD}s)`);
    if (rows.some((x, j) => j !== i && j !== i + 1 && x.show < wp.from + wp.sec && x.cue.end > wp.from)) miss(name, `${wp.move} on ${r.id} runs while another line is up`);
    // (what is wiped is the line as it last stands: its last repose's set, else its own)
    const box = r.world ? laidSeat(r.cue.text, r.world.repose?.at(-1)?.set ?? r.world.set, { font: faces?.(r.cue.text) })?.box : undefined;
    if (box && (m.protectedRegion ?? []).some((p) => boxesMeet(box, p))) miss(name, `${wp.move} on ${r.id} wipes over its protected region`);
  });
  rows.forEach((r, i) => {
    const pm = r.world?.page;
    const m = pm ? materials[pm.move] : undefined;
    if (!pm || !m) return;
    if (pm.at < sungBefore(i) + m.clearOfSung - 1e-6) miss(`${pm.move}@${r.id}`, `${pm.move} into ${r.id} at ${pm.at} while the line before is sung (${r3(sungBefore(i))})`);
    if (m.minLine && r.cue.end - r.cue.start < m.minLine - 1e-6) miss(`${pm.move}@${r.id}`, `${pm.move} on a line under ${m.minLine}s`);
    if (!near(pm.sec, m.sec)) miss(`${pm.move}@${r.id}`, `${pm.move} drawn over ${pm.sec}s, declared ${m.sec}s`);
    for (const p of m.protectedRegion ?? []) { const b = r.world ? laidSeat(r.cue.text, r.world.set, { font: faces?.(r.cue.text) })?.box : undefined; if (b && boxesMeet(b, p)) miss(`${pm.move}@${r.id}`, `${pm.move} under words in its protected region`); }
  });
  for (const r of rows)
    for (const x of r.world?.repose ?? []) {
      const m = x.move ? materials[x.move] : undefined;
      if (!x.move) continue;
      if (!m) { miss(`${x.move}@${r.id}`, `${x.move} is not a move ${world.id} declares`); continue; }
      const settled = r.show + Math.max(r.world ? WORLD_ENTERS[r.world.enter]?.sec ?? 0 : 0, r.enter ? lineEnterSec(r.enter as never, 1) || 0 : 0);
      if (x.at - Math.max(r.cue.start, settled) < READ_STABLE - 1e-6 || r.cue.end - (x.at + (x.sec ?? 0)) < READ_STABLE - 1e-6) miss(`${x.move}@${r.id}`, `${x.move} at ${x.at} without ${READ_STABLE}s of still reading either side`);
      if (!sungAt(sungWords(r.cue), x.at)) miss(`${x.move}@${r.id}`, `${x.move} at ${x.at} is at no sung word`);
      if (!near(x.sec ?? 0, m.sec)) miss(`${x.move}@${r.id}`, `${x.move} drawn over ${x.sec}s, declared ${m.sec}s`);
      const box = laidSeat(r.cue.text, x.set, { font: faces?.(r.cue.text) })?.box;
      if (box && (m.protectedRegion ?? []).some((p) => boxesMeet(box, p))) miss(`${x.move}@${r.id}`, `${x.move} sets the words in its protected region`);
      // (a move onto panels is drawn only where the one split the renderer parts them by gives two: seat-geometry panelSplit)
      // (a held line's panels only as the composite the plan approved with its ink-only hold, phase 4a: absorbedChecks)
      const merged = table.events.find((e) => e.absorbed && e.lineIds.at(-1) === r.id && near(e.at, x.at) && e.material === x.move);
      if (SET_SPECS[x.set]?.panels && r.world?.beat && !merged) miss(`${x.move}@${r.id}`, `approved material move ${x.move} not drawn on ${r.id}: its line holds a ${r.world.beat.kind} (panels are laid at the line's own size)`);
      if (SET_SPECS[x.set]?.panels && !panelSplit(laidSeat(r.cue.text, x.set, { font: faces?.(r.cue.text) }))) miss(`${x.move}@${r.id}`, `approved material move ${x.move} not drawn on ${r.id} at ${x.at}: the line does not part into a plaque and a lesser panel`);
    }
  out.push(...absorbedChecks(job, world, table, faces));
  // a world camera's move drawn over another switch of the song: a scheduled world drops it (camDrops), never keeps both
  for (const r of rows) {
    const c = r.world?.cam && WORLD_CAM_SEC[r.world.cam.kind] ? r.world.cam : undefined;
    if (!c) continue;
    const [from, to] = [c.at, c.at + WORLD_CAM_SEC[c.kind]];
    const hit = table.events.find((e) => e.kind !== 'keep' && e.kind !== 'camera-reframe' && e.lineIds.at(-1) !== r.id && ((e.from < to + ACTION_GAP && from < e.to + ACTION_GAP) || Math.abs(e.at - from) < SEAM_GAP))?.id
      ?? (table.holds ?? []).find((h) => h.lineId !== r.id && h.from < to + ACTION_GAP && from < h.to + ACTION_GAP)?.lineId;
    if (hit) miss(`camera ${c.kind}@${r.id}`, `world camera ${c.kind} into ${r.id} ${r3(from)}–${r3(to)} overlaps ${hit}`);
  }
  const approved = new Set(table.events.filter((e) => e.kind === 'page-handoff' && !e.material).map((e) => e.lineIds[e.lineIds.length - 1]));
  for (const h of handoffs) if (!approved.has(h.lineId)) miss(`${h.kind}@${h.lineId}`, 'a handoff is laid that the plan does not hold');
  // a Q2 hold drawn partly over a Q4 handoff's window (the scheduler moves or drops one; never both kept, Codex §6)
  for (const r of rows) {
    const h = holdOf(r.id, r.world);
    const q = h && handoffs.find((x) => { const from = x.seam - (x.prepare ?? LINK_PREPARE); const to = from + x.dur; return h.from < to && from < h.to && !(h.from >= from - 1e-6 && h.to <= to + 1e-6); });
    if (h && q) miss(`hold:${h.kind}@${h.lineId}`, `hold ${h.from}–${h.to} partly overlaps the ${q.kind} handoff into ${q.lineId}`);
  }
  // event by event, both ways: each planned event as drawn (kind, seat, page, switch point, window), each drawn cut planned
  const landed = landedEvents(job, world, table, faces);
  for (const l of landed.events) if (!l.same && !out.some((w) => w.inputs[0] === l.id)) miss(l.id, `landed otherwise: ${l.why}`);
  for (const d of landed.extra) miss(`${d.kind}@${d.lineIds.at(-1)}@${d.at}`, `a ${d.kind} is drawn that the plan does not hold`);
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

/**
 * The composite events (phase 4a, an ink-only hold merged with a material move) checked on the final job, each against its
 * own record (Codex 2026-11-10 §3): the hold drawn on its line exactly as planned (kind, `at`, length; nothing moved it)
 * and among the plan's holds; its kind one the scheduler may absorb; the material drawn on the line at its word, the one
 * switch inside the line; the words in the same box at the same type on both seats; the occupancy the union of the two
 * windows; the union clear of every other action of the song by ACTION_GAP and its switch SEAM_GAP from every other; the
 * new seat off the world's protected regions. A mismatch is an InputWarning naming the event (a contract failure).
 */
export function absorbedChecks(job: Job, world: StyleWorld, table: { events: WorldEvent[]; holds?: HoldEvent[] }, faces = scheduledFaces(job)): InputWarning[] {
  const { rows, handoffs, sections } = shownOf(job);
  const out: InputWarning[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
  const protect = compositionsOf(world.id)?.protectedRegion ?? [];
  const lights = [...lightsOf(sections).map((l) => ({ at: l.at, what: l.what })), ...table.events.filter((x) => x.changesLight && x.kind !== 'keep').map((x) => ({ at: x.at, what: x.id }))];
  for (const e of table.events.filter((x): x is WorldEvent & { absorbed: AbsorbedHold } => !!x.absorbed)) {
    const a = e.absorbed;
    const miss = (why: string) => out.push({ inputs: [e.id], reason: `final check: absorption ${a.holdId} + ${a.materialId}: ${why}` });
    const row = rows.find((r) => r.id === e.lineIds.at(-1));
    if (!row) { miss('line not shown'); continue; }
    if (!ABSORBABLE_HOLDS.has(a.kind)) miss(`a ${a.kind} hold is not one the scheduler may absorb`);
    const h = holdOf(row.id, row.world);
    if (!h || holdIdOf(h) !== a.holdId || !near(h.at, a.hold.at) || !near(h.to, a.hold.to)) miss(`the hold is not drawn as planned (${a.hold.at}–${a.hold.to}; drawn ${h ? `${h.kind} ${h.at}–${h.to}` : 'none'})`);
    if (!(table.holds ?? []).some((x) => holdIdOf(x) === a.holdId && near(x.at, a.hold.at) && near(x.to, a.hold.to))) miss('the hold is lost from the plan\'s holds');
    // (an ink-swap's phrase is the one planned)
    const span = row.world?.beat?.span;
    if ((span?.from ?? -1) !== (a.hold.span?.from ?? -1) || (span?.to ?? -1) !== (a.hold.span?.to ?? -1)) miss(`the hold's phrase is drawn ${span ? `${span.from}–${span.to}` : 'whole'}, planned ${a.hold.span ? `${a.hold.span.from}–${a.hold.span.to}` : 'whole'}`);
    // (the ink, again on the final job's own scheme: the same held ink on both seats, at 4.5:1 on every ground)
    const [fromSpec, toSpec, mat] = [SET_SPECS[row.world?.set ?? ''], SET_SPECS[e.seatAfter], compositionsOf(world.id)?.materials?.[a.materialId]];
    const slots = row.world?.slots;
    if (!fromSpec || !toSpec || !slots) miss('no sets or scheme to read the ink on');
    else {
      const body = fromSpec.ink ? slots[fromSpec.ink] : slots.ink;
      const r = absorbInk(a.kind, fromSpec, toSpec, slots, body, mat?.under ?? []);
      if (!r.ok) miss(`ink: ${r.why}`);
      else if (r.ink.toLowerCase() !== a.ink.toLowerCase()) miss(`ink: the final job holds ${r.ink}, planned ${a.ink}`);
    }
    const reposes = row.world?.repose ?? [];
    if (reposes.length > 1) miss(`${reposes.length} switches inside the line (one at most)`);
    const r = reposes.find((x) => near(x.at, e.at) && x.move === a.materialId && x.set === e.seatAfter);
    if (!r) miss(`${a.materialId} not drawn on ${row.id} at ${e.at}`);
    const occ = { from: Math.min(e.from, a.hold.from), to: Math.max(e.to, a.hold.to) };
    if (!near(occ.from, a.occupancy.from) || !near(occ.to, a.occupancy.to)) miss(`occupancy ${a.occupancy.from}–${a.occupancy.to} is not the union ${r3(occ.from)}–${r3(occ.to)}`);
    if (!(e.from < a.hold.to + ACTION_GAP && a.hold.from < e.to + ACTION_GAP)) miss('the hold and the material are two actions, not one');
    const set = row.world?.set ?? '';
    const [p, q] = [seatIn(world, set, row.cue.text, faces), seatIn(world, e.seatAfter, row.cue.text, faces)];
    if (!sameWords(p, q)) miss(`the words do not keep their box and type from ${set} to ${e.seatAfter}`);
    if (q.box && [...protect, ...(compositionsOf(world.id)?.materials?.[a.materialId]?.protectedRegion ?? [])].some((x) => boxesMeet(q.box!, x))) miss('the new seat enters a protected region');
    // (every other action of the song: the other events, the other holds, the handoffs' windows)
    const others = [
      ...table.events.filter((x) => x !== e && x.kind !== 'keep').map((x) => ({ what: x.id, from: x.from, to: x.to, at: x.at, seam: x.kind !== 'prop-beat' })),
      ...(table.holds ?? []).filter((x) => holdIdOf(x) !== a.holdId).map((x) => ({ what: holdIdOf(x), from: x.from, to: x.to, at: x.at, seam: false })),
      ...handoffs.map((x) => { const from = x.seam - (x.prepare ?? LINK_PREPARE); return { what: `${x.kind}@${x.lineId}`, from, to: from + x.dur, at: x.seam, seam: true }; }),
    ];
    for (const o of others) {
      if (occ.from < o.to + ACTION_GAP - 1e-6 && o.from < occ.to + ACTION_GAP - 1e-6) miss(`its window ${r3(occ.from)}–${r3(occ.to)} is within ${ACTION_GAP}s of ${o.what}`);
      if (o.seam && Math.abs(o.at - e.at) < SEAM_GAP - 1e-6) miss(`its switch is within ${SEAM_GAP}s of ${o.what}`);
    }
    // (a composite that changes the frame's light keeps LIGHT_GAP from every other change of light; one frame is one change)
    if (e.changesLight) for (const l of lights) if (l.what !== e.id && Math.abs(l.at - e.at) >= 0.05 && Math.abs(l.at - e.at) < LIGHT_GAP - 1e-6) miss(`its light change is within ${LIGHT_GAP}s of ${l.what}`);
  }
  return out;
}

/**
 * The composite events whose landing failed on the final draw (any final-check warning naming the event or its material
 * on its line), and the contract failure each leaves in the record (phase 4a): the caller drops them from the plan and
 * draws again, so the hold and the line's layout come back as the composer planned them; nothing is silently cancelled.
 */
export function failedComposites(events: WorldEvent[], checked: InputWarning[]): { failed: WorldEvent[]; warnings: InputWarning[] } {
  const named = (e: WorldEvent) => checked.filter((w) => w.reason.startsWith('final check') && (w.inputs[0] === e.id || w.inputs[0] === `${e.material}@${e.lineIds.at(-1)}`));
  const failed = events.filter((e) => e.absorbed && named(e).length);
  return { failed, warnings: failed.map((e) => ({ inputs: [e.id], reason: `final check: contract failure: the composite ${e.absorbed!.holdId} + ${e.absorbed!.materialId} did not land (${named(e).map((w) => w.reason.replace(/^final check: /, '')).join('; ')}); its hold and the line's layout restored, the material refused` })) };
}

/** Two times within this are the same drawn instant (the final checks' own landing tolerance, 2 ms). */
const LANDED = 0.002;
/** Float slack on a boundary comparison (s). */
const EPS = 1e-6;
/** Two switches within 50 ms are one switch (countCuts' own rule): the seam check reads them as one, never as two too close. */
const SAME_SWITCH = 0.05;

/** Where a joint contract failure is named: the line, so the caller can undo that line's commitment alone. */
export const jointName = (lineId: string) => `joint:${lineId}`;

/**
 * The joint contract (phase 4c, Codex 2026-11-10 r2 §1) checked on the final job, line by line against the outcome the
 * plan committed: at most one primary action a line (its switches and its standing hold; a composite is one); the winner
 * is what is drawn (a hold drawn as planned on a hold line and nothing else; a switch and no hold on a composition line;
 * neither on a keep line); a hold that lost leaves nothing behind (no beat drawn, none in the plan's holds, no candidate
 * in the drawing); a kept settling state stays to the line's end (no switch after it inside the line, the event over
 * before the line ends); a switch inside a line keeps READ_STABLE of still reading either side; across the song every
 * committed hold keeps ACTION_GAP from every other action and BEAT_CLEAR from a switch of its own line, and the scheduler's
 * own switches keep SEAM_GAP (the light clock is lightGapWarnings'). Each miss is a final-check InputWarning naming the
 * line (`joint:<line>`).
 */
export function jointChecks(job: Job, world: StyleWorld, table: { events: WorldEvent[]; holds?: HoldEvent[]; outcomes?: LineOutcome[] }, opts: { entranceAndInLine?: boolean } = {}): InputWarning[] {
  if (!table.outcomes) return [];
  const { rows } = shownOf(job);
  // (the switches as the final job draws them, read off the drawing with real shows: the winner is what is drawn)
  const drawnCuts = currentEvents({ job }, undefined, world).filter((e) => e.kind !== 'keep');
  const out: InputWarning[] = [];
  const miss = (line: string, why: string) => out.push({ inputs: [jointName(line)], reason: `final check: joint: ${why}` });
  const near = (a: number, b: number) => Math.abs(a - b) < LANDED;
  const holds = table.holds ?? [];
  const cuts = [...new Map(table.events.filter((e) => e.kind !== 'keep').map((e) => [e.id, e])).values()];
  const absorbedIds = new Set(cuts.flatMap((e) => (e.absorbed ? [e.absorbed.holdId] : [])));
  for (const o of table.outcomes) {
    const row = rows.find((r) => r.id === o.lineId);
    if (!row) continue;
    const evs = cuts.filter((e) => e.lineIds.at(-1) === o.lineId);
    const hs = holds.filter((h) => h.lineId === o.lineId);
    const actions = evs.length + hs.filter((h) => !absorbedIds.has(holdIdOf(h))).length;
    // (a world that declares it: an entrance and one reseat inside the line, two changes, no hold beside them)
    const pairOk = !!opts.entranceAndInLine && actions === 2 && !hs.length && evs.filter((e) => e.scope === 'in-line').length === 1 && evs.some((e) => e.scope !== 'in-line' && e.kind !== 'camera-reframe');
    if (actions > 1 && !pairOk) miss(o.lineId, `${o.lineId} takes ${actions} primary actions (${[...evs.map((e) => e.id), ...hs.map(holdIdOf)].join(', ')}); one at most`);
    const drawn = holdOf(row.id, row.world);
    if (row.world?.holdCands) miss(o.lineId, `hold candidates reached the drawing on ${o.lineId}`);
    if (o.outcome === 'hold' || o.outcome === 'composite') {
      const h = hs[0];
      if (!h) miss(o.lineId, `${o.outcome} committed on ${o.lineId} with no hold in the plan`);
      else if (!drawn || drawn.kind !== h.kind || !near(drawn.at, h.at) || !near(drawn.to, h.to)) miss(o.lineId, `committed ${holdIdOf(h)} ${h.at}–${h.to} drawn as ${drawn ? `${drawn.kind} ${drawn.at}–${drawn.to}` : 'none'}`);
      if (o.outcome === 'hold' && evs.length) miss(o.lineId, `hold line ${o.lineId} also switches (${evs.map((e) => e.id).join(', ')})`);
      if (o.outcome === 'composite' && !evs.some((e) => e.absorbed)) miss(o.lineId, `composite on ${o.lineId} has no absorbed event`);
    } else {
      if (drawn) miss(o.lineId, `a ${drawn.kind} hold is drawn on ${o.lineId}, whose outcome is ${o.outcome}: the losing hold left a residue`);
      if (hs.length) miss(o.lineId, `${hs.map(holdIdOf).join(', ')} stands in the plan's holds on a ${o.outcome} line`);
      if (o.outcome === 'composition' && !evs.length) miss(o.lineId, `composition committed on ${o.lineId}, nothing switches`);
      if (o.outcome === 'keep' && evs.length) miss(o.lineId, `keep committed on ${o.lineId}, drawn with ${evs.map((e) => e.id).join(', ')}`);
    }
    const seen = drawnCuts.filter((d) => d.lineIds.at(-1) === o.lineId);
    if ((o.outcome === 'composition' || o.outcome === 'composite') && !seen.length) miss(o.lineId, `${o.outcome} committed on ${o.lineId}, the drawing switches nothing there`);
    if ((o.outcome === 'hold' || o.outcome === 'keep') && seen.length) miss(o.lineId, `${o.outcome} committed on ${o.lineId}, the drawing switches there (${seen.map((d) => `${d.kind}@${d.at}`).join(', ')})`);
    if (drawn && KEPT.has(drawn.kind as BeatKind) && (row.world?.repose ?? []).some((r) => r.at > drawn.at - EPS)) miss(o.lineId, `the settled ${drawn.kind} on ${o.lineId} does not stay to the line's end: a switch inside the line after it`);
    if (drawn && drawn.to > row.cue.end + EPS) miss(o.lineId, `the ${drawn.kind} on ${o.lineId} runs past the line's end (${drawn.to} > ${row.cue.end})`);
    const settled = row.show + Math.max(row.world ? WORLD_ENTERS[row.world.enter]?.sec ?? 0 : 0, row.enter ? lineEnterSec(row.enter as EnterKind, 1) || 0 : 0);
    // (still reading counted from when the words have landed: the entrance and any switch into the line done)
    const landed = Math.max(row.cue.start, settled, ...evs.filter((x) => x.scope !== 'in-line').map((x) => x.to));
    for (const e of evs.filter((x) => x.scope === 'in-line')) if (e.at - landed < READ_STABLE - EPS || row.cue.end - e.to < READ_STABLE - EPS) miss(o.lineId, `${e.id} at ${e.at} without ${READ_STABLE}s of still reading either side`);
  }
  // (across the song: each committed hold against every other action and switch; the scheduler's own switches by their seams)
  const standing = holds.filter((h) => !absorbedIds.has(holdIdOf(h)));
  for (const h of standing) {
    for (const x of [...cuts.filter((e) => e.absorbed?.holdId !== holdIdOf(h)), ...standing.filter((y) => y !== h)]) {
      const [from, to, what] = 'lineIds' in x ? [x.from, x.to, x.id] : [x.from, x.to, holdIdOf(x)];
      if (h.from < to + ACTION_GAP - EPS && from < h.to + ACTION_GAP - EPS) miss(h.lineId, `${holdIdOf(h)} ${h.from}–${h.to} within ${ACTION_GAP}s of ${what}`);
      // (a switch of the held line itself: never this near the event, beatOfLine's own clearance; the next line's show
      // is kept off by ACTION_GAP above, holdEndBy's contract)
      if ('lineIds' in x && x.lineIds.at(-1) === h.lineId && x.kind !== 'prop-beat' && (Math.abs(x.at - h.from) < BEAT_CLEAR - EPS || Math.abs(x.at - h.to) < BEAT_CLEAR / 2 - EPS)) miss(h.lineId, `${holdIdOf(h)} within ${BEAT_CLEAR}s of its line's switch ${x.id} at ${x.at}`);
    }
  }
  const own = cuts.filter((e) => !e.fixed && e.kind !== 'prop-beat').sort((a, b) => a.at - b.at);
  for (const [k, e] of own.entries()) for (const x of own.slice(k + 1)) if (x.at - e.at < SEAM_GAP - EPS && x.at - e.at >= SAME_SWITCH) miss(x.lineIds.at(-1)!, `${x.id} at ${x.at} within ${SEAM_GAP}s of ${e.id} at ${e.at}`);
  return out;
}
