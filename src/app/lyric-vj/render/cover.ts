// Lyric cover: how much of the lyric box a drawn picture hides, measured from the picture's opaque cells (24 × 24, once
// per picture) mapped through the draw transform — the same measure for a code layer's sprites (graphics.ts drawCode)
// and a kinetic cut's character (kinetic.ts). What it finds is reported as `code layer: lyric covered:` lines, which
// make.sh reads for its hold (> 40 %): the worst share of every picture is what reaches the log, not only its first
// crossing (a figure that came in at 9 % and grew to 60 % used to be on record as 9 %).

export interface CoverRect { x0: number; y0: number; x1: number; y1: number }

const COVER_GRID = 24;
const masks = new Map<CanvasImageSource, Uint8Array>();
function maskOf(img: CanvasImageSource & { width: number; height: number }) {
  let m = masks.get(img);
  if (m) return m;
  m = new Uint8Array(COVER_GRID * COVER_GRID);
  try {
    const c = new OffscreenCanvas(COVER_GRID, COVER_GRID);
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, COVER_GRID, COVER_GRID);
    const d = x.getImageData(0, 0, COVER_GRID, COVER_GRID).data;
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  } catch {
    m.fill(1);
  }
  masks.set(img, m);
  return m;
}

/** Shares of the lyric box hidden by one picture draw, and of the picture inside the box (dest box in its transform). */
export function coverOf(img: CanvasImageSource & { width: number; height: number }, m: DOMMatrix, dx: number, dy: number, dw: number, dh: number, r: CoverRect) {
  const mask = maskOf(img);
  const cell = (Math.abs(m.a * m.d - m.b * m.c) * dw * dh) / (COVER_GRID * COVER_GRID);
  let hidden = 0;
  let solid = 0;
  for (let j = 0; j < COVER_GRID; j++)
    for (let i = 0; i < COVER_GRID; i++) {
      if (!mask[j * COVER_GRID + i]) continue;
      solid += cell;
      const lx = dx + ((i + 0.5) / COVER_GRID) * dw;
      const ly = dy + ((j + 0.5) / COVER_GRID) * dh;
      const x = m.a * lx + m.c * ly + m.e;
      const y = m.b * lx + m.d * ly + m.f;
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) hidden += cell;
    }
  return [hidden / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0)), hidden / Math.max(1, solid)] as const;
}

/** A big picture across the lyric, or a small one sitting on its words. */
export const covers = (share: number, inside: number) => share > 0.08 || (inside > 0.5 && share > 0.015);
/** The worst share reported so far per picture-and-place key (the render's one page keeps it for the whole render). */
const worst = new Map<string, number>();
const STEP = 0.02;
/** The share make.sh holds a video at (> 40 %): a picture crossing it is always reported, whatever the step. */
export const HOLD_SHARE = 0.4;

/**
 * Reports a picture hiding the lyric: once when it first covers, then again each time its share has grown by another
 * 2 % or crosses the hold line (so the log's maximum is the picture's maximum, to a step, and never reads under the
 * hold line when the picture went over it). `key` is the picture at its place (sprite id and the shot or cut);
 * `where` names that place in the line. Returns the line it reported, or undefined.
 */
export function watchCover(key: string, id: string, share: number, inside: number, t: number, where: string, log: (line: string) => void = (x) => console.error(x)): string | undefined {
  if (!covers(share, inside)) return undefined;
  const seen = worst.get(key);
  if (seen !== undefined && share < seen + STEP && !(seen <= HOLD_SHARE && share > HOLD_SHARE)) return undefined;
  worst.set(key, share);
  const line = `code layer: lyric covered: ${id} hides ${Math.round(share * 100)}% of the lyric box (${Math.round(inside * 100)}% of it inside) at ${t.toFixed(1)} s (${where})`;
  log(line);
  return line;
}

/** For tests: forget what was reported. */
export const resetCover = () => worst.clear();
