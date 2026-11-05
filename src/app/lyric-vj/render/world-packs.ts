// Style batches 2 and 3's parts, one file a world, gathered here for the registries in world-grounds, world-pieces and world-objects.
import { AIZOME } from './world-b2-aizome';
import { BRUTALIST } from './world-b3-brutalist';
import { CITYPOP } from './world-b3-citypop';
import { GAMESHOW } from './world-b3-gameshow';
import { GRAFFITI } from './world-b3-graffiti';
import { IDOL } from './world-b3-idol';
import { POPART } from './world-b3-popart';
import { PSYCHEDELIC } from './world-b3-psychedelic';
import { Y2K } from './world-b3-y2k';
import { CHALK } from './world-b2-chalk';
import { CARD } from './world-r2-card';
import { FILE } from './world-r2-file';
import { GLASS } from './world-r2-glass';
import { CHIYOGAMI } from './world-b2-chiyogami';
import { CRAYON } from './world-b2-crayon';
import { LANTERN } from './world-b2-lantern';
import { PAPERCUT } from './world-b2-papercut';
import { UKIYOE } from './world-b2-ukiyoe';
import { WOODCUT } from './world-b2-woodcut';
import { DOCUMENT } from './world-doc-receipt';
import type { HandGround, HandIn, ObjectPaint } from './world-craft';
import type { Piece } from './world-pieces';
import { B3_MIRRORS } from './world-b3-sets';
import { mirrorGround } from './world-b3-shared';
import { CEL } from './world-b4-cel';
import { CYAN } from './world-b4-cyan';
import { ISO } from './world-b4-iso';

interface Pack { grounds: Record<string, HandGround>; ins: Record<string, HandIn>; pieces: Record<string, Piece>; objects: Record<string, ObjectPaint> }
const PACKS: Pack[] = [UKIYOE, PAPERCUT, LANTERN, CHIYOGAMI, WOODCUT, CHALK, AIZOME, CRAYON, POPART, GAMESHOW, IDOL, Y2K, PSYCHEDELIC, GRAFFITI, BRUTALIST, CITYPOP, FILE, CARD, GLASS, CYAN, ISO, CEL, DOCUMENT];
export type HandObject = 'cartouche' | 'shikishi' | 'cut-panel' | 'cut-banner' | 'lit-paper' | 'noshi' | 'fold-kite' | 'colour-plate' | 'mend-patch' | 'tenugui' | 'pad-sheet'
  | 'pop-balloon' | 'pop-balloon-r' | 'pop-twin-balloons' | 'pop-caption' | 'gs-q-banner' | 'gs-answer-cells' | 'gs-row-tiles' | 'gs-qa' | 'gs-qa-r' | 'gs-hint' | 'idol-card' | 'gf-buff' | 'cp-column';
export const handGrounds = Object.assign({}, ...PACKS.map((p) => p.grounds)) as Record<string, HandGround>;
// batch 3's mirrored pages (world-b3-sets.ts B3_MIRRORS)
for (const g of new Set(Object.values(B3_MIRRORS))) handGrounds[`${g}-r`] = mirrorGround(handGrounds[g]);
export const handIns = Object.assign({}, ...PACKS.map((p) => p.ins)) as Record<string, HandIn>;
export const handPieces = Object.assign({}, ...PACKS.map((p) => p.pieces)) as Record<string, Piece>;
export const handObjects = Object.assign({}, ...PACKS.map((p) => p.objects)) as Record<HandObject, ObjectPaint>;
/** Objects that take the scheme's ink rather than the plate's. */
export const handInked: string[] = ['shikishi', 'noshi', 'fold-kite'];
