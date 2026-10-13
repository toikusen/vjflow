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

describe('density: making room when the frame is full', () => {
  // a line across the whole middle of the frame: room only in strips above and below
  const full = { x0: 0, y0: 200, x1: 1920, y1: 880 };

  it('sends a prop with no room anywhere away (opacity 0) instead of half-transparent behind the words', async () => {
    const { avoid } = await import('./graphics');
    const everything = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
    const hero = { kind: 'sprite' as const, ref: 'hero#0:horse', asset: 'spr:horse', x: 0, y: 0, size: 0.4 };
    expect(avoid(hero, everything).opacity).toBe(0);
  });

  it('moves a busy decoration (a photo) to a free spot, keeps a photo with nowhere to go, and leaves a flat shape behind the words', async () => {
    const { avoid, layerRect } = await import('./graphics');
    const photo = { kind: 'photo' as const, mode: 'circle' as const, x: -0.6, y: 0, w: 0.08 };
    const moved = avoid(photo, full);
    const r = layerRect(moved)!;
    // (clear of the words; a photo's fixed margin does not shrink with it, so it may sit a few px into the 24 px guard)
    expect(moved.opacity ?? 1).toBe(1);
    expect(r.y1 <= full.y0 || r.y0 >= full.y1).toBe(true);
    // a photo with nowhere to go stays (an emptied frame reads as dead); letters with nowhere to go leave
    const big = { kind: 'photo' as const, mode: 'circle' as const, x: 0, y: 0, w: 0.42 };
    expect(avoid(big, full)).toBe(big);
    const stamp = { kind: 'stamp' as const, text: 'ABCD', color: '#000', x: 0, y: 0, size: 400 };
    expect(avoid(stamp, full).opacity).toBe(0);
    const disc = { kind: 'blob' as const, x: 0, y: 0, r: 0.4, color: '#f80' };
    expect(avoid(disc, full)).toBe(disc);
  });

  it('keeps only the card that landed last when a pile does not fit; the others leave where they are', async () => {
    const { avoidAll, layerRect } = await import('./graphics');
    // room only in a strip on the left, tall enough for one (tall) card at 70 %
    const lyrics = { x0: 380, y0: 0, x1: 1920, y1: 1080 };
    const card = (k: number) => ({ kind: 'card' as const, ref: `cards#2[${k}]:t${k}`, style: 'note' as const, text: `t${k}`, x: -0.62, y: 0.4 - k * 0.09, w: 0.24, h: 0.8, rot: 0, scale: 1, color: '#f4a', ink: '#126', opacity: 1 });
    const out = avoidAll([card(0), card(1), card(2)], lyrics);
    expect(out.map((l) => l.opacity)).toEqual([0, 0, 1]);
    expect(layerRect(out[2])!.x1).toBeLessThanOrEqual(lyrics.x0 - 24);
    // a pile that fits keeps every card where it found room
    const roomy = avoidAll([card(0), card(1)], { x0: 1500, y0: 0, x1: 1920, y1: 200 });
    expect(roomy.map((l) => l.opacity)).toEqual([1, 1]);
  });

  it('keeps the card about the line up (key) over the one that landed last when a pile does not fit', async () => {
    const { avoidAll } = await import('./graphics');
    const lyrics = { x0: 380, y0: 0, x1: 1920, y1: 1080 };
    const card = (k: number, key?: boolean) => ({ kind: 'card' as const, ref: `cards#2[${k}]:t${k}`, style: 'note' as const, text: `t${k}`, x: -0.62, y: 0.4 - k * 0.09, w: 0.24, h: 0.8, rot: 0, scale: 1, color: '#f4a', ink: '#126', opacity: 1, key });
    // the newest card (2) is not about the line; card 1 is: card 1 stays, the newest leaves with the oldest
    expect(avoidAll([card(0), card(1, true), card(2)], lyrics).map((l) => l.opacity)).toEqual([0, 1, 0]);
  });

  it('keeps a key hero with no room anywhere, and lets it take the free spot before an ordinary prop', async () => {
    const { avoid, avoidAll, layerRect } = await import('./graphics');
    const everything = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
    const hero = { kind: 'sprite' as const, ref: 'hero#0:horse', asset: 'spr:horse', x: 0, y: 0, size: 0.4, key: true };
    expect(avoid(hero, everything)).toBe(hero);
    // a strip along the top with room for one wide prop; the ordinary prop comes first in layer order, the key hero
    // still gets the strip
    const lyrics = { x0: 0, y0: 400, x1: 1920, y1: 1080 };
    const pop = { kind: 'sprite' as const, ref: 'pop#1:banner', asset: 'spr:banner', aspect: 4, x: 0, y: 0, size: 0.3 };
    const [p, h] = avoidAll([pop, { ...hero, aspect: 4, size: 0.3 }], lyrics);
    expect(layerRect(h)!.y1).toBeLessThanOrEqual(lyrics.y0);
    expect(h.opacity ?? 1).toBe(1);
    expect(p.opacity).toBe(0);
  });
});

describe('smoothPlacement', () => {
  const plan = { kind: 'stamp' as const, text: 'A', color: '#000', x: 0, y: 0, size: 100 };
  const moved = { ...plan, x: 0.5 };

  it('returns the planned layer untouched when making room never moved it', async () => {
    const { smoothPlacement } = await import('./graphics');
    expect(smoothPlacement(plan, [{ plan, placed: plan }, { plan, placed: plan }])).toBe(plan);
  });

  it('glides a move and fades a leave over the window (the mean of the frames before)', async () => {
    const { smoothPlacement } = await import('./graphics');
    // a short move (96 px) in the latest two of four frames: halfway there
    const near = { ...plan, x: 0.1 };
    const half = smoothPlacement(plan, [{ plan, placed: near }, { plan, placed: near }, { plan, placed: plan }, { plan, placed: plan }]);
    expect(half.kind === 'stamp' && half.x).toBeCloseTo(0.05);
    // gone in one of four: three-quarters visible; a frame where it was not up yet does not count
    const gone = { ...plan, opacity: 0 };
    expect(smoothPlacement(plan, [{ plan, placed: gone }, { plan, placed: plan }, { plan, placed: plan }, { plan, placed: plan }, undefined]).opacity).toBeCloseTo(0.75);
  });

  it('fades a long move out where it was and in where it goes, never sliding across the frame', async () => {
    const { smoothPlacement } = await import('./graphics');
    // 480 px: at the old place, fading, while under half the window has moved; then at the new place, fading in
    const one = smoothPlacement(plan, [{ plan, placed: moved }, { plan, placed: plan }, { plan, placed: plan }, { plan, placed: plan }]);
    expect(one.kind === 'stamp' && one.x).toBeCloseTo(0);
    expect(one.opacity).toBeCloseTo(0.5);
    const three = smoothPlacement(plan, [{ plan, placed: moved }, { plan, placed: moved }, { plan, placed: moved }, { plan, placed: plan }]);
    expect(three.kind === 'stamp' && three.x).toBeCloseTo(0.5);
    expect(three.opacity).toBeCloseTo(0.5);
    // midway it is out of sight, never between the two places
    expect(smoothPlacement(plan, [{ plan, placed: moved }, { plan, placed: moved }, { plan, placed: plan }, { plan, placed: plan }]).opacity).toBeCloseTo(0);
    // two long moves close together: counted from the latest, never back to full in between
    const other = { ...plan, x: -0.5 };
    const two = smoothPlacement(plan, [{ plan, placed: moved }, { plan, placed: other }, { plan, placed: other }, { plan, placed: plan }, { plan, placed: plan }]);
    expect(two.opacity).toBeLessThan(0.7);
    expect(two.kind === 'stamp' && two.x).toBeCloseTo(-0.5);
    // leaving for want of room, with the place it would have had elsewhere: a plain fade where it shows
    const away = { ...moved, opacity: 0 };
    const leaving = smoothPlacement(plan, [{ plan, placed: away }, { plan, placed: away }, { plan, placed: plan }, { plan, placed: plan }]);
    expect(leaving.kind === 'stamp' && leaving.x).toBeCloseTo(0);
    expect(leaving.opacity).toBeCloseTo(0.5);
    // a flat shape glides however far it goes
    const disc = { kind: 'blob' as const, x: 0, y: 0, r: 0.2, color: '#f80' };
    const far = smoothPlacement(disc, [{ plan: disc, placed: { ...disc, x: 0.5 } }, { plan: disc, placed: disc }]);
    expect(far.kind === 'blob' && far.x).toBeCloseTo(0.25);
    expect(far.opacity ?? 1).toBe(1);
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
