// What every style world gets from the shared framework (2026-11-04, the five gaps to JIZURA in
// docs/research/2026-11-04-jizura-comparison.md), each in the world's own flavour:
// - beats: things that happen while a line is held (render/world-beats.ts), 2–3 a world;
// - stress: how the one key word a part blows up is set (render/world-beats.ts STRESS), 2 a world;
// - camera: the one move the world's camera makes into a new part (render/kinetic.ts, world-layout.ts).
// Moves in and out shared by all worlds are in render/world-motion.ts (SHARED_ENTERS, SHARED_EXITS).
import type { StyleWorld } from './style-world';

export type BeatKind = 'ink-run' | 'light-sweep' | 'echo' | 'plate-slip' | 'crack' | 'roll' | 'beat-punch' | 'flicker' | HoldKind | 'line-ink-settle';
/**
 * The events that settle and stay (2026-11-09, Q2 of docs/research/2026-11-09-rhythm-gaps-codex.md): a short or medium
 * line changes state once and keeps it, so the change is seen in a line too short for a pulse and back. Each only moves
 * or extends what the world already draws: a phrase's ink, the line's own carrier, the copies behind a blown-up word,
 * the line's own panel, the whole block.
 */
export type HoldKind = 'ink-swap' | 'carrier-settle' | 'plate-spread' | 'panel-open' | 'line-grow';
export const HOLD_KINDS: HoldKind[] = ['ink-swap', 'carrier-settle', 'plate-spread', 'panel-open', 'line-grow'];
/** How much a world likes each settling event, 0 never: the plan draws among those a line can take, by these weights. */
export type HoldTaste = Record<HoldKind, number>;
export type StressKind = 'extrude' | 'plate' | 'outline';
/** A world's one camera move into a new part; `still` is none (a receipt lying on the counter is never flown at). */
export type WorldCamera = 'push-through' | 'diagonal' | 'iso-slide' | 'still';

export interface WorldShared { beats: BeatKind[]; stress: StressKind[]; camera: WorldCamera; holds: HoldTaste }

/** By family: a print world swaps its ink and spreads its plate, a lit or screen world opens its panel, a cut or laid world settles its carrier. */
const HOLDS_BY_FAMILY: Record<StyleWorld['family'], HoldTaste> = {
  print: { 'ink-swap': 2, 'carrier-settle': 2, 'plate-spread': 3, 'panel-open': 1, 'line-grow': 3 },
  emissive: { 'ink-swap': 1, 'carrier-settle': 2, 'plate-spread': 2, 'panel-open': 3, 'line-grow': 3 },
  wet: { 'ink-swap': 2, 'carrier-settle': 2, 'plate-spread': 2, 'panel-open': 1, 'line-grow': 3 },
  stroke: { 'ink-swap': 2, 'carrier-settle': 2, 'plate-spread': 3, 'panel-open': 1, 'line-grow': 3 },
  layered: { 'ink-swap': 1, 'carrier-settle': 3, 'plate-spread': 2, 'panel-open': 2, 'line-grow': 3 },
  film: { 'ink-swap': 1, 'carrier-settle': 2, 'plate-spread': 2, 'panel-open': 3, 'line-grow': 3 },
  ui: { 'ink-swap': 1, 'carrier-settle': 3, 'plate-spread': 1, 'panel-open': 3, 'line-grow': 3 },
  wall: { 'ink-swap': 2, 'carrier-settle': 2, 'plate-spread': 3, 'panel-open': 1, 'line-grow': 3 },
  air: { 'ink-swap': 2, 'carrier-settle': 2, 'plate-spread': 2, 'panel-open': 1, 'line-grow': 3 },
};
/** A world's own taste where its material says more than its family (a receipt never grows: it is printed to its roll's width). */
const HOLDS_OWN: Record<string, Partial<HoldTaste>> = {
  riso: { 'plate-spread': 3 },
  terminal: { 'panel-open': 3, 'carrier-settle': 3, 'ink-swap': 1 },
  screentone: { 'panel-open': 3, 'line-grow': 3, 'ink-swap': 0 },
  blueprint: { 'ink-swap': 1, 'line-grow': 3 },
  document: { 'line-grow': 0, 'carrier-settle': 0, 'panel-open': 0 },
  notebook: { 'line-grow': 2 },
};

const s = (beats: BeatKind[], stress: StressKind[], camera: WorldCamera): Omit<WorldShared, 'holds'> => ({ beats, stress, camera });

/**
 * Each world's share, chosen from what it is made of: a print world slips its plate, a lamp world flickers and
 * relights, a wet world spreads an echo, a cut world cracks; stress by the same logic (a press extrudes, a plate
 * misregisters, light outlines).
 */
export const WORLD_SHARED: Record<string, Omit<WorldShared, 'holds'>> = {
  silk: s(['ink-run', 'plate-slip'], ['plate', 'extrude'], 'diagonal'),
  'silk-cold': s(['light-sweep', 'ink-run'], ['plate', 'outline'], 'push-through'),
  riso: s(['plate-slip', 'ink-run', 'roll'], ['plate', 'extrude'], 'diagonal'),
  file: s(['ink-run', 'crack'], ['extrude', 'plate'], 'push-through'),
  spy: s(['crack', 'beat-punch', 'roll'], ['extrude', 'plate'], 'diagonal'),
  card: s(['roll', 'beat-punch'], ['extrude', 'plate'], 'diagonal'),
  'dark-glitch': s(['flicker', 'crack'], ['plate', 'outline'], 'push-through'),
  'neon-stage': s(['flicker', 'light-sweep', 'echo'], ['outline', 'plate'], 'push-through'),
  terminal: s(['ink-run', 'flicker'], ['plate', 'outline'], 'push-through'),
  'led-board': s(['light-sweep', 'roll'], ['outline', 'plate'], 'diagonal'),
  'ink-wash': s(['echo', 'ink-run'], ['outline', 'extrude'], 'push-through'),
  'silent-film': s(['flicker', 'crack'], ['outline', 'extrude'], 'push-through'),
  'stained-glass': s(['light-sweep', 'ink-run'], ['outline', 'plate'], 'push-through'),
  'gothic-lolita': s(['light-sweep', 'echo'], ['extrude', 'outline'], 'push-through'),
  ukiyoe: s(['plate-slip', 'light-sweep'], ['plate', 'extrude'], 'diagonal'),
  papercut: s(['crack', 'roll'], ['extrude', 'outline'], 'diagonal'),
  'paper-lantern': s(['light-sweep', 'echo'], ['outline', 'extrude'], 'push-through'),
  chiyogami: s(['roll', 'ink-run'], ['extrude', 'plate'], 'diagonal'),
  woodcut: s(['crack', 'beat-punch'], ['extrude', 'plate'], 'diagonal'),
  chalkboard: s(['ink-run', 'crack'], ['outline', 'extrude'], 'diagonal'),
  aizome: s(['echo', 'light-sweep'], ['outline', 'plate'], 'push-through'),
  crayon: s(['beat-punch', 'ink-run'], ['extrude', 'outline'], 'diagonal'),
  popart: s(['plate-slip', 'beat-punch'], ['plate', 'extrude'], 'diagonal'),
  gameshow: s(['beat-punch', 'roll', 'light-sweep'], ['extrude', 'plate'], 'diagonal'),
  'idol-live': s(['beat-punch', 'roll'], ['plate', 'extrude'], 'diagonal'),
  y2k: s(['beat-punch', 'roll'], ['plate', 'outline'], 'push-through'),
  // style batch 4 (2026-11-05): a phone punches and rolls its screen; a drafter's sheet takes the light; a copy slips its plate and the copier jolts
  phone: s(['beat-punch', 'roll'], ['extrude', 'plate'], 'push-through'),
  blueprint: s(['light-sweep', 'ink-run'], ['plate', 'extrude'], 'push-through'),
  xerox: s(['plate-slip', 'beat-punch'], ['plate', 'extrude'], 'diagonal'),
  // style batch 4 (2026-11-05): a sun print's light passes and bleeds a second exposure; a block world's beat punches its
  // walls and its camera slides along the grid, never turning; an anime title card punches on the beat, its plate slips
  cyanotype: s(['light-sweep', 'echo'], ['plate', 'extrude'], 'push-through'),
  isometric: s(['beat-punch', 'light-sweep'], ['extrude', 'plate'], 'iso-slide'),
  cel80s: s(['beat-punch', 'plate-slip'], ['extrude', 'plate'], 'diagonal'),
  // the thermal receipt (2026-11-05): its key ink is its own black or red, so a run or a sweep only marks the beat a hair (no
  // ghost copy: a receipt is never printed twice)
  document: s(['ink-run', 'light-sweep'], ['plate', 'extrude'], 'still'),
  // style batch 5 (2026-11-06): thread runs along its stitches and the hoop rolls; a manga panel punches on the beat and
  // cracks; a deco poster takes a sweep of light and runs its gilt; a notebook's pen runs and punches its marks
  embroidery: s(['ink-run', 'roll'], ['plate', 'extrude'], 'diagonal'),
  screentone: s(['beat-punch', 'crack'], ['extrude', 'plate'], 'diagonal'),
  'art-deco': s(['light-sweep', 'ink-run'], ['plate', 'extrude'], 'push-through'),
  notebook: s(['ink-run', 'beat-punch'], ['extrude', 'plate'], 'still'),
  // style batch 5 (2026-11-06): stickers punch and roll on the beat; a wash runs and the light passes over the sheet; a
  // screen print slips its plate and the cut paper punches; clay punches and rolls (all without ghost copies)
  scrapbook: s(['beat-punch', 'roll'], ['plate', 'extrude'], 'diagonal'),
  watercolor: s(['ink-run', 'light-sweep'], ['plate', 'outline'], 'push-through'),
  midcentury: s(['plate-slip', 'beat-punch'], ['plate', 'extrude'], 'diagonal'),
  claymation: s(['beat-punch', 'roll'], ['extrude', 'plate'], 'diagonal'),
  psychedelic: s(['ink-run', 'roll'], ['plate', 'extrude'], 'push-through'),
  graffiti: s(['crack', 'ink-run'], ['extrude', 'outline'], 'diagonal'),
  brutalist: s(['crack', 'beat-punch'], ['extrude', 'plate'], 'diagonal'),
  citypop: s(['light-sweep', 'ink-run'], ['plate', 'extrude'], 'push-through'),
};

/** A world no row names (a new one) takes the moves its family is made of until it is given its own. */
const BY_FAMILY: Record<StyleWorld['family'], Omit<WorldShared, 'holds'>> = {
  print: s(['ink-run', 'plate-slip'], ['plate', 'extrude'], 'diagonal'),
  emissive: s(['flicker', 'light-sweep'], ['outline', 'plate'], 'push-through'),
  wet: s(['echo', 'ink-run'], ['outline', 'extrude'], 'push-through'),
  stroke: s(['ink-run', 'crack'], ['extrude', 'outline'], 'diagonal'),
  layered: s(['roll', 'light-sweep'], ['extrude', 'plate'], 'diagonal'),
  film: s(['flicker', 'crack'], ['outline', 'extrude'], 'push-through'),
  ui: s(['beat-punch', 'roll'], ['extrude', 'outline'], 'diagonal'),
  wall: s(['crack', 'ink-run'], ['extrude', 'outline'], 'diagonal'),
  air: s(['light-sweep', 'echo'], ['outline', 'plate'], 'push-through'),
};

export const holdsOf = (w: Pick<StyleWorld, 'id' | 'family'>): HoldTaste => ({ ...HOLDS_BY_FAMILY[w.family], ...HOLDS_OWN[w.id] });
export const sharedOf = (w: Pick<StyleWorld, 'id' | 'family'>): WorldShared => ({ ...(WORLD_SHARED[w.id] ?? BY_FAMILY[w.family]), holds: holdsOf(w) });

/** A world whose time is cut in steps (a press, a lamp, a projector) runs its beats in steps too. */
export const steppedWorld = (w: Pick<StyleWorld, 'timeBase'>) => /step|cut|snap|stutter|noise|cranked|flip/.test(w.timeBase.curve);
