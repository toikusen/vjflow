/**
 * Test-only 2D canvas for jsdom, which has no canvas (getContext returns null): every draw call is a no-op,
 * every character measures 30 px wide with a 30/6 px ascent/descent, and getImageData hands back clear pixels.
 *
 * Specs share one module cache per worker (the Angular Vitest runner defaults to isolate: false), so every
 * canvas spec installs this same stub and takes it down again: a context cached by a module under one spec
 * then measures the same under the next. Returns the function that puts jsdom's own getContext back.
 */
export function stubCanvas2d(): () => void {
  const metrics = { width: 30, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 30 };
  const stub = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) =>
      k === 'measureText'
        ? () => metrics
        : k === 'getImageData'
          ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
          : () => ({ addColorStop: () => undefined }),
    set: () => true,
  });
  const own = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => stub) as never;
  return () => {
    HTMLCanvasElement.prototype.getContext = own;
  };
}
