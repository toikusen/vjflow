// One renderer for every style world's own layouts: the set (world-sets.ts) says where a line stands, the move tables
// (world-motion.ts) how it behaves, the surface what its characters are made of, the object what carries it. A line may
// change its set on a beat while it is sung: the same words, the same reading, a new picture.
import * as THREE from 'three';
import { advanceOf, clamp01, Glyph, GlyphStyle, glyphTexture, makeGlyphs } from './glyphs';
import { nearestWeight } from '../fonts';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, givenWay, readable, readingSec, SUNG_LEAD, tagSource, TemplateRenderer } from './runtime';
import { stair } from './stair';
import { Block, blockOf, SET_SPECS, SetSpec } from './world-sets';
import { Clip, GlyphEnv, GlyphPose, hashOf, moveSec, sungAt, WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './world-motion';
import { CARRIERS, objectInk, OBJECT_MARGIN, paintObject, Slots } from './world-objects';
import { SurfaceKind, surfaceKey } from './world-glyph';
import { beatProgress, WORLD_BEATS } from './world-beats';
import { worldCam } from './world-cam';
import type { BeatKind, StressKind } from '../world-shared';
import { contrast } from '../contrast';

export interface WorldLine {
  set: string;
  enter: string;
  exit: string;
  hold: string;
  /** Sets the line moves to while it is up, at these seconds. */
  repose?: { at: number; set: string }[];
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
  /** How far the block travels while it is up, px, and how much it grows, a share. */
  drift?: [number, number];
  swell?: number;
  /** The key word blown up and the rest of the line set small round it (gap 3): its characters, and how it is stressed. */
  blow?: { from: number; to: number; stress: StressKind };
  /** The world's camera into a new part, which the line's words take with the ground (world-cam.ts): its kind and start. */
  cam?: { kind: string; at: number; dir: number };
  /** The one thing that happens while the line is held (world-beats.ts): which, when, and in steps or smooth. */
  beat?: { kind: BeatKind; at: number; stepped?: boolean };
}

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
    const cy = ((n - 1) / 2 - r) * block.size * spec.lead;
    ids.forEach((id, i) => {
      at += gaps[i];
      x[id] = at + adv[i] / 2;
      y[id] = cy + (gs[id].dy ?? 0) * k;
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
/** The colour a stress is drawn in, of the scheme's slots: it must be seen on the ground and the words must read on it, else the next stress. */
export function stressInk(kind: StressKind, ink: string, ground: string, slots: Slots, key: string): string | undefined {
  const pool = kind === 'outline' ? [key, slots.ink2, slots.accent] : kind === 'plate' ? [key, slots.accent, slots.ink2] : [slots.ink2, slots.faint, slots.plateInk, slots.accent];
  // outline sits round the letters, never under a stroke: it only has to be seen; the others lie under the edges
  return pool.find((c) => c && /^#[0-9a-f]{6}$/i.test(c) && contrast(c, ground) >= 1.4 && (kind === 'outline' || contrast(ink, c) >= 3));
}

function objectMesh(spec: SetSpec, block: Block, slots: Slots, seed: number, variant: number) {
  if (!spec.object) return undefined;
  const [px, py] = spec.pad ?? [0, 0];
  // the object takes at least its share of the frame, and stays in the frame
  // a split line's object holds its hero part only: the small part is set apart from it, or under it on the page
  const hero = block.hero ?? { cx: 0, cy: 0, w: block.w, h: block.h };
  // a carrier grows to its share only as far as it can stay centred on the words: pushed back into the frame, a big card
  // left its line at its top edge and the rest of it empty (silent-film's corner card, 2026-11-04 audit ①)
  const centred = (c: number, frame: number) => (CARRIERS.has(spec.object!) ? Math.max(0, 2 * (frame - Math.abs(c))) : Infinity);
  const [ow, oh] = [Math.max(hero.w + px * 2, Math.min(centred(block.cx + hero.cx, 960), (spec.fill?.[0] ?? 0) * 1920)), Math.max(hero.h + py * 2, Math.min(centred(block.cy + hero.cy, 540), (spec.fill?.[1] ?? 0) * 1080))];
  const cv = paintObject(spec.object, ow, oh, slots, seed, variant);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width, cv.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = LAYER;
  m.userData['noVeil'] = true;
  m.userData['decor'] = true;
  const inside = (c: number, half: number, frame: number) => (half >= frame ? -c : Math.min(frame - half, Math.max(half - frame, c)) - c);
  m.position.set(hero.cx + inside(block.cx + hero.cx, ow / 2, 960), hero.cy + inside(block.cy + hero.cy, oh / 2, 540), 0);
  return m;
}

/** Builds a line in a world. `slot` stacks it among the lines of a shared shot. */
function build(rt: CueRuntime, slot: { k: number; of: number }): CueLayer {
  const wl = rt.style.world!;
  const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
  const seed = Math.abs(Math.floor(hashOf(rt.cue.start, 43) * 1000) + (rt.song ?? 0));
  const family = rt.fonts.display;
  const specOf = (id: string): SetSpec => { const s = SET_SPECS[id] ?? Object.values(SET_SPECS)[0]; return slot.of > 1 ? { ...s, tall: s.tall / slot.of, rows: [1, Math.max(1, s.rows[1] - 1)] as [number, number], object: undefined } : s; };
  const sets = [wl.set, ...(wl.repose ?? []).map((r) => r.set)].map(specOf);
  // a line whose key word is blown up stands on the ground: its set's object stays off for its first pose
  // (a column line's blown-up word is set across: the big word reads in a row, and so does the small rest)
  // (a set laid into its page on an object of its own keeps it: a blown-up word would lose the balloon or card it is written on)
  // (nor a set whose rows each stand on a carrier of their own: a blown-up word would leave a card with nothing on it)
  // (nor one inked for a card its page draws round it: a blown-up word broke out of idol-live's ticket and gameshow's hint card)
  const blowing = !!wl.blow && slot.of === 1 && !(sets[0].fixed && (sets[0].object || sets[0].ink === 'plateInk')) && !sets[0].keepRows;
  if (blowing) sets[0] = { ...sets[0], object: undefined, tilt: 0, vertical: false, stair: 0 };
  // an even set gives every character (a quote, a space) a whole cell, so it is measured that way (poseOf)
  const measureOf = (s: SetSpec) => { const st: GlyphStyle = { family, weight: 700, size: 100, even: s.even }; return s.even ? (x: string) => [...x].length * 100 : (x: string) => [...x].reduce((w, c) => w + advanceOf(c, st), 0); };
  const blocks = sets.map((s) => blockOf(text, s, measureOf(s)));
  // (a blown-up key word is drawn from a picture its own size: never a small one stretched)
  const tex = Math.max(...blocks.map((b) => b.size), wl.blow && slot.of === 1 ? BLOW_TEX : 0);
  const slots = wl.slots;
  const carried = sets[0].object;
  // the words take the colour of what they stand on, and a line that moves off its object takes the ground's colour
  const inkOn = (s: SetSpec) => (s.ink ? slots[s.ink] : s.object ? objectInk(s.object, slots) : wl.fixedInk ? slots.ink : rt.palette.text);
  const words = inkOn(sets[0]);
  const baked = !!(wl.surface || sets.some((s) => s.surface));
  // the key reads against what is really under the words: the object's plate, the card or banners a set's page draws
  // (a set inked for the plate stands on one), else the ground (pink key letters sat on a white hint card at 2:1)
  const keyOf = (s: SetSpec) => {
    const on = s.on ?? (s.object || (s.ink === 'plateInk' && !s.under) ? ['plate' as const] : undefined);
    const base = s.key ? slots[s.key] : rt.palette.accent;
    return on ? on.reduce((c, k) => readable(c, slots[k], s.object || s.on ? 6 : 4.5), base) : readable(base, rt.palette.background, 4.5);
  };
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
  const damaged = eats ? mapsOf(true) : undefined;
  const inksBy = sets.map((_, p) => gs.map((g) => new THREE.Color(tintOf(g, p))));
  const poses: Pose[] = blocks.map((b, i) => ({ ...poseOf(gs, b, sets[i], tex), object: objectMesh(sets[i], b, slots, seed, Math.abs(Math.floor(rt.song ?? 0)) % 3) }));
  // the key word blown up: the line's first pose, on the ground (its object, if any, stays off), stressed in the world's way
  const blown = blowing ? blowPose(gs, wl.blow!.from, wl.blow!.to, blocks[0].size, tex, sets[0]) : undefined;
  if (blown) poses[0] = blown;
  const body = new THREE.Group();
  gs.forEach((g, i) => { g.index = i; body.add(g.mesh); });
  poses.forEach((p) => { if (p.object) body.add(p.object); });
  underLayers.forEach((layer) => layer.forEach((u) => body.add(u.mesh)));
  const stressCopies: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; i: number; d: { dx: number; dy: number; s: number; a: number } }[] = [];
  if (blown) {
    const groundInk = wl.fixedInk ? slots.ink : rt.palette.text;
    const kinds = [wl.blow!.stress, ...(['extrude', 'plate', 'outline'] as StressKind[]).filter((k) => k !== wl.blow!.stress)];
    const kind = kinds.find((k) => stressInk(k, groundInk, rt.palette.background, slots, keyOf(sets[0])));
    if (kind) {
      const c = stressInk(kind, groundInk, rt.palette.background, slots, keyOf(sets[0]))!;
      const keyIds = gs.map((g, i) => (g.src !== undefined && g.src >= wl.blow!.from && g.src < wl.blow!.to && g.char.trim() ? i : -1)).filter((i) => i >= 0);
      for (const d of STRESS[kind]) {
        const copies = makeGlyphs(keyIds.map((i) => gs[i].char).join(''), { family, weight, size: tex, even: sets[0].even }, c);
        copies.forEach((g, k) => { g.mesh.renderOrder = -4; g.mesh.traverse((o) => (o.renderOrder = -4)); g.mesh.visible = false; g.mesh.material.transparent = true; body.add(g.mesh); stressCopies.push({ mesh: g.mesh, i: keyIds[k], d }); });
      }
    }
  }
  const group = new THREE.Group();
  group.add(body);
  // each line of a shared shot has its own band of the set's height, so a taller neighbour can never run into it
  const firstAt = slot.of > 1 ? ((slot.of - 1) / 2 - slot.k) * Math.max(blocks[0].h + blocks[0].size * 0.4, sets[0].tall * 1080) : 0;
  // the block of glyphs is lit from where it stands, and a move's clip plane is laid in frame space from it
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const scratch = new THREE.Vector3();
  const unit = new THREE.Vector3();
  const entering = WORLD_ENTERS[wl.enter];
  const leaving = WORLD_EXITS[wl.exit];
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
  const useClip = entering?.clip || leaving?.clip;
  if (useClip) gs.forEach((g) => (g.mesh.material.clippingPlanes = [plane]));
  const caret = wl.hold === 'cursor-wait' ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color(words), transparent: true, depthTest: false, depthWrite: false })) : undefined;
  if (caret) { caret.userData['noVeil'] = true; caret.userData['decor'] = true; caret.userData['inFrame'] = true; body.add(caret); }
  // the held line's one event (world-beats.ts): its key ink per pose, a baked surface's key pictures, the copies behind
  const beatMove = wl.beat ? WORLD_BEATS[wl.beat.kind] : undefined;
  const keyCols = sets.map((s) => new THREE.Color(keyOf(s)));
  // a beat's key ink only where it reads as well as the line's own ink on what that ink was set to read on (a cut-hole
  // world's key was its sheet's colour: three lines vanished mid-roll at the reading gate, 2026-11-04)
  const backdropOf = (ink: string) => [rt.palette.background, slots.plate, slots.ground].filter((c) => /^#[0-9a-f]{6}$/i.test(c ?? '')).sort((x, y) => contrast(ink, y) - contrast(ink, x))[0];
  const keyReads = (p: number) => { const base = inkOn(sets[p]); const back = backdropOf(base); return !back || !/^#[0-9a-f]{6}$/i.test(base) || contrast(keyOf(sets[p]), back) >= 3; };
  const keyOkBy = sets.map((_, p) => keyReads(p));
  const apartBy = sets.map((_, p) => gs.map((g) => !!splitInkOf(g, p)));
  const usesKey = !!wl.beat && ['ink-run', 'light-sweep', 'roll', 'beat-punch'].includes(wl.beat.kind);
  const keyMaps = usesKey && baked ? sets.map((s, p) => gs.map((g) => glyphTexture(g.char, { ...style, surface: surfaceOf(keyOf(s), false, p) }).texture)) : undefined;
  const ghosts = wl.beat && ['echo', 'plate-slip'].includes(wl.beat.kind) ? makeGlyphs(text, { family, weight, size: tex, even: sets[0].even }, keyOf(sets[0])) : undefined;
  if (ghosts) ghosts.forEach((g) => { g.mesh.renderOrder = -3; g.mesh.traverse((o) => (o.renderOrder = -3)); g.mesh.visible = false; body.add(g.mesh); });
  const mixed = new THREE.Color();
  const poseAt = (t: number) => { let k = 0; (wl.repose ?? []).forEach((r, i) => { if (t >= r.at) k = i + 1; }); return k; };
  const sec = (x: number, d: number) => (d > 0 ? clamp01(x / d) : 1);

  const setClip = (c: Clip, p: Pose) => {
    const b = p.block;
    body.updateWorldMatrix(true, false);
    const [lo, hi] = c.axis === 'y' ? [new THREE.Vector3(0, b.h / 2 + b.size, 0), new THREE.Vector3(0, -b.h / 2 - b.size, 0)] : [new THREE.Vector3(-b.w / 2 - b.size, 0, 0), new THREE.Vector3(b.w / 2 + b.size, 0, 0)];
    const [a, z] = [body.localToWorld(lo), body.localToWorld(hi)];
    const along = z.clone().sub(a);
    const at = a.clone().add(along.clone().multiplyScalar(c.at));
    unit.copy(along).normalize().negate();
    plane.setFromNormalAndCoplanarPoint(unit, at);
  };

  return {
    group,
    // (a set laid into its page's composition is placed inside the safe area by its numbers: it is neither refitted nor drifted)
    framed: slot.of === 1 && sets.every((s) => s.fixed),
    update(t: number, _fx: FrameFx) {
      const k = poseAt(t);
      const p = poses[k];
      const live = t >= rt.showFrom;
      const gone = rt.style.exit === 'cut' ? t > rt.exitAt : t > rt.exitAt + rt.exitDur;
      body.visible = live && !gone;
      if (!body.visible) return;
      const qIn = sec(t - rt.showFrom, enterDur);
      const out = t > rt.exitAt && rt.style.exit !== 'cut';
      const qOut = out ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
      const move = out ? leaving : qIn < 1 ? entering : undefined;
      const blockPose = move?.block?.(out ? qOut : qIn, seed) ?? {};
      const [sx, sy] = [blockPose.sx ?? 1, blockPose.sy ?? 1];
      const shift = blockPose.pivot ? (blockPose.pivot * (p.block.w / 2) * (sx - 1)) : 0;
      body.position.set(p.block.cx + (blockPose.dx ?? 0) - shift, p.block.cy + firstAt + (blockPose.dy ?? 0), 0);
      const bq = beatMove && !out && wl.beat ? beatProgress(wl.beat.at, beatMove.sec, t, !!wl.beat.stepped) : undefined;
      const bb = bq !== undefined ? beatMove!.block?.(bq) : undefined;
      body.scale.set(sx * (bb?.sx ?? 1), sy * (bb?.sy ?? 1), 1);
      body.rotation.z = (p.spec.tilt ?? 0) + (blockPose.r ?? 0);
      // the camera into a new part moves the words with the frame, about the frame's centre
      const cam = wl.cam ? worldCam(wl.cam.kind, t - wl.cam.at, wl.cam.dir) : undefined;
      if (cam) {
        const [x, y] = [body.position.x, body.position.y];
        const [c, sn] = [Math.cos(cam.r), Math.sin(cam.r)];
        body.position.set((x * c - y * sn) * cam.s + cam.dx, (x * sn + y * c) * cam.s + cam.dy, 0);
        body.scale.multiplyScalar(cam.s);
        body.rotation.z += cam.r;
      }
      const whole_a = blockPose.a ?? 1;
      poses.forEach((q, i) => { if (q.object) { q.object.visible = i === k; q.object.material.opacity = whole_a; } });
      const clip = move?.clip?.(out ? qOut : qIn);
      const hasClip = !!useClip;
      if (hasClip) { if (clip) setClip(clip, p); else plane.set(unit.set(0, 1, 0), 1e6); }
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
      const inkLit = inksBy[k];
      gs.forEach((g, i) => {
        const m = g.mesh;
        // a roll call: the name before gives way as the next lands (word-sync.ts until)
        const left = synced ? givenWay(rt, g, t) : 1;
        if (ghosts) ghosts[i].mesh.visible = false;
        if (!p.shown[i] || (synced && !out && t < landAt[i]) || left <= 0) { m.visible = false; return; }
        m.visible = true;
        const qi = synced && !out ? sec(t - landAt[i], glyphIn) : qIn;
        const env: GlyphEnv = { q: out ? qOut : qi, i, n, u: p.u[i], v: p.v[i], seed, age, sung: t >= sungTimes[i] ? 1 : 0 };
        let pose: GlyphPose = (out ? leaving?.glyph?.(env) : qi < 1 ? entering?.glyph?.(env) : undefined) ?? {};
        // a line that locks word by word keeps at it after its entrance has run
        if (!out && wl.enter === 'signal-lock' && enterDur > 0) pose = entering!.glyph!(env);
        if (!out && qi >= 1 && holding) pose = { ...holding(env), ...(wl.enter === 'signal-lock' && enterDur > 0 ? pose : {}) };
        const ev = bq !== undefined && qi >= 1 ? beatMove!.glyph?.({ ...env, q: bq }) : undefined;
        if (ev) pose = { ...pose, dx: (pose.dx ?? 0) + (ev.dx ?? 0), dy: (pose.dy ?? 0) + (ev.dy ?? 0), s: (pose.s ?? 1) * (ev.s ?? 1), sy: (pose.sy ?? 1) * (ev.sy ?? 1), r: (pose.r ?? 0) + (ev.r ?? 0), tone: Math.min(pose.tone ?? 1, ev.tone ?? 1), key: ev.key, ghost: ev.ghost };
        m.position.set(p.x[i] + (pose.dx ?? 0), p.y[i] + (pose.dy ?? 0), 0);
        const s = (p.sizes?.[i] ?? p.scale) * (pose.s ?? 1);
        m.scale.set(s * (pose.sx ?? 1), s * (pose.sy ?? 1), 1);
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
        const keyed = (pose.key ?? 0) > 0 && keyOkBy[k] && !apartBy[k][i];
        const ink = keyed ? mixed.copy(inkLit[i]).lerp(keyCols[k], pose.key!) : inkLit[i];
        const map = keyed && keyMaps && pose.key! >= 0.5 ? keyMaps[k][i] : (pose.eaten && damaged ? damaged : whole)[k][i];
        if (m.material.map !== map) { m.material.map = map; m.material.needsUpdate = true; }
        const tone = Math.min(1, (pose.tone ?? 1) * rank);
        if (!baked && wl.sheet) m.material.color.copy(ink);
        if (wl.sheet) {
          m.material.opacity = (pose.a ?? 1) * whole_a * tone * left;
        } else {
          m.material.opacity = (pose.a ?? 1) * whole_a * left;
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
        c.mesh.position.set(m.position.x + c.d.dx * size, m.position.y + c.d.dy * size, 0);
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
    poses: () => poses.map((p, i) => {
      const [cx, cy, pad] = [960 + p.block.cx, 540 - (p.block.cy + firstAt), 14];
      // carried: the whole line on an opaque carrier (a split line's small part stands off it, so it is not)
      const carried = !!p.object && !p.block.small?.length && CARRIERS.has(sets[i].object!);
      return { from: i ? wl.repose![i - 1].at : rt.showFrom, to: i < poses.length - 1 ? wl.repose![i].at : rt.exitAt + rt.exitDur, rect: { x0: cx - p.block.w / 2 - pad, y0: cy - p.block.h / 2 - pad, x1: cx + p.block.w / 2 + pad, y1: cy + p.block.h / 2 + pad, carried } };
    }),
  };
}

/** A line the plan moved onto a world's shot without a stack of its own keeps to plain stepped rows. */
const orPlain = (rt: CueRuntime, slot: { k: number; of: number }) => (rt.style.world ? build(rt, slot) : stair.cue(rt));
export const worldSet: TemplateRenderer = { cue: (rt) => orPlain(rt, { k: 0, of: 1 }) };
/** Lines that share a shot, stacked in the order they are sung; the older steps back as the next one lands. */
export const worldPair: TemplateRenderer = { persist: 'shot', cue: (rt) => orPlain(rt, { k: rt.order ?? 0, of: (rt.order ?? 0) + (rt.later ?? []).length + 1 }) };
export { OBJECT_MARGIN };
