// A four-legged animal that really walks: its picture is taken apart (head, torso, tail, four legs), every leg is a
// two-bone limb whose paw is planted on the ground while it bears weight (so it never slides) and lifted forward in a
// smooth arc otherwise, the knee bends by skinning the leg's mesh, and the legs follow a cat's lateral-sequence walk
// (hind, then the fore on the same side, a quarter cycle apart). The torso bobs twice a cycle, the head steadies
// itself against it and the tail trails the motion.
import { drawMesh, drawWarped } from './warp';

type Img = CanvasImageSource & { width: number; height: number };
type Pt = [number, number];
export type LegId = 'hindNear' | 'foreNear' | 'hindFar' | 'foreFar';

export interface QuadParts {
  head: Img;
  torso: Img;
  tail: Img;
  foreNear: Img;
  foreFar: Img;
  hindNear: Img;
  /** Drawn from hindNear, darkened, when missing (better: recolour hindNear like foreNear → foreFar). */
  hindFar?: Img;
}

/** Where the parts join, in pixels of each part's own picture; the animal faces left. */
export interface QuadRig {
  /** On the torso: where the head, tail and each leg attach. */
  neck: Pt;
  tailBase: Pt;
  hips: Record<LegId, Pt>;
  /** On the head and tail pictures: their joint with the torso. */
  headPivot: Pt;
  tailPivot: Pt;
  /** On each leg picture, as fractions: the hip (top) joint; the paw is the bottom centre. */
  legPivot: Pt;
  /** Leg picture scale relative to the torso (the image model may draw them at another size). */
  legScale: number;
}

/** Phase offsets of a lateral-sequence walk (fraction of a cycle). */
export const GAIT: Record<LegId, number> = { hindNear: 0, foreNear: 0.25, hindFar: 0.5, foreFar: 0.75 };
/** Share of the cycle a paw is on the ground. */
const DUTY = 0.62;

const ease = (k: number) => k * k * (3 - 2 * k);
const smooth = (a: number, b: number, x: number) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));
const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
/** Angle that turns a downward vector toward (x, y). */
const aim = (x: number, y: number) => Math.atan2(-x, y);

/**
 * Where a paw is relative to its hip at cycle phase p (0..1): planted and moving backward under the body while it
 * bears weight, lifted in an arc while it swings forward. dir is -1 when walking left. Exported for tests.
 */
export function pawAt(p: number, stride: number, lift: number, dir: number): { x: number; lift: number; planted: boolean } {
  const q = ((p % 1) + 1) % 1;
  if (q < DUTY) return { x: dir * (stride / 2 - (q / DUTY) * stride), lift: 0, planted: true };
  const s = (q - DUTY) / (1 - DUTY);
  // eased on the ground, not under the hip: the paw leaves the ground and lands at rest (zero world speed), so the
  // step never jerks; meanwhile the body keeps moving at its own steady speed
  const cycle = stride / DUTY;
  const world = cycle * (1 - Math.cos(Math.PI * s)) / 2;
  const body = (1 - DUTY) * cycle * s;
  // the paw snaps up off the ground and settles down softly
  return { x: dir * (-stride / 2 + world - body), lift: lift * Math.sin(Math.PI * Math.pow(s, 0.8)), planted: false };
}

/**
 * Two-bone IK: upper and lower angles (from straight down) that put a limb of two equal halves of length L on the
 * target (x, y) below its hip; the knee bends forward (dir) or backward (-dir). Exported for tests.
 */
export function limb(x: number, y: number, L: number, kneeForward: boolean, dir: number): [number, number] {
  const d = Math.min(Math.hypot(x, y), L * 0.999);
  const a = aim(x, y);
  // half-limbs a = b = L/2: the angle between the upper bone and the hip→paw line
  const bend = Math.acos(Math.min(1, d / L));
  const side = (kneeForward ? 1 : -1) * dir;
  return [a - side * bend, a + side * bend];
}

export interface WalkState {
  /** Ground position of the animal (paws touch y). */
  x: number;
  y: number;
  /** Size: torso picture pixels to screen pixels. */
  scale: number;
  /** Walk cycle phase (cycles since the start). */
  phase: number;
  /** Seconds, for the tail. */
  t: number;
  dir?: number;
}

/**
 * Draws the animal mid-walk. Advance phase by distance / (stride × duty) so planted paws stay put: walkStride gives the
 * stride for a rig and scale.
 */
export function drawWalk(ctx: CanvasRenderingContext2D, parts: QuadParts, rig: QuadRig, s: WalkState) {
  const dir = s.dir ?? -1;
  const k = s.scale;
  const legLen = (id: LegId) => parts[id === 'hindFar' ? 'hindNear' : id].height * (1 - rig.legPivot[1]) * rig.legScale;
  const L = legLen('foreNear');
  const hipH = L * 0.94;
  const stride = walkStride(parts, rig);
  // the hips ride highest when a hind paw is mid-stance, the shoulders when a fore paw is: the two ends rise and fall
  // a quarter cycle apart, so the back rocks instead of the whole body bobbing as one block
  const amp = 0.022 * L;
  const mid = DUTY / 2;
  const hindBob = -amp * Math.cos(4 * Math.PI * (s.phase - mid - GAIT.hindNear));
  const foreBob = -amp * Math.cos(4 * Math.PI * (s.phase - mid - GAIT.foreNear));
  const bob = (hindBob + foreBob) / 2;
  const span = Math.max(1, rig.hips.hindNear[0] - rig.hips.foreNear[0]);
  const pitch = Math.atan2(foreBob - hindBob, span);
  const hipY = (id: LegId) => rig.hips[id][1];
  const groundInTorso = Math.max(...(Object.keys(rig.hips) as LegId[]).map(hipY)) + hipH;

  ctx.save();
  ctx.translate(s.x, s.y);
  // drawn facing left; walking right mirrors it
  ctx.scale(dir > 0 ? -k : k, k);
  ctx.translate(0, -groundInTorso + bob);
  const torsoW = parts.torso.width;
  ctx.translate(-torsoW / 2, 0);

  const leg = (id: LegId) => {
    const img = id === 'hindFar' ? (parts.hindFar ?? parts.hindNear) : parts[id];
    const [hx, hy] = rig.hips[id];
    const paw = pawAt(s.phase + GAIT[id], stride, L * 0.22, -1);
    // the ground, in the torso's frame, moves against the body's bob
    const target: Pt = [paw.x, groundInTorso - bob - hipY(id) - paw.lift];
    const [a1, a2] = limb(target[0], target[1], legLen(id), !id.startsWith('hind'), -1);
    const w = img.width * rig.legScale;
    const h = img.height * rig.legScale;
    const P: Pt = [rig.legPivot[0] * w, rig.legPivot[1] * h];
    const kneeV = rig.legPivot[1] + (1 - rig.legPivot[1]) / 2;
    const knee0: Pt = [0, (kneeV - rig.legPivot[1]) * h];
    const knee1 = rot(knee0, a1);
    ctx.save();
    ctx.translate(hx, hy);
    if (id === 'hindFar' && !parts.hindFar) ctx.filter = 'brightness(0.62) saturate(0.85)';
    drawMesh(ctx, img, -P[0], -P[1], w, h, (u, v) => {
      const r: Pt = [u * w - P[0], v * h - P[1]];
      const wl = smooth(kneeV - 0.1, kneeV + 0.1, v);
      const up = rot(r, a1);
      const low = rot([r[0] - knee0[0], r[1] - knee0[1]], a2);
      const nx = (1 - wl) * up[0] + wl * (knee1[0] + low[0]);
      const ny = (1 - wl) * up[1] + wl * (knee1[1] + low[1]);
      return [nx - r[0], ny - r[1]];
    }, 10);
    ctx.restore();
  };

  // far legs, near legs (their tops hide behind the torso), tail, torso, head
  leg('hindFar');
  leg('foreFar');
  leg('hindNear');
  leg('foreNear');

  ctx.save();
  const [tx, ty] = rig.tailBase;
  ctx.translate(tx, ty);
  ctx.rotate(pitch * 2 + 0.06 * Math.sin(2 * Math.PI * (s.phase - 0.2)));
  drawWarped(ctx, parts.tail, -rig.tailPivot[0], -rig.tailPivot[1], parts.tail.width, parts.tail.height, [{ kind: 'sway', pin: 'bottom', amp: 0.06 }], s.t, 2);
  ctx.restore();

  ctx.save();
  ctx.translate(torsoW / 2, groundInTorso - hipH);
  ctx.rotate(pitch);
  ctx.translate(-torsoW / 2, -(groundInTorso - hipH));
  ctx.drawImage(parts.torso, 0, 0);
  ctx.restore();

  ctx.save();
  const [nx, ny] = rig.neck;
  // the head rides on the shoulders a moment late and steadies itself against the rocking
  const lateFore = -amp * Math.cos(4 * Math.PI * (s.phase - 0.06 - mid - GAIT.foreNear));
  ctx.translate(nx, ny + (lateFore - foreBob) * 0.8 - (foreBob - bob) * 0.4);
  ctx.rotate(-pitch * 0.7 + 0.012 * Math.sin(4 * Math.PI * (s.phase - 0.1)));
  ctx.drawImage(parts.head, -rig.headPivot[0], -rig.headPivot[1]);
  ctx.restore();

  ctx.restore();
}

/** Distance the body travels per cycle while a paw stays planted: advance phase by distance / walkCycle. */
export function walkStride(parts: QuadParts, rig: QuadRig) {
  return parts.foreNear.height * (1 - rig.legPivot[1]) * rig.legScale * 0.62;
}
export const walkCycle = (parts: QuadParts, rig: QuadRig) => walkStride(parts, rig) / DUTY;
