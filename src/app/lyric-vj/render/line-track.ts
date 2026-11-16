// Tracking-out (idle 'track'): the line's letter spacing opens slowly about its centre over its life, like a film
// title drifting apart. Pure numbers. The line is measured at its widest (atRest: every frame fit, room and prop
// avoidance sees the open line), so opening never takes it past the frame or into what makes room for it.
// Idea after claude-animated-text #30 "track" (pound / POUND0423, MIT); the code here is our own.

/** The widest a line opens, as a share of each glyph's distance from the line's centre (a 10-character row grows by about that share). */
export const TRACK_MAX = 0.22;

/** Smooth in and out, no jump in speed at either end. */
const inOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * How far open the line is at t, 0..1 of its reach: closed when it shows, opening at an even, eased pace until its exit
 * starts, then held while it leaves. `rest` (a measure of where the line stands) is the widest it will ever be.
 */
export function trackOpen(t: number, show: number, exitAt: number, rest = false): number {
  if (rest) return 1;
  return inOutSine((t - show) / Math.max(0.2, exitAt - show));
}

/** The song's reach for the opening, bounded by TRACK_MAX: `vary` is the song's own value in 0..1. */
export const trackReach = (vary: number) => TRACK_MAX * (0.55 + 0.45 * Math.min(1, Math.max(0, vary)));

/**
 * Whether the glyph centres, in reading order, run down a column rather than across a row (vertical text opens top to
 * bottom): most steps from one to the next are more down than across.
 */
export function runsDown(at: { x: number; y: number }[]): boolean {
  const steps = at.slice(1).map((q, k) => Math.abs(q.y - at[k].y) > Math.abs(q.x - at[k].x));
  return steps.length > 0 && steps.filter(Boolean).length * 2 > steps.length;
}

/**
 * Each glyph's shift along the reading axis for a line opened `open` of `reach`: its distance from the centre of the
 * line's extent on that axis, times reach × open. Equal steps between neighbours, so the spacing opens evenly.
 */
export function trackShifts(along: number[], reach: number, open: number): number[] {
  if (!along.length) return [];
  const centre = (Math.min(...along) + Math.max(...along)) / 2;
  return along.map((p) => (p - centre) * reach * open);
}
