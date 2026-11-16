import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAlpha, CLEAR_FADE, clearTally, resetCover } from './cover';
import { drawLook, GraphicsLook, Layer } from './graphics';

/** A 2D-matrix stand-in (jsdom has no DOMMatrix): only what drawCode and coverOf use. */
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

/** What reached the frame: each sprite draw, the alpha it was drawn at, and whether the lyric box was clipped out of it. */
type Drawn = { x: number; alpha: number; holed: boolean };
/** The path ops the drawing's own stroke() would draw (what it built since its last beginPath). */
const stroked: string[][] = [];

/** jsdom has no Path2D: a stand-in that counts its rectangles. */
class P2 {
  rects = 0;
  rect() {
    this.rects++;
  }
}

/** A canvas context on the 2D context's prototype (drawCode watches drawImage there; jsdom has none, so one is lent), recording each draw. */
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
  let path: string[] = [];
  proto.drawImage = function (this: { globalAlpha: number }, _pic: unknown, x: number) {
    drawn.push({ x, alpha: state.alpha, holed: state.holed });
  };
  const ctx = Object.create(proto, {
    globalAlpha: { get: () => state.alpha, set: (v: number) => (state.alpha = v) },
  });
  const noop = () => undefined;
  Object.assign(ctx, {
    save: () => stack.push({ ...state }),
    restore: () => (state = stack.pop() ?? state),
    getTransform: () => state.m,
    setTransform: (m: M) => (state.m = m),
    beginPath: () => (path = []),
    rect: () => path.push('rect'),
    moveTo: () => path.push('moveTo'),
    lineTo: () => path.push('lineTo'),
    stroke: () => stroked.push([...path]),
    clip: (a: P2 | string, b?: string) => (state.holed ||= a instanceof P2 ? b === 'evenodd' && a.rects === 2 : a === 'evenodd' && path.filter((x) => x === 'rect').length === 2),
    clearRect: noop, fillRect: noop, translate: noop, scale: noop, rotate: noop, fill: noop, arc: noop,
    canvas: { width: 1920, height: 1080 },
  });
  return { ctx: ctx as CanvasRenderingContext2D, restore: () => (lentPath && delete g.Path2D, lent ? delete g.CanvasRenderingContext2D : (proto.drawImage = own)) };
}

describe('a code layer keeps its sprites off the lyric while it is read', () => {
  let undo: (() => void) | undefined;
  beforeEach(resetCover);
  afterEach(() => undo?.());

  /** One frame of a code layer that draws the sprite `bottle` (100 px square) at each x, the lyric box 600–1300 × 400–600. */
  const lyric = { x0: 600, y0: 400, x1: 1300, y1: 600 };
  const frame = (xs: number[], weight = 1, src0?: string, more: Partial<{ guard: object; lyric: object }> = {}, pic: object = { width: 100, height: 100 }) => {
    const drawn: Drawn[] = [];
    const { ctx, restore } = frameCtx(drawn);
    undo = restore;
    const src = src0 ?? `const b = f.img('bottle'); for (const x of ${JSON.stringify(xs)}) ctx.drawImage(b, x, 450, 100, 100);`;
    const look = { sections: [{ start: 0, layers: [{ kind: 'code', src }] }] } as unknown as GraphicsLook;
    drawLook(ctx, look, 1, { since: 0, pulse: 0, index: 0 } as never, (a) => (a === 'spr:bottle' ? (pic as CanvasImageSource) : undefined), (ls: Layer[]) => ls.map((l) => ({ ...l, lyric, lyricWeight: weight, ...more }) as Layer));
    return drawn;
  };

  it('a sprite clear of the box is drawn as it is; one on the words is not drawn; one at its edge is faded with the box cut out', () => {
    // clear (x 200), wholly inside (x 900), a fifth inside (x 520: 80 px out, 20 px in)
    const [clear, half] = frame([200, 900, 520]);
    expect(clear).toEqual({ x: 200, alpha: 1, holed: false });
    expect(half.x).toBe(520);
    expect(half.holed).toBe(true);
    // (measured on the picture's 24-cell mask: 5 of 24 columns inside)
    expect(half.alpha).toBeCloseTo(clearAlpha(5 / 24));
    expect(frame([200, 900, 520])).toHaveLength(2);
  });

  it('comes in with the line: no hold before its box glides in, a fade (no cut) while it does, all of it once read', () => {
    expect(frame([900], 0.4)).toEqual([{ x: 900, alpha: 1, holed: false }]);
    const [gliding] = frame([900], 0.675);
    expect(gliding.holed).toBe(false);
    expect(gliding.alpha).toBeCloseTo(0.5);
    expect(frame([900], 0.9)).toEqual([]);
  });

  it('fades evenly to nothing as more of the picture moves in', () => {
    expect([clearAlpha(0), clearAlpha(CLEAR_FADE / 2), clearAlpha(CLEAR_FADE), clearAlpha(1)]).toEqual([1, 0.5, 0, 0]);
  });

  it("keeps the drawing's own path: the cut-out never replaces what the drawing will stroke next", () => {
    stroked.length = 0;
    frame([], 1, "const b = f.img('bottle'); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(50, 50); ctx.drawImage(b, 520, 450, 100, 100); ctx.stroke();");
    expect(stroked).toEqual([['moveTo', 'lineTo']]);
  });

  it('while the box glides from one line to the next, both places are kept clear, by fading only', async () => {
    const { blendLayer } = await import('./graphics');
    const from = { x0: 0, y0: 0, x1: 100, y1: 50 }, to = { x0: 1000, y0: 0, x1: 1100, y1: 50 };
    const mid = blendLayer({ kind: 'code', src: '', lyric: from } as Layer, { kind: 'code', src: '', lyric: to } as Layer, 0.5) as { guard?: object };
    expect(mid.guard).toEqual({ x0: 0, y0: 0, x1: 1100, y1: 50 });
    // a sprite on the incoming line's place (900 wide of the in-between box at 600–1300 here is the guard's)
    const [on] = frame([1400], 1, undefined, { lyric: { x0: 600, y0: 400, x1: 1300, y1: 600 }, guard: { x0: 600, y0: 400, x1: 1600, y1: 600 } });
    expect(on).toBeUndefined();
    const [edge] = frame([520], 1, undefined, { guard: { x0: 600, y0: 400, x1: 1600, y1: 600 } });
    expect(edge.holed).toBe(false);
    expect(edge.alpha).toBeCloseTo(clearAlpha(5 / 24));
  });

  it('records a faded-only cover at the strength it shows, layer alpha included', () => {
    const logged: string[] = [];
    const err = console.error;
    console.error = (x: string) => logged.push(x);
    try {
      frame([900], 0.675, "const b = f.img('bottle'); ctx.globalAlpha = 0; ctx.drawImage(b, 900, 450, 100, 100);");
      expect(logged).toEqual([]);
      resetCover();
      frame([900], 0.675);
      expect(logged.filter((x) => x.includes('lyric covered'))).toHaveLength(1);
    } finally {
      console.error = err;
    }
  });

  it('counts and reports every sprite it had to keep clear: the drawing is sent back to place it in the room', () => {
    const logged: string[] = [];
    const err = console.error;
    console.error = (x: string) => logged.push(x);
    try {
      frame([900, 520, 200]);
      expect(clearTally()).toEqual({ draws: 2, cut: 2, faded: 0 });
      expect(logged.filter((x) => x.startsWith('code layer: lyric kept clear: bottle 100% inside the lyric box, cut out and faded at 1.0 s (shot 0)'))).toHaveLength(1);
      // the same picture at the same place is reported once more only when more of it is inside
      frame([900]);
      expect(logged.filter((x) => x.includes('lyric kept clear'))).toHaveLength(1);
      expect(clearTally().draws).toBe(3);
    } finally {
      console.error = err;
    }
  });

  it('gives the drawing the room the lines leave its shot: a prop placed with f.fit is never kept clear', () => {
    const lines = [{ from: 0, to: 9, ...lyric }];
    const src = "const b = f.img('bottle'); const [x, y, w, h] = f.fit(900, 450, 100, 100); ctx.drawImage(b, x, y, w, h); f.cache.room = f.room(); f.cache.lines = f.lines.length;";
    const placed = frame([], 1, src, { lines } as never);
    expect(placed).toEqual([{ x: 900, alpha: 1, holed: false }]);
    expect(clearTally().draws).toBe(0);
    // the same draw without f.fit is cut out of the words
    expect(frame([900], 1, undefined, { lines } as never)).toEqual([]);
    expect(clearTally().draws).toBe(1);
  });

  it("measures a sprite sheet's drawn cell, not the whole sheet", () => {
    // a 200 × 100 sheet: its left cell clear, its right cell opaque; the right cell is drawn on the words
    const g = globalThis as { OffscreenCanvas?: unknown };
    const lent = !g.OffscreenCanvas;
    let sx = 0;
    if (lent)
      g.OffscreenCanvas = class {
        getContext() {
          return { drawImage: (_i: unknown, x: number) => (sx = x), getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(sx >= 100 ? 255 : 0) }) };
        }
      };
    try {
      const sheet = { width: 200, height: 100 };
      const drawn = frame([], 1, "const s = f.img('bottle'); ctx.drawImage(s, 100, 0, 100, 100, 900, 450, 100, 100);", {}, sheet);
      expect(drawn).toEqual([]);
    } finally {
      if (lent) delete g.OffscreenCanvas;
    }
  });
});
