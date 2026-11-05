// The receipt's barcode (感熱收據 v2 boards, 2026-11-05): a real Code 128 (code set B) of the song's id, so it scans to
// what it says. A dozen lines instead of a barcode library: set B covers the printable ASCII an id is made of.

/** Bar and space widths, in modules, of every Code 128 value (0–102), then Start A, B, C (103–105). Each sums to 11. */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232',
];
const START_B = 104;
const STOP = '2331112';

/** Whether Code 128 set B can carry `text` (printable ASCII, space to ~). */
export const code128Fits = (text: string) => /^[\x20-\x7e]+$/.test(text);

/**
 * The bars of `text` in Code 128 set B: module widths, bar first, bars and spaces alternating (start, data, check, stop).
 * Undefined for text set B cannot carry.
 */
export function code128(text: string): number[] | undefined {
  if (!code128Fits(text)) return undefined;
  const values = [...text].map((ch) => ch.charCodeAt(0) - 32);
  const check = values.reduce((s, v, i) => s + v * (i + 1), START_B) % 103;
  return [START_B, ...values, check].map((v) => PATTERNS[v]).concat(STOP).join('').split('').map(Number);
}
