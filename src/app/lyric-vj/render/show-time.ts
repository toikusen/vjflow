// When a line shows: a little before its voice so it is read as it is sung, its entrance over when the voice comes in,
// never while the line before is still being sung. One computation for the renderer (engine showAt) and the plan
// (lineplan-core holdEndBy: a hold event is over before the next line shows). Numbers only.
import { ARRIVAL_SEC } from './arrival';
import { CARRIER_SEC } from './carrier-moves';

/** Shown a little before the voice so it is read as it is sung, s. */
export const LEAD = 0.2;
/** A song under this tempo breathes: each line shows this much before its voice. */
export const SLOW_TEMPO = 95;
export const SLOW_LEAD = 0.35;
/** A line never shows until this long after the line before has sung its last word, s. */
export const AFTER_LAST_SUNG = 0.3;
/** How long before the voice each entrance starts, s at full pace (an outline's light needs its own cut: none). */
export const ENTER_LEAD: Record<string, number> = { slam: 0.3, pop: 0.3, wipe: 0.2, fade: 0.25, ink: 0.45, cut: 0, ...Object.fromEntries([...Object.entries(CARRIER_SEC), ...Object.entries(ARRIVAL_SEC)].map(([k, sec]) => [k, sec * 0.7])), 'soft-float': 0.4, 'cell-land': 0.3, 'reply-land': 0.25, 'edge-light': 0 };
const ENTER_LEAD_ELSE = 0.25;

/** The lead a song's lines show with. */
export const leadOf = (tempo?: number) => (tempo !== undefined && tempo < SLOW_TEMPO ? SLOW_LEAD : LEAD);
/** The time a line's last word is sung, when its words are timed. */
export const lastSungOf = (c: { charTimed?: boolean; charStarts?: number[] }) => (c.charTimed && c.charStarts?.length ? c.charStarts[c.charStarts.length - 1] : -Infinity);

/** When a line shows, before any page it waits for (engine pageCutBefore): its lead or its entrance's, after the line before is sung. */
export function showTime(cue: { start: number; end: number }, enter: string, lead: number, prevLastSung = -Infinity): number {
  const pace = Math.min(1, Math.max(0.35, (cue.end - cue.start) / 2));
  return Math.max(cue.start - Math.max(lead, (ENTER_LEAD[enter] ?? ENTER_LEAD_ELSE) * pace), Math.min(cue.start, prevLastSung + AFTER_LAST_SUNG));
}
