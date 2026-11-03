// Signature moments (專屬時刻), the paid tiers' own: the line director picks up to three lines of a song and each
// gets a drawn moment of a fixed form, with the lyric word that earns it. The forms are few and each is drawn by
// the renderer (render/signature.ts); this is what both sides agree on: the forms on offer, the words each form
// needs, and the guards a director's ask must pass. A failed guard drops the moment and never the line.
import { readingSec } from './render/reading-window';
import { isSungChar, wordIndex } from './sung-times';

export type MomentForm = 'strike' | 'shape' | 'freeze' | 'echo';
/**
 * The variants drawn so far, by form: a director may only ask for these. strike/wipe and shape/rise are drawn
 * (render/signature-forms.ts) but held back: on the 2026-11-03 test songs the wipe read as a glitch on small type and
 * the rise as ghosted text running into the next line, short of the approved tear and chain.
 */
export const MOMENT_FORMS: Record<MomentForm, string[]> = {
  strike: ['tear', 'burn', 'melt', 'slice', 'fly'],
  shape: ['chain', 'wave', 'fall', 'circle'],
  freeze: ['stop'],
  echo: ['ghost'],
};

/** The words a variant needs, as the director is told them (zh, ja, en): any one of them in the asked word passes. */
export const WORD_LISTS: Record<MomentForm, Record<string, string[]>> = {
  // the verb a strike needs in the line: the action lands on the line when it is sung
  strike: {
    tear: ['踢', '打', '破', '碎', '撕', '裂', '砸', '撞', '踹', '壊', '砕', '蹴', '殴', 'kick', 'break', 'smash', 'tear', 'crash'],
    burn: ['燒', '焚', '燃', '焼', 'burn', 'ignite'],
    melt: ['融', '溶', '滴', '化掉', '化開', 'とけ', 'melt', 'drip'],
    slice: ['切', '斬', '割', '斩', 'cut', 'slice', 'slash'],
    wipe: ['擦', '消', '抹', '拭', 'wipe', 'erase'],
    fly: ['放手', '手放', '丟', '扔', '甩', '捨', '投', '拋', '抛', '飛', '飄', 'fly', 'throw', 'let go', 'blow away'],
  },
  // the thing a shape names: the line is laid along it and moves like it
  shape: {
    chain: ['棍', '鏈', '鎖', '繩', '鞦韆', 'チェーン', 'ブランコ', '振り子', 'chain', 'rope', 'swing'],
    wave: ['波', '浪', '海', '潮', 'wave', 'sea', 'ocean', 'tide'],
    fall: ['雨', '淚', '涙', '雪', '葉', '花瓣', '花びら', 'rain', 'tear', 'snow', 'leaf', 'leaves', 'petal'],
    circle: ['月', '輪', '環', '戒指', '圓', '円', '丸', '鐘', '時計', 'まる', 'moon', 'ring', 'circle', 'clock'],
    rise: ['煙', '泡', '昇', '升', '氣球', '風船', '花火', '煙火', 'smoke', 'bubble', 'balloon', 'rise'],
  },
  // the word that stops time: the frame holds while only this line moves
  freeze: { stop: ['停', '止', '凍', '瞬間', '一瞬', 'ストップ', 'stop', 'freeze', 'frozen'] },
  // an echo's word is the one both lines sing (checked against the earlier line, not a list)
  echo: { ghost: [] },
};
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a latin word starts a word (ring, rings, not bring); a CJK one may sit inside a longer word (融 in 融化)
const anyOf = (words: string[]) => (words.length ? new RegExp(words.map((w) => (/^[a-z ]+$/i.test(w) ? `\\b${escape(w)}` : escape(w))).join('|'), 'iu') : undefined);
export const WORDS_OF = Object.fromEntries(Object.entries(WORD_LISTS).map(([f, vs]) => [f, Object.fromEntries(Object.entries(vs).flatMap(([v, ws]) => { const r = anyOf(ws); return r ? [[v, r]] : []; }))])) as Record<MomentForm, Record<string, RegExp>>;
export const STRIKE_WORDS = WORDS_OF.strike;
export const SHAPE_WORDS = WORDS_OF.shape;
/** The most sung characters a variant can lay out readably: a circle's rims hold about twenty. */
export const MAX_SUNG: Record<string, number> = { 'shape/circle': 20 };
/** Strikes that may take the line before as the thing struck (the spike's signboard and kick). */
export const PAIRED = new Set(['strike/tear']);

/** The lines a moment draws itself: an echo's earlier line was sung long ago and stays the engine's. */
export const ownCues = (m: { form: string; cues: string[]; repeat?: string }) => [...(m.form === 'echo' ? m.cues.slice(-1) : m.cues), ...(m.repeat ? [m.repeat] : [])];

/** Forms that show a character only once it is sung; every form so far holds the unsung ones in a ghost ink, readable. */
export const UNSUNG_HIDDEN = new Set<string>();

/** Seconds between two moments at least. */
export const MOMENTS_APART = 30;
export const MOMENTS_MAX = 3;
/** Frame jolts (a hit landing) a second at most; a hit past this still swings, but does not shake the frame. */
export const HITS_PER_SEC = 3;

/**
 * What the director asks for. `cues`: the line (one id); or the line struck and the line striking it (two, in order,
 * tear only); or, for an echo, the earlier line and the line answering it (two, in order, any distance apart).
 */
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
    const echo = ask.form === 'echo';
    if (echo) {
      // an echo: a line sung earlier, brought back under the line that answers it
      if (hits.length !== 2) { drop('an echo needs the earlier line and the line answering it'); continue; }
      if (hits[0].c.end > hits[1].c.start) { drop('the echoed line must be sung before the answering one'); continue; }
      if (spokenOf(hits[0].c.text) === spokenOf(hits[1].c.text)) { drop('the same line sung again is a repeat, not an echo'); continue; }
    } else if (hits.length === 2) {
      if (hits[1].i !== hits[0].i + 1) { drop('a struck line must be the line before the striking one'); continue; }
      if (!PAIRED.has(`${ask.form}/${ask.variant}`)) { drop(`${ask.form}/${ask.variant} takes one line`); continue; }
    }
    const actor = hits[hits.length - 1].c;
    const word = (ask.word ?? '').trim();
    const idx = wordIndex(actor.text, word);
    if (idx < 0) { drop(`the word 「${word}」 is not in the line`); continue; }
    const need = WORDS_OF[ask.form as MomentForm][ask.variant];
    if (need && !need.test(word)) { drop(`「${word}」 is not a ${ask.form}/${ask.variant} word`); continue; }
    const most = MAX_SUNG[`${ask.form}/${ask.variant}`];
    if (most && spokenOf(actor.text).length > most) { drop(`「${actor.text}」 is too long for ${ask.form}/${ask.variant} (${most} characters at most)`); continue; }
    // the echo's evidence: the words both lines sing, more than a particle
    if (echo && wordIndex(hits[0].c.text, word) < 0) { drop(`「${word}」 is not in the earlier line`); continue; }
    if (echo && [...word].filter(isSungChar).length < (/^[\p{Script=Latin}\s]+$/u.test(word) ? 3 : 2)) { drop(`「${word}」 is too short to carry an echo`); continue; }
    const sung: Record<string, number[]> = {};
    const sungSource: Record<string, string> = {};
    let missing = '';
    for (const { c } of echo ? hits.slice(1) : hits) {
      const s = sungOf(c.id);
      if (!s || s.times.length !== [...c.text].length) { missing = c.id; break; }
      sung[c.id] = s.times;
      sungSource[c.id] = s.source;
    }
    if (missing) { drop(`no sung times for ${missing}`); continue; }
    const at = sung[actor.id][idx];
    // the struck line is read whole before the strike; a line that is its own moment reads from its last character to the next line
    const object = !echo && hits.length === 2 ? hits[0].c : undefined;
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
