// Signature moments (專屬時刻), the paid tiers' own: the line director picks up to three lines of a song and each
// gets a drawn moment of a fixed form, with the lyric word that earns it. The forms are few and each is drawn by
// the renderer (render/signature.ts); this is what both sides agree on: the forms on offer, the words each form
// needs, and the guards a director's ask must pass. A failed guard drops the moment and never the line.
import { readingSec } from './render/reading-window';
import { isSungChar, wordIndex } from './sung-times';

export type MomentForm = 'strike' | 'shape';
/** The variants drawn so far, by form: a director may only ask for these. */
export const MOMENT_FORMS: Record<MomentForm, string[]> = { strike: ['tear'], shape: ['chain', 'wave', 'fall'] };

/** The verb a strike needs in the line: the action lands on the line's paper when it is sung. */
export const STRIKE_WORDS: Record<string, RegExp> = {
  tear: /[踢打破碎撕裂砸撞踹壊砕蹴殴]/u,
  burn: /[燒燃焼]/u,
  melt: /[融溶]/u,
  slice: /[切斬割斩]/u,
  wipe: /[擦消抹拭]/u,
  fly: /放手|[丟扔甩捨投拋抛]/u,
};
/** The thing a shape names: the line is laid along it and moves like it. */
export const SHAPE_WORDS: Record<string, RegExp> = {
  chain: /[棍鏈鎖繩]|鞦韆|チェーン|ブランコ|振り子/u,
  wave: /[波浪海潮]/u,
  circle: /[月輪環戒圓円丸鐘]|時計/u,
  fall: /[雨淚涙雪葉]|花瓣|花びら/u,
  rise: /[煙泡昇升]|氣球|風船|花火|煙火/u,
};
export const WORDS_OF: Record<MomentForm, Record<string, RegExp>> = { strike: STRIKE_WORDS, shape: SHAPE_WORDS };

/** Forms that show a character only once it is sung; every form so far holds the unsung ones in a ghost ink, readable. */
export const UNSUNG_HIDDEN = new Set<string>();

/** Seconds between two moments at least. */
export const MOMENTS_APART = 30;
export const MOMENTS_MAX = 3;
/** Frame jolts (a hit landing) a second at most; a hit past this still swings, but does not shake the frame. */
export const HITS_PER_SEC = 3;

/** What the director asks for. `cues`: the line (one id), or the line struck and the line striking it (two, in order). */
export interface MomentAsk { cues: string[]; form: string; variant: string; word: string; why: string }
/** An ask that passed, with what the renderer needs: when the word is sung and every involved line's character times. */
export interface SignatureMoment extends MomentAsk { form: MomentForm; at: number; sung: Record<string, number[]>; sungSource: Record<string, string>; /** The line sung again straight after: the moment's second pass. */ repeat?: string }
export interface Dropped { ask: MomentAsk; reason: string }

export interface MomentCue { id: string; start: number; end: number; text: string }
export interface SungOf { (id: string): { times: number[]; source: string } | undefined }

/** The line without its bracketed calls: what a moment prints as the line (the calls are printed apart, small). */
export const mainOf = (text: string) => text.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim();
const spokenOf = (text: string) => [...mainOf(text)].filter(isSungChar).join('');

/** The last sung character's time (the line is whole from here). */
export const lastSung = (text: string, times: number[]) => {
  const idx = [...text].map((ch, i) => (isSungChar(ch) ? i : -1)).filter((i) => i >= 0);
  return idx.length ? times[idx[idx.length - 1]] : times[times.length - 1];
};

/** The director's asks against the guards, in song order; what fails is returned with its reason. */
export function checkMoments(asks: MomentAsk[], cues: MomentCue[], sungOf: SungOf, forms: Record<string, string[]> = MOMENT_FORMS, apart = MOMENTS_APART): { kept: SignatureMoment[]; dropped: Dropped[] } {
  const kept: SignatureMoment[] = [];
  const dropped: Dropped[] = [];
  const byId = new Map(cues.map((c, i) => [c.id, { c, i }]));
  const ordered = [...asks].sort((a, b) => (byId.get(a.cues.at(-1) ?? '')?.c.start ?? Infinity) - (byId.get(b.cues.at(-1) ?? '')?.c.start ?? Infinity));
  for (const ask of ordered) {
    const drop = (reason: string) => dropped.push({ ask, reason });
    const variants = forms[ask.form];
    if (!variants) { drop(`no such form: ${ask.form}`); continue; }
    if (!variants.includes(ask.variant)) { drop(`${ask.form}/${ask.variant} is not drawn yet`); continue; }
    if (!ask.cues?.length || ask.cues.length > 2 || ask.cues.some((id) => !byId.has(id))) { drop('one or two known lines'); continue; }
    const hits = ask.cues.map((id) => byId.get(id)!);
    if (hits.length === 2 && hits[1].i !== hits[0].i + 1) { drop('a struck line must be the line before the striking one'); continue; }
    const actor = hits[hits.length - 1].c;
    const word = (ask.word ?? '').trim();
    const idx = wordIndex(actor.text, word);
    if (idx < 0) { drop(`the word 「${word}」 is not in the line`); continue; }
    const need = WORDS_OF[ask.form as MomentForm][ask.variant];
    if (need && !need.test(word)) { drop(`「${word}」 is not a ${ask.form}/${ask.variant} word`); continue; }
    const sung: Record<string, number[]> = {};
    const sungSource: Record<string, string> = {};
    let missing = '';
    for (const { c } of hits) {
      const s = sungOf(c.id);
      if (!s || s.times.length !== [...c.text].length) { missing = c.id; break; }
      sung[c.id] = s.times;
      sungSource[c.id] = s.source;
    }
    if (missing) { drop(`no sung times for ${missing}`); continue; }
    const at = sung[actor.id][idx];
    // the struck line is read whole before the strike; a line that is its own moment reads from its last character to the next line
    const object = hits.length === 2 ? hits[0].c : undefined;
    if (object && at - lastSung(object.text, sung[object.id]) < readingSec(mainOf(object.text), object.start, object.end) - 0.05) { drop(`「${object.text}」 is struck before it can be read`); continue; }
    // the line sung again straight away is one moment with the first (a second pass of the same form)
    const after = cues[hits[hits.length - 1].i + 1];
    const again = after && spokenOf(after.text) === spokenOf(actor.text) && after.start - actor.end <= 0.5 ? after : undefined;
    const repeatSung = again && sungOf(again.id);
    if (again && repeatSung?.times.length === [...again.text].length) {
      sung[again.id] = repeatSung.times;
      sungSource[again.id] = repeatSung.source;
    }
    const repeat = again && sung[again.id] ? again : undefined;
    // the moment's own line is up whole from its start, unsung characters in a ghost ink (readable), except where the
    // form only shows a character once it is sung; it stays until the next line, at most 3 s past its last character
    const next = cues[hits[hits.length - 1].i + (repeat ? 2 : 1)];
    const last = lastSung(actor.text, sung[actor.id]);
    const until = Math.min(next ? next.start : Infinity, (repeat ? repeat.start : last) + 3);
    const readFrom = UNSUNG_HIDDEN.has(`${ask.form}/${ask.variant}`) ? last : actor.start - 0.2;
    if (until - readFrom < readingSec(mainOf(actor.text), actor.start, actor.end) - 0.05) { drop(`「${actor.text}」 has no time to be read whole`); continue; }
    if (kept.some((k) => Math.abs(k.at - at) < apart)) { drop(`within ${apart} s of another moment`); continue; }
    if (kept.length >= MOMENTS_MAX) { drop(`more than ${MOMENTS_MAX} moments`); continue; }
    kept.push({ ...ask, form: ask.form as MomentForm, word, at, sung, sungSource, ...(repeat ? { repeat: repeat.id } : {}) });
  }
  return { kept, dropped };
}

/** The hits that may shake the frame: at most `perSec` in any one second, the earlier ones kept. */
export function thinHits(times: number[], perSec = HITS_PER_SEC): number[] {
  const out: number[] = [];
  for (const t of [...times].sort((a, b) => a - b)) if (out.filter((x) => x > t - 1).length < perSec) out.push(t);
  return out;
}

export interface MomentRecord { song: string; moments?: string[] }

/** The song's forms written into the design history (its record, or a new one for a song the director never designed). */
export function recordMoments<T extends MomentRecord>(history: T[], song: string, kept: { form: string; variant: string }[]): T[] {
  const forms = kept.map((k) => `${k.form}/${k.variant}`);
  const own = history.find((r) => r.song === song);
  if (own) return history.map((r) => (r === own ? { ...r, moments: forms } : r));
  return [...history, { song, moments: forms } as T];
}

/** Forms the last `recent` other songs used twice or more: the director is told to avoid them. */
export function overusedForms(history: MomentRecord[], song: string, recent = 6): string[] {
  const used = history.filter((r) => r.song !== song && r.moments?.length).slice(-recent).flatMap((r) => r.moments!);
  const count = new Map<string, number>();
  for (const f of used) count.set(f, (count.get(f) ?? 0) + 1);
  return [...count].filter(([, n]) => n >= 2).map(([f]) => f);
}
