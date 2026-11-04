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
import { CHIYOGAMI } from './world-b2-chiyogami';
import { CRAYON } from './world-b2-crayon';
import { LANTERN } from './world-b2-lantern';
import { PAPERCUT } from './world-b2-papercut';
import { UKIYOE } from './world-b2-ukiyoe';
import { WOODCUT } from './world-b2-woodcut';
import type { HandGround, HandIn, ObjectPaint } from './world-craft';
import type { Piece } from './world-pieces';

interface Pack { grounds: Record<string, HandGround>; ins: Record<string, HandIn>; pieces: Record<string, Piece>; objects: Record<string, ObjectPaint> }
const PACKS: Pack[] = [UKIYOE, PAPERCUT, LANTERN, CHIYOGAMI, WOODCUT, CHALK, AIZOME, CRAYON, POPART, GAMESHOW, IDOL, Y2K, PSYCHEDELIC, GRAFFITI, BRUTALIST, CITYPOP];
export type HandObject = 'cartouche' | 'shikishi' | 'cut-panel' | 'cut-banner' | 'lit-paper' | 'noshi' | 'fold-kite' | 'colour-plate' | 'chalk-rub' | 'mend-patch' | 'tenugui' | 'pad-sheet'
  | 'pop-balloon' | 'pop-balloon-r' | 'pop-twin-balloons' | 'pop-caption' | 'quiz-card' | 'marquee-strip' | 'score-plate' | 'spot-pool' | 'uchiwa' | 'spray-patch' | 'throw-up' | 'tape-slogan' | 'cp-column';
export const handGrounds = Object.assign({}, ...PACKS.map((p) => p.grounds)) as Record<string, HandGround>;
export const handIns = Object.assign({}, ...PACKS.map((p) => p.ins)) as Record<string, HandIn>;
export const handPieces = Object.assign({}, ...PACKS.map((p) => p.pieces)) as Record<string, Piece>;
export const handObjects = Object.assign({}, ...PACKS.map((p) => p.objects)) as Record<HandObject, ObjectPaint>;
/** Objects that take the scheme's ink rather than the plate's. */
export const handInked: string[] = ['shikishi', 'noshi', 'fold-kite', 'spray-patch', 'throw-up'];
