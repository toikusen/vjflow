// Section transitions for graphic looks: while a section comes in, the one before stays drawn and the new one shows
// through a shape that grows with the progress k (0 → 1). One compositing path (drawLook) and one small function per
// shape: the same k always gives the same frame, so scrubbing anywhere in the timeline is exact.
// Shapes picked from the @ai_yunon_ai transition catalogue (out_effects/summary.md).
import type { Rgb } from './graphics';

export type TransitionKind = 'circle' | 'clock' | 'diagonal' | 'stripes' | 'quad' | 'brush' | 'liquid' | 'impact' | 'diamond' | 'iris' | 'checker' | 'bars' | 'drip' | 'zigzag' | 'star' | 'pinwheel' | 'corners' | 'grid' | 'ripple' | 'wave';
export const TRANSITION_KINDS: TransitionKind[] = ['circle', 'clock', 'diagonal', 'stripes', 'quad', 'brush', 'liquid', 'impact', 'diamond', 'iris', 'checker', 'bars', 'drip', 'zigzag', 'star', 'pinwheel', 'corners', 'grid', 'ripple', 'wave'];
/** The strong ones: never two in a row (they read as a showreel). */
export const LOUD_TRANSITIONS = new Set<TransitionKind>(['impact', 'checker', 'zigzag', 'bars', 'quad', 'drip', 'grid', 'pinwheel']);

export interface SectionTransition {
  kind: TransitionKind;
  /** Seconds (default by kind). */
  dur?: number;
  /** A coloured edge that leads the reveal (a band of this colour runs just ahead of the new section). */
  color?: Rgb;
}

/** Default length by kind: shape reveals are quick, liquids slower. */
export const TRANSITION_SEC: Record<TransitionKind, number> = { circle: 0.6, clock: 0.7, diagonal: 0.5, stripes: 0.55, quad: 0.6, brush: 0.6, liquid: 0.9, impact: 0.45, diamond: 0.6, iris: 0.55, checker: 0.7, bars: 0.6, drip: 0.9, zigzag: 0.45, star: 0.6, pinwheel: 0.7, corners: 0.6, grid: 0.7, ripple: 0.8, wave: 0.7 };

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** A stable pseudo-random 0..1 per integer pair. */
const rnd = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Fills, on ctx, the part of a w × h frame where the new section shows at progress k (0..1). `seed` varies the
 * off-centre points (a circle opens somewhere new each time).
 */
export function revealMask(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, kind: TransitionKind, k: number, w: number, h: number, seed = 0) {
  const e = easeInOut(clamp01(k));
  const R = Math.hypot(w, h);
  ctx.beginPath();
  switch (kind) {
    case 'circle': {
      // off-centre: the circle opens from a different point each time and must reach the far corner
      const cx = w * (0.25 + 0.5 * rnd(seed, 1));
      const cy = h * (0.25 + 0.5 * rnd(seed, 2));
      ctx.arc(cx, cy, e * Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)), 0, Math.PI * 2);
      break;
    }
    case 'clock': {
      ctx.moveTo(w / 2, h / 2);
      ctx.arc(w / 2, h / 2, R, -Math.PI / 2, -Math.PI / 2 + e * Math.PI * 2 + 1e-4);
      ctx.closePath();
      break;
    }
    case 'diagonal': {
      // a straight edge at a slant sweeping left to right
      const x = -h * 0.6 + e * (w + h * 1.2);
      ctx.moveTo(-10, -10);
      ctx.lineTo(x + h * 0.3, -10);
      ctx.lineTo(x - h * 0.3, h + 10);
      ctx.lineTo(-10, h + 10);
      break;
    }
    case 'stripes': {
      // six bands, even ones from the left and odd ones from the right, each a little after the one above
      const n = 6;
      for (let i = 0; i < n; i++) {
        const ki = easeInOut(clamp01(k * 1.4 - i * 0.07));
        const y0 = (i * h) / n;
        if (i % 2) ctx.rect(w * (1 - ki), y0, w * ki, h / n + 1);
        else ctx.rect(0, y0, w * ki, h / n + 1);
      }
      break;
    }
    case 'quad': {
      // the four quarters turn over in order (top-left, top-right, bottom-right, bottom-left)
      const order = [[0, 0], [1, 0], [1, 1], [0, 1]];
      order.forEach(([qx, qy], i) => {
        const ki = easeInOut(clamp01(k * 1.6 - i * 0.2));
        const qw = (w / 2) * ki;
        ctx.rect(qx * (w / 2) + (w / 2 - qw) / 2, qy * (h / 2), qw, h / 2);
      });
      break;
    }
    case 'brush': {
      // four broad strokes, bottom-left to top-right, each laid after the last with a rough edge; they overlap and
      // the last one ends exactly at k = 1, so nothing is left to pop in when the section is whole (three strokes
      // left the bottom-right corner bare)
      for (let s = 0; s < 4; s++) {
        const ks = clamp01(k * 2.6 - s * 0.53);
        if (ks <= 0) continue;
        const y = h * (0.05 + 0.32 * s);
        const len = easeInOut(ks) * (w + 400);
        ctx.moveTo(-200, y + h * 0.3);
        for (let i = 0; i <= 24; i++) {
          const x = -200 + (len * i) / 24;
          ctx.lineTo(x, y - h * 0.22 - (x / w) * h * 0.2 + rnd(s * 50 + i, seed) * 18);
        }
        for (let i = 24; i >= 0; i--) {
          const x = -200 + (len * i) / 24;
          ctx.lineTo(x, y + h * 0.3 - (x / w) * h * 0.2 + rnd(s * 50 + i, seed + 3) * 18);
        }
        ctx.closePath();
      }
      break;
    }
    case 'liquid': {
      // the surface rises from the bottom in two travelling waves
      const level = h * (1.08 - e * 1.2);
      ctx.moveTo(-10, h + 10);
      for (let x = -10; x <= w + 10; x += 20) ctx.lineTo(x, level + Math.sin(x / 140 + k * 9) * 22 + Math.sin(x / 61 - k * 13) * 9);
      ctx.lineTo(w + 10, h + 10);
      break;
    }
    case 'drip': {
      // paint runs down from the top edge in columns of uneven speed, round at their ends
      const n = 14;
      for (let i = 0; i < n; i++) {
        const cw = w / n;
        const len = clamp01(k * (1.1 + rnd(i, seed) * 0.8)) * (h + cw);
        if (len <= 0) continue;
        ctx.rect(i * cw - 1, -10, cw + 2, len - cw / 2 + 10);
        ctx.moveTo(i * cw + cw, len - cw / 2);
        ctx.arc(i * cw + cw / 2, len - cw / 2, cw / 2 + 1, 0, Math.PI * 2);
      }
      break;
    }
    case 'zigzag': {
      // a saw-tooth edge tearing across from left to right
      const x = -120 + e * (w + 240);
      const teeth = 9;
      ctx.moveTo(-10, -10);
      for (let i = 0; i <= teeth * 2; i++) ctx.lineTo(x + (i % 2 ? 60 : -60), (i * h) / (teeth * 2));
      ctx.lineTo(-10, h + 10);
      break;
    }
    case 'diamond': {
      const r = e * (w / 2 + h / 2) * 1.05;
      ctx.moveTo(w / 2, h / 2 - r);
      ctx.lineTo(w / 2 + r, h / 2);
      ctx.lineTo(w / 2, h / 2 + r);
      ctx.lineTo(w / 2 - r, h / 2);
      break;
    }
    case 'iris': {
      // a camera aperture: a hexagon that opens while it turns
      const r = e * R * 0.62;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + e * 1.2;
        const px = w / 2 + Math.cos(a) * r;
        const py = h / 2 + Math.sin(a) * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      break;
    }
    case 'checker': {
      // cells turn over in a diagonal wave from the top-left corner
      const cols = 8;
      const rows = 5;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const ki = easeInOut(clamp01(k * 2 - (c + r) / (cols + rows - 2)));
          if (ki <= 0) continue;
          const cw = w / cols;
          const ch = h / rows;
          ctx.rect(c * cw + (cw * (1 - ki)) / 2, r * ch, cw * ki + 1, ch + 1);
        }
      break;
    }
    case 'bars': {
      // equaliser bars grow up and down from the middle row, the centre ones first
      const n = 16;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(i - (n - 1) / 2) / (n / 2);
        const ki = easeInOut(clamp01(k * 1.7 - d * 0.6 - rnd(i, seed) * 0.1));
        // a bar not yet started draws nothing (its 2 px seam showed a line at k = 0)
        if (ki <= 0) continue;
        ctx.rect((i * w) / n, h / 2 - (ki * h) / 2 - 1, w / n + 1, ki * h + 2);
      }
      break;
    }
    case 'star': {
      // a five-pointed star opening from the centre, turning a little, until even its inner corners pass the frame
      const r = e * R * 1.25;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5 + e * 0.6;
        const rr = i % 2 ? r * 0.45 : r;
        if (i) ctx.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
        else ctx.moveTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
      }
      break;
    }
    case 'pinwheel': {
      // six blades sweep round the centre together, each a widening wedge, until they meet
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
        ctx.moveTo(w / 2, h / 2);
        ctx.arc(w / 2, h / 2, R, a0, a0 + e * ((Math.PI * 2) / n) + 1e-4);
        ctx.closePath();
      }
      break;
    }
    case 'corners': {
      // four triangles grow in from the corners and close in the middle
      const s = e * (w + h) * 0.62;
      for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [w, 0, -1, 1], [w, h, -1, -1], [0, h, 1, -1]]) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * s * 1.4, cy);
        ctx.lineTo(cx, cy + dy * s * 1.4);
        ctx.closePath();
      }
      break;
    }
    case 'grid': {
      // a 3 × 3 grid, each cell flips open (grows from its centre line) in a scattered order
      const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
      for (let j = 0; j < 9; j++) {
        const c = order[j];
        const ki = easeInOut(clamp01(k * 1.8 - j * 0.1));
        if (ki <= 0) continue;
        const cw = w / 3;
        const ch = h / 3;
        ctx.rect((c % 3) * cw - 1, Math.floor(c / 3) * ch + (ch * (1 - ki)) / 2 - 1, cw + 2, ch * ki + 2);
      }
      break;
    }
    case 'ripple': {
      // the new section spreads from one point with a rippling edge, like a drop landing in water
      const cx = w * (0.3 + 0.4 * rnd(seed, 3));
      const cy = h * (0.3 + 0.4 * rnd(seed, 4));
      const front = e * Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.12;
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const r = front * (1 + 0.06 * Math.sin(a * 9 + k * 14));
        if (i) ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      break;
    }
    case 'wave': {
      // a soft wave edge washing across from left to right
      const x = -160 + e * (w + 320);
      ctx.moveTo(-10, -10);
      for (let y = -10; y <= h + 10; y += 20) ctx.lineTo(x + Math.sin(y / 120 + k * 6) * 70, y);
      ctx.lineTo(-10, h + 10);
      break;
    }
    case 'impact': {
      // the cut lands at once under a white flash (drawn by transitionAccent); the mask is the whole frame
      if (k > 0.12) ctx.rect(0, 0, w, h);
      break;
    }
  }
  ctx.fill();
}

/** Extra marks over the composite: the impact's flash and shock ring. */
export function transitionAccent(ctx: CanvasRenderingContext2D, kind: TransitionKind, k: number, w: number, h: number) {
  if (kind !== 'impact') return;
  const flash = k < 0.12 ? k / 0.12 : Math.exp(-(k - 0.12) * 9);
  ctx.save();
  ctx.globalAlpha = 0.85 * flash;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = clamp01(1 - k) * 0.9;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 18 * (1 - k) + 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, easeInOut(clamp01(k)) * Math.hypot(w, h) * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Reads a section's transition as the director writes it: "kind", "kind:seconds" or "kind:seconds:#rrggbb". */
export function parseTransition(v: unknown): SectionTransition | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const [kind, dur, color] = v.split(':').map((x) => x.trim());
  if (!TRANSITION_KINDS.includes(kind as TransitionKind)) return undefined;
  const d = Number(dur);
  return { kind: kind as TransitionKind, ...(d > 0 ? { dur: Math.min(1.5, Math.max(0.25, d)) } : {}), ...(/^#[0-9a-f]{6}$/i.test(color ?? '') ? { color } : {}) };
}
