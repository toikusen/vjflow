import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stubCanvas2d } from '../testdata/canvas-stub';
import { fx, layer as textLayer, runtime, scene } from '../testdata/text-harness';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, IDLE_KINDS, type CueStyle } from '../treatment';
import { drawKinetic, KINETIC_FX, type KineticLayer } from './kinetic';
import { glyphMotion, type CueRuntime } from './runtime';
import { withTextFx } from './text-fx';
import { KNOBS } from './knobs';

// The effect contract (idea after motionshelf, MIT): every move the director can pick draws at a known moment without
// error, and every knob it can be tuned by really changes what is drawn. A knob that changes nothing is a promise to
// the director the renderer does not keep. "Drawn" is the canvas call log: every call and every state set, in order.

/** A 2D context that records what is drawn. */
function recorder(log: string[]): CanvasRenderingContext2D {
  const r = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : typeof x === 'string' ? x : typeof x);
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) =>
      k === 'measureText'
        ? (s: string) => ({ width: 30 * [...String(s)].length, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 6 })
        : k === 'getImageData'
          ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h })
          : k === 'getTransform'
            ? () => undefined
            : String(k).startsWith('create')
              ? () => ({ addColorStop: () => undefined, setTransform: () => undefined })
              : (...a: unknown[]) => void log.push(`${String(k)}(${a.map(r).join(',')})`),
    set: (_, k, v) => (log.push(`${String(k)}=${r(v)}`), true),
  });
}

// (pictures made from the character go through canvases of their own: jsdom has none)
let restore: () => void;
beforeAll(() => void (restore = stubCanvas2d()));
afterAll(() => restore());

/** Enough distinct words that no move's count is capped by the line, a character to print, a labelled reading. */
const layer = (fx: string, style: number, tune?: Record<string, number>): KineticLayer => ({ kind: 'kinetic', fx, style, words: ['君の夕焼け', 'またね', '星', '走れ', '明日へ', '光'], sprite: 'hero', label: '170cm', ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', song: 4242, tune });
const picture = { width: 400, height: 600 } as unknown as CanvasImageSource;
/** Every variant a move has (a move's styles share its knobs only where the variant draws the thing tuned). */
const STYLES = [0, 1, 2, 3];
/** Ages a move is drawn at: arriving, settled, late in a long cut. */
const AGES = [0.3, 1.2, 3.5, 7];

function drawn(fx: string, tune?: Record<string, number>): string {
  const log: string[] = [];
  for (const style of STYLES) for (const age of AGES) drawKinetic(recorder(log), layer(fx, style, tune), age, { pulse: 0.5, since: 0.1 } as never, () => picture);
  return log.join(';');
}

describe('effect contract', () => {
  it.each([...KINETIC_FX])('%s draws at known moments without error', (fx) => {
    expect(() => drawn(fx)).not.toThrow();
    expect(drawn(fx).length).toBeGreaterThan(0);
  });

  const knobs = Object.entries(KNOBS).filter(([key]) => KINETIC_FX.includes(key.split('.')[0]));
  it.each(knobs)('%s changes what is drawn', (key, [, lo, hi]) => {
    const fx = key.split('.')[0];
    expect(drawn(fx, { [key]: lo }), `${key} low and high draw the same`).not.toBe(drawn(fx, { [key]: hi }));
  });

  // a line technique is drawn by the template (glyphMotion) or over it (text-fx): either way it must show
  const TIMES = [1.02, 1.1, 1.25, 1.5, 2, 2.6, 3.05, 3.15, 3.3];
  const lineShows = (style: Partial<CueStyle>) => {
    const l = withTextFx(textLayer(), runtime(style));
    const rt = runtime(style) as CueRuntime;
    return TIMES.map((t) => {
      l.update(t, fx);
      const g = [0, 1, 2, 3].map((i) => glyphMotion(rt, { char: 'abcd'[i], index: i, src: i, advance: 30, x: i * 50, y: 0 } as never, 4, t, 0.035));
      return JSON.stringify([scene(l), g]);
    }).join('\n');
  };
  const plain = lineShows({});
  const TEMPLATE_EMPHASIS = new Set(['scale', 'color', 'glow', 'shake']);
  const techniques: [string, Partial<CueStyle>][] = [
    ...ENTER_KINDS.filter((e) => e !== 'cut').map((e) => [`enter:${e}`, { enter: e }] as [string, Partial<CueStyle>]),
    ...EXIT_KINDS.filter((e) => e !== 'fade').map((e) => [`exit:${e}`, { exit: e }] as [string, Partial<CueStyle>]),
    ...IDLE_KINDS.filter((e) => e !== 'still').map((e) => [`idle:${e}`, { idle: e }] as [string, Partial<CueStyle>]),
    // (scale, colour, glow and shake are set by each template as it builds the line: their own specs hold them)
    ...EMPHASIS_METHODS.filter((m) => !TEMPLATE_EMPHASIS.has(m)).map((m) => [`emph:${m}`, { emphasis: [{ from: 0, to: 4, method: m, symbol: 'star' }] }] as [string, Partial<CueStyle>]),
  ];
  it.each(techniques)('%s shows on the line', (_, style) => {
    expect(lineShows(style)).not.toBe(plain);
  });
});
