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
  return out;
}

/** The phrases themselves, for prompts and tests. */
export function phrases(text: string): string[] {
  const chars = [...text];
  const b = [...phraseBoundaries(text)].sort((x, y) => x - y);
  return b.slice(1).map((e, i) => chars.slice(b[i], e).join('')).filter((p) => p.trim());
}
