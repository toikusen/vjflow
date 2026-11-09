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
import { WORLD_CAM_SEC } from './render/world-cam';
import { LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import type { WorldLine } from './render/world-layout';
import { compositionsOf, isPageSeat, linksOf, pageOf, pageSeatsOf, sharedOf, WORLD_COMPOSITIONS, type BeatKind } from './world-shared';
import { laidSeat } from './render/seat-geometry';
import { ACTION_GAP, LIGHT_GAP, SEAM_GAP, seatsDiffer, type CameraMove, type InputWarning, type CompositionFamily, type FrameBox, type HandoffCandidate, type HoldEvent, type SeatCandidate, type SungWord, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';

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

/**
 * A world's seat for a set: a set laid into a page of its own is carried by that page (a change of it is a change of
 * page; two seats on one page share it). Given the line's words, the box is where they are really laid (render/
 * seat-geometry.ts, after layout: rows, size, shear, a split line's parts), with their type size; a seat the scheduler
 * adds on a page (world-shared pageSeats) carries that page's graphics as the regions its words keep off.
 */
export const seatIn = (world: StyleWorld, set: string, text?: string): SeatCandidate => {
  const ground = pageOf(world, set);
  const laid = text !== undefined ? laidSeat(text, set) : undefined;
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
  if (declared && !o.derived && !o.off) return { worldId: world.id, kinds: declared.kinds, seats: declared.seats ?? [...sets, ...pageSeatsOf(world.id)], carrierRole: declared.carrierRole, allowedAt: declared.allowedAt, duration: declared.duration, moves: declared.moves, ...(declared.protectedRegion ? { protectedRegion: declared.protectedRegion } : {}), ...(declared.materials ? { materials: declared.materials } : {}), source: 'declared' };
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

/** How near a sung word's start a switch must fall to count as at that word (a beat snap, world-events BEAT_SNAP). */
export const SUNG_NEAR = 0.12;
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
  const lines: WorldEventLine[] = rows.map(({ id, cue, show, world: w, shot, enter }) => {
    const set = w?.set ?? `${shot}:lyric`;
    const own = w ? seatIn(world, set, cue.text) : { id: set };
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
    // (the longest the line's entrance can take: the world's own move at full pace, or the line's drawn entrance; the
    // renderer runs either at its pace, never longer: world-layout enterDur, enter-sec.ts)
    const entrance = Math.max(w ? WORLD_ENTERS[w.enter]?.sec ?? 0 : 0, enter ? lineEnterSec(enter as never, 1) || 0 : 0);
    return {
      id, show, start: cue.start, end: cue.end, ...(words ? { words } : {}), settled: +(show + entrance).toFixed(3), seats: [own, ...legal.map((s) => seatIn(world, s, cue.text))], seat: set,
      ...(pinned ? { pinned } : {}), ...(room ? { inLine: room } : {}), ...(shared.has(id) ? { sharesShot: true } : {}),
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
export function currentEvents(free: { job: Job }, _song: SongTimeline | undefined, world: StyleWorld): WorldEvent[] {
  const { rows, handoffs } = shownOf(free.job);
  const hands = new Map(handoffs.map((h) => [h.lineId, h]));
  const out: WorldEvent[] = [];
  let here = '';
  let at: SeatCandidate | undefined;
  const ev = (e: Omit<WorldEvent, 'id' | 'changesLight'> & { changesLight?: boolean }) => out.push({ id: `${e.kind}:${e.lineIds.at(-1)}:${out.length}`, changesLight: false, ...e });
  rows.forEach(({ id, cue, world: w, show, shot }, i) => {
    const set = w?.set ?? `${shot}:lyric`;
    const seat = (x: string) => seatIn(world, x, cue.text);
    // (a linked page move or the composer's own lyric handoff that survived gating: one page handoff, its whole window)
    const q4 = hands.get(id);
    const moved = i > 0 && seatsDiffer(at, seat(set));
    const cam = w?.cam && WORLD_CAM_SEC[w.cam.kind] ? w.cam : undefined;
    const before = here;
    // (the line before wiped by the world's own erase as this one shows: one reseat, its window the wipe's)
    const wipe = i > 0 ? rows[i - 1].world?.wipe : undefined;
    if (i > 0 && q4) ev({ lineIds: [rows[i - 1].id, id], kind: 'page-handoff', at: q4.seam, from: q4.seam - (q4.prepare ?? LINK_PREPARE), to: q4.seam - (q4.prepare ?? LINK_PREPARE) + q4.dur, seatBefore: before, seatAfter: set, scope: 'line', changesLight: true, reason: q4.kind });
    else if (i > 0 && w?.page) ev({ lineIds: [rows[i - 1].id, id], kind: 'page-handoff', at: w.page.at, from: w.page.at, to: +(w.page.at + w.page.sec).toFixed(3), seatBefore: before, seatAfter: set, scope: 'line', reason: w.page.move, move: w.page.move, material: w.page.move });
    else if (moved && wipe) ev({ lineIds: [rows[i - 1].id, id], kind: 'layout-seat', at: show, from: wipe.from, to: +(wipe.from + wipe.sec).toFixed(3), seatBefore: before, seatAfter: set, scope: 'line', reason: wipe.move, move: wipe.move, material: wipe.move });
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
export function landedEvents(job: Job, world: StyleWorld, table: { events: WorldEvent[] }): { events: Landing[]; extra: WorldEvent[] } {
  const { rows, sections } = shownOf(job);
  const drawn = currentEvents({ job }, undefined, world);
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
    if (!d) return { id: e.id, plan, same: false, why: `no ${e.kind} drawn on ${line} at ${e.at}` };
    claimed.add(d);
    const seat = e.kind === 'camera-reframe' ? e.seatAfter : d.seatAfter;
    const got = { kind: d.kind, seat, page: pageOf(world, seat), at: d.at, from: d.from, to: d.to };
    const why = [
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
export function verifyWorldEvents(job: Job, world: StyleWorld, table: { events: WorldEvent[]; holds?: HoldEvent[] }): InputWarning[] {
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
  // (an erase drawn on a line is the next line's approved reseat; one no event holds is a switch the plan does not count)
  rows.forEach((r, i) => {
    const wp = r.world?.wipe;
    if (!wp) return;
    const next = rows[i + 1];
    if (!next || !table.events.some((e) => e.material === wp.move && e.lineIds.at(-1) === next.id && near(e.from, wp.from) && near(e.to, wp.from + wp.sec))) miss(`${wp.move}@${r.id}`, `a ${wp.move} is drawn on ${r.id} that the plan does not hold`);
    else if (next.cue.start < wp.from - 1e-6 || r.cue.end > wp.from + 1e-6) miss(`${wp.move}@${r.id}`, `${wp.move} on ${r.id} ${wp.from}–${wp.from + wp.sec} touches a line being sung`);
  });
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
  const landed = landedEvents(job, world, table);
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
