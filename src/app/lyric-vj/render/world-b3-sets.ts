// Style batch 3's own layouts, as numbers (see world-sets.ts): where a line stands in each loud world, how big it may go,
// what carries it. Each world keeps to places of its own so two worlds never put their ink in the same part of the frame.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };

export const LOUD_SETS: Record<string, SetSpec> = {
  // popart (board a–d): a balloon in the wide panel (either side), the narrator's caption up left, the sound effect over
  // the burst, a phrase a column in two tall balloons read right to left
  'popart/balloon': { ...base, at: [0.3125, 0.463], ax: 0, ay: 0, share: 0.4, tall: 0.6, hi: 226, rows: [1, 3], lead: 1.08, track: 0.02, object: 'pop-balloon', pad: [190, 160], fill: [0.56, 0.8], fixed: true },
  'popart/balloon-r': { ...base, at: [0.6875, 0.463], ax: 0, ay: 0, share: 0.4, tall: 0.6, hi: 226, rows: [1, 3], lead: 1.08, track: 0.02, object: 'pop-balloon-r', pad: [190, 160], fill: [0.56, 0.8], fixed: true },
  'popart/narration': { ...base, at: [0.102, 0.176], ax: -1, ay: -1, share: 0.4, tall: 0.3, hi: 110, rows: [1, 2], lead: 1.32, track: 0.06, flush: -1, object: 'pop-caption', pad: [60, 50], fill: [0.458, 0.35], fixed: true },
  'popart/sfx': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.72, hi: 350, rows: [1, 2], lead: 1, track: 0, tilt: -0.087, ink: 'faint', surface: 'comic-key', under: [{ kind: 'pop-sfx-plate', tone: 'accent' }, { kind: 'pop-sfx-key', tone: 'ink' }], fixed: true },
  'popart/twin': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 1.06, tall: 0.76, hi: 108, rows: [2, 2], vertical: true, lead: 9.4, track: 0, object: 'pop-twin-balloons', pad: [70, 88], fixed: true },
  // gameshow: the question card low in the set, the buzzers at the sides, the strip across the top, the judgement huge
  'gameshow/question-card': { ...base, at: [0.5, 0.68], ax: 0, ay: 0, share: 0.72, tall: 0.38, hi: 240, rows: [1, 3], lead: 1.12, track: 0.01, object: 'quiz-card', pad: [84, 60], fill: [0.78, 0.46] },
  'gameshow/buzzer-left': { ...base, at: [0.06, 0.5], ax: -1, ay: 0, share: 0.46, tall: 0.72, hi: 230, rows: [1, 3], lead: 1.1, track: 0.01, flush: -1 },
  'gameshow/buzzer-right': { ...base, at: [0.94, 0.5], ax: 1, ay: 0, share: 0.46, tall: 0.72, hi: 230, rows: [1, 3], lead: 1.1, track: 0.01, flush: 1 },
  'gameshow/marquee': { ...base, at: [0.5, 0.14], ax: 0, ay: 0, share: 0.94, tall: 0.26, hi: 200, rows: [1, 1], track: 0.02, object: 'marquee-strip', pad: [50, 28], fill: [1.06, 0.3] },
  'gameshow/score-corner': { ...base, at: [0.96, 0.1], ax: 1, ay: -1, share: 0.5, tall: 0.42, hi: 190, rows: [1, 2], lead: 1.1, track: 0.01, flush: 1, object: 'score-plate', pad: [50, 34], fill: [0.5, 0.4] },
  'gameshow/judge': { ...base, at: [0.5, 0.48], ax: 0, ay: 0, share: 0.9, tall: 0.7, hi: 420, rows: [1, 2], lead: 1.02, track: -0.01, tilt: -0.06 },
  'gameshow/column': { ...base, at: [0.88, 0.5], ax: 0, ay: 0, share: 0.26, tall: 0.8, hi: 230, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02 },
  // idol-live: the singer centre high under the rig, at either wing, in the spot's pool, on the fan, shouted
  'idol-live/centre-stage': { ...base, at: [0.5, 0.34], ax: 0, ay: 0, share: 0.8, tall: 0.42, hi: 300, rows: [1, 2], lead: 1.08, track: 0.02 },
  'idol-live/stage-right': { ...base, at: [0.94, 0.4], ax: 1, ay: 0, share: 0.6, tall: 0.5, hi: 250, rows: [1, 3], lead: 1.1, track: 0.02, flush: 1 },
  'idol-live/stage-left': { ...base, at: [0.06, 0.4], ax: -1, ay: 0, share: 0.6, tall: 0.5, hi: 250, rows: [1, 3], lead: 1.1, track: 0.02, flush: -1 },
  'idol-live/spot-pool': { ...base, at: [0.5, 0.44], ax: 0, ay: 0, share: 0.6, tall: 0.44, hi: 260, rows: [1, 2], lead: 1.1, track: 0.02, object: 'spot-pool', pad: [160, 110], fill: [0.7, 0.6] },
  'idol-live/uchiwa': { ...base, at: [0.72, 0.5], ax: 0, ay: 0, share: 0.34, tall: 0.42, hi: 210, rows: [1, 3], lead: 1.08, track: 0.01, object: 'uchiwa', pad: [90, 90], fill: [0.34, 0.6], tilt: 0.1 },
  'idol-live/shout': { ...base, at: [0.5, 0.46], ax: 0, ay: 0, share: 0.92, tall: 0.7, hi: 400, rows: [1, 2], lead: 1.04, track: 0, tilt: -0.04 },
  'idol-live/column': { ...base, at: [0.1, 0.5], ax: 0, ay: 0, share: 0.26, tall: 0.84, hi: 230, rows: [1, 2], vertical: true, lead: 1.1, track: 0.02 },
  // y2k: a glossy window a little off centre, a chrome sticker up right, floating lines, a tag in the corner
  'y2k/window': { ...base, at: [0.42, 0.46], ax: 0, ay: 0, share: 0.6, tall: 0.46, hi: 240, rows: [1, 3], lead: 1.1, track: 0.02, tilt: -0.04, object: 'glass-window', pad: [70, 96], fill: [0.6, 0.5] },
  'y2k/sticker': { ...base, at: [0.7, 0.3], ax: 0, ay: 0, share: 0.46, tall: 0.38, hi: 230, rows: [1, 2], lead: 1.08, track: 0.02, tilt: 0.1, object: 'chrome-sticker', pad: [84, 64], fill: [0.46, 0.4] },
  'y2k/float-low': { ...base, at: [0.5, 0.74], ax: 0, ay: 0, share: 0.8, tall: 0.36, hi: 240, rows: [1, 2], lead: 1.1, track: 0.03 },
  'y2k/float-high': { ...base, at: [0.5, 0.24], ax: 0, ay: 0, share: 0.8, tall: 0.36, hi: 240, rows: [1, 2], lead: 1.1, track: 0.03 },
  'y2k/corner-tag': { ...base, at: [0.05, 0.9], ax: -1, ay: 1, share: 0.6, tall: 0.42, hi: 220, rows: [1, 2], lead: 1.08, track: 0.02, flush: -1, tilt: -0.06 },
  'y2k/big': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.7, hi: 400, rows: [1, 2], lead: 1.04, track: 0.01 },
  'y2k/column': { ...base, at: [0.86, 0.5], ax: 0, ay: 0, share: 0.26, tall: 0.82, hi: 230, rows: [1, 2], vertical: true, lead: 1.1, track: 0.03, tilt: 0.05 },
  // psychedelic: the words ride the ribbon, sit in the sun, arc high or low, stack down the left, lean big
  'psychedelic/wave-ribbon': { ...base, at: [0.5, 0.42], ax: 0, ay: 0, share: 0.86, tall: 0.36, hi: 250, rows: [1, 2], lead: 1.08, track: 0.02, tilt: 0.06, object: 'ribbon-wave', pad: [110, 60], fill: [1.0, 0.36] },
  'psychedelic/sun-face': { ...base, at: [0.5, 0.56], ax: 0, ay: 0, share: 0.46, tall: 0.42, hi: 230, rows: [1, 3], lead: 1.06, track: 0.01, object: 'sun-disc', pad: [150, 150], fill: [0.5, 0.88] },
  'psychedelic/arc-top': { ...base, at: [0.5, 0.2], ax: 0, ay: 0, share: 0.8, tall: 0.32, hi: 230, rows: [1, 2], lead: 1.08, track: 0.02, tilt: -0.05 },
  'psychedelic/arc-low': { ...base, at: [0.5, 0.8], ax: 0, ay: 0, share: 0.8, tall: 0.32, hi: 230, rows: [1, 2], lead: 1.08, track: 0.02, tilt: 0.05 },
  'psychedelic/stack-left': { ...base, at: [0.06, 0.5], ax: -1, ay: 0, share: 0.7, tall: 0.76, hi: 240, rows: [2, 3], lead: 1.12, track: 0.01, flush: -1, stair: 0.6, tilt: -0.06 },
  'psychedelic/big': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.7, hi: 380, rows: [1, 2], lead: 1.04, track: 0, tilt: 0.08 },
  'psychedelic/column': { ...base, at: [0.14, 0.5], ax: 0, ay: 0, share: 0.26, tall: 0.82, hi: 230, rows: [1, 2], vertical: true, lead: 1.08, track: 0.02, tilt: -0.08 },
  // graffiti: low on the wall, leaning; a stencil dead centre; a tag high right; on a sprayed patch; a throw-up
  'graffiti/wall-low': { ...base, at: [0.06, 0.72], ax: -1, ay: 0, share: 0.84, tall: 0.44, hi: 300, rows: [1, 2], lead: 1.04, track: 0.01, flush: -1, tilt: -0.05 },
  'graffiti/stencil-centre': { ...base, at: [0.5, 0.46], ax: 0, ay: 0, share: 0.86, tall: 0.54, hi: 340, rows: [1, 2], lead: 1.04, track: 0.02 },
  'graffiti/tag-high': { ...base, at: [0.94, 0.16], ax: 1, ay: -1, share: 0.6, tall: 0.4, hi: 230, rows: [1, 2], lead: 1.08, track: 0.02, flush: 1, tilt: 0.06 },
  'graffiti/drip-plate': { ...base, at: [0.5, 0.58], ax: 0, ay: 0, share: 0.7, tall: 0.46, hi: 260, rows: [1, 3], lead: 1.08, track: 0.02, object: 'spray-patch', pad: [130, 100], fill: [0.62, 0.5] },
  'graffiti/throwup': { ...base, at: [0.42, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.66, hi: 400, rows: [1, 2], lead: 1.02, track: 0, tilt: -0.08, object: 'throw-up', pad: [120, 80], fill: [0.7, 0.5] },
  'graffiti/column': { ...base, at: [0.16, 0.5], ax: 0, ay: 0, share: 0.26, tall: 0.84, hi: 230, rows: [1, 2], vertical: true, lead: 1.06, track: 0.02, tilt: -0.04 },
  'graffiti/stack': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.84, tall: 0.8, hi: 240, rows: [2, 3], lead: 1.1, track: 0.01, flush: -1, stair: 0.9 },
  // brutalist: full bleed from the top left, a slab along the bottom, a tape band across, tight stacks, the shout
  'brutalist/full-bleed': { ...base, at: [0.02, 0.04], ax: -1, ay: -1, share: 1.0, tall: 0.9, hi: 480, rows: [1, 3], lead: 1, track: -0.01, flush: -1 },
  'brutalist/bottom-slab': { ...base, at: [0.98, 0.96], ax: 1, ay: 1, share: 0.96, tall: 0.5, hi: 360, rows: [1, 2], lead: 1, track: -0.01, flush: 1 },
  'brutalist/tape-band': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.9, tall: 0.3, hi: 240, rows: [1, 1], lead: 1, track: -0.01, tilt: -0.14, object: 'tape-slogan', pad: [70, 34], fill: [1.2, 0.3] },
  'brutalist/stack-tight': { ...base, at: [0.02, 0.5], ax: -1, ay: 0, share: 0.9, tall: 0.9, hi: 320, rows: [2, 3], lead: 1, track: -0.01, flush: -1 },
  'brutalist/corner-cut': { ...base, at: [0.98, 0.04], ax: 1, ay: -1, share: 0.62, tall: 0.5, hi: 300, rows: [1, 2], lead: 1, track: -0.01, flush: 1 },
  'brutalist/column': { ...base, at: [0.08, 0.5], ax: 0, ay: 0, share: 0.3, tall: 0.92, hi: 280, rows: [1, 2], vertical: true, lead: 1, track: -0.01 },
  'brutalist/shout': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 1.0, tall: 0.9, hi: 520, rows: [1, 2], lead: 1, track: -0.01 },
  // citypop: a title high in the sky, a line along the horizon, on the sleeve, along the pool, a wide one, small credits
  'citypop/sky-title': { ...base, at: [0.92, 0.18], ax: 1, ay: -1, share: 0.7, tall: 0.36, hi: 230, rows: [1, 2], lead: 1.3, track: 0.14, flush: 1 },
  'citypop/horizon-low': { ...base, at: [0.08, 0.74], ax: -1, ay: 0, share: 0.76, tall: 0.34, hi: 220, rows: [1, 2], lead: 1.3, track: 0.12, flush: -1 },
  'citypop/sleeve': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.44, tall: 0.4, hi: 200, rows: [1, 3], lead: 1.3, track: 0.08, object: 'sleeve-card', pad: [90, 110], fill: [0.36, 0.66] },
  'citypop/pool-line': { ...base, at: [0.5, 0.62], ax: 0, ay: 0, share: 0.8, tall: 0.26, hi: 200, rows: [1, 2], lead: 1.3, track: 0.16 },
  'citypop/column': { ...base, at: [0.1, 0.12], ax: 0, ay: -1, share: 0.24, tall: 0.8, hi: 200, rows: [1, 2], vertical: true, lead: 1.4, track: 0.1 },
  'citypop/wide': { ...base, at: [0.5, 0.4], ax: 0, ay: 0, share: 0.92, tall: 0.5, hi: 300, rows: [1, 2], lead: 1.2, track: 0.1 },
  'citypop/credits': { ...base, at: [0.92, 0.9], ax: 1, ay: 1, share: 0.6, tall: 0.3, hi: 120, lo: 70, rows: [1, 2], lead: 1.4, track: 0.2, flush: 1 },
};
