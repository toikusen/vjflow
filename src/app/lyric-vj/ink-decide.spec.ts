import { describe, expect, it } from 'vitest';
import { decideInk, finalBounds, FX_NONE, minContrast, type FxBox } from './ink-decide';
import { contrast } from './contrast';
import { INK_AIM, INK_MIN, lumOf } from './measured-ink';
import { inkDistance } from './render/key-ink';

const lumHex = (c: string) => lumOf(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));

describe('M3 analytic ink decision', () => {
  it('two ranges that overlap can meet at 1:1; apart, the near ends decide', () => {
    expect(minContrast([0.2, 0.5], [0.4, 0.6])).toBe(1);
    expect(minContrast([0.5, 0.6], [0.0, 0.1])).toBeCloseTo(0.55 / 0.15, 6);
    // (a pair at 4.4999 is not a pair at 4.5)
    const g = 0.0;
    const i = 4.4999 * (g + 0.05) - 0.05;
    expect(minContrast([i, i], [g, g])).toBeLessThan(INK_MIN);
  });

  it('with no effect a flat colour is its own luminance', () => {
    expect(finalBounds('#d9537a', FX_NONE)).toEqual([lumHex('#d9537a'), lumHex('#d9537a')]);
  });

  it('holds every value the final pass can give a flat colour (the shader worked in TS, 300 random cases)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 300; n++) {
      const hex = `#${[0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('')}`;
      const fx: FxBox = { flicker: rnd() * 0.06, vignette: rnd() * 0.5, grain: rnd() * 0.15, halo: false };
      const [lo, hi] = finalBounds(hex, fx);
      // one pixel: vignette factor v, grain noise r, flicker f, as FINAL_SHADER does them
      const v = 1 - rnd() * fx.vignette;
      const r = (rnd() - 0.5) * fx.grain;
      const f = 1 + (rnd() * 2 - 1) * fx.flicker;
      const px = [1, 3, 5].map((i) => Math.min(1, Math.max(0, (parseInt(hex.slice(i, i + 2), 16) / 255 * v + r) * f)));
      const l = lumOf(...(px.map((x) => Math.round(x * 255)) as [number, number, number]));
      expect(l).toBeGreaterThanOrEqual(lo - 1e-3);
      expect(l).toBeLessThanOrEqual(hi + 1e-3);
    }
  });

  it('keeps its own ink where it reads through every effect, moves it a little where it is a hair short, else takes the world ink', () => {
    const fx: FxBox = { flicker: 0.03, vignette: 0.1, grain: 0.07, halo: true };
    // a cream on near-black: its own
    expect(decideInk('#dccfea', ['#0e0a14'], fx)).toMatchObject({ ink: '#dccfea', from: 'own' });
    // violet-hour's accent, 5.1:1 flat, short of the aim once flicker and vignette take their share: lightened a little
    const k = decideInk('#D9537A', ['#0E0A14'], fx);
    expect(k.from).toBe('moved');
    expect(k.min).toBeGreaterThanOrEqual(INK_AIM);
    expect(inkDistance('#D9537A', k.ink)).toBeLessThanOrEqual(0.12);
    expect(contrast(k.ink, '#0E0A14')).toBeGreaterThan(contrast('#D9537A', '#0E0A14'));
    // ink2 (2.9:1) is too far from reading for a small move: the world's ink that reads best
    expect(decideInk('#6A4C93', ['#0E0A14'], fx, ['#6A4C93', '#DCCFEA', '#D9537A'])).toMatchObject({ ink: '#dccfea', from: 'world' });
    // nothing reads: kept, and said so
    expect(decideInk('#777777', ['#808080'], fx, ['#7a7a7a'])).toMatchObject({ ink: '#777777', from: 'none' });
    // the same inputs, the same answer
    expect(decideInk('#D9537A', ['#0E0A14'], fx)).toEqual(k);
  });

  it('the halo takes grain off the rim: a pair grain would break reads with the halo on', () => {
    const noisy: FxBox = { flicker: 0, vignette: 0, grain: 0.2, halo: false };
    const ink = '#8a8a8a';
    expect(decideInk(ink, ['#000000'], { ...noisy, halo: true }).from).toBe('own');
    expect(decideInk(ink, ['#000000'], noisy).from).not.toBe('own');
  });
});
