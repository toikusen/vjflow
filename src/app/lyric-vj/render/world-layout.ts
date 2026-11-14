// One renderer for every style world's own layouts: the set (world-sets.ts) says where a line stands, the move tables
// (world-motion.ts) how it behaves, the surface what its characters are made of, the object what carries it. A line may
// change its set on a beat while it is sung: the same words, the same reading, a new picture.
import * as THREE from 'three';
import { advanceOf, clamp01, Glyph, GlyphStyle, glyphTexture, makeGlyphs } from './glyphs';
import { nearestWeight } from '../fonts';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, givenWay, readingSec, SUNG_LEAD, tagSource, TemplateRenderer } from './runtime';
import { stair } from './stair';
import { Block, blockOf, FaceLayout, SET_SPECS, SetSpec, shearedSize } from './world-sets';
import { Clip, GlyphEnv, GlyphPose, hashOf, moveSec, sungAt, WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS, type WorldMove } from './world-motion';
import { CARRIERS, objectInk, OBJECT_MARGIN, paintObject, Slots } from './world-objects';
import { SurfaceKind, surfaceKey } from './world-glyph';
import { beatProgress, GROW, SPREAD, stressInk, WORLD_BEATS } from './world-beats';
import { carrierBox, carrierRoom, carrierSlots, growRoom, inkChecks, keyFor } from './hold-room';
import { readableTone } from '../measured-ink';
import { decideInk, type FxBox } from '../ink-decide';
import { laidSeat, panelSplit, slotSpec } from './seat-geometry';
export { stressInk };
import { CamRoom, worldCam } from './world-cam';
import { eraseFront } from './chalk-erase';
import type { BeatKind, StressKind } from '../world-shared';
import { contrast } from '../contrast';
import { beatUnderScale, CARRIER_STROKE, carrierPlan, SAFE_PX, scaleLayout, scalePage, type LineScale, type ScaleDraw } from './scale-pose';
import { lineMomentLift } from './line-moment';
import type { LineMoment } from '../mini-moments';

export interface WorldLine {
  set: string;
  enter: string;
  exit: string;
  hold: string;
  /** Sets the line moves to while it is up, at these seconds (a scheduled world: only the switches its event plan approved). */
  repose?: { at: number; set: string; /** A carrier move's own time and name (art-deco poster-panel), else a cut. */ sec?: number; move?: string }[];
  /**
   * The line's way out is its world's erase (Q1 phase 3b chalkboard erase-reseat): from `from` for `sec`, by the exit
   * named in `exit` (the board's eraser pass), only ever after the line is sung; the next line is set over the region.
   */
  wipe?: { from: number; sec: number; move: string };
  /** The page under the line changes at its show by the world's own move (the receipt's tear or feed): which, when, how long. */
  page?: { move: string; at: number; sec: number; draws: string };
  /** The other sets the composer found legal for the line (a scheduled world's candidates, world-events.ts); plan only. */
  seats?: string[];
  /** What its characters are made of. */
  surface?: SurfaceKind;
  /** The second colour of that surface, a slot's value. */
  core?: string;
  /** The scheme's slots this line stands on. */
  slots: Slots;
  /** Words fade into the ground here rather than go dark: a world printed on a light sheet. */
  sheet?: boolean;
  /** The lines of a shot share it, stacked (a pair sung too fast to read apart). */
  pair?: boolean;
  /** Ink on paper stays ink: the words never swap to the ground's colour, whatever passes under them. */
  fixedInk?: boolean;
  /** The world's weight for this script. */
  weight?: number;
  /** What a call beside the line is read against, when it is not the ground. */
  callOn?: string;
  /** The ink a call is set in, when it is not the accent (a receipt keeps its red for the TOTAL). */
  callInk?: string;
  /** How far the block travels while it is up, px, and how much it grows, a share. */
  drift?: [number, number];
  swell?: number;
  /** The key word blown up and the rest of the line set small round it (gap 3): its characters, and how it is stressed. */
  blow?: { from: number; to: number; stress: StressKind };
  /**
   * Q3's scale composition the song's scheduler approved for the line (render/scale-pose.ts): its big text flush on the
   * safe-area edge, the rest at reading size, its carrier running off the frame; never with a blown-up word.
   */
  scale?: LineScale;
  /** Q5's type-only mini moment on this line (render/line-moment.ts): its own words move, nothing is added. */
  moment?: LineMoment;
  /** The world's camera into a new part, which the line's words take with the ground (world-cam.ts): its kind and start. */
  cam?: { kind: string; at: number; dir: number };
  /**
   * The one thing that happens while the line is held (world-beats.ts): which, when, for how long (the plan's, else the
   * move's own), whether it stays, the phrase it names, and in steps or smooth.
   */
  beat?: { kind: BeatKind; at: number; sec?: number; stays?: boolean; span?: { from: number; to: number }; stepped?: boolean };
  /** Why the plan gave the line no event (lineplan-core beatOfLine), for the record: the reason, the families an empty
   * pool fell for, and whether the line left any event a safe window. */
  beatSkip?: string;
  beatWhy?: string[];
  beatSafe?: boolean;
  /**
   * Q1 phase 4a, a scheduled world only: the same-page seats on which the line's ink-only hold may merge with its world's
   * material move into one composite event, each with the ink the hold settles into there (lineplan-core absorbSeatsFor).
   */
  beatAbsorb?: { seats: string[]; inks: Record<string, string> };
  /** The line's scheme had a second ink for the whole line (line-ink-settle), for the record. */
  beatInk?: boolean;
  /**
   * Q1 phase 4c, a scheduled world under the joint contract only: every hold the line could take, each measured on the
   * seat it names (lineplan-core holdCandidatesOf); none is drawn. The scheduler commits one (or none) as `beat`.
   */
  holdCands?: { seat: string; beat: NonNullable<WorldLine['beat']>; beatSafe?: boolean; beatInk?: boolean; rank: number; slack: number }[];
}

/** The margin round each small word a spreading copy may not enter, a share of the word's size. */
const SPREAD_MARGIN = 0.15;
/** The glyph picture size a line with a blown-up key word is drawn from, px. */
const BLOW_TEX = 360;
const ROTATED = /[ー〜～…―‐]/;
const HIDDEN_UPRIGHT = /[、。，．,.]/;
const LAYER = -5;

interface Pose { block: Block; spec: SetSpec; x: number[]; y: number[]; turn: boolean[]; shown: boolean[]; scale: number; /** Each glyph's own scale, where a pose sets type at two sizes. */ sizes?: number[]; object?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; u: number[]; v: number[] }

/** The row (or column) of a block each glyph falls in, matched in order as poseOf matches them. */
export function rowsOfGlyphs<T extends { char: string }>(gs: T[], block: Pick<Block, 'rows'>): Map<T, number> {
  const out = new Map<T, number>();
  let p = 0;
  block.rows.forEach((row, r) => {
    for (const ch of row) {
      while (p < gs.length && gs[p].char !== ch) p++;
      if (p < gs.length) out.set(gs[p++], r);
    }
  });
  return out;
}

/** Where each glyph stands in a block, relative to the block's centre. Spaces a row break swallowed stay hidden. */
function poseOf(gs: Glyph[], block: Block, spec: SetSpec, tex: number): Pose {
  const k = block.size / tex;
  const [x, y] = [gs.map(() => 0), gs.map(() => 0)];
  const shown = gs.map(() => false);
  const turn = gs.map(() => false);
  let p = 0;
  const take = (r: string) => {
    const out: number[] = [];
    for (const ch of r) {
      while (p < gs.length && gs[p].char !== ch) p++;
      if (p < gs.length) out.push(p++);
    }
    return out;
  };
  const n = block.rows.length;
  const track = spec.track * block.size;
  const sizes = block.lines ? gs.map(() => k) : undefined;
  block.rows.forEach((row, r) => {
    const ids = take(row);
    const box = block.lines?.[r];
    if (box && sizes && box.v) {
      // a split line's column, read down from its top
      const rk = box.size / tex;
      const step = box.size * (1 + box.track);
      ids.forEach((id, i) => {
        x[id] = box.x0 + box.bw / 2;
        y[id] = box.y - (i + 0.5) * step;
        shown[id] = !HIDDEN_UPRIGHT.test(gs[id].char) && gs[id].char.trim() !== '';
        turn[id] = ROTATED.test(gs[id].char);
        sizes[id] = rk;
      });
      return;
    }
    if (box && sizes) {
      // a split line's row: its own size, its own box (world-split.ts)
      const rk = box.size / tex;
      const adv = ids.map((id) => gs[id].advance * rk);
      const gaps = ids.map((id, i) => (i ? (gs[id].gap ?? 0) * rk : 0));
      const tr = box.track * box.size;
      const w = adv.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) + Math.max(0, ids.length - 1) * tr;
      let at = box.flush < 0 ? box.x0 : box.flush > 0 ? box.x0 + box.bw - w : box.x0 + (box.bw - w) / 2;
      ids.forEach((id, i) => {
        at += gaps[i];
        x[id] = at + adv[i] / 2;
        y[id] = box.y + (gs[id].dy ?? 0) * rk;
        shown[id] = gs[id].char.trim() !== '';
        sizes[id] = rk;
        at += adv[i] + tr;
      });
      return;
    }
    if (spec.vertical) {
      const step = block.size * (1 + spec.track);
      const cx = ((n - 1) / 2 - r) * block.size * spec.lead;
      const top = block.h / 2 - (spec.stair ?? 0) * block.size * r;
      ids.forEach((id, i) => {
        x[id] = cx;
        y[id] = top - (i + 0.5) * step;
        shown[id] = !HIDDEN_UPRIGHT.test(gs[id].char) && gs[id].char.trim() !== '';
        turn[id] = ROTATED.test(gs[id].char);
      });
      return;
    }
    const adv = ids.map((id) => (spec.even ? block.size : gs[id].advance * k));
    const gaps = ids.map((id, i) => (i && !spec.even ? (gs[id].gap ?? 0) * k : 0));
    const w = adv.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) + Math.max(0, ids.length - 1) * track;
    const stepped = (spec.stair ?? 0) * block.size * r;
    const flush = spec.flush ?? 0;
    let at = (flush < 0 ? -block.w / 2 : flush > 0 ? block.w / 2 - w : -w / 2) + (flush > 0 ? -stepped : stepped);
    // (a row whose characters step down is set from the block's top: the steps take the height under the rows)
    const drop = (spec.drop ?? 0) * block.size;
    // (one that steps up is set from the block's bottom)
    const cy = drop > 0 ? block.h / 2 - (r + 0.5) * block.size * spec.lead : drop < 0 ? -block.h / 2 + (n - r - 0.5) * block.size * spec.lead : ((n - 1) / 2 - r) * block.size * spec.lead;
    ids.forEach((id, i) => {
      at += gaps[i];
      x[id] = at + adv[i] / 2;
      y[id] = cy - i * drop + (gs[id].dy ?? 0) * k;
      shown[id] = gs[id].char.trim() !== '';
      at += adv[i] + track;
    });
  });
  const u = x.map((v) => clamp01((v + block.w / 2) / Math.max(1, block.w)));
  const v = y.map((w) => clamp01((block.h / 2 - w) / Math.max(1, block.h)));
  return { block, spec, x, y, turn, shown, scale: k, ...(sizes ? { sizes } : {}), u, v };
}

/** The key word as big as the frame lets it be, read in its place: the words before it small above its left edge, the words after it small below its right edge. Undefined when the key would not stand clearly bigger. */
export function blowPose(gs: Glyph[], from: number, to: number, normal: number, tex: number, spec: SetSpec): Pose | undefined {
  const isKey = (g: Glyph) => g.src !== undefined && g.src >= from && g.src < to;
  const shown = gs.map((g) => g.char.trim() !== '');
  const key = gs.map((g, i) => (isKey(g) ? i : -1)).filter((i) => i >= 0);
  if (!key.length) return undefined;
  const pre = gs.map((_, i) => i).filter((i) => i < key[0] && shown[i]);
  const post = gs.map((_, i) => i).filter((i) => i > key.at(-1)! && shown[i]);
  const adv = (ids: number[]) => ids.reduce((w, i) => w + gs[i].advance, 0) / tex;
  const big = Math.min((0.86 * 1920) / Math.max(0.01, adv(key)), 0.44 * 1080, normal * 4.2);
  if (big < normal * 1.6) return undefined;
  const small = Math.max(40, Math.min(big * 0.3, normal * 0.75, (0.86 * 1920) / Math.max(0.01, adv(pre), adv(post))));
  const [preH, postH] = [pre.length ? small * 1.3 : 0, post.length ? small * 1.3 : 0];
  const h = preH + big + postH;
  const wk = adv(key) * big;
  const x = gs.map(() => 0), y = gs.map(() => 0), sizes = gs.map(() => small / tex);
  const row = (ids: number[], size: number, left: number, cy: number) => { let at = left; for (const i of ids) { const a = (gs[i].advance / tex) * size; x[i] = at + a / 2; y[i] = cy; sizes[i] = size / tex; at += a; } return at - left; };
  row(key, big, -wk / 2, h / 2 - preH - big / 2);
  row(pre, small, -wk / 2, h / 2 - small * 0.65);
  const wp = adv(post) * small;
  row(post, small, wk / 2 - wp, -h / 2 + small * 0.65);
  // the words before run right from the key's left edge and the words after left from its right edge: a short key with a
  // long lead-in ran off the frame (チョロイン c043 on a file sheet), so the pose is centred on everything it holds
  const [lo, hi] = [Math.min(-wk / 2, wk / 2 - wp), Math.max(wk / 2, -wk / 2 + adv(pre) * small)];
  const mid = (lo + hi) / 2;
  if (mid) for (let i = 0; i < x.length; i++) x[i] -= mid;
  const w = hi - lo;
  // a space inside the key run (a Latin phrase) is placed but not drawn
  const block: Block = { rows: [], size: big, w, h, cx: 0, cy: 0 };
  return { block, spec: { ...spec, vertical: false, object: undefined, tilt: 0 }, x, y, turn: gs.map(() => false), shown, scale: small / tex, sizes, u: x.map((v) => clamp01((v + w / 2) / w)), v: y.map((v) => clamp01((h / 2 - v) / h)) };
}

/** The copies behind a blown-up key word, by stress: offsets and sizes in shares of its size, and their opacity. */
const STRESS: Record<StressKind, { dx: number; dy: number; s: number; a: number }[]> = {
  // a press's extrusion: the block's side, stacked down and to the right
  extrude: Array.from({ length: 7 }, (_, k) => ({ dx: 0.012 * (k + 1), dy: -0.012 * (k + 1), s: 1, a: 1 })),
  // the second plate printed off register
  plate: [{ dx: 0.045, dy: -0.035, s: 1, a: 1 }],
  // light round the letters, twice, fainter outward
  outline: [{ dx: 0, dy: 0, s: 1.07, a: 0.34 }, { dx: 0, dy: 0, s: 1.15, a: 0.16 }],
};

function objectMesh(spec: SetSpec, block: Block, slots: Slots, seed: number, variant: number) {
  if (!spec.object) return undefined;
  // the object takes at least its share of the frame, and stays in the frame (hold-room.ts carrierBox)
  const { ow, oh, x, y } = carrierBox(spec, block)!;
  const cv = paintObject(spec.object, ow, oh, slots, seed, variant);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width, cv.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = LAYER;
  m.userData['noVeil'] = true;
  m.userData['decor'] = true;
  m.position.set(x, y, 0);
  return m;
}

/**
 * The extrudes declared part of the reading glyph (ruling 2026-11-13 §1, docs/research/2026-11-13-ink-halo-codex.md): a
 * world's stress copies of this kind, laid with exactly these STRESS steps, in one of these faces, at a glyph size in
 * this range (frame px), are merged with their face into the glyph the ink gate reads; any other copy is interference.
 * Declared here, before any verdict, never added after seeing a fail.
 * popart: the press's 7-step extrude, as the 2026-11-04 accept shows it; the card names no sizes or faces, so the range is
 * the blown key word's (blowPose) and the faces the free popart job's, owner to confirm.
 */
export const READING_EXTRUDE: { world: string; stress: StressKind; steps: { dx: number; dy: number; s: number; a: number }[]; fonts: string[]; size: [number, number] }[] = [
  { world: 'popart', stress: 'extrude', steps: Array.from({ length: 7 }, (_, k) => ({ dx: 0.012 * (k + 1), dy: -0.012 * (k + 1), s: 1, a: 1 })), fonts: ['Noto Sans TC', 'Noto Serif JP'], size: [120, 760] },
];
/** Whether a world's stress copies are a declared reading extrude (READING_EXTRUDE). */
export const readingExtrude = (world: string, stress: StressKind, steps: { dx: number; dy: number; s: number; a: number }[], font: string, size: number) =>
  READING_EXTRUDE.some((d) => d.world === world && d.stress === stress && d.fonts.includes(font) && size >= d.size[0] && size <= d.size[1] && JSON.stringify(d.steps) === JSON.stringify(steps));

/** A ring under at least this share of its letter's ink lies under the letter (a keyline, a band); less, it is laid off it (a misprint, a drop shadow). */
const RING_UNDER = 0.97;
/** The worlds whose ground cuts a room of its own material round a line (uncut wood, a crayon bubble, undyed cloth, the lit opening). */
const ROOM_FOLLOWS = new Set(['woodcut', 'crayon', 'aizome', 'paper-lantern']);
/** QA only (the reveal timing comparison, reveal-timing.mts): __vjFadeReveal draws the fades as they were before 2026-11-14. */
const fading = () => !!(globalThis as { __vjFadeReveal?: boolean }).__vjFadeReveal;
/**
 * A glyph's or a block's opacity as drawn: the opaque reveal (owner, 2026-11-14, every world): never part-way, a glyph
 * is there (from its fade's middle) or not, its move kept, so an entrance or an exit never shows the words see-through.
 */
/** Under this share of its size along either axis, a glyph or a line in its own move is not drawn (the opaque reveal). */
export const READ_SCALE = 0.5;
export const stepA = (a: number) => (fading() ? a : a >= 0.5 ? 1 : 0);
/** Builds a line in a world. `slot` stacks it among the lines of a shared shot. */
function build(rt: CueRuntime, slot: { k: number; of: number }): CueLayer {
  const wl0 = rt.style.world!;
  const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
  const seed = Math.abs(Math.floor(hashOf(rt.cue.start, 43) * 1000) + (rt.song ?? 0));
  const family = rt.fonts.display;
  // (lines sharing a shot split the set: rows stack in its height, but columns stand side by side in its width, read
  // right to left; halving a column's height set a shared vertical sign at a third of its size)
  const specOf = (id: string): SetSpec => slotSpec(SET_SPECS[id] ?? Object.values(SET_SPECS)[0], slot);
  const sets = [wl0.set, ...(wl0.repose ?? []).map((r) => r.set)].map(specOf);
  // a line whose key word is blown up stands on the ground: its set's object stays off for its first pose
  // (a column line's blown-up word is set across: the big word reads in a row, and so does the small rest)
  // (a set laid into its page on an object of its own keeps it: a blown-up word would lose the balloon or card it is written on)
  // (nor a set whose rows each stand on a carrier of their own: a blown-up word would leave a card with nothing on it)
  // (nor one inked for a card its page draws round it: a blown-up word broke out of idol-live's ticket and gameshow's hint card)
  const blowing = !wl0.scale && !!wl0.blow && slot.of === 1 && !(sets[0].fixed && (sets[0].object || sets[0].ink === 'plateInk')) && !sets[0].keepRows;
  if (blowing) sets[0] = { ...sets[0], object: undefined, tilt: 0, vertical: false, stair: 0 };
  // an even set gives every character (a quote, a space) a whole cell, so it is measured that way (poseOf)
  const measureOf = (s: SetSpec) => { const st: GlyphStyle = { family, weight: 700, size: 100, even: s.even }; return s.even ? (x: string) => [...x].length * 100 : (x: string) => [...x].reduce((w, c) => w + advanceOf(c, st), 0); };
  // Q3's scale composition, laid again on the real glyphs from the set's own reading size (one pose, the line's whole
  // reading: never with a change of set inside it); under 1.6× it is not drawn and the line stands as composed
  const laid: ScaleDraw | undefined = wl0.scale && slot.of === 1 && !wl0.repose?.length ? scaleLayout(rt.cue.text, wl0.scale, blockOf(text, sets[0], measureOf(sets[0])).size, sets[0], measureOf({ ...sets[0], even: false })) : undefined;
  // (a composition its page carries is drawn only on the whole page laid again round it, render/page-layout.ts: with no
  // legal page the composition is not drawn at all and the line stands on its original page, whole; never half of it)
  const paged = laid && wl0.scale ? scalePage(wl0.scale, laid, rt.cue.id) : undefined;
  const scaled: ScaleDraw | undefined = paged && !paged.ok ? { size: laid!.size, ratio: 1, planned: laid!.planned, unrealized: true, kind: 'miss', glyphs: [], why: paged.why.join('; ') } : laid;
  const scaling = !!scaled && scaled.kind !== 'miss';
  // (a composition not drawn on the real glyphs gives the line back the line-grow it folded: never neither, beatUnderScale)
  const restored = beatUnderScale(wl0.scale, scaled?.kind, wl0.beat as LineScale['folded']) as WorldLine['beat'];
  const wl: WorldLine = restored === wl0.beat ? wl0 : { ...wl0, beat: restored };
  // (the composition is upright, unsplit and unmoved on its edge: the set's own lean, column and drift would carry it off)
  if (scaling) sets[0] = { ...sets[0], tilt: 0, vertical: false, stair: 0, drop: 0, shear: undefined, split: undefined, rowInk: undefined, fixed: true, even: false };
  const blocks = sets.map((s) => blockOf(text, s, measureOf(s)));
  // (a blown-up key word is drawn from a picture its own size: never a small one stretched)
  const tex = Math.max(...blocks.map((b) => b.size), wl.blow && slot.of === 1 ? BLOW_TEX : 0, scaling ? Math.ceil(scaled!.size) : 0);
  const slots = wl.slots;
  const carried = sets[0].object;
  // the key reads against what is really under the words: the object's plate, the card or banners a set's page draws
  // (a set inked for the plate stands on one), else the ground (pink key letters sat on a white hint card at 2:1)
  // what the renderer sees under a line that the plan does not (hold-room.ts Seen)
  const seen = { background: rt.palette.background, under: rt.under, accent: rt.palette.accent };
  // (what each pose's words stand on: its carrier, else the background and what the picture puts there; a dimmed glyph
  // still reads on all of it, readableTone)
  const standsOn = (s: SetSpec) => { const on = carrierSlots(s); return on ? on.map((k) => slots[k]) : [seen.background ?? slots.ground, ...(seen.under ?? [])]; };
  // the words take the colour of what they stand on, and a line that moves off its object takes the ground's colour
  const inkOn0 = (s: SetSpec) => (s.ink ? slots[s.ink] : s.object ? objectInk(s.object, slots) : wl.fixedInk ? slots.ink : rt.palette.text);
  // (M3, opt-in treatment.inkDecide: each pose's ink as decideInk takes it, on what the pose stands on through the final
  // effects the job meets; its own first, a small move, then the world's: one ink a pose, never chased frame by frame)
  const inkFx = (globalThis as { __vjInkFx?: FxBox }).__vjInkFx;
  const worldInks = [slots.ink, slots.plateInk, slots.plate, slots.accent, slots.ink2];
  const decided = new Map<SetSpec, string>();
  const inkOn = (s: SetSpec) => (inkFx ? decided.get(s) ?? (decided.set(s, decideInk(inkOn0(s), standsOn(s), inkFx, worldInks).ink), decided.get(s)!) : inkOn0(s));
  const words = inkOn(sets[0]);
  const baked = !!(wl.surface || sets.some((s) => s.surface));
  // the key reads on what is really under the words: the object's plate, the card or banners a set's page draws, else the
  // background and what the picture puts there (hold-room.ts keyFor)
  const keyOf0 = (s: SetSpec) => keyFor(s, slots, inkOn(s), seen);
  const keys = new Map<SetSpec, string>();
  const keyOf = (s: SetSpec) => (inkFx ? keys.get(s) ?? (keys.set(s, decideInk(keyOf0(s), standsOn(s), inkFx, worldInks).ink), keys.get(s)!) : keyOf0(s));
  // a key phrase that is most of the line marks nothing: the whole line in the accent is only a louder line
  const keySpan = [...rt.cue.text].filter((_, i) => emphasisOf(rt, i) === 'color').length;
  const marks = keySpan > 0 && keySpan <= 0.6 * [...text.replace(/\s/g, '')].length;
  const surfaceOf = (tint: string, eaten = false, p = 0) => { const kind = sets[p].surface ?? wl.surface; const core = sets[p].core ? slots[sets[p].core!] : wl.core ?? slots.ink2; return kind ? surfaceKey({ kind, tint, core, eaten }) : undefined; };
  const weight = nearestWeight(family, sets[0].weight ?? wl.weight ?? 700);
  const style: GlyphStyle = { family, weight, size: tex, even: sets[0].even, surface: surfaceOf(words) };
  const gs = makeGlyphs(text, style, baked ? 'white' : color(words));
  tagSource(gs, rt.cue.text);
  // a set may ink each row apart (a file's second entry in stamp red, a pair's second card): only the rows in the set's
  // own ink take the key, the others keep their row's ink (a blown-up key word stands on the ground in the set's ink)
  const rowIds = sets.map((s, p) => (s.rowInk && !(p === 0 && blowing) ? rowsOfGlyphs(gs, blocks[p]) : undefined));
  const rowInkOf = (g: Glyph, p: number) => { const r = sets[p].rowInk; const ids = rowIds[p]; if (!r || !ids) return undefined; return r[Math.min(r.length - 1, ids.get(g) ?? 0)]; };
  // a split line's small part may take an ink of its own (world-split.ts)
  const smallIds = blocks.map((b, p) => (b.small && sets[p].split?.ink ? rowsOfGlyphs(gs, b) : undefined));
  const splitInkOf = (g: Glyph, p: number) => { const ids = smallIds[p]; return ids && blocks[p].small!.includes(ids.get(g) ?? -1) ? slots[sets[p].split!.ink!] : undefined; };
  const tintOf = (g: Glyph, p: number) => {
    const apart = splitInkOf(g, p);
    if (apart) return apart;
    const row = rowInkOf(g, p);
    const own = !row || row === (sets[p].ink ?? sets[p].rowInk![0]);
    return own && marks && g.src !== undefined && emphasisOf(rt, g.src) === 'color' ? keyOf(sets[p]) : row ? slots[row] : inkOn(sets[p]);
  };
  const eats = ['signal-lock', 'detune', 'carrier-lost'].includes(wl.enter) || wl.exit === 'carrier-lost';
  // an emphasised character is its own picture on a world with a material, and each pose its own ink
  const mapsOf = (eaten: boolean) => sets.map((_, p) => gs.map((g) => (baked ? glyphTexture(g.char, { ...style, surface: surfaceOf(tintOf(g, p), eaten, p) }).texture : g.mesh.material.map!)));
  const whole = mapsOf(false);
  // a set's rings under its letters (world-glyph-loud.ts): a layer is one picture a glyph, each layer laid under the next and
  // all of them under every letter, so a ring never crosses a letter, its own or its neighbour's
  const unders = sets.map((st, p) => (st.under ?? []).map((u) => gs.map((g) => glyphTexture(g.char, { ...style, surface: surfaceKey({ kind: u.kind, tint: slots[u.tone], core: tintOf(g, p), eaten: false }) }).texture)));
  const underLayers = Array.from({ length: Math.max(0, ...unders.map((u) => u.length)) }, (_, L) => makeGlyphs(text, { family, weight, size: tex, even: sets[0].even }, 'white').map((u) => { const o = -4.8 + L * 0.2; u.mesh.renderOrder = o; u.mesh.traverse((x) => (x.renderOrder = o)); u.mesh.visible = false; u.mesh.userData['noVeil'] = true; return u; }));
  // (a layer a set names as the letters' carrier, a sticker's backing, is what the words stand on: kept when they are taken away to be read)
  underLayers.forEach((layer, L) => { if (sets.some((st) => st.under?.[L]?.carrier)) layer.forEach((u) => (u.mesh.userData['decor'] = true)); });
  // (every ring is what its letter is read on: the measured ink probe keeps them all when it takes the words away, engine wordsAway)
  /** Whether ring layer L lies under (nearly) all of its letters' ink on pose 0's first glyphs: a ground, not a shadow. */
  function ringUnder(L: number): boolean {
    const ids = gs.flatMap((g, i) => (g.char.trim() && unders[0][L]?.[i] ? [i] : [])).slice(0, 3);
    const share = ids.map((i) => {
      const [a, b] = [whole[0][i]?.image, unders[0][L][i].image] as (HTMLCanvasElement | OffscreenCanvas | undefined)[];
      if (!a || !b || !('getContext' in a) || !('getContext' in b)) return 1;
      const ctx = (c: HTMLCanvasElement | OffscreenCanvas) => c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      const [da, db] = [ctx(a).getImageData(0, 0, a.width, a.height).data, ctx(b).getImageData(0, 0, b.width, b.height).data];
      let [n, on] = [0, 0];
      const step = Math.max(1, Math.floor(Math.min(a.width, a.height) / 60));
      for (let y = 0; y < a.height; y += step)
        for (let x = 0; x < a.width; x += step) {
          if (da[(y * a.width + x) * 4 + 3] < 128) continue;
          n++;
          const [rx, ry] = [Math.round(x - a.width / 2 + b.width / 2), Math.round(y - a.height / 2 + b.height / 2)];
          if (rx >= 0 && ry >= 0 && rx < b.width && ry < b.height && db[(ry * b.width + rx) * 4 + 3] >= 128) on++;
        }
      return n ? on / n : 1;
    });
    return !share.length || Math.min(...share) >= RING_UNDER;
  }
  // (a ring that lies under the whole of its letter, a keyline or a band grown round it, is what the letter is read on: the
  // measured ink probe keeps it when it takes the words away, engine wordsAway; a ring laid off the letter, a misprint or a
  // drop shadow, is mostly hidden behind it and is not its ground)
  // (reading roles, ruling 2026-11-13 §1: a ring under the letter is its outline, the reading underlay; one laid off it a copy)
  underLayers.forEach((layer, L) => { const ground = ringUnder(L); layer.forEach((u) => Object.assign(u.mesh.userData, ground ? { ring: true, part: 'outline' } : { copy: true, part: 'copy' })); });
  const damaged = eats ? mapsOf(true) : undefined;
  const inksBy = sets.map((_, p) => gs.map((g) => new THREE.Color(tintOf(g, p))));
  const poses: Pose[] = blocks.map((b, i) => ({ ...poseOf(gs, b, sets[i], tex), object: objectMesh(sets[i], b, slots, seed, Math.abs(Math.floor(rt.song ?? 0)) % 3) }));
  // the key word blown up: the line's first pose, on the ground (its object, if any, stays off), stressed in the world's way
  const blown = blowing ? blowPose(gs, wl.blow!.from, wl.blow!.to, blocks[0].size, tex, sets[0]) : undefined;
  if (blown) poses[0] = blown;
  // (a set whose words ride an object keeps it, laid again round the composition: its carrierId stays, no card left empty)
  if (scaling) { const sp = scalePose(gs, scaled!, tex, sets[0]); poses[0] = { ...sp, object: objectMesh(sets[0], sp.block, slots, seed, Math.abs(Math.floor(rt.song ?? 0)) % 3) }; }
  const carrier = scaling ? scaleCarrier(scaled!, wl, slots, [...new Set(gs.map((g, i) => (poses[0].shown[i] ? tintOf(g, 0) : '')).filter(Boolean))]) : undefined;
  if (carrier) carrier.mesh.position.x -= poses[0].block.cx, carrier.mesh.position.y -= poses[0].block.cy;
  const body = new THREE.Group();
  gs.forEach((g, i) => { g.index = i; body.add(g.mesh); });
  poses.forEach((p) => { if (p.object) body.add(p.object); });
  // (in a decor group of its own: the line's own measures, its frame and safe-area checks among them, read its words only;
  // the carrier runs off the frame by design)
  if (carrier) { const g = new THREE.Group(); g.userData['decor'] = true; g.add(carrier.mesh); body.add(g); }
  underLayers.forEach((layer) => layer.forEach((u) => body.add(u.mesh)));
  const stressCopies: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; i: number; d: { dx: number; dy: number; s: number; a: number } }[] = [];
  let stressed: StressKind | undefined;
  if (blown) {
    const groundInk = wl.fixedInk ? slots.ink : rt.palette.text;
    const kinds = [wl.blow!.stress, ...(['extrude', 'plate', 'outline'] as StressKind[]).filter((k) => k !== wl.blow!.stress)];
    const kind = kinds.find((k) => stressInk(k, groundInk, rt.palette.background, slots, keyOf(sets[0])));
    stressed = kind;
    if (kind) {
      const c = stressInk(kind, groundInk, rt.palette.background, slots, keyOf(sets[0]))!;
      const keyIds = gs.map((g, i) => (g.src !== undefined && g.src >= wl.blow!.from && g.src < wl.blow!.to && g.char.trim() ? i : -1)).filter((i) => i >= 0);
      // (a declared extrude is part of the key's reading glyph; any other stress copy is interference: READING_EXTRUDE)
      const sizePx = Math.max(0, ...keyIds.map((i) => (blown.sizes?.[i] ?? blown.scale) * tex));
      const part = readingExtrude(wl0.set.split('/')[0], kind, STRESS[kind], family, sizePx) ? 'extrude' : 'copy';
      for (const d of STRESS[kind]) {
        const copies = makeGlyphs(keyIds.map((i) => gs[i].char).join(''), { family, weight, size: tex, even: sets[0].even }, c);
        copies.forEach((g, k) => { g.mesh.userData['copy'] = true; g.mesh.userData['part'] = part; g.mesh.renderOrder = -4; g.mesh.traverse((o) => (o.renderOrder = -4)); g.mesh.visible = false; g.mesh.material.transparent = true; body.add(g.mesh); stressCopies.push({ mesh: g.mesh, i: keyIds[k], d }); });
      }
    }
  }
  const group = new THREE.Group();
  group.add(body);
  // each line of a shared shot has its own band of the set's height, so a taller neighbour can never run into it
  const sideBySide = slot.of > 1 && !!sets[0].vertical;
  const firstAt = slot.of > 1 && !sideBySide ? ((slot.of - 1) / 2 - slot.k) * Math.max(blocks[0].h + blocks[0].size * 0.4, sets[0].tall * 1080) : 0;
  const firstX = sideBySide ? ((slot.of - 1) / 2 - slot.k) * Math.max(blocks[0].w + blocks[0].size * 0.6, sets[0].share * 1920) : 0;
  // the block of glyphs is lit from where it stands, and a move's clip plane is laid in frame space from it
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const scratch = new THREE.Vector3();
  const unit = new THREE.Vector3();
  // (a composition its page carries comes and goes as a cut over its move's own time: a move that carries the glyphs
  // (a rise, a slide, a swell) would take them off the carrier laid round them, render/page-layout.ts; the declared
  // scale curve is `cut`, world-shared WORLD_SCALE)
  const pageCut = scaling && !!paged?.ok;
  const entering = pageCut ? cutOf(WORLD_ENTERS[wl.enter], 'in') : WORLD_ENTERS[wl.enter];
  // (a line its world erases goes by the one eraser front, chalk-erase.ts, not by its exit's own glyph move)
  const leaving = wl.wipe ? undefined : pageCut ? cutOf(WORLD_EXITS[wl.exit], 'out') : WORLD_EXITS[wl.exit];
  const holding = WORLD_HOLDS[wl.hold];
  const need = readingSec(rt.cue.text, rt.cue.start, rt.cue.end);
  const room = () => Math.max(0, rt.exitAt - rt.showFrom - need);
  const enterDur = rt.style.enter === 'cut' && entering ? moveSec(entering.sec, room(), Math.max(0.6, rt.pace)) : 0;
  const n = gs.length;
  const sungTimes = gs.map((g, i) => sungAt(g.src ?? i, [...rt.cue.text].length, rt.cue.start, rt.cue.end, rt.cue.charStarts));
  // word sync (the paid director's, on the server's sung times): the set's block comes in as one, but each character
  // is held back until its own voice and then runs the set's entrance from there
  const synced = rt.style.reveal === 'sung';
  const landAt = sungTimes.map((s) => Math.max(rt.showFrom, s - SUNG_LEAD));
  const glyphIn = Math.max(0.18, enterDur);
  const dimBaked = new THREE.Color(0.1, 0.1, 0.1);
  const lit = new THREE.Color(1, 1, 1);
  const useClip = entering?.clip || leaving?.clip || wl.wipe;
  if (useClip) gs.forEach((g) => (g.mesh.material.clippingPlanes = [plane]));
  if (wl.wipe) underLayers.forEach((layer) => layer.forEach((u) => (u.mesh.material.clippingPlanes = [plane])));
  const caret = wl.hold === 'cursor-wait' ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color(words), transparent: true, depthTest: false, depthWrite: false })) : undefined;
  if (caret) { caret.userData['noVeil'] = true; caret.userData['decor'] = true; caret.userData['inFrame'] = true; body.add(caret); }
  // the held line's one event (world-beats.ts): its key ink per pose, a baked surface's key pictures, the copies behind
  const beatMove = wl.beat ? WORLD_BEATS[wl.beat.kind] : undefined;
  // what each set's words may do with their inks (hold-room.ts inkChecks, the plan's own test): every new ink, a passing
  // key run's too, reads at 4.5:1 on every ground under the words (a key run at 3:1 on silk's top-slab read low, 大雪
  // c028, 2026-11-09 review; a phrase swapped on the palette's ground came out low on silk's edge-bleed band)
  const inks = sets.map((s) => inkChecks(s, slots, inkOn(s), seen));
  const settleBy = inks.map((x) => x.settle);
  const settling = wl.beat?.kind === 'line-ink-settle';
  const keyCols = sets.map((s, p) => new THREE.Color(settling ? settleBy[p] ?? inkOn(s) : keyOf(s)));
  const keyOkBy = inks.map((x) => x.keyOk);
  const apartBy = sets.map((_, p) => gs.map((g) => !!splitInkOf(g, p)));
  const usesKey = !!wl.beat && ['ink-run', 'light-sweep', 'roll', 'beat-punch', 'ink-swap', 'line-ink-settle'].includes(wl.beat.kind);
  const beatSec = wl.beat?.sec ?? beatMove?.sec ?? 0;
  const stays = !!beatMove?.stays;
  const span = wl.beat?.span;
  const inSpan = gs.map((g) => (span && g.src !== undefined && g.src >= span.from && g.src < span.to ? 1 : 0));
  const swapOkBy = inks.map((x) => x.swapOk);
  // the pose the event lands in
  const beatPose = wl.beat ? (wl.repose ?? []).filter((r) => wl.beat!.at >= r.at).length : 0;
  const keyMaps = usesKey && baked ? sets.map((s, p) => gs.map((g) => glyphTexture(g.char, { ...style, surface: surfaceOf(settling ? settleBy[p] ?? inkOn(s) : keyOf(s), false, p) }).texture)) : undefined;
  const ghosts = wl.beat && ['echo', 'plate-slip'].includes(wl.beat.kind) ? makeGlyphs(text, { family, weight, size: tex, even: sets[0].even }, keyOf(sets[0])) : undefined;
  if (ghosts) ghosts.forEach((g) => { g.mesh.userData['copy'] = true; g.mesh.userData['part'] = 'copy'; g.mesh.renderOrder = -3; g.mesh.traverse((o) => (o.renderOrder = -3)); g.mesh.visible = false; body.add(g.mesh); });
  const mixed = new THREE.Color();
  const poseAt = (t: number) => { let k = 0; (wl.repose ?? []).forEach((r, i) => { if (t >= r.at) k = i + 1; }); return k; };
  const sec = (x: number, d: number) => (d > 0 ? clamp01(x / d) : 1);

  // a set seen at an angle or leaning (world-sets `shear`): the block is drawn through the map about its own centre, after
  // its move, its camera and its scale (the map is given y down; the scene is y up)
  const sheared = new THREE.Matrix4();
  const shearBody = (sh: SetSpec['shear']) => {
    body.matrixAutoUpdate = !sh;
    if (!sh) return;
    const [a, b, c, d] = sh;
    sheared.set(a, -c, 0, 0, -b, d, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    body.matrix.compose(new THREE.Vector3(), body.quaternion, body.scale).premultiply(sheared).setPosition(body.position);
    body.matrixWorldNeedsUpdate = true;
  };

  const setClip = (c: Clip, p: Pose) => {
    const b = p.block;
    body.updateWorldMatrix(true, false);
    const [lo, hi] = c.axis === 'y' ? [new THREE.Vector3(0, b.h / 2 + b.size, 0), new THREE.Vector3(0, -b.h / 2 - b.size, 0)] : [new THREE.Vector3(-b.w / 2 - b.size, 0, 0), new THREE.Vector3(b.w / 2 + b.size, 0, 0)];
    // (whole rows only: a cut through a row moves to that row's leading edge, so the row is not shown until it is whole)
    let k = c.at;
    if (c.rows && c.axis === 'y' && k > 0 && k < 1) {
      const span = lo.y - hi.y;
      const cut = lo.y - span * k;
      for (let i = 0; i < p.y.length; i++) {
        if (!p.shown[i]) continue;
        const half = ((p.sizes?.[i] ?? p.scale) * tex) / 2;
        if (p.y[i] + half > cut && p.y[i] - half < cut) k = Math.min(k, (lo.y - (p.y[i] + half)) / span);
      }
    }
    const [a, z] = [body.localToWorld(lo), body.localToWorld(hi)];
    const along = z.clone().sub(a);
    const at = a.clone().add(along.clone().multiplyScalar(k));
    unit.copy(along).normalize().negate();
    plane.setFromNormalAndCoplanarPoint(unit, at);
  };

  const restRects = (grown = true) => poses.map((p, i) => {
    const [cx0, cy0, pad] = [960 + p.block.cx + firstX, 540 - (p.block.cy + firstAt), 14];
    // carried: the whole line on an opaque carrier (a split line's small part stands off it, so it is not)
    const carried = !!p.object && !p.block.small?.length && CARRIERS.has(sets[i].object!);
    // the room the line is read in covers the whole of its slow travel and its swell, not only where it starts: a
    // drifting column walked off the uncut wood round it onto the gouges (woodcut), the paper room left behind
    // (only the hand worlds that cut a room of their own material round the words: elsewhere the box stays where the
    // line stands, so ukiyoe's approved kasumi and cards keep their measure)
    const [gx, gy] = p.spec.fixed || !ROOM_FOLLOWS.has(wl.set.split('/')[0]) ? [0, 0] : wl.drift ?? [0, 0];
    const reach = (d: number, c: number, half: number, frame: number) => Math.min(Math.abs(d), 2 * Math.max(0, frame - 24 - Math.abs(c) - half)) / 2;
    const grow = 1 + (p.spec.fixed || !ROOM_FOLLOWS.has(wl.set.split('/')[0]) ? 0 : wl.swell ?? 0);
    // (a sheared block's room is what it covers as drawn; its page is handed the layout to build its planes round the words)
    const sh = p.spec.shear;
    const [bw, bh] = shearedSize(p.block.w, p.block.h, sh);
    // (a block that will grow is read, and its page drawn round it, at its grown size from the start)
    const g = grown && i >= beatPose ? growTo() : 1;
    const [hw, hh] = [(bw / 2) * grow * g + reach(gx, p.block.cx, bw / 2, 960), (bh / 2) * grow * g + reach(gy, p.block.cy, bh / 2, 540)];
    // (it grows from the side its set is anchored on: that edge stays put)
    const [cx, cy] = [cx0 - p.spec.ax * (bw / 2) * grow * (g - 1), cy0 - p.spec.ay * (bh / 2) * grow * (g - 1)];
    // (a scale composition its page carries hands the page its glyphs, upright, and the edge it may bleed through: the
    // page is laid again whole round them, render/page-layout.ts)
    const pageScale = scaling && i === 0 && paged?.ok ? { edge: wl.scale!.edge, line: rt.cue.id, show: rt.showFrom } : undefined;
    const fsh: SetSpec['shear'] | undefined = sh ?? (pageScale ? [1, 0, 0, 1] : undefined);
    const face: FaceLayout | undefined = fsh && { cx, cy, w: p.block.w * g, h: p.block.h * g, shear: fsh, size: p.block.size * g, rows: Math.max(1, p.block.rows.length), cells: gs.flatMap((_, j) => (p.shown[j] ? [[p.x[j] * g, -p.y[j] * g, (p.sizes?.[j] ?? p.scale) * tex * g] as [number, number, number]] : [])), line: rt.cue.id, show: rt.showFrom, ...(pageScale ? { scale: pageScale } : {}) };
    // (a set carried on panels, art-deco poster-panel: which part each cell is, and when the panels part, for the page)
    if (face && sets[i].panels && p.block.small?.length) {
      const row = rowsOfGlyphs(gs, p.block);
      face.parts = gs.flatMap((gl, j) => (p.shown[j] ? [p.block.small!.includes(row.get(gl) ?? -1) ? 1 : 0] : []));
      face.panels = { from: i ? wl.repose![i - 1].at : rt.showFrom, sec: i ? wl.repose![i - 1].sec ?? 0 : 0 };
      // (the plaque and the panel as the scheduler offered them: the one split of seat-geometry, on this layout's measure)
      // (never round a block that grows: the split is laid at its own size, and the scheduler pins a line with a hold)
      const boxes = g === 1 ? panelSplit(laidSeat(text, sets[i], { measure: measureOf(sets[i]) }), [firstX, -firstAt]) : undefined;
      if (boxes) face.panelBoxes = boxes;
    }
    // (the last pose of a line its world erases carries the wipe: the board wipes its own marks by the same front)
    const wiped = wl.wipe && i === poses.length - 1 ? { wipe: { from: wl.wipe.from, sec: wl.wipe.sec } } : {};
    return { from: i ? wl.repose![i - 1].at : rt.showFrom, to: i < poses.length - 1 ? wl.repose![i].at : rt.exitAt + rt.exitDur, rect: { x0: cx - hw - pad, y0: cy - hh - pad, x1: cx + hw + pad, y1: cy + hh + pad, carried, ...(face ? { face } : {}), ...wiped } };
  });
  // the camera into a new part never carries the first line's box out of the frame (world-cam.ts camReach)
  let camRoom: CamRoom | undefined;

  // How far the settling events may go, worked out once from the line as it is set (undefined: not this line's event).
  const objectBase = poses.map((p) => p.object?.position.clone());
  let grown: number | undefined;
  /** The block's grown size: the plan's want, less what the frame's safe edge and the page's graphics leave; 1 when under the least. */
  const growTo = () => {
    if (grown !== undefined) return grown;
    grown = 1;
    // (a scale composition never grows on top of its own ratio)
    if (wl.beat?.kind !== 'line-grow' || slot.of > 1 || scaling) return grown;
    const r = restRects(false)[beatPose]?.rect;
    if (!r) return grown;
    grown = growRoom(r, { ...poses[beatPose].spec, clear: sets[beatPose].clear });
    return grown;
  };
  const growShare = () => (growTo() - 1) / (GROW.want - 1);
  let spreadK: number | undefined;
  /** How far the copies behind a blown-up word may spread: never into the margin round a small word they did not reach before. */
  const spreadTo = () => {
    if (spreadK !== undefined) return spreadK;
    spreadK = 1;
    if (wl.beat?.kind !== 'plate-spread' || !blown || (stressed !== 'extrude' && stressed !== 'plate') || !stressCopies.length) return spreadK;
    const p = poses[0];
    const box = (i: number, dx = 0, dy = 0) => { const h = ((p.sizes?.[i] ?? p.scale) * tex) / 2; return { x0: p.x[i] + dx - h, x1: p.x[i] + dx + h, y0: p.y[i] + dy - h, y1: p.y[i] + dy + h }; };
    const rest = gs.map((_, i) => i).filter((i) => p.shown[i] && !stressCopies.some((c) => c.i === i)).map((i) => { const b = box(i); const m = SPREAD_MARGIN * (b.x1 - b.x0); return { x0: b.x0 - m, x1: b.x1 + m, y0: b.y0 - m, y1: b.y1 + m }; });
    const meets = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const at = (f: number) => stressCopies.map((c) => { const size = (p.sizes?.[c.i] ?? p.scale) * tex; return box(c.i, c.d.dx * size * f, c.d.dy * size * f); });
    const before = at(1);
    const fits = (f: number) => at(f).every((b, j) => rest.every((r) => meets(before[j], r) || !meets(b, r)));
    for (let f = SPREAD.want; f >= SPREAD.least - 1e-9; f -= 0.05) if (fits(f)) return (spreadK = f);
    return spreadK;
  };
  const spreadShare = () => (spreadTo() - 1) / (SPREAD.want - 1);
  let carried_: { dx: number; dy: number; ox: number; sx: number } | null | undefined;
  /**
   * Where the line's own carrier may go: it slides along its slack round the words (never leaving less than its margin
   * past them) toward the frame's middle, or opens past the edge with more frame beyond it. Null: not this line's event.
   */
  const carrierMove = () => {
    if (carried_ !== undefined) return carried_ ?? undefined;
    carried_ = null;
    const p = poses[beatPose];
    const kind = wl.beat?.kind;
    if ((kind !== 'carrier-settle' && kind !== 'panel-open') || !p?.object) return undefined;
    carried_ = carrierRoom(kind, sets[beatPose], p.block, seed, [firstX, firstAt]) ?? null;
    return carried_ ?? undefined;
  };

  // (a scale composition's glyphs as inked, em boxes in frame px: its glyph pictures carry a wide transparent pad, which
  // a measure of the meshes reads as 50–160 px out of the frame on a composition flush with the safe edge)
  // (where each glyph is in its own life on the last frame drawn, its entrance or exit running or at rest, and its drawn
  // opacity's multipliers: glyphBoxes, the ink gate's diagnosis, ruling 2026-11-13 §3)
  const phase = gs.map((): 'enter' | 'exit' | 'rest' => 'rest');
  const alphaOf = gs.map(() => ({ pose: 1, block: 1, left: 1, tone: 1 }));
  // (the ink each glyph was drawn in on the last frame: the probe reads that colour as the glyph's, not a copy behind it)
  const drawnInk = gs.map(() => 0);
  const glyphBoxes = () => {
    const v = new THREE.Vector3();
    const ws = new THREE.Vector3();
    const seen = (o: THREE.Object3D | null): boolean => !o || (o.visible && seen(o.parent));
    return gs.flatMap((g, i) => {
      if (!g.char.trim() || !seen(g.mesh) || g.mesh.material.opacity <= 0.01) return [];
      g.mesh.updateWorldMatrix(true, false);
      g.mesh.getWorldPosition(v);
      g.mesh.getWorldScale(ws);
      const half = (Math.abs(ws.y) * tex) / 2;
      const [x, y] = [v.x + 960, 540 - v.y];
      return [{ i, x0: x - half, y0: y - half, x1: x + half, y1: y + half, a: g.mesh.material.opacity, moving: phase[i] !== 'rest', phase: phase[i], alpha: { ...alphaOf[i] }, ink: `#${drawnInk[i].toString(16).padStart(6, '0')}` }];
    });
  };
  const inkBoxes = () => {
    const v = new THREE.Vector3();
    const ws = new THREE.Vector3();
    // (seen: the glyph and every group above it shown, an entrance's hidden body included)
    const seen = (o: THREE.Object3D | null): boolean => !o || (o.visible && seen(o.parent));
    return gs.flatMap((g) => {
      if (!seen(g.mesh) || g.mesh.material.opacity <= 0.01) return [];
      g.mesh.updateWorldMatrix(true, false);
      g.mesh.getWorldPosition(v);
      g.mesh.getWorldScale(ws);
      const half = (Math.abs(ws.y) * tex) / 2;
      const [x, y] = [v.x + 960, 540 - v.y];
      return [{ x0: x - half, y0: y - half, x1: x + half, y1: y + half }];
    });
  };
  const self: CueLayer = {
    group,
    // (a set laid into its page's composition is placed inside the safe area by its numbers: it is neither refitted nor drifted)
    framed: slot.of === 1 && sets.every((s) => s.fixed),
    update(t: number, _fx: FrameFx) {
      const k = poseAt(t);
      const p = poses[k];
      const live = t >= rt.showFrom;
      // (an erased line goes by its world's erase, whatever its style's exit: world-events wipe)
      const gone = rt.style.exit === 'cut' && !wl.wipe ? t > rt.exitAt : t > rt.exitAt + rt.exitDur;
      body.visible = live && !gone;
      if (!body.visible) return;
      const qIn = sec(t - rt.showFrom, enterDur);
      const out = t > rt.exitAt && (rt.style.exit !== 'cut' || !!wl.wipe);
      const qOut = out ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
      const move = out ? leaving : qIn < 1 ? entering : undefined;
      const blockPose = move?.block?.(out ? qOut : qIn, seed) ?? {};
      const [sx, sy] = [blockPose.sx ?? 1, blockPose.sy ?? 1];
      // (a line squashed under half its size by its own move is not there: the opaque reveal steps a squash as it steps a
      // fade; a squelch drew 6 %-high glyphs with no pixel of their own to read, ruling 2026-11-13 §3)
      const squashed = !!move && !fading() && Math.min(Math.abs(sx), Math.abs(sy)) < READ_SCALE;
      const shift = blockPose.pivot ? (blockPose.pivot * (p.block.w / 2) * (sx - 1)) : 0;
      body.position.set(p.block.cx + firstX + (blockPose.dx ?? 0) - shift, p.block.cy + firstAt + (blockPose.dy ?? 0), 0);
      const bq = beatMove && (!out || stays) && wl.beat ? beatProgress(wl.beat.at, beatSec, t, !!wl.beat.stepped, stays) : undefined;
      const bb0 = bq !== undefined ? beatMove!.block?.(bq) : undefined;
      // (a block that grows grows only as far as the frame and its page leave it: growTo)
      const bb = bb0 && wl.beat!.kind === 'line-grow' ? { sx: 1 + ((bb0.sx ?? 1) - 1) * growShare(), sy: 1 + ((bb0.sy ?? 1) - 1) * growShare() } : bb0;
      body.scale.set(sx * (bb?.sx ?? 1), sy * (bb?.sy ?? 1), 1);
      if (bb && wl.beat!.kind === 'line-grow') body.position.add(scratch.set(-p.spec.ax * (p.block.w / 2) * ((bb.sx ?? 1) - 1), p.spec.ay * (p.block.h / 2) * ((bb.sy ?? 1) - 1), 0));
      body.rotation.z = (p.spec.tilt ?? 0) + (blockPose.r ?? 0);
      // the camera into a new part moves the words with the frame, about the frame's centre
      const cam = wl.cam ? worldCam(wl.cam.kind, t - wl.cam.at, wl.cam.dir, (camRoom ??= restRects()[0]?.rect)) : undefined;
      if (cam) {
        const [x, y] = [body.position.x, body.position.y];
        const [c, sn] = [Math.cos(cam.r), Math.sin(cam.r)];
        body.position.set((x * c - y * sn) * cam.s + cam.dx, (x * sn + y * c) * cam.s + cam.dy, 0);
        body.scale.multiplyScalar(cam.s);
        body.rotation.z += cam.r;
      }
      shearBody(p.spec.shear);
      // (the opaque reveal: a line comes and goes in steps, never see-through)
      const whole_a = squashed ? 0 : stepA(blockPose.a ?? 1);
      poses.forEach((q, i) => { if (q.object) { q.object.visible = i === k; q.object.material.opacity = whole_a; } });
      if (carrier) carrier.mesh.material.opacity = whole_a;
      // the line's own carrier settles or opens under the words (the words stay where they are)
      const cm = bq !== undefined && k === beatPose ? beatMove!.carrier?.(bq) : undefined;
      if (p.object && objectBase[k]) {
        const mv = k === beatPose ? carrierMove() : undefined;
        const [slide, open] = [cm?.slide ?? 0, cm?.open ?? 0];
        p.object.position.set(objectBase[k]!.x + (mv?.dx ?? 0) * slide + (mv?.ox ?? 0) * open, objectBase[k]!.y + (mv?.dy ?? 0) * slide, 0);
        p.object.scale.set(1 + (mv?.sx ?? 0) * open, 1, 1);
      }
      const clip = move?.clip?.(out ? qOut : qIn);
      const hasClip = !!useClip;
      if (hasClip) { if (clip) setClip(clip, p); else plane.set(unit.set(0, 1, 0), 1e6); }
      // the eraser's front: everything of the line right of it is wiped (one front for every row and the board's marks)
      if (wl.wipe && t >= wl.wipe.from) {
        const r = restRects().at(-1)!.rect;
        group.updateWorldMatrix(true, false);
        const at = group.localToWorld(scratch.set(eraseFront(t, wl.wipe, r.x0, r.x1) - 960, 0, 0));
        plane.setFromNormalAndCoplanarPoint(unit.set(-1, 0, 0), at);
      }
      // (the earlier line of a shared shot steps back for the later one only once its own reading time is over: dimmed
      // while still read, it fell under the reading gate, citypop tsuzuki c001)
      const rank = slot.of > 1 && (rt.later ?? []).length === 0 ? 1 : slot.of > 1 && t >= rt.exitAt && (rt.later ?? []).some((a) => t >= a + 0.2) ? 0.6 : 1;
      const age = t - rt.showFrom;
      // a slow travel while the line is up: the block never sits dead, and the reader's eye goes with it
      const span = Math.max(0.5, rt.exitAt - rt.showFrom);
      const along = clamp01(age / span) - 0.5;
      // (never further than the frame leaves it)
      const fit = (d: number, c: number, half: number, frame: number) => Math.sign(d) * Math.min(Math.abs(d), 2 * Math.max(0, frame - 24 - Math.abs(c) - half));
      // (a set laid into its page's composition holds its place: the page is printed round it)
      const [gx, gy] = p.spec.fixed ? [0, 0] : wl.drift ?? [0, 0];
      body.position.x += fit(gx, p.block.cx, p.block.w / 2, 960) * along;
      body.position.y += fit(gy, p.block.cy, p.block.h / 2, 540) * along;
      const swell = 1 + (p.spec.fixed ? 0 : wl.swell ?? 0) * (along + 0.5);
      body.scale.multiplyScalar(swell);
      shearBody(p.spec.shear);
      const inkLit = inksBy[k];
      gs.forEach((g, i) => {
        const m = g.mesh;
        // a roll call: the name before gives way as the next lands (word-sync.ts until)
        // (the opaque reveal: a name giving way is there, until its give-way's middle, or gone; never a see-through multiplier)
        const left = stepA(synced ? givenWay(rt, g, t) : 1);
        if (ghosts) ghosts[i].mesh.visible = false;
        if (!p.shown[i] || (synced && !out && t < landAt[i]) || left <= 0) { m.visible = false; return; }
        m.visible = true;
        const qi = synced && !out ? sec(t - landAt[i], glyphIn) : qIn;
        phase[i] = out ? 'exit' : qi < 1 ? 'enter' : 'rest';
        const env: GlyphEnv = { q: out ? qOut : qi, i, n, u: p.u[i], v: p.v[i], seed, age, sung: t >= sungTimes[i] ? 1 : 0 };
        let pose: GlyphPose = (out ? leaving?.glyph?.(env) : qi < 1 ? entering?.glyph?.(env) : undefined) ?? {};
        // a line that locks word by word keeps at it after its entrance has run
        if (!out && wl.enter === 'signal-lock' && enterDur > 0) pose = entering!.glyph!(env);
        if (!out && qi >= 1 && holding) pose = { ...holding(env), ...(wl.enter === 'signal-lock' && enterDur > 0 ? pose : {}) };
        const ev = bq !== undefined && qi >= 1 ? beatMove!.glyph?.({ ...env, q: bq, span: inSpan[i] }) : undefined;
        if (ev) pose = { ...pose, dx: (pose.dx ?? 0) + (ev.dx ?? 0), dy: (pose.dy ?? 0) + (ev.dy ?? 0), s: (pose.s ?? 1) * (ev.s ?? 1), sy: (pose.sy ?? 1) * (ev.sy ?? 1), r: (pose.r ?? 0) + (ev.r ?? 0), tone: Math.min(pose.tone ?? 1, ev.tone ?? 1), key: ev.key, ghost: ev.ghost };
        // (a type-only mini moment: the line's own words move, in ems of their own size)
        const lift = wl.moment && g.src !== undefined ? lineMomentLift(wl.moment, t, g.src, [...rt.cue.text].length) * (p.sizes?.[i] ?? p.scale) * tex : 0;
        m.position.set(p.x[i] + (pose.dx ?? 0), p.y[i] + (pose.dy ?? 0) + lift, 0);
        const s = (p.sizes?.[i] ?? p.scale) * (pose.s ?? 1);
        m.scale.set(s * (pose.sx ?? 1), s * (pose.sy ?? 1), 1);
        // (a glyph its own move squashes under half its size is not there either)
        const glyphSquashed = (out || qi < 1) && !fading() && Math.min(Math.abs((pose.s ?? 1) * (pose.sx ?? 1)), Math.abs((pose.s ?? 1) * (pose.sy ?? 1))) < READ_SCALE;
        m.rotation.z = (p.turn[i] ? -Math.PI / 2 : 0) + (pose.r ?? 0);
        const gh = ghosts?.[i].mesh;
        if (gh) {
          gh.visible = !!pose.ghost && pose.ghost.a > 0.01;
          if (gh.visible) {
            const gs_ = s * (pose.ghost!.s ?? 1);
            gh.position.set(m.position.x + (pose.ghost!.dx ?? 0), m.position.y + (pose.ghost!.dy ?? 0), 0);
            gh.scale.set(gs_, gs_, 1);
            gh.rotation.z = m.rotation.z;
            gh.material.transparent = true;
            gh.material.opacity = pose.ghost!.a * whole_a * left;
          }
        }
        // (a split line's part on a carrier of its own keeps its own ink: the key was read for the set's carrier)
        const keyed = (pose.key ?? 0) > 0 && (wl.beat?.kind === 'ink-swap' ? swapOkBy[k] : settling ? !!settleBy[k] : keyOkBy[k]) && !apartBy[k][i];
        const ink = keyed ? mixed.copy(inkLit[i]).lerp(keyCols[k], pose.key!) : inkLit[i];
        drawnInk[i] = ink.getHex();
        const map = keyed && keyMaps && pose.key! >= 0.5 ? keyMaps[k][i] : (pose.eaten && damaged ? damaged : whole)[k][i];
        if (m.material.map !== map) { m.material.map = map; m.material.needsUpdate = true; }
        // (the tone dims the ink toward its shadow, a colour, never an opacity: on a sheet it was opacity, the words
        // see-through; with the opaque reveal a sheet's words keep their ink)
        const tone0 = Math.min(1, (pose.tone ?? 1) * rank);
        // (dimmed only as far as it still reads on what it stands on: a step-back or an unsung word is still a lyric)
        const tone = fading() || wl.sheet ? tone0 : readableTone(baked ? tintOf(g, k) : `#${drawnInk[i].toString(16).padStart(6, '0')}`, standsOn(sets[k]), tone0, baked ? 0.1 : 0.14);
        alphaOf[i] = { pose: stepA(pose.a ?? 1), block: whole_a, left, tone: wl.sheet && !fading() ? 1 : tone };
        if (!baked && wl.sheet) m.material.color.copy(ink);
        if (wl.sheet) {
          m.material.opacity = glyphSquashed ? 0 : stepA(pose.a ?? 1) * whole_a * (fading() ? tone * left : 1);
        } else {
          m.material.opacity = glyphSquashed ? 0 : stepA(pose.a ?? 1) * whole_a * (fading() ? left : 1);
          if (baked) m.material.color.copy(dimBaked).lerp(lit, tone);
          else m.material.color.copy(ink).multiplyScalar(0.14).lerp(ink, tone);
        }
      });
      underLayers.forEach((layer, L) => layer.forEach((u, i) => {
        const m = gs[i].mesh;
        const map = unders[k][L]?.[i];
        u.mesh.visible = !!map && m.visible && m.material.opacity > 0.01;
        if (!u.mesh.visible) return;
        if (u.mesh.material.map !== map) { u.mesh.material.map = map!; u.mesh.material.needsUpdate = true; }
        u.mesh.position.copy(m.position);
        u.mesh.scale.copy(m.scale);
        u.mesh.rotation.z = m.rotation.z;
        u.mesh.material.opacity = m.material.opacity;
        u.mesh.material.color.copy(m.material.color);
      }));
      for (const c of stressCopies) {
        const m = gs[c.i].mesh;
        c.mesh.visible = k === 0 && m.visible && m.material.opacity > 0.01;
        if (!c.mesh.visible) continue;
        const size = (p.sizes?.[c.i] ?? p.scale) * tex;
        // (the copies spread further out, as far as the small words round the key leave them: spreadTo)
        const f = bq !== undefined && beatMove!.spread ? 1 + (beatMove!.spread(bq) - 1) * spreadShare() : 1;
        c.mesh.position.set(m.position.x + c.d.dx * size * f, m.position.y + c.d.dy * size * f, 0);
        c.mesh.scale.set(m.scale.x * c.d.s, m.scale.y * c.d.s, 1);
        c.mesh.rotation.z = m.rotation.z;
        c.mesh.material.opacity = c.d.a * m.material.opacity;
      }
      if (caret) {
        const last = [...gs.keys()].reverse().find((i) => p.shown[i]) ?? 0;
        caret.visible = qIn >= 1 && !out && Math.floor(age * 2.2) % 2 === 0;
        const size = (p.sizes?.[last] ?? p.scale) * tex;
        caret.position.set(p.x[last] + size * 0.86, p.y[last] - size * 0.02, 0);
        caret.scale.set(size * 0.56, size * 0.96, 1);
      }
    },
    readable: () => [rt.showFrom + enterDur, rt.exitAt],
    poses: restRects,
    glyphBoxes,
    glyphMeshes: () => gs.flatMap((g, i) => (g.char.trim() ? [{ i, mesh: g.mesh as THREE.Mesh }] : [])),
    // (each glyph's parts by reading role: its stress copies, its rings, its echo; the ink gate's parts mask)
    glyphParts: () => [
      ...stressCopies.map((c) => ({ i: c.i, mesh: c.mesh as THREE.Mesh, role: c.mesh.userData['part'] as 'extrude' | 'copy' })),
      ...underLayers.flatMap((layer) => layer.map((u, i) => ({ i, mesh: u.mesh as THREE.Mesh, role: u.mesh.userData['part'] as 'outline' | 'copy' }))),
      ...(ghosts ?? []).map((g, i) => ({ i, mesh: g.mesh as THREE.Mesh, role: 'copy' as const })),
    ],
    ...(scaling ? { inkRect: () => {
      const bs = inkBoxes();
      return bs.length ? bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) })) : undefined;
    }, inkBoxes } : {}),
    ...(scaled ? { scale: { eventId: wl.scale!.eventId, planned: scaled.planned, drawn: scaled.kind === 'miss' ? 0 : scaled.ratio, kind: scaled.kind, unrealized: scaled.unrealized, carrier: carrier?.why ?? ({ page: 'page: re-laid round the words', object: 'object: re-laid round the words', sheet: 'none' } as const)[carrierPlan(wl.scale!, SET_SPECS[wl.set]?.object)], inkBox: scaled.inkBox, safe: SAFE_PX, glyphBox: scaled.glyphBox, inSafe: scaled.inSafe, ...(scaled.why ? { why: scaled.why } : {}) } } : {}),
  };
  return self;
}

/** A move as a still cut over its own time (a linked move unchanged: its words do not move): shown from the start going in, gone halfway going out. */
export const cutOf = (m: WorldMove | undefined, way: 'in' | 'out'): WorldMove | undefined => (!m || m.link ? m : { sec: m.sec, block: (q) => ({ a: way === 'in' ? (q > 0.02 ? 1 : 0) : q < 0.5 ? 1 : 0 }) });

/** The scale composition as a pose: every glyph where scaleLayout put it, about the composition's own centre. */
function scalePose(gs: Glyph[], d: ScaleDraw, tex: number, spec: SetSpec): Pose {
  const at = new Map(d.glyphs.map((g) => [g.i, g]));
  const placed = gs.map((g) => (g.src !== undefined ? at.get(g.src) : undefined));
  const boxes = placed.filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ x0: p.x - p.size / 2, x1: p.x + p.size / 2, y0: p.y - p.size / 2, y1: p.y + p.size / 2 }));
  const u = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  // (frame px y down to the scene's y up about the frame's centre; the block's centre is the union of what is drawn)
  const [cx, cy] = [(u.x0 + u.x1) / 2 - 960, 540 - (u.y0 + u.y1) / 2];
  const [w, h] = [u.x1 - u.x0, u.y1 - u.y0];
  const x = placed.map((p) => (p ? p.x - 960 - cx : 0));
  const y = placed.map((p) => (p ? 540 - p.y - cy : 0));
  const block: Block = { rows: [], size: d.size, w, h, cx, cy };
  return { block, spec, x, y, turn: gs.map(() => false), shown: placed.map((p, i) => !!p && gs[i].char.trim() !== ''), scale: d.size / tex, sizes: placed.map((p) => (p ? p.size / tex : 0)), u: x.map((v) => clamp01((v + w / 2) / Math.max(1, w))), v: y.map((v) => clamp01((h / 2 - v) / Math.max(1, h))) };
}

/**
 * The carrier under a scale composition, run off the frame on its edge's side (Codex §1, the world's `carrierRole`): a
 * sheet of the world's paper with its second plate's edge printed just off register (riso), a comic panel tier with its
 * black frame line (screentone). It is drawn only in a fill every ink of the line reads on at 4.5:1; else none, and the
 * words stand on the ground as composed. Decor: the reading checks keep it when they take the words away.
 */
function scaleCarrier(d: ScaleDraw, wl: WorldLine, slots: Slots, inks: string[]): { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; why: string } | undefined {
  // (a page that lays its own carrier round the words re-lays it round the composition: nothing is painted over it)
  if (carrierPlan(wl.scale!, wl.set ? SET_SPECS[wl.set]?.object : undefined) !== 'sheet') return undefined;
  const role = wl.scale!.carrierRole;
  const b = d.carrierBox!;
  const fills = [...new Set(role === 'panel' || role === 'plate' ? [slots.plate, slots.ground] : [slots.ground, slots.plate])];
  const fill = fills.find((f) => inks.every((i) => contrast(i, f) >= 4.5));
  if (!fill) return undefined;
  const [x0, y0, x1, y1] = [b.x0 * 1920, b.y0 * 1080, b.x1 * 1920, b.y1 * 1080];
  const [w, h] = [Math.max(2, Math.round(x1 - x0)), Math.max(2, Math.round(y1 - y0))];
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.fillStyle = fill;
  c.fillRect(0, 0, w, h);
  const edge = d.edge!;
  // (the inner sides: the ones that stay on the frame; the side off the frame is never seen)
  const inner = { top: edge !== 'top', bottom: edge !== 'bottom', left: edge !== 'left', right: edge !== 'right' };
  if (role === 'panel') {
    // a panel's frame line, 7 px as the world's own panels (style-worlds-b5 screentone), with the page's white gutter outside
    c.strokeStyle = slots.ink;
    c.lineWidth = CARRIER_STROKE.panel;
    const k = CARRIER_STROKE.panel / 2;
    c.beginPath();
    if (inner.top) { c.moveTo(0, k); c.lineTo(w, k); }
    if (inner.bottom) { c.moveTo(0, h - k); c.lineTo(w, h - k); }
    if (inner.left) { c.moveTo(k, 0); c.lineTo(k, h); }
    if (inner.right) { c.moveTo(w - k, 0); c.lineTo(w - k, h); }
    c.stroke();
  } else {
    // the sheet's edge printed again in the second plate, a few px off register, outside the words' guard
    c.strokeStyle = slots.accent;
    c.lineWidth = CARRIER_STROKE.plate;
    const q = CARRIER_STROKE.plateOffset;
    c.beginPath();
    if (inner.top) { c.moveTo(0, q); c.lineTo(w, q); }
    if (inner.bottom) { c.moveTo(0, h - q); c.lineTo(w, h - q); }
    if (inner.left) { c.moveTo(q, 0); c.lineTo(q, h); }
    if (inner.right) { c.moveTo(w - q, 0); c.lineTo(w - q, h); }
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = LAYER - 0.5;
  mesh.userData['noVeil'] = true;
  mesh.userData['decor'] = true;
  mesh.position.set((x0 + x1) / 2 - 960, 540 - (y0 + y1) / 2, 0);
  return { mesh, why: `${role} in ${fill}` };
}

/** A line the plan moved onto a world's shot without a stack of its own keeps to plain stepped rows. */
const orPlain = (rt: CueRuntime, slot: { k: number; of: number }) => (rt.style.world ? build(rt, slot) : stair.cue(rt));
export const worldSet: TemplateRenderer = { cue: (rt) => orPlain(rt, { k: 0, of: 1 }) };
/** Lines that share a shot, stacked in the order they are sung; the older steps back as the next one lands. */
export const worldPair: TemplateRenderer = { persist: 'shot', cue: (rt) => orPlain(rt, { k: rt.order ?? 0, of: (rt.order ?? 0) + (rt.later ?? []).length + 1 }) };
export { OBJECT_MARGIN };
