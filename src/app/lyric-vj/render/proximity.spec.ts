import { describe, expect, it } from 'vitest';
import { MORE } from './kinetic-more';
import { controlPoint, nearGain, outside } from './proximity';

describe('proximity response', () => {
  it('reacts fully at the control point, smoothly less with distance, not at all past its reach', () => {
    expect(nearGain(0, 0, 200)).toBe(1);
    expect(nearGain(100, 0, 200)).toBeGreaterThan(0);
    expect(nearGain(100, 0, 200)).toBeLessThan(1);
    expect(nearGain(150, 0, 200)).toBeLessThan(nearGain(100, 0, 200));
    expect(nearGain(200, 1, 200)).toBe(0);
  });

  it('moves its control point smoothly over the frame, a function of time alone', () => {
    const a = controlPoint(3, 7, 1920, 1080, 1);
    expect(controlPoint(3, 7, 1920, 1080, 1)).toEqual(a);
    const b = controlPoint(3.05, 7, 1920, 1080, 1);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(60);
    for (let t = 0; t < 60; t += 0.7) {
      const [x, y] = controlPoint(t, 7, 1920, 1080, 1);
      expect(x > 0 && x < 1920 && y > 0 && y < 1080).toBe(true);
    }
  });

  it('keeps clear of the lyric box and its margin', () => {
    const r = { x0: 600, y0: 400, x1: 1300, y1: 680 };
    expect(outside(900, 500, r, 40)).toBe(false);
    expect(outside(580, 500, r, 40)).toBe(false);
    expect(outside(500, 500, r, 40)).toBe(true);
    expect(outside(900, 500, undefined, 40)).toBe(true);
  });

  it('field: nothing of the field is drawn on the lyric box, whatever passes', () => {
    const r = { x0: 600, y0: 400, x1: 1300, y1: 680 };
    for (const style of [0, 1, 2])
      for (const age of [0.5, 2, 5, 9]) {
        const at: [number, number][] = [];
        const ctx = new Proxy({} as CanvasRenderingContext2D, {
          get: (_, k) => (k === 'getTransform' ? () => undefined : k === 'arc' || k === 'moveTo' || k === 'fillRect' ? (x: number, y: number) => void at.push([x, y]) : k === 'measureText' ? () => ({ width: 30 }) : () => undefined),
          set: () => true,
        });
        MORE['field'].draw({ ctx, age, k: 1, pulse: 0, since: 0, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322', word: () => '光', txt: () => undefined, cx: 1400, seed: 5, W: 1920, H: 1080, style, song: 3, lyric: r });
        expect(at.length).toBeGreaterThan(50);
        expect(at.filter(([x, y]) => x > r.x0 - 20 && x < r.x1 + 20 && y > r.y0 - 20 && y < r.y1 + 20)).toEqual([]);
      }
  });

  it('field: nothing is drawn on other words up either (a preview row), each kept on its own', () => {
    const r = { x0: 200, y0: 200, x1: 700, y1: 300 };
    const pv = { x0: 1100, y0: 700, x1: 1800, y1: 800 };
    const at: [number, number][] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'getTransform' ? () => undefined : k === 'arc' ? (x: number, y: number) => void at.push([x, y]) : () => undefined),
      set: () => true,
    });
    MORE['field'].draw({ ctx, age: 3, k: 1, pulse: 0, since: 0, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322', word: () => '光', txt: () => undefined, cx: 1400, seed: 5, W: 1920, H: 1080, style: 0, song: 3, lyric: r, keep: [pv] });
    expect(at.filter(([x, y]) => x > pv.x0 - 20 && x < pv.x1 + 20 && y > pv.y0 - 20 && y < pv.y1 + 20)).toEqual([]);
    expect(at.length).toBeGreaterThan(50);
  });
});

