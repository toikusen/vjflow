// Lyric cover: how much of the lyric box a drawn picture hides, measured from the picture's opaque cells (24 × 24, once
// per picture) mapped through the draw transform — the same measure for a code layer's sprites (graphics.ts drawCode)
// and a kinetic cut's character (kinetic.ts). What it finds is reported as `code layer: lyric covered:` lines, which
// make.sh reads for its hold (> 40 %): the worst share of every picture is what reaches the log, not only its first
// crossing (a figure that came in at 9 % and grew to 60 % used to be on record as 9 %).

export interface CoverRect { x0: number; y0: number; x1: number; y1: number }

const COVER_GRID = 24;
/** A part of a picture drawn on its own (drawImage's source rectangle: one cell of a sprite sheet), px. */
export interface CoverCrop { sx: number; sy: number; sw: number; sh: number }
const masks = new Map<CanvasImageSource, Map<string, Uint8Array>>();
/** The opaque cells of the picture, or of the part of it that is drawn (`crop`): a sheet's other cells are not on screen. */
function maskOf(img: CanvasImageSource & { width: number; height: number }, crop?: CoverCrop) {
  const { sx, sy, sw, sh } = crop ?? { sx: 0, sy: 0, sw: img.width, sh: img.height };
  const key = `${sx},${sy},${sw},${sh}`;
  const per = masks.get(img) ?? (masks.set(img, new Map()), masks.get(img)!);
  let m = per.get(key);
  if (m) return m;
  m = new Uint8Array(COVER_GRID * COVER_GRID);
  try {
    const c = new OffscreenCanvas(COVER_GRID, COVER_GRID);
    const x = c.getContext('2d')!;
    x.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_GRID, COVER_GRID);
    const d = x.getImageData(0, 0, COVER_GRID, COVER_GRID).data;
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  } catch {
    m.fill(1);
  }
  per.set(key, m);
  return m;
}

/** Shares of the lyric box hidden by one picture draw, and of the picture inside the box (dest box in its transform). */
export function coverOf(img: CanvasImageSource & { width: number; height: number }, m: DOMMatrix, dx: number, dy: number, dw: number, dh: number, r: CoverRect, crop?: CoverCrop) {
  const mask = maskOf(img, crop);
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
  // a probe (engine.ts backdropAt: a line's backdrop sampled while the song is laid out) draws a picture before room is
  // made for it: not a frame anyone sees (every Tokyo Drift report, up to 103 %, came from them, 2026-11-02)
  if ((globalThis as { __vjProbe?: boolean }).__vjProbe) return undefined;
  const seen = worst.get(key);
  if (seen !== undefined && share < seen + STEP && !(seen <= HOLD_SHARE && share > HOLD_SHARE)) return undefined;
  worst.set(key, share);
  const line = `code layer: lyric covered: ${id} hides ${Math.round(share * 100)}% of the lyric box (${Math.round(inside * 100)}% of it inside) at ${t.toFixed(1)} s (${where})`;
  log(line);
  return line;
}

/** The share of a picture inside the lyric box at which it has faded out wholly (keepClear). */
export const CLEAR_FADE = 0.3;
/**
 * How strongly a picture that reaches into the lyric box is still drawn: whole when none of it is inside, fading as more
 * of it moves in, gone from CLEAR_FADE of it on. What is inside the box is never drawn at all (keepClear clips it out),
 * so a prop that drifts onto the line fades away over it instead of standing cut off on it.
 */
export const clearAlpha = (inside: number) => 1 - Math.min(1, Math.max(0, inside / CLEAR_FADE));

/** The line's weight (its box gliding in, 0..1) from which its box is kept clear, and from which it is kept wholly. */
export const CLEAR_FROM = 0.5;
export const CLEAR_FULL = 0.85;
/** How strongly the box is kept clear at the line's weight: none under CLEAR_FROM, wholly from CLEAR_FULL. */
export const clearStrength = (weight: number) => Math.min(1, Math.max(0, (weight - CLEAR_FROM) / (CLEAR_FULL - CLEAR_FROM)));

/**
 * Draws one picture of a director's own drawing so it never covers the lyric while the line is read (`strength` 1;
 * under 1, the box gliding in, it is only faded that much, not cut; `cut` false: faded only, as while the box glides
 * from one line's place to the next's and `box` is both): `hidden` and
 * `inside` are coverOf's shares for this draw. A picture clear of the box is drawn as it is; one reaching into it is
 * drawn without the box (`frame` is the canvas transform of frame px, the box is in frame px) and faded by clearAlpha.
 * Returns whether anything of it reached into the box.
 */
export function keepClear(ctx: CanvasRenderingContext2D, frame: DOMMatrix, box: CoverRect, hidden: number, inside: number, draw: () => void, w = 1920, h = 1080, strength = 1, cut = true): boolean {
  if (hidden <= 0 || strength <= 0) return draw(), false;
  // (while the line's box glides in, the fade comes in with it: a prop never blinks out as a line comes up)
  const alpha = 1 - Math.min(1, strength) * (1 - clearAlpha(inside));
  if (alpha <= 0) return true;
  ctx.save();
  try {
    ctx.globalAlpha *= alpha;
    if (strength < 1 || !cut) return draw(), true;
    // (its own path: the drawing's current path, which save/restore does not keep, is left as the drawing built it)
    const now = ctx.getTransform();
    ctx.setTransform(frame);
    const hole = new Path2D();
    hole.rect(0, 0, w, h);
    hole.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.clip(hole, 'evenodd');
    ctx.setTransform(now);
    draw();
  } finally {
    ctx.restore();
  }
  return true;
}

/** The page's tally of sprite draws kept off a read lyric (keepClear reaching into the box): render.mts adds it to metrics.json. */
export interface ClearTally { draws: number; cut: number; faded: number }
export const clearTally = (): ClearTally => ((globalThis as { vjKeepClear?: ClearTally }).vjKeepClear ??= { draws: 0, cut: 0, faded: 0 });
const clearWorst = new Map<string, number>();
/** How much more of a picture must be inside the box before the same picture at the same place is reported again. */
const CLEAR_STEP = 0.1;

/**
 * Records a sprite draw that keepClear had to keep off the lyric (`cut`: the box clipped out and faded; else faded only).
 * Each one is counted; the log gets a `code layer: lyric kept clear:` line once per picture and place, and again when more
 * of it is inside. keepClear is the last resort: a prop the drawing placed under a line vanishes while it is read
 * (世界のつづき's lighthouse under 「信じられるかい？」), so codelayer.mts hands these lines back to the director to place it
 * in the shot's room (f.room / f.fit). Returns the line it reported, or undefined.
 */
export function watchClear(key: string, id: string, inside: number, t: number, where: string, cut: boolean, log: (line: string) => void = (x) => console.error(x)): string | undefined {
  if ((globalThis as { __vjProbe?: boolean }).__vjProbe) return undefined;
  const tally = clearTally();
  tally.draws++;
  if (cut) tally.cut++;
  else tally.faded++;
  const seen = clearWorst.get(key);
  if (seen !== undefined && inside < seen + CLEAR_STEP) return undefined;
  clearWorst.set(key, inside);
  const line = `code layer: lyric kept clear: ${id} ${Math.round(inside * 100)}% inside the lyric box, ${cut ? 'cut out and faded' : 'faded'} at ${t.toFixed(1)} s (${where})`;
  log(line);
  return line;
}

/** For tests: forget what was reported. */
export const resetCover = () => {
  worst.clear();
  clearWorst.clear();
  delete (globalThis as { vjKeepClear?: ClearTally }).vjKeepClear;
};

/**
 * When a line laid on a page shows: with the page's cut when that falls inside the line's lead, else as planned.
 * `pages` are the starts of the sections that carry a picture (a cut-out page, a director's drawing, a painted
 * frame). Ahead of its cut the line stood on the page before, whose figures were placed clear of another line (世界の
 * つづき: h_stop hid 44 % of 「信じてみる」 for the 0.2 s before its page came, 2026-11-03).
 */
export function pageCutBefore(pages: number[], show: number, start: number): number {
  const cut = pages.filter((p) => p > show && p <= start + 1e-3);
  return cut.length ? Math.min(start, Math.max(...cut)) : show;
}
