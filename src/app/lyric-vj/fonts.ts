// Font catalog: every family the renderer may use, its roles and weights. All are SIL OFL from Google Fonts
// (commercial use allowed). A video uses ONE family from start to end (switching faces between lines reads as
// inconsistent); the platform's font picker chooses it, per-role fonts remain for explicit overrides.

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
/** The user's choice: one family for the whole video, or (advanced) a family per role. */
export type FontChoice = Partial<Fonts> & { family?: string };
export const DEFAULT_FAMILY = 'Zen Kaku Gothic New';
export const DEFAULT_FONTS: Required<Fonts> = { display: DEFAULT_FAMILY, body: DEFAULT_FAMILY, script: DEFAULT_FAMILY };

export const familiesFor = (role: FontRole) => FONTS.filter((f) => f.roles.includes(role)).map((f) => f.family);

/** The available weight closest to the one asked for (browsers fake bold badly on single-weight families). */
export function nearestWeight(family: string, weight: number): number {
  const w = FONTS.find((f) => f.family === family)?.weights;
  if (!w) return weight;
  return w.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best));
}

const inCatalog = (f?: string) => f !== undefined && FONTS.some((x) => x.family === f);

/**
 * One family for every role: the user's `family`, else the default. Per-role overrides apply only when given and
 * valid for that role. Unknown families are ignored.
 */
export function resolveFonts(choice?: FontChoice): Required<Fonts> {
  const family = inCatalog(choice?.family) ? choice!.family! : DEFAULT_FAMILY;
  const pick = (role: FontRole) => (choice?.[role] && familiesFor(role).includes(choice[role]!) ? choice[role]! : family);
  return { display: pick('display'), body: pick('body'), script: pick('script') };
}

/** One Google Fonts stylesheet URL for the whole catalog. */
export function googleFontsUrl(): string {
  const fam = FONTS.map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : ''}`);
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=block`;
}
