import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTally, resetCover } from './cover';
import { drawLook, GraphicsLook, Layer, resetCodePlans } from './graphics';

/** A 2D-matrix stand-in (jsdom has no DOMMatrix). */
class M {
  constructor(public a = 1, public b = 0, public c = 0, public d = 1, public e = 0, public f = 0) {}
  multiply(o: M) {
    return new M(this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b, this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d, this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f);
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    return new M(this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det);
  }
}
class P2 {
  rect() {}
}

/** One sprite draw as it reached the frame. */
type Drawn = { x: number; y: number; w: number; h: number; alpha: number; holed: boolean };

function frameCtx(drawn: Drawn[]) {
  const g = globalThis as { CanvasRenderingContext2D?: { prototype: object }; Path2D?: unknown };
  const lent = !g.CanvasRenderingContext2D;
  if (lent) g.CanvasRenderingContext2D = class {} as never;
  const lentPath = !g.Path2D;
  if (lentPath) g.Path2D = P2;
  const proto = g.CanvasRenderingContext2D!.prototype as { drawImage?: unknown };
  const own = proto.drawImage;
  const stack: { alpha: number; holed: boolean; m: M }[] = [];
  let state = { alpha: 1, holed: false, m: new M() };
  proto.drawImage = function (_pic: unknown, x: number, y: number, w: number, h: number) {
    drawn.push({ x, y, w, h, alpha: state.alpha, holed: state.holed });
  };
  const ctx = Object.create(proto, { globalAlpha: { get: () => state.alpha, set: (v: number) => (state.alpha = v) } });
  const noop = () => undefined;
  Object.assign(ctx, {
    save: () => stack.push({ ...state }),
    restore: () => (state = stack.pop() ?? state),
    getTransform: () => state.m,
    setTransform: (m: M) => (state.m = m),
    translate: (x: number, y: number) => (state.m = state.m.multiply(new M(1, 0, 0, 1, x, y))),
    clip: () => (state.holed = true),
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, stroke: noop, clearRect: noop, fillRect: noop, scale: noop, rotate: noop, fill: noop, arc: noop, ellipse: noop,
    canvas: { width: 1920, height: 1080 },
  });
  return { ctx: ctx as CanvasRenderingContext2D, restore: () => (lentPath && delete g.Path2D, lent ? delete g.CanvasRenderingContext2D : (proto.drawImage = own)) };
}

describe('a code layer moves a sprite that would enter a read line into the room its shot leaves', () => {
  let undo: (() => void) | undefined;
  beforeEach(() => (resetCover(), resetCodePlans()));
  afterEach(() => undo?.());

  // the line read 0–9 s across the middle; the frame's floor (below 640) and sky (above 360) are free
  const lyric = { x0: 300, y0: 400, x1: 1600, y1: 600 };
  const lines = [{ from: 0, to: 9, ...lyric }];
  // a lighthouse 200 × 500 standing at x 800–1000 with its foot at y 1000: its tower runs up through the line
  const tower = "const b = f.img('tower'); ctx.drawImage(b, 800 + (f.cache.dx ?? 0) * f.t, 500, 200, 500);";
  const pic = { width: 200, height: 500 };
  const frame = (t: number, opts: { weight?: number; src?: string; lines?: object[]; cuts?: number[]; lyric?: object } = {}) => {
    const drawn: Drawn[] = [];
    const { ctx, restore } = frameCtx(drawn);
    undo = restore;
    const look = { sections: [{ start: 0, layers: [{ kind: 'code', src: opts.src ?? tower, cuts: opts.cuts }] }] } as unknown as GraphicsLook;
    drawLook(ctx, look, t, { since: 0, pulse: 0, index: 0 } as never, (a) => (a === 'spr:tower' ? (pic as unknown as CanvasImageSource) : undefined), (ls: Layer[]) => ls.map((l) => ({ ...l, lyric: opts.lyric ?? lyric, lyricWeight: opts.weight ?? 1, lines: opts.lines ?? lines }) as Layer));
    restore();
    return drawn;
  };

  it('keeps its foot and moves it into the room beside the words instead of cutting it out of them', () => {
    const [d] = frame(2);
    expect(d.holed).toBe(false);
    expect(d.alpha).toBe(1);
    expect(d.y + d.h).toBeCloseTo(1000);
    // whole, slid into the nearer strip beside the line (0–260): clear of the words at its own size
    expect(d.w).toBeCloseTo(200);
    expect(d.x + d.w).toBeLessThanOrEqual(260);
    expect(clearTally()).toMatchObject({ draws: 0, moved: 1 });
  });

  it('shrinks it into the floor under the lines when no side is free', () => {
    const wide = { x0: 40, y0: 400, x1: 1880, y1: 600 };
    const [d] = frame(2, { lyric: wide, lines: [{ from: 0, to: 9, ...wide }] });
    expect(d.holed).toBe(false);
    expect(d.y + d.h).toBeCloseTo(1000);
    expect(d.y).toBeGreaterThanOrEqual(640);
    expect(d.x + d.w / 2).toBeCloseTo(900);
  });

  it('decides the move once a shot: the same offset all through it', () => {
    // a sprite drifting right: its offset from where the drawing put it does not change within the shot
    const src = "const b = f.img('tower'); ctx.drawImage(b, 700 + 20 * f.t, 500, 200, 500);";
    const at = (t: number) => frame(t, { src })[0];
    const [a, b] = [at(1), at(4)];
    expect(a.w).toBeCloseTo(b.w);
    expect(a.y).toBeCloseTo(b.y);
    expect(b.x + b.w / 2 - (a.x + a.w / 2)).toBeCloseTo(60);
  });

  it('is the same at any seek', () => {
    const first = frame(3)[0];
    resetCodePlans();
    frame(7);
    frame(1);
    expect(frame(3)[0]).toEqual(first);
  });

  it('eases in with the line: no pop as the box comes up', () => {
    // the line comes up at 1 s; one frame a step from just before it to past its glide
    const late = [{ from: 1, to: 9, ...lyric }];
    const ds = Array.from({ length: 18 }, (_, i) => frame(0.9 + i / 30, { lines: late })[0]);
    expect(ds[0]).toMatchObject({ x: 800, y: 500, w: 200, h: 500 });
    const step = (a: Drawn, b: Drawn) => Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.w - b.w);
    const total = step(ds[ds.length - 1], ds[0]);
    expect(total).toBeGreaterThan(100);
    for (let i = 1; i < ds.length; i++) {
      // a 0.4 s glide: no step bigger than a fifth of the whole move, and the foot never leaves the ground
      expect(step(ds[i], ds[i - 1])).toBeLessThanOrEqual(0.2 * total + 1e-6);
      expect(ds[i].y + ds[i].h).toBeCloseTo(1000);
    }
  });

  it('never moves a sprite partly off the frame at any time of the shot', () => {
    // lines down the whole middle; a sprite drifting right toward the frame's edge: a move fitted early pushes it off
    const tall = { x0: 260, y0: 0, x1: 1660, y1: 1080 };
    const src = "const b = f.img('tower'); ctx.drawImage(b, 1300 + 60 * f.t, 500, 200, 500);";
    for (const t of [0.5, 2, 3.5, 4.5, 6]) {
      const [d] = frame(t, { src, lyric: tall, lines: [{ from: 0, to: 9, ...tall }] });
      if (!d) continue;
      const orig = 1300 + 60 * t;
      // where the drawing had it inside the frame, a move keeps it inside (3 % of it may cross the edge)
      if (orig + 200 <= 1920) expect(d.x + d.w, `t ${t}`).toBeLessThanOrEqual(1920 + 0.03 * d.w + 1e-6);
      expect(d.x, `t ${t}`).toBeGreaterThanOrEqual(-0.03 * d.w - 1e-6);
    }
  });

  it('never moves a sprite off the thing it stands on: a base painted under its foot keeps it there (cut instead)', () => {
    const src = "ctx.fillStyle = '#777'; ctx.beginPath(); ctx.ellipse(900, 1000, 140, 30, 0, 0, Math.PI * 2); ctx.fill(); " + tower;
    const [d] = frame(2, { src });
    expect(d).toMatchObject({ x: 800, y: 500, w: 200, h: 500, holed: true });
    expect(clearTally()).toMatchObject({ moved: 0 });
    // a frame-wide band under it (the sea) is not a base: it still moves
    const sea = "ctx.fillStyle = '#579'; ctx.fillRect(0, 700, 1920, 380); " + tower;
    expect(frame(2, { src: sea })[0].holed).toBe(false);
  });

  it('falls back to the cut when the lines leave no room', () => {
    const full = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
    const drawn = frame(2, { lyric: full, lines: [{ from: 0, to: 9, ...full }] });
    expect(drawn).toEqual([]);
    expect(clearTally()).toMatchObject({ draws: 1, moved: 0 });
  });
});
