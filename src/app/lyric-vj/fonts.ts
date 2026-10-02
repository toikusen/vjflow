// Font catalog: every family the renderer may use, its roles and weights. All are SIL OFL from Google Fonts
// (commercial use allowed); the platform's font picker and the director both choose from this list.

export type FontRole = 'display' | 'body' | 'script';

export interface FontSpec {
  family: string;
  roles: FontRole[];
  weights: number[];
  feel: string;
}

export const FONTS: FontSpec[] = [
  { family: 'Dela Gothic One', roles: ['display'], weights: [400], feel: '極粗黑體，衝擊感' },
  { family: 'Zen Kaku Gothic New', roles: ['body'], weights: [700, 900], feel: '清楚的粗黑體' },
  { family: 'Klee One', roles: ['script', 'body'], weights: [600], feel: '鉛筆／鋼筆楷書手寫，清楚好讀' },
  { family: 'Zen Kurenaido', roles: ['script'], weights: [400], feel: '細毛筆柔和手寫' },
  { family: 'Yomogi', roles: ['script'], weights: [400], feel: '隨性的手寫筆記' },
  { family: 'Yusei Magic', roles: ['script', 'display'], weights: [400], feel: '麥克筆粗手寫，活潑' },
];

export type Fonts = { display: string; body: string; script?: string };
export const DEFAULT_FONTS: Required<Fonts> = { display: 'Dela Gothic One', body: 'Zen Kaku Gothic New', script: 'Zen Kurenaido' };

export const familiesFor = (role: FontRole) => FONTS.filter((f) => f.roles.includes(role)).map((f) => f.family);

/** The available weight closest to the one asked for (browsers fake bold badly on single-weight families). */
export function nearestWeight(family: string, weight: number): number {
  const w = FONTS.find((f) => f.family === family)?.weights;
  if (!w) return weight;
  return w.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best));
}

/**
 * Resolves fonts in priority order (user choice, then the director's, then defaults); a family that is not in the
 * catalog for that role falls back to the next source.
 */
export function resolveFonts(...sources: (Partial<Fonts> | undefined)[]): Required<Fonts> {
  const pick = (role: FontRole) =>
    sources.map((s) => s?.[role]).find((f) => f !== undefined && familiesFor(role).includes(f)) ?? DEFAULT_FONTS[role];
  return { display: pick('display'), body: pick('body'), script: pick('script') };
}

/** One Google Fonts stylesheet URL for the whole catalog. */
export function googleFontsUrl(): string {
  const fam = FONTS.map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : ''}`);
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=block`;
}
