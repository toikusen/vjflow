import { describe, expect, it } from 'vitest';
import { glyphOfId, idOf, idRgb, lineOfId, offDrift, partIdOf, reduceGlyphs, resumePoint, rgbId, type PartRole } from './ink-verify';
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

  it('a see-through glyph: each core pixel against the same pixel without the words; mixed pixels listed, never deciding', () => {
    const id = idOf(1, 0);
    const [r, g, b] = idRgb(id);
    const half = { [id]: 0.5 };
    // three core pixels: white on black (21:1) twice, and one grey pair at about 4.49:1
    const on = rows([[255, 255, 255, 255], [255, 255, 255, 255], [116, 116, 116, 255], [0, 0, 0, 255]]);
    const off = rows([[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]);
    const mask = rows([[r, g, b, 255], [r, g, b, 255], [r, g, b, 255], [r, g, b, 128]]);
    const [v] = reduceGlyphs(on, off, mask, 4, [], half);
    expect(v.n).toBe(3);
    expect(v.min).toBeLessThan(INK_MIN);
    expect(v.min).toBeGreaterThan(4.4);
    expect(v.status).toBe('fail');
    expect(v.edge).toEqual({ n: 1, min: 1 });
    const [p] = reduceGlyphs(rows([[255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]]), off, mask, 4, [], half);
    expect(p.status).toBe('pass');
    expect(p.edge!.min).toBe(1);
  });

  /** A w × h frame: `px(x, y)` → [r, g, b] with the words, the glyph's core where `glyph(x, y)`. */
  const frame = (w: number, h: number, px: (x: number, y: number) => number[], glyph: (x: number, y: number) => boolean) => {
    const id = idOf(1, 0);
    const [r, g, b] = idRgb(id);
    const on = new Uint8Array(w * h * 4);
    const mask = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { on.set([...px(x, y), 255], (y * w + x) * 4); if (glyph(x, y)) mask.set([r, g, b, 255], (y * w + x) * 4); }
    return { on, mask, id };
  };

  it('an opaque face is read against what borders it on screen: a 2 px white stroke on a 30 % white halftone fails', () => {
    const [w, h] = [20, 20];
    const stroke = (x: number) => x >= 9 && x < 11;
    // a 2 px dot screen, one dot in three, white on black, round a white stroke
    const dots = (x: number, y: number) => (Math.floor(x / 2) + Math.floor(y / 2)) % 3 === 0;
    const { on, mask } = frame(w, h, (x, y) => (stroke(x) || dots(x, y) ? [255, 255, 255] : [0, 0, 0]), (x) => stroke(x));
    const [v] = reduceGlyphs(on, new Uint8Array(w * h * 4), mask, w);
    expect(v.status).toBe('fail');
    expect(v.min).toBeLessThan(1.1);
    // the same stroke on plain black passes
    const plain = frame(w, h, (x) => (stroke(x) ? [255, 255, 255] : [0, 0, 0]), (x) => stroke(x));
    expect(reduceGlyphs(plain.on, new Uint8Array(w * h * 4), plain.mask, w)[0].status).toBe('pass');
  });

  it("a copy in the stroke's own colour merged into it (an extrude) fails; the ground hidden under the face does not count", () => {
    const [w, h] = [20, 20];
    const stroke = (x: number) => x >= 8 && x < 11;
    // orange stroke, its orange extrude 2 px to the right, black beyond; the words-off ground under the face is speckled
    const { on, mask } = frame(w, h, (x) => (stroke(x) ? [220, 100, 40] : x >= 11 && x < 13 ? [210, 95, 38] : [0, 0, 0]), (x) => stroke(x));
    const off = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) off.set(i % 3 ? [10, 10, 10, 255] : [140, 138, 143, 255], i * 4);
    expect(reduceGlyphs(on, off, mask, w)[0].status).toBe('fail');
    // without the extrude, the face against black passes, the speckles under it not read
    const bare = frame(w, h, (x) => (stroke(x) ? [220, 100, 40] : [0, 0, 0]), (x) => stroke(x));
    expect(reduceGlyphs(bare.on, off, bare.mask, w)[0].status).toBe('pass');
  });

  it('a glyph with only mixed pixels is unverified (all-mixed), not a pass', () => {
    const id = idOf(3, 1);
    const [r, g, b] = idRgb(id);
    expect(reduceGlyphs(rows([[255, 255, 255, 255]]), rows([[0, 0, 0, 255]]), rows([[r, g, b, 128]]), 1)[0].status).toBe('unverified:all-mixed');
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

  /**
   * A w × h picture from a painter: each pixel's colour, the glyph whose face it is (core), and the part it is of
   * ([glyph, role]); returns the words-on box, the mask and the parts mask (line slot 1).
   */
  const paint = (w: number, h: number, at: (x: number, y: number) => { rgb: number[]; face?: number; part?: [number, PartRole] }) => {
    const on = new Uint8Array(w * h * 4);
    const mask = new Uint8Array(w * h * 4);
    const parts = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = at(x, y);
      const k = (y * w + x) * 4;
      on.set([...p.rgb, 255], k);
      if (p.face !== undefined) mask.set([...idRgb(idOf(1, p.face)), 255], k);
      if (p.part) parts.set([...idRgb(partIdOf(1, p.part[0], p.part[1])), 255], k);
    }
    return { on, mask, parts, off: new Uint8Array(w * h * 4), w };
  };
  const [WHITE, BLACK, GREY] = [[255, 255, 255], [0, 0, 0], [120, 120, 120]];
  // 口: a 10 px square, 2 px strokes, its 6 px counter inside, at (5, 5)
  const kou = (x: number, y: number, ox = 5, oy = 5) => x >= ox && x < ox + 10 && y >= oy && y < oy + 10 && !(x >= ox + 2 && x < ox + 8 && y >= oy + 2 && y < oy + 8);
  const counter = (x: number, y: number) => x >= 7 && x < 13 && y >= 7 && y < 13;
  const verdict = (f: ReturnType<typeof paint>, id = idOf(1, 0)) => reduceGlyphs(f.on, f.off, f.mask, f.w, [], {}, f.parts).find((v) => v.id === id)!;

  describe('reading roles (ruling 2026-11-13 §1)', () => {
    /** 口 with an extrude `depth` px down-right: white face, grey extrude, on black. */
    const extruded = (depth: number, declared: boolean) => paint(24, 24, (x, y) => {
      if (kou(x, y)) return { rgb: WHITE, face: 0, ...(declared ? { part: [0, 'extrude'] as [number, PartRole] } : {}) };
      for (let d = 1; d <= depth; d++) if (kou(x - d, y - d)) return { rgb: GREY, ...(declared ? { part: [0, 'extrude'] as [number, PartRole] } : { part: [0, 'copy'] as [number, PartRole] }) };
      return { rgb: BLACK };
    });

    it('a declared popart extrude merges into the reading glyph: its joint with the face is not read, its outer edge is', () => {
      const v = verdict(extruded(2, true));
      expect(v.status).toBe('pass');
      expect(v.gap).toEqual({ face: 5, glyph: 3 });
      // the same extrude undeclared is a copy: the face against it (4.4:1) fails
      const u = verdict(extruded(2, false));
      expect(u.status).toBe('fail');
      expect(u.pair!.q[2]).toBe('copy');
    });

    it("a declared extrude deep enough to fill 口's counter fails the shape gate", () => {
      const v = verdict(extruded(6, true));
      expect(v.shape).toContain('counter-closed');
      expect(v.status).toBe('fail');
    });

    it("a copy in the face's colour filling 口's counter fails", () => {
      const v = verdict(paint(24, 24, (x, y) => (kou(x, y) ? { rgb: WHITE, face: 0 } : counter(x, y) ? { rgb: WHITE, part: [0, 'copy'] } : { rgb: BLACK })));
      expect(v.status).toBe('fail');
      expect(v.pair!.q[2]).toBe('copy');
    });

    it('a copy bridging two strokes fails; a declared extrude bridging them fails the shape gate', () => {
      // 刂-like: two 2 px strokes 4 px apart
      const stroke = (x: number, y: number) => y >= 4 && y < 18 && ((x >= 6 && x < 8) || (x >= 12 && x < 14));
      const bridge = (x: number, y: number) => y >= 9 && y < 12 && x >= 8 && x < 12;
      expect(verdict(paint(20, 22, (x, y) => (stroke(x, y) ? { rgb: WHITE, face: 0 } : bridge(x, y) ? { rgb: WHITE, part: [0, 'copy'] } : { rgb: BLACK }))).status).toBe('fail');
      const v = verdict(paint(20, 22, (x, y) => (stroke(x, y) ? { rgb: WHITE, face: 0 } : bridge(x, y) ? { rgb: GREY, part: [0, 'extrude'] } : { rgb: BLACK })));
      expect(v.shape).toContain('bridge');
      expect(v.status).toBe('fail');
    });

    it("another glyph's ghost in this glyph's gap fails it", () => {
      // glyph 1 (口 at 5,5), glyph 0's ghost laid in its counter in the same white
      const f = paint(24, 24, (x, y) => (kou(x, y) ? { rgb: WHITE, face: 1 } : counter(x, y) && x < 9 ? { rgb: WHITE, part: [0, 'copy'] } : { rgb: BLACK }));
      const v = verdict(f, idOf(1, 1));
      expect(v.status).toBe('fail');
      expect(v.pair!.q[2]).toBe('copy');
    });

    it('a full outline separating a same-colour ground passes; a gap in it fails', () => {
      // white 2 px stroke, a 2 px black keyline round it (its outline), white paper beyond
      const stroke = (x: number, y: number) => x >= 9 && x < 11 && y >= 4 && y < 16;
      const line = (x: number, y: number) => !stroke(x, y) && x >= 7 && x < 13 && y >= 2 && y < 18;
      const full = verdict(paint(20, 20, (x, y) => (stroke(x, y) ? { rgb: WHITE, face: 0 } : line(x, y) ? { rgb: BLACK, part: [0, 'outline'] } : { rgb: WHITE })));
      expect(full.status).toBe('pass');
      const gap = (x: number, y: number) => y >= 9 && y < 11 && x >= 11;
      const broken = verdict(paint(20, 20, (x, y) => (stroke(x, y) ? { rgb: WHITE, face: 0 } : line(x, y) && !gap(x, y) ? { rgb: BLACK, part: [0, 'outline'] } : { rgb: WHITE })));
      expect(broken.status).toBe('fail');
      expect(broken.pair!.q[2]).toBe('ground');
    });

    it("a neighbour 2 px away is not a glyph's ground (review 2026-11-13); touching it fails the shape gate", () => {
      const two = (gapPx: number) => paint(20, 10, (x, y) => (y >= 2 && y < 8 && x >= 4 && x < 8 ? { rgb: WHITE, face: 0 } : y >= 2 && y < 8 && x >= 8 + gapPx && x < 12 + gapPx ? { rgb: WHITE, face: 1 } : { rgb: BLACK }));
      expect(verdict(two(2)).status).toBe('pass');
      const v = verdict(two(0));
      expect(v.shape).toEqual(['joins']);
      expect(v.status).toBe('fail');
    });
  });
});
