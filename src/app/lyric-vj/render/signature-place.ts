// Where a signature moment stands on a story page. The forms (signature.ts, signature-forms.ts) are drawn for the open
// frame: a wave rolls across its middle, a board hangs at its top. The paid story tier lays a picture into that frame
// (keyframes.mts: a whole painted frame; cutout.mts: a window on paper with cut-out figures standing before it), and a
// line drawn across the picture and the girl in it was hard to read (世界のつづき c011, 2026-11-03). On a page the
// moment keeps to the quiet paper: the band of the frame clear of the window and of every figure (above, below or
// beside them) that keeps the form biggest, the form scaled to fit there, a row form wrapped into rows. A frame that
// carries no story picture is left as the form drew it.
import { scriptOf, segmentsOf } from '../signature-moments';

export type Box = [number, number, number, number]; // x0, y0, x1, y1 in frame px
const [W, H] = [1920, 1080];
/** The lyric third a page keeps for its words (cutout.mts windowOff / arrange keep 0.36). */
const THIRD = 0.36;
/** Window widths in units of the window's height, as page.js draws them (cutout.mts WIDE_K); the rest are as wide as tall. */
const WIDE_K: Record<string, number> = { rect: 1.5, rounded: 1.5, polaroid: 0.95, window: 1.25, ticket: 1.6, phone: 0.52, ellipse: 1.6, arch: 0.78, panels: 1.9, torn: 1.5, brush: 1.6, cloud: 1.4, wavy: 1.5 };
const FULL_WIDTH = new Set(['band', 'doubleband', 'filmstrip', 'split']);
/** The paper left round a band's content. */
export const MARGIN = 36;
/** A form keeps at least this share of its size on the clear paper; smaller, it goes over the window's picture instead (never across a figure). */
export const FLOOR = 0.6;

export interface StoryPicture { /** The picture window, or the whole frame. */ window: Box | 'full'; /** The cut-out figures and props standing on the page. */ figures: Box[] }
export interface Placement { /** x' = tx + s·x, y' = ty + s·y */ s: number; tx: number; ty: number }

interface PageSpec { layout?: { shape: string; x: number; y: number; size: number }; actors?: { sprite: string; then?: string; x: number; ground: number; h: number }[]; props?: { sprite: string; x: number; y: number; h: number }[]; aspects?: Record<string, number> }

/** The page spec a cut-out shot's code layer carries (cutout.mts shotCode writes it first: `const S={...};`). */
export function pageSpecOf(src: string): PageSpec | undefined {
  if (!src.startsWith('const S=')) return undefined;
  const end = src.indexOf('};\n');
  if (end < 0) return undefined;
  try {
    return JSON.parse(src.slice(8, end + 1)) as PageSpec;
  } catch {
    return undefined;
  }
}

const clampBox = (b: Box): Box => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(W, b[2]), Math.min(H, b[3])];

/** The picture of a cut-out page: its window (as page.js lays it) and the boxes of its figures and props. */
export function pictureOf(S: PageSpec): StoryPicture {
  const aspects = S.aspects ?? {};
  const figures: Box[] = [
    ...(S.actors ?? []).map((q): Box => {
      const hh = q.h * H;
      const ww = hh * Math.max(aspects[q.sprite] ?? 0.4, q.then ? aspects[q.then] ?? 0.4 : 0);
      const cx = ((q.x + 1) / 2) * W;
      return clampBox([cx - ww / 2, q.ground * H - hh, cx + ww / 2, q.ground * H]);
    }),
    ...(S.props ?? []).map((q): Box => {
      const hh = q.h * H;
      const ww = hh * (aspects[q.sprite] ?? 1);
      const cx = ((q.x + 1) / 2) * W;
      return clampBox([cx - ww / 2, q.y * H - hh / 2, cx + ww / 2, q.y * H + hh / 2]);
    }),
  ];
  const L = S.layout;
  if (!L || L.shape === 'full') return { window: 'full', figures };
  const sh = L.size * H;
  const cy = L.y * H;
  if (FULL_WIDTH.has(L.shape)) return { window: clampBox([0, cy - sh / 2, W, cy + sh / 2]), figures };
  const bw = (WIDE_K[L.shape] ?? 1) * sh;
  const cx = ((L.x + 1) / 2) * W;
  return { window: clampBox([cx - bw / 2, cy - sh / 2, cx + bw / 2, cy + sh / 2]), figures };
}

/** The story picture a section carries: its cut-out page, or a whole frame laid by keyframes.mts; none where it carries no picture. */
export function storyPictureOf(layers: { kind: string; src?: string; own?: boolean }[]): StoryPicture | undefined {
  for (const l of layers) {
    if (l.kind === 'code' && l.src) {
      const S = pageSpecOf(l.src);
      if (S) return pictureOf(S);
    }
    if (l.kind === 'photo' && l.own) return { window: 'full', figures: [] };
  }
  return undefined;
}

/** The bands of the frame clear of every box: above, below, left and right of all of them together. */
export function bandsAround(boxes: Box[]): Box[] {
  if (!boxes.length) return [[0, 0, W, H]];
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[2]));
  const y1 = Math.max(...boxes.map((b) => b[3]));
  const bands: Box[] = [[0, 0, W, y0], [0, y1, W, H], [0, 0, x0, H], [x1, 0, W, H]];
  return bands.filter((b) => b[2] - b[0] > 2 * MARGIN && b[3] - b[1] > 2 * MARGIN);
}

/**
 * The quiet paper of a page: the bands clear of its window and figures. A whole-frame picture leaves only the third
 * the page keeps for the lyric (the side the line's shot sits on), and nothing when no side is known.
 */
export function quietBands(pic: StoryPicture, lyricSide?: 'left' | 'right'): Box[] {
  if (pic.window !== 'full') return bandsAround([pic.window, ...pic.figures]);
  if (lyricSide === 'left') return [[0, 0, W * THIRD, H]];
  if (lyricSide === 'right') return [[W * (1 - THIRD), 0, W, H]];
  return [];
}

/** The band an extent fits largest in and the transform laying it centred there, at `floor` of its size at least. */
export function fitIn(extent: Box, bands: Box[], floor = 0): Placement | undefined {
  const [ew, eh] = [extent[2] - extent[0], extent[3] - extent[1]];
  let best: Placement | undefined;
  for (const b of bands) {
    const [bw, bh] = [b[2] - b[0] - 2 * MARGIN, b[3] - b[1] - 2 * MARGIN];
    if (bw <= 0 || bh <= 0) continue;
    const s = Math.min(1, bw / ew, bh / eh);
    if (s < floor || (best && s <= best.s)) continue;
    best = { s, tx: (b[0] + b[2]) / 2 - (s * (extent[0] + extent[2])) / 2, ty: (b[1] + b[3]) / 2 - (s * (extent[1] + extent[3])) / 2 };
  }
  return best;
}

/**
 * Where a form drawn over `extent` goes on a page: on the paper clear of the window and the figures when it keeps
 * FLOOR of its size there; else clear of the figures only (over the window's picture, its inks picked for that
 * ground), unless the clear paper gives nearly as much. Never across a figure. Undefined is the form's own place.
 */
export function placeOnPage(extent: Box, pic: StoryPicture, lyricSide?: 'left' | 'right'): Placement | undefined {
  const clear = fitIn(extent, quietBands(pic, lyricSide));
  if (clear && clear.s >= FLOOR) return clear;
  const figures = pic.window === 'full' ? undefined : fitIn(extent, bandsAround(pic.figures));
  if (clear && (!figures || clear.s + 0.15 >= figures.s)) return clear;
  return figures;
}

export interface RowLayout { band: Box; rows: number; /** The most characters a row takes. */ cols: number; size: number }

/** Where a line may break: before and after each of its words by Intl.Segmenter (signature-moments.ts), in code points. */
export function wordBounds(chars: string[]): Set<number> {
  const text = chars.join('');
  const bounds = new Set<number>([0, chars.length]);
  for (const s of segmentsOf(text, scriptOf(text))) bounds.add(s.from).add(s.to);
  return bounds;
}

/**
 * How many characters each of `rows` rows takes, at most `cols` a row: the rows filled in turn, each ending at the
 * last word boundary it reaches (a space, or Intl.Segmenter's word: 「隠れ」 is never cut into 隠／れ) that leaves
 * the rest room in the rows left; undefined when no such break exists (the caller shrinks the row instead).
 */
export function rowLens(chars: string[], rows: number, cols: number): number[] | undefined {
  const n = chars.length;
  const bounds = wordBounds(chars);
  const lens: number[] = [];
  let i = 0;
  for (let r = 0; r < rows && i < n; r++) {
    const left = n - i;
    const rowsLeft = rows - r;
    if (left <= cols) {
      lens.push(left);
      break;
    }
    if (rowsLeft === 1) return undefined;
    let len = 0;
    for (let k = cols; k >= 1; k--) if (bounds.has(i + k) && left - k <= cols * (rowsLeft - 1)) { len = k; break; }
    if (!len) return undefined;
    lens.push(len);
    i += len;
  }
  return lens;
}

/**
 * A row form's rows on a page: the band, row count and character size that keep the characters biggest, each row
 * `rowK` sizes tall, breaking only between words (a long line wraps into the lyric's column rather than shrinking
 * across it; a line whose words do not fit the rows takes fewer or smaller ones). The open frame is one band: one
 * row at the form's own size, as before.
 */
export function rowsOnPage(chars: string[], size: number, rowK: number, bands: Box[], maxRows = 3): RowLayout | undefined {
  const n = chars.length;
  let best: RowLayout | undefined;
  for (const b of bands) {
    const [bw, bh] = [b[2] - b[0] - 2 * MARGIN, b[3] - b[1] - 2 * MARGIN];
    for (let rows = 1; rows <= Math.min(maxRows, n); rows++) {
      for (let cols = Math.ceil(n / rows); cols <= n; cols++) {
        const s = Math.min(size, bw / (cols * 1.04), bh / (rows * rowK));
        if (s <= 0 || (best && s <= best.size + 0.5)) break; // wider rows only get smaller
        if (rowLens(chars, rows, cols)) best = { band: b, rows, cols, size: s };
      }
    }
  }
  return best;
}

/** Each character's place in its rows: row r, column j, each row centred in the band (a space ending a row is not counted). */
export function rowPlaces(chars: string[], lay: RowLayout, rowK: number): { x: number; y: number }[] {
  const lens = rowLens(chars, lay.rows, lay.cols) ?? [chars.length];
  const cx = (lay.band[0] + lay.band[2]) / 2;
  const cy = (lay.band[1] + lay.band[3]) / 2;
  const out: { x: number; y: number }[] = [];
  let start = 0;
  lens.forEach((len, r) => {
    let seen = len;
    while (seen > 0 && /\s/.test(chars[start + seen - 1] ?? '')) seen--;
    for (let j = 0; j < len; j++) out.push({ x: cx + (j - (seen - 1) / 2) * lay.size * 1.04, y: cy + (r - (lens.length - 1) / 2) * rowK * lay.size });
    start += len;
  });
  return out;
}

/** A box moved and scaled by a placement. */
export const placedBox = (b: Box, p: Placement): Box => [p.tx + p.s * b[0], p.ty + p.s * b[1], p.tx + p.s * b[2], p.ty + p.s * b[3]];

/**
 * The story picture under a line and the side its lyric sits on, read from the treatment: the section its cue starts
 * in (the cue may start a hair before its section) and the shot the cue is laid in.
 */
export function pageUnder(treatment: { graphics?: { sections: { start: number; layers: { kind: string; src?: string; own?: boolean }[] }[] }; cues?: { cueId: string; shot: string }[]; shots?: { id: string; params?: Record<string, unknown> }[] }, cueId: string, start: number): { pic: StoryPicture; lyricSide?: 'left' | 'right' } | undefined {
  const secs = treatment.graphics?.sections ?? [];
  const sec = [...secs].reverse().find((s) => s.start <= start + 0.05);
  const pic = sec && storyPictureOf(sec.layers);
  if (!pic) return undefined;
  const shotId = treatment.cues?.find((c) => c.cueId === cueId)?.shot;
  const pos = treatment.shots?.find((s) => s.id === shotId)?.params?.['position'];
  return { pic, lyricSide: pos === 'left' || pos === 'right' ? pos : undefined };
}
