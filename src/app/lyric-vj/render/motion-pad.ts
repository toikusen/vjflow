// The room a line's motion needs round it, pure (no three.js): shared by the engine's frame fit, the plan's blow-up pose and the
// type floor's hold, so all of them read the same worst case.

/**
 * A line's measured (rest) rectangle grown by how far the type layer's own motion can carry it while it plays, so the
 * objects that make room for it clear it in every frame: the kick's 5 % scale (loud sections only) and the drift's
 * 1.2 % growth, both about the frame centre, the sway (13 / 6 px), the drift (14 / 8 px), the kick's 10 px jump and
 * the 2.5 px wave. Worst case and fixed, so it never moves with when the box was measured. Frame px, y down.
 */
export function motionPad(r: { x0: number; y0: number; x1: number; y1: number }, kick: boolean, w = 1920, h = 1080) {
  const grow = (kick ? 1.05 : 1) * 1.012 - 1;
  const dx = (x: number) => Math.abs(x - w / 2) * grow + 13 + 14 + 2.5;
  const dy = (y: number) => Math.abs(y - h / 2) * grow + 6 + 8 + 2.5 + (kick ? 10 : 0);
  return { x0: r.x0 - dx(r.x0), y0: r.y0 - dy(r.y0), x1: r.x1 + dx(r.x1), y1: r.y1 + dy(r.y1) };
}

/**
 * How far a box reaching `ex` × `ey` px from the centre may be scaled and stay inside the frame at the worst of its
 * motion (motionPad), as a multiple of its size: 1 means it just fits, over 1 there is room to grow. No safe margin.
 */
export function motionRoom(ex: number, ey: number, kick: boolean, w = 1920, h = 1080) {
  const pad = motionPad({ x0: w / 2 - ex, y0: h / 2 - ey, x1: w / 2 + ex, y1: h / 2 + ey }, kick, w, h);
  const mx = (pad.x1 - w / 2) / ex;
  const my = (pad.y1 - h / 2) / ey;
  return Math.min(w / 2 / (ex * mx), h / 2 / (ey * my));
}

/**
 * The frame fit's scale for a line whose box reaches `ex` × `ey` px from the centre (engine fitToFrame): inside the safe
 * area at rest and inside the frame as the line moves (motionPad), never above 1. `kick`: a loud section's 5 % kick.
 */
export function frameFit(ex: number, ey: number, kick: boolean, w = 1920, h = 1080) {
  return Math.min(1, (w / 2 - 48) / ex, (h / 2 - 40) / ey, motionRoom(ex, ey, kick, w, h));
}
