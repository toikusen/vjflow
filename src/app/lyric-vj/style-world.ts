// StyleWorld: everything one style is, as data (docs/research/2026-11-01-style-standard.md §1). A style is a world with its
// own closed pool: the composer draws from nothing else, so a reroll changes the version and never leaves the world. Parts
// take the world's colours by slot; a world's sets, moves, grounds and transitions carry its id or are listed as its own.
import type { LanguageId } from './languages';
import type { Level, Recipe, WorldPool } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';
import type { SurfaceKind } from './render/world-glyph';
import type { Slots } from './render/world-objects';
import { sharedOf, steppedWorld } from './world-shared';

export type Family = 'print' | 'emissive' | 'wet' | 'stroke' | 'layered' | 'film' | 'ui' | 'wall' | 'air';
export type Band = 'dark' | 'mid' | 'light';
export interface Scheme extends Slots { id: string; what: string; band: Band; /** Which readings of a song it suits. */ mood?: 'warm' | 'cold' | 'earth' }
export interface Face { family: string; weight: number }
/** Whole-frame stack, every value set: `step` and `koma` are drawings a second, 0 for continuous. */
export interface FrameStack { grain: number; paper: number; tooth: number; lift: number; scan: number; vignette: number; flicker: number; weave: number; boil: number; boilRate: number; step: number; koma: number }
export interface LinePart {
  set: string;
  levels: Level[];
  enters: string[];
  exits: string[];
  hold: string;
  /** The ground this set needs under it (a set made of a ground). */
  ground?: string;
  min?: number;
  max?: number;
  /** Sets on a column: Han and kana only. */
  column?: boolean;
  /** Shot-size calm lines may not use it. */
  loud?: boolean;
}
export interface DecorPart { id: string; why: string; budget: string }

export interface StyleWorld {
  id: string;
  /** The buyer's name for it. */
  name: string;
  language: LanguageId;
  what: string;
  /** What the lyric is in this world. */
  lyricRole: string;
  family: Family;
  /** What this world turns away. */
  refuses: string[];
  type: { ja: Face; tc: Face; latin: string; setting: string; category: string };
  palette: Scheme[];
  groundBand: { band: Band; flip: 'none' | 'part' | 'peak'; why: string };
  material: { surface?: SurfaceKind; core: keyof Slots; engine: string; how: string };
  frameStack: FrameStack;
  timeBase: { fps: number; unit: 'glyph' | 'phrase' | 'line' | 'beat'; curve: string };
  /** Own lines, and the shared recipes this world lets in. */
  layouts: { lines: LinePart[]; shared: string[]; pair: string; carriers: string[] };
  motion: { enters: string[]; exits: string[]; holds: string[]; curve: string };
  grounds: { levels: Record<Level, string[]>; quiet: string[] };
  decor: DecorPart[];
  transitions: { line: Record<Level, string[]>; part: Record<Level, string[]>; own: string[]; banned: string[]; family: string };
  peak: { loud: string; calm: string; how: string };
  /** Big events a song gets several times, on a change of part or a key line (render/world-pieces.ts). */
  pieces: string[];
  /** The words that ask for each set piece: a song's own lyric picks them before any rotation does. */
  pieceWords?: Record<string, RegExp>;
  camera: { cams: Record<Level, string[]>; text: Record<Level, TextCamKind[]>; note: string };
  levels: Record<'0' | '1' | '2' | 'calm', string>;
  pace: { every: [number, number, number]; calmEvery: number; repose: boolean; hits: ('tile' | 'zoom')[] };
  /** World parts were derived from this physical process; nearest JIZURA concept and how ours differs. */
  provenance: { source: string; process: string; nearest: string; differs: string };
  acceptance: { fast: string; calm: string; hardest: string };
  /** Lines on a light sheet fade to it rather than go dark. */
  sheet?: boolean;
  /** Keeps the paper line-devices the print worlds were proven with (small tier, marks, rings). */
  paperDevices?: boolean;
  /** The words keep the scheme's ink wherever they stand: the world paints its own room for them. */
  ownInk?: boolean;
  /** The words are read against the plate, not the ground: the world always leaves plate round them. */
  standsOnPlate?: boolean;
  /** Lines may hand over to the next with a shared move. */
  handoffs?: boolean;
}

/** Every part a world owns, for the similarity gate and the provenance table. */
export const partsOf = (w: StyleWorld) => [...new Set([...w.layouts.lines.map((l) => l.set), ...w.layouts.lines.flatMap((l) => [...l.enters, ...l.exits, l.hold]), ...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), ...w.transitions.own, w.peak.loud, w.peak.calm, ...w.decor.map((d) => d.id), ...w.pieces])];

/** A world's own lines as composer recipes: each set takes turns through the world's entrances and exits at each level. */
export function worldRecipes(w: StyleWorld): Recipe[] {
  return w.layouts.lines.flatMap((l) => l.levels.flatMap((level) => l.enters.flatMap((enter, i) => l.exits.map((exit, j) => ({
    id: `${l.set}#${level}.${i}.${j}`,
    level,
    template: 'world-set',
    sides: ['center'],
    enter: 'cut',
    exit: 'fade',
    idle: 'still',
    method: 'color',
    mark: 'color',
    min: l.min,
    max: l.max,
    fit: l.column ? COLUMN : undefined,
    wline: { set: l.set, enter, exit, hold: l.hold, ground: l.ground, loud: l.loud },
  } as Recipe)))));
}

/** Columns are for Han and kana. */
const COLUMN = { test: (s: string) => !/[A-Za-z0-9]/.test(s) };

/** What the composer reads of a world. */
/** Which reading of a song each composer palette is. */
const MOOD: Record<string, 'warm' | 'cold' | 'earth'> = { frost: 'cold', tide: 'cold', dusk: 'warm', wine: 'warm', lacquer: 'warm', sugar: 'warm', tea: 'earth', moss: 'earth' };
/** The scheme a song opens on: one that suits its reading, a different one for a different song or version. */
export function schemeFor(w: StyleWorld, title: string, reading: string, seed: number) {
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const fits = w.palette.map((s, i) => [s, i] as const).filter(([s]) => s.mood === MOOD[reading]);
  const pool = fits.length ? fits : w.palette.map((s, i) => [s, i] as const);
  return pool[(hash(title) + seed) % pool.length][1];
}

export function poolOf(w: StyleWorld, shared: Recipe[], start = 0): WorldPool {
  return {
    start,
    pieceWords: w.pieceWords ?? {},
    id: w.id,
    recipes: [...worldRecipes(w), ...shared.filter((r) => w.layouts.shared.includes(r.id))],
    pairSet: w.layouts.pair,
    pairLine: w.layouts.lines.find((l) => l.set === w.layouts.pair) ?? w.layouts.lines[0],
    grounds: w.grounds.levels,
    quiet: w.grounds.quiet,
    peak: w.peak,
    pieces: w.pieces,
    lineIn: w.transitions.line,
    partIn: w.transitions.part,
    cams: w.camera.cams,
    textCams: w.camera.text,
    pace: w.pace,
    flip: w.groundBand.flip,
    schemes: w.palette.length,
    devices: !!w.paperDevices,
    handoffs: !!w.handoffs,
    columns: Object.fromEntries(w.layouts.lines.map((l) => [l.set, !!l.column])),
    enters: [...new Set(w.layouts.lines.flatMap((l) => l.enters))],
    exits: [...new Set(w.layouts.lines.flatMap((l) => l.exits))],
    beats: sharedOf(w).beats,
    stress: sharedOf(w).stress,
    stepped: steppedWorld(w),
  };
}

/** A hole in a world's data, or nothing: a world missing a required field does not ship. */
export function worldHoles(w: StyleWorld): string[] {
  const out: string[] = [];
  const need = (ok: unknown, what: string) => { if (!ok) out.push(`${w.id}: ${what}`); };
  need(w.lyricRole, 'lyricRole');
  need(w.refuses.length >= 5, 'refuses >= 5');
  need(w.type.ja.family && w.type.tc.family && w.type.latin, 'type in three scripts');
  need(w.palette.length >= 3, 'palette >= 3 schemes');
  need(w.material.how && w.material.engine, 'material');
  const own = w.layouts.lines.map((l) => l.set);
  need(new Set(own).size >= 3, 'own layouts >= 3');
  need(w.layouts.carriers.length >= 1, 'a world object that carries the lyric');
  need(w.motion.enters.length >= 2 && w.motion.exits.length >= 2 && w.motion.holds.length >= 1, 'motion 2/2/1');
  need(w.grounds.quiet.length >= 1 && new Set(Object.values(w.grounds.levels).flat()).size + w.grounds.quiet.length >= 2, 'grounds >= 2 with a quiet one');
  need(w.transitions.own.length >= 1 && w.transitions.banned.length >= 1, 'transitions: own and banned');
  need(w.peak.loud && w.peak.calm, 'peak, loud and calm');
  need(w.family === 'print' || w.pieces.length >= 3, 'set pieces >= 3');
  need(w.decor.every((d) => d.why), 'decor reasons');
  need(w.levels['0'] && w.levels['1'] && w.levels['2'] && w.levels.calm, 'levels');
  need(w.provenance.source && w.provenance.process, 'provenance');
  need(w.acceptance.fast && w.acceptance.calm && w.acceptance.hardest, 'acceptance');
  for (const l of [0, 1, 2] as Level[]) need(w.layouts.lines.some((x) => x.levels.includes(l)) || w.layouts.shared.length, `a line at level ${l}`);
  need(sharedOf(w).beats.length >= 2 && sharedOf(w).stress.length >= 2, 'shared beats >= 2 and stress >= 2 (world-shared.ts)');
  need(partsOf(w).length >= 12, `world parts >= 12 (has ${partsOf(w).length})`);
  return out;
}

export { type Slots };
