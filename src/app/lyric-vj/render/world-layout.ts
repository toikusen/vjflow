// One renderer for every style world's own layouts: the set (world-sets.ts) says where a line stands, the move tables
// (world-motion.ts) how it behaves, the surface what its characters are made of, the object what carries it. A line may
// change its set on a beat while it is sung: the same words, the same reading, a new picture.
import * as THREE from 'three';
import { advanceOf, clamp01, Glyph, GlyphStyle, glyphTexture, makeGlyphs } from './glyphs';
import { nearestWeight } from '../fonts';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, readable, readingSec, tagSource, TemplateRenderer } from './runtime';
import { stair } from './stair';
import { Block, blockOf, SET_SPECS, SetSpec } from './world-sets';
import { Clip, GlyphEnv, GlyphPose, hashOf, moveSec, sungAt, WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './world-motion';
import { objectInk, OBJECT_MARGIN, paintObject, Slots } from './world-objects';
import { SurfaceKind, surfaceKey } from './world-glyph';

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
}

const ROTATED = /[ー〜～…―‐]/;
const HIDDEN_UPRIGHT = /[、。，．,.]/;
const LAYER = -5;

interface Pose { block: Block; spec: SetSpec; x: number[]; y: number[]; turn: boolean[]; shown: boolean[]; scale: number; object?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; u: number[]; v: number[] }

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
  block.rows.forEach((row, r) => {
    const ids = take(row);
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
  return { block, spec, x, y, turn, shown, scale: k, u, v };
}

function objectMesh(spec: SetSpec, block: Block, slots: Slots, seed: number, variant: number) {
  if (!spec.object) return undefined;
  const [px, py] = spec.pad ?? [0, 0];
  // the object takes at least its share of the frame, and stays in the frame
  const [ow, oh] = [Math.max(block.w + px * 2, (spec.fill?.[0] ?? 0) * 1920), Math.max(block.h + py * 2, (spec.fill?.[1] ?? 0) * 1080)];
  const cv = paintObject(spec.object, ow, oh, slots, seed, variant);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width, cv.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = LAYER;
  m.userData['noVeil'] = true;
  m.userData['decor'] = true;
  const inside = (c: number, half: number, frame: number) => (half >= frame ? -c : Math.min(frame - half, Math.max(half - frame, c)) - c);
  m.position.set(inside(block.cx, ow / 2, 960), inside(block.cy, oh / 2, 540), 0);
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
  const measureOf = (s: SetSpec) => { const st: GlyphStyle = { family, weight: 700, size: 100, even: s.even }; return (x: string) => [...x].reduce((w, c) => w + advanceOf(c, st), 0); };
  const blocks = sets.map((s) => blockOf(text, s, measureOf(s)));
  const tex = Math.max(...blocks.map((b) => b.size));
  const slots = wl.slots;
  const carried = sets[0].object;
  // the words take the colour of what they stand on, and a line that moves off its object takes the ground's colour
  const inkOn = (s: SetSpec) => (s.object ? objectInk(s.object, slots) : wl.fixedInk ? slots.ink : rt.palette.text);
  const words = inkOn(sets[0]);
  const baked = !!wl.surface;
  const keyOf = (s: SetSpec) => readable(rt.palette.accent, s.object ? slots.plate : rt.palette.background, s.object ? 6 : 4.5);
  // a key phrase that is most of the line marks nothing: the whole line in the accent is only a louder line
  const keySpan = [...rt.cue.text].filter((_, i) => emphasisOf(rt, i) === 'color').length;
  const marks = keySpan > 0 && keySpan <= 0.6 * [...text.replace(/\s/g, '')].length;
  const surfaceOf = (tint: string, eaten = false) => (wl.surface ? surfaceKey({ kind: wl.surface, tint, core: wl.core ?? slots.ink2, eaten }) : undefined);
  const weight = nearestWeight(family, sets[0].weight ?? wl.weight ?? 700);
  const style: GlyphStyle = { family, weight, size: tex, even: sets[0].even, surface: surfaceOf(words) };
  const gs = makeGlyphs(text, style, baked ? 'white' : color(words));
  tagSource(gs, rt.cue.text);
  const tintOf = (g: Glyph, p: number) => (marks && g.src !== undefined && emphasisOf(rt, g.src) === 'color' ? keyOf(sets[p]) : inkOn(sets[p]));
  const eats = ['signal-lock', 'detune', 'carrier-lost'].includes(wl.enter) || wl.exit === 'carrier-lost';
  // an emphasised character is its own picture on a world with a material, and each pose its own ink
  const mapsOf = (eaten: boolean) => sets.map((_, p) => gs.map((g) => (baked ? glyphTexture(g.char, { ...style, surface: surfaceOf(tintOf(g, p), eaten) }).texture : g.mesh.material.map!)));
  const whole = mapsOf(false);
  const damaged = eats ? mapsOf(true) : undefined;
  const inksBy = sets.map((_, p) => gs.map((g) => new THREE.Color(tintOf(g, p))));
  const poses = blocks.map((b, i) => ({ ...poseOf(gs, b, sets[i], tex), object: objectMesh(sets[i], b, slots, seed, Math.abs(Math.floor(rt.song ?? 0)) % 3) }));
  const body = new THREE.Group();
  gs.forEach((g, i) => { g.index = i; body.add(g.mesh); });
  poses.forEach((p) => { if (p.object) body.add(p.object); });
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
  const dimBaked = new THREE.Color(0.1, 0.1, 0.1);
  const lit = new THREE.Color(1, 1, 1);
  const useClip = entering?.clip || leaving?.clip;
  if (useClip) gs.forEach((g) => (g.mesh.material.clippingPlanes = [plane]));
  const caret = wl.hold === 'cursor-wait' ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color(words), transparent: true, depthTest: false, depthWrite: false })) : undefined;
  if (caret) { caret.userData['noVeil'] = true; caret.userData['decor'] = true; body.add(caret); }
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
      body.scale.set(sx, sy, 1);
      body.rotation.z = (p.spec.tilt ?? 0) + (blockPose.r ?? 0);
      const whole_a = blockPose.a ?? 1;
      poses.forEach((q, i) => { if (q.object) { q.object.visible = i === k; q.object.material.opacity = whole_a; } });
      const clip = move?.clip?.(out ? qOut : qIn);
      const hasClip = !!useClip;
      if (hasClip) { if (clip) setClip(clip, p); else plane.set(unit.set(0, 1, 0), 1e6); }
      const rank = slot.of > 1 && (rt.later ?? []).length === 0 ? 1 : slot.of > 1 && (rt.later ?? []).some((a) => t >= a + 0.2) ? 0.6 : 1;
      const age = t - rt.showFrom;
      // a slow travel while the line is up: the block never sits dead, and the reader's eye goes with it
      const span = Math.max(0.5, rt.exitAt - rt.showFrom);
      const along = clamp01(age / span) - 0.5;
      // (never further than the frame leaves it)
      const fit = (d: number, c: number, half: number, frame: number) => Math.sign(d) * Math.min(Math.abs(d), 2 * Math.max(0, frame - 24 - Math.abs(c) - half));
      const [gx, gy] = wl.drift ?? [0, 0];
      body.position.x += fit(gx, p.block.cx, p.block.w / 2, 960) * along;
      body.position.y += fit(gy, p.block.cy, p.block.h / 2, 540) * along;
      const swell = 1 + (wl.swell ?? 0) * (along + 0.5);
      body.scale.multiplyScalar(swell);
      const inkLit = inksBy[k];
      gs.forEach((g, i) => {
        const m = g.mesh;
        if (!p.shown[i]) { m.visible = false; return; }
        m.visible = true;
        const env: GlyphEnv = { q: out ? qOut : qIn, i, n, u: p.u[i], v: p.v[i], seed, age, sung: t >= sungTimes[i] ? 1 : 0 };
        let pose: GlyphPose = (out ? leaving?.glyph?.(env) : qIn < 1 ? entering?.glyph?.(env) : undefined) ?? {};
        // a line that locks word by word keeps at it after its entrance has run
        if (!out && wl.enter === 'signal-lock' && enterDur > 0) pose = entering!.glyph!(env);
        if (!out && qIn >= 1 && holding) pose = { ...holding(env), ...(wl.enter === 'signal-lock' && enterDur > 0 ? pose : {}) };
        m.position.set(p.x[i] + (pose.dx ?? 0), p.y[i] + (pose.dy ?? 0), 0);
        const s = p.scale * (pose.s ?? 1);
        m.scale.set(s * (pose.sx ?? 1), s, 1);
        m.rotation.z = (p.turn[i] ? -Math.PI / 2 : 0) + (pose.r ?? 0);
        const map = (pose.eaten && damaged ? damaged : whole)[k][i];
        if (m.material.map !== map) { m.material.map = map; m.material.needsUpdate = true; }
        const tone = Math.min(1, (pose.tone ?? 1) * rank);
        if (!baked && wl.sheet) m.material.color.copy(inkLit[i]);
        if (wl.sheet) {
          m.material.opacity = (pose.a ?? 1) * whole_a * tone;
        } else {
          m.material.opacity = (pose.a ?? 1) * whole_a;
          if (baked) m.material.color.copy(dimBaked).lerp(lit, tone);
          else m.material.color.copy(inkLit[i]).multiplyScalar(0.14).lerp(inkLit[i], tone);
        }
      });
      if (caret) {
        const last = [...gs.keys()].reverse().find((i) => p.shown[i]) ?? 0;
        caret.visible = qIn >= 1 && !out && Math.floor(age * 2.2) % 2 === 0;
        const size = p.block.size;
        caret.position.set(p.x[last] + size * 0.86, p.y[last] - size * 0.02, 0);
        caret.scale.set(size * 0.56, size * 0.96, 1);
      }
    },
    readable: () => [rt.showFrom + enterDur, rt.exitAt],
    poses: () => poses.map((p, i) => {
      const [cx, cy, pad] = [960 + p.block.cx, 540 - (p.block.cy + firstAt), 14];
      return { from: i ? wl.repose![i - 1].at : rt.showFrom, to: i < poses.length - 1 ? wl.repose![i].at : rt.exitAt + rt.exitDur, rect: { x0: cx - p.block.w / 2 - pad, y0: cy - p.block.h / 2 - pad, x1: cx + p.block.w / 2 + pad, y1: cy + p.block.h / 2 + pad } };
    }),
  };
}

/** A line the plan moved onto a world's shot without a stack of its own keeps to plain stepped rows. */
const orPlain = (rt: CueRuntime, slot: { k: number; of: number }) => (rt.style.world ? build(rt, slot) : stair.cue(rt));
export const worldSet: TemplateRenderer = { cue: (rt) => orPlain(rt, { k: 0, of: 1 }) };
/** Lines that share a shot, stacked in the order they are sung; the older steps back as the next one lands. */
export const worldPair: TemplateRenderer = { persist: 'shot', cue: (rt) => orPlain(rt, { k: rt.order ?? 0, of: (rt.order ?? 0) + (rt.later ?? []).length + 1 }) };
export { OBJECT_MARGIN };
