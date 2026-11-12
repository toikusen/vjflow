import { contrast } from './contrast';
import { groundTones, inkFor, INK_MIN, mergeTones, patchTone, readGlyph, readsOn, textCells } from './measured-ink';

/** An RGBA buffer w × h filled by `at(x, y)`. */
const buffer = (w: number, h: number, at: (x: number, y: number) => [number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = at(x, y); d.set([r, g, b, 255], (y * w + x) * 4); }
  return d;
};
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe('measured ink', () => {
  // y2k/strips: a foil strip whose colour runs down its length, one cell a glyph; nothing declares the cells
  const strip = ['#ffd5c6', '#ef4e84', '#c4c2ff', '#a3e7ff', '#cff6fb'];
  const foil = buffer(60, 300, (_, y) => rgb(strip[Math.min(strip.length - 1, Math.floor(y / 60))]));

  it('reads the ground under each glyph of a multi-colour strip, cell by cell', () => {
    const tones = strip.map((_, i) => groundTones(foil, 60, { x0: 0, y0: i * 60, x1: 60, y1: i * 60 + 60 }));
    tones.forEach((t, i) => expect(t).toEqual({ lo: strip[i], hi: strip[i] }));
    // the roll's grey key reads on the pale cells and not on the hot pink one (3.1:1, 2026-11-12 review)
    expect(readsOn('#3e3e40', [tones[0]])).toBe(true);
    expect(readsOn('#3e3e40', [tones[1]])).toBe(false);
    // a grey a hair short moves in its own lightness until it reads on every cell; the deep ink already does
    const got = inkFor('#3e3e40', tones, ['#0d0a3a', '#ffffff']);
    expect(got.ok).toBe(true);
    expect(tones.every((t) => contrast(got.ink, t!.lo) >= INK_MIN)).toBe(true);
    expect(inkFor('#0d0a3a', tones, []).moved).toBe(false);
  });

  it('takes the world ink for an undeclared sky its own ink does not read on, never a far-moved hue', () => {
    // cel80s/ending-l: the second part in cream on the lilac sky (2.53:1)
    const sky = { lo: '#a58aeb', hi: '#b59cf0' };
    const got = inkFor('#fcf1df', [sky], ['#1b1340', '#fcf1df', '#ffd24a']);
    expect(got).toEqual({ ink: '#1b1340', ok: true, moved: true });
  });

  it('a split card: one ink for the run where one reads on both cards, else patches under the glyphs', () => {
    // card/pair: cream card and red card; the cream line ink reads on the red one, a dark key on the cream one only
    const cream = { lo: '#f9f2e3', hi: '#f9f2e3' };
    const red = { lo: '#ac382b', hi: '#ac382b' };
    expect(inkFor('#f9f2e3', [red, red], []).ok).toBe(true);
    // white over a white disc and a deep sky: no one ink reads on both
    const disc = { lo: '#e8e8f0', hi: '#ffffff' };
    const sky = { lo: '#1d1082', hi: '#241787' };
    expect(inkFor('#ffffff', [disc, sky], ['#0d0a3a', '#ffffff']).ok).toBe(false);
    // the glyph on the disc gets a patch its own white reads on
    const patch = patchTone('#ffffff', disc, ['#0d0a3a', '#ffffff']);
    expect(contrast('#ffffff', patch)).toBeGreaterThanOrEqual(INK_MIN);
    expect(patchTone('#0d0a3a', cream, [])).toBe('#f9f2e3');
  });

  it('keeps the darkest and lightest of several reads', () => {
    expect(mergeTones([{ lo: '#202020', hi: '#808080' }, undefined, { lo: '#101010', hi: '#606060' }])).toEqual({ lo: '#101010', hi: '#808080' });
    expect(mergeTones([undefined])).toBeUndefined();
  });

  it('reads a glyph on a frame against the same frame without it: the worst fifth of its ink', () => {
    // a 20 px square "glyph" in grey: 8 columns on pink, 12 on pale yellow
    const off = buffer(40, 40, (x) => (x < 20 ? rgb('#ef4e84') : rgb('#fdf9d0')));
    const on = buffer(40, 40, (x, y) => (x >= 12 && x < 32 && y >= 10 && y < 30 ? rgb('#3e3e40') : x < 20 ? rgb('#ef4e84') : rgb('#fdf9d0')));
    const r = readGlyph(on, off, 40, { x0: 5, y0: 5, x1: 35, y1: 35 })!;
    expect(r.ink).toBe('#3e3e40');
    expect(r.low).toBeLessThan(INK_MIN);
    expect(r.median).toBeGreaterThan(INK_MIN);
    // too little ink: not read
    expect(readGlyph(off, off, 40, { x0: 0, y0: 0, x1: 40, y1: 40 })).toBeUndefined();
  });

  it('cuts a 2D layer’s text into glyph cells at empty bands and columns', () => {
    const off = buffer(100, 40, () => [0, 0, 0]);
    const on = buffer(100, 40, (x, y) => ((x >= 10 && x < 30) || (x >= 50 && x < 70)) && y >= 10 && y < 30 ? [255, 255, 255] : [0, 0, 0]);
    expect(textCells(on, off, 100, { x0: 0, y0: 0, x1: 100, y1: 40 })).toEqual([{ x0: 10, y0: 10, x1: 30, y1: 30 }, { x0: 50, y0: 10, x1: 70, y1: 30 }]);
  });
});
