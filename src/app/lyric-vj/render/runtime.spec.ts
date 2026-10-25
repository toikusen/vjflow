import { describe, expect, it } from 'vitest';
import { fitReading, readFix, revealAt, settledAt, CueRuntime } from './runtime';

const rt = (showFrom: number, exitAt: number) =>
  ({ showFrom, exitAt, pace: 1, cue: { text: 'abcd', charStarts: [0, 9, 9.1, 9.2] }, style: { reveal: 'word', enter: 'cut' } }) as unknown as CueRuntime;

describe('revealAt', () => {
  it('spreads a line evenly over its first quarter, ignoring sung character times', () => {
    expect(revealAt(rt(10, 12), 0)).toBe(10);
    expect(revealAt(rt(10, 12), 0.5)).toBeCloseTo(10.25);
    expect(settledAt(rt(10, 12), 4, 0)).toBeCloseTo(10.5);
  });

  it('keeps the reveal between 0.2 and 0.8 s', () => {
    expect(revealAt(rt(0, 0.4), 1)).toBeCloseTo(0.2);
    expect(revealAt(rt(0, 10), 1)).toBeCloseTo(0.8);
  });
});

describe('readFix', () => {
  const line = { showFrom: 10, exitAt: 12, exitDur: 0.3, style: { reveal: 'word', enter: 'flap', exit: 'fade' } } as unknown as CueRuntime;

  it('leaves a line that reads alone', () => {
    expect(readFix(line, [10.5, 12], 1.4, 20)).toBeUndefined();
  });

  it('holds a short line into free time after it', () => {
    expect(readFix(line, [10.5, 12], 2, 20)).toMatchObject({ exitAt: 12.5, exitDur: 0.3, style: { enter: 'flap' } });
  });

  it('lands and cuts a line with no time to spare', () => {
    const f = readFix(line, [11, 12], 2, 12.4)!;
    expect(f.style).toMatchObject({ reveal: 'line', enter: 'cut', exit: 'cut' });
    expect(f.exitAt).toBeCloseTo(12.32);
  });
});

describe('paceStyle', () => {
  const style = (enter: string, reveal: 'line' | 'word' = 'line') => ({ cueId: 'a', shot: 's', enter, exit: 'fade', reveal }) as never;
  // 24 characters need 24 / 12 + 1 = 3 s to read: 1.5 s is rushed, 4 s is tight (< 3.6 s + 1), 10 s is relaxed
  const cue = (len: number) => ({ start: 10, end: 10 + len, text: '一二三四五六七八九十一二三四五六七八九十一二三四' });

  it('keeps pop and fade on a fast line, and records only the reveal change', async () => {
    const { paceStyle } = await import('./runtime');
    expect(paceStyle(style('pop', 'word'), cue(1.5))).toMatchObject({ style: { enter: 'pop', reveal: 'line' }, rushed: true, adjust: ['fast-line'] });
    expect(paceStyle(style('fade'), cue(1.5))).toMatchObject({ style: { enter: 'fade' }, rushed: true, adjust: [] });
  });

  it('turns a slow entrance on a fast line into a cut, or with shortEnter into the closest quick one', async () => {
    const { paceStyle } = await import('./runtime');
    expect(paceStyle(style('slam'), cue(1.5))).toMatchObject({ style: { enter: 'cut' }, adjust: ['fast-cut'] });
    expect(paceStyle(style('slam'), cue(1.5), true)).toMatchObject({ style: { enter: 'pop' }, adjust: ['fast-short'] });
    expect(paceStyle(style('ink'), cue(1.5), true)).toMatchObject({ style: { enter: 'fade' }, adjust: ['fast-short'] });
  });

  it('leaves a relaxed line alone and only stops spelling out a tight one', async () => {
    const { paceStyle } = await import('./runtime');
    expect(paceStyle(style('slam', 'word'), cue(10))).toMatchObject({ style: { enter: 'slam', reveal: 'word' }, rushed: false, adjust: [] });
    expect(paceStyle(style('slam', 'word'), cue(3.2))).toMatchObject({ style: { enter: 'slam', reveal: 'line' }, rushed: false, adjust: ['tight-line'] });
  });
});

describe('entranceLost', () => {
  it('counts a planned entrance that ends as a cut, never a cut the director chose', async () => {
    const { entranceLost } = await import('./runtime');
    expect(entranceLost({ enter: 'slam' }, { enter: 'cut' })).toBe(true);
    expect(entranceLost({ enter: 'cut' }, { enter: 'cut' })).toBe(false);
    expect(entranceLost({ enter: 'slam' }, { enter: 'pop' })).toBe(false);
  });
});

describe('readFix reasons', () => {
  const line = (adjust: string[] = []) => ({ ...rt(10, 11), exitDur: 0.2, style: { enter: 'pop', reveal: 'line', exit: 'fade' }, adjust }) as unknown as CueRuntime;

  it('only holds the line longer when the free time covers it, keeping its entrance', () => {
    const fix = readFix(line(['fast-short']), [10.5, 11], 1, 20)!;
    expect(fix.style.enter).toBe('pop');
    expect(fix.exitAt).toBeCloseTo(11.5);
    expect(fix.adjust).toEqual(['fast-short', 'read-hold']);
  });

  it('lands the line at once and cuts it when there is no free time', () => {
    const fix = readFix(line(['fast-short']), [10.5, 11], 1, 11.3)!;
    expect(fix.style).toMatchObject({ enter: 'cut', reveal: 'line', exit: 'cut' });
    expect(fix.adjust).toEqual(['fast-short', 'read-cut']);
  });
});

describe('quickEntrance', () => {
  const line = (enter: string) => ({ ...rt(10, 11), style: { enter, reveal: 'word', exit: 'fade' }, adjust: ['tight-line'] }) as unknown as CueRuntime;

  it('swaps a slow entrance for the closest quick one, whole line, pieces at once', async () => {
    const { quickEntrance } = await import('./runtime');
    expect(quickEntrance(line('slam'))).toMatchObject({ style: { enter: 'pop', reveal: 'line' }, rushed: true, adjust: ['tight-line', 'read-short'] });
    expect(quickEntrance(line('rise'))?.style.enter).toBe('fade');
    expect(quickEntrance(line('pop'))?.style.enter).toBe('pop');
  });

  it('has nothing quicker than a cut', async () => {
    const { quickEntrance } = await import('./runtime');
    expect(quickEntrance(line('cut'))).toBeUndefined();
  });
});

describe('enterSec matches what glyphMotion draws', () => {
  const line = (enter: string, pace: number) => ({ showFrom: 10, exitAt: 20, exitDur: 0.3, pace, cue: { text: 'ab' }, style: { enter, reveal: 'line', exit: 'fade' } }) as unknown as CueRuntime;
  const glyph = { index: 0 } as never;

  it.each(['slam', 'pop', 'wipe', 'fade'])('%s has landed at its enterSec and not halfway through it', async (enter) => {
    const { enterSec, glyphMotion } = await import('./runtime');
    for (const pace of [0.35, 1]) {
      const sec = enterSec(enter as never, pace);
      const at = glyphMotion(line(enter, pace), glyph, 2, 10 + sec, 0);
      expect(at.opacity).toBeGreaterThan(0.99);
      expect(Math.abs(at.scale - 1)).toBeLessThan(0.05);
      expect(Math.abs(at.dx)).toBeLessThan(0.05 * 24 + 0.01);
      const mid = glyphMotion(line(enter, pace), glyph, 2, 10 + sec * 0.3, 0);
      expect(mid.opacity < 0.99 || Math.abs(mid.scale - 1) > 0.05 || Math.abs(mid.dx) > 1.2).toBe(true);
    }
  });

  it.each(['settle', 'flicker'])('%s has landed at its enterSec and is still moving or dark before it', async (enter) => {
    const { enterSec, glyphMotion } = await import('./runtime');
    const sec = enterSec(enter as never, 1);
    const at = glyphMotion(line(enter, 1), glyph, 2, 10 + sec, 0);
    expect(at.opacity).toBe(1);
    expect(Math.abs(at.dx) + Math.abs(at.rot)).toBeLessThan(1e-9);
    const mid = glyphMotion(line(enter, 1), glyph, 2, 10 + sec * 0.3, 0);
    expect(mid.opacity < 0.99 || Math.abs(mid.dx) > 1).toBe(true);
  });

  it('drop falls from above onto its place and out through the bottom; melt runs down (y is up)', async () => {
    const { glyphMotion } = await import('./runtime');
    const l = { ...line('drop', 1), exitAt: 12, exitDur: 0.4, style: { enter: 'drop', reveal: 'line', exit: 'drop', idle: 'still' } } as unknown as CueRuntime;
    expect(glyphMotion(l, glyph, 2, 10.05, 0).dy).toBeGreaterThan(100);
    expect(glyphMotion(l, glyph, 2, 12.3, 0).dy).toBeLessThan(-100);
    const melt = { ...l, style: { ...l.style, exit: 'melt' } } as unknown as CueRuntime;
    expect(glyphMotion(melt, glyph, 2, 12.3, 0).dy).toBeLessThan(0);
  });

  it('domino tips the row over one corner after another, the way and pace the song\'s own', async () => {
    const { glyphMotion } = await import('./runtime');
    const g = (index: number) => ({ index, advance: 100 }) as never;
    const sides = new Set<number>();
    for (const song of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const out = { ...line('cut', 1), exitAt: 12, exitDur: 0.8, song, style: { enter: 'cut', reveal: 'line', exit: 'domino', idle: 'still' } } as unknown as CueRuntime;
      const [a, b] = [glyphMotion(out, g(0), 4, 12.35, 0).rot, glyphMotion(out, g(3), 4, 12.35, 0).rot];
      // one end of the row is further over than the other: it falls in turn
      expect(Math.abs(Math.abs(a) - Math.abs(b))).toBeGreaterThan(0.1);
      // lying on its side at the end: a quarter turn, its centre one width over and level with where it stood
      const down = glyphMotion(out, g(0), 4, 12.8, 0);
      expect(Math.abs(down.rot)).toBeCloseTo(Math.PI / 2);
      expect(Math.abs(down.dx)).toBeCloseTo(100);
      expect(down.dy).toBeCloseTo(0);
      sides.add(Math.sign(down.rot));
    }
    expect(sides.size).toBe(2);
  });

  it('boil holds each pose for an eighth of a second; hop only ever lifts the characters', async () => {
    const { glyphMotion } = await import('./runtime');
    const held = (idle: string) => ({ ...line('cut', 1), style: { enter: 'cut', reveal: 'line', exit: 'fade', idle } }) as unknown as CueRuntime;
    const at = (t: number) => glyphMotion(held('boil'), glyph, 2, t, 0);
    expect(at(13.01).dx).toBe(at(13.1).dx);
    expect(at(13.01).dx).not.toBe(at(13.2).dx);
    const ys = Array.from({ length: 40 }, (_, i) => glyphMotion(held('hop'), glyph, 2, 13 + i * 0.05, 0).dy);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeGreaterThan(10);
  });

  it('times a fade by its fixed 0.3 s and without a stagger (the whole line fades in together)', () => {
    const fast = { ...line('fade', 0.35) } as CueRuntime;
    expect(settledAt(fast, 20, 0.03)).toBeCloseTo(10.3);
  });
});

describe('fitReading', () => {
  // readable from the entrance's end to exitAt (the template may stop the window earlier with `cap`)
  const delay: Record<string, number> = { cut: 0, pop: 0.4, slam: 1.0 };
  const measure = (cap = Infinity) => (r: CueRuntime): [number, number] => [r.showFrom + delay[r.style.enter], Math.min(r.exitAt, cap)];
  const line = () => ({ showFrom: 10, exitAt: 11.5, exitDur: 0.2, pace: 1, cue: { text: 'x' }, style: { enter: 'slam', reveal: 'line', exit: 'fade' }, adjust: [] }) as unknown as CueRuntime;
  const reads = (fix: ReturnType<typeof fitReading>, need: number, m = measure()) => {
    const [from, to] = m({ ...line(), ...fix });
    return to - from >= need - 0.05;
  };

  it('keeps a quick entrance that reads as it is', () => {
    const fix = fitReading(line(), measure(), 1.0, 11.72, true);
    expect(fix).toMatchObject({ style: { enter: 'pop' }, exitAt: 11.5, adjust: ['read-short'] });
    expect(reads(fix, 1.0)).toBe(true);
  });

  it('keeps a quick entrance held a little longer when the free time allows', () => {
    const fix = fitReading(line(), measure(), 1.2, 11.85, true)!;
    expect(fix.style.enter).toBe('pop');
    expect(fix.exitAt).toBeCloseTo(11.6);
    expect(fix.adjust).toEqual(['read-short', 'read-hold']);
    expect(reads(fix, 1.2)).toBe(true);
  });

  it('falls back to the cut when even a quick entrance leaves too little time', () => {
    const fix = fitReading(line(), measure(), 1.5, 11.72, true)!;
    expect(fix).toMatchObject({ style: { enter: 'cut' }, adjust: ['read-cut'] });
    expect(reads(fix, 1.5)).toBe(true);
  });

  it('falls back to the cut when the line built with the quick entrance does not read after all', () => {
    // the template ends the readable window at 11.5 whatever the hold: only the final build shows it
    const fix = fitReading(line(), measure(11.5), 1.2, 11.85, true)!;
    expect(fix.style.enter).toBe('cut');
  });

  it('without shortEnter cuts exactly as readFix does', () => {
    expect(fitReading(line(), measure(), 1.0, 11.72)).toEqual(readFix(line(), measure()(line()), 1.0, 11.72));
  });
});

describe('measureAtRest', () => {
  const held = { showFrom: 0, exitAt: 20, exitDur: 0.3, pace: 1, cue: { text: 'ab' }, style: { enter: 'cut', reveal: 'line', exit: 'fade' } } as unknown as CueRuntime;

  it('leaves out the held wave and the beat pulse while a box is measured, and only then', async () => {
    const { accentPulse, glyphMotion, measureAtRest } = await import('./runtime');
    const g = { index: 1 } as never;
    expect(glyphMotion(held, g, 2, 5, 0).dy).not.toBeCloseTo(0);
    expect(measureAtRest(() => glyphMotion(held, g, 2, 5, 0).dy)).toBe(0);
    expect(measureAtRest(() => glyphMotion(held, g, 2, 5.01, 0).dy)).toBe(0);
    expect(measureAtRest(() => accentPulse(5.05, [5]))).toBe(0);
    expect(accentPulse(5.05, [5])).toBeGreaterThan(0);
  });
});

describe('whole-line quick entrance (B′)', () => {
  const line = { showFrom: 10, exitAt: 20, exitDur: 0.3, pace: 1, cue: { text: 'abcdefghij' }, style: { enter: 'pop', reveal: 'line', exit: 'fade' } } as unknown as CueRuntime;

  it('starts every character together and is settled one entrance after the line shows', async () => {
    const { enterAt, enterSec, quickEntrance } = await import('./runtime');
    const q = quickEntrance({ ...line, style: { ...line.style, enter: 'slam' } } as CueRuntime, true)!;
    expect(q.together).toBe(true);
    expect(enterAt(q, { index: 9 } as never, 0.03)).toBe(10);
    expect(settledAt(q, 10, 0.03)).toBeCloseTo(10 + enterSec('pop', 1));
    expect(settledAt(line, 10, 0.03)).toBeCloseTo(10 + 9 * 0.03 + enterSec('pop', 1));
  });

  it('keeps the cut fallback when even the whole-line entrance leaves too little time', () => {
    const slow = { ...line, exitAt: 11.5, exitDur: 0.2, style: { ...line.style, enter: 'slam' }, adjust: [] } as unknown as CueRuntime;
    const measure = (r: CueRuntime): [number, number] => [settledAt(r, 10, 0.03), r.exitAt];
    expect(fitReading(slow, measure, 1.5, 11.72, true, true)).toMatchObject({ style: { enter: 'cut' }, adjust: ['read-cut'] });
    expect(fitReading(slow, measure, 1.1, 11.72, true, true)).toMatchObject({ style: { enter: 'pop' }, together: true, adjust: ['read-short'] });
  });
});

describe('motionPad', () => {
  it('grows a rest box by the type layer motion, more toward the frame edges and in loud sections', async () => {
    const { motionPad } = await import('./runtime');
    const quiet = motionPad({ x0: 960, y0: 540, x1: 960, y1: 540 }, false);
    expect(quiet.x0).toBeCloseTo(960 - 29.5);
    expect(quiet.y1).toBeCloseTo(540 + 16.5);
    const wide = motionPad({ x0: 160, y0: 540, x1: 1760, y1: 540 }, false);
    expect(160 - wide.x0).toBeCloseTo(800 * 0.012 + 29.5);
    const loud = motionPad({ x0: 160, y0: 140, x1: 1760, y1: 940 }, true);
    expect(160 - loud.x0).toBeCloseTo(800 * (1.05 * 1.012 - 1) + 29.5);
    expect(140 - loud.y0).toBeCloseTo(400 * (1.05 * 1.012 - 1) + 26.5);
  });
});

describe('poorShare', () => {
  // a 480 x 96 box: 10 x 2 cells of 48 px; cream paper with a mid-blue photo under its left half
  const box = (paint: (x: number, y: number) => [number, number, number]) => {
    const [w, h] = [480, 96];
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = paint(x, y);
        data.set([r, g, b, 255], (y * w + x) * 4);
      }
    return { data, width: w, height: h };
  };
  const cream: [number, number, number] = [245, 236, 227];
  const stage: [number, number, number] = [110, 130, 190];
  const photo = { x0: 100, y0: 400, x1: 340, y1: 600 }; // frame px; the box sits at 100, 400

  it('counts the cells over a photo where the type falls short, not the paper beside it', async () => {
    const { poorShare } = await import('./runtime');
    const img = box((x) => (x < 240 ? stage : cream));
    expect(poorShare(img, 100, 400, '#1E64B4', [photo])).toBeCloseTo(0.5, 1);
    // light type reads on the stage photo
    expect(poorShare(img, 100, 400, '#f4f2ee', [photo])).toBe(0);
  });

  it('ignores a dark band or halftone dots when no photo is under the line', async () => {
    const { poorShare } = await import('./runtime');
    const dotted = box((x, y) => (x % 6 === 0 && y % 6 === 0 ? [30, 30, 90] : cream));
    expect(poorShare(dotted, 100, 400, '#1E64B4', [])).toBe(0);
    const band = box(() => [40, 40, 90]);
    expect(poorShare(band, 100, 400, '#1E64B4', [])).toBe(0);
    // dots over a photo of paper average out: the cells read on their mean
    expect(poorShare(dotted, 100, 400, '#1E64B4', [photo])).toBe(0);
  });
});

describe('guardLine', () => {
  it('rebuilds a line light only when light type reads better than its own colour', async () => {
    const { guardLine } = await import('./runtime');
    // light type worse (a pale photo): keep the line's colour
    expect(guardLine(0.36, 0.52, 0.15)).toBe(false);
    // light type better (a mid-blue stage photo under blue type): rebuild
    expect(guardLine(0.35, 0.18, 0.15)).toBe(true);
    // a tie keeps the colour the line was given
    expect(guardLine(0.3, 0.3, 0.15)).toBe(false);
    // under the threshold nothing changes, however light type would do
    expect(guardLine(0.12, 0, 0.15)).toBe(false);
  });

  it.each([
    ['dash', 'fade', 10.1], ['drop', 'fade', 10.1], ['zoom', 'fade', 10.1], ['gather', 'fade', 10.1], ['spin', 'fade', 10.1], ['spread', 'fade', 10.1], ['slam', 'fade', 10.05], ['wipe', 'fade', 10.03],
    ['cut', 'burst', 12.2], ['cut', 'rise', 12.2], ['cut', 'dash', 12.2], ['cut', 'dust', 12.2], ['cut', 'spin', 12.2], ['cut', 'zoom', 12.2], ['cut', 'melt', 12.2],
  ])('%s / %s: each song moves its own way, the same all song long', async (enter, exit, t) => {
    const { glyphMotion } = await import('./runtime');
    const at = (song: number) => {
      const r = { showFrom: 10, exitAt: 12, exitDur: 0.4, pace: 1, cue: { text: 'abc', start: 10 }, song, style: { enter, exit, reveal: 'line', idle: 'still' } } as unknown as CueRuntime;
      const m = glyphMotion(r, { index: 0, advance: 100 } as never, 3, t, 0);
      return [m.dx, m.dy, m.rot, m.scale].map((x) => +x.toFixed(4)).join();
    };
    expect(new Set([11, 222, 3333, 44444, 555555].map(at)).size).toBeGreaterThan(1);
    expect(at(222)).toBe(at(222));
  });

  it('thump beats twice on every beat of the song while the line is held', async () => {
    const { glyphMotion } = await import('./runtime');
    const r = { showFrom: 10, exitAt: 20, exitDur: 0.3, pace: 1, cue: { text: 'ab', start: 10 }, bpm: 120, style: { enter: 'cut', exit: 'fade', reveal: 'line', idle: 'thump' } } as unknown as CueRuntime;
    const at = (t: number) => glyphMotion(r, { index: 0 } as never, 2, t, 0).scale;
    // beat 0.5 s: the lub at 17 % of it, the dub at 37 %, still in between
    expect(at(12 + 0.085)).toBeGreaterThan(1.02);
    expect(at(12 + 0.185)).toBeGreaterThan(1.01);
    expect(at(12 + 0.4)).toBeCloseTo(1, 2);
    expect(at(12.5 + 0.085)).toBeCloseTo(at(12 + 0.085));
  });
});
