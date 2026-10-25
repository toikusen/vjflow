import { describe, expect, it } from 'vitest';
import { revealMask, MASK_KINDS } from './transition';

/** A stand-in 2D context that keeps each subpath as a polygon (arcs sampled), so coverage can be measured. */
function recorder() {
  const polys: [number, number][][] = [];
  let cur: [number, number][] = [];
  const close = () => {
    if (cur.length > 2) polys.push(cur);
    cur = [];
  };
  const ctx = {
    beginPath: () => {
      polys.length = 0;
      cur = [];
    },
    moveTo: (x: number, y: number) => {
      close();
      cur.push([x, y]);
    },
    lineTo: (x: number, y: number) => void cur.push([x, y]),
    closePath: () => void 0,
    rect: (x: number, y: number, w: number, h: number) => {
      close();
      polys.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    },
    arc: (cx: number, cy: number, r: number, a0: number, a1: number) => {
      for (let i = 0; i <= 48; i++) {
        const a = a0 + ((a1 - a0) * i) / 48;
        cur.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    },
    fill: () => close(),
  };
  const inside = (x: number, y: number) =>
    polys.some((p) => {
      let c = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i];
        const [xj, yj] = p[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, inside };
}

const W = 1920;
const H = 1080;
/** Share of a 48 × 27 grid of points the mask covers at progress k. */
function coverage(kind: (typeof MASK_KINDS)[number], k: number) {
  const r = recorder();
  revealMask(r.ctx, kind, k, W, H, 7);
  let n = 0;
  let hit = 0;
  for (let gy = 0; gy < 27; gy++)
    for (let gx = 0; gx < 48; gx++) {
      n++;
      if (r.inside(((gx + 0.5) * W) / 48, ((gy + 0.5) * H) / 27)) hit++;
    }
  return hit / n;
}

describe('section transitions', () => {
  it('start showing nothing and end showing the whole frame, every kind', () => {
    for (const kind of MASK_KINDS) {
      expect(coverage(kind, 0), `${kind} at 0`).toBe(0);
      // the last moment before the transition ends: no corner left to pop in afterwards
      expect(coverage(kind, 0.999), `${kind} at the end`).toBe(1);
    }
  });

  it('grow steadily (never shrink) while they play', () => {
    for (const kind of MASK_KINDS) {
      const steps = [0.2, 0.4, 0.6, 0.8].map((k) => coverage(kind, k));
      expect(steps.every((v, i) => i === 0 || v >= steps[i - 1] - 0.01), kind).toBe(true);
    }
  });
});
