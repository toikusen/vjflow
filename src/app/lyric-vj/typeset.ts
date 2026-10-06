// Japanese typesetting rules for display lyrics (after JIZURA's 03_text.js, MIT): particles set smaller, kana
// tracked tighter, a leading kanji enlarged, Latin a touch larger with a gap at the script change. Pure: the glyph
// layer applies the numbers.

const HIRA = /[ぁ-ゖゝゞ]/;
const SMALL = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/;
const PARTICLES = new Set([...'はがをにでとのへもや']);
const KANJI = /\p{Script=Han}/u;
const LATIN = /[A-Za-z0-9]/;

export interface CharSet {
  /** Glyph size multiplier. */
  scale: number;
  /** Advance multiplier (tracking). */
  advance: number;
  /** Extra space before this character, in ems. */
  gapBefore: number;
}

/**
 * Per-character typesetting for one line. `display` lines (big type) get the leading-kanji enlargement; particle and
 * kana rules apply to every line.
 */
export function typeset(text: string, display: boolean): CharSet[] {
  const cs = [...text];
  const hira = (c?: string) => !!c && HIRA.test(c);
  const visible = cs.filter((c) => c.trim()).length;
  return cs.map((c, i) => {
    const prev = cs[i - 1];
    const next = cs[i + 1];
    let scale = 1;
    let advance = 1;
    let gapBefore = 0;
    // a lone particle between non-hiragana (漢字の漢字, カタカナを) reads as grammar, not as a word
    if (PARTICLES.has(c) && prev && !hira(prev) && !hira(next) && prev.trim()) scale = 0.78;
    else if (SMALL.test(c)) advance = 0.86;
    else if (hira(c)) advance = 0.9;
    else if (c === 'ー') advance = 0.94;
    if (LATIN.test(c)) scale = 1.08;
    // a space-free switch between Latin and Japanese gets a fifth of an em
    if (prev && prev.trim() && c.trim() && LATIN.test(prev) !== LATIN.test(c) && !/[\s、。,.!?！？]/.test(prev + c)) gapBefore = 0.2;
    if (display && i === 0 && visible >= 3 && KANJI.test(c)) scale = 1.18;
    return { scale, advance, gapBefore };
  });
}
