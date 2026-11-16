import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stubCanvas2d } from '../testdata/canvas-stub';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, IDLE_KINDS, type CueStyle } from '../treatment';
import { fx, layer, runtime, scene } from '../testdata/text-harness';
import { withTextFx } from './text-fx';

// The export renders frames in order; the preview seeks, scrubs back and skips frames when busy. A frame must be a
// function of its time alone, so every drawn effect is rendered here at chosen times four ways (straight seek, played
// in order at 30 fps, after a seek past it and back, after a jump over 0.2 s) and its scene compared, object by object.
let restore: () => void;
beforeAll(() => void (restore = stubCanvas2d()));
afterAll(() => restore());

const ORDERS: Record<string, (t: number) => number[]> = {
  seek: (t) => [t],
  played: (t) => [...Array(Math.round((t - 0.9) * 30)).keys()].map((k) => 0.9 + k / 30).concat(t),
  back: (t) => [t + 0.5, t],
  jump: (t) => [t - 0.25, t],
};
const TIMES = [1.03, 1.2, 1.7, 3.08, 3.3];

/** The rendered scene at t for each order. */
function framesAt(style: Partial<CueStyle>, t: number): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(ORDERS).map(([name, times]) => {
      const l = withTextFx(layer(), runtime(style));
      let last: string[] = [];
      for (const s of times(t)) l.update(s, fx), (last = scene(l));
      return [name, last];
    }),
  );
}

/** The styles a director can give a line, one technique at a time. */
const STYLES: [string, Partial<CueStyle>][] = [
  ...ENTER_KINDS.map((e) => [`enter:${e}`, { enter: e }] as [string, Partial<CueStyle>]),
  ...EXIT_KINDS.map((e) => [`exit:${e}`, { exit: e }] as [string, Partial<CueStyle>]),
  ...IDLE_KINDS.map((e) => [`idle:${e}`, { idle: e }] as [string, Partial<CueStyle>]),
  ...EMPHASIS_METHODS.map((m) => [`emph:${m}`, { emphasis: [{ from: 1, to: 3, method: m }] }] as [string, Partial<CueStyle>]),
  ['trail', { trail: true }],
];

describe('seek order: a frame is a function of its time', () => {
  it.each(STYLES)('%s renders the same by seek, play, back-seek and jump', (_, style) => {
    for (const t of TIMES) {
      const f = framesAt(style, t);
      for (const name of ['played', 'back', 'jump']) expect(f[name], `${name} at ${t}`).toEqual(f['seek']);
    }
  });
});

describe('trail cost', () => {
  it('reads past poses off the template alone, once per time: about two template frames a played frame, not four', () => {
    const base = layer();
    let calls = 0;
    const own = base.update;
    base.update = (t, f) => (calls++, own(t, f));
    const l = withTextFx(base, runtime({ trail: true, enter: 'decode' }));
    for (let k = 0; k < 20; k++) l.update(1 + k / 30, fx);
    calls = 0;
    // once playing, each frame needs one past pose it has not seen (3 frames back) and its own
    for (let k = 20; k < 40; k++) l.update(1 + k / 30, fx);
    expect(calls).toBeLessThanOrEqual(20 * 2);
  });
});

describe('a bare kinetic cut keeps one ink whatever frame is drawn first', () => {
  it('decides at the cut\'s start (deciding mode) and never from a later first frame', async () => {
    const { drawKinetic, setDecidingInk } = await import('./kinetic');
    // a canvas whose ground turns from dark to light over the cut
    const ctxAt = (light: boolean, fills: string[]) => new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)).fill(light ? 240 : 10), width: w, height: h }) : k === 'measureText' ? () => ({ width: 30 }) : String(k).startsWith('create') ? () => ({ addColorStop: () => undefined }) : k === 'getTransform' ? () => undefined : () => undefined),
      set: (_, k, v) => (k === 'fillStyle' && fills.push(String(v)), true),
    });
    const layer = () => ({ kind: 'kinetic', fx: 'stars', words: [], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', bare: true, at: 10 }) as never;
    const decided = layer();
    setDecidingInk(true);
    drawKinetic(ctxAt(false, []), decided, 0.01, { pulse: 0 } as never, () => undefined);
    setDecidingInk(false);
    const seekLate: string[] = [];
    drawKinetic(ctxAt(true, []), decided, 3, { pulse: 0 } as never, () => undefined);
    drawKinetic(ctxAt(true, seekLate), decided, 3, { pulse: 0 } as never, () => undefined);
    const fromStart: string[] = [];
    const again = layer();
    setDecidingInk(true);
    drawKinetic(ctxAt(false, []), again, 0.01, { pulse: 0 } as never, () => undefined);
    setDecidingInk(false);
    drawKinetic(ctxAt(true, fromStart), again, 3, { pulse: 0 } as never, () => undefined);
    expect(seekLate).toEqual(fromStart);
    expect((decided as { inkDark?: boolean }).inkDark).toBeDefined();
  });
});
