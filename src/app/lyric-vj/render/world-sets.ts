// A style world's own layouts, as numbers: where a line stands, how wide it may run, how big it may go, what object carries
// it. One renderer sets them all (world-layout.ts). A set belongs to one world: its id starts with that world's id, and the
// composer's closed pool is the only way to reach it.
import { balancedRows } from '../phrases';
import { LOUD_SETS } from './world-b3-sets';
import { R2_SETS } from './world-r2-sets';
import type { Slots, WorldObject } from './world-objects';
import type { SurfaceKind } from './world-glyph';
import { RowBox, splitBlock, SplitSpec } from './world-split';

const W = 1920;
const H = 1080;
const SAFE_X = 64;
const SAFE_Y = 48;

export interface SetSpec {
  /** The anchor in frame fractions, y down. */
  at: [number, number];
  /** Which side of the block sits on the anchor: -1 left or top, 0 centre, 1 right or bottom. */
  ax: -1 | 0 | 1;
  ay: -1 | 0 | 1;
  /** Widest row, share of the frame width; height limit, share of the frame height. */
  share: number;
  tall: number;
  /** Largest and smallest type, px. */
  hi: number;
  lo: number;
  rows: [number, number];
  lead: number;
  /** Extra space between characters, in ems. */
  track: number;
  vertical?: boolean;
  /** Radians, the block's whole lean. */
  tilt?: number;
  /** Every character one cell, for worlds drawn on a grid. */
  even?: boolean;
  weight?: number;
  /** Rows align to this side inside the block: -1 start, 0 centre, 1 end. */
  flush?: -1 | 0 | 1;
  /** Each row steps this share of a size further along. */
  stair?: number;
  object?: WorldObject;
  /** Object margin round the words, px at 1080p. */
  pad?: [number, number];
  /** The least the object spans, shares of the frame: small lines still get the whole object. */
  fill?: [number, number];
  /** This set's own surface and inks, slot names, where a world sets one kind of line unlike the rest (a comic's sound effect). */
  surface?: SurfaceKind;
  ink?: keyof Slots;
  core?: keyof Slots;
  /** Surfaces laid under the letters, outermost first, each in a slot's tone: rings that must never cross a letter. */
  under?: { kind: SurfaceKind; tone: keyof Slots }[];
  /** Each row's ink, a slot a row (the last repeats): a second row the board sets apart (a file's entry in stamp red). */
  rowInk?: (keyof Slots)[];
  /** Each row stands on a carrier of its own (a pair of cards, a window's inscription panes): the rows are kept, no key word is blown up out of them. */
  keepRows?: boolean;
  /** Laid into its ground's composition: no travel or swell while it is up. */
  fixed?: boolean;
  /** What the words stand on when the set's own page draws it (a card, a banner, two banners): the key ink reads on each. */
  on?: (keyof Slots)[];
  /** The slot the key words start from, when not the accent (an accent banner under the words). */
  key?: keyof Slots;
  /** One line in two sizes or two containers, at a space the lyric has (world-split.ts). */
  split?: SplitSpec;
}

export interface Block {
  rows: string[];
  size: number;
  /** The block's width and height, px. */
  w: number;
  h: number;
  /** The block's centre, frame px, y up, origin at the frame's centre. */
  cx: number;
  cy: number;
  /** A split line's rows, each its own size and place (world-split.ts); the rows that are its small part; the hero's box. */
  lines?: RowBox[];
  small?: number[];
  hero?: { cx: number; cy: number; w: number; h: number };
}

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };

export const SET_SPECS: Record<string, SetSpec> = {
  // dark-glitch: a late-night transcript. Paper tape in the dark, words at the edge of hearing.
  'dark-glitch/tape': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.88, tall: 0.56, hi: 230, rows: [1, 2], track: 0.04, object: 'transcript-tape', pad: [70, 44], fill: [0.98, 0.42], tilt: -0.016, flush: -1 },
  'dark-glitch/tape-low': { ...base, at: [0.05, 0.74], ax: -1, ay: 0, share: 0.86, tall: 0.4, hi: 170, rows: [1, 2], track: 0.04, object: 'transcript-tape', pad: [60, 34], fill: [0.96, 0.3], tilt: 0.012, flush: -1 },
  'dark-glitch/dead-air': { ...base, at: [0.5, 0.74], ax: 0, ay: 0, share: 0.5, tall: 0.24, hi: 96, lo: 70, rows: [1, 2], track: 0.16 },
  'dark-glitch/overheard': { ...base, at: [0.05, 0.1], ax: -1, ay: -1, share: 0.9, tall: 0.8, hi: 300, rows: [1, 3], track: 0, flush: -1 },
  'dark-glitch/margin': { ...base, at: [0.86, 0.06], ax: 0, ay: -1, share: 0.42, tall: 0.88, hi: 190, rows: [1, 3], vertical: true, lead: 1.26, track: 0.04 },
  'dark-glitch/far-apart': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.92, tall: 0.9, hi: 250, rows: [2, 2], lead: 3, track: 0.02, flush: -1, stair: 3 },
  'dark-glitch/whole-wall': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.96, tall: 0.9, hi: 420, rows: [1, 2], lead: 1.04, track: -0.01 },
  'dark-glitch/tape-column': { ...base, at: [0.1, 0.5], ax: 0, ay: 0, share: 0.2, tall: 0.9, hi: 180, rows: [1, 1], vertical: true, lead: 1.2, track: 0.03, object: 'transcript-tape', pad: [34, 30], fill: [0.2, 1.05] },
  // neon-stage: bent glass on a wall, a box with a transformer behind it.
  'neon-stage/sign-box': { ...base, at: [0.5, 0.48], ax: 0, ay: 0, share: 0.8, tall: 0.62, hi: 300, rows: [1, 2], track: 0.06, object: 'sign-box', pad: [80, 60], fill: [0.92, 0.74] },
  'neon-stage/blade': { ...base, at: [0.82, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.86, hi: 220, rows: [1, 2], vertical: true, lead: 1.2, track: 0.04, object: 'sign-blade', pad: [44, 44], fill: [0.28, 0.96] },
  'neon-stage/roofline': { ...base, at: [0.5, 0.26], ax: 0, ay: 0, share: 0.92, tall: 0.5, hi: 340, rows: [1, 2], track: 0.04 },
  'neon-stage/script-low': { ...base, at: [0.05, 0.7], ax: -1, ay: 0, share: 0.86, tall: 0.5, hi: 230, rows: [1, 2], track: 0.04, flush: -1, tilt: -0.05 },
  'neon-stage/doorway': { ...base, at: [0.2, 0.5], ax: 0, ay: 0, share: 0.38, tall: 0.9, hi: 210, rows: [1, 3], vertical: true, lead: 1.22, track: 0.03 },
  'neon-stage/corner-sign': { ...base, at: [0.97, 0.94], ax: 1, ay: 1, share: 0.6, tall: 0.5, hi: 200, rows: [1, 3], lead: 1.1, track: 0.04, object: 'sign-box', pad: [60, 44], fill: [0.66, 0.56], flush: 1 },
  'neon-stage/low-marquee': { ...base, at: [0.5, 0.8], ax: 0, ay: 0, share: 0.94, tall: 0.3, hi: 210, rows: [1, 1], track: 0.03, object: 'sign-box', pad: [50, 34], fill: [0.98, 0.34] },
  // terminal: a session. Everything starts at a margin, one cell wide, flush left, and the pane is the screen.
  'terminal/session': { ...base, at: [0.06, 0.13], ax: -1, ay: -1, share: 0.84, tall: 0.74, hi: 250, rows: [1, 3], lead: 1.36, track: 0.08, even: true, flush: -1 },
  'terminal/prompt': { ...base, at: [0.05, 0.88], ax: -1, ay: 1, share: 0.86, tall: 0.46, hi: 220, rows: [1, 2], lead: 1.36, track: 0.08, even: true, flush: -1 },
  'terminal/split-right': { ...base, at: [0.5, 0.5], ax: -1, ay: 0, share: 0.46, tall: 0.86, hi: 210, rows: [2, 4], lead: 1.36, track: 0.08, even: true, flush: -1 },
  'terminal/split-left': { ...base, at: [0.04, 0.5], ax: -1, ay: 0, share: 0.46, tall: 0.86, hi: 210, rows: [2, 4], lead: 1.36, track: 0.08, even: true, flush: -1 },
  'terminal/window-title': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.8, tall: 0.5, hi: 170, rows: [1, 2], lead: 1.36, track: 0.08, even: true, object: 'tty-pane', pad: [80, 70], fill: [0.86, 0.66] },
  'terminal/banner': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.76, hi: 300, rows: [1, 2], lead: 1.36, track: 0.08, even: true },
  // led-board: modules bolted together: a strip, a two-row sign, a pillar, a wall.
  'led-board/ticker': { ...base, at: [0.5, 0.22], ax: 0, ay: 0, share: 0.94, tall: 0.34, hi: 240, rows: [1, 1], track: 0.02, object: 'led-strip', pad: [40, 22], fill: [0.99, 0.38] },
  'led-board/ticker-low': { ...base, at: [0.5, 0.78], ax: 0, ay: 0, share: 0.94, tall: 0.34, hi: 240, rows: [1, 1], track: 0.02, object: 'led-strip', pad: [40, 22], fill: [0.99, 0.38] },
  'led-board/two-row': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.88, tall: 0.74, hi: 290, rows: [2, 2], lead: 1.1, track: 0.02, object: 'led-module', pad: [46, 34], fill: [0.9, 0.62] },
  'led-board/pillar': { ...base, at: [0.14, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.9, hi: 230, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02, object: 'led-pillar', pad: [28, 34], fill: [0.28, 0.98] },
  'led-board/wall': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.94, tall: 0.86, hi: 420, rows: [1, 2], lead: 1.06, track: 0.01 },
  'led-board/corner-module': { ...base, at: [0.97, 0.94], ax: 1, ay: 1, share: 0.56, tall: 0.46, hi: 190, rows: [1, 3], lead: 1.1, track: 0.02, object: 'led-module', pad: [34, 24], fill: [0.62, 0.52] },
  'led-board/stair-rows': { ...base, at: [0.04, 0.1], ax: -1, ay: -1, share: 0.92, tall: 0.8, hi: 250, rows: [2, 3], lead: 1.16, track: 0.02, flush: -1, stair: 1.1 },
  'led-board/banner-top': { ...base, at: [0.5, 0.14], ax: 0, ay: 0, share: 0.96, tall: 0.26, hi: 210, rows: [1, 1], track: 0.01 },
  'led-board/mid-band': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.96, tall: 0.34, hi: 230, rows: [1, 1], track: 0.01, object: 'led-strip', pad: [30, 26], fill: [1.1, 0.4] },
  // ink-wash: columns fall from the top, the void is half the picture, but the stroke is big.
  'ink-wash/hanging': { ...base, at: [0.8, 0.06], ax: 0, ay: -1, share: 0.42, tall: 0.88, hi: 270, rows: [1, 3], vertical: true, lead: 1.32, track: 0.05 },
  'ink-wash/pair-falling': { ...base, at: [0.3, 0.06], ax: 0, ay: -1, share: 0.5, tall: 0.86, hi: 220, rows: [2, 3], vertical: true, lead: 1.4, track: 0.06, stair: 0.7 },
  'ink-wash/stroke': { ...base, at: [0.5, 0.52], ax: 0, ay: 0, share: 0.82, tall: 0.56, hi: 250, rows: [1, 2], track: 0.08, object: 'ink-stroke', pad: [120, 60], fill: [0.98, 0.7] },
  'ink-wash/corner': { ...base, at: [0.94, 0.9], ax: 1, ay: 1, share: 0.56, tall: 0.34, hi: 130, lo: 70, rows: [1, 2], track: 0.12, flush: 1 },
  'ink-wash/breath': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.82, tall: 0.76, hi: 190, rows: [1, 2], track: 0.1 },
  'ink-wash/margin-left': { ...base, at: [0.14, 0.06], ax: 0, ay: -1, share: 0.3, tall: 0.86, hi: 220, rows: [1, 2], vertical: true, lead: 1.36, track: 0.08 },
  // silent-film: everything is a card, or what an iris leaves.
  'silent-film/card': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.72, tall: 0.62, hi: 250, rows: [1, 3], lead: 1.22, track: 0.04, object: 'title-card', pad: [120, 100], fill: [0.9, 0.86] },
  'silent-film/iris': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.6, tall: 0.56, hi: 230, rows: [1, 3], lead: 1.2, track: 0.04 },
  'silent-film/subtitle-band': { ...base, at: [0.5, 0.78], ax: 0, ay: 0, share: 0.86, tall: 0.34, hi: 180, rows: [1, 2], lead: 1.16, track: 0.06, object: 'caption-band', pad: [60, 26], fill: [1.1, 0.38] },
  'silent-film/shout': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.92, tall: 0.84, hi: 400, rows: [1, 2], lead: 1.06, track: 0.01 },
  'silent-film/aside': { ...base, at: [0.06, 0.1], ax: -1, ay: -1, share: 0.66, tall: 0.52, hi: 180, rows: [1, 2], lead: 1.2, track: 0.05, flush: -1, object: 'card-corner', pad: [40, 34], fill: [0.74, 0.6] },
  // gothic-lolita: a bound book, a page at a time.
  'gothic-lolita/page': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.6, tall: 0.72, hi: 220, rows: [1, 4], lead: 1.24, track: 0.03, object: 'book-page', pad: [100, 84], fill: [0.5, 0.84] },
  'gothic-lolita/spread-left': { ...base, at: [0.265, 0.5], ax: 0, ay: 0, share: 0.38, tall: 0.72, hi: 180, rows: [2, 4], lead: 1.26, track: 0.03, flush: -1, object: 'book-leaf', pad: [80, 90], fill: [0.46, 0.9] },
  'gothic-lolita/spread-right': { ...base, at: [0.735, 0.5], ax: 0, ay: 0, share: 0.38, tall: 0.72, hi: 180, rows: [2, 4], lead: 1.26, track: 0.03, flush: -1, object: 'book-leaf', pad: [80, 90], fill: [0.46, 0.9] },
  'gothic-lolita/cameo': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.52, tall: 0.56, hi: 190, rows: [1, 3], lead: 1.2, track: 0.03, object: 'cameo', pad: [150, 130], fill: [0.74, 0.94] },
  'gothic-lolita/title-leaf': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.8, hi: 340, rows: [1, 2], lead: 1.1, track: 0.02 },
  // ukiyoe: the words stand on a title slip, a poem card, or the mist band the print parts for them.
  'ukiyoe/tanzaku': { ...base, at: [0.88, 0.4], ax: 0, ay: 0, share: 0.22, tall: 0.68, hi: 230, rows: [1, 2], vertical: true, lead: 1.14, track: 0.04, object: 'cartouche', pad: [50, 56], fill: [0.2, 0.92] },
  'ukiyoe/tanzaku-left': { ...base, at: [0.12, 0.4], ax: 0, ay: 0, share: 0.22, tall: 0.68, hi: 230, rows: [1, 2], vertical: true, lead: 1.14, track: 0.04, object: 'cartouche', pad: [50, 56], fill: [0.2, 0.92] },
  'ukiyoe/sky-title': { ...base, at: [0.5, 0.26], ax: 0, ay: 0, share: 0.86, tall: 0.42, hi: 300, rows: [1, 2], lead: 1.12, track: 0.03 },
  'ukiyoe/horizon': { ...base, at: [0.5, 0.4], ax: 0, ay: 0, share: 0.88, tall: 0.3, hi: 240, rows: [1, 2], lead: 1.12, track: 0.03 },
  'ukiyoe/shikishi': { ...base, at: [0.5, 0.36], ax: 0, ay: 0, share: 0.56, tall: 0.5, hi: 240, rows: [1, 3], lead: 1.2, track: 0.04, object: 'shikishi', pad: [90, 84], fill: [0.66, 0.8], tilt: -0.03 },
  'ukiyoe/hanging-pair': { ...base, at: [0.2, 0.42], ax: 0, ay: 0, share: 0.4, tall: 0.7, hi: 220, rows: [2, 3], vertical: true, lead: 1.26, track: 0.04, object: 'cartouche', pad: [56, 56], fill: [0.3, 0.92] },
  'ukiyoe/great-word': { ...base, at: [0.5, 0.36], ax: 0, ay: 0, share: 0.86, tall: 0.56, hi: 380, rows: [1, 2], lead: 1.08, track: 0.01, object: 'cartouche', pad: [84, 70], fill: [0.96, 0.82] },
  'ukiyoe/low-slip': { ...base, at: [0.5, 0.6], ax: 0, ay: 0, share: 0.8, tall: 0.22, hi: 200, rows: [1, 2], lead: 1.1, track: 0.03, object: 'cartouche', pad: [70, 48] },
  'ukiyoe/corner-card': { ...base, at: [0.95, 0.12], ax: 1, ay: -1, share: 0.5, tall: 0.42, hi: 190, rows: [1, 2], lead: 1.14, track: 0.03, object: 'shikishi', pad: [60, 50], tilt: 0.02, flush: 1 },
  // papercut: words cut through a panel of the sheet, or through the uncut part the lattice leaves them.
  'papercut/panel': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.5, hi: 250, rows: [1, 2], lead: 1.12, track: 0.03, object: 'cut-panel', pad: [64, 48] },
  'papercut/low-panel': { ...base, at: [0.5, 0.74], ax: 0, ay: 0, share: 0.76, tall: 0.34, hi: 210, rows: [1, 2], lead: 1.1, track: 0.03, object: 'cut-panel', pad: [60, 44] },
  'papercut/banner-right': { ...base, at: [0.84, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.84, hi: 240, rows: [1, 2], vertical: true, lead: 1.14, track: 0.03, object: 'cut-banner', pad: [50, 64], fill: [0.24, 1] },
  'papercut/banner-left': { ...base, at: [0.16, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.84, hi: 240, rows: [1, 2], vertical: true, lead: 1.14, track: 0.03, object: 'cut-banner', pad: [50, 64], fill: [0.24, 1] },
  'papercut/free-top': { ...base, at: [0.5, 0.3], ax: 0, ay: 0, share: 0.74, tall: 0.4, hi: 240, rows: [1, 2], lead: 1.12, track: 0.03 },
  'papercut/free-corner': { ...base, at: [0.94, 0.88], ax: 1, ay: 1, share: 0.66, tall: 0.46, hi: 220, rows: [1, 2], lead: 1.12, track: 0.03, flush: 1 },
  'papercut/shout': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.76, tall: 0.6, hi: 320, rows: [1, 2], lead: 1.06, track: 0.01 },
  // paper-lantern: dark words on the lit sheet at the back; the nearer sheets drop below them.
  'paper-lantern/heart': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.56, tall: 0.42, hi: 270, rows: [1, 2], lead: 1.14, track: 0.03 },
  'paper-lantern/high': { ...base, at: [0.5, 0.44], ax: 0, ay: 0, share: 0.5, tall: 0.34, hi: 220, rows: [1, 2], lead: 1.14, track: 0.03 },
  'paper-lantern/offset': { ...base, at: [0.3, 0.52], ax: -1, ay: 0, share: 0.46, tall: 0.4, hi: 210, rows: [1, 2], lead: 1.16, track: 0.03, flush: -1 },
  'paper-lantern/offset-right': { ...base, at: [0.7, 0.52], ax: 1, ay: 0, share: 0.46, tall: 0.4, hi: 210, rows: [1, 2], lead: 1.16, track: 0.03, flush: 1 },
  'paper-lantern/window': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.28, tall: 0.64, hi: 200, rows: [1, 2], vertical: true, lead: 1.16, track: 0.04, object: 'lit-paper', pad: [60, 64], fill: [0.3, 0.92] },
  'paper-lantern/plate': { ...base, at: [0.5, 0.52], ax: 0, ay: 0, share: 0.6, tall: 0.46, hi: 260, rows: [1, 2], lead: 1.14, track: 0.03, object: 'lit-paper', pad: [90, 70], fill: [0.82, 0.66] },
  'paper-lantern/call': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.5, hi: 340, rows: [1, 2], lead: 1.08, track: 0.01 },
  // chiyogami: a plain band wrapped across the printed sheet, a folded strip, a paper tag.
  'chiyogami/obi': { ...base, at: [0.05, 0.66], ax: -1, ay: 0, share: 0.72, tall: 0.4, hi: 270, rows: [1, 2], lead: 1.12, track: 0.03, flush: -1, tilt: -0.06 },
  'chiyogami/obi-high': { ...base, at: [0.96, 0.24], ax: 1, ay: 0, share: 0.68, tall: 0.32, hi: 230, rows: [1, 2], lead: 1.1, track: 0.03, flush: 1, tilt: 0.05 },
  'chiyogami/obi-low': { ...base, at: [0.05, 0.84], ax: -1, ay: 0, share: 0.72, tall: 0.34, hi: 230, rows: [1, 2], lead: 1.1, track: 0.03, flush: -1, tilt: -0.04 },
  'chiyogami/noshi': { ...base, at: [0.72, 0.58], ax: 0, ay: 0, share: 0.28, tall: 0.66, hi: 220, rows: [1, 2], vertical: true, lead: 1.14, track: 0.03, object: 'noshi', pad: [50, 120], fill: [0.22, 0.98], tilt: 0.08 },
  'chiyogami/noshi-left': { ...base, at: [0.28, 0.42], ax: 0, ay: 0, share: 0.28, tall: 0.66, hi: 220, rows: [1, 2], vertical: true, lead: 1.14, track: 0.03, object: 'noshi', pad: [50, 120], fill: [0.22, 0.98], tilt: -0.08 },
  'chiyogami/tag': { ...base, at: [0.64, 0.6], ax: 0, ay: 0, share: 0.52, tall: 0.56, hi: 230, rows: [1, 3], lead: 1.14, track: 0.03, object: 'fold-kite', pad: [130, 110], fill: [0.62, 0.8], tilt: 0.08 },
  'chiyogami/shout': { ...base, at: [0.42, 0.58], ax: 0, ay: 0, share: 0.84, tall: 0.62, hi: 400, rows: [1, 2], lead: 1.06, track: 0.01, tilt: -0.05 },
  // woodcut: words cut out of the part of the block left whole, or printed on the second colour.
  'woodcut/center': { ...base, at: [0.5, 0.72], ax: 0, ay: 0, share: 0.76, tall: 0.44, hi: 300, rows: [1, 2], lead: 1.1, track: 0.02, tilt: -0.03 },
  'woodcut/left-stack': { ...base, at: [0.06, 0.68], ax: -1, ay: 0, share: 0.6, tall: 0.54, hi: 250, rows: [1, 3], lead: 1.1, track: 0.02, flush: -1 },
  'woodcut/right-stack': { ...base, at: [0.94, 0.68], ax: 1, ay: 0, share: 0.6, tall: 0.54, hi: 250, rows: [1, 3], lead: 1.1, track: 0.02, flush: 1 },
  'woodcut/foot': { ...base, at: [0.5, 0.84], ax: 0, ay: 0, share: 0.84, tall: 0.3, hi: 220, rows: [1, 2], lead: 1.08, track: 0.02 },
  'woodcut/column': { ...base, at: [0.88, 0.58], ax: 0, ay: 0, share: 0.3, tall: 0.76, hi: 230, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02 },
  'woodcut/plate': { ...base, at: [0.5, 0.7], ax: 0, ay: 0, share: 0.72, tall: 0.46, hi: 280, rows: [1, 2], lead: 1.1, track: 0.02, object: 'colour-plate', pad: [90, 70] },
  'woodcut/shout': { ...base, at: [0.5, 0.64], ax: 0, ay: 0, share: 0.94, tall: 0.7, hi: 400, rows: [1, 2], lead: 1.04, track: 0 },
  // aizome: resist on the cloth, or a mended patch and a towel laid on it.
  'aizome/field': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.78, tall: 0.54, hi: 270, rows: [1, 2], lead: 1.16, track: 0.04 },
  'aizome/hem': { ...base, at: [0.5, 0.78], ax: 0, ay: 0, share: 0.86, tall: 0.32, hi: 210, rows: [1, 2], lead: 1.12, track: 0.04 },
  'aizome/yoke': { ...base, at: [0.5, 0.22], ax: 0, ay: 0, share: 0.86, tall: 0.32, hi: 210, rows: [1, 2], lead: 1.12, track: 0.04 },
  'aizome/hanging': { ...base, at: [0.82, 0.5], ax: 0, ay: 0, share: 0.32, tall: 0.84, hi: 220, rows: [1, 2], vertical: true, lead: 1.2, track: 0.06 },
  'aizome/hanging-left': { ...base, at: [0.18, 0.5], ax: 0, ay: 0, share: 0.32, tall: 0.84, hi: 220, rows: [1, 2], vertical: true, lead: 1.2, track: 0.06 },
  'aizome/patch': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.5, hi: 250, rows: [1, 2], lead: 1.14, track: 0.04, object: 'mend-patch', pad: [100, 80], tilt: -0.012 },
  'aizome/towel': { ...base, at: [0.5, 0.66], ax: 0, ay: 0, share: 0.82, tall: 0.3, hi: 210, rows: [1, 2], lead: 1.12, track: 0.04, object: 'tenugui', pad: [110, 40], fill: [1.1, 0.36] },
  // crayon: the words written big on the page, in a bubble left clean, or on a sheet pasted in.
  'crayon/page': { ...base, at: [0.5, 0.42], ax: 0, ay: 0, share: 0.76, tall: 0.5, hi: 280, rows: [1, 2], lead: 1.14, track: 0.01, tilt: -0.02 },
  'crayon/up-left': { ...base, at: [0.08, 0.3], ax: -1, ay: 0, share: 0.72, tall: 0.44, hi: 240, rows: [1, 2], lead: 1.14, track: 0.01, flush: -1, tilt: 0.02 },
  'crayon/down-right': { ...base, at: [0.92, 0.62], ax: 1, ay: 0, share: 0.72, tall: 0.44, hi: 240, rows: [1, 2], lead: 1.14, track: 0.01, flush: 1, tilt: -0.03 },
  'crayon/tall': { ...base, at: [0.8, 0.5], ax: 0, ay: 0, share: 0.28, tall: 0.76, hi: 210, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02 },
  'crayon/pasted': { ...base, at: [0.5, 0.48], ax: 0, ay: 0, share: 0.68, tall: 0.5, hi: 250, rows: [1, 2], lead: 1.14, track: 0.01, object: 'pad-sheet', pad: [80, 70], tilt: 0.03 },
  'crayon/pasted-tall': { ...base, at: [0.2, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.76, hi: 210, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02, object: 'pad-sheet', pad: [50, 60], tilt: -0.03 },
  'crayon/big': { ...base, at: [0.5, 0.46], ax: 0, ay: 0, share: 0.86, tall: 0.66, hi: 380, rows: [1, 2], lead: 1.08, track: 0 },
  // the print worlds: three places of their own each.
  'silk/edge-bleed': { ...base, at: [0.04, 0.84], ax: -1, ay: 1, share: 0.92, tall: 0.5, hi: 260, rows: [1, 2], lead: 1.04, track: -0.01, flush: -1 },
  'silk/top-slab': { ...base, at: [0.96, 0.12], ax: 1, ay: -1, share: 0.8, tall: 0.46, hi: 220, rows: [1, 2], lead: 1.06, track: 0, flush: 1 },
  'silk/poster-column': { ...base, at: [0.14, 0.08], ax: 0, ay: -1, share: 0.24, tall: 0.84, hi: 200, rows: [1, 2], vertical: true, lead: 1.1, track: 0 },
  'silk-cold/low-far': { ...base, at: [0.5, 0.76], ax: 0, ay: 0, share: 0.7, tall: 0.3, hi: 130, lo: 70, rows: [1, 2], track: 0.14 },
  'silk-cold/right-column': { ...base, at: [0.86, 0.1], ax: 0, ay: -1, share: 0.22, tall: 0.8, hi: 124, rows: [1, 2], vertical: true, lead: 1.5, track: 0.1 },
  'silk-cold/upper-left': { ...base, at: [0.08, 0.12], ax: -1, ay: -1, share: 0.76, tall: 0.5, hi: 170, rows: [1, 2], lead: 1.4, track: 0.1, flush: -1 },
  'riso/offset-stair': { ...base, at: [0.08, 0.14], ax: -1, ay: -1, share: 0.76, tall: 0.72, hi: 190, rows: [2, 3], lead: 1.12, track: 0, flush: -1, stair: 1.1 },
  'riso/drop-right': { ...base, at: [0.94, 0.86], ax: 1, ay: 1, share: 0.7, tall: 0.5, hi: 170, rows: [1, 2], lead: 1.1, track: 0, flush: 1 },
  'riso/tilted': { ...base, at: [0.5, 0.48], ax: 0, ay: 0, share: 0.78, tall: 0.56, hi: 200, rows: [1, 2], lead: 1.1, track: 0, tilt: -0.07 },
  'spy/diagonal': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.82, tall: 0.5, hi: 210, rows: [1, 2], lead: 1.08, track: 0.02, tilt: -0.14 },
  'spy/low-slash': { ...base, at: [0.06, 0.8], ax: -1, ay: 0, share: 0.74, tall: 0.34, hi: 170, rows: [1, 2], lead: 1.1, track: 0.02, tilt: -0.09, flush: -1 },
  'spy/high-slash': { ...base, at: [0.94, 0.22], ax: 1, ay: 0, share: 0.74, tall: 0.34, hi: 170, rows: [1, 2], lead: 1.1, track: 0.02, tilt: -0.09, flush: 1 },
  // style batch 3's loud worlds keep their numbers in world-b3-sets.ts
  ...LOUD_SETS,
  // the four worlds rebuilt from the round-2 boards keep theirs in world-r2-sets.ts
  ...R2_SETS,
};

/** Width of a string at size 100, in px. */
export type Measure = (s: string) => number;

/**
 * The type every set may reach and the least it sets, px at 1080p: a set's own numbers below these left a short line
 * small in a corner of an empty frame (2026-11-04 audit: silk-cold, ink-wash, file, dark-glitch). A set may ask for more.
 */
export const TYPE_FLOOR = { hi: 150, lo: 84 };

/** The rows and size a line takes in a set: the biggest type the set allows, in as few rows as keep it near that. */
export function blockOf(text: string, given: SetSpec, measure: Measure): Block {
  const spec = { ...given, hi: Math.max(given.hi, TYPE_FLOOR.hi), lo: Math.max(given.lo, TYPE_FLOOR.lo) };
  const split = splitBlock(text, spec, measure, TYPE_FLOOR.lo);
  if (split) return split;
  const options: { rows: string[]; size: number }[] = [];
  for (let n = spec.rows[0]; n <= spec.rows[1]; n++) {
    const rows = balancedRows(text, n).filter(Boolean);
    // a row of one mark or one character is a break no reader asked for
    if (n > 1 && rows.some((r) => [...r.replace(/[\s\p{P}\p{S}]/gu, '')].length < 2)) continue;
    const size = spec.vertical ? sizeUp(rows, spec, measure) : sizeAcross(rows, spec, measure);
    options.push({ rows, size });
  }
  const best = Math.max(...options.map((o) => o.size), 0);
  // bigger type is the default: a row more is worth it for anything past a twentieth of size
  const pick = options.find((o) => o.size >= best * 0.95) ?? options[options.length - 1] ?? { rows: [text], size: spec.lo };
  const floored = Math.max(spec.lo, Math.round(Math.min(spec.hi, pick.size)));
  const n = pick.rows.length;
  const extent = (size: number) => {
    const longest = Math.max(...pick.rows.map((r) => (spec.vertical ? [...r].length * (1 + spec.track) * size : (measure(r) * size) / 100 + ([...r].length - 1) * spec.track * size)));
    const stepped = (spec.stair ?? 0) * size * (n - 1);
    return spec.vertical ? [n * size * spec.lead, longest + stepped] : [longest + stepped, n * size * spec.lead];
  };
  // the type floor never pushes a line out of the frame: a line too long for its set at the floor is set smaller (never clipped)
  const [w0, h0] = extent(floored);
  const size = Math.floor(floored * Math.min(1, (W - 2 * SAFE_X) / Math.max(1, w0), (H - 2 * SAFE_Y) / Math.max(1, h0)));
  const [w, h] = extent(size);
  // the anchor names a side; the block never leaves the frame's safe area, its object's margin included
  const [px, py] = spec.pad ?? [0, 0];
  const cx = spec.at[0] * W - W / 2 - (spec.ax * w) / 2;
  const cy = H / 2 - spec.at[1] * H + (spec.ay * h) / 2;
  const reach = (half: number, edge: number, pad: number) => Math.max(0, edge - half - pad);
  return { rows: pick.rows, size, w, h, cx: clampTo(cx, reach(w / 2, W / 2 - SAFE_X, px)), cy: clampTo(cy, reach(h / 2, H / 2 - SAFE_Y, py)) };
}

const clampTo = (x: number, r: number) => Math.min(r, Math.max(-r, x));
const sizeAcross = (rows: string[], s: SetSpec, m: Measure) => {
  const em = Math.max(...rows.map((r) => m(r) / 100 + ([...r].length - 1) * s.track));
  const stepped = (s.stair ?? 0) * (rows.length - 1);
  return Math.min(s.hi, (s.share * W) / (em + stepped), (s.tall * H) / (rows.length * s.lead));
};
const sizeUp = (cols: string[], s: SetSpec, _m: Measure) => {
  const em = Math.max(...cols.map((c) => [...c].length * (1 + s.track)));
  return Math.min(s.hi, (s.tall * H) / (em + (s.stair ?? 0) * (cols.length - 1)), (s.share * W) / (cols.length * s.lead));
};
