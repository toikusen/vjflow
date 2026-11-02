// The reading window: every line's time is entrance, then whole reading, then exit, in that order of priority. Reading
// is reserved first; whatever is left pays for motion, and a motion that does not fit is dropped rather than squeezed.
// No three.js here: the line composer plans with these same numbers the renderer gates with.

/** The smallest type, px at 1920 wide, a composer line may rest at: under it the line takes another layout. */
export const REST_FLOOR = 52;

/** Seconds a line needs on screen, fully in, to be read: chars / 12 + 1 s, at most 90 % of the time it is sung. */
export const readingSec = (text: string, start: number, end: number) => Math.min([...text.replace(/\s/g, '')].length / 12 + 1, 0.9 * (end - start + 0.4));

export interface LineSpan { start: number; end: number; text: string }

const chars = (s: string) => [...s.replace(/\s/g, '')].length;
/** Two lines sung back to back, each faster than it can be read: they are set together as one two-row line. */
export const setTogether = (a: LineSpan, b: LineSpan) => {
  const quick = (c: LineSpan) => c.end - c.start < chars(c.text) / 12 + 1;
  return quick(a) && quick(b) && b.start - a.end <= 0.35 && chars(a.text) + chars(b.text) <= 26;
};

/** A line's three stages, in absolute seconds: [show, readFrom] enters, [readFrom, readTo] is read whole, [readTo, gone] exits. */
export interface LineWindow { show: number; readFrom: number; readTo: number; gone: number }

/** The stages when the wanted motions all fit, else undefined. */
export function lineWindow(show: number, gone: number, need: number, enterSec: number, exitSec: number): LineWindow | undefined {
  const readFrom = show + enterSec;
  const readTo = gone - exitSec;
  return readTo - readFrom >= need ? { show, readFrom, readTo, gone } : undefined;
}

export interface MotionBudget { enter: number; exit: number; extra: number }

/** What of the wanted motion stays in `room` seconds around `need`: the decoration goes first, then the exit, then the entrance. */
export function gateMotion(want: MotionBudget, room: number, need: number): MotionBudget {
  const spare = room - need;
  if (spare >= want.enter + want.exit + want.extra) return want;
  if (spare >= want.enter + want.exit) return { ...want, extra: 0 };
  if (spare >= want.enter) return { ...want, exit: 0, extra: 0 };
  return { enter: 0, exit: 0, extra: 0 };
}

/** A sentence-ending mark or the like: the singer's own pause, whatever the timing says. */
const PAUSE_MARK = /[。！？!?…～~]\s*$/;

export interface LineBeat {
  id: string;
  /** Seconds from this line's start to the next one's. */
  slot: number;
  need: number;
  /** Seconds of the slot reading does not use: all the motion this line can afford. */
  spare: number;
  /** Free seconds between the end of the line and the next line. */
  gap: number;
  /** Part of a run of quick lines. */
  quick: boolean;
  /** The line a quick run lands on: it stays up long and still, so the slowdown is felt. */
  payoff: boolean;
  /** How long it may stay past its last syllable (s); unset leaves the renderer's default. */
  linger?: number;
}

/** A line this short in its slot belongs to a quick run. */
const QUICK_SLOT = 2.4;
/** …or this little left over once it is read, however long its slot. */
const QUICK_SPARE = 0.5;
/** Quick lines in a row before the next slow one is a payoff. */
const QUICK_RUN = 3;
const LONG_LINGER = 2.6;

/**
 * The fast and slow of a stretch of lines: from how many characters a line has, the real gaps and the sung pauses.
 * A run of quick lines earns the next line with room a long hold: the contrast is what makes the run feel fast.
 */
export function lineBeats(cues: (LineSpan & { id: string })[], duration: number): LineBeat[] {
  const base = cues.map((c, i) => {
    const next = cues[i + 1]?.start ?? duration;
    const need = readingSec(c.text, c.start, c.end);
    const slot = next - c.start;
    const gap = Math.max(0, next - c.end);
    const spare = Math.max(0, slot - need);
    return { id: c.id, slot, need, spare, gap, quick: slot < QUICK_SLOT || spare < QUICK_SPARE, payoff: false };
  });
  let run = 0;
  return base.map((b, i) => {
    const room = !b.quick && (b.gap >= 0.8 || PAUSE_MARK.test(cues[i].text));
    if (b.quick) {
      run++;
      return b;
    }
    const payoff = room && run >= QUICK_RUN;
    run = 0;
    return payoff ? { ...b, payoff, linger: Math.min(LONG_LINGER, Math.max(1.2, b.gap - 0.2)) } : b;
  });
}
