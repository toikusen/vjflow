import { afterEach, describe, expect, it } from 'vitest';
import { darkest, drawnGround, inkTones, setInkTones, surfaceShare, type ToneTable } from './ink-tones';
import { FX_VERSION } from './final-warp.glsl';
import { bodyInk, standsOn } from './hold-room';
import { SET_SPECS } from './world-sets';
import { contrast } from '../contrast';
import '../style-worlds';

const table = (o: Partial<ToneTable> = {}): ToneTable => ({ v: 1, fx: FX_VERSION, commit: 'test', built: 'test', grounds: {}, surfaces: {}, ...o });
const lum = (c: string) => { const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return [1, 3, 5].map((i) => f(parseInt(c.slice(i, i + 2), 16) / 255)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0); };

describe('the sampled tone table (M4)', () => {
  afterEach(() => setInkTones(undefined));

  it('darkens an ink to the share of its luminance its surface draws at its darkest', () => {
    expect(darkest('#dccfea', undefined)).toBe('#dccfea');
    expect(lum(darkest('#dccfea', 0.7)) / lum('#dccfea')).toBeCloseTo(0.7, 1);
  });

  it('is read only on the effects it was made on; a missing entry reads nothing', () => {
    setInkTones(table({ fx: 'other', grounds: { 'x|y': { lo: '#000000', hi: '#111111', n: 1 } } }));
    expect(inkTones()).toBeUndefined();
    setInkTones(table({ grounds: { 'x|y': { lo: '#000000', hi: '#111111', n: 1 } }, surfaces: { 'tape|#6a4c93': 0.7 } }));
    expect(drawnGround('x', 'y')).toEqual({ lo: '#000000', hi: '#111111', n: 1 });
    expect(drawnGround('x', 'z')).toBeUndefined();
    expect(surfaceShare('tape', '#6A4C93')).toBe(0.7);
  });

  it("a set's words stand on what the page really draws there too, and its ink is decided on it as drawn", () => {
    const spec = SET_SPECS['dark-glitch/tape'];
    const slots = { id: 'amber-dial', ground: '#110C08', ink: '#E6CFA0', ink2: '#8A5A2C', accent: '#D9622A', plate: '#C7B287', plateInk: '#1C130A', faint: '#3A2A18' } as never as Parameters<typeof standsOn>[1];
    const flat = standsOn(spec, slots);
    // the tape's margin as drawn: far darker than its plate slot
    setInkTones(table({ grounds: { 'dark-glitch/tape|amber-dial': { lo: '#8f7f60', hi: '#c7b287', n: 40 } } }));
    expect(standsOn(spec, slots)).toEqual([...flat, '#8f7f60', '#c7b287']);
    const ink = bodyInk(spec, slots, slots.plateInk);
    expect(contrast(ink, '#8f7f60')).toBeGreaterThanOrEqual(4.5);
  });
});
