// Style batch 3's own layouts, as numbers (see world-sets.ts): where a line stands in each loud world, how big it may go,
// what carries it. Each world keeps to places of its own so two worlds never put their ink in the same part of the frame.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };

export const LOUD_SETS: Record<string, SetSpec> = {
  // popart (board a–d): a balloon in the wide panel (either side), the narrator's caption up left, the sound effect over
  // the burst, a phrase a column in two tall balloons read right to left
  'popart/balloon': { ...base, split: { small: 'tail', scale: 0.82, rows: 2, at: [0.804, 0.5], share: 0.2, wide: 0.4 }, at: [0.3125, 0.463], ax: 0, ay: 0, share: 0.37, tall: 0.5, hi: 226, rows: [1, 3], lead: 1.08, track: 0.02, object: 'pop-balloon', pad: [190, 150], fill: [0.56, 0.8], fixed: true },
  'popart/balloon-r': { ...base, split: { small: 'tail', scale: 0.82, rows: 2, at: [0.196, 0.5], share: 0.2, wide: 0.4 }, at: [0.6875, 0.463], ax: 0, ay: 0, share: 0.37, tall: 0.5, hi: 226, rows: [1, 3], lead: 1.08, track: 0.02, object: 'pop-balloon-r', pad: [190, 150], fill: [0.56, 0.8], fixed: true },
  'popart/narration': { ...base, at: [0.102, 0.176], ax: -1, ay: -1, share: 0.4, tall: 0.3, hi: 110, rows: [1, 3], lead: 1.32, track: 0.06, flush: -1, object: 'pop-caption', pad: [60, 50], fill: [0.458, 0.35], fixed: true },
  'popart/sfx': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.72, hi: 350, rows: [1, 2], lead: 1, track: 0, tilt: -0.087, ink: 'faint', surface: 'comic-key', under: [{ kind: 'pop-sfx-plate', tone: 'accent' }, { kind: 'pop-sfx-key', tone: 'ink' }], fixed: true },
  'popart/twin': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 1.06, tall: 0.7, hi: 108, rows: [2, 2], vertical: true, lead: 9.4, track: 0, object: 'pop-twin-balloons', pad: [70, 88], fill: [0.26, 0], fixed: true },
  // gameshow (board a–d): the question on its banner, the answer a letter a cell, the hint card's line, a letter a tile on the
  // number board, question and answer on two banners
  'gameshow/question': { ...base, at: [0.52, 0.3], ax: 0, ay: 0, share: 0.62, tall: 0.3, hi: 172, rows: [1, 2], lead: 1.1, track: 0.03, object: 'gs-q-banner', pad: [270, 70], fixed: true },
  'gameshow/answers': { ...base, at: [0.5, 0.72], ax: 0, ay: 0, share: 0.86, tall: 0.22, hi: 210, rows: [1, 1], lead: 1, track: 0.714, even: true, object: 'gs-answer-cells', pad: [70, 110], fixed: true },
  'gameshow/hint': { ...base, at: [0.208, 0.39], ax: -1, ay: -1, share: 0.56, tall: 0.32, hi: 104, rows: [1, 3], lead: 1.5, track: 0.06, flush: -1, object: 'gs-hint', pad: [100, 170], fill: [0.66, 0.56], fixed: true },
  'gameshow/board': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.95, tall: 0.17, hi: 176, lo: 176, rows: [1, 1], lead: 1, track: 0.288, even: true, object: 'gs-row-tiles', pad: [0, 0], fixed: true },
  'gameshow/qa': { ...base, at: [0.295, 0.5], ax: -1, ay: 0, share: 0.54, tall: 0.78, hi: 140, rows: [2, 2], lead: 2.9, track: 0.02, object: 'gs-qa', pad: [300, 60], on: ['plate', 'accent'], key: 'ink2', fixed: true },
  // idol-live (board a–d): fan letters across the gingham, the line on a ticket, a letter a member card, two columns on a big card
  'idol-live/fan': { ...base, at: [0.5, 0.55], ax: 0, ay: 0, share: 0.84, tall: 0.7, hi: 250, rows: [1, 3], lead: 1.36, track: 0.13, ink: 'plateInk', under: [{ kind: 'fan-key', tone: 'plateInk' }, { kind: 'fan-white', tone: 'plate' }, { kind: 'fan-member', tone: 'accent' }], fixed: true },
  'idol-live/ticket': { ...base, at: [0.175, 0.38], ax: -1, ay: -1, share: 0.5, tall: 0.3, hi: 104, rows: [1, 3], lead: 1.3, track: 0.04, flush: -1, ink: 'plateInk', fixed: true },
  'idol-live/cards': { ...base, at: [0.5, 0.575], ax: 0, ay: 0, share: 0.92, tall: 0.3, hi: 184, rows: [1, 1], lead: 1, track: 0.74, even: true, ink: 'plateInk', under: [{ kind: 'fan-key', tone: 'plateInk' }, { kind: 'fan-white', tone: 'plate' }, { kind: 'fan-member', tone: 'accent' }], fixed: true },
  'idol-live/card-col': { ...base, at: [0.5, 0.15], ax: 0, ay: -1, share: 0.2, tall: 0.78, hi: 150, rows: [1, 2], vertical: true, lead: 1.6, track: 0.27, ink: 'plateInk', object: 'idol-card', pad: [110, 70], under: [{ kind: 'fan-key', tone: 'plateInk' }, { kind: 'fan-white', tone: 'plate' }, { kind: 'fan-member', tone: 'accent' }], fixed: true },
  // y2k (board a–d): the title up left on the hook sleeve, the line left of the night ring, a big title by the fan, columns right
  'y2k/hook': { ...base, split: { small: 'tail', scale: 0.45, track: 0.25 }, at: [0.074, 0.218], ax: -1, ay: -1, share: 0.5, tall: 0.64, hi: 236, rows: [1, 3], lead: 1.02, track: -0.01, flush: -1, fixed: true },
  'y2k/ring': { ...base, at: [0.0885, 0.333], ax: -1, ay: -1, share: 0.42, tall: 0.4, hi: 96, rows: [1, 3], lead: 1.45, track: 0.14, flush: -1, weight: 700, fixed: true },
  'y2k/fan': { ...base, split: { small: 'lead', scale: 0.4, track: 0.12 }, at: [0.073, 0.278], ax: -1, ay: -1, share: 0.5, tall: 0.56, hi: 250, rows: [1, 3], lead: 1, track: 0.02, flush: -1, fixed: true },
  'y2k/column': { ...base, at: [0.629, 0.139], ax: 0, ay: -1, share: 0.3, tall: 0.7, hi: 104, rows: [1, 2], vertical: true, lead: 1.83, track: 0.08, fixed: true },
  // psychedelic (board a–d): the sign over the arches, the line left of the sun, the sign in the tunnel, columns by the bands
  'psychedelic/arch': { ...base, at: [0.5, 0.33], ax: 0, ay: 0, share: 0.72, tall: 0.44, hi: 190, rows: [1, 3], lead: 1.2, track: 0.03, ink: 'plate', under: [{ kind: 'poster-band', tone: 'ink2' }, { kind: 'poster-key', tone: 'plateInk' }], fixed: true },
  'psychedelic/sun': { ...base, at: [0.078, 0.3], ax: -1, ay: -1, share: 0.46, tall: 0.36, hi: 108, rows: [1, 3], lead: 1.39, track: 0.074, flush: -1, ink: 'plate', under: [{ kind: 'poster-key-thin', tone: 'plateInk' }], fixed: true },
  'psychedelic/tunnel': { ...base, split: { small: 'lead', scale: 0.45, track: 0.12 }, at: [0.5, 0.52], ax: 0, ay: 0, share: 0.62, tall: 0.5, hi: 250, rows: [1, 2], lead: 1.12, track: 0.04, ink: 'plate', under: [{ kind: 'poster-band', tone: 'accent' }, { kind: 'poster-key', tone: 'plateInk' }], fixed: true },
  'psychedelic/flow': { ...base, at: [0.79, 0.139], ax: 0, ay: -1, share: 0.3, tall: 0.78, hi: 104, rows: [1, 2], vertical: true, lead: 2.02, track: 0.077, ink: 'plate', under: [{ kind: 'poster-band', tone: 'ink2' }, { kind: 'poster-key', tone: 'plateInk' }], fixed: true },
  // graffiti (round-2 board a–d): the line sprayed on a rolled buff patch (its last phrase in red), sprayed in navy on a
  // calm patch, huge across the patch rolled over a wall of prints, its two phrases down two pasted strips
  'graffiti/buff': { ...base, at: [0.099, 0.48], ax: -1, ay: 0, share: 0.6, tall: 0.62, hi: 232, rows: [1, 3], lead: 1.26, track: 0, flush: -1, split: { small: 'tail', scale: 1, ink: 'ink2' }, fixed: true },
  'graffiti/navy': { ...base, at: [0.099, 0.45], ax: -1, ay: 0, share: 0.52, tall: 0.5, hi: 156, rows: [1, 3], lead: 1.45, track: 0.02, flush: -1, ink: 'plateInk', object: 'gf-buff', pad: [80, 120], fixed: true },
  'graffiti/wall': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.8, tall: 0.48, hi: 400, rows: [1, 2], lead: 1.04, track: 0, fixed: true },
  'graffiti/strips': { ...base, at: [0.672, 0.1], ax: 0, ay: -1, share: 0.16, tall: 0.8, hi: 150, rows: [1, 1], vertical: true, lead: 1.15, track: 0.08, ink: 'ink', split: { small: 'tail', scale: 0.93, ink: 'plate', at: [0.474, 0.1], tall: 0.8 }, fixed: true },
  // brutalist (board a–d): the headline top left inside the 96 px margin, two lines low under a red rule, the shout across four
  // cells, two columns at the right; nothing ever crosses the margin
  'brutalist/headline': { ...base, split: { small: 'tail', scale: 0.5, track: 0.3, ink: 'plate', at: [0.068, 0.842], ax: -1, share: 0.8, tall: 0.5 }, at: [0.047, 0.185], ax: -1, ay: -1, share: 0.56, tall: 0.6, hi: 318, rows: [1, 3], lead: 1, track: -0.01, flush: -1, fixed: true },
  'brutalist/footer': { ...base, at: [0.048, 0.648], ax: -1, ay: -1, share: 0.6, tall: 0.26, hi: 112, rows: [1, 3], lead: 1.18, track: 0.02, flush: -1, fixed: true },
  'brutalist/cells': { ...base, split: { small: 'lead', scale: 0.3, track: 0.06, at: [0.06, 0.3], ax: -1, share: 0.4, tall: 0.32 }, at: [0.5, 0.54], ax: 0, ay: 0, share: 0.86, tall: 0.42, hi: 388, rows: [1, 1], lead: 1, track: 0.11, fixed: true },
  'brutalist/columns': { ...base, at: [0.808, 0.118], ax: 0, ay: -1, share: 0.2, tall: 0.79, hi: 104, rows: [1, 2], vertical: true, lead: 1.54, track: 0.02, fixed: true },
  // citypop (board a–d): the title on the facade, the line over the night sea, centred over the skyline, columns on the white column
  'citypop/facade-title': { ...base, split: { small: 'tail', scale: 0.6, track: 0.3, ink: 'accent' }, at: [0.073, 0.213], ax: -1, ay: -1, share: 0.4, tall: 0.5, hi: 142, rows: [1, 3], lead: 1.12, track: 0.04, flush: -1, fixed: true },
  'citypop/sea-title': { ...base, at: [0.0885, 0.219], ax: -1, ay: -1, share: 0.5, tall: 0.42, hi: 92, rows: [1, 3], lead: 1.5, track: 0.16, flush: -1, fixed: true },
  'citypop/skyline-title': { ...base, split: { small: 'lead', scale: 0.4, track: 0.12 }, at: [0.5, 0.21], ax: 0, ay: 0, share: 0.9, tall: 0.3, hi: 176, rows: [1, 2], lead: 1.12, track: 0.18, fixed: true },
  'citypop/column': { ...base, at: [0.534, 0.139], ax: 0, ay: -1, share: 0.22, tall: 0.78, hi: 96, rows: [2, 2], vertical: true, lead: 1.56, track: 0.16, stair: 1.56, object: 'cp-column', pad: [120, 40], fixed: true },
};

/** Sets laid out again mirrored left to right, with their page mirrored too (`<ground>-r`): a song gets the same board both ways. */
export const B3_MIRRORS: Record<string, string> = {
  'popart/narration': 'popart/sea', 'idol-live/fan': 'idol-live/fan',
  'y2k/hook': 'y2k/hook', 'y2k/ring': 'y2k/ring', 'y2k/fan': 'y2k/fan', 'y2k/column': 'y2k/column',
  'psychedelic/sun': 'psychedelic/sun', 'psychedelic/flow': 'psychedelic/flow',
  'citypop/facade-title': 'citypop/facade', 'citypop/sea-title': 'citypop/moon', 'citypop/column': 'citypop/colonnade',
  'brutalist/footer': 'brutalist/footer', 'brutalist/columns': 'brutalist/columns',
  'idol-live/ticket': 'idol-live/ticket', 'idol-live/card-col': 'idol-live/setlist',
  'gameshow/hint': 'gameshow/hint', 'gameshow/qa': 'gameshow/qa',
  'graffiti/buff': 'graffiti/paste-up', 'graffiti/navy': 'graffiti/navy-buff',
};
const flip = (x: -1 | 0 | 1) => (-x as -1 | 0 | 1);
/** Objects drawn one way round, and their mirrored make (the Q/A banners' tabs and chevrons). */
const MIRRORED_OBJECTS: Record<string, string> = { 'gs-qa': 'gs-qa-r' };
for (const id of Object.keys(B3_MIRRORS)) {
  const s = LOUD_SETS[id];
  const object = s.object && MIRRORED_OBJECTS[s.object];
  LOUD_SETS[`${id}-r`] = { ...s, at: [1 - s.at[0], s.at[1]], ax: flip(s.ax), ...(s.flush !== undefined ? { flush: flip(s.flush) } : {}), ...(s.tilt ? { tilt: -s.tilt } : {}), ...(object ? { object: object as SetSpec['object'] } : {}) };
}
