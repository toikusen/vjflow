import { describe, expect, it } from 'vitest';
import { coverFatal, coverLeft, coverReport, cropOf, SEAT_GRAZE, drawKinetic, resetSubjectCovers, SUBJECT_COVER_ALPHA, watchSubjectCover } from './kinetic';
import { alphaBounds, clipEnvelope } from './sprite-clip';

describe('a subject is seated by its whole motion envelope and the cut\'s camera', () => {
  it('reads a clip\'s envelope as the union of its frames\' opaque bounds', () => {
    expect(clipEnvelope([[0.2, 0.1, 0.6, 0.9], [0.3, 0.05, 0.7, 0.95]])).toEqual([0.2, 0.05, 0.7, 0.95]);
    expect(clipEnvelope([[0, 0, 1, 1], [0.3, 0.3, 0.5, 0.5]])).toBeUndefined();
    expect(clipEnvelope([])).toBeUndefined();
  });
  it('finds the opaque bounds of a frame', () => {
    const [w, h] = [10, 8];
    const data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[2, 1], [5, 6], [7, 3]]) data[(y * w + x) * 4 + 3] = 255;
    expect(alphaBounds(data, w, h)).toEqual([0.2, 1 / 8, 0.8, 7 / 8]);
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toEqual([0, 0, 1, 1]);
  });
  it('crops the picture to its envelope, whole when there is none', () => {
    expect(cropOf({ width: 560, height: 608 }, [0.25, 0, 0.75, 1])).toEqual({ sx: 140, sy: 0, sw: 280, sh: 608 });
    expect(cropOf({ width: 560, height: 608 })).toEqual({ sx: 0, sy: 0, sw: 560, sh: 608 });
  });
  it('reports a subject over the words once per place, again as it grows, not from a probe', () => {
    resetSubjectCovers();
    const lines: string[] = [];
    const log = (x: string) => void lines.push(x);
    expect(watchSubjectCover('S06@41.52', 'S06', 0.004, 41.6, log)).toMatch(/subject covers: S06 hides 0.4%/);
    expect(watchSubjectCover('S06@41.52', 'S06', 0.005, 41.7, log)).toBeUndefined();
    expect(watchSubjectCover('S06@41.52', 'S06', 0.03, 41.8, log)).toMatch(/3.0%/);
    (globalThis as { __vjProbe?: boolean }).__vjProbe = true;
    expect(watchSubjectCover('S06@41.52', 'S06', 0.5, 41.9, log)).toBeUndefined();
    delete (globalThis as { __vjProbe?: boolean }).__vjProbe;
    expect(lines).toHaveLength(2);
    expect(SUBJECT_COVER_ALPHA).toBe(0.5);
  });
});

describe('the subject stands on its own stage, not on the cut\'s camera', () => {
  it('draws the cut-out on the transform from before the camera (a pan cut S18 and S10 at the right edge; a snap put S22 into the words)', () => {
    const calls: string[] = [];
    const stage = { id: 'stage' };
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'getTransform' ? () => stage : k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...args: unknown[]) => void calls.push(`${String(k)}${args[0] === stage ? ':stage' : ''}`)),
      set: () => true,
    });
    const pic = { width: 200, height: 400 } as unknown as CanvasImageSource;
    for (const cam of ['pan', 'snap', 'dolly'] as const) {
      calls.length = 0;
      drawKinetic(ctx, { kind: 'kinetic', fx: 'dotscreen', words: ['君'], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', sprite: 'S18', cam, print: 'own' }, 0.05, { pulse: 0.5, since: 0.1 } as never, () => pic);
      const draw = calls.lastIndexOf('drawImage');
      const set = calls.lastIndexOf('setTransform:stage');
      expect(set, cam).toBeGreaterThan(0);
      expect(set, cam).toBeLessThan(draw);
    }
  });
});

describe('a subject cover is what is left of it after keepClear (Codex review: grid + centred lyrics failed whole renders)', () => {
  it('counts nothing where keepClear cuts the box out at full strength', () => {
    expect(coverLeft(0.3, 0.4, 1, 1)).toBe(0);
  });
  it('counts a cover the clear only fades, while what is left is drawn strongly', () => {
    expect(coverLeft(0.3, 0.05, 0.4, 1)).toBeCloseTo(0.3, 6);
    expect(coverLeft(0.3, 0.05, 0.4, 0.3)).toBe(0);
    expect(coverLeft(0, 0, 0.4, 1)).toBe(0);
  });
  it('fails a render on a cover only where the seat design guarantees room (sprite clips of the video stage) or when asked', () => {
    expect(coverFatal(false, { 'spr:S18': { kind: 'image', url: 'x' } })).toBe(false);
    expect(coverFatal(false, { 'spr:S18_r0': { kind: 'video', url: 'x', frames: { pattern: 'p', count: 2, fps: 24 } } })).toBe(true);
    expect(coverFatal(true, {})).toBe(true);
  });
});

describe('the seat error is the cover before keepClear, on a seated cut (opus review: the check could never fire)', () => {
  it('reports a seated cut\'s whole reach into a read line, even where keepClear cuts it all away', () => {
    expect(coverReport(0.12, coverLeft(0.12, 0.3, 1, 1), true, 0.3)).toEqual({ seat: 0.12, left: 0 });
  });
  it('lets a seated graze pass: under SEAT_GRAZE of the lyric box and of the subject (an edge of its envelope)', () => {
    expect(SEAT_GRAZE).toBe(0.03);
    expect(coverReport(0.005, 0, true, 0.01)).toEqual({ seat: 0, left: 0 });
    expect(coverReport(0.005, 0, true, 0.05)).toEqual({ seat: 0.005, left: 0 });
    expect(coverReport(0.04, 0, true, 0.01)).toEqual({ seat: 0.04, left: 0 });
  });
  it('logs only what is left over on any other cut', () => {
    expect(coverReport(0.12, 0, false, 0.3)).toEqual({ seat: 0, left: 0 });
    expect(coverReport(0.12, 0.12, false, 0.3)).toEqual({ seat: 0, left: 0.12 });
  });
});
