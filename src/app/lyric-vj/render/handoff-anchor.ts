// A relay: one mark carries a line's position and direction into the next. It starts at the edge of the key word just
// read and runs along one curve, at continuous speed, to the edge of the next key word, where the next line opens from it.
// It stays a plain rule: it never grows into a stroke of a character. Pure numbers; frame px, y up.

export type P = [number, number];
export interface RelayPath { p0: P; d0: P; p1: P; d1: P }

/** Where on the curve the head is: Hermite, so position and direction are the anchors' own at both ends. */
export function relayPoint(r: RelayPath, u: number): P {
  const [a, b, c, d] = [2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2];
  return [0, 1].map((i) => a * r.p0[i] + b * r.d0[i] + c * r.p1[i] + d * r.d1[i]) as P;
}

/** The anchors with tangents scaled to the distance, so the curve neither loops nor stalls. */
export function relayBetween(p0: P, dir0: P, p1: P, dir1: P): RelayPath {
  const far = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.7 + 60;
  return { p0, d0: [dir0[0] * far, dir0[1] * far], p1, d1: [dir1[0] * far, dir1[1] * far] };
}

/** The stretch of the curve shown at progress e: head leaves first, tail follows, nothing left by e = 1. */
export function relaySpan(e: number): [number, number] {
  return [Math.max(0, (e - 0.35) / 0.65), Math.min(1, e / 0.65)];
}

/** A ribbon along the curve from u0 to u1: 2 × (n + 1) points, left then right edge at each step, as x, y pairs. */
export function relayStrip(r: RelayPath, u0: number, u1: number, width: number, n = 32): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    const [x, y] = relayPoint(r, u);
    const [x2, y2] = relayPoint(r, Math.min(1, u + 0.01));
    const [x1, y1] = relayPoint(r, Math.max(0, u - 0.01));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [nx, ny] = [-(y2 - y1) / len, (x2 - x1) / len];
    // the ribbon tapers at both ends: square ends read as a sliding bar
    const w = (width / 2) * Math.min(1, Math.sin((Math.PI * i) / n) * 3 + 0.05);
    out.push(x + nx * w, y + ny * w, x - nx * w, y - ny * w);
  }
  return out;
}
