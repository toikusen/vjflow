// One camera for the lyric and what is behind it: the same times, the same curve, the same target. The type stays inside
// its reading frame: every big move happens before reading starts, and the camera is at rest for all of the reading.
// y is up. Pure numbers: the engine sets the type's group from it, kinetic.ts the backdrop's canvas.

export type TrackKind = 'phrase-track' | 'panel-track';
export type RigKind = 'arc' | 'ground' | TrackKind;
export const RIG_KINDS: RigKind[] = ['arc', 'ground'];
/** Camera moves that call at the line's own phrases: where those sit is only known once the line is laid out. */
export const TRACK_KINDS: TrackKind[] = ['phrase-track', 'panel-track'];
export const isTrack = (k: RigKind): k is TrackKind => (TRACK_KINDS as RigKind[]).includes(k);

export interface CameraRig {
  kind: RigKind;
  /** Absolute seconds: the move runs from..to. Reading never starts before `to`. */
  from: number;
  to: number;
  dir: number;
  /** How far this song's camera swings, 1 as drawn: reach, never the move's seconds. */
  reach?: number;
  /** The word the camera turns about, in frame px from the centre (the lyric's visual weight, not the frame's middle). */
  target: [number, number];
  /** A track's stops: each phrase's centre, frame px from the centre (filled in by the engine from the laid-out line). */
  points?: [number, number][];
  /** A track's whole line as laid out [x0, y0, x1, y1], frame px from the centre: it keeps its safe margins. */
  box?: [number, number, number, number];
}

export interface RigPose {
  x: number;
  y: number;
  scale: number;
  rot: number;
  /** 0 upright … 1 laid on the floor. */
  lay: number;
}

const REST: RigPose = { x: 0, y: 0, scale: 1, rot: 0, lay: 0 };
/** The backdrop is further away: it travels this share of what the type does. */
export const BACK_DEPTH = 0.45;

const inOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/** The rig's progress at t: 0 before, 1 from `to` on, exactly. */
export const rigProgress = (r: Pick<CameraRig, 'from' | 'to'>, t: number) => (t <= r.from ? 0 : t >= r.to ? 1 : inOut((t - r.from) / (r.to - r.from)));

/** How close each kind stands while it calls at a stop: a phrase track shows the whole line, a panel route is inside one panel. */
const TRACK_SCALE: Record<TrackKind, number> = { 'phrase-track': 0.86, 'panel-track': 1.42 };
const SAFE_X = 1920 / 2 - 48;
const SAFE_Y = 1080 / 2 - 40;
const within = (v: number, lo: number, hi: number) => (lo > hi ? 0 : Math.min(hi, Math.max(lo, v)));

/** The pose that puts a stop at the frame's centre; a phrase track goes only as far as keeps the whole line inside its margins. */
export function stopPose(kind: TrackKind, [px, py]: [number, number], box?: [number, number, number, number]): Pick<RigPose, 'x' | 'y' | 'scale'> {
  const scale = TRACK_SCALE[kind];
  if (kind === 'panel-track' || !box) return { x: -px * scale, y: -py * scale, scale };
  const [x0, y0, x1, y1] = box;
  return { x: within(-px * scale, -SAFE_X - x0 * scale, SAFE_X - x1 * scale), y: within(-py * scale, -SAFE_Y - y0 * scale, SAFE_Y - y1 * scale), scale };
}

/** Holds at each stop, then moves on; the last move lands at rest, exactly at `to`. */
function trackAt(r: CameraRig, t: number): RigPose {
  const stops = (r.points ?? []).map((p) => ({ ...stopPose(r.kind as TrackKind, p, r.box), rot: 0, lay: 0 }));
  if (!stops.length || t >= r.to) return REST;
  const poses = [...stops, REST];
  const at = (Math.max(0, t - r.from) / (r.to - r.from)) * stops.length;
  const i = Math.min(stops.length - 1, Math.floor(at));
  const e = inOut(Math.min(1, Math.max(0, (at - i - 0.3) / 0.7)));
  const [a, b] = [poses[i], poses[i + 1]];
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, scale: a.scale + (b.scale - a.scale) * e, rot: 0, lay: 0 };
}

/** The type's offset from rest: never bigger than its fitted size, and exactly rest once reading can start. */
export function rigAt(r: CameraRig, t: number): RigPose {
  if (isTrack(r.kind)) return trackAt(r, t);
  const e = rigProgress(r, t);
  if (e >= 1) return REST;
  const u = 1 - e;
  const reach = r.reach ?? 1;
  if (r.kind === 'arc') {
    // a push on a curve: the target word holds its place on the scale and the turn, and the swing carries the rest
    const a = 0.09 * reach * u * r.dir;
    const scale = 1 - 0.3 * reach * u;
    const [tx, ty] = r.target;
    const hold: [number, number] = [tx - scale * (tx * Math.cos(a) - ty * Math.sin(a)), ty - scale * (tx * Math.sin(a) + ty * Math.cos(a))];
    return { x: hold[0] + 300 * reach * r.dir * Math.sin(u * 0.9), y: hold[1] - 140 * reach * u * u, scale, rot: a, lay: 0 };
  }
  return { x: 0, y: -260 * reach * u, scale: 1 - 0.08 * u, rot: 0, lay: u };
}

/** The same camera on the backdrop: same curve, about the same target, less travel because it is further away. */
export function rigBack(r: CameraRig, t: number): RigPose {
  const p = rigAt(r, t);
  return { x: p.x * BACK_DEPTH, y: p.y * BACK_DEPTH, scale: 1 + Math.abs(1 - p.scale) * BACK_DEPTH, rot: p.rot * BACK_DEPTH, lay: p.lay };
}

/** The floor plane's keystone: how much a point at height y (px) shrinks into the distance. */
export const layPerspective = (lay: number) => lay * 0.0014;
/** How flat the floor foreshortens the type. */
export const layScaleY = (lay: number) => 1 - 0.62 * lay;
