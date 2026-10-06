// Phrase (≈ bunsetsu) boundaries for Japanese lyrics, so emphasis and line breaks never cut a word in half.
// ICU word segmentation is too fine (騒ぎ|た|て, 描|い|て|ゆ|こう); short kana-only pieces (particles, okurigana,
// auxiliaries) are glued to the word before them. Spaces always separate.
const KANA_ONLY = /^[぀-ゟー]+$/;

/** Character indexes (code points) where a phrase may start or end, including 0 and the text length. */
export function phraseBoundaries(text: string): Set<number> {
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
