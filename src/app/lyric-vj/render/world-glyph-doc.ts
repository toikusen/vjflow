// What a character is made of in the document world (感熱收據, boards 2026-11-05): a thermal print head's dots. The
// character is laid on the head's dot grid (HEAD_DOTS cells to the type size) and each cell the stroke covers is printed as
// a round dot of radius DOT_R × the pitch, so neighbouring dots fuse into a solid stroke and the dots only show at a
// stroke's edge and as a fine mesh inside it: texture, never a cost to reading. The boards checked the floor character by
// character: at 32 cells a bold Han's strokes merged (雙's 又, 麼's 么, receipt.html:22); 48 cells kept every stroke apart
// in Noto Sans TC 700 and 40 did in Noto Sans JP 500, so the head is never coarser than 48.
import type { HandCtx } from './world-glyph-hand';

export type DocSurface = 'thermal';
/**
 * Surfaces that redraw a character on a print head's grid: what shows is the head's dots, never the face's own drawing,
 * so a world drawn in one does not use up its face's share of worlds (free-styles.spec.ts, the font table).
 */
export const FACELESS_SURFACES = new Set<string>(['thermal']);
export const isDocSurface = (k: string): k is DocSurface => k === 'thermal';

/** Cells across one type size: the board's 48-dot head (never fewer: strokes merge under it). */
export const HEAD_DOTS = 48;
/** A dot's radius, a share of the pitch: adjacent dots overlap (2 × 0.66 > 1), so a stroke prints solid. */
export const DOT_R = 0.66;
/** A cell is printed when the stroke covers this share of it (the board's alpha 120 of 255). */
export const DOT_CUT = 120 / 255;

/** The cells a mask's strokes cover on a grid of pitch `p` px: 1 printed, 0 bare. */
export function headCells(alpha: Uint8ClampedArray, w: number, h: number, p: number): { cols: number; rows: number; on: Uint8Array } {
  const [cols, rows] = [Math.max(1, Math.floor(w / p)), Math.max(1, Math.floor(h / p))];
  const on = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      for (let v = 0; v < 3; v++)
        for (let u = 0; u < 3; u++) {
          const x = Math.min(w - 1, Math.floor((i + (u + 0.5) / 3) * p));
          const y = Math.min(h - 1, Math.floor((j + (v + 0.5) / 3) * p));
          sum += alpha[(y * w + x) * 4 + 3];
        }
      on[j * cols + i] = sum / (9 * 255) > DOT_CUT ? 1 : 0;
    }
  return { cols, rows, on };
}

export function docSurface(ctx: CanvasRenderingContext2D, _kind: DocSurface, h: HandCtx) {
  const { mask, tint, px, cw, ch } = h;
  const p = px / HEAD_DOTS;
  const { cols, rows, on } = headCells(mask.getContext('2d')!.getImageData(0, 0, cw, ch).data, cw, ch, p);
  const r = p * DOT_R;
  ctx.fillStyle = tint;
  ctx.beginPath();
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!on[j * cols + i]) continue;
      const [x, y] = [(i + 0.5) * p, (j + 0.5) * p];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  ctx.fill();
}
