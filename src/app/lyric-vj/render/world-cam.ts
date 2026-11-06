// A world's one camera move into a new part (world-shared.ts camera; 2026-11-04 gap 5: the camera only drifted). Shared
// by the ground (kinetic.ts) and the words of the part's first line (world-layout.ts), so the camera moves the whole
// frame, not the ground alone. Rebuilt from Motion Prompt #176 (fly-through) by description only.
const [W, H] = [1920, 1080];
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const WORLD_CAM_SEC: Record<string, number> = { 'push-through': 0.5, diagonal: 0.42, 'iso-slide': 0.46 };
/** How close to the frame's edge the camera may carry the words, px at 1080p. */
export const CAM_EDGE = 24;

/** A line's box in the frame, px, y down (engine lyric rects, world-layout poses). */
export interface CamRoom { x0: number; y0: number; x1: number; y1: number }

/** The move at full reach, `k` 1 at the cut and 0 once landed. */
function moveAt(cam: string, k: number, dir: number) {
  if (cam === 'push-through') return { dx: 0, dy: 0, s: 1 + 0.9 * k, r: 0 };
  if (cam === 'iso-slide') return { dx: dir * W * 0.12 * k, dy: dir * W * 0.12 * k * Math.tan(Math.PI / 6), s: 1 + 0.32 * k, r: 0 };
  return { dx: dir * W * 0.12 * k, dy: H * 0.12 * k, s: 1 + 0.32 * k, r: dir * 0.04 * k };
}

/** Whether every corner of `room`, carried by the move about the frame's centre, stays inside the frame by CAM_EDGE. */
function holds(m: { dx: number; dy: number; s: number; r: number }, room: CamRoom) {
  const [c, sn] = [Math.cos(-m.r), Math.sin(-m.r)];
  return [[room.x0, room.y0], [room.x1, room.y0], [room.x0, room.y1], [room.x1, room.y1]].every(([x, y]) => {
    const [px, py] = [(x - W / 2) * m.s, (y - H / 2) * m.s];
    const [qx, qy] = [W / 2 + m.dx + px * c - py * sn, H / 2 - m.dy + px * sn + py * c];
    return qx >= CAM_EDGE && qx <= W - CAM_EDGE && qy >= CAM_EDGE && qy <= H - CAM_EDGE;
  });
}

/**
 * How much of its move the camera may make with this line up, 0..1 (owner rule, 2026-11-06: the lyric is the hero). A
 * move only ever brings the frame closer (it never sets the words smaller than they rest, so never under the world's type
 * floor), and it is cut short where it would carry the line's box past the frame's edge: a push through the frame
 * began at 1.9× and cut 一放好多年 off at the right edge for a fifth of a second (gothic-lolita nun 65.2 s). No box: the
 * whole move. The ground and the words ask with the same box, so they keep moving as one frame.
 */
export function camReach(cam: string | undefined, dir: number, room?: CamRoom): number {
  if (!cam || !WORLD_CAM_SEC[cam] || !room) return 1;
  if (holds(moveAt(cam, 1, dir), room)) return 1;
  // a box already past the edge at rest is not the camera's to keep: the camera only must not carry it further
  if (!holds(moveAt(cam, 0, dir), room)) return 0;
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (holds(moveAt(cam, mid, dir), room)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The move at `age` s into the part's first cut, about the frame's centre (px, y up, radians): out of a push through
 * the frame before (the new frame comes up from very close), or in on a diagonal (it swings in from a corner, scaled
 * so its edge never shows), or along an isometric grid's 30° axis, never turning (scaled as the diagonal is). Undefined
 * once it has landed or for any other camera. `room`: the line's box, which the move never carries out of the frame
 * (camReach).
 */
export function worldCam(cam: string | undefined, age: number, dir: number, room?: CamRoom): { dx: number; dy: number; s: number; r: number } | undefined {
  const sec = cam ? WORLD_CAM_SEC[cam] : undefined;
  if (!cam || !sec || age < 0 || age >= sec) return undefined;
  return moveAt(cam, (1 - ease(age / sec)) * camReach(cam, dir, room), dir);
}
