import { describe, expect, it } from 'vitest';
import { cropOf, drawKinetic, resetSubjectCovers, SUBJECT_COVER_ALPHA, watchSubjectCover } from './kinetic';
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
