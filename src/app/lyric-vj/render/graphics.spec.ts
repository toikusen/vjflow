import { describe, expect, it } from 'vitest';
import { drawLook, GraphicsLook, Layer, measurable, sectionAt } from './graphics';

const look: GraphicsLook = {
  sections: [
    { start: 0, layers: [{ kind: 'fill', color: '#000000' }] },
    { start: 30, layers: [{ kind: 'sunburst', color: '#ff0000' }, { kind: 'shapes', type: 'star', color: '#ffffff' }], text: '#111111' },
  ],
};

describe('graphics look', () => {
  it('picks the section by time', () => {
    expect(sectionAt(look, 10).layers[0].kind).toBe('fill');
    expect(sectionAt(look, 31).text).toBe('#111111');
  });

  it('draws every layer kind without throwing (canvas stubbed)', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => calls.push(String(k)) && args && undefined),
      set: () => true,
    });
    drawLook(ctx, look, 35, { since: 0.1, pulse: 0.5, index: 3 }, () => undefined);
    expect(calls).toContain('fill');
  });
});

describe('avoid', () => {
  it('slides a photo inset off the lyrics, shrinking it when the side is too narrow', async () => {
    const { avoid, layerRect } = await import('./graphics');
    const lyrics = { x0: 500, y0: 400, x1: 1420, y1: 680 };
    const photo = { kind: 'photo' as const, mode: 'inset' as const, x: 0, y: 0, w: 0.3, h: 0.3 };
    const moved = avoid(photo, lyrics);
    const r = layerRect(moved)!;
    expect(r.x1 <= 476 || r.x0 >= 1444 || r.y1 <= 376 || r.y0 >= 704).toBe(true);
    const free = { kind: 'blob' as const, x: 0.8, y: 0.8, r: 0.1, color: '#fff' };
    expect(avoid(free, lyrics)).toBe(free);
  });

  it('sends a story prop with no room beside the line to the far side instead of fading it', async () => {
    const { avoid, layerRect } = await import('./graphics');
    // a tall vertical line on the right, the spot beside it taken by another object
    const lyrics = { x0: 1500, y0: 40, x1: 1700, y1: 1040 };
    const taken = { x0: 1000, y0: 0, x1: 1476, y1: 1080 };
    const chime = { kind: 'sprite' as const, asset: 'spr:chime', x: 0.65, y: 0, size: 0.4 };
    const moved = avoid(chime, lyrics, 24, [taken]);
    const r = layerRect(moved)!;
    expect(moved.opacity ?? 1).toBe(1);
    expect(r.x1 <= taken.x0).toBe(true);
  });
});

describe('code layer', () => {
  const stub = (calls: string[]) =>
    new Proxy({} as CanvasRenderingContext2D, { get: (_, k) => (...args: unknown[]) => calls.push(String(k)) && args && undefined, set: () => true });

  it('runs the director\'s drawing with the frame state, and a broken one draws nothing instead of throwing', async () => {
    const { avoidAll } = await import('./graphics');
    const seen: unknown[] = [];
    (globalThis as Record<string, unknown>)['__seen'] = seen;
    const ok = { kind: 'code' as const, src: 'globalThis.__seen.push([f.t, f.beat.index, f.lyric]); ctx.fillRect(0, 0, f.w, f.h);' };
    const lyrics = { x0: 1, y0: 2, x1: 3, y1: 4 };
    const calls: string[] = [];
    drawLook(stub(calls), { sections: [{ start: 0, layers: [ok] }] }, 5, { since: 0, pulse: 1, index: 9 }, () => undefined, (ls) => avoidAll(ls, lyrics));
    expect(seen).toEqual([[5, 9, lyrics]]);
    expect(calls).toContain('fillRect');
    const broken = { sections: [{ start: 0, layers: [{ kind: 'code' as const, src: 'nope(' }, { kind: 'code' as const, src: 'missing()' }] }] };
    expect(() => drawLook(stub([]), broken, 1, { since: 0, pulse: 0, index: 0 }, () => undefined)).not.toThrow();
  });
});

describe('camAt', () => {
  it('finds the camera shot and how far into it t is', async () => {
    const { camAt } = await import('./graphics');
    expect(camAt([10, 20], 5)).toEqual({ index: 0, start: 0, end: 10, progress: 0.5, count: 3 });
    expect(camAt([10, 20], 15).index).toBe(1);
    expect(camAt([10, 20], 25)).toMatchObject({ index: 2, start: 20, progress: 1 });
    expect(camAt([], 3).count).toBe(1);
  });
});

describe('code layer lyric glide', () => {
  it('moves the lyric box between lines and fades a new one in by weight', async () => {
    const { blendLayer } = await import('./graphics');
    const box = (x: number) => ({ x0: x, y0: 0, x1: x + 100, y1: 50 });
    const code = (lyric?: ReturnType<typeof box>) => ({ kind: 'code' as const, src: '', lyric });
    const mid = blendLayer(code(box(0)), code(box(200)), 0.5) as { lyric: { x0: number }; lyricWeight: number };
    expect(mid.lyric.x0).toBe(100);
    expect((blendLayer(code(), code(box(0)), 0.25) as { lyricWeight: number }).lyricWeight).toBe(0.25);
    const leaving = blendLayer(code(box(0)), code(), 0.25) as { lyric: { x0: number }; lyricWeight: number };
    expect([leaving.lyric.x0, leaving.lyricWeight]).toEqual([0, 0.75]);
  });
});

describe('ui windows', () => {
  it('a computer window moves off the lyrics like any boxed layer', async () => {
    const { avoidAll, layerRect } = await import('./graphics');
    const win = { kind: 'ui', type: 'log', color: '#3DFF6E', x: 0, y: 0 } as const;
    const lyrics = { x0: 560, y0: 440, x1: 1360, y1: 640 };
    const r0 = layerRect(win)!;
    expect(r0.x1 - r0.x0).toBeCloseTo(0.36 * 1920);
    const [moved] = avoidAll([win], lyrics);
    const r = layerRect(moved)!;
    // clear of the lyrics by the 24 px margin (to a rounding error)
    expect(r.x1 <= lyrics.x0 - 23 || r.x0 >= lyrics.x1 + 23 || r.y1 <= lyrics.y0 - 23 || r.y0 >= lyrics.y1 + 23).toBe(true);
  });
});

describe('spreadWindows', () => {
  it('moves a window off one it covers and leaves separate windows alone', async () => {
    const { spreadWindows, layerRect } = await import('./graphics');
    const win = (x: number, y: number) => ({ kind: 'ui', type: 'files', color: '#3DFF6E', x, y }) as const;
    const [a, b, c] = spreadWindows([win(0.5, 0.5), win(0.55, 0.45), win(-0.6, -0.6)]);
    const ra = layerRect(a)!;
    const rb = layerRect(b)!;
    expect(a).toEqual(win(0.5, 0.5));
    expect(c).toEqual(win(-0.6, -0.6));
    const cut = Math.max(0, Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0)) * Math.max(0, Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0));
    expect(cut).toBeLessThanOrEqual(0.2 * (rb.x1 - rb.x0) * (rb.y1 - rb.y0));
  });
});

describe('window cascade', () => {
  it('places a cascade as one block that grows with its copies', async () => {
    const { layerRect } = await import('./graphics');
    const one = layerRect({ kind: 'ui', type: 'error', color: '#3DFF6E', x: 0, y: 0 })!;
    const five = layerRect({ kind: 'ui', type: 'error', color: '#3DFF6E', x: 0, y: 0, cascade: 5 })!;
    expect(five.x1 - five.x0 - (one.x1 - one.x0)).toBeCloseTo(4 * 44);
    expect(five.y1 - five.y0 - (one.y1 - one.y0)).toBeCloseTo(4 * 44);
  });
});

describe('measurable (motion QA visibility)', () => {
  const hero = (opacity: number, shatter = 0): Layer => ({ kind: 'sprite', ref: 'hero#0:horse', asset: 'spr:horse', x: 0.75, y: -0.55, size: 0.36, opacity, shatter });
  const card = (ref: string, opacity: number, x = 0): Layer => ({ kind: 'card', ref, style: 'note', text: '嘘つき', x, y: 0, w: 0.24, h: 0.16, rot: 0, scale: 1, color: '#ffc0d0', ink: '#333333', opacity });
  const stamp: Layer = { kind: 'stamp', text: 'LOVE', color: '#ff0000', x: -0.5, y: 0.5 };
  const one = (ls: Layer[], age = 10, storyFrom = 1) => measurable(ls, ls, age, 'section', 3, storyFrom);

  it('skips a hidden, not yet shown, faded out or shattered hero', () => {
    expect(one([stamp, hero(0)]).map((m) => m.ref)).toEqual(['stamp:LOVE@s3#0']);
    expect(one([stamp, hero(0.01)])).toHaveLength(1);
    expect(one([stamp, hero(1, 1)])).toHaveLength(1);
    expect(one([stamp, hero(0.5, 0.4)]).map((m) => [m.ref, m.group, m.opacity, m.layer])).toEqual([
      ['stamp:LOVE@s3#0', 'decor', 1, 'section:0'],
      ['hero#0:horse', 'prop', 0.5, 'story:0'],
    ]);
  });

  it('counts visible decorations, a window only once it has popped in', () => {
    const win: Layer = { kind: 'ui', type: 'error', color: '#3DFF6E', x: 0, y: 0, delay: 2 };
    expect(one([win], 1, 1)).toEqual([]);
    expect(one([win], 2.075, 1)[0].opacity).toBeCloseTo(0.5);
    expect(one([win], 5, 1)[0]).toMatchObject({ ref: 'ui:error@s3#0', group: 'decor', opacity: 1 });
    // a full-frame photo has no box to collide with; a director's faint stamp is kept at its own opacity
    expect(one([{ kind: 'photo', mode: 'full' }, { ...stamp, opacity: 0.3 }], 10, 2).map((m) => m.opacity)).toEqual([0.3]);
  });

  it('keeps a half-transparent stepped-back prop, marked faded', () => {
    const planned = [card('cards#0[0]', 1)];
    const placed = [card('cards#0[0]', 0.55)];
    expect(measurable(placed, planned, 10, 'section', 3, 0)[0]).toMatchObject({ group: 'card', opacity: 0.55, faded: true });
  });

  it('tells the same decoration in two sections apart', () => {
    expect(measurable([stamp], [stamp], 10, 'section', 1)[0].ref).not.toBe(measurable([stamp], [stamp], 10, 'section', 4)[0].ref);
  });

  it('names the previous section in a transition', () => {
    expect(measurable([stamp], [stamp], Infinity, 'prev', 2)[0]).toMatchObject({ layer: 'prev:0', ref: 'stamp:LOVE@s2#0' });
  });
});
