import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAlpha, CLEAR_FADE, resetCover } from './cover';
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

/** A canvas context on the 2D context's prototype (drawCode watches drawImage there; jsdom has none, so one is lent), recording each draw. */
function frameCtx(drawn: Drawn[]) {
  const g = globalThis as { CanvasRenderingContext2D?: { prototype: object } };
  const lent = !g.CanvasRenderingContext2D;
  if (lent) g.CanvasRenderingContext2D = class {} as never;
  const proto = g.CanvasRenderingContext2D!.prototype as { drawImage?: unknown };
  const own = proto.drawImage;
  const stack: { alpha: number; holed: boolean; m: M }[] = [];
  let state = { alpha: 1, holed: false, m: new M() };
  let rects = 0;
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
    beginPath: () => (rects = 0),
    rect: () => rects++,
    clip: (rule: string) => (state.holed ||= rule === 'evenodd' && rects === 2),
    clearRect: noop, fillRect: noop, translate: noop, scale: noop, rotate: noop, fill: noop, stroke: noop, moveTo: noop, lineTo: noop, arc: noop,
    canvas: { width: 1920, height: 1080 },
  });
  return { ctx: ctx as CanvasRenderingContext2D, restore: () => (lent ? delete g.CanvasRenderingContext2D : (proto.drawImage = own)) };
}

describe('a code layer keeps its sprites off the lyric while it is read', () => {
  let undo: (() => void) | undefined;
  beforeEach(resetCover);
  afterEach(() => undo?.());

  /** One frame of a code layer that draws the sprite `bottle` (100 px square) at each x, the lyric box 600–1300 × 400–600. */
  const frame = (xs: number[], weight = 1) => {
    const drawn: Drawn[] = [];
    const { ctx, restore } = frameCtx(drawn);
    undo = restore;
    const src = `const b = f.img('bottle'); for (const x of ${JSON.stringify(xs)}) ctx.drawImage(b, x, 450, 100, 100);`;
    const look = { sections: [{ start: 0, layers: [{ kind: 'code', src }] }] } as unknown as GraphicsLook;
    const pic = { width: 100, height: 100 } as unknown as CanvasImageSource;
    const lyric = { x0: 600, y0: 400, x1: 1300, y1: 600 };
    drawLook(ctx, look, 1, { since: 0, pulse: 0, index: 0 } as never, (a) => (a === 'spr:bottle' ? pic : undefined), (ls: Layer[]) => ls.map((l) => ({ ...l, lyric, lyricWeight: weight }) as Layer));
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
});
