// The paid line director's rules: one director call reads the whole song on its paid design and writes each line's
// stack, with a reason for each choice. Everything it says is checked against the composer's own guards; what fails
// falls back to the composer's choice for that line and is logged. The result is a plan typeplan.mts --plan reads, so
// the renderer, the reading budget and the validators are the composer's. Opt-in: only linedirect.mts runs this.

import { heldTail, isLineExit, leanAngle, LINE_EXIT_KINDS, LINE_EXIT_SEC, LineExitKind } from '../../src/app/lyric-vj/render/line-exit';
import { isArrival } from '../../src/app/lyric-vj/render/arrival';
import { cjkOnly, cornerOf, crossingOf, phraseSpans, spoken, twoParts } from '../../src/app/lyric-vj/render/line-space';
import { lineBeats, LineBeat, setTogether } from '../../src/app/lyric-vj/render/reading-window';
import { KNOBS } from '../../src/app/lyric-vj/render/knobs';
import { HANDOFF_KINDS, HandoffKind } from '../../src/app/lyric-vj/render/lyric-handoff';
import { isLineGround } from '../../src/app/lyric-vj/render/line-grounds';
import { wordBreaks } from '../../src/app/lyric-vj/phrases';
import { splitSongTitle } from '../../src/app/lyric-vj/structure';
import { MomentAsk, MomentForm, MOMENT_FORMS, WORD_LISTS } from '../../src/app/lyric-vj/signature-moments';
import type { FineTier, SymbolName } from '../../src/app/lyric-vj/treatment';
import { ARRIVAL_APART, ARRIVAL_SHARE, ARRIVALS_SHARE, BACKGROUNDS, BREATH_MIN, CARRIER_APART, CARRIER_SHARE, CARRIERS, charsPerSec, composePlan, Cue, DEVICE_SHARE, DISTINCT_SHARE, EXIT_LAYOUT, EXIT_PAPER, EXIT_SHARE, fallbackParts, fitsCalm, FIXED_LAYOUT, GROUND_HELP, HANDOFF_APART, KEEPS_EXIT, keyOf, LAYOUT_SHARE, levelOf, MARK_SHARE, Meaning, NOT_CALM_EXIT, OWN_EXIT, PAIR_APART, PAIR_SHARE, PairKind, PAPER_EXITS, QUIET_BACKGROUNDS, Recipe, RECIPES, RING_MAX, SHARED_SHARE, SongPart, SPATIAL, SPATIAL_SHARE, TRACKED, type WorldPool } from './lineplan-core.mts';
import { type PlanWorld, worldKitPrompt } from './paid-world.mts';
import type { StyleWorld } from '../../src/app/lyric-vj/style-world';
import { worldById } from '../../src/app/lyric-vj/style-worlds';
import { unrepeatGround } from '../../src/app/lyric-vj/free-plan';
import { cutTimes } from './interludes.mts';
import { ENTER_HELP, EXIT_HELP, IDLE_HELP } from './typehelp.mts';

/** Opus prices the current director is billed at (typeplan.mts): USD per million tokens. */
export const USD_IN = 4;
export const USD_OUT = 20;
export const usdOf = (input: number, output: number) => (input * USD_IN + output * USD_OUT) / 1e6;

export interface Why { cut: string; layout: string; enter: string; idle: string; exit: string; decor: string }
export interface LineChoice {
  cue: string;
  /** A line sung again that comes back as an earlier one did: every choice is that line's, its own reasons say why. */
  sameAs: string;
  cut: 'hold' | 'split';
  pieces: string[];
  layout: string;
  side: string;
  enter: string;
  idle: string;
  exit: string;
  decor: string;
  /** With decor fine-note: the small words the director writes beside the line, and what they are. */
  note: string;
  noteKind: string;
  handoff: string;
  joinNext: string;
  lineCam: string;
  hit: string;
  emphasis: string;
  method: string;
  ground: string;
  /** The words in the line, or the part's world, that give a meaning-only device its reason. */
  evidence: string;
  why: Why;
}
export interface Direction {
  reading: string;
  /** The song's one drawn sign, or empty: B56 and B60 need one. */
  icon: string;
  techniques: { id: string; where: string; why: string }[];
  parts: { from: string; tension: number; why: string }[];
  tune: { key: string; value: number; cue: string; why: string }[];
  lines: LineChoice[];
  /** Signature moments (signature-moments.ts), only when the run asked for them; checked by checkMoments. */
  moments?: MomentAsk[];
}

/** Moves never drawn, whatever a director asks: a camera HUD, invented readings, RGB fringes, lyric wallpaper. */
export const EXCLUDED_FX = new Set(['hud', 'crt', 'wall', 'ascii', 'counter', 'measure', 'chart', 'progress', 'blueprint', 'scope', 'marquee', 'glitch']);
/** Moves that draw without words and stay out of the way of a line (material.ts hushes or masks most): the paid moves a line may stand on. */
const SCREEN_GROUNDS = ['rain', 'flow', 'motes', 'bokeh', 'stars', 'smoke', 'beams', 'sparkle', 'fireworks', 'confetti', 'meteor', 'ripple', 'sines', 'contours'];
/** Screen moves a song felt rather than shouted leaves out (typeplan.mts LOUD). */
const LOUD_GROUNDS = new Set(['rays', 'meteor', 'fireworks', 'beams', 'confetti']);
/** Line devices drawn straight on the cut: their condition is a word or a song sign. */
const DEVICE_GROUNDS = ['horizon-light', 'surface-crack', 'fold-mark'];
/** Counts a lyric can really set: how many of a thing are drawn. Nothing else is steered from a word. */
export const TUNABLE = ['meteor.n', 'stars.n', 'rain.n', 'sparkle.n', 'fireworks.n', 'bokeh.n', 'beams.n', 'confetti.n', 'motes.n'];

/** Templates a plain entrance can stand on: no paper, no shape of their own. */
const OPEN_TEMPLATES = new Set(['stair', 'stack', 'punch', 'quote', 'vertical', 'couplet', 'handwrite']);
/** Plain entrances, with the fragments, junk symbols and scattered pieces left out. */
const OPEN_ENTERS = new Set(['pop', 'slam', 'wipe', 'fade', 'cut', 'ink', 'focus', 'rise', 'dash', 'drop', 'zoom', 'spread', 'settle', 'squash', 'windup', 'flip', 'slice', 'flicker', 'rip', 'snapin']);
const OPEN_IDLES = new Set(['still', 'drift', 'push', 'wave', 'float', 'shake', 'boil', 'hop', 'thump']);
/** The plain moves a song felt rather than shouted does without. */
const LOUD_ENTERS = new Set(['slam', 'zoom', 'dash', 'squash', 'windup', 'rip', 'snapin', 'flicker']);
const LOUD_IDLES = new Set(['shake', 'thump', 'hop', 'boil']);
const LOUD_EXITS = new Set(['burst', 'slash', 'shatter', 'zoom', 'dash']);
/** Layouts that cut a line into pieces as it is sung. */
const SPLIT_LAYOUTS = new Set(['build-cut', 'beat-cut', 'panel-route']);
/** Exits that belong to their own layout (lineplan-core OWN_EXIT, fold-close). */
const OWN_LAYOUT_EXIT: Record<string, string> = { 'box-turn': 'turn-box', 'frame-advance': 'frame-feed', 'display-off': 'dot-display', 'fold-close': 'lyric-carrier' };
const PLAIN_EXITS = ['fade', 'rise', 'cut', 'shrink', 'drop', 'dash', 'collapse', 'slash', 'shatter', 'domino', 'burst', 'melt', 'dust', 'zoom', 'split'];
const QUIET_EXITS = new Set(['fade', 'rise', 'cut', 'shrink']);
const METHODS = ['color', 'mark', 'weight', 'scale', 'box', 'shake'];
const DECORS = ['none', 'fine-title', 'fine-key', 'fine-rule', 'fine-note', 'oval', 'icon', 'breath', 'relay'];
/** What the director's own small words may be: a story's scene card, the song's own chapter name, an echo of a line sung before, who sings. */
export const NOTE_KINDS = ['scene', 'chapter', 'echo', 'singer'] as const;
export const NOTE_MAX = 14;
/** Notes a part may carry. */
export const NOTE_PER_PART = 4;
/** A part's name read as a label stuck on the video (2026-11-02 owner review): never a note. */
const GENERIC_PART = /主歌|副歌|導歌|橋段|前奏|間奏|尾奏|サビ|Aメロ|Bメロ|verse|chorus|bridge|hook|intro|outro|interlude/i;

/**
 * Why the director's note may not stand beside the line, or undefined when it may: never made-up detail (a number the
 * line does not have, a generic part name), an echo only of words sung before, a singer only of the song's own.
 */
/** The script a song is sung in, read off its lyrics: what its small words must be written in. */
export type SongScript = 'ja' | 'ko' | 'zh' | 'latin';
/** Kana, not counting the katakana middle dot (・), which Chinese scene notes use too (「深夜・石橋」 was refused, 2026-11-03). */
const KANA = /[\u3040-\u30fa\u30fc-\u30ff]/;
const KANA_ALL = new RegExp(KANA.source, 'g');
export function songScript(lines: string[]): SongScript {
  const all = lines.join('');
  const n = (re: RegExp) => (all.match(re) ?? []).length;
  const [kana, hangul, han, latin] = [n(KANA_ALL), n(/[\uac00-\ud7af]/g), n(/[\u4e00-\u9fff]/g), n(/[A-Za-z]/g)];
  if (hangul >= Math.max(kana, han, latin / 3)) return 'ko';
  if (kana > 0 && kana >= han * 0.15) return 'ja';
  if (han >= latin / 3) return 'zh';
  return 'latin';
}
/** Whether a note reads as the song's own language (a Japanese song's note in Chinese read as a translation nobody asked for). */
const inScript = (t: string, s: SongScript) =>
  s === 'ja' ? KANA.test(t) : s === 'ko' ? /[\uac00-\ud7af]/.test(t) : s === 'zh' ? /[\u4e00-\u9fff]/.test(t) && !KANA.test(t) && !/[\uac00-\ud7af]/.test(t) : /[A-Za-z]/.test(t) && !/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(t);

export function noteRefusal(kind: string, text: string, line: string, earlier: string[], singers: string[], script?: SongScript): string | undefined {
  const t = text.trim();
  if (!(NOTE_KINDS as readonly string[]).includes(kind)) return 'no such kind of note';
  if (!t || glyphs(t) > NOTE_MAX) return `a note is 1–${NOTE_MAX} characters`;
  if (GENERIC_PART.test(t)) return 'a generic part name is a label, not a note';
  if (/\d/.test(t) && !/\d/.test(line)) return 'numbers the song does not sing';
  if (kind === 'echo' && (!earlier.some((e) => spoken(e).includes(spoken(t))) || spoken(line).includes(spoken(t)))) return 'an echo is words sung before, not this line';
  if (kind === 'singer' && !singers.includes(t)) return 'not one of the song\'s singers';
  // the song's own words, a singer's name, pass as they are; a scene or chapter is written in the song's language
  if (script && (kind === 'scene' || kind === 'chapter') && !inScript(t, script)) return 'not in the song\'s language';
  // a scene or chapter that only says the line again tells nothing (「夜晚・橋邊」 beside 夜晚的橋邊在飄雪)
  const own = [...spoken(t).replace(/[\s・·、，。!！?？]/g, '')];
  if ((kind === 'scene' || kind === 'chapter') && own.every((ch) => line.includes(ch))) return 'only the line\'s own words again';
  return undefined;
}
const LINE_CAMS = ['', 'lean', 'phrase-track', 'arc', 'ground'];
const SYMBOLS: SymbolName[] = ['flower', 'drop', 'flame', 'note', 'star', 'heart', 'sparkle'];

/** The layouts' shapes need a line of this shape, whatever it means. */
const SHAPED: Record<string, (text: string) => boolean> = {
  'corner-anchor': (t) => !!cornerOf(spoken(t)),
  'cross-anchor': (t) => !!crossingOf(spoken(t)),
  'balance-line': (t) => !!twoParts(spoken(t)),
  editorial: (t) => /[\s，,、]/.test(spoken(t)) && cjkOnly(spoken(t)) && !!twoParts(spoken(t)),
  'panel-route': (t) => phraseSpans(spoken(t), 3).length > 1 && cjkOnly(spoken(t)),
  'phrase-panels': (t) => phraseSpans(spoken(t), 3).length > 1,
};

const glyphs = (s: string) => [...s.replace(/\s/g, '')].length;
const letters = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

/**
 * The stack a line's layout, entrance and hold make, if the kit has drawn them together: a recipe's own pairing, or a
 * plain entrance on a plain layout. A recipe's state, mark, length limits and needed seconds come with it.
 */
export function stackOf(layout: string, enter: string, idle: string, level: number, calm = false): Recipe | undefined {
  // a line cut in pieces lands them itself: what it was asked to enter or hold with changes nothing
  if (layout === 'build-cut' || layout === 'beat-cut') {
    const own = RECIPES.filter((r) => r.template === layout && (calm ? fitsCalm(r) : r.id !== 'build-calm')).sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level))[0];
    return own && { ...own };
  }
  const same = RECIPES.filter((r) => r.template === layout && r.enter === enter && (calm ? fitsCalm(r) : true));
  const nearest = (rs: Recipe[]) => [...rs].sort((x, y) => Math.abs(x.level - level) - Math.abs(y.level - level))[0];
  const exact = same.filter((r) => r.idle === idle);
  if (exact.length) return { ...nearest(exact) };
  if (OPEN_TEMPLATES.has(layout) && OPEN_ENTERS.has(enter) && OPEN_IDLES.has(idle)) return { id: `open-${layout}-${enter}`, level: level as Recipe['level'], template: layout, sides: ['center', 'left', 'right'], enter, exit: 'fade', idle, method: 'color' };
  // a surface or a carrier's hold is the recipe's own idea: only a plain hold may be swapped for a plain hold
  const plain = same.filter((r) => !r.state && OPEN_IDLES.has(r.idle));
  return plain.length && OPEN_IDLES.has(idle) ? { ...nearest(plain), idle } : undefined;
}

/** Marks that are one mark to a reader: the lyric keeps its vertical forms, a director writes the plain ones. */
const sameMark = (c: string) => c.replace(/[!︕]/g, '！').replace(/[?︖]/g, '？');
const isCall = (p: string) => /[()（）]/.test(p);

/** The offsets a director's pieces cut a line at, when they are the line, in order, at breaks a word allows. */
export function rowsOf(text: string, pieces: string[]): number[] | undefined {
  // a bracketed call has its own track: it is never a piece of the line
  const sung = pieces.filter((p) => !isCall(p));
  if (sung.length < 2 || sung.length > 4) return undefined;
  const cs = [...text];
  // spaces and bracketed calls lie between the pieces, wherever the lyric sets them
  const skip = (at: number) => {
    for (;;) {
      while (at < cs.length && /\s/.test(cs[at])) at++;
      if (!/[(（]/.test(cs[at] ?? '')) return at;
      const close = cs.findIndex((c, i) => i > at && /[)）]/.test(c));
      if (close < 0) return at;
      at = close + 1;
    }
  };
  const rows: number[] = [];
  let at = 0;
  for (const p of sung) {
    at = skip(at);
    const piece = [...p.replace(/\s/g, '')];
    if (!piece.length) return undefined;
    // a lone cry (哈!) stays on the end of the piece before it: a line never lands one character by itself
    if (letters(p) >= 2 || !rows.length) rows.push(at);
    for (const ch of piece) {
      at = skip(at);
      if (sameMark(cs[at] ?? '') !== sameMark(ch)) return undefined;
      at += 1;
    }
  }
  if (skip(at) !== cs.length) return undefined;
  if (rows.length < 2) return undefined;
  const cuts = rows.slice(1);
  const word = wordBreaks(text);
  return cuts.every((b) => word.has(b)) ? cuts : undefined;
}

export interface SongIn { title: string; duration: number; tempo: number; beats: number[]; cues: Cue[]; sections?: { start: number; end: number; type: string; energy: number }[]; singers?: { name: string }[] }
export interface Fallback { cue: string; field: string; said: string; reason: string }
export interface Accepted {
  recipe?: Recipe;
  hold: boolean;
  rows?: number[];
  join?: PairKind;
  exit?: string;
  decor?: string;
  /** The director's own small words (decor fine-note). */
  note?: string;
  hand?: HandoffKind;
  lineCam?: string;
  hit?: string;
  emphasis?: string;
  method?: string;
  ground?: string;
  why: Why;
  evidence: string;
}
export interface Ctx {
  song: SongIn; calm: boolean; partWhat: (cue: string) => string; levelOf: (c: Cue) => number; screenGrounds: string[];
  /** The style world the song is drawn in (paid-world.mts): its closed pool is all a line may stand in. */
  world?: WorldPool;
}

/**
 * A world set the director named, as the composer's recipe for it: the set's own enter and exit when the director's
 * are its, else the set's first (each swap named in `fixes`); the level nearest the line's. Undefined when the layout
 * names no set of this world.
 */
export function worldStackOf(layout: string, enter: string, exit: string, idle: string, level: number, W: WorldPool): { recipe: Recipe; fixes: string[] } | undefined {
  const own = W.recipes.filter((r) => r.wline?.set === layout);
  if (!own.length) return undefined;
  const fixes: string[] = [];
  const enters = [...new Set(own.map((r) => r.wline!.enter))];
  const exits = [...new Set(own.map((r) => r.wline!.exit))];
  const e = enters.includes(enter) ? enter : (fixes.push('enter'), enters[0]);
  const x = exits.includes(exit) ? exit : (fixes.push('exit'), exits[0]);
  if (idle !== own[0].wline!.hold) fixes.push('idle');
  const recipe = own.filter((r) => r.wline!.enter === e && r.wline!.exit === x).sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level))[0] ?? own[0];
  return { recipe: { ...recipe }, fixes };
}

/** The lines that must stay one shot because neither can be read alone: the composer's own rule, applied before anything else. */
export function setTogetherLines(cues: Cue[]) {
  const out = new Set<string>();
  for (let i = 0; i + 1 < cues.length; i++)
    if (setTogether(cues[i], cues[i + 1]) && spoken(cues[i].text) !== spoken(cues[i + 1].text)) {
      out.add(cues[i].id).add(cues[i + 1].id);
      i += 1;
    }
  return out;
}

/** A sameAs line takes the earlier line's choices; anything else is left as it was said. */
export const resolveSame = (lines: LineChoice[]) => {
  const out = new Map<string, LineChoice>();
  for (const l of lines) {
    const from = l.sameAs ? out.get(l.sameAs) : undefined;
    out.set(l.cue, from ? { ...from, cue: l.cue, sameAs: l.sameAs, joinNext: '', handoff: l.handoff, why: l.why } : l);
  }
  return out;
};

/**
 * The director's lines against the composer's guards, in song order, so a share runs out where it would have. A wrong
 * layout, entrance or hold sends the whole line back to the composer; a wrong exit, decoration, ground or camera only
 * that choice. Every refusal is returned.
 */
export function checkDirection(d: Direction, c: Ctx): { accepted: Map<string, Accepted>; fallbacks: Fallback[] } {
  const { cues, duration } = c.song;
  const n = cues.length;
  const lines = resolveSame(d.lines);
  const beats = new Map<string, LineBeat>(lineBeats(cues, duration).map((b) => [b.id, b]));
  const together = setTogetherLines(cues);
  const accepted = new Map<string, Accepted>();
  const fallbacks: Fallback[] = [];
  const refuse = (cue: string, field: string, said: string, reason: string) => fallbacks.push({ cue, field, said, reason });
  const caps = { carrier: Math.max(2, Math.ceil(n * CARRIER_SHARE)), spatial: Math.max(1, Math.ceil(n * SPATIAL_SHARE)), layout: Math.max(1, Math.ceil(n * LAYOUT_SHARE)), distinct: Math.max(3, Math.ceil(n * DISTINCT_SHARE)), device: Math.max(2, Math.ceil(n * DEVICE_SHARE)), arrival: Math.max(1, Math.ceil(n * ARRIVAL_SHARE)), arrivals: Math.max(2, Math.ceil(n * ARRIVALS_SHARE)), exit: Math.max(1, Math.ceil(n * EXIT_SHARE)), mark: Math.max(1, Math.ceil(n * MARK_SHARE)), pair: Math.max(1, Math.ceil(n * PAIR_SHARE)) };
  const used = new Map<string, number>();
  const bump = (k: string) => used.set(k, (used.get(k) ?? 0) + 1);
  const count = (k: string) => used.get(k) ?? 0;
  let [lastCarrier, lastSpatial, lastArrival, lastHand, lastPair] = [-CARRIER_APART, -CARRIER_APART, -ARRIVAL_APART, -HANDOFF_APART, -PAIR_APART];
  let lastExit = '';
  let lastGround = '';
  const groundCap = Math.max(4, Math.ceil(n * 0.1));
  let skip = 0;
  cues.forEach((cue, i) => {
    const l = lines.get(cue.id);
    if (!l) return void refuse(cue.id, 'line', '', 'the director left this line out');
    const a: Accepted = { hold: l.cut !== 'split', why: l.why, evidence: l.evidence, emphasis: l.emphasis };
    a.method = METHODS.includes(l.method) ? l.method : undefined;
    const beat = beats.get(cue.id);
    const spare = beat?.spare ?? 0;
    const text = spoken(cue.text);
    const level = c.levelOf(cue);
    accepted.set(cue.id, a);
    // lines sung too fast to read apart share a shot the composer lays out: the prompt says so, so this is no refusal
    if (together.has(cue.id)) return;
    if (skip > 0) {
      skip -= 1;
      return;
    }
    // two lines of one thought in one shot: the composer lays them out, the director only says they belong together
    const next = cues[i + 1];
    if (l.joinNext) {
      const near = !!next && spoken(next.text) !== text && next.start - cue.end <= 1.2 && glyphs(text) <= 18 && glyphs(spoken(next.text)) <= 18 && (beats.get(next.id)?.spare ?? 0) >= 0.3 && !together.has(next.id);
      if (!['list', 'reply', 'chat'].includes(l.joinNext) || !near || count('pair') >= caps.pair || i - lastPair < PAIR_APART || (c.calm && l.joinNext === 'chat')) refuse(cue.id, 'joinNext', l.joinNext, 'not near enough, or pairs past their share');
      else {
        a.join = l.joinNext as PairKind;
        bump('pair');
        lastPair = i;
        accepted.set(next.id, { hold: true, why: lines.get(next.id)?.why ?? l.why, evidence: '', emphasis: lines.get(next.id)?.emphasis });
        skip = 1;
        return;
      }
    }
    const W = c.world;
    const ws = W ? worldStackOf(l.layout, l.enter, l.exit, l.idle, level, W) : undefined;
    const r = ws?.recipe ?? stackOf(l.layout, l.enter, l.idle, level, c.calm);
    const whole = (reason: string) => refuse(cue.id, 'layout', `${l.layout}/${l.enter}/${l.idle}`, reason);
    if (!r) return void whole('the kit has no such stack');
    const count_ = glyphs(cue.text);
    if (count_ < (r.min ?? 0) || count_ > (r.max ?? Infinity)) return void whole(`${count_} characters is outside this layout's ${r.min ?? 0}–${r.max ?? '∞'}`);
    // a world's own set: the set is the choice; what it refuses is a column with Latin, a loud set on a calm song, a split
    if (ws) {
      if (r.fit && !r.fit.test(cue.text)) return void whole('a column set takes Han and kana only');
      if (c.calm && r.wline?.loud) return void whole('a loud set on a song felt rather than shouted');
      if (l.cut === 'split') refuse(cue.id, 'cut', l.cut, 'a world set holds the line whole');
      a.hold = true;
      for (const f of ws.fixes) refuse(cue.id, f, l[f as 'enter' | 'exit' | 'idle'], `not one of ${l.layout}'s moves: its own taken`);
    } else if (W) {
      // a shared stack: only the ones this world lets in, up to their share of the lines (the composer's own rule)
      if (!W.recipes.some((x) => x.id === r.id)) return void whole(`not in ${W.id}'s pool`);
      if (count('shared') >= Math.floor(i * SHARED_SHARE + 1)) return void whole('shared stacks past their share of this world');
    }
    if (!ws) {
      if (SHAPED[r.template] && !SHAPED[r.template](cue.text)) return void whole('the line does not have the shape this layout needs');
      if (spare < (r.spare ?? 0)) return void whole(`needs ${r.spare}s beyond reading, the line has ${spare.toFixed(2)}s`);
      if (SPLIT_LAYOUTS.has(r.template) !== (l.cut === 'split')) return void whole(`cut says ${l.cut}, layout says otherwise`);
      if (c.calm && (!fitsCalm(r) || LOUD_ENTERS.has(r.enter) || LOUD_IDLES.has(r.idle))) return void whole('too loud for a song felt rather than shouted');
      if (beat?.payoff && !['still', 'drift', 'float', 'tether-settle', 'balance-rest', 'side-light', 'ink-state', 'reflection-rest', 'frame-lights'].includes(r.idle)) return void whole('a payoff line stays up long and still');
      // a device the words do not name needs the director to quote what gives it its reason
      if (r.fit && !r.fit.test(cue.text) && !(l.evidence && (cue.text.includes(l.evidence) || c.partWhat(cue.id).includes(l.evidence)))) return void whole('a device with no quoted evidence from the line or its part');
      if (r.fit && (count('distinct') >= caps.distinct || count(r.id) >= caps.device)) return void whole('this song has spent its distinctive devices');
    }
    if (W && !ws) bump('shared');
    if (CARRIERS.has(r.template) && (count('carrier') >= caps.carrier || i - lastCarrier < CARRIER_APART)) return void whole('papers past their share, or two too close');
    if (SPATIAL.has(r.template) && (count('spatial') >= caps.spatial || count(r.template) >= caps.layout || i - lastSpatial < CARRIER_APART)) return void whole('spatial layouts past their share, or two too close');
    if (isArrival(r.enter) && (count('arrival') >= caps.arrivals || count(r.enter) >= caps.arrival || i - lastArrival < ARRIVAL_APART)) return void whole('whole-line entrances past their share, or two too close');
    if (r.fit && !ws) {
      bump('distinct');
      bump(r.id);
    }
    if (CARRIERS.has(r.template)) {
      bump('carrier');
      lastCarrier = i;
    }
    if (SPATIAL.has(r.template)) {
      bump('spatial');
      bump(r.template);
      lastSpatial = i;
    }
    if (isArrival(r.enter)) {
      bump('arrival');
      bump(r.enter);
      lastArrival = i;
    }
    a.recipe = { ...r, id: `line-${cue.id}`, sides: r.sides.includes(l.side) ? [l.side] : r.sides, level: r.level };
    if (r.template === 'build-cut' && l.pieces?.length) {
      // (a piece too short to hold folds into the next as the line lands: timedPieces)
      const rows = rowsOf(cue.text, l.pieces);
      if (rows) a.rows = rows;
      else refuse(cue.id, 'pieces', l.pieces.join('|'), 'pieces are not the line, or cut a word');
    }
    // the way out (a world set's is in its recipe, checked above)
    const exitOk = (() => {
      if (ws) return false;
      // a world without paper devices draws no line exits on its shared stacks
      if (W && !W.devices && !PLAIN_EXITS.includes(l.exit)) return false;
      // a surface held by pieces of its own is cut away from them by a drawn exit
      if (KEEPS_EXIT(r) && !QUIET_EXITS.has(l.exit)) return false;
      if (l.exit in OWN_LAYOUT_EXIT) return OWN_LAYOUT_EXIT[l.exit] === r.template && r.exit === l.exit;
      if (l.enter === 'fold-open' || l.enter === 'tether-drop') return l.exit === r.exit;
      if (PLAIN_EXITS.includes(l.exit)) return !(c.calm && LOUD_EXITS.has(l.exit));
      if (!isLineExit(l.exit)) return false;
      const kind = l.exit as LineExitKind;
      const fits = EXIT_PAPER.has(r.template) ? PAPER_EXITS.has(kind) && !(r.template === 'memory-card' && kind === 'tile-scatter') : kind !== 'tile-scatter' && EXIT_LAYOUT.has(r.template);
      return fits && !(c.calm && NOT_CALM_EXIT.has(kind)) && count(`exit:${kind}`) < caps.exit && kind !== lastExit && spare >= LINE_EXIT_SEC[kind];
    })();
    if (exitOk) {
      a.exit = l.exit;
      if (isLineExit(l.exit)) {
        bump(`exit:${l.exit}`);
        lastExit = l.exit;
      }
    } else if (!ws) refuse(cue.id, 'exit', l.exit, 'does not fit this layout, its seconds or its share');
    // the handoff from the line before
    if (l.handoff) {
      const ok = (!W || W.handoffs) && HANDOFF_KINDS.includes(l.handoff as HandoffKind) && l.handoff !== 'palette' && i > 0 && i - lastHand >= HANDOFF_APART && count('hand') < caps.device && !isArrival(r.enter) && !FIXED_LAYOUT.has(r.template) && !FIXED_LAYOUT.has(accepted.get(cues[i - 1].id)?.recipe?.template ?? '');
      if (ok) {
        a.hand = l.handoff as HandoffKind;
        bump('hand');
        lastHand = i;
      } else refuse(cue.id, 'handoff', l.handoff, 'too close to the last, past its share, or a layout that cannot be carried');
    }
    // the decoration
    const tail = heldTail(text, cue.end, cue.charStarts, cue.charTimed);
    const plain = TRACKED.has(r.template) && !r.state;
    const partKey = c.partWhat(cue.id);
    const decorOk = (() => {
      if (!l.decor || l.decor === 'none') return true;
      if (!DECORS.includes(l.decor)) return false;
      // a world without paper devices draws none of the small marks; the director's own words it still sets
      if (W && !W.devices && l.decor !== 'fine-note') return false;
      if (l.decor === 'fine-rule' || l.decor === 'fine-title' || l.decor === 'fine-key') return charsPerSec(cue) <= 9;
      if (l.decor === 'fine-note') {
        const why = noteRefusal(l.noteKind, l.note ?? '', cue.text, cues.slice(0, i).map((x) => x.text), (c.song.singers ?? []).map((x) => x.name), songScript(cues.map((x) => x.text)));
        if (why) {
          refuse(cue.id, 'note', `${l.noteKind}:${l.note}`, why);
          return false;
        }
        return charsPerSec(cue) <= 9 && count(`note:${partKey}`) < NOTE_PER_PART;
      }
      if (l.decor === 'oval') return glyphs(cue.text) <= RING_MAX && plain && count(`oval:${partKey}`) === 0;
      if (l.decor === 'icon') return SYMBOLS.includes(d.icon as SymbolName) && plain && count('icon') < 3;
      if (l.decor === 'breath') return tail >= BREATH_MIN && plain && count('mark') < caps.mark;
      if (l.decor === 'relay') return !r.fit && spare >= 0.3 && count('relay') < caps.mark;
      return false;
    })();
    if (decorOk) {
      if (l.decor && l.decor !== 'none') a.decor = l.decor;
      if (l.decor === 'oval') bump(`oval:${partKey}`);
      if (l.decor === 'icon') bump('icon');
      if (l.decor === 'breath') bump('mark');
      if (l.decor === 'relay') bump('relay');
      if (l.decor === 'fine-note') {
        bump(`note:${partKey}`);
        a.note = l.note.trim();
      }
    } else refuse(cue.id, 'decor', l.decor, 'its condition does not hold on this line');
    // the line's own camera (a world set carries its own motion: none on top)
    if (l.lineCam) {
      if (!ws && (l.lineCam === 'lean' ? !isArrival(r.enter) : LINE_CAMS.includes(l.lineCam) && !(c.calm && l.lineCam !== 'phrase-track'))) a.lineCam = l.lineCam;
      else refuse(cue.id, 'lineCam', l.lineCam, 'not on this line');
    }
    if (l.hit) {
      if (['zoom', 'tile'].includes(l.hit) && (!W || W.pace.hits.includes(l.hit as 'zoom' | 'tile')) && !c.calm && level === 2 && !isArrival(r.enter) && (l.hit !== 'tile' || count('tile') < 3)) {
        a.hit = l.hit;
        if (l.hit === 'tile') bump('tile');
      } else refuse(cue.id, 'hit', l.hit, 'hits belong to the loud parts of a loud song');
    }
    // what the line stands on: in a world, only its grounds, and never under a set that stands on its own
    if (l.ground && W) {
      // (a world's pool is small by design: a ground has no share of the song here, only the line before to differ from)
      const on = c.calm ? W.quiet : W.grounds[Math.min(2, level) as 0 | 1 | 2];
      const ok = !r.wline?.ground && on.includes(l.ground) && l.ground !== lastGround;
      if (ok) {
        a.ground = l.ground;
        bump(`ground:${l.ground}`);
        lastGround = l.ground;
      } else refuse(cue.id, 'ground', l.ground, `not one of ${W.id}'s grounds at this level, the same as the line before, or under a set with its own`);
    } else if (l.ground) {
      const own = CARRIERS.has(r.template) || SPATIAL.has(r.template) || r.template === 'contrast-split';
      const on = own ? QUIET_BACKGROUNDS[c.calm ? 0 : (Math.min(2, level) as 0 | 1 | 2)] : [...BACKGROUNDS[0], ...BACKGROUNDS[1], ...BACKGROUNDS[2], ...c.screenGrounds];
      const device = DEVICE_GROUNDS.includes(l.ground) && !own && count(l.ground) < 2 && (l.ground !== 'fold-mark' || SYMBOLS.includes(d.icon as SymbolName));
      const ok = !EXCLUDED_FX.has(l.ground) && (device || on.includes(l.ground)) && !(c.calm && LOUD_GROUNDS.has(l.ground)) && count(`ground:${l.ground}`) < groundCap && l.ground !== lastGround;
      if (ok) {
        a.ground = l.ground;
        bump(`ground:${l.ground}`);
        if (device) bump(l.ground);
        lastGround = l.ground;
      } else refuse(cue.id, 'ground', l.ground, 'not in this line\'s set, past its share, or the same as the line before');
    }
  });
  return { accepted, fallbacks };
}

/** What the composer needs told: the director's parts as tension, its emphasis as keys, only lines it may lead with. */
export function meaningFrom(d: Direction | undefined, song: SongIn, paidParts: { cue: string; what: string; energy: number }[], calm = false): Meaning {
  const parts: SongPart[] = paidParts.map((p, i) => ({ from: p.cue, tension: Math.min(1, Math.max(0, d?.parts?.[i]?.tension ?? p.energy)), fx: [], what: p.what }));
  const seen = new Set<string>();
  const uniq = parts.filter((p) => !seen.has(p.from) && seen.add(p.from));
  // a paid plan with no parts: the song's own sections, as the composer reads them with no reading at all
  if (!uniq.length) uniq.push(...fallbackParts(song.cues, song.sections ?? [], calm).map((p) => ({ ...p, fx: [] })));
  uniq[0].from = song.cues[0].id;
  const keys = (d?.lines ?? []).filter((l) => l.emphasis && song.cues.find((c) => c.id === l.cue)?.text.includes(l.emphasis)).map((l) => ({ cue: l.cue, phrase: l.emphasis }));
  return { palette: 'tea', ground: 'grain', reading: d?.reading ?? '', parts: uniq, keys };
}

interface PaidShot { shot: string; backdrop?: string; cuts: { beat: number; fx: string; [k: string]: unknown }[] }
export interface PaidPlan { vision?: unknown; parts?: { from: string; [k: string]: unknown }[]; format?: unknown; devices?: unknown; flowRule?: string; styles?: unknown; finish?: string; print?: string; backbone?: string; thread?: unknown; shots: PaidShot[] }

/** The paid plan's cuts on the clock: the world and the unsung stretches keep what the paid director chose. */
export function paidClock(paid: PaidPlan, shots: { id: string; start: number; end: number }[], beats: number[]) {
  const at = new Map(shots.map((s) => [s.id, s]));
  return paid.shots.flatMap((ps) => {
    const s = at.get(ps.shot);
    if (!s) return [];
    const sorted = [...ps.cuts].sort((a, b) => a.beat - b.beat);
    const times = cutTimes(beats, s, sorted);
    return sorted.map((c, i) => ({ cut: c, at: times[i], shot: ps.shot, backdrop: ps.backdrop ?? '' }));
  }).sort((a, b) => a.at - b.at);
}

/** The paid cuts that fall in an unsung stretch, on its own beats; a move this path refuses gives way to a quiet one. */
export function unsungCuts(clock: ReturnType<typeof paidClock>, s: { start: number; end: number }, beats: number[]) {
  const inside = clock.filter((x) => x.at >= s.start && x.at < s.end);
  const before = clock.filter((x) => x.at < s.start).at(-1);
  const chosen = inside.length && inside[0].at - s.start < 0.1 ? inside : before ? [{ ...before, at: s.start }, ...inside] : inside;
  const bs = beats.filter((b) => b >= s.start && b < s.end);
  const seen = new Set<number>();
  return chosen.flatMap(({ cut, at }, i) => {
    const beat = i === 0 ? 0 : bs.findIndex((b) => b >= at - 0.03);
    if (beat < 0 || seen.has(beat)) return [];
    seen.add(beat);
    const { label: _label, sprite: _sprite, ...rest } = cut;
    return [{ ...rest, beat, sprite: '', label: '', fx: EXCLUDED_FX.has(cut.fx) ? 'motes' : cut.fx, words: EXCLUDED_FX.has(cut.fx) ? [] : (cut['words'] as string[] | undefined) ?? [] }];
  });
}

/** A mist the director left without a colour throws in the renderer and is lost: it takes the song's paper. */
function mistInked(base: Record<string, any>) {
  const paper = base['design'].colorScript?.[0]?.highlight ?? '#F5EFE4';
  return base['graphics'].sections.map((s: { layers: { kind: string; color?: string }[] }) => ({ ...s, layers: s.layers.map((l) => (l.kind === 'mist' && !l.color ? { ...l, color: paper } : l)) }));
}

/** Flying strokes never; a drop's keyword flash lands a huge copy over a line being read (チョロイン ドドドド！ over the line before): the director's `hit` is the choice instead. */
const DROPPED_TECHNIQUES = new Set(['pieces', 'flash']);

/** The treatment the plan is laid on: the paid design whole, on the plan's shots. */
export function directorBase(base: Record<string, any>, plan: { shots: { shot: string; lines: unknown[] }[] }, shots: { id: string; start: number; end: number }[]) {
  const proto = base['shots'][0];
  return {
    ...base,
    design: { ...base['design'], composer: true, lineDirect: true, techniques: (base['design'].techniques ?? []).filter((x: string) => !DROPPED_TECHNIQUES.has(x)) },
    graphics: { ...base['graphics'], sections: mistInked(base) },
    shots: shots.map((s) => ({ ...proto, ...s, cue: undefined, template: 'stair', params: { side: 'left', dim: 0 }, asset: undefined })),
    cues: plan.shots.flatMap((sh) => (sh.lines as { cue: string }[]).map((l) => ({ cueId: l.cue, shot: sh.shot, emphasis: [], enter: 'fade', exit: 'fade', reveal: 'line' }))),
  };
}

/** The director's word as it is set: a comma stays out of it, the marks that end the line stay on it. */
export function keyFor(text: string, said: string | undefined) {
  const key = keyOf(text, said?.replace(/[、，,\s]+$/u, ''));
  const after = text.slice(text.indexOf(key) + key.length);
  const marks = /^[!！?？︕︖]+\s*$/.test(after) ? after.trim() : '';
  return key + marks;
}

interface PlanLine { cue: string; [k: string]: unknown }
interface PlanCut { fx: string; [k: string]: unknown }

/**
 * The composer's plan under the director's force, then each accepted choice written over it and the paid design laid
 * back: world, parts, pace, finish. A line the director lost keeps exactly what the composer gave it.
 */
export function directedPlan(song: SongIn, d: Direction | undefined, c: Ctx, paid: PaidPlan, paidShots: { id: string; start: number; end: number }[], paidParts: { cue: string; what: string; energy: number }[], feltBeats: number[], rejected = new Set<string>(), pw?: PlanWorld) {
  // on a world (paid-world.mts) the composer draws from its closed pool; the paid design keeps only the concept and parts
  const W = c.world;
  const checked = d ? checkDirection(d, c) : { accepted: new Map<string, Accepted>(), fallbacks: [] as Fallback[] };
  const { accepted, fallbacks } = checked;
  for (const id of rejected) if (accepted.delete(id)) fallbacks.push({ cue: id, field: 'line', said: '', reason: 'the render fell short on this line (size floor or reading): composer choice' });
  const custom = new Map<string, Recipe>();
  const holds = new Set<string>();
  const hands = new Map<string, HandoffKind>();
  const pairs = new Map<string, PairKind>();
  const rigs = new Map<string, 'phrase-track' | 'arc' | 'ground'>();
  for (const [id, a] of accepted) {
    if (a.recipe) custom.set(id, a.recipe);
    if (a.hold && a.recipe) holds.add(id);
    if (a.hand) hands.set(id, a.hand);
    if (a.join) pairs.set(id, a.join);
    if (a.lineCam && a.lineCam !== 'lean') rigs.set(id, a.lineCam as 'phrase-track' | 'arc' | 'ground');
  }
  const meaning = meaningFrom(d, song, paidParts, c.calm);
  const { plan, shots } = composePlan(song, meaning, c.calm, { director: true, custom, holds, hands, pairs, rigs, world: W });
  // a pair the composer's own rules would not make (a handoff beside it, say) is both lines' fallback
  const hasPair = (id: string) => plan.shots.some((p) => (p.lines as { cue: string }[]).length > 1 && (p.lines as { cue: string }[]).some((l) => l.cue === id));
  for (const [id, a] of accepted) if (a.join && !hasPair(id)) fallbacks.push({ cue: id, field: 'joinNext', said: a.join, reason: 'the composer would not set these two together' });
  const clock = paidClock(paid, paidShots, feltBeats);
  const backAt = (t: number) => clock.filter((x) => x.at <= t + 0.02).at(-1)?.backdrop ?? '';
  const fineTitle = splitSongTitle(song.title).title;
  const planned = plan.shots as unknown as { shot: string; level?: number; lyric: { template: string; side: string; params?: Record<string, unknown> }; lines: PlanLine[]; cuts: PlanCut[]; backdrop?: string }[];
  // every sung line's decision travels with the plan: the reasons are what is sold
  const decisions: Record<string, unknown>[] = [];
  const lastUsed = { ground: '' };
  const directed = new Set<PlanCut>();
  for (const ps of planned) {
    const s = shots.find((x) => x.id === ps.shot)!;
    // a world has its own grounds: no backdrop of the old design, no paid cut in the unsung stretches
    ps.backdrop = W ? '' : backAt(s.start + 0.02);
    // a dark cut swaps the paper it paints; laid on a backdrop it paints none, and the line would take the light ink on
    // a light picture (pink on 雙截棍's yellow). Only a lit edge needs the dark, and it brings its own
    if (ps.backdrop && !ps.lines.some((l) => l['inkState'] === 'edge')) for (const x of ps.cuts) x['dark'] = false;
    if (!ps.lines.length) {
      const own = W ? [] : unsungCuts(clock, s, feltBeats);
      if (own.length) ps.cuts = own as unknown as PlanCut[];
      continue;
    }
    for (const l of ps.lines) {
      const cue = song.cues.find((x) => x.id === l.cue)!;
      const a = accepted.get(l.cue);
      const said = d ? resolveSame(d.lines).get(l.cue) : undefined;
      if (a?.emphasis) l['emphasis'] = keyFor(cue.text, a.emphasis);
      if (a?.recipe) {
        const r = a.recipe;
        l['method'] = r.mark ?? a.method ?? l['method'];
        if (l['idle'] === 'breath-rule') l['idle'] = r.idle;
        l['trail'] = false;
        if (a.exit) l['exit'] = a.exit;
        for (const k of ['hit', 'breath', 'oval', 'relay', 'icon'] as const) delete l[k];
        if (a.rows) l['rows'] = a.rows;
        if (a.hit) l['hit'] = a.hit;
        const key = keyFor(cue.text, a.emphasis);
        const fine: FineTier | undefined = a.decor === 'fine-title' && fineTitle ? { kind: 'title', text: fineTitle } : a.decor === 'fine-key' ? { kind: 'key', text: key } : a.decor === 'fine-rule' ? { kind: 'rule', text: '' } : a.decor === 'fine-note' && a.note ? { kind: 'note', text: a.note } : (l['fine'] as FineTier | undefined)?.kind === 'section' ? (l['fine'] as FineTier) : undefined;
        if (fine) l['fine'] = fine;
        else delete l['fine'];
        if (a.decor === 'oval') Object.assign(l, { oval: true, method: 'color' });
        if (a.decor === 'relay') Object.assign(l, { relay: true, method: 'color' });
        if (a.decor === 'icon') l['icon'] = d!.icon;
        if (a.decor === 'breath') Object.assign(l, { breath: +heldTail(spoken(cue.text), cue.end, cue.charStarts, cue.charTimed).toFixed(2), idle: 'breath-rule', method: 'color' });
        if (a.lineCam === 'lean') l['textCam'] = { kind: 'lean-settle', dir: 1, amount: leanAngle(glyphs(cue.text)) / 0.03 };
        if (a.ground && ps.cuts[0]) {
          ps.cuts[0].fx = a.ground;
          directed.add(ps.cuts[0]);
          if (a.ground === 'fold-mark') ps.cuts[0]['mark'] = d!.icon;
          if (DEVICE_GROUNDS.includes(a.ground)) ps.cuts.splice(1);
        }
        lastUsed.ground = ps.cuts.at(-1)?.fx ?? '';
      }
      const lost = fallbacks.filter((f) => f.cue === l.cue);
      // a line the composer laid out keeps what the director said only as what it asked for: the reasons do not describe it
      const own = !!a?.recipe;
      decisions.push({ cue: l.cue, text: cue.text, by: own ? 'director' : 'composer', cut: (!W && ps.cuts.length > 1) || SPLIT_LAYOUTS.has(ps.lyric.template) ? 'split' : 'hold', layout: ps.lyric.template, ...((l['world'] as { set?: string } | undefined)?.set ? { set: (l['world'] as { set: string }).set } : {}), enter: l['enter'], idle: l['idle'], exit: l['exit'], decor: a?.decor ?? '', ground: ps.cuts[0]?.fx, cuts: ps.cuts.length, ...(a?.rows ? { rows: a.rows } : {}), why: own ? said?.why : undefined, asked: own ? undefined : said && { layout: said.layout, enter: said.enter, idle: said.idle, why: said.why }, evidence: said?.evidence, fallback: lost.map((f) => `${f.field}: ${f.reason}`) });
      l['direct'] = { why: own ? said?.why : undefined, fallback: lost.length ? lost.map((f) => f.field) : undefined };
    }
  }
  // a director's ground the composer's cut just before already stands on: the composer's cut gives way (the treatment
  // breaks any run left: free-plan unrepeatGround)
  if (W && pw) {
    const w = worldById(pw.id)!;
    const cuts = planned.flatMap((ps) => ps.cuts);
    cuts.forEach((x, i) => {
      const prev = cuts[i - 1];
      if (!prev || !directed.has(x) || directed.has(prev) || prev.fx !== x.fx) return;
      const before = cuts[i - 2]?.fx ?? '';
      const swap = [0, 1, 2, 3].map((k) => unrepeatGround(w, prev.fx, prev.fx, c.calm, i + k)).find((g) => g !== before && g !== x.fx);
      if (swap) prev.fx = swap;
    });
  }
  const tuned = (d?.tune ?? []).filter((t) => TUNABLE.includes(t.key) && Number.isFinite(t.value) && KNOBS[t.key]);
  for (const t of tuned) {
    const fx = t.key.split('.')[0];
    for (const ps of planned) for (const x of ps.cuts) if (x.fx === fx) x['tune'] = { ...(x['tune'] as object | undefined), [t.key]: t.value };
  }
  for (const t of d?.tune ?? []) if (!tuned.includes(t)) fallbacks.push({ cue: t.cue, field: 'tune', said: `${t.key}=${t.value}`, reason: 'no such count on offer' });
  const fromOf = (id: string) => {
    const old = paidShots.find((x) => x.id === id);
    return old ? [...shots].filter((x) => x.start <= old.start + 0.02).at(-1)?.id ?? shots[0].id : shots[0].id;
  };
  const parts = (paid.parts ?? []).map((p) => ({ ...p, from: fromOf(p.from) }));
  const plain = parts.filter((p, i) => parts.findLastIndex((x) => x.from === p.from) === i);
  return {
    shots,
    decisions,
    fallbacks,
    plan: {
      ...plan,
      vision: paid.vision ?? plan.vision,
      parts: plain,
      backbone: paid.backbone ?? plan.backbone,
      thread: paid.thread ?? plan.thread,
      // a world's pace, finish and print are its own (the free tier's): the old design's only off a world
      format: W ? plan.format : paid.format ?? plan.format,
      devices: W ? plan.devices : paid.devices ?? plan.devices,
      flowRule: W ? plan.flowRule : paid.flowRule ?? plan.flowRule,
      styles: W ? plan.styles : paid.styles ?? plan.styles,
      finish: W ? '' : paid.finish ?? '',
      print: W ? plan.print : paid.print ?? plan.print,
      ...(pw ? { world: pw } : {}),
      // the corner's chapter-and-line counter reads as an instrument readout over a line: the small tier takes its place
      document: false,
      fresh: (d?.techniques ?? []).map((t) => ({ technique: t.id, cue: t.where, why: t.why })),
      direction: d ? { reading: d.reading, icon: d.icon, techniques: d.techniques, parts: d.parts, tune: tuned } : undefined,
    },
  };
}

const CONDITIONS: [string, string, string][] = [
  ['lyric-carrier + frame-run + frame-lights', '句子上燈牌紙，燈跑一圈', '歡迎、舞台、慶祝、登場。不是每次副歌都要'],
  ['stack 或 punch + scale-steps + still', '字一階一階長到定位', '一路堆到宣告、決心。平鋪直敘不要'],
  ['balance-line + balance-seat + balance-rest', '兩個詞組掛在同一根弧片上，先失衡再落定（B49）', '權衡、付出、誰比較重要；句子要能分成兩半。'],
  ['dot-display + display-feed + still（出場 display-off）', '暖白點陣帶送字，閱讀時停住，再整帶熄掉（B50）', '城市、夜行、車站、廣播、傳達訊息。'],
  ['punch + snapin + side-light', '字變厚重版塊，側光', '站穩、不屈、硬底子、壓力。'],
  ['punch + edge-light + ink-state', '黑暗裡只亮字緣（這一句背景會反成深色）', '黑夜中的微光、星、燈。只留給真的在講光的句子'],
  ['punch + fade 或 rise + reflection-rest', '字下有水面倒影', '水、鏡、倒影、照見自己。'],
  ['stack + band-in + still', '寬帶切入', '決斷、轉身、不再。'],
  ['stair 或 stack + matrix-light + ink-state', '點陣逐列點亮', '電子、機器、訊號。'],
  ['contrast-split + cut + still', '雙色交界穿過字', '兩邊、對照、彼此、明暗。'],
  ['lyric-carrier + tether-drop + tether-settle', '吊牌掉下來晃著', '等待、牽掛、放不下。'],
  ['paper-feed + paper-feed + still', '紙條送出來', '寫下、信、日記、說故事。'],
  ['lyric-carrier + fold-open + still（出場 fold-close）', '摺紙打開又闔上', '打開、祕密、往事。'],
  ['memory-card + card-develop 或 card-land + still', '相紙顯影或落桌', '回憶、照片、那一天。'],
  ['index-pull + index-lift + still', '一排紙條抽出一張', '眾多之中挑出一個、點名那一天。'],
  ['lyric-band + band-stick + still', '貼上一條橫帶', '號召、一起喊、宣布。'],
  ['phrase-panels + panel-flip + still', '短語逐塊翻出', '逐項列舉；句子本身要有空格或頓號分段。'],
  ['punch + soft-float + still', '軟字浮起', '甜、輕、喜歡、期待。'],
  ['editorial + fade/wipe/snapin + still', '左主句右補述的版面', '句子有歌手自己的斷句，一邊主張一邊補充。'],
  ['corner-anchor + fade/wipe/snapin + still', '一句轉九十度', '相遇、轉彎、後半句推翻前半句。'],
  ['cross-anchor + fade/wipe/snapin + still', '兩段共用一個字交叉', '句子兩段真的有同一個字。'],
  ['note-panel + cut + still', '便條', '獨白、說不出口、沒寄出的話。'],
  ['phrase-grid + cell-land + still', '字落進格子', '寫字、學習、回到第一頁。'],
  ['panel-route + cut + still', '鏡頭一格格追（split）', '追逐、一路、接二連三，且有三段以上短語。'],
  ['stair + curve-arrive + still', '字沿弧線抵達', '風、水、繞行、靠近。'],
  ['punch + panel-open + still', '門板打開露出字', '開始、開門、登場。'],
  ['stair 或 stack + phrase-mark + still', '排比短語依序被標記', '等長排比。'],
  ['stack + wave-reveal + still', '水位升起露字', '湧上來、眼淚、醒來。'],
  ['punch 或 lyric-carrier + corner-land + still', '從角落丟進來', '突然、一句丟出來。'],
  ['stack 或 punch + outline-seat + still', '外框合上定位', '確定、終於、就是這樣。'],
  ['stair 或 punch + slat-face + still', '百葉翻面', '看清、領悟、才知道。'],
  ['stack + grain-resolve + still', '顆粒聚成字', '看不清到看清、訊息傳來。'],
  ['turn-box + box-turn + still（出場 box-turn）', '扁盒轉面（B43）', '另一面、換個角度、對答。'],
  ['frame-feed + frame-advance + still（出場 frame-advance）', '接觸印樣送格（B44）', '記憶、旅途、時間推移。'],
  ['lightbox-entry + frame-dive + still', '鏡頭推進光箱（B46）', '遠方的訊息、失聯後重逢。'],
];
const LINE_EXIT_HELP: Record<string, string> = { 'band-out': '整帶抽走（決斷、切斷）', 'slat-close': '百葉收攏（壓抑、藏起）', 'line-fold': '壓成一筆線（結束、句點）', 'tile-scatter': '紙片切開散掉（解散、再見；只給紙面）', 'echo-travel': '單色回聲滑走', 'radial-leave': '從一點推開（爆發）', 'glyph-shed': '字掉碎屑（崩塌、失去）', 'wave-dissolve': '波紋蒸散（B40：消逝、疲憊、夢）', 'pore-out': '從毛孔褪去（時間磨損）', 'focus-out': '失焦（忘記、遠去）', 'rail-leave': '沿軌道離開（出發、離站）', 'gravity-pass': '整句往下掉（墜落）', 'node-fold': '收成一個節點（未完待續）' };

/** The director's call: everything it may choose, with the conditions, then the song. */
export function directorPrompt(song: SongIn, c: Ctx, facts: { language: string; languageWhat: string; concept: string; backbone: string; change: string; palette: string; parts: { id: string; cue: string; start: number; what: string; energy: number }[]; lessons: string; props?: boolean; moments?: { overused: string[] }; world?: { w: StyleWorld; pool: WorldPool } }) {
  const beats = new Map(lineBeats(song.cues, song.duration).map((b) => [b.id, b]));
  const together = setTogetherLines(song.cues);
  const n = song.cues.length;
  const seen = new Map<string, string>();
  const rows = song.cues.map((x) => {
    const b = beats.get(x.id);
    const sec = song.sections?.find((y) => x.start >= y.start && x.start < y.end);
    const again = seen.get(spoken(x.text));
    if (!again) seen.set(spoken(x.text), x.id);
    const pieces = wordPieces(x.text);
    return `${x.id} ${x.start.toFixed(1)}–${x.end.toFixed(1)}s ${glyphs(x.text)}字 餘${(b?.spare ?? 0).toFixed(1)}s ${sec?.type ?? ''}${(sec?.energy ?? 0).toFixed(2)}${b?.quick ? ' 快' : ''}${b?.payoff ? ' 落點' : ''}${together.has(x.id) ? ' 併句' : ''}${again ? ` 同${again}` : ''}｜${x.text}${pieces.length > 1 ? `｜可斷：${pieces.join('/')}` : ''}`;
  });
  const grounds = [...new Set([...BACKGROUNDS[0], ...BACKGROUNDS[1], ...(c.calm ? [] : BACKGROUNDS[2])])].map((g) => `${g}（${GROUND_HELP[g] ?? g}）`).join('、');
  const moves = c.screenGrounds.filter((g) => !(c.calm && LOUD_GROUNDS.has(g))).join('、');
  return `你是這首歌的歌詞 MV 導演。這一版是付費的「文字動態版」：字是畫面的主體。規則編排器也能替每句配滿招式，你比它強的地方不是招式更多，而是你讀懂了整首歌：知道哪句是重點、哪裡該停、哪裡該拆、哪個手法真的有理由。

先讀完整首，再決定每一句。沒有理由的句子就用最素的：一句好好排、好好停住，比塞滿招式更貴。招式清單是選項，不是待辦；每一項都有適用條件，不符合就不要用。

這首歌已經定案的設計（照著走，不要改）：
- ${facts.world ? `風格世界：${facts.world.w.name}（${facts.world.w.id}）` : `語言：${facts.language}（${facts.languageWhat}）`}
- 配色：${facts.palette}
- 概念：${facts.concept}
- 骨幹：${facts.backbone}
- 畫面的走向：${facts.change}
段落（世界已定，你只判斷每段的張力 tension 0–1：照歌詞的情緒，不是音量）：
${facts.parts.map((p) => `- ${p.id}（從 ${p.cue}，${p.start.toFixed(1)}s，能量 ${p.energy.toFixed(2)}）：${p.what}`).join('\n')}

【拆或停】
每一句都要判斷 cut：
- hold：整句一次出現，一個背景撐到底。適合重點句、情緒落點、唱得慢的句子、需要讀完才懂的句子、一句話就是一個意思。標「落點」的句子是快句群之後的停頓，幾乎一定 hold。
- split：這句有內部節奏，每一段自己有重量（口令、排比、一詞一拍、問答、一路堆疊）。layout 用 build-cut（段落依演唱順序落下，唱完整句成一張構圖，這是主要的拆法）或 beat-cut（每段單獨滿版，唱完整句回來，要有空檔）。pieces 寫在哪裡斷：照順序、不含空格、合起來就是整句，2 到 4 段，每段至少兩個字且要有獨立意思，不可切開一個詞。沒把握就空陣列讓程式斷。
- 不要整段都拆或整段都停。拆和停的對比本身就是節奏：一串拆之後的停住才有重量。不是每句都要拆，慢歌大部分應該停住；why.cut 要說這句為什麼拆或停。

【主從】
字是畫面的主體，不是字幕。每一句都要有大小主從：hold 的句子優先用 punch（重點詞放到滿版，其他字小），emphasis 就是那個大字，所以要選得準、不可太長（2 到 8 字）；只有兩段真的等重才用 stack 或 couplet。連續三句都是中等大小的 stack 就是失敗，即使是快歌、長句也一樣：快歌的長句更要抓一個詞放大，其他字退成小字。

${facts.world ? worldKitPrompt(facts.world.w, facts.world.pool, c.calm, n) : `【版面與手法】layout、enter、idle 要是下面其中一組，或「素版」。
素版：layout 選 ${[...OPEN_TEMPLATES].join('、')}；enter 選 ${[...OPEN_ENTERS].map((e) => `${e}（${ENTER_HELP[e] ?? e}）`).join('、')}；idle 選 ${[...OPEN_IDLES].map((e) => `${e}（${IDLE_HELP[e] ?? e}）`).join('、')}。素版不需要理由以外的條件，也是大部分句子該用的。build-cut、beat-cut 自己決定每段怎麼落下：enter 一律填 cut、idle 填 still。
有條件的手法（格式：layout + enter + idle｜畫面｜適用條件）：
${CONDITIONS.map(([k, v, w]) => `- ${k}｜${v}｜${w}`).join('\n')}
- 字數限制（超過會退回規則版）：lyric-carrier 14 字內、dot-display 10 字內、balance-line 18 字內、punch 的特殊進場（edge-light、soft-float、outline-seat）12–14 字內。括號裡的應援（例如「(かい!)」）算在字數內但不算 pieces 的一段，pieces 不要寫它。
- 用有條件的手法時 evidence 必須填這句歌詞或段落說明裡原樣出現的幾個字，作為它成立的根據；比喻也算，但要真的是這個意思。
- 份量上限（程式會擋，超過的句子退回規則版）：這首 ${n} 句，紙面類 ${Math.max(2, Math.ceil(n * CARRIER_SHARE))} 句且至少隔 ${CARRIER_APART} 句；空間版面（editorial、corner、cross、grid、balance、route）${Math.max(1, Math.ceil(n * SPATIAL_SHARE))} 句，每種 ${Math.max(1, Math.ceil(n * LAYOUT_SHARE))} 句；整句進場類（curve-arrive、panel-open、phrase-mark、wave-reveal、corner-land、outline-seat、slat-face、grain-resolve、edge-light、scale-steps）整首 ${Math.max(2, Math.ceil(n * ARRIVALS_SHARE))} 句，每種 ${Math.max(1, Math.ceil(n * ARRIVAL_SHARE))} 句且至少隔 ${ARRIVAL_APART} 句；所有有條件的手法合計 ${Math.max(3, Math.ceil(n * DISTINCT_SHARE))} 句。`}
- 「餘」是這句讀完之後還剩的秒數，所有動作的時間都從這裡出；手法要 0.5–1.3 秒，餘不到就用${facts.world ? '最素的版面' : '素版'}。
- 標「併句」的句子唱得太快不能分開讀，程式會把它和相鄰句放同一個畫面，版面你不用決定：layout 填 ${facts.world ? facts.world.pool.pairSet : 'stack'}、cut 填 hold、enter 填 cut、其他照填，理由寫短。
- 標「同 cXXX」的句子是重複句：副歌回來通常用同一組，sameAs 填那句 id（其他欄位仍要填，但會被那句覆蓋；why 寫這次為什麼一樣）。要讓第二次不一樣，就 sameAs 留空，並在 why 寫這次哪裡變了。
${c.calm ? '- 這是安靜的歌：不用任何衝擊性的進場或抖動，大部分句子 hold。\n' : ''}${facts.props ? (facts.world ? '- 這一版有插圖：畫好的道具和人物會站在字留出的空間（世界版面的字置中時站在字的上方或下方，共用版面可以靠邊：side 填 left 或 right）。重點句、落點用大的版面；其他句子挑字少、位置偏一邊的版面，讓道具有地方站。\n' : `- 這一版有插圖：畫好的道具和人物會站在字的另一側。每段要有幾句把字放到左或右（side 填 left 或 right，layout 用能靠邊的：${SIDE_TEMPLATES.join('、')}），讓道具有地方站；整首大約三分之一的句子。重點句、落點仍可置中。\n`) : ''}
${facts.world ? '' : `【退場 exit】
一般：${PLAIN_EXITS.filter((e) => !(c.calm && LOUD_EXITS.has(e))).map((e) => `${e}（${EXIT_HELP[e] ?? '瞬間壓扁收掉'}）`).join('、')}
有意思的：${LINE_EXIT_KINDS.filter((k) => !(k in OWN_LAYOUT_EXIT) && !(c.calm && NOT_CALM_EXIT.has(k))).map((k) => `${k} ${LINE_EXIT_SEC[k]}s（${LINE_EXIT_HELP[k]}）`).join('、')}（只給 stair、punch、quote、stack、vertical、couplet、editorial、corner-anchor、build-cut；餘要夠；每種最多 ${Math.max(1, Math.ceil(n * EXIT_SHARE))} 句，同一種不連用）。
`}沒有特別意思就用 fade 或 rise，不要為了變化換退場。

【裝飾 decor，一句一個或 none】
大部分 none。裝飾要有理由，放著沒有意義的東西不准出現。
- fine-title 歌名小字、fine-key 這句重點詞小字、fine-rule 一條細線：撐出大字、小字、細線三層尺度，用在版面需要平衡的句子。
- fine-note 你自己寫的小字（note 填字，${NOTE_MAX} 字內；noteKind 填種類）：scene 場景字卡（故事走到哪：時間、地點，例如「凌晨三點・月台」；要是這句歌詞沒說出來的，只把歌詞再說一遍不算），chapter 這首歌自己的章名（你分段時取的名字），echo 回聲（前面唱過的一句或幾個字，原樣照抄，呼應這句），singer 對唱時誰在唱。小字用這首歌歌詞的語言寫（日文歌寫日文、中文歌寫中文），不是說明用的中文。每則都要在 why.decor 說為什麼放；一段最多 ${NOTE_PER_PART} 則，唱得快的句子不放。不准寫：主歌、副歌這類段落名、歌詞沒有的數字或座標、和歌無關的英文標語。沒有要寫就 note 與 noteKind 留空。
- oval 手繪圈圈住整句（12 字內，一段最多一次，這段最要留住的那句）。
- icon 歌的唯一圖示站在字旁（icon 欄要先選；整首最多 3 次，歌詞裡真的有這個東西）。
- breath 最後一音拉長時，字下畫一條呼吸線（程式會檢查真的有長音）。
- relay 強調色沿句子走到重點詞（呼喚、約定、對著誰說）。

【其他】
- handoff：這句和上一句怎麼換手，大多數空字串。relay 因果追問、page 翻開往事、push/split/door 轉折換場、band 號召、chain 連鎖列舉、aperture 收光圈（換段）、signal 訊號斷了又回來。整首最多 ${Math.max(2, Math.ceil(n * DEVICE_SHARE))} 次，至少隔 ${HANDOFF_APART} 句。
- joinNext：這句和下一句是同一個念頭、該同框時才填：list 排比、reply 問答、chat 幾個字的一來一往。很少用，下一句 sameAs 留空照填。
- lineCam：大多數空字串。lean 歪斜視角慢慢落定（不安、疏離、猶豫，B45）；phrase-track 鏡頭一段段找到字（尋找、慢慢靠近）；arc、ground 句子帶著鏡頭走（旅程、接近、回望）。
- hit：段落第一句或最重的落拍才用 zoom（瞬間衝擊）或 tile（畫面碎格，整首最多 3 次），安靜處不用。
- emphasis：這句最該被看見的一段，原樣取自歌詞、不切開詞；method 怎麼標（color、mark、weight、scale、box、shake）。紙面類程式會固定用 color。
${facts.world ? '- ground：只能選上面風格世界列的，空字串交給程式。' : `- ground：這句站在什麼上，整首世界和背景已定，這只是字後面的小事件。空字串交給程式。紙面材質：${grounds}。動態：${moves}（這些是真的畫出那個東西，雨就是雨、流星就是流星，歌詞或段落真的有才用）。特殊：horizon-light（角落落日：黃昏、海、告別）、surface-crack（裂紋：破碎、突破）、fold-mark（落款：承諾，要有 icon）。紙面類版面後面只能用安靜的材質。同一個不連用。`}
- tune：有些東西的數量可以照歌詞：${TUNABLE.join('、')}。歌詞真的說了多少或暗示多或少才填，例如「三顆流星」meteor.n=3、滿天星 stars.n 取高。沒有就空陣列。要 ground 真的用到那一招才有效果。
${facts.moments ? momentsPrompt(facts.moments.overused) : ''}- techniques：這首歌最重要的三到六個手法或決定（可以是「整段 hold」這種判斷，不只是招式 id），用在哪、為什麼。
- icon：這首歌唯一的圖示，只有整首反覆出現同一個東西才選（${SYMBOLS.join('、')}），否則空字串。
- reading：一句話，這首歌真正在講什麼。

絕對不做：攝影機 HUD、座標或假數據、RGB 色散、筆畫飛入組字、歌詞牆。歌詞永遠要讀得完，字不可重疊、不可切詞。

理由（why）每項一句、二十字內、要講這一句的內容，不要寫「增加變化」「強調重點」這種套話。沒有選的項目（none、空字串）理由留空。
${facts.lessons}
歌名：${song.title}　速度 ${song.tempo.toFixed(0)} BPM　${c.calm ? '慢歌，字少' : ''}
每一句（id 時間 字數 餘秒 段落能量｜歌詞｜可斷）：
${rows.join('\n')}

每一句都要輸出一筆，照順序，一句都不能少。`;
}

/** The breaks the composer's word rules allow, so the director does not guess at them. */
/** Layouts whose recipes may stand to one side, so a picture tier's prop has the other. */
export const SIDE_TEMPLATES = [...new Set(RECIPES.filter((r) => r.sides.some((s) => s !== 'center')).map((r) => r.template))];

export function wordPieces(text: string): string[] {
  const cs = [...text];
  const stops = [...wordBreaks(text)].sort((a, b) => a - b);
  return stops.slice(1).map((e, i) => cs.slice(stops[i], e).join('').trim()).filter(Boolean);
}

const WORD_HELP = (form: MomentForm, v: string) => WORD_LISTS[form][v].join('、');
/** The moments on offer, every drawn variant with the words it needs: only when a run asks for them. */
export function momentsPrompt(overused: string[]) {
  const list = (form: MomentForm, what: string, about: Record<string, string>) => MOMENT_FORMS[form].map((v) => `${form}/${v}（${about[v] ?? ''}；${what} ${WORD_HELP(form, v)}）`).join('、');
  const strike = list('strike', '動詞', {
    tear: '紙在動詞處撕開飛散', burn: '字印在紙上，從字下點燃，燒到字邊留焦邊與餘燼，句子走時整張燒掉', melt: '字從動詞起往下垂、滴落',
    slice: '一刀斜斜劃過，上半截沿刀口錯開', wipe: '一隻手沿句子抹過，抹過的字拖出墨痕、變淡但讀得到', fly: '句子鬆開飄起（放手、飛ぶ）或被甩出去（丟、吹き飛ばす），句子走時飛出畫面',
  });
  const shape = list('shape', '名詞', {
    chain: '句子分兩節、中間鏈條，隨後面的口令擺動', wave: '字騎在水面上', fall: '字一顆顆落下（雨直落、雪和花瓣飄落）',
    circle: '句子沿圓排（20 字以內；月是淡圓盤、時鐘隨拍跳動、戒指有一道反光、まる是筆畫出一圈）', rise: '句子整排往上飄（泡、煙、氣球、花火各有樣子）',
  });
  return `- moments（專屬時刻）：整首挑 0 到 3 個時刻，至少隔 30 秒，沒有真正合適的句子就空陣列。每個時刻：cues、form、variant、word、why。
  - strike「動作打在字上」：唱到那個動詞時，動作作用在字或字下的紙上。${strike}。cues 填一句；只有 tear 可以填兩句（前一句是被打的東西，印在一張紙牌上；這句是打的那句，整句像一條腿踢上去，例如「東亞病夫的招牌」+「已被我一腳踢開」），兩句時前一句要讀得完才會被打。
  - shape「字變成那個東西」：句子沿著它說的東西的形狀排，跟著它動。${shape}。cues 填那一句。
  - freeze「時間停住」：唱到停住的字，整個畫面凍結一拍、變灰，只有這句字繼續唱、慢慢推近，再一起恢復。freeze/stop（字 ${WORD_HELP('freeze', 'stop')}）。cues 填那一句；「停不下來」「止まらない」這種否定不算。
  - echo「回聲」：這句在回應前面唱過的某一句（不是同一句重唱），那句以淡影浮回來，墊在這句下面，共同的詞對齊。echo/ghost：cues 填兩句，先填前面那句、再填這句；word 是兩句都有的詞（至少兩個字）。
  - word 必須原樣出現在那句歌詞裡（括號裡的應援不算），而且真的是那個意思：「割と」不是切、「切記」不是切、「心」不是形狀。程式會逐項檢查，不合的時刻會被拿掉，句子本身不受影響。
  - 時刻會把那句整個接管（版面、進退場都由時刻畫），所以那句的 layout 等欄位照填但會被覆蓋。${overused.length ? `最近的歌用過太多次、這首避免：${overused.join('、')}。` : ''}why 一句、二十字內，講這句為什麼配這個形式。
`;
}

export function directionSchema(moments = false) {
  const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
  const whyProps = Object.fromEntries(['cut', 'layout', 'enter', 'idle', 'exit', 'decor'].map((k) => [k, str()]));
  return {
    type: 'object', additionalProperties: false, required: ['reading', 'icon', 'techniques', 'parts', 'tune', 'lines', ...(moments ? ['moments'] : [])],
    properties: {
      reading: str(), icon: str(),
      ...(moments ? { moments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cues', 'form', 'variant', 'word', 'why'], properties: { cues: { type: 'array', items: str() }, form: { type: 'string', enum: Object.keys(MOMENT_FORMS) }, variant: str(), word: str(), why: str() } } } } : {}),
      techniques: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'where', 'why'], properties: { id: str(), where: str(), why: str() } } },
      parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'tension', 'why'], properties: { from: str(), tension: { type: 'number' }, why: str() } } },
      tune: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'value', 'cue', 'why'], properties: { key: str(), value: { type: 'number' }, cue: str(), why: str() } } },
      lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cue', 'sameAs', 'cut', 'pieces', 'layout', 'side', 'enter', 'idle', 'exit', 'decor', 'note', 'noteKind', 'handoff', 'joinNext', 'lineCam', 'hit', 'emphasis', 'method', 'ground', 'evidence', 'why'], properties: {
        cue: str(), sameAs: str(), cut: { type: 'string', enum: ['hold', 'split'] }, pieces: { type: 'array', items: { type: 'string' } },
        layout: str(), side: { type: 'string', enum: ['center', 'left', 'right'] }, enter: str(), idle: str(), exit: str(), decor: str(), note: str(), noteKind: { type: 'string', enum: ['', ...NOTE_KINDS] }, handoff: str(), joinNext: str(), lineCam: str(), hit: str(), emphasis: str(), method: str(), ground: str(), evidence: str(),
        why: { type: 'object', additionalProperties: false, required: ['cut', 'layout', 'enter', 'idle', 'exit', 'decor'], properties: whyProps },
      } } },
    },
  };
}

/** The paid moves this song's own director used that a line may stand on. */
export const screenGroundsOf = (paid: PaidPlan) => [...new Set(paid.shots.flatMap((s) => s.cuts.map((c) => c.fx)))].filter((f) => SCREEN_GROUNDS.includes(f));

export const isDirectorGround = (fx: string) => isLineGround(fx) || SCREEN_GROUNDS.includes(fx);
export { levelOf, OWN_EXIT, isLineExit };
