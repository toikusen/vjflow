// Soft motion inside a sprite: the picture is cut into a triangle mesh and each vertex moves by the zones it falls in
// (a sail billows, branches sway from a pinned root, a lantern swings from its cord, water ripples) while everything
// outside the zones stays rigid. One shared gusty wind drives every zone, so the whole frame moves together.

/** A region of the sprite (fractions of its box) that moves one way; the rest of the sprite stays rigid. */
export interface WarpZone {
  kind: 'sway' | 'flutter' | 'billow' | 'swing' | 'pulse' | 'ripple';
  /** [x0, y0, x1, y1] as fractions of the sprite; default the whole sprite. */
  rect?: [number, number, number, number];
  /** The fixed edge for sway / flutter (default bottom for sway, left for flutter). */
  pin?: 'bottom' | 'top' | 'left' | 'right';
  /** Strength as a fraction of the zone size (default per kind, 0.02–0.06). */
  amp?: number;
}

const AMP: Record<WarpZone['kind'], number> = { sway: 0.05, flutter: 0.04, billow: 0.06, swing: 0.08, pulse: 0.05, ripple: 0.025 };
// how far inside a zone its motion fades in, where the zone edge is not the sprite's edge
const FEATHER = 0.08;

/** Gusty wind in about [-1, 1]: three incommensurate swells plus a slow gust envelope, smooth in t. */
export const wind = (t: number, seed = 0): number => {
  const s = seed * 1.7;
  const swell = 0.55 * Math.sin(0.83 * t + s) + 0.3 * Math.sin(2.11 * t + 1.3 + s) + 0.15 * Math.sin(4.7 * t + 2.1 + s);
  const gust = 0.75 + 0.25 * Math.sin(0.29 * t + 0.7 + s);
  return swell * gust;
};

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** How much a point (u, v in the sprite) belongs to a zone: 1 inside, fading at inner edges. */
const weight = (r: [number, number, number, number], u: number, v: number) => {
  const [x0, y0, x1, y1] = r;
  const edge = (lo: number, hi: number, x: number) =>
    (lo <= 0 ? (x >= lo ? 1 : 0) : smooth(lo, lo + FEATHER, x)) * (hi >= 1 ? (x <= hi ? 1 : 0) : smooth(hi, hi - FEATHER, x));
  return edge(x0, x1, u) * edge(y0, y1, v);
};

/**
 * Pixel displacement of the sprite point (u, v) at time t (seconds) for one zone, in a sprite drawn w × h.
 * Exported for tests.
 */
export function zoneOffset(z: WarpZone, u: number, v: number, t: number, w: number, h: number, seed = 0): [number, number] {
  const r = z.rect ?? [0, 0, 1, 1];
  const k = weight(r, u, v);
  if (!k) return [0, 0];
  const rw = (r[2] - r[0]) * w;
  const rh = (r[3] - r[1]) * h;
  const lu = (u - r[0]) / (r[2] - r[0]);
  const lv = (v - r[1]) / (r[3] - r[1]);
  const amp = z.amp ?? AMP[z.kind];
  switch (z.kind) {
    case 'sway': {
      // distance from the pinned edge; the tip lags the root (the gust travels up the branch)
      const pin = z.pin ?? 'bottom';
      const s = pin === 'bottom' ? 1 - lv : pin === 'top' ? lv : pin === 'left' ? lu : 1 - lu;
      const d = amp * Math.pow(s, 1.6) * wind(t - 0.45 * s, seed);
      const along = pin === 'bottom' || pin === 'top';
      const len = along ? rw : rh;
      // the tip arcs: a sideways push shortens it a little
      return along ? [k * d * len, k * -Math.abs(d) * 0.3 * s * rh * (pin === 'bottom' ? 1 : -1)] : [k * -Math.abs(d) * 0.3 * s * rw * (pin === 'left' ? 1 : -1), k * d * len];
    }
    case 'flutter': {
      // cloth pinned on one edge: a travelling wave that grows away from the pin, pushed by the wind
      const pin = z.pin ?? 'left';
      const s = pin === 'left' ? lu : pin === 'right' ? 1 - lu : pin === 'top' ? lv : 1 - lv;
      const wave = 0.6 * wind(t - 0.5 * s, seed) + 0.4 * Math.sin(2 * Math.PI * (1.1 * t - 1.2 * s) + seed);
      const d = amp * Math.pow(s, 1.3) * wave;
      return pin === 'left' || pin === 'right' ? [0, k * d * rh] : [k * d * rw, 0];
    }
    case 'billow': {
      // a sail held on its edges: the belly swells with the wind, never inside out
      const belly = Math.sin(Math.PI * lu) * Math.sin(Math.PI * lv);
      const fill = 0.6 + 0.4 * wind(t, seed);
      return [k * amp * rw * belly * fill, k * amp * 0.25 * rh * belly * fill];
    }
    case 'swing': {
      // hung from the top centre of the zone; the lower part trails the cord
      const a = amp * wind(0.8 * t - 0.3 * lv, seed);
      const px = (lu - 0.5) * rw;
      const py = lv * rh;
      return [k * (px * Math.cos(a) - py * Math.sin(a) - px), k * (px * Math.sin(a) + py * Math.cos(a) - py)];
    }
    case 'pulse': {
      // a bell that contracts and opens; what hangs below follows a beat later
      const phase = 2 * Math.PI * (t / 1.8) + seed;
      const bell = lv < 0.45 ? 1 : 0;
      const sx = amp * Math.sin(phase) * bell;
      const trail = amp * 0.8 * Math.sin(phase - 4 * lv) * (1 - bell) * lv;
      return [k * ((lu - 0.5) * rw * sx + trail * rw), k * -sx * 0.5 * (0.45 - lv) * rh * bell];
    }
    case 'ripple': {
      const p = 2 * Math.PI * (1.6 * lu - 0.35 * t) + seed;
      return [k * amp * 0.5 * rw * Math.cos(p) * 0.3, k * amp * rh * Math.sin(p)];
    }
  }
}

/** Total displacement of a sprite point over all zones. */
export const offsetAt = (zones: WarpZone[], u: number, v: number, t: number, w: number, h: number, seed = 0): [number, number] =>
  zones.reduce<[number, number]>(
    (acc, z) => {
      const [dx, dy] = zoneOffset(z, u, v, t, w, h, seed);
      return [acc[0] + dx, acc[1] + dy];
    },
    [0, 0],
  );

type Img = CanvasImageSource & { width: number; height: number };

/**
 * Draws a sprite into the box (x, y, w, h) with its zones in motion at time t. Each mesh cell is two triangles, each
 * mapped with an affine transform and clipped (grown half a pixel so neighbours overlap and no seams show).
 */
export function drawWarped(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number, zones: WarpZone[], t: number, seed = 0, grid = 12) {
  if (!zones.length) return void ctx.drawImage(img, x, y, w, h);
  drawMesh(ctx, img, x, y, w, h, (u, v) => offsetAt(zones, u, v, t, w, h, seed), grid);
}

/**
 * Draws a sprite into the box (x, y, w, h) with every point (u, v) of it moved by offset (pixels) — the mesh under
 * drawWarped, and under skinned rigs whose bones bend a part (a knee, a spine).
 */
export function drawMesh(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number, offset: (u: number, v: number) => [number, number], grid = 12) {
  const iw = img.width;
  const ih = img.height;
  const pts: [number, number][][] = [];
  for (let j = 0; j <= grid; j++) {
    pts.push([]);
    for (let i = 0; i <= grid; i++) {
      const u = i / grid;
      const v = j / grid;
      const [dx, dy] = offset(u, v);
      pts[j].push([x + u * w + dx, y + v * h + dy]);
    }
  }
  const tri = (s: [number, number][], d: [number, number][]) => {
    // grow the clip triangle about its centroid so adjacent triangles overlap (antialiased edges otherwise leave hairlines)
    const cx = (d[0][0] + d[1][0] + d[2][0]) / 3;
    const cy = (d[0][1] + d[1][1] + d[2][1]) / 3;
    ctx.save();
    ctx.beginPath();
    d.forEach(([px, py], n) => {
      const len = Math.hypot(px - cx, py - cy) || 1;
      const gx = px + ((px - cx) / len) * 1.2;
      const gy = py + ((py - cy) / len) * 1.2;
      n ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy);
    });
    ctx.closePath();
    ctx.clip();
    // affine map from source triangle s to destination triangle d
    const [[x0, y0], [x1, y1], [x2, y2]] = s;
    const [[u0, v0], [u1, v1], [u2, v2]] = d;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / den;
    const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / den;
    const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / den;
    const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / den;
    ctx.transform(a, b, c, dd, u0 - a * x0 - c * y0, v0 - b * x0 - dd * y0);
    const sx = Math.max(0, Math.min(x0, x1, x2) - 8);
    const sy = Math.max(0, Math.min(y0, y1, y2) - 8);
    const sw = Math.min(iw, Math.max(x0, x1, x2) + 8) - sx;
    const sh = Math.min(ih, Math.max(y0, y1, y2) + 8) - sy;
    ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  };
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const s00: [number, number] = [(i / grid) * iw, (j / grid) * ih];
      const s10: [number, number] = [((i + 1) / grid) * iw, (j / grid) * ih];
      const s01: [number, number] = [(i / grid) * iw, ((j + 1) / grid) * ih];
      const s11: [number, number] = [((i + 1) / grid) * iw, ((j + 1) / grid) * ih];
      tri([s00, s10, s11], [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1]]);
      tri([s00, s11, s01], [pts[j][i], pts[j + 1][i + 1], pts[j + 1][i]]);
    }
  }
}
