// Inks that read: a text colour lifted to 4.5:1, a key ink apart from the body that reads on every ground it is shown on.
// Pure colour arithmetic (no drawing), so the plan can ask what the renderer will pick (lineplan-core hold events).
import { contrast } from '../contrast';

/** Lightens a text colour toward white until it reaches WCAG 4.5:1 against the (dark) background colour. */
export function readable(hex: string, background: string, min = 4.5): string {
  const n = parseInt(hex.slice(1), 16);
  const light = contrast(background, '#000000') > contrast(background, '#ffffff');
  for (let k = 0; k <= 1.0001; k += 0.05) {
    // on a light background the colour darkens toward black instead of lightening toward white
    const toward = light ? 0 : 255;
    const c = '#' + [16, 8, 0].map((sh) => { const v = (n >> sh) & 255; return Math.round(v + (toward - v) * k).toString(16).padStart(2, '0'); }).join('');
    if (contrast(c, background) >= min) return c;
  }
  return light ? '#000000' : '#ffffff';
}

const toLin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** #rrggbb to OKLab [L, a, b]. */
function oklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((sh) => toLin((n >> sh) & 255));
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** OKLab to #rrggbb, or undefined outside the sRGB gamut. */
function fromOklab(L: number, a: number, b: number): string | undefined {
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3);
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (rgb.some((v) => v < -1e-4 || v > 1 + 1e-4)) return undefined;
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, toSrgb(Math.max(0, v))))).toString(16).padStart(2, '0')).join('');
}

/** How far apart two colours look (OKLab distance: about 0.02 is just seen, 0.08 is plainly another colour). */
export function inkDistance(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * A colour of the same hue moved in lightness (away from the background) until it reads `min` on it. `full`: as much of
 * its hue as the gamut holds at each lightness, instead of its own chroma (a gold key pushed light on a red paper kept
 * its gold only at full chroma; at its own it paled into the cream body ink). Undefined when no lightness reads.
 */
export function readableHue(hex: string, background: string, min = 4.5, full = false): string | undefined {
  if (contrast(hex, background) >= min) return hex;
  const [L0, a0, b0] = oklab(hex);
  const C0 = Math.hypot(a0, b0);
  const h = Math.atan2(b0, a0);
  // a grey has no hue to keep at full chroma
  if (full && C0 < 0.03) return undefined;
  const up = contrast(background, '#000000') <= contrast(background, '#ffffff');
  const inGamut = (L: number, C: number) => fromOklab(L, C * Math.cos(h), C * Math.sin(h));
  for (let L = L0; up ? L <= 1 : L >= 0; L += up ? 0.01 : -0.01) {
    let c = inGamut(L, full ? 0.4 : C0);
    if (!c) {
      // the most chroma this lightness holds at the hue, up to the asked one (halving search)
      let [lo, hi] = [0, full ? 0.4 : C0];
      for (let k = 0; k < 16; k++) if (inGamut(L, (lo + hi) / 2)) lo = (lo + hi) / 2; else hi = (lo + hi) / 2;
      c = inGamut(L, lo);
    }
    if (c && contrast(c, background) >= min) return c;
  }
  return undefined;
}

/** How far a key ink must stand from the body ink to be seen as a marked word, not the same type (OKLab distance). */
export const KEY_APART = 0.08;

/**
 * The ink a line's key word takes: it reads `min` on every ground under it (the paper, and what the picture puts under
 * the line), and it stays visibly apart from the body ink, so the mark never disappears into the words. In order: the
 * key ink as drawn, another accent of the world's palette as drawn, the key ink then each accent moved in lightness in
 * its own hue (its own chroma, then the most its hue holds); failing all, the one of those that reads and is furthest
 * from the body ink, and only then the key pushed to read whatever it becomes.
 */
export function keyInk(base: string, pool: string[], body: string, grounds: string[], min = 4.5): string {
  const hexes = [...new Set([base, ...pool].filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase()))];
  const valid = grounds.filter((g) => /^#[0-9a-f]{6}$/i.test(g));
  // only the grounds the body ink reads on (3:1) are where the line is shown: a print's twin build, inked for the
  // swapped cuts, was measured over the cut the other build shows on, and no ink reads on a black and a white ground
  const shown = /^#[0-9a-f]{6}$/i.test(body) ? valid.filter((g) => contrast(body, g) >= 3) : valid;
  const gs = shown.length ? shown : valid;
  const reads = (c: string) => gs.every((g) => contrast(c, g) >= min);
  const apart = (c: string) => !/^#[0-9a-f]{6}$/i.test(body) || inkDistance(c, body) >= KEY_APART;
  const ok = (c: string | undefined): c is string => !!c && reads(c) && apart(c);
  const moved = (c: string, full: boolean) => gs.reduce<string | undefined>((x, g) => (x ? readableHue(x, g, min, full) : x), c);
  // an accent that is the body ink already (a palette whose accent came out black on black type) marks nothing however
  // far it is moved: only the inks apart from the body are tried
  const marks = hexes.filter(apart);
  const tries = marks.flatMap((c) => [moved(c, false), moved(c, true)]);
  const found = marks.find(ok) ?? tries.find(ok);
  // none stands apart enough while it reads: the one that reads furthest from the body ink
  const farthest = /^#[0-9a-f]{6}$/i.test(body) ? tries.filter((c): c is string => !!c && reads(c)).sort((p, q) => inkDistance(q, body) - inkDistance(p, body))[0] : undefined;
  return found ?? farthest ?? gs.reduce((c, g) => readable(c, g, min), base);
}
