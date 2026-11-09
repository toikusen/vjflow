// What every style world gets from the shared framework (2026-11-04, the five gaps to JIZURA in
// docs/research/2026-11-04-jizura-comparison.md), each in the world's own flavour:
// - beats: things that happen while a line is held (render/world-beats.ts), 2–3 a world;
// - stress: how the one key word a part blows up is set (render/world-beats.ts STRESS), 2 a world;
// - camera: the one move the world's camera makes into a new part (render/kinetic.ts, world-layout.ts).
// Moves in and out shared by all worlds are in render/world-motion.ts (SHARED_ENTERS, SHARED_EXITS).
import type { StyleWorld } from './style-world';
import { SET_SPECS } from './render/world-sets';
import type { CompositionFamily } from './world-events';

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

/**
 * The linked ways in and out every world may use besides its own (2026-11-09, Q4 in
 * docs/research/2026-11-09-rhythm-gaps-codex.md, reworked after docs/research/2026-11-09-handoff-codex.md): between two
 * lines sung back to back the words switch on time and stay still; the world's page hands over, opaque, along a real edge.
 * `edge-relay`: the next page comes in by its paper edge while the last line is still read, and the last page goes off by
 * its own edge once the next is up. `layer-seat`: the next sheet is laid down from above and the last is drawn out below,
 * for a world made of stacked opaque sheets. `frame-open`: the last page folds away to a hinge the world draws (a
 * notebook's binding, a book's spine). Drawn in render/motion-transition.ts (link-*), laid on by render/world-handoff.ts.
 */
export type LinkFamily = 'edge-relay' | 'layer-seat' | 'frame-open';
/** Which of them a world takes, the axis its relay runs along, and the hinge its page folds to (none: no frame-open). */
export interface LinkTaste { families: LinkFamily[]; axis: 'x' | 'y'; hinge?: 'left' | 'top' }

const t = (families: LinkFamily[], axis: LinkTaste['axis'] = 'x', hinge?: LinkTaste['hinge']): LinkTaste => ({ families, axis, ...(hinge ? { hinge } : {}) });

/**
 * By what a world is made of. A page world hands its page on by the paper edge (its main family); a scene world (a
 * stage, a room of blocks, a screen) slides its picture on as one piece, nothing more; a wash has no edge to hand on and
 * keeps its own moves. Stacked sheets and hinged covers are named world by world below, only where the world draws them.
 */
const LINKS_BY_FAMILY: Record<StyleWorld['family'], LinkTaste> = {
  print: t(['edge-relay']),
  emissive: t(['edge-relay']),
  wet: t([]),
  stroke: t(['edge-relay']),
  layered: t(['edge-relay']),
  film: t(['edge-relay'], 'y'),
  ui: t(['edge-relay'], 'y'),
  wall: t(['edge-relay']),
  air: t(['edge-relay']),
};

/** The worlds of each family as they stand (a world the planner knows only by its id takes its family's taste from here). */
const MEMBERS: Record<StyleWorld['family'], string[]> = {
  print: ['silk', 'silk-cold', 'riso', 'file', 'spy', 'card', 'popart', 'psychedelic', 'brutalist', 'document', 'art-deco', 'midcentury'],
  emissive: ['dark-glitch', 'neon-stage', 'terminal', 'led-board', 'stained-glass'],
  wet: ['ink-wash', 'ukiyoe', 'aizome', 'watercolor'],
  film: ['silent-film', 'cel80s'],
  layered: ['gothic-lolita', 'papercut', 'paper-lantern', 'chiyogami', 'idol-live', 'xerox', 'cyanotype', 'embroidery', 'scrapbook', 'claymation'],
  stroke: ['woodcut', 'chalkboard', 'crayon', 'blueprint', 'screentone', 'notebook'],
  ui: ['gameshow', 'y2k', 'phone', 'isometric'],
  wall: ['graffiti'],
  air: ['citypop'],
};

/**
 * Scene worlds: objects stand about the frame (blocks, a stage and its tubes, a city, a lamp board, a hoop, a window's
 * leads), so a page edge sliding across the whole frame cuts them through; they keep their own arrivals (a block world's
 * tile reveal) and take no linked family (2026-11-09 v2 review: isometric's full-height seam sliced its cubes).
 */
const SCENES = ['isometric', 'gameshow', 'y2k', 'neon-stage', 'idol-live', 'citypop', 'stained-glass', 'dark-glitch', 'claymation', 'cel80s', 'led-board', 'embroidery'];

/**
 * Each world's taste: its family's, unless its own material says otherwise. Stacked opaque sheets: a notebook's pages, a
 * case file's papers, a dealt card, cut paper in layers, a scrapbook's pasted pages, a copier's sheets. A hinge drawn by
 * the world: a notebook's spiral binding (top), a gothic book's spine (left). A terminal and a phone scroll up; a film
 * strip runs up through the gate; a receipt only
 * feeds out of its printer and a lantern's lit paper is one sheet (none).
 */
export const WORLD_LINKS: Record<string, LinkTaste> = {
  ...Object.fromEntries(Object.entries(MEMBERS).flatMap(([f, ids]) => ids.map((id) => [id, LINKS_BY_FAMILY[f as StyleWorld['family']]]))),
  notebook: t(['edge-relay', 'layer-seat', 'frame-open'], 'y', 'top'),
  'gothic-lolita': t(['edge-relay', 'frame-open'], 'x', 'left'),
  file: t(['edge-relay', 'layer-seat']),
  card: t(['edge-relay', 'layer-seat']),
  papercut: t(['edge-relay', 'layer-seat']),
  scrapbook: t(['edge-relay', 'layer-seat']),
  xerox: t(['edge-relay', 'layer-seat']),
  terminal: t(['edge-relay'], 'y'),
  phone: t(['edge-relay'], 'y'),
  ...Object.fromEntries(SCENES.map((id) => [id, t([])])),
  document: t([]),
  'paper-lantern': t([]),
};

/** A world's taste by its id; one no row names hands its page on by the edge, along x. */
export const linksOf = (id: string): LinkTaste => WORLD_LINKS[id] ?? t(['edge-relay']);

/**
 * How a world may change its composition (Q1, docs/research/2026-11-09-q1-codex.md §C): which of the six families the
 * song's one scheduler (world-events.ts planWorldEvents) may lay on it, where, how long the move takes and on what curve,
 * what the words are read on, and the regions no seat may enter. A new capability, declared world by world from the
 * world's own approved board; a world without one has it off (the scheduler only keeps what the composer laid). `moves`
 * names the world's own move for each family; `pending` lists moves the world is bounded to but the renderer cannot draw
 * yet, so they are never scheduled (2026-11-09 phase 2: docs/research/2026-11-09-q1-phase2.md).
 */
export interface WorldCompositions {
  kinds: CompositionFamily[];
  /** The world's approved seats (sets); every set of the world when absent. */
  seats?: string[];
  carrierRole: 'page' | 'plate' | 'object' | 'ground';
  /** Where each family may fall: a part's first line, a line boundary, inside a line at a sung word. */
  allowedAt: Partial<Record<CompositionFamily, ('section' | 'line' | 'in-line')[]>>;
  /** Each family's action time, s (a reseat is a cut: 0). */
  duration: Partial<Record<CompositionFamily, number>>;
  /** How the move runs: a cut, or the world's own curve (world-cam.ts for a camera). */
  curve: Partial<Record<CompositionFamily, 'cut' | 'world-camera' | 'page-link'>>;
  /** Regions no seat may enter, frame fractions y down. */
  protectedRegion?: { x0: number; y0: number; x1: number; y1: number }[];
  moves: Partial<Record<CompositionFamily, string>>;
  pending?: Record<string, string>;
  /**
   * Whether the world's seats on the same page as its sets are used (Q1 phase 3a): the same carrier, another reading
   * area (notebook's main column and its lower margin, art-deco's main and secondary block inside the one stepped frame,
   * blueprint's sheet note and the detail strip under its drawing). The seats themselves are sets of their own, each
   * naming its page's set (render/world-sets `samePage`, the one list), laid by the renderer at real geometry, offered
   * only to a scheduled world (lineplan-core seatsFor) at no less than their own `lo`, so a line may switch to one inside
   * itself at a sung word without leaving its page.
   */
  pageSeats?: boolean;
  /**
   * Whether the free path lets the scheduler take the world over by default. Off for all five (2026-11-09 phase-2 review:
   * fast 3.6 → 3.2 on the five, Q1 not accepted): only an explicit opt-in (freeJob worldEvents: true, or
   * VJ_WORLD_EVENTS=1) schedules them, as the measurement and the gate do.
   */
  enabled?: boolean;
}

/**
 * The five single-page worlds (Codex C). Their sets are each laid into a page of their own (blueprint, document,
 * notebook, art-deco): a change to another set is a page change, so it falls only on a line boundary, never inside a
 * line under words being read; a same-page seat (pageSeats, phase 3a) keeps the page and may be taken inside a line at a
 * sung word. A camera reframe is the world's own move into a part (world-cam.ts), never a beat of its own
 * (Codex cap ruling: no independent camera beats this stage). A page handoff is a Q4 linked move (world-handoff.ts) the
 * scheduler protects; it lays none of its own.
 */
/**
 * The regions every seat of a world keeps its words off (Q1 phase 3a; seatOk reads them with each seat's laid box), on
 * top of a same-page seat's own page graphics (its set's `clear`). blueprint: the drawing border and its zone marks,
 * outside the inner border (64 px in); notebook: the head of every page (bindings, the number and date fields, the
 * ruled head line); art-deco: the stepped double frame, the very boxes the marquee sets keep clear (world-b5-sets `clear`).
 */
const BLUEPRINT_BORDER = [{ x0: 0, y0: 0, x1: 1, y1: 0.059 }, { x0: 0, y0: 0.941, x1: 1, y1: 1 }, { x0: 0, y0: 0, x1: 0.033, y1: 1 }, { x0: 0.967, y0: 0, x1: 1, y1: 1 }];
const NOTEBOOK_HEAD = [{ x0: 0, y0: 0, x1: 1, y1: 0.12 }];
const DECO_FRAME = [{ x0: 0, y0: 0, x1: 1, y1: 0.09 }, { x0: 0, y0: 0.9, x1: 1, y1: 1 }, { x0: 0, y0: 0, x1: 0.05, y1: 1 }, { x0: 0.95, y0: 0, x1: 1, y1: 1 }];

export const WORLD_COMPOSITIONS: Record<string, WorldCompositions> = {
  // sheet-change: the next drawing sheet's own layout; detail-viewport: the push into a part, cut from the same sheet
  // (no invented engineering detail); the detail strip: the same sheet's note written under its drawing (phase 3a), the
  // one seat a line may take inside itself (the same sheet under the words)
  blueprint: { kinds: ['layout-seat', 'camera-reframe', 'page-handoff'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'sheet-change', 'camera-reframe': 'detail-viewport' }, pageSeats: true, protectedRegion: BLUEPRINT_BORDER },
  // board-region: left / right / centre regions of the deep green board, also at a word inside a line (the same board
  // under the words, so nothing is pulled from under them); chalk changing colour is no cut
  chalkboard: { kinds: ['layout-seat', 'camera-reframe', 'page-handoff'], carrierRole: 'ground', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'board-region' }, pending: { 'erase-reseat': 'needs an eraser pass drawn over a region already sung; never the line being sung' } },
  // a thermal receipt: camera still, no shared page handoff, its stamp only a hold; its feed and tear are its own page
  // moves, not drawn as a composition switch yet
  document: { kinds: [], carrierRole: 'page', allowedAt: {}, duration: {}, curve: {}, moves: {}, pending: { 'feed-advance': 'the receipt feeding on to its next segment as a switch of its own', 'tear-next': 'tearing off along the paper edge once the line is sung' } },
  // page-turn: the Q4 fold to the top binding; margin-seat: the main column and, on the same page, the margin seat under
  // it (phase 3a), at the world's least type or more: the one seat a line may take inside itself (the same page under it)
  notebook: { kinds: ['layout-seat', 'page-handoff'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'margin-seat', 'page-handoff': 'page-turn' }, pageSeats: true, protectedRegion: NOTEBOOK_HEAD },
  // poster-panel / frame-reseat: the approved poster's panels and frames, each a page; the secondary block on the axis
  // inside the marquee's stepped frame (phase 3a), the plaque drawn round it as set: the one seat a line may take inside
  // itself (the same frame under it). No marquee turned stage sign; the carrier-swap stays pending (phase 3 step 4)
  'art-deco': { kinds: ['layout-seat', 'camera-reframe', 'page-handoff'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'poster-panel / frame-reseat' }, pageSeats: true, protectedRegion: DECO_FRAME },
};

/** Each same-page seat (render/world-sets `samePage`) and the set whose page it is on. */
const PAGE_SEAT_OF: Record<string, string> = Object.fromEntries(Object.entries(SET_SPECS).flatMap(([id, s]) => (s.samePage ? [[id, s.samePage]] : [])));
/** Whether a set is a seat the scheduler adds on a page of the world's, never one the composer lays. */
export const isPageSeat = (set: string) => set in PAGE_SEAT_OF;
/** A world's same-page seats on a set's page (none when its compositions do not use them); every one of the world's when no set is named. */
export const pageSeatsOf = (worldId: string, set?: string): string[] => (WORLD_COMPOSITIONS[worldId]?.pageSeats ? Object.keys(PAGE_SEAT_OF).filter((x) => x.startsWith(`${worldId}/`) && (set === undefined || PAGE_SEAT_OF[x] === set)) : []);
/** The page a world lays one of its sets into (its own page under the words; a same-page seat's, its page's), or undefined. */
export const pageOf = (w: Pick<StyleWorld, 'layouts'>, set: string): string | undefined => w.layouts.lines.find((l) => l.set === set)?.ground ?? (PAGE_SEAT_OF[set] ? pageOf(w, PAGE_SEAT_OF[set]) : undefined);

/** A world's composition capability, or undefined: off (the scheduler only keeps what the composer laid). */
export const compositionsOf = (id: string): WorldCompositions | undefined => WORLD_COMPOSITIONS[id];

// ---- Q3: one scale contrast a sung section (docs/research/2026-11-09-q3q5-codex.md §1–4, phase 2 2026-11-10) ----

export type ScaleEdge = 'top' | 'bottom' | 'left' | 'right';
/** What the big word stands on, running off the frame on its edge's side: the paper, a colour plate, a comic panel, the page, an object, the bare ground. */
export type ScaleCarrierRole = 'paper' | 'plate' | 'panel' | 'page' | 'object' | 'ground';
/**
 * How a world weighs the candidates of a section, each feature 0–1 (scale-policy.ts features): `short` a phrase of few
 * glyphs, `ratio` how near the size law's 2.4× it reaches, `room` how much of the frame it leaves empty, `sustain` how long
 * the line holds past its reading time, `order` how plainly the big word and its rest read in order (one side only).
 */
export interface CandidateWeights { short: number; ratio: number; room: number; sustain: number; order: number }

/**
 * A world's `scale.edgeFit` capability (Codex §3): the edges a big word's ink box may sit on (preferred first), what
 * carries it off the frame, how far it may grow over its reading size, the curve of the change (a cut before the line is
 * sung, held while sung) and how the world weighs near-equal candidates. No lyric pattern, no meaning guessed from the
 * world's name. A world without one gets no Q3 candidate.
 */
export interface WorldScale {
  edges: ScaleEdge[];
  carrierRole: ScaleCarrierRole;
  /** Allowed size over reading size, [least, most]; the law's own bounds are 1.6 and 2.4. */
  sizeRange: [number, number];
  candidateWeights: CandidateWeights;
  curve: 'cut';
  note: string;
}

/**
 * Codex §3's two tastes. riso: the whole big word against the paper's outer edge, the same sheet running off the frame, a
 * second plate never entering the main word's guard; it prefers the shorter phrase, more empty paper and a line that holds
 * to be read. screentone: the big word against a panel's inner edge, page and panel frame running off, tone and speed
 * lines kept out of the reading area; it prefers a clear main and minor panel reading order. Edges and weights are the
 * phase-1 proposal values (docs/research/2026-11-09-q3-phase1.md), not measured on video.
 */
export const WORLD_SCALE: Record<string, WorldScale> = {
  // (its sets anchor top-left and bottom-right: the paper's corners are where its type already sits)
  riso: { edges: ['bottom', 'left', 'top', 'right'], carrierRole: 'paper', sizeRange: [1.6, 2.4], candidateWeights: { short: 1.6, ratio: 1, room: 1.4, sustain: 1.3, order: 0.6 }, curve: 'cut', note: 'riso.edgeFit (Codex §3): paper edge, the sheet runs off; prefers short phrases, empty paper, held lines' },
  // (a manga page tiers its panels top to bottom: a panel bleeding off the page's top or bottom edge)
  screentone: { edges: ['top', 'bottom'], carrierRole: 'panel', sizeRange: [1.6, 2.4], candidateWeights: { short: 0.8, ratio: 1, room: 0.7, sustain: 0.8, order: 1.8 }, curve: 'cut', note: 'screentone.edgeFit (Codex §3): panel inner edge, page and panel frame run off; prefers a clear main/minor panel reading order' },
};
/** A world's declared scale capability, or undefined (no Q3 candidate). */
export const scaleOf = (id: string): WorldScale | undefined => WORLD_SCALE[id];

// ---- Q5: rare meaning moments (Codex §5–7, phase 2 2026-11-10) ----

/**
 * Where a mini moment lives (Codex §5 table): `page` opens, splits or keeps a local part of the world's own paper;
 * `scene` moves an object the world already has, when it is about the line's meaning; `type-only` sets the whole evidence
 * phrase into one keep / echo / spacing relation (never a plain re-ink or zoom passed off as a moment).
 */
export type MomentFamily = 'type-only' | 'page' | 'scene';

/**
 * What a world draws of a signature moment: the big one (render/signature.ts takes the line's treatment over the frame)
 * and the mini families it renders (render/mini-moment.ts), best fit first, inside a region of `miniShare` of the frame
 * round the line's own seat. `pending` names what the world is bounded to but no renderer draws yet: never scheduled.
 */
export interface WorldMoments { big: boolean; mini: MomentFamily[]; miniShare: [number, number]; pending?: Partial<Record<MomentFamily, string>> }

/** A mini's region on the frame: a local action, not a full-screen effect shrunk into a corner (Codex §5). */
export const MINI_SHARE: [number, number] = [0.15, 0.3];
const SCENE_PENDING = 'the set pieces (render/world-pieces.ts) have no local action of their own yet: a scene mini is not drawn';
/** Worlds that run their own moves (document's feed and tear, watercolor's strokes): a big takeover would fight them. */
const NO_BIG = new Set(['document', 'watercolor']);
/** The worlds not laid on a sheet of their own: no page to open, a page mini has nothing to act on. */
const NO_PAGE = new Set(['dark-glitch', 'neon-stage', 'terminal', 'led-board', 'silent-film', 'gothic-lolita', 'gameshow']);
const OFFERED = ['silk', 'silk-cold', 'riso', 'file', 'spy', 'card', 'dark-glitch', 'neon-stage', 'terminal', 'led-board', 'ink-wash', 'silent-film', 'stained-glass', 'gothic-lolita', 'ukiyoe', 'papercut', 'paper-lantern', 'chiyogami', 'woodcut', 'chalkboard', 'aizome', 'crayon', 'popart', 'gameshow', 'idol-live', 'y2k', 'psychedelic', 'graffiti', 'brutalist', 'citypop', 'phone', 'blueprint', 'xerox', 'cyanotype', 'isometric', 'cel80s', 'document', 'embroidery', 'screentone', 'art-deco', 'notebook', 'scrapbook', 'watercolor', 'midcentury', 'claymation'];
/**
 * The 45 offered worlds' moment capability (phase 2: the phase-1 draft's derivation from each world's own fields, written
 * down as a declaration, the scene family held pending). Proposal values, not approved world by world on video.
 */
export const WORLD_MOMENTS: Record<string, WorldMoments> = Object.fromEntries(OFFERED.map((id) => [id, { big: !NO_BIG.has(id), mini: [...(NO_PAGE.has(id) ? [] : ['page' as const]), 'type-only' as const], miniShare: MINI_SHARE, pending: { scene: SCENE_PENDING } }]));
/** A world's declared moment capability, or undefined (no Q5 candidate). */
export const momentsCapOf = (id: string): WorldMoments | undefined => WORLD_MOMENTS[id];
