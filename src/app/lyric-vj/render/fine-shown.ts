// What of a line's fine tier is shown with it (render/fine-tier.ts draws it): no unsung words beside a sung line.
import type { FineTier } from '../treatment';

/**
 * The fine tier as it is shown beside a line that sings `sung`. It is set in the lyric face, bold, against the line's
 * block, so any words in it are read as lyrics: only the line's own sung words keep their text (its key phrase, a title
 * it sings); a director's note of any kind (always), the song's title and a part name the line does not sing are dropped
 * and the hairline stays (policy decided 2026-11-17: viewers took 黄昏サイクル's notes for lyrics).
 */
export function fineShown(fine: FineTier, sung: string): FineTier {
  if (!fine.text) return fine;
  // (the real words: width folded (NFKC) and katakana read as hiragana; a long vowel is part of the word — 「ビール」
  // is not in 「ビルの窓」 — only spaces and punctuation are dropped)
  const bare = (s: string) => s.normalize('NFKC').replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・、。，,.!?！？「」『』…]/g, '');
  const own = fine.kind !== 'note' && !!bare(fine.text) && bare(sung).includes(bare(fine.text));
  return own ? fine : { kind: 'rule', text: '' };
}
