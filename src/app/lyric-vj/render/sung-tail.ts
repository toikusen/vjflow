// A line leaves after its last sung character, never on it: an exit that began while the last word was still being
// sung read as the line being cut off (v3's c004 left 0.12 s before 気 ended).

/** A line as its sung times are read: its span, its character times, whether the aligner really timed them. */
export type SungLine = { start: number; end: number; charStarts?: number[]; charTimed?: boolean; voiceCues?: SungLine[] };
/** How far before its start a character time is still taken as the line's (an onset earlier than that is clamped). */
export const ONSET_SLACK = 0.25;

/**
 * The character times a line is read by — the one helper the engine, the planners and the audit share: none for a line
 * the aligner did not time (charTimed false: its times are interpolated, Tokyo Drift c049–c068 ran 10–15 s past their
 * lines) or whose times never move; otherwise every finite time, clamped into [start − ONSET_SLACK, end] — a late
 * character is sung at the line's end, never dropped (チョロイン c068 lost 8 of 21 characters that way, opus review).
 */
export function sungTimes(c: SungLine): number[] | undefined {
  if (c.charTimed === false || !c.charStarts?.length) return undefined;
  const ts = c.charStarts.filter(Number.isFinite).map((t) => Math.min(c.end, Math.max(c.start - ONSET_SLACK, t)));
  if (!ts.length || (ts.length > 1 && Math.max(...ts) - Math.min(...ts) < 1e-6)) return undefined;
  return ts;
}
/** A line's latest sung character (a duet set together lists its voices one after the other: the largest); its end untimed. */
export const lastSung = (c: SungLine): number => (c.voiceCues?.length ? Math.max(...c.voiceCues.map(lastSung)) : (sungTimes(c) ?? [c.end]).reduce((x, y) => Math.max(x, y), -Infinity));
/** A line's first sung character (the smallest time, clamped to its start's slack); its start untimed. */
// (a line set together of voices, line-shows.ts: each voice by its own times — one untimed voice made the merged line
// untimed, and its onset its start, Tokyo Drift c084)
export const firstSung = (c: SungLine): number => (c.voiceCues?.length ? Math.min(...c.voiceCues.map(firstSung)) : (sungTimes(c) ?? [c.start]).reduce((x, y) => Math.min(x, y), Infinity));
/** Whether a line has sung times to read (a voice of a line set together counts). */
export const isTimed = (c: SungLine): boolean => (c.voiceCues?.length ? c.voiceCues.some(isTimed) : !!sungTimes(c));
/** lastSung for a bare list of times and an end (callers without the line object). */
export const lastSungChar = (charStarts: number[], end = Infinity, charTimed?: boolean) => lastSung({ start: -Infinity, end, charStarts, charTimed });

/**
 * Whether the next line, sung from `onset`, is sung over this one, so the two must share the frame: its first sung
 * character comes before this one's last has been up MIN_TAIL (an untimed line: before the last moment of its stated
 * end). A line sung after that hands over, cut as it shows (settleExit) — never piled up (Tokyo Drift, 2026-11-18), and
 * never a last character shown for no time at all (opus review).
 */
export function sungOver(a: SungLine, onset: number, lead = LEAD, tail = MIN_TAIL): boolean {
  const last = isTimed(a) ? lastSung(a) + tail : a.end - EXIT_MIN - lead;
  return onset < last - 1e-9;
}

/** Seconds a line stays up past its last sung character before its exit may begin. */
export const SUNG_TAIL = 0.3;

/**
 * The exit time with the sung tail: no earlier than `lastSung + SUNG_TAIL`. The tail is never given up for the next
 * line: where the two would meet, the next line waits (nextShowAfter) — a line cut off on its last word was the worse
 * fault in every review (v3's c004, v4's c002/c004/c009, 2026-11-17).
 */
export function exitAfterSung(exitAt: number, lastSung: number | undefined, tail = SUNG_TAIL): number {
  if (lastSung === undefined) return exitAt;
  return Math.max(exitAt, lastSung + tail);
}

/** The shortest exit a line plays when the next one presses: a blink is still an exit, nothing shorter is. */
export const EXIT_MIN = 0.08;

/**
 * When the next line shows, given this one's exit: its own time where the exit (shortened to EXIT_MIN at the least,
 * `lead` clear before the show) is over by then, else right after the exit — the next line waits for this one to
 * leave rather than this one leaving early. Returns the exit's duration as well.
 */
export function nextShowAfter(exitAt: number, exitSec: number, nextShow: number, lead: number): { show: number; exitDur: number } {
  if (exitSec <= 0) return { show: Math.max(nextShow, exitAt + lead), exitDur: 0 };
  const exitDur = Math.max(EXIT_MIN, Math.min(exitSec, nextShow - lead - exitAt));
  return { show: Math.max(nextShow, exitAt + exitDur + lead), exitDur };
}

/**
 * When the next line shows, given the wait this one's tail asks (`waited`): never past the next line's sung onset (its
 * first sung character) — a line shown after it has been sung is the worse fault — and never earlier than planned
 * (`planned`). Where the cap bites, the two lines are up together for this one's exit.
 */
export function showByOnset(waited: number, planned: number, onset: number): number {
  return Math.max(planned, Math.min(waited, onset));
}

import { READ_FLOOR } from './reading-window';
export { READ_FLOOR };
/**
 * A timed line's exit begins at least this long after its last sung character: one character's reading time at the
 * project's rate (readingSec: 12 characters a second), never a sub-frame flash of the last syllable (opus review).
 */
export const MIN_TAIL = 1 / 12;
/** The lead a line's exit ends before the next line shows (world-handoff EXIT_LEAD). */
const LEAD = 0.02;

/**
 * The earliest a line may begin to leave: READ_FLOOR after it shows, and MIN_TAIL past its last sung character; a line
 * with no character times may blink out over the last moment of its stated end (nothing says a word is still sung).
 */
export function exitFloor(cue: SungLine, show: number, lead = LEAD, tail = MIN_TAIL): number {
  // (voice by voice: a timed voice's last character and its tail, an untimed voice's blink at its end — an untimed second
  // voice read as timed held a duet past the next line's onset)
  const sungOf = (v: SungLine): number => (v.voiceCues?.length ? Math.max(...v.voiceCues.map(sungOf)) : sungTimes(v) ? lastSung(v) + tail : v.end - EXIT_MIN - lead);
  const sung = sungOf(cue);
  return Math.max(show + READ_FLOOR, sung);
}
/** Whether a line leaving no earlier than `floor` can be gone (cut, at the least) before a line sung from `onset` shows. */
export const handsOver = (floor: number, onset: number, lead = LEAD) => onset >= floor + lead - 1e-9;
/**
 * Two lines whose handover cannot be clean — the next sung before this one may leave (same start, a duet's overlap, a
 * rap line sung into the last syllable) — are shown together in their own rows (line-shows.ts), never one hidden.
 */
export function mustShare(a: { start: number; end: number; text: string; charStarts?: number[] }, b: { start: number; end?: number; text?: string; charStarts?: number[] }, onset = b.charStarts?.[0] ?? b.start, tail = MIN_TAIL): boolean {
  // (sung before this one's floor: no handover at all; between the floor and a lead past it, settleExit cuts this one as
  // the next shows, its lead given up)
  return onset < exitFloor(a, a.start, LEAD, tail) - 1e-9;
}
/**
 * The tail the composer pairs lines by (planPairs): a frame and a little. Pairing every line whose next comes within
 * MIN_TAIL re-plans fast rap so far that the world-event scheduler's own checks fail (3b, 4a, 4c on 雙截棍); the engine
 * sets the rest together (line-shows.ts) where no world event names them, and logs them where one does.
 */
export const PLAN_TAIL = 0.04;

/**
 * This line's exit and the next line's show on one seat: the wait the tail asks (nextShowAfter), capped at the next
 * line's sung onset (showByOnset). Where the cap bites (`capped`), this line is gone before the next shows — its exit
 * ends `lead` before it, shortened and started earlier down to a blink, but never before `floor` (exitFloor). Where even
 * that cannot be (`overlap`: lines that should have been set together and could not), both stay lit — the line is
 * never cut before it is read — and the engine logs it. Layouts that seat two lines apart do not ask this.
 */
export function settleExit(exitFrom: number, exitSec: number, plannedShow: number, onset: number, lead: number, floor: number, hard = floor): { show: number; exitAt: number; exitDur: number; capped: boolean; overlap: boolean } {
  const w = nextShowAfter(exitFrom, exitSec, plannedShow, lead);
  const show = showByOnset(w.show, plannedShow, onset);
  if (show >= w.show - 1e-9) return { show: w.show, exitAt: exitFrom, exitDur: w.exitDur, capped: false, overlap: false };
  const end = show - lead;
  if (exitFrom + EXIT_MIN <= end) return { show, exitAt: exitFrom, exitDur: Math.min(Math.max(exitSec, EXIT_MIN), end - exitFrom), capped: true, overlap: false };
  if (end - EXIT_MIN >= floor - 1e-9) return { show, exitAt: end - EXIT_MIN, exitDur: EXIT_MIN, capped: true, overlap: false };
  // (no room for a blink past the floor: a cut, as late as the floor allows — gone as the next shows, its lead given up
  // where it must be)
  if (end >= floor - 1e-9) return { show, exitAt: floor, exitDur: Math.max(0, end - floor), capped: true, overlap: false };
  if (floor <= show + 1e-9) return { show, exitAt: floor, exitDur: Math.max(0.001, show - floor), capped: true, overlap: false };
  // (a fast line sung after this one's last character — `hard`, its last sung character — hands over: cut as the next
  // shows, its last character up as long as the voice gave it; only a line sung over it is a fault)
  if (hard <= show + 1e-9) return { show, exitAt: Math.max(hard, show - 0.001), exitDur: 0.001, capped: true, overlap: false };
  // (the next is sung before this one's floor: both lit, as briefly as the floor allows — a fault, logged)
  return { show, exitAt: floor, exitDur: EXIT_MIN, capped: true, overlap: true };
}

/**
 * The render's sung-tail metric: a line tagged 'kept' that began to leave inside its tail fails, and so do two lines
 * left lit together on one seat (settleExit overlaps); a 'capped' line gave its tail to the next line's onset on
 * purpose (its reason in tailWhy) and passes. `waits` are the lines that showed late so the one before kept its tail.
 */
export function sungTailCheck(cues: { id: string; text: string; lastSung: number; exitAt?: number; tail?: string; tailWhy?: string }[], waits: { id: string; sec: number }[] = [], overlaps: { id: string; next: string; from: number; to: number }[] = []) {
  const failing = cues.filter((c) => c.tail === 'kept' && c.exitAt !== undefined && c.exitAt < c.lastSung + SUNG_TAIL - 0.034).map((c) => ({ id: c.id, text: c.text, lastSung: c.lastSung, exitAt: c.exitAt }));
  const capped = cues.filter((c) => c.tail === 'capped').map((c) => ({ id: c.id, why: c.tailWhy ?? '' }));
  return { ok: !failing.length && !overlaps.length, failing, overlaps, capped, waits };
}
