// Font catalog: every family the renderer may use, its roles and weights. All are SIL OFL from Google Fonts
// (commercial use allowed). A video uses ONE family from start to end (switching faces between lines reads as
// inconsistent); the platform's font picker chooses it, per-role fonts remain for explicit overrides.

export type FontRole = 'display' | 'body' | 'script' | 'accent';

export interface FontSpec {
  family: string;
  roles: FontRole[];
  weights: number[];
  feel: string;
  /** false: decorative only (script/display flourish), never for reading lines. */
  legible?: boolean;
}

export const FONTS: FontSpec[] = [
  { family: 'Zen Kaku Gothic New', roles: ['body'], weights: [700, 900], feel: '清楚的粗黑體' },
  { family: 'Klee One', roles: ['script', 'body'], weights: [600], feel: '鉛筆／鋼筆楷書手寫，清楚好讀' },
  { family: 'Zen Kurenaido', roles: ['script'], weights: [400], feel: '細毛筆柔和手寫' },
  { family: 'Yomogi', roles: ['script'], weights: [400], feel: '隨性的手寫筆記' },
  { family: 'Yusei Magic', roles: ['script', 'display'], weights: [400], feel: '麥克筆粗手寫，活潑' },
  // added from the gap analysis: designers set lyrics in mincho, rounded and decorative faces, not one bold gothic
  { family: 'Shippori Mincho', roles: ['display', 'body'], weights: [400, 500, 700, 800], feel: '端正的明朝體，文學、抒情、冷調' },
  { family: 'Zen Old Mincho', roles: ['display', 'body'], weights: [400, 700, 900], feel: '古典明朝，粗細對比強，和風、戲劇性' },
  { family: 'Noto Serif JP', roles: ['display', 'body'], weights: [200, 300, 400, 500, 600, 700, 800, 900], feel: '現代明朝，粗細齊全，乾淨俐落' },
  { family: 'Hina Mincho', roles: ['body', 'script'], weights: [400], feel: '極細纖細的明朝，安靜、透明、易碎' },
  { family: 'Kaisei Decol', roles: ['display', 'body'], weights: [400, 500, 700], feel: '帶裝飾的柔和明朝，童話、復古、溫柔' },
  { family: 'Zen Maru Gothic', roles: ['display', 'body'], weights: [300, 400, 500, 700, 900], feel: '圓體，可愛、甜、親切' },
  { family: 'M PLUS Rounded 1c', roles: ['display', 'body'], weights: [100, 300, 400, 500, 700, 800, 900], feel: '圓體，活潑、明亮、偶像感' },
  { family: 'Mochiy Pop One', roles: ['display'], weights: [400], feel: 'POP 粗圓字，元氣、甜系偶像' },
  { family: 'DotGothic16', roles: ['display', 'body'], weights: [400], feel: '點陣字，遊戲、電子、復古數位' },
  { family: 'Yuji Syuku', roles: ['display', 'script'], weights: [400], feel: '毛筆書法，和風、熱血、儀式感' },
  // accent faces (Latin only): English lines, the artist name and the corner tag, paired with the main face
  { family: 'Great Vibes', roles: ['accent'], weights: [400], feel: '優雅草寫，魔法、浪漫、夜晚（只用在標籤，英文歌詞改用易讀字）', legible: false },
  { family: 'Dancing Script', roles: ['accent'], weights: [400, 700], feel: '輕快手寫，甜、活潑（只用在標籤，英文歌詞改用易讀字）', legible: false },
  { family: 'Cormorant Garamond', roles: ['accent'], weights: [300, 400, 600], feel: '古典襯線，文學、冷調、精緻' },
  { family: 'Montserrat', roles: ['accent'], weights: [300, 500, 700], feel: '幾何無襯線，都會、俐落、電子' },
  { family: 'Space Mono', roles: ['accent'], weights: [400, 700], feel: '等寬字，科技、數位、UI 感' },
  { family: 'Pacifico', roles: ['accent'], weights: [400], feel: '圓潤手寫，可愛、POP（只用在標籤，英文歌詞改用易讀字）', legible: false },
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
  // small reading type needs a body face: a display-only family (a heavy POP or brush face) clumps at 96 px
  const fallback = (role: Exclude<FontRole, 'accent'>) => (role === 'body' && !familiesFor('body').includes(family) ? DEFAULT_FAMILY : family);
  const pick = (role: Exclude<FontRole, 'accent'>) => (choice?.[role] && familiesFor(role).includes(choice[role]!) ? choice[role]! : fallback(role));
  return { display: pick('display'), body: pick('body'), script: pick('script') };
}

/** The Latin face for English lyric lines: the accent face when it reads easily, else a clean sans. */
export const readingLatin = (accent: string) => (FONTS.find((f) => f.family === accent)?.legible === false ? 'Montserrat' : accent);

/** One Google Fonts stylesheet URL for the whole catalog. */
export function googleFontsUrl(): string {
  const fam = FONTS.map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : ''}`);
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=block`;
}
