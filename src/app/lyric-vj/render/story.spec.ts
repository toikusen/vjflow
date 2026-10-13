import { describe, expect, it } from 'vitest';
import { along, heroAt, StoryItem, storyLayers } from './story';

describe('story components', () => {
  it('plays a hero through show, crack, shatter, gather and a bookend return', () => {
    const states = [
      { at: 0, state: 'show' as const },
      { at: 10, state: 'hide' as const },
      { at: 40, state: 'show' as const },
      { at: 50, state: 'crack' as const },
      { at: 60, state: 'shatter' as const },
      { at: 80, state: 'gather' as const },
      { at: 100, state: 'glow' as const },
    ];
    expect(heroAt(states, -1)).toBeUndefined();
    expect(heroAt(states, 5)?.visible).toBe(1);
    expect(heroAt(states, 20)).toBeUndefined();
    expect(heroAt(states, 55)?.crack).toBe(1);
    expect(heroAt(states, 60.6)?.shatter).toBeGreaterThan(0);
    expect(heroAt(states, 70)).toBeUndefined();
    const back = heroAt(states, 90)!;
    expect([back.shatter, back.crack]).toEqual([0, 0]);
    expect(heroAt(states, 101)?.glow).toBe(1);
  });

  it('turns items into per-frame layers only while they are on', () => {
    const items = [
      { kind: 'fly' as const, prop: 'plane', at: 5, dur: 2, from: 'left' as const, x: 0.3, y: 0.2, size: 0.2, trail: '#ffffff', until: 12 },
      { kind: 'cards' as const, from: 20, to: 30, every: 1, style: 'bubble' as const, texts: ['a', 'b', 'c'], x: 0, y: 0, color: '#ffffff', ink: '#000000' },
      { kind: 'thread' as const, from: 40, to: 42, a: [-0.8, 0] as [number, number], b: [0.8, 0] as [number, number], color: '#ff0000', cut: 45 },
    ];
    expect(storyLayers(items, 4)).toEqual([]);
    const fly = storyLayers(items, 7.5)[0];
    // landed: at its point, give or take its rest movement
    expect(fly.kind === 'sprite' && fly.x).toBeCloseTo(0.3, 1);
    expect(fly.kind === 'sprite' && fly.y).toBeCloseTo(0.2, 1);
    expect(storyLayers(items, 21.5).filter((l) => l.kind === 'card')).toHaveLength(2);
    expect(storyLayers(items, 44).filter((l) => l.kind === 'thread')).toHaveLength(1);
    expect(storyLayers(items, 45.3).filter((l) => l.kind === 'thread')).toHaveLength(2);
    expect(storyLayers(items, 47)).toEqual([]);
  });
});

describe('validateStory', () => {
  it('keeps known props inside the song and caps each kind', async () => {
    const { validateStory } = await import('./story');
    const plan = {
      props: [{ id: 'bell', what: 'a bell', hero: true }],
      items: [
        { kind: 'hero' as const, prop: 'bell', x: 3, y: 0.5, size: 0.3, states: [{ at: -5, state: 'show' as const }], why: 'x' },
        { kind: 'hero' as const, prop: 'bell', x: 0, y: 0, size: 0.3, states: [{ at: 50, state: 'show' as const }], why: 'second hero' },
        { kind: 'pop' as const, prop: 'ghost', at: 10, dur: 2, x: 0, y: 0, size: 0.2, why: 'unknown prop' },
      ],
    };
    const r = validateStory(plan, 100);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kind === 'hero' && [r.items[0].x, r.items[0].states[0].at]).toEqual([0.95, 0]);
    expect(r.fixes).toHaveLength(2);
  });
});

describe('transition parsing', () => {
  it('reads kind, seconds and colour, and refuses unknown kinds', async () => {
    const { parseTransition } = await import('./transition');
    expect(parseTransition('clock:9')).toEqual({ kind: 'clock', dur: 1.5 });
    expect(parseTransition('')).toBeUndefined();
    expect(parseTransition('spin')).toBeUndefined();
  });
});

describe('story components, second batch', () => {
  it('walks a polyline by length', () => {
    const pts: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    expect(along(pts, 0.25)).toEqual([0.5, 0]);
    expect(along(pts, 0.75)).toEqual([1, 0.5]);
    expect(along(pts, 1)).toEqual([1, 1]);
  });

  it('circles an orbit, nearer and bigger at the bottom, passing behind the lyrics', () => {
    const items = [{ kind: 'orbit' as const, prop: 'moon', from: 0, to: 20, x: 0, y: 0, r: 0.5, size: 0.2, period: 8 }];
    const at = (t: number) => storyLayers(items, t)[0] as Extract<ReturnType<typeof storyLayers>[number], { kind: 'sprite' }>;
    expect(at(0).x).toBeCloseTo(0.5);
    expect(at(2).y).toBeLessThan(0); // a quarter lap on: the bottom of the ellipse
    expect(at(2).size).toBeGreaterThan(at(6).size);
    expect(at(2).pass).toBe(true);
    expect(storyLayers(items, 21)).toEqual([]);
  });

  it('travels a journey and rests at its end', () => {
    const items = [{ kind: 'journey' as const, prop: 'boat', from: 0, to: 10, pts: [[-0.8, -0.6], [0.8, -0.6]] as [number, number][], size: 0.2 }];
    const s = (t: number) => storyLayers(items, t)[0] as Extract<ReturnType<typeof storyLayers>[number], { kind: 'sprite' }>;
    expect(s(5).x).toBeCloseTo(0, 1);
    expect(s(11).x).toBeCloseTo(0.8, 1);
    expect(s(11).pass).toBe(false);
  });

  it('morphs one shape into the next', () => {
    const items = [{ kind: 'morph' as const, steps: [{ at: 0, prop: 'cube' }, { at: 5, prop: 'star' }], until: 20, x: 0.7, y: 0.5, size: 0.2 }];
    expect(storyLayers(items, 3).map((l) => l.kind === 'sprite' && l.asset)).toEqual(['spr:cube']);
    expect(storyLayers(items, 5.2).map((l) => l.kind === 'sprite' && l.asset)).toEqual(['spr:cube', 'spr:star']);
    expect(storyLayers(items, 7).map((l) => l.kind === 'sprite' && l.asset)).toEqual(['spr:star']);
  });

  it('shows a chapter card for its time and floats props inside the frame', () => {
    const items = [
      { kind: 'chapter' as const, at: 10, dur: 3, text: '第一章', x: -0.6, y: 0.7, color: '#fff', ink: '#000' },
      { kind: 'float' as const, props: ['a', 'b', 'c'], from: 0, to: 100, size: 0.15 },
    ];
    expect(storyLayers(items, 11).filter((l) => l.kind === 'card')).toHaveLength(1);
    expect(storyLayers(items, 14).filter((l) => l.kind === 'card')).toHaveLength(0);
    for (const t of [5, 33, 77]) for (const l of storyLayers(items, t)) if (l.kind === 'sprite') expect(Math.abs(l.x) <= 0.72 && Math.abs(l.y) <= 0.55).toBe(true);
  });
});

describe('story layer refs (QA only)', () => {
  it('names each layer after its story item', () => {
    const items: StoryItem[] = [
      { kind: 'hero', prop: 'horse', x: 0, y: 0, size: 0.3, states: [{ at: 0, state: 'show' }] },
      { kind: 'cards', style: 'note', texts: ['a', 'b'], from: 1, to: 9, every: 1, x: 0, y: 0, color: '#ffffff', ink: '#000000' },
    ];
    expect(storyLayers(items, 3).map((l) => l.ref)).toEqual(['hero#0:horse', 'cards#1[0]:a', 'cards#1[1]:b']);
  });

  it('gives the same prop in two items different ids', () => {
    const items: StoryItem[] = [
      { kind: 'pop', prop: 'horse', at: 1, dur: 5, x: -0.5, y: 0, size: 0.2 },
      { kind: 'pop', prop: 'horse', at: 2, dur: 5, x: 0.5, y: 0, size: 0.2 },
    ];
    expect(storyLayers(items, 4).map((l) => l.ref)).toEqual(['pop#0:horse', 'pop#1:horse']);
  });
});
