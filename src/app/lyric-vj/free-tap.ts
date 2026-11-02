// Tap sync as plain state: one tap per line start, undo, restart from any line. Nothing here knows about audio or keys;
// the panel in pages/free feeds it times.
import { LyricLine, MIN_LINE_GAP } from './free-lyrics';

export interface TapState {
  lines: readonly string[];
  starts: readonly (number | undefined)[];
  /** The line the next tap lands on; `lines.length` when every line is done. */
  at: number;
  past: readonly { at: number; starts: readonly (number | undefined)[] }[];
}

/** How far back of a line an undo or a restart rewinds, s: enough to hear it coming. */
const LEAD_IN = 3;

const lastBefore = (s: TapState, i: number) => s.starts.slice(0, i).reduce<number | undefined>((best, v) => v ?? best, undefined);
const saved = (s: TapState) => [...s.past, { at: s.at, starts: s.starts }];

/** A session over lines that may already have times: it opens on the first without one, or the first line. */
export function startTap(lines: readonly LyricLine[]): TapState {
  const open = lines.findIndex((l) => l.start === undefined);
  return { lines: lines.map((l) => l.text), starts: lines.map((l) => l.start), at: Math.max(0, open), past: [] };
}

/**
 * The current line starts at `t`, and the session moves on. Lines stay in order: a tap cannot land before the line above,
 * and old times later lines still hold that it passes are cleared rather than left out of order.
 */
export function tapLine(s: TapState, t: number): TapState {
  if (s.at >= s.lines.length) return s;
  const above = lastBefore(s, s.at);
  const when = +Math.max(0, t, above === undefined ? 0 : above + MIN_LINE_GAP).toFixed(3);
  const starts = s.starts.map((v, i) => (i === s.at ? when : i > s.at && v !== undefined && v <= when ? undefined : v));
  return { ...s, starts, at: s.at + 1, past: saved(s) };
}

/** Takes back the last tap or restart, whatever it changed. */
export function undoTap(s: TapState): TapState {
  const last = s.past.at(-1);
  return last ? { ...s, ...last, past: s.past.slice(0, -1) } : s;
}

/** Back to line i to tap on from there. Every time stays until a tap replaces it, so a single line can be redone. */
export const restartAt = (s: TapState, i: number): TapState => (i === s.at ? s : { ...s, at: Math.max(0, Math.min(s.lines.length, i)), past: saved(s) });

/** Where the audio should be to tap line i: a little before where it was or, failing that, before the line above. */
export const rewindFor = (s: TapState, i: number) => Math.max(0, (s.starts[i] ?? lastBefore(s, i) ?? LEAD_IN) - LEAD_IN);

/** Where the audio should be once a tap at `tapped` is taken back: before it, so the line can be tapped again whether it came early or late. */
export const rewindAfterUndo = (tapped: number) => Math.max(0, tapped - LEAD_IN);

export const timedCount = (s: TapState) => s.starts.filter((v) => v !== undefined).length;
export const canUndo = (s: TapState) => s.past.length > 0;
export const isDone = (s: TapState) => s.at >= s.lines.length;

/** The session as lyric lines. */
export const linesOf = (s: TapState): LyricLine[] => s.lines.map((text, i) => ({ text, start: s.starts[i] }));
