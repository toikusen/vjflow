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
  /** How the move runs: a cut, or the world's own curve (world-cam.ts for a camera, a material move's own). */
  curve: Partial<Record<CompositionFamily, 'cut' | 'world-camera' | 'page-link' | MoveCurve>>;
  /** Regions no seat may enter, frame fractions y down. */
  protectedRegion?: { x0: number; y0: number; x1: number; y1: number }[];
  moves: Partial<Record<CompositionFamily, string>>;
  pending?: Record<string, string>;
  /**
   * The world's own material moves (Q1 phase 3b, Codex C step 4): each a family the scheduler may lay only through an
   * approved event, with its own time, curve and the regions its action keeps off. Never a keyword, never render-side.
   */
  materials?: Record<string, MaterialMove>;
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

/** How a material move runs (design-bar rule 9: the curve follows the material, never one shared ease). */
export type MoveCurve = 'chalk-erase' | 'paper-feed' | 'paper-tear' | 'panel-slide';

/**
 * A world's own move (Q1 phase 3b). `seat` says what it does to where the words are read: `over` reseats the next line on
 * a region that meets the one just sung, which is erased first (the old line's way out, its action ending as the new line
 * shows); `same` keeps the seat and changes the page under it from the switch point on (the receipt's next segment);
 * `carrier` changes what the same words stand on, on the same page, at a sung word inside the line (the words do not move).
 * `clearOfSung`: the action starts at least this long after the line before was last sung (0: once it is sung).
 * `minLine`: the shortest line that takes it. `protectedRegion`: frame fractions the action itself keeps off.
 */
export interface MaterialMove {
  family: CompositionFamily;
  at: ('section' | 'line' | 'in-line')[];
  sec: number;
  curve: MoveCurve;
  seat: 'over' | 'same' | 'carrier';
  clearOfSung: number;
  minLine?: number;
  changesLight?: boolean;
  protectedRegion?: { x0: number; y0: number; x1: number; y1: number }[];
  /** The move as the renderer names it (a world exit, a page's segment, a panel relation). */
  draws: string;
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
/** The chalk tray along the board's foot (world-b2-chalk tray, 120 px). */
const CHALK_TRAY = { x0: 0, y0: 1 - 120 / 1080, x1: 1, y1: 1 };
/** The printer's mouth along the receipt's foot (world-doc-sets MOUTH). */
const RECEIPT_MOUTH = { x0: 0, y0: 0.88, x1: 1, y1: 1 };
const DECO_FRAME = [{ x0: 0, y0: 0, x1: 1, y1: 0.09 }, { x0: 0, y0: 0.9, x1: 1, y1: 1 }, { x0: 0, y0: 0, x1: 0.05, y1: 1 }, { x0: 0.95, y0: 0, x1: 1, y1: 1 }];

export const WORLD_COMPOSITIONS: Record<string, WorldCompositions> = {
  // sheet-change: the next drawing sheet's own layout; detail-viewport: the push into a part, cut from the same sheet
  // (no invented engineering detail); the detail strip: the same sheet's note written under its drawing (phase 3a), the
  // one seat a line may take inside itself (the same sheet under the words)
  blueprint: { kinds: ['layout-seat', 'camera-reframe', 'page-handoff'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'sheet-change', 'camera-reframe': 'detail-viewport' }, pageSeats: true, protectedRegion: BLUEPRINT_BORDER },
  // board-region: left / right / centre regions of the deep green board, also at a word inside a line (the same board
  // under the words, so nothing is pulled from under them); chalk changing colour is no cut
  chalkboard: { kinds: ['layout-seat', 'camera-reframe', 'page-handoff'], carrierRole: 'ground', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'board-region' },
    // erase-reseat (phase 3b): a next region that meets the one just sung is wiped first by the board's own eraser pass
    // (its approved exit), only once the line there is sung and read still 0.35 s past its last syllable; the line being
    // sung is never touched (the wipe ends as the next line shows); the tray along the foot is never wiped over
    materials: { 'erase-reseat': { family: 'layout-seat', at: ['section', 'line'], sec: 0.42, curve: 'chalk-erase', seat: 'over', clearOfSung: 0.35, draws: 'eraser-pass', protectedRegion: [CHALK_TRAY] } } },
  // a thermal receipt: camera still, no shared page handoff (no Q4 link: WORLD_LINKS document has none), its stamp only a
  // hold. Its own page moves (phase 3b) keep the line's seat and change the paper under it, once the line before is sung:
  // tear-next tears the segment off along the tear bar (the approved part-change slip, four held steps up and left) and
  // the next line prints on fresh paper whose torn top edge stands just over it, at a part's start; feed-advance feeds
  // the printed rows up out of shot in held steps (straight up, never turning) and opens the next segment with a rule.
  // The slip only goes by over a line long enough to be read past it (1.5 s, the page's own rule)
  document: { kinds: ['page-handoff'], carrierRole: 'page', allowedAt: { 'page-handoff': ['section', 'line'] }, duration: {}, curve: {}, moves: {}, materials: {
    'tear-next': { family: 'page-handoff', at: ['section'], sec: 0.25, curve: 'paper-tear', seat: 'same', clearOfSung: 0, minLine: 1.5, changesLight: true, draws: 'tear', protectedRegion: [RECEIPT_MOUTH] },
    'feed-advance': { family: 'page-handoff', at: ['line'], sec: 0.3, curve: 'paper-feed', seat: 'same', clearOfSung: 0, minLine: 1.5, draws: 'feed', protectedRegion: [RECEIPT_MOUTH] },
  } },
  // page-turn: the Q4 fold to the top binding; margin-seat: the main column and, on the same page, the margin seat under
  // it (phase 3a), at the world's least type or more: the one seat a line may take inside itself (the same page under it)
  notebook: { kinds: ['layout-seat', 'page-handoff'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'page-handoff': ['section', 'line'] }, duration: { 'layout-seat': 0 }, curve: { 'layout-seat': 'cut', 'page-handoff': 'page-link' }, moves: { 'layout-seat': 'margin-seat', 'page-handoff': 'page-turn' }, pageSeats: true, protectedRegion: NOTEBOOK_HEAD },
  // poster-panel / frame-reseat: the approved poster's panels and frames, each a page; the secondary block on the axis
  // inside the marquee's stepped frame (phase 3a), the plaque drawn round it as set: the one seat a line may take inside
  // itself (the same frame under it). No marquee turned stage sign. carrier-swap (phase 3b, poster-panel): at a sung word
  // inside a line on a marquee, its single plaque parts into the main plaque and a stepped secondary panel under the
  // gold phrase, slid down out of the main one (ease-out, no overshoot); the words never move, the panel is the ground's
  // own black, the plaque keeps the approved board's rules and minimum width
  'art-deco': { kinds: ['layout-seat', 'camera-reframe', 'page-handoff', 'carrier-swap'], carrierRole: 'page', allowedAt: { 'layout-seat': ['section', 'line', 'in-line'], 'camera-reframe': ['section'], 'page-handoff': ['section', 'line'], 'carrier-swap': ['in-line'] }, duration: { 'layout-seat': 0, 'carrier-swap': 0.4 }, curve: { 'layout-seat': 'cut', 'camera-reframe': 'world-camera', 'page-handoff': 'page-link', 'carrier-swap': 'panel-slide' }, moves: { 'layout-seat': 'poster-panel / frame-reseat', 'carrier-swap': 'poster-panel' }, pageSeats: true, protectedRegion: DECO_FRAME,
    materials: { 'poster-panel': { family: 'carrier-swap', at: ['in-line'], sec: 0.4, curve: 'panel-slide', seat: 'carrier', clearOfSung: 0, draws: 'panels', protectedRegion: DECO_FRAME } } },
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
