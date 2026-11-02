// Phrase (≈ bunsetsu) boundaries for Japanese lyrics, so emphasis and line breaks never cut a word in half.
// ICU word segmentation is too fine (騒ぎ|た|て, 描|い|て|ゆ|こう); short kana-only pieces (particles, okurigana,
// auxiliaries) are glued to the word before them. Spaces always separate.
const KANA_ONLY = /^[぀-ゟー]+$/;

let wordSafe = false;
/** The line composer's stricter breaks (wordBreaks) for everything that wraps or cuts a line; off for the paid path. */
export const setWordSafe = (on: boolean) => (wordSafe = on);
export const isWordSafe = () => wordSafe;

const HIRA = /^[\u3041-\u309f]$/;
const KATA = /^[\u30a0-\u30ff\uff66-\uff9f]$/;
const LATIN = /^[A-Za-z0-9'’]$/;
const HAN = /^\p{Script=Han}$/u;
const GAP = /^[\s　、。，．,.!?！？︕︖…‥・）)」』】”]$/;
const OPENER = /^[（(「『【“]$/;
const NO_HEAD = /^[ぁぃぅぇぉっゃゅょゎんァィゥェォッャュョヮンー〜～、。，．,.!?！？︕︖）」』】”’…]$/;
/** Kana that can close a word or phrase: a hiragana run is only ever broken after one of these. */
// what finishes a verb stays on it: わから|ない, いか|ないな
const VERB_TAIL = /^(?:な[いくかけ]|ま[すせし]|たい|れる|られ|せる|させ|ちゃ|じゃ)/;
const PHRASE_END = /(?:[はを]|けど|から|まで|より|ない|たい|だけ|しか|ながら)$/;

/**
 * The places a composer line may break, in code points, 0 and the end included. ICU's word boundaries, less what ICU
 * cuts too finely: nothing inside a katakana, Latin or (Japanese) kanji run, in a run of one-character Chinese words
 * the dictionary did not know (雙|截|棍), or in hiragana except after a word that can end a phrase.
 */
export function wordBreaks(text: string): Set<number> {
  const cs = [...text];
  const ja = /[\u3040-\u30ff]/.test(text);
  const segs = [...new Intl.Segmenter(ja ? 'ja' : 'zh-Hant', { granularity: 'word' }).segment(text)].map((s) => [...s.segment].length);
  const out = new Set<number>([0, cs.length]);
  let at = 0;
  segs.forEach((n, k) => {
    const prevLen = segs[k - 1] ?? 0;
    at += k ? prevLen : 0;
    if (!k) return;
    const [a, b] = [cs[at - 1], cs[at]];
    if (OPENER.test(a)) return;
    if (GAP.test(a) && !GAP.test(b) && !NO_HEAD.test(b)) return void out.add(at);
    if (GAP.test(b) || NO_HEAD.test(b)) return;
    if ((KATA.test(a) && KATA.test(b)) || (LATIN.test(a) && LATIN.test(b))) return;
    if (ja) {
      // okurigana and particles stay with what they follow; kanji runs are one word to the eye
      if (HIRA.test(b) && !HIRA.test(a)) return;
      if (HAN.test(a) && HAN.test(b)) return;
      if (HIRA.test(a) && HIRA.test(b)) {
        const run = cs.slice(0, at).join('').match(/[\u3041-\u309f]+$/)![0];
        const next = cs.slice(at).join('').match(/^[\u3041-\u309f\u30a0-\u30ff\p{Script=Han}]+/u)?.[0] ?? '';
        if ([...run].length < 2 || [...next].length < 2 || !PHRASE_END.test(run) || VERB_TAIL.test(next)) return;
      }
    } else if (HAN.test(a) && HAN.test(b) && prevLen === 1 && n === 1) return;
    out.add(at);
  });
  return out;
}

/** Character indexes (code points) where a phrase may start or end, including 0 and the text length. */
export function phraseBoundaries(text: string): Set<number> {
  // Chinese: the word segmenter's words as they are (a Han run is many words, not one: 氣沉|丹田|手心|開)
  if (wordSafe) return wordBreaks(text);
  if (!/[\u3040-\u30ff]/.test(text) && /\p{Script=Han}/u.test(text)) {
    const out = new Set<number>([0]);
    let pos = 0;
    for (const { segment } of new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(text)) {
      out.add(pos);
      pos += [...segment].length;
    }
    out.add(pos);
    const cs = [...text];
    for (const b of [...out]) if (b > 0 && b < cs.length && /[、。，．,.!?！？）」』】]/.test(cs[b])) out.delete(b);
    return out;
  }
  const seg = new Intl.Segmenter('ja', { granularity: 'word' });
  const out = new Set<number>([0]);
  let pos = 0;
  let prevWord = false;
  for (const { segment } of seg.segment(text)) {
    const len = [...segment].length;
    const isSpace = /^\s+$/.test(segment);
    const glue = !isSpace && prevWord && KANA_ONLY.test(segment) && len <= 2;
    if (!glue) out.add(pos);
    pos += len;
    if (isSpace) out.add(pos);
    prevWord = !isSpace;
  }
  out.add(pos);
  // kinsoku: no phrase starts with small kana, a long mark or closing punctuation, and a kanji run is never cut
  // (六|感 was a separate "word" to the segmenter)
  const cs = [...text];
  const NO_START = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー〜、。，．,.!?！？）」』】]/;
  const IDEO = /\p{Script=Han}/u;
  for (const b of [...out]) if (b > 0 && b < cs.length && (NO_START.test(cs[b]) || (IDEO.test(cs[b - 1]) && IDEO.test(cs[b])))) out.delete(b);
  return out;
}

/** The phrases themselves, for prompts and tests. */
export function phrases(text: string): string[] {
  const chars = [...text];
  const b = [...phraseBoundaries(text)].sort((x, y) => x - y);
  return b.slice(1).map((e, i) => chars.slice(b[i], e).join('')).filter((p) => p.trim());
}

const len = (s: string) => [...s].length;

/**
 * Splits a line into at most `max` chunks for multi-row layouts: spaces first, then phrase boundaries near the middle
 * of the longest chunk. No chunk cuts a word; chunks shorter than `minLen` are not split further.
 */
export function chunks(text: string, max: number, minLen = 4): string[] {
  // a bracketed aside — （I got it） — stays one piece; Latin words keep their spaces when pieces are joined
  const parts: string[] = [];
  let depth = 0;
  for (const tok of text.split(/[\s　]+/).filter(Boolean)) {
    if (depth > 0) parts[parts.length - 1] += ' ' + tok;
    else parts.push(tok);
    depth = Math.max(0, depth + (tok.match(/[(（「『]/g) ?? []).length - (tok.match(/[)）」』]/g) ?? []).length);
  }
  const join = (a: string, b: string) => (/[A-Za-z0-9,.!?'"]$/.test(a) && /^[A-Za-z0-9(（'"]/.test(b) ? `${a} ${b}` : a + b);
  while (parts.length > max) {
    let i = 0;
    for (let j = 1; j < parts.length - 1; j++) if (len(parts[j]) + len(parts[j + 1]) < len(parts[i]) + len(parts[i + 1])) i = j;
    parts.splice(i, 2, join(parts[i], parts[i + 1]));
  }
  while (parts.length < max) {
    const i = parts.reduce((best, p, j) => (len(p) > len(parts[best]) ? j : best), 0);
    const p = parts[i];
    const n = len(p);
    if (n < minLen * 2) break;
    const cut = [...phraseBoundaries(p)].filter((x) => x >= 2 && n - x >= 2).sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2))[0];
    if (cut === undefined) break;
    const cs = [...p];
    parts.splice(i, 1, cs.slice(0, cut).join(''), cs.slice(cut).join(''));
  }
  return parts;
}

/**
 * The line in `rows` rows as even as its phrase boundaries allow: the breaks that make the longest row shortest, a
 * break at a space costing nothing and one inside a run of words three characters (a Chinese line's segmenter breaks
 * between almost any two characters: 台|妹 is a boundary too). chunks splits at spaces first, so a line whose spaces
 * fall unevenly kept a 16-character row beside a 6-character one and was set small to fit it (我愛台妹's rap verses).
 */
export function balancedRows(text: string, rows: number): string[] {
  const cs = [...text.trim()];
  const cuts = [...phraseBoundaries(text.trim())].filter((b) => b > 0 && b < cs.length).sort((a, b) => a - b);
  // widths in ems: a Latin letter or digit is about half a CJK character
  const size = (a: number, b: number) => cs.slice(a, b).reduce((w, c) => w + (/\s/.test(c) ? 0 : /[\x21-\x7e]/.test(c) ? 0.55 : 1), 0);
  // a space between two Latin words is a phrase's inside (How | High?!), between scripts or Chinese phrases it is free
  const latinAround = (b: number) => {
    let i = b - 1, j = b;
    while (i >= 0 && /\s/.test(cs[i])) i--;
    while (j < cs.length && /\s/.test(cs[j])) j++;
    return /[A-Za-z0-9?!,.'"]/.test(cs[i] ?? '') && /[A-Za-z0-9]/.test(cs[j] ?? '');
  };
  const cost = (b: number) => (/\s/.test(cs[b]) || /\s/.test(cs[b - 1]) ? (latinAround(b) ? 2 : 0) : 3);
  let best = { score: size(0, cs.length), at: [] as number[] };
  const walk = (at: number[], left: number) => {
    if (at.length) {
      const edges = [0, ...at, cs.length];
      const score = Math.max(...edges.slice(1).map((e, i) => size(edges[i], e))) + at.reduce((a, b) => a + cost(b), 0);
      if (at.length === rows - 1 && score < best.score) best = { score, at };
    }
    if (!left) return;
    for (const c of cuts) if (c > (at.at(-1) ?? 0)) walk([...at, c], left - 1);
  };
  walk([], rows - 1);
  const edges = [0, ...best.at, cs.length];
  return edges.slice(1).map((e, i) => cs.slice(edges[i], e).join('').trim()).filter(Boolean);
}

/** Longest piece cut in big: a longer one cannot be set large enough to read and ran off the frame. */
export const MAX_PIECE = 6;

/** The line as 2–6 pieces of 2–6 characters (particles join the word before them; long phrases split again). */
export function cutPieces(text: string): { text: string; from: number }[] {
  const out: { text: string; from: number }[] = [];
  let at = 0;
  // Chinese is all Han: its words come from the segmenter, the Japanese "never cut a kanji run" rule would keep a
  // Chinese line in one piece
  const zh = !/[\u3040-\u30ff]/.test(text) && /\p{Script=Han}/u.test(text);
  const split = (p: string): string[] => {
    const cs = [...p.trim()];
    if (cs.length <= MAX_PIECE) return [p];
    // cut nearest the middle, at a phrase boundary when there is one, never inside a kanji run (六|感 or 年甲|斐)
    const kanji = (c?: string) => !zh && !!c && /\p{Script=Han}/u.test(c);
    // the composer's lines keep a word whole even if the piece stays long: the floor on type size has the last word
    const legal = wordSafe ? wordBreaks(p.trim()) : undefined;
    const ok = cs.map((_, i) => i).filter((i) => (!legal || legal.has(i)) && i >= 2 && cs.length - i >= 2 && !(kanji(cs[i - 1]) && kanji(cs[i])) && !/^[、。，,ーっゃゅょぁぃぅぇぉ]/.test(cs[i]));
    const bounds = phraseBoundaries(p.trim());
    const byMiddle = (x: number, y: number) => Math.abs(x - cs.length / 2) - Math.abs(y - cs.length / 2);
    // prefer where a kanji word ends (六感|またがって), then a phrase boundary, then the middle
    const cut = ok.filter((i) => kanji(cs[i - 1]) && !kanji(cs[i])).sort(byMiddle)[0] ?? ok.filter((i) => bounds.has(i)).sort(byMiddle)[0] ?? ok.sort(byMiddle)[0];
    return cut === undefined ? [p] : [cs.slice(0, cut).join(''), cs.slice(cut).join('')].flatMap(split);
  };
  // phrases can split a kanji compound (六|感): rejoin pieces that meet kanji to kanji
  const kanjiEnd = /\p{Script=Han}$/u;
  const kanjiStart = /^\p{Script=Han}/u;
  const joined = phrases(text).reduce<string[]>((acc, p) => (!zh && acc.length && kanjiEnd.test(acc[acc.length - 1]) && kanjiStart.test(p) ? [...acc.slice(0, -1), acc[acc.length - 1] + p] : [...acc, p]), []);
  for (const p of joined.flatMap(split)) {
    const from = [...text].indexOf([...p.trim()][0] ?? '', at);
    at = from + [...p].length;
    const prev = out[out.length - 1];
    if (prev && ([...p.trim()].length < 2 || (out.length >= 6 && [...prev.text].length < MAX_PIECE))) prev.text += p;
    else out.push({ text: p.trim(), from: Math.max(0, from) });
  }
  return out.filter((x) => x.text);
}

