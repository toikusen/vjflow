// One boundary, two uses: what the backdrop paints and where the type changes ink. Both read this line, so paint and
// letters can never disagree. Off-centre and off-square by design. Pure numbers; y is up, the frame's centre is 0, 0.

export interface Boundary { x: number; y: number; angle: number }
export interface HalfPlane { nx: number; ny: number; c: number }

/** A boundary through a share of the block, not its middle, and tilted the song's way; never square to the frame. */
export function seatBoundary(box: { x0: number; x1: number; y: number }, seed: number, leanBy = 1): Boundary {
  const share = [0.36, 0.62, 0.42, 0.58][seed % 4];
  const lean = (0.16 + ((seed >> 2) % 4) * 0.07) * (seed % 3 === 0 ? -1 : 1);
  return { x: box.x0 + (box.x1 - box.x0) * share, y: box.y, angle: Math.PI / 2 + lean * leanBy };
}

/** The side of the boundary a point counts as positive: nx·x + ny·y + c ≥ 0. */
export function halfPlaneOf(b: Boundary): HalfPlane {
  const [nx, ny] = [Math.sin(b.angle), -Math.cos(b.angle)];
  return { nx, ny, c: -(nx * b.x + ny * b.y) };
}

export const sideOf = (p: HalfPlane, x: number, y: number) => p.nx * x + p.ny * y + p.c;

/** The positive half as a polygon past any frame edge. */
export function halfPolygon(b: Boundary, reach = 4000): [number, number][] {
  const p = halfPlaneOf(b);
  const [dx, dy] = [Math.cos(b.angle), Math.sin(b.angle)];
  const a: [number, number] = [b.x - dx * reach, b.y - dy * reach];
  const z: [number, number] = [b.x + dx * reach, b.y + dy * reach];
  return [a, [a[0] + p.nx * reach, a[1] + p.ny * reach], [z[0] + p.nx * reach, z[1] + p.ny * reach], z];
}

/**
 * The boundary at t: it swings in over the entrance from further round and sweeps away after the reading; between
 * those it does not move at all, so the letters keep one state while they are read.
 */
export function boundaryAt(rest: Boundary, t: number, s: { show: number; landSec: number; exitAt: number; exitDur: number }, travel: number): Boundary {
  const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  const easeIn = (x: number) => Math.min(1, Math.max(0, x)) ** 3;
  const inK = t >= s.show + s.landSec ? 1 : easeOut((t - s.show) / s.landSec);
  const outK = t <= s.exitAt ? 0 : easeIn((t - s.exitAt) / Math.max(0.05, s.exitDur));
  const n = halfPlaneOf(rest);
  const shift = (1 - inK) * travel + outK * travel;
  return { x: rest.x + n.nx * shift, y: rest.y + n.ny * shift, angle: rest.angle + (1 - inK) * 0.22 };
}
