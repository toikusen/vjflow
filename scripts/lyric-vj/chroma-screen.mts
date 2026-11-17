// The keying screen a cut-out is drawn on, chosen per palette: a screen near one of the palette's inks keys that ink
// out with it (Tokyo Drift's silk-pine teal and the green the model drew the car in left holes in the car, 2026-11-17).
// The screen is the candidate farthest in hue from every coloured ink; green stays the default when it is far enough.

export type ScreenName = 'green' | 'blue' | 'magenta';
export interface Screen { name: ScreenName; hex: string; hue: number }

/** Candidates in order of preference (green keys cleanest on drawings; ties go to the earlier one). */
export const SCREENS: readonly Screen[] = [
  { name: 'green', hex: '#00B140', hue: 142 },
  { name: 'blue', hex: '#0047BB', hue: 217 },
  { name: 'magenta', hex: '#E0218A', hue: 327 },
];

/** Inks with less colour than this (near-black, near-white, greys) have no hue that a key could take. */
const MIN_CHROMA = 0.18;
/** A screen this far in hue from every coloured ink is safe. */
export const SAFE_HUE = 60;

const rgbOf = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

/** Hue in degrees and chroma (max − min, 0–1) of a #rrggbb colour. */
export function hueChroma(hex: string): { hue: number; chroma: number } {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
  if (c === 0) return { hue: 0, chroma: 0 };
  const h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { hue: (h * 60 + 360) % 360, chroma: c };
}

const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** How far a colour leans toward a screen, in 0–255 units: the keyers' own measure (key_screen.py screen_excess). */
export function screenExcess(hex: string, screen: ScreenName): number {
  const [r, g, b] = rgbOf(hex).map((v) => Math.round(v * 255));
  return screen === 'green' ? g - Math.max(r, b) : screen === 'blue' ? b - Math.max(r, g) : Math.min(r, b) - g;
}
/** An ink this far below the screen's lean cannot be keyed with it, whatever its hue (orange next to magenta). */
const CLEAR_EXCESS = -25;

/** The nearest hue gap from a screen to any coloured ink that could lean into it (180 when none). */
export function screenGap(screen: Screen, inks: readonly string[]): number {
  const gaps = inks.filter((ink) => hueChroma(ink).chroma >= MIN_CHROMA && screenExcess(ink, screen.name) > CLEAR_EXCESS).map((ink) => hueGap(hueChroma(ink).hue, screen.hue));
  return gaps.length ? Math.min(...gaps) : 180;
}

/** The screen for a palette: the first candidate at least SAFE_HUE from every coloured ink, else the farthest. */
export function screenFor(inks: readonly string[]): Screen {
  const safe = SCREENS.find((s) => screenGap(s, inks) >= SAFE_HUE);
  if (safe) return safe;
  return SCREENS.reduce((best, s) => (screenGap(s, inks) > screenGap(best, inks) ? s : best));
}
