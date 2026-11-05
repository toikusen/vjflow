// What a character is made of in style batch 4's cyanotype, isometric and cel80s worlds, redrawn from their boards
// (2026-11-05, 風格第4批設計稿). The letter itself is flat ink, its stroke where the face drew it. cel80s's title lettering
// is three layers laid under every letter of the line (world-layout `under`), each grown from the letter by an exact
// distance (world-glyph-loud `grown`): a tight indigo ring, a magenta ring outside it and the magenta shape again as a hard
// shadow down and right. No ring ever crosses a letter, no edge is blurred.
import type { HandCtx } from './world-glyph-hand';
import { grown } from './world-glyph-loud';
import { B4B } from './b4b-inks';

export type B4bSurface = 'cyan-type' | 'iso-type' | 'cel-type' | 'cel-sunset' | 'cel-inner' | 'cel-outer' | 'cel-drop';
const KINDS = new Set<string>(['cyan-type', 'iso-type', 'cel-type', 'cel-sunset', 'cel-inner', 'cel-outer', 'cel-drop']);
export const isB4bSurface = (k: string): k is B4bSurface => KINDS.has(k);

/** cel80s's rings, shares of the type size (board: inner 8 %, outer 20 %, the shadow 7 % down and right). */
export const CEL_RING = { inner: 0.08, outer: 0.2, drop: 0.07, close: 0.03 };
/** Where the eyecatch's three sunset bands change inside a letter, shares of the type size down from its centre line. */
export const CEL_BANDS = [0.06, 0.26];

export function b4bSurface(ctx: CanvasRenderingContext2D, kind: B4bSurface, h: HandCtx) {
  const { mask, tone, tint, core, px, cw, ch } = h;
  switch (kind) {
    case 'cyan-type':
    case 'iso-type':
    case 'cel-type': {
      ctx.drawImage(tone, 0, 0);
      break;
    }
    // the eyecatch title (board c): cream above, the yellow band, the peach band, hard edges, in the letter only
    case 'cel-sunset': {
      const t = new OffscreenCanvas(cw, ch);
      const g = t.getContext('2d')!;
      g.drawImage(mask, 0, 0);
      // (source-atop paints the bands into the letter only; source-in would clear each band's outside as it went)
      g.globalCompositeOperation = 'source-atop';
      const mid = ch / 2;
      const [a, b] = CEL_BANDS.map((k) => Math.round(mid + k * px));
      g.fillStyle = tint;
      g.fillRect(0, 0, cw, a);
      g.fillStyle = core;
      g.fillRect(0, a, cw, b - a);
      g.fillStyle = B4B.xFF9F7A;
      g.fillRect(0, b, cw, ch - b);
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'cel-inner': {
      ctx.drawImage(grown(mask, px * CEL_RING.inner, px * CEL_RING.close, tint), 0, 0);
      break;
    }
    case 'cel-outer': {
      ctx.drawImage(grown(mask, px * CEL_RING.outer, px * CEL_RING.close, tint), 0, 0);
      break;
    }
    case 'cel-drop': {
      const d = Math.round(px * CEL_RING.drop);
      ctx.drawImage(grown(mask, px * CEL_RING.outer, px * CEL_RING.close, tint), d, d);
      break;
    }
  }
}
