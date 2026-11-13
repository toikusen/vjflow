import { describe, expect, it } from 'vitest';
import { glyphOfId, idOf, idRgb, lineOfId, offDrift, reduceGlyphs, resumePoint, rgbId } from './ink-verify';
import { INK_MIN } from './measured-ink';

/** RGBA rows from a list of [r, g, b, a] pixels. */
const rows = (px: number[][]) => Uint8Array.from(px.flat());

describe('ink gate v2 numbers', () => {
  it('encodes a glyph as its line slot and index, and back', () => {
    const id = idOf(7, 41);
    expect([lineOfId(id), glyphOfId(id)]).toEqual([7, 41]);
    expect(rgbId(...idRgb(id))).toBe(id);
    expect(idOf(1, 0)).not.toBe(0);
  });

  it('fails a glyph on its single worst core pixel; mixed pixels are listed, never deciding', () => {
    const id = idOf(1, 0);
    const [r, g, b] = idRgb(id);
    // three core pixels: white on black (21:1) twice, and one grey pair at about 4.49:1
    const on = rows([[255, 255, 255, 255], [255, 255, 255, 255], [116, 116, 116, 255], [0, 0, 0, 255]]);
    const off = rows([[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]);
    const mask = rows([[r, g, b, 255], [r, g, b, 255], [r, g, b, 255], [r, g, b, 128]]);
    const [v] = reduceGlyphs(on, off, mask, 4);
    expect(v.n).toBe(3);
    expect(v.min).toBeLessThan(INK_MIN);
    expect(v.min).toBeGreaterThan(4.4);
    expect(v.status).toBe('fail');
    expect(v.edge).toEqual({ n: 1, min: 1 });
    // the same with every core pixel white: passes, the low mixed pixel still listed
    const [p] = reduceGlyphs(rows([[255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]]), off, mask, 4);
    expect(p.status).toBe('pass');
    expect(p.edge!.min).toBe(1);
  });

  it('reads a ground finer than its grain as its mean: an opaque face over 2 px snow is not failed by one speckle', () => {
    const [w, h] = [12, 12];
    const id = idOf(1, 0);
    const [r, g, b] = idRgb(id);
    // orange face (luminance ≈ 0.25) over dark snow with one light speckle a 4 px period (luminance ≈ the orange's)
    const off = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) off.set((i % w) % 4 === 0 && Math.floor(i / w) % 4 === 0 ? [140, 138, 143, 255] : [14, 10, 20, 255], i * 4);
    const on = new Uint8Array(w * h * 4);
    const mask = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { on.set([220, 100, 40, 255], i * 4); mask.set([r, g, b, 255], i * 4); }
    expect(reduceGlyphs(on, off, mask, w, [], 0)[0].status).toBe('fail');
    expect(reduceGlyphs(on, off, mask, w)[0].status).toBe('pass');
  });

  it('a glyph shown with no core pixel is unverified, not a pass', () => {
    const black = rows([[0, 0, 0, 255]]);
    expect(reduceGlyphs(black, black, rows([[0, 0, 0, 0]]), 1, [idOf(2, 3)])).toEqual([expect.objectContaining({ id: idOf(2, 3), n: 0, status: 'unverified:no-core' })]);
  });

  it('measures the field drift only away from the glyphs', () => {
    const [w, h] = [40, 1];
    const mask = new Uint8Array(w * h * 4);
    mask.set([0, 0, 1, 255], 0);
    const on = new Uint8Array(w * h * 4);
    const off = new Uint8Array(w * h * 4);
    off[4 * 5] = 90; // next to the glyph: inside the grown mask
    expect(offDrift(on, off, mask, w, h, 8)).toBe(0);
    off[4 * 30] = 9; // far from it
    expect(offDrift(on, off, mask, w, h, 8)).toBe(9);
  });

  it('resumes a job after its last moment, and skips a finished one', () => {
    const meta = JSON.stringify({ kind: 'meta' });
    const m = (frame: number) => JSON.stringify({ kind: 'moment', frame, t: frame / 30, lines: {}, offDrift: 0, glyphs: [] });
    expect(resumePoint([meta, m(10), m(42), '{"kind":"mom'])).toEqual({ done: false, after: 42 });
    expect(resumePoint([meta, m(10), JSON.stringify({ kind: 'done' })])).toEqual({ done: true });
    expect(resumePoint([])).toEqual({ done: false, after: -1 });
  });
});
