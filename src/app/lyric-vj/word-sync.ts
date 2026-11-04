// Word sync (逐字同步), the paid tiers' own: on the lines the line director picks, each character lands exactly when
// it is sung, on the server's per-character times (sung-times.ts: the song's trusted alignment, or the alignments
// voted). Not every line (owner, 2026-11-04): the director chooses the lines whose words are the point, a rap's
// hits, a held key word, a counted list, and says why; a calm song may have none. Each ask passes the guards here;
// one that fails leaves its line on line timing and is logged, never dropped. The free tier never comes here: its
// lines enter whole or on the composer's steady reveal, never on a timing it does not have.
import { isSungChar } from './sung-times';

export interface WordSyncAsk { cue: string; why: string }
/** An ask that passed: the sung time of every code point of the line, and where the times came from. */
export interface WordSync extends WordSyncAsk { times: number[]; source: string }
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

const sungCount = (text: string) => [...text].filter(isSungChar).length;
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
    if (kept.length >= cap) { drop(`more than ${cap} lines (${Math.round(SYNC_SHARE * 100)} % of the song): word sync is a choice, not the default`); continue; }
    kept.push({ ...ask, times: s.times, source: s.source });
  }
  return { kept, dropped };
}
