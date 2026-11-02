// The paper a line is set on. Coordinates, pivot and reading area all come from one box, so anything built on a carrier
// (a tag, a hanging card, a fold) shares them. Pure numbers: the mesh is in lyric-carrier.ts. y is up, the box's centre is 0, 0.

export type Pt = [number, number];
export interface CarrierBox {
  w: number;
  h: number;
  /** Paper outline, counter-clockwise. */
  outline: Pt[];
  /** Where the paper turns from. */
  pivot: Pt;
  /** The clipped corner's side: 1 right, -1 left. */
  side: number;
  /** Punched holes, centres; the paper shows what is behind it through them. */
  holes?: Pt[];
  holeR?: number;
}

/** A tag: one corner cut long and off-square, a second small nick on the far edge, no two tags of a song alike. */
export function tagBox(w: number, h: number, seed: number, cutBy = 1, leanBy = 1, maxCut = Infinity): CarrierBox {
  const side = seed % 2 ? 1 : -1;
  // never past the margin the corner's side is given: a two-row tag's taller corner ran its cut through the first character
  const cut = Math.min(maxCut, Math.min(h * 0.55, w * 0.22) * (0.8 + ((seed >> 1) % 5) * 0.1) * cutBy);
  const lean = h * (0.28 + ((seed >> 3) % 4) * 0.06) * leanBy;
  const nick = Math.min(h, w) * 0.08;
  const [x, y] = [w / 2, h / 2];
  const right: Pt[] = [[-x, -y], [x - nick, -y], [x, -y + nick], [x, y - lean], [x - cut, y], [-x, y]];
  const outline: Pt[] = side > 0 ? right : right.map(([a, b]) => [-a, b] as Pt).reverse();
  return { w, h, outline, pivot: [side * (x - cut * 0.4), y - lean * 0.3], side };
}

/**
 * The tag hung from two off-centre holes: a short strap from each meets at `pivot`, above the paper. The holes sit in the
 * paper's top margin (carrierPad's `hangPad`), on the side away from the clipped corner, so neither can touch the type.
 */
export function hangBox(w: number, h: number, seed: number, size: number, strapBy = 1): CarrierBox {
  const tag = tagBox(w, h, seed, 1, 1, size * 0.85);
  const lean = 0.32 + ((seed >> 2) % 4) * 0.03;
  const holes: Pt[] = [[-tag.side * w * lean, h / 2 - size * 0.27], [-tag.side * w * (lean - 0.2), h / 2 - size * 0.27]];
  return { ...tag, holes, holeR: Math.max(7, size * 0.075), pivot: [-tag.side * w * (lean - 0.07), h / 2 + strapLength(h, size) * strapBy] };
}

/** How far above the paper the hanging point is. */
export const strapLength = (h: number, size: number) => Math.min(170, Math.max(size * 0.9, h * 0.34));

/** Paper torn to a slightly uneven edge, never out of its box: a photo print's own rough trim, no white frame. */
export function cardBox(w: number, h: number, seed: number): CarrierBox {
  const side = seed % 2 ? 1 : -1;
  const [x, y] = [w / 2, h / 2];
  const nick = (i: number) => (((seed + i * 7) * 2654435761) >>> 0) % 7;
  const edge = (a: Pt, b: Pt, nx: number, ny: number, n: number, from: number): Pt[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n - nx * (i ? nick(from + i) : 0), a[1] + ((b[1] - a[1]) * i) / n - ny * (i ? nick(from + i) : 0)] as Pt);
  const outline = [...edge([-x, -y], [x, -y], 0, -1, 9, 0), ...edge([x, -y], [x, y], 1, 0, 5, 20), ...edge([x, y], [-x, y], 0, 1, 9, 40), ...edge([-x, y], [-x, -y], -1, 0, 5, 60)];
  return { w, h, outline, pivot: [0, 0], side };
}

/** Plain strip of paper; `feed` keeps a square edge for the press strip to sit on. */
export function plainBox(w: number, h: number, seed: number): CarrierBox {
  const [x, y] = [w / 2, h / 2];
  return { w, h, outline: [[-x, -y], [x, -y], [x, y], [-x, y]], pivot: [0, 0], side: seed % 2 ? 1 : -1 };
}

/** A loose page: square but for one folded corner, away from the side it is held by; `pivot` is that fold's inner point. */
export function noteBox(w: number, h: number, seed: number, size: number, foldBy = 1): CarrierBox {
  const side = seed % 2 ? 1 : -1;
  const fold = noteFold(size) * foldBy;
  const [x, y] = [w / 2, h / 2];
  const right: Pt[] = [[-x, -y], [x, -y], [x, y - fold], [x - fold, y], [-x, y]];
  return { w, h, outline: side > 0 ? right : right.map(([a, b]) => [-a, b] as Pt).reverse(), pivot: [side * (x - fold), y - fold], side };
}

/** A contact print's short frame: square, with a run of small notches down one side only. */
export function frameBox(w: number, h: number, seed: number, notches = 5): CarrierBox {
  const side = seed % 2 ? 1 : -1;
  const [x, y] = [w / 2, h / 2];
  const [bite, step] = [Math.min(16, h * 0.05), h / (notches + 1)];
  const run: Pt[] = Array.from({ length: notches }, (_, i) => -y + step * (i + 1)).flatMap((c) => [[x, c - bite], [x - bite, c - bite], [x - bite, c + bite], [x, c + bite]] as Pt[]);
  const right: Pt[] = [[-x, -y], [x, -y], ...run, [x, y], [-x, y]];
  return { w, h, outline: side > 0 ? right : right.map(([a, b]) => [-a, b] as Pt).reverse(), pivot: [0, 0], side };
}

/** The folded corner's leg. */
export const noteFold = (size: number) => Math.max(40, size * 0.62);

/** How far a band runs past its paper on the side it comes from: off any frame it can sit in. */
const BAND_TAIL = 2600;
/** A long band: one end runs off the frame, the other is an obtuse point cut off-square, no zigzag. */
export function bandBox(w: number, h: number, seed: number): CarrierBox {
  const side = seed % 2 ? 1 : -1;
  const [x, y] = [w / 2, h / 2];
  const cut = h * 0.3;
  const tip = (seed >> 1) % 2 ? h * 0.14 : -h * 0.14;
  const right: Pt[] = [[-x - BAND_TAIL, -y], [x - cut, -y], [x, tip], [x - cut, y], [-x - BAND_TAIL, y]];
  const outline = side > 0 ? right.map(([a, b]) => [-a, b] as Pt).reverse() : right;
  return { w, h, outline, pivot: [0, 0], side };
}

/** A soft-cornered tile, flat on four sides; corners are short polylines so a mesh can take them directly. */
export function roundedBox(w: number, h: number, r: number): Pt[] {
  const [x, y] = [w / 2, h / 2];
  const corner = (cx: number, cy: number, from: number): Pt[] => Array.from({ length: 6 }, (_, i) => { const a = from + (i * Math.PI) / 10; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });
  return [...corner(x - r, -y + r, -Math.PI / 2), ...corner(x - r, y - r, 0), ...corner(-x + r, y - r, Math.PI / 2), ...corner(-x + r, -y + r, Math.PI)];
}

/** The paper's margins round the type, by type size: the clipped corner's side is given more. */
export const carrierPad = (size: number, side: number) => ({ top: size * 0.3, bottom: size * 0.3, left: size * (side < 0 ? 0.95 : 0.42), right: size * (side > 0 ? 0.95 : 0.42) });
/** The hanging tag's margins: room for its holes above the type. */
export const hangPad = (size: number, side: number) => ({ ...carrierPad(size, side), top: size * 0.56 });
/** Even margins, for paper with no clipped corner. */
export const evenPad = (size: number) => ({ top: size * 0.34, bottom: size * 0.34, left: size * 0.5, right: size * 0.5 });
/** A band's margins: the point end needs its own room past the last character. */
export const bandPad = (size: number, side: number) => ({ top: size * 0.26, bottom: size * 0.26, left: size * (side > 0 ? 0.8 : 0.42), right: size * (side > 0 ? 0.42 : 0.8) });

export interface PaperMotion { landSec: number; exitAt: number; exitDur: number; exit: string; show: number }
export interface PaperPose { x: number; y: number; rot: number; alpha: number; open: number; scale: number }

export const easeOutCurve = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const easeOut = easeOutCurve;
const easeIn = (x: number) => Math.min(1, Math.max(0, x)) ** 3;

/**
 * The paper at t. It unrolls from its pivot and swings to rest by landSec, so it is exactly at rest for all of the
 * reading; the exit moves it whole, and only from exitAt on.
 */
export function paperPose(t: number, m: PaperMotion, dir: number): PaperPose {
  const k = (t - m.show) / m.landSec;
  const e = easeOut(k);
  return leaving({ x: 0, y: 0, rot: k >= 1 ? 0 : dir * 0.16 * (1 - e) ** 2, alpha: t >= m.show ? 1 : 0, open: k >= 1 ? 1 : e, scale: 1 }, t, m, dir);
}

/** The exit on top of a pose: the paper goes whole, and only from exitAt on. */
export function leaving(rest: PaperPose, t: number, m: PaperMotion, dir: number): PaperPose {
  if (t <= m.exitAt) return rest;
  const q = easeIn((t - m.exitAt) / Math.max(0.05, m.exitDur));
  if (m.exit === 'tile-scatter' || m.exit === 'rail-leave' || m.exit === 'gravity-pass') return rest;
  if (m.exit === 'cut') return { ...rest, alpha: 0 };
  if (m.exit === 'rise') return { ...rest, y: 90 * q, alpha: 1 - q };
  if (m.exit === 'drop') return { ...rest, y: -520 * q, rot: dir * 0.2 * q };
  if (m.exit === 'dash') return { ...rest, x: dir * 1500 * q };
  if (m.exit === 'shrink') return { ...rest, scale: 1 - 0.3 * q, alpha: 1 - q };
  return { ...rest, alpha: 1 - q };
}
