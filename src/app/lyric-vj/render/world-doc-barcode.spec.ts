import { describe, expect, it } from 'vitest';
import { code128, code128Fits } from './world-doc-barcode';

// (module runs read off the v2 boards' barcodes, made with bwip-js: out/research/boards-receipt-v2/tex/bc-*.svg)
const BWIP = {
  'sou-setsu-kon': '2112141142121341111242111221321142121122141241121142121242111221322412111341112411123222112331112',
  'sekai-no-tsuzuki': '2112141142121122142412111211241421121221322411121341111221321241121142121242112141211242112412111421124112122331112',
};

describe('code128', () => {
  it('matches a reference encoder bar for bar', () => {
    for (const [text, bars] of Object.entries(BWIP)) expect(code128(text)!.join(''), text).toBe(bars);
  });
  it('is 11 modules a symbol and 13 for the stop', () => {
    const bars = code128('7A3F09C1')!;
    expect(bars.reduce((s, x) => s + x, 0)).toBe(11 * (1 + 8 + 1) + 13);
  });
  it('refuses what set B cannot carry', () => {
    expect(code128Fits('雙截棍')).toBe(false);
    expect(code128('雙截棍')).toBeUndefined();
  });
});
