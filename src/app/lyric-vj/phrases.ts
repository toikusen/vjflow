// Phrase (≈ bunsetsu) boundaries for Japanese lyrics, so emphasis and line breaks never cut a word in half.
// ICU word segmentation is too fine (騒ぎ|た|て, 描|い|て|ゆ|こう); short kana-only pieces (particles, okurigana,
// auxiliaries) are glued to the word before them. Spaces always separate.
const KANA_ONLY = /^[぀-ゟー]+$/;

/** Character indexes (code points) where a phrase may start or end, including 0 and the text length. */
export function phraseBoundaries(text: string): Set<number> {
  // Chinese: the word segmenter's words as they are (a Han run is many words, not one: 氣沉|丹田|手心|開)
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
  const NO_HEAD = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー〜、。，．,.!?！？）」』】]/;
  const HAN = /\p{Script=Han}/u;
  for (const b of [...out]) if (b > 0 && b < cs.length && (NO_HEAD.test(cs[b]) || (HAN.test(cs[b - 1]) && HAN.test(cs[b])))) out.delete(b);
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
