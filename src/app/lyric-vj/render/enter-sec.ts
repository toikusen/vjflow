// How long each line entrance takes to land, s × pace: numbers only, shared by the renderer (runtime.ts, text-fx.ts) and the
// plan's reading of show times (line-shows.ts, which runs where there is no DOM).
import { ARRIVAL_SEC } from './arrival';
import { CARRIER_SEC, SOFT_FLOAT_SEC } from './carrier-moves';
import type { EnterKind } from '../treatment';

/** slam, pop and wipe run over this many seconds × pace; a fade always takes FADE_SEC (it is not sped up). */
export const PACED_SEC = 0.32;
export const FADE_SEC = 0.3;

/**
 * Seconds from a glyph's start until it has landed (opaque, in place, within 5 % of its size), as it is drawn:
 * glyphMotion's entrances and text-fx's drawn ones (DRAWN; wipe is within 5 % of its slide at 0.21). The readable
 * estimates use this same table, so what is measured is what is shown.
 */
/** The drawn entrances' timing (text-fx.ts draws with these; enterSec reads them), in seconds × pace. */
export const DRAWN = {
  ink: { line: 0.28, fillFrom: 0.22, fill: 0.34 },
  /** One fold per this many seconds, through at most `faces` other characters. */
  flap: { fold: 0.07, faces: 6 },
  slot: { reel: 0.55, land: 0.25 },
  rise: { sec: 0.45 },
  focus: { sec: 0.6 },
  /** Random signs flicker through each place, this long each, before the character settles. */
  decode: { fold: 0.045, faces: 8 },
  slice: { sec: 0.4 },
  /** The slice at speed: the halves meet in five film frames. */
  rip: { sec: 0.21 },
  flip: { sec: 0.45 },
  stretch: { sec: 0.55 },
  /** The line's characters swap places and run home along small arcs (kittenjam 洗牌重排). */
  shuffle: { sec: 0.7 },
  /** Falls under gravity and bounces lower each time, squashing on each landing (Motion Prompt #123, MIT). */
  squash: { sec: 1.1 },
  /** Backs off and squashes to wind up, then shoots home and wobbles (Motion Prompt #121, MIT). */
  windup: { sec: 0.85 },
  /** The whole line waits faint while a ball hops from character to character as each is sung (kittenjam 卡拉OK小球). */
  karaoke: { sec: 0.25 },
  /** A few wide strips of the line slide home inside their own masks (band-clip.ts). */
  bandIn: { sec: 0.42 },
  /** The line waits unlit and its rows light from the top (glyph-state.ts). */
  matrixLight: { sec: 0.5 },
  /** Characters dropping into their cells (phrase-grid), and an answer settling beside what it answers. */
  cellLand: { sec: 0.32 },
  replyLand: { sec: 0.34 },
} as const;

export function enterSec(enter: EnterKind, pace: number): number {
  const paced: Record<EnterKind, number> = {
    cut: 0, fade: 0, slam: PACED_SEC, pop: PACED_SEC, wipe: 0.21,
    ink: DRAWN.ink.fillFrom + DRAWN.ink.fill, flap: DRAWN.flap.fold * DRAWN.flap.faces, slot: DRAWN.slot.reel + DRAWN.slot.land, rise: DRAWN.rise.sec, focus: DRAWN.focus.sec,
    decode: DRAWN.decode.fold * DRAWN.decode.faces, slice: DRAWN.slice.sec, rip: DRAWN.rip.sec, snapin: SNAPIN_SEC, flip: DRAWN.flip.sec, stretch: DRAWN.stretch.sec,
    shuffle: DRAWN.shuffle.sec, squash: DRAWN.squash.sec, windup: DRAWN.windup.sec, karaoke: DRAWN.karaoke.sec, 'band-in': DRAWN.bandIn.sec, 'matrix-light': DRAWN.matrixLight.sec, 'cell-land': DRAWN.cellLand.sec, 'reply-land': DRAWN.replyLand.sec, ...CARRIER_SEC, ...ARRIVAL_SEC, 'soft-float': SOFT_FLOAT_SEC, settle: PACED_SEC * MOTION_SEC.settle, flicker: PACED_SEC * MOTION_SEC.flicker,
    dash: PACED_SEC * MOTION_SEC.dash, drop: PACED_SEC * MOTION_SEC.drop, zoom: PACED_SEC * MOTION_SEC.zoom, gather: PACED_SEC * MOTION_SEC.gather, spin: PACED_SEC * MOTION_SEC.spin, prelight: PACED_SEC, spread: PACED_SEC * MOTION_SEC.spread, swing: PACED_SEC * MOTION_SEC.swing,
  };
  return enter === 'fade' ? FADE_SEC : paced[enter] * pace;
}

/** The motion entrances' length as a multiple of PACED_SEC (a drop needs room to bounce, a gather to travel). */
/** Arrives from larger, nearly there at once, and spends the rest settling: solid from the first frames. */
export const SNAPIN_SEC = 0.25;
export const MOTION_SEC = { dash: 0.8, drop: 1.5, zoom: 0.9, gather: 1.3, spin: 1.1, spread: 1.4, swing: 2.4, settle: 2.2, flicker: 1.6 } as const;
