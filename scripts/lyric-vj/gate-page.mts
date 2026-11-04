// The reading gate's page side (style-gate-reading.mts), bundled and added before the render page's own scripts: it
// watches for a soft clearing behind the words and reads one moment against the shared reading rules.
import { readMoment } from '../../src/app/lyric-vj/reading-rules';

/** A soft clearing behind the words: a gradient made by one of the clearing functions while a moment is grabbed. */
export const SOFT = /clearWords|holdInkGround|wiped|plainRound/;
const w = window as unknown as { __soft: number; __watch: boolean; vjLyrics(on: boolean, carriers?: boolean): void; __carriers?: boolean; grabAt(t: number, q: number): Promise<string>; gatePage: unknown };
w.__soft = 0;
for (const proto of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype] as unknown as Record<string, (...a: unknown[]) => unknown>[])
  for (const name of ['createRadialGradient', 'createLinearGradient']) {
    const f = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]) { if (w.__watch && SOFT.test(new Error().stack ?? '')) w.__soft++; return f.apply(this, a); };
  }

/** One moment: the reading measure on grey w×h (as the gate always read it), the rules on 480×270, and the soft clearing. */
async function moment(t: number, gw: number, gh: number) {
  const shot = async (on: boolean) => {
    // the frame without the words keeps what they stand on (a card, a banner): what is really behind them (the gate's
    // default; under --strip-carriers __carriers is unset and they go with the words)
    w.vjLyrics(on, !!w.__carriers);
    const img = new Image();
    img.src = await w.grabAt(t, 0.7);
    await img.decode();
    const c = new OffscreenCanvas(gw, gh).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, gw, gh);
    const d = c.getImageData(0, 0, gw, gh).data;
    const b = new OffscreenCanvas(480, 270).getContext('2d', { willReadFrequently: true })!;
    b.drawImage(img, 0, 0, 480, 270);
    return { grey: Array.from({ length: gw * gh }, (_, i) => Math.round(0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2])), big: b.getImageData(0, 0, 480, 270).data };
  };
  w.__soft = 0;
  w.__watch = true;
  const on = await shot(true);
  w.__watch = false;
  const off = await shot(false);
  w.vjLyrics(true);
  let [n, sum, x0, x1, y0, y1] = [0, 0, gw, 0, gh, 0];
  on.grey.forEach((v, i) => { const d = Math.abs(v - off.grey[i]); if (d > 20) { n++; sum += d; const [x, y] = [i % gw, Math.floor(i / gw)]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  return { n, sum, x0, x1, y0, y1, rules: readMoment(on.big, off.big, 480, 270), soft: w.__soft > 0 };
}
w.gatePage = { moment };
