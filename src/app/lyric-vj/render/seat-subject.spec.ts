import { describe, expect, it } from 'vitest';
import { carrySubjects, drawKinetic, KineticLayer, seatSubject, SUBJECT_MIN_H, UNDER_H } from './kinetic';

const H = 1080;
// a cyclist cut-out at 0.72 of the frame (S18's aspect)
const [w, h] = [1.3 * H * 0.72, H * 0.72];

describe('a subject is seated in the largest legal room when two lines are up at once', () => {
  it('waits out a line going out over the cut\'s first moments and takes the side it leaves, large (風の匂い / 君がいない at 11.92 s)', () => {
    const lines = [
      { from: 9.6, to: 12.4, strong: 12.2, x0: 1048, y0: 421, x1: 1838, y1: 659 },
      { from: 11.8, to: 19.3, strong: 19.1, x0: 82, y0: 375, x1: 1069, y1: 705 },
    ];
    const seat = seatSubject(lines, 11.92, 15.97, w, h);
    expect(seat.side).toBe('right');
    expect(seat.room?.[0]).toBeGreaterThan(1069);
    expect(seat.rows).toBeUndefined();
    expect(seat.under).toBeFalsy();
    // (gone at 12.4, past the wait's end at 11.92 + 0.6: it comes up as the line fades, at 12.4 at the latest)
    expect(seat.waitFor).toBeCloseTo(12.4, 3);
    expect(seat.height).toBeGreaterThanOrEqual(SUBJECT_MIN_H * H);
  });
  it('lets a line going out decide when it is read for long into the cut (no figure under it, no long empty frame)', () => {
    const lines = [
      { from: 9.6, to: 14.4, strong: 14.2, x0: 1048, y0: 421, x1: 1838, y1: 659 },
      { from: 11.8, to: 19.3, strong: 19.1, x0: 82, y0: 375, x1: 1069, y1: 705 },
    ];
    const seat = seatSubject(lines, 11.92, 15.97, w, h);
    expect(seat.waitFor).toBeUndefined();
    expect(seat.room).toBeUndefined();
    // (the rows below them or the clear corner beside them, whichever holds it larger)
    expect(!!seat.rows || !!seat.under).toBe(true);
  });
  it('takes the rows above or below two lines up side by side for the whole cut, never the corner while they hold more', () => {
    const lines = [
      { from: 0, to: 5, strong: 5, x0: 80, y0: 600, x1: 900, y1: 760 },
      { from: 0, to: 5, strong: 5, x0: 1020, y0: 640, x1: 1840, y1: 800 },
    ];
    const seat = seatSubject(lines, 1, 4, w, h);
    expect(seat.under).toBeFalsy();
    expect(seat.rows).toEqual([0, 600 - 32]);
    expect(seat.height).toBeGreaterThan(UNDER_H * H);
  });
  it('takes an open side band when the lines\' weight sits centred (two lines apart), not the corner', () => {
    const lines = [
      { from: 0, to: 5, strong: 5, x0: 800, y0: 300, x1: 1100, y1: 500 },
      { from: 0, to: 0.5, strong: 0.5, x0: 1400, y0: 100, x1: 1900, y1: 1000 },
    ];
    const seat = seatSubject(lines, 0, 5, w, h);
    expect(seat.side).toBe('left');
    expect(seat.room).toEqual([0, 760]);
    expect(seat.under).toBeFalsy();
  });
  it('is the corner only when no room holds the figure larger', () => {
    const lines = [{ from: 0, to: 5, strong: 5, x0: 40, y0: 240, x1: 1880, y1: 860 }];
    const seat = seatSubject(lines, 0, 5, w, h);
    expect(seat.under).toBe(true);
  });
  it('is unseated when no line is up over the cut', () => {
    expect(seatSubject([], 0, 5, w, h)).toEqual({ height: h });
  });
});

describe('a subject that waits for a line going out comes up after it', () => {
  it('pops at its wait, not at the cut', () => {
    const l = { kind: 'kinetic', fx: 'dotscreen', words: [], ink: '#000', paper: '#fff', accent: '#f00', sprite: 'S18', at: 11.92, waitFor: 12.2 } as KineticLayer;
    carrySubjects([l]);
    expect(l.subjectAt).toBe(12.2);
  });
  it('draws no subject before its wait', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'getTransform' ? () => ({}) : k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...args: unknown[]) => void calls.push(String(k))),
      set: () => true,
    });
    const pic = { width: 200, height: 400 } as unknown as CanvasImageSource;
    const l = { kind: 'kinetic', fx: 'dotscreen', words: ['君'], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', sprite: 'S18', print: 'own', at: 11.92, waitFor: 12.2 } as KineticLayer;
    const drawn = (clock: number) => {
      calls.length = 0;
      drawKinetic(ctx, l, clock, { pulse: 0.5, since: 0.1 } as never, (id) => (id === 'spr:S18' ? pic : undefined));
      return calls.filter((c) => c === 'drawImage').length;
    };
    const before = drawn(0.1);
    const after = drawn(0.5);
    expect(after).toBeGreaterThan(before);
  });
});
