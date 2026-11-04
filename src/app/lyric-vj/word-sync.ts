// Word sync (逐字同步), the paid tiers' own: on the lines the line director picks, each meaning unit (a word, a name,
// a called word; never a name cut into characters, owner 2026-11-04) lands whole when its first sound is sung, on the
// server's per-character times (sung-times.ts: the song's trusted alignment, or the alignments voted). On a roll call
// the names take turns: the sung name shows, the one before gives way. Not every line (owner, 2026-11-04): the director chooses the lines whose words are the point, a rap's
// hits, a held key word, a counted list, and says why; a calm song may have none. Each ask passes the guards here;
// one that fails leaves its line on line timing and is logged, never dropped. The free tier never comes here: its
// lines enter whole or on the composer's steady reveal, never on a timing it does not have.
import { wordBreaks } from './phrases';
import { isSungChar } from './sung-times';

/**
 * The director's ask: the line, why, and (owner 2026-11-04) the line's meaning units as it would have them land, each
 * verbatim from the lyric, a name or a called word kept whole; `turns` when the units are called one by one (a roll
 * call: the sung name shows, the one before gives way). Unset, the units come from the line's own marks and words.
 */
export interface WordSyncAsk { cue: string; why: string; units?: string[]; turns?: boolean }
/**
 * An ask that passed: the sung time of every code point of the line (each character on its unit's time: a name lands
 * whole), where the times came from, and on a roll call the time each character gives way to the next name.
 */
export interface WordSync extends WordSyncAsk { times: number[]; source: string; until?: number[] }
export interface SyncDropped { ask: WordSyncAsk; reason: string }
export interface SyncCue { id: string; start: number; end: number; text: string }
/** What the plan knows of a line that word timing must not fight: a layout that lands its own pieces, two lines set as one, a line carried in by a handoff. */
export interface SyncLine { split?: boolean; together?: boolean; handoff?: boolean }
export interface SungOf { (id: string): { times: number[]; source: string } | undefined }

/** Sung-time sources exact enough to land a character on: the song's trusted alignment, or alignments that agree. */
export const SYNC_SOURCES = new Set(['song', 'vote', 'aligned']);
/** A line with fewer sung characters has nothing to spell out. */
export const SYNC_MIN_CHARS = 4;
/** Sung characters a second past which the characters land faster than they can be followed. */
export const SYNC_MAX_CPS = 8;
/** The sung characters must spread over at least this long, or they all land at once. */
export const SYNC_MIN_SPAN = 0.5;
/** Seconds the whole line must stay after its last character lands, to be seen whole. */
export const SYNC_TAIL = 0.8;
/** The share of a song's lines word sync may take at most: it is a choice, not the default. */
export const SYNC_SHARE = 0.4;

/** A unit of at most this many sung characters between the line's marks is one word to the ear: a name, a call. */
export const UNIT_MAX = 5;
/** On a roll call, a name must stand alone at least this long before the next takes its place. */
export const TURN_MIN = 0.3;
/** Marks between the units of a call (はるか！ぴあの！, い・く・ぞ): what makes a list a roll call rather than a sentence. */
const CALL_MARK = /[!！︕・･]/;
const SEP = /[\s　、。，．,.!?！？︕︖…‥・･/／~〜～「」『』（）()]/;

const sungCount = (text: string) => [...text].filter(isSungChar).length;

/** A line's meaning units: [from, to) code-point ranges covering it in order, and whether it is a roll call. */
export interface Units { ranges: [number, number][]; call: boolean }

/** The auto units of one stretch: whole when short (a name), else its words; marks stay with the unit before them. */
function wordsOf(chars: string[], from: number, to: number): [number, number][] {
  const piece = chars.slice(from, to);
  if (sungCount(piece.join('')) <= UNIT_MAX) return [[from, to]];
  const cuts = [...wordBreaks(piece.join(''))].sort((a, b) => a - b).filter((c) => c > 0 && c < piece.length && isSungChar(piece[c]));
  const at = [0, ...cuts, piece.length];
  return at.slice(1).map((b, k) => [from + at[k], from + b] as [number, number]);
}

/**
 * Where word sync may land a line: never inside a word. The director's units when it gave them and every one is found
 * in order; else the stretches between the line's marks (a name between ！ stays whole) and, in a long stretch, its
 * words. A list of three or more short stretches parted by call marks (！, ・) is a roll call; the director's `turns`
 * says so either way.
 */
export function meaningUnits(text: string, marked?: string[], turns?: boolean): Units {
  const chars = [...text];
  const starts: number[] = [];
  let at = 0;
  for (const u of (marked ?? []).filter((x) => x.trim())) {
    const w = [...u.trim()];
    let i = at;
    while (i + w.length <= chars.length && !w.every((ch, k) => chars[i + k] === ch)) i++;
    if (i + w.length > chars.length) { starts.length = 0; break; }
    starts.push(i);
    at = i + w.length;
  }
  // a stretch: sung characters up to the next mark, with the marks after it
  const stretches: [number, number][] = [];
  for (let i = 0; i < chars.length;) {
    let j = i;
    while (j < chars.length && !SEP.test(chars[j])) j++;
    while (j < chars.length && SEP.test(chars[j])) j++;
    stretches.push([i, Math.max(j, i + 1)]);
    i = Math.max(j, i + 1);
  }
  const named = stretches.filter(([a, b]) => chars.slice(a, b).some(isSungChar));
  const call = turns ?? (named.length >= 3 && named.every(([a, b]) => sungCount(chars.slice(a, b).join('')) <= UNIT_MAX) && named.slice(0, -1).every(([a, b]) => chars.slice(a, b).some((c) => CALL_MARK.test(c))));
  if (starts.length) {
    // the director's units: each runs to the next, so the marks and anything between ride with the unit before
    const cuts = [0, ...starts.slice(1), chars.length];
    return { ranges: cuts.slice(1).map((b, k) => [cuts[k], b] as [number, number]), call };
  }
  return { ranges: stretches.flatMap(([a, b]) => wordsOf(chars, a, b)), call };
}

/**
 * The sung times regrouped by unit: every character takes its unit's first sung time (a name lands whole when its
 * first syllable is heard). On a roll call, each unit's characters also give way when the next unit lands; the last
 * stays (0: never gives way). Undefined `until` when the line is not a call.
 */
export function unitTimes(text: string, times: number[], u: Units): { times: number[]; until?: number[]; lands: number[] } {
  const chars = [...text];
  const lands = u.ranges.map(([a, b]) => times[chars.slice(a, b).findIndex(isSungChar) + a] ?? times[a]);
  const out = [...times];
  const until: number[] = chars.map(() => 0);
  u.ranges.forEach(([a, b], k) => { for (let i = a; i < b; i++) { out[i] = lands[k]; if (u.call && k < u.ranges.length - 1) until[i] = lands[k + 1]; } });
  return { times: out, until: u.call ? until : undefined, lands };
}
export const syncCap = (lines: number) => Math.max(1, Math.ceil(lines * SYNC_SHARE));

/**
 * The director's asks against the guards, in song order; what fails is returned with its reason. `lineOf` tells what
 * the plan made of the line (unset: a plain line).
 */
export function checkWordSync(asks: WordSyncAsk[], cues: SyncCue[], sungOf: SungOf, lineOf: (id: string) => SyncLine | undefined = () => undefined): { kept: WordSync[]; dropped: SyncDropped[] } {
  const kept: WordSync[] = [];
  const dropped: SyncDropped[] = [];
  const byId = new Map(cues.map((c, i) => [c.id, { c, i }]));
  const cap = syncCap(cues.length);
  const seen = new Set<string>();
  const ordered = [...asks].sort((a, b) => (byId.get(a.cue)?.c.start ?? Infinity) - (byId.get(b.cue)?.c.start ?? Infinity));
  for (const ask of ordered) {
    const drop = (reason: string) => dropped.push({ ask, reason });
    const hit = byId.get(ask.cue);
    if (!hit) { drop('no such line'); continue; }
    if (seen.has(ask.cue)) { drop('asked twice'); continue; }
    seen.add(ask.cue);
    const { c, i } = hit;
    const line = lineOf(c.id) ?? {};
    if (line.split) { drop('a layout that lands its own pieces keeps its timing'); continue; }
    if (line.together) { drop('two lines set as one are timed as one'); continue; }
    if (line.handoff) { drop('a line carried in by a handoff comes in with its picture'); continue; }
    const chars = sungCount(c.text);
    if (chars < SYNC_MIN_CHARS) { drop(`${chars} sung characters is too few to spell out (${SYNC_MIN_CHARS} at least)`); continue; }
    const len = c.end - c.start;
    // the engine sets a line this tight whole whatever it is asked (runtime paceStyle): refused here, so the reason is known
    if (len < chars / 12 + 1.6) { drop('sung too fast to be spelled out and still read'); continue; }
    if (chars / Math.max(0.1, len) > SYNC_MAX_CPS) { drop(`${(chars / len).toFixed(1)} characters a second is faster than the eye follows`); continue; }
    const s = sungOf(c.id);
    if (!s || s.times.length !== [...c.text].length) { drop('no sung times for the line'); continue; }
    if (!SYNC_SOURCES.has(s.source)) { drop(`the alignment is not exact enough here (${s.source})`); continue; }
    const sung = [...c.text].map((ch, k) => (isSungChar(ch) ? s.times[k] : undefined)).filter((t): t is number => t !== undefined);
    const span = sung[sung.length - 1] - sung[0];
    if (span < SYNC_MIN_SPAN) { drop(`the characters are sung within ${span.toFixed(2)} s: they would land as one`); continue; }
    if (sung.some((t, k) => k > 0 && t < sung[k - 1] - 1e-6) || sung[0] < c.start - 0.5 || sung[sung.length - 1] > c.end + 0.5) { drop('the sung times do not fit the line'); continue; }
    const next = cues[i + 1];
    if (next && next.start - sung[sung.length - 1] < SYNC_TAIL) { drop('the next line comes before the last word can be seen'); continue; }
    // the director may name a roll call the marks do not show; it cannot unname one they do
    const units = meaningUnits(c.text, ask.units, ask.turns || undefined);
    const grouped = unitTimes(c.text, s.times, units);
    if (units.ranges.filter(([a, b]) => [...c.text].slice(a, b).some(isSungChar)).length < 2) { drop('one meaning unit: the line lands whole'); continue; }
    // a roll call whose names come too close for each to be read alone builds up instead of taking turns
    const tooClose = grouped.lands.some((t, k) => k > 0 && t - grouped.lands[k - 1] < TURN_MIN);
    if (kept.length >= cap) { drop(`more than ${cap} lines (${Math.round(SYNC_SHARE * 100)} % of the song): word sync is a choice, not the default`); continue; }
    const turns = units.call && !tooClose;
    kept.push({ ...ask, times: grouped.times, source: s.source, ...(turns ? { turns, until: grouped.until } : {}) });
  }
  return { kept, dropped };
}
