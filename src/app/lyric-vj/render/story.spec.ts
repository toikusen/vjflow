import { describe, expect, it } from 'vitest';
import { along, heroAt, heroKey, StoryItem, storyEvents, storyLayers } from './story';

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

describe('heroKey', () => {
  const states = [{ at: 2, state: 'show' as const }, { at: 20, state: 'crack' as const }, { at: 40, state: 'hide' as const }];
  it('marks the turns of the hero story (1 s before to 1.5 s after the turn plays), not the stretches between or a hide', () => {
    expect(heroKey(states, 1.2)).toBe(true); // its entrance
    expect(heroKey(states, 3.9)).toBe(true);
    expect(heroKey(states, 10)).toBe(false);
    expect(heroKey(states, 19.2)).toBe(true); // the crack
    expect(heroKey(states, 22.2)).toBe(true);
    expect(heroKey(states, 22.5)).toBe(false);
    expect(heroKey(states, 40.2)).toBe(false); // the hide
  });
  it('is carried on the hero layer', () => {
    const items: StoryItem[] = [{ kind: 'hero', prop: 'horse', x: 0, y: 0, size: 0.3, states }];
    expect(storyLayers(items, 21)[0].key).toBe(true);
    expect(storyLayers(items, 10)[0].key).toBeUndefined();
  });
});

describe('storyEvents', () => {
  it('lists when the set of objects changes: each card landing and the pile clearing, hero turns, a pop coming and going', () => {
    const items: StoryItem[] = [
      { kind: 'cards', from: 10, to: 16, every: 2, style: 'note', texts: ['a', 'b', 'c', 'd'], x: 0, y: 0, color: '#fff', ink: '#000' },
      { kind: 'hero', prop: 'horse', x: 0, y: 0, size: 0.3, states: [{ at: 1, state: 'show' }, { at: 30, state: 'crack' }] },
      { kind: 'pop', prop: 'star', at: 40, dur: 5, x: 0, y: 0, size: 0.2 },
    ];
    // the fourth card (at 16) lands as the pile clears
    expect(storyEvents(items)).toEqual([10, 12, 14, 16, 16, 1, 30, 40, 45]);
  });
});


describe('prop drift and landing', () => {
  it('a drifting hero wanders on loopable noise: the same pose a loop later, no steady beat', async () => {
    const { DRIFT_LOOP } = await import('./story');
    const items: StoryItem[] = [{ kind: 'hero', prop: 'horse', motion: 'drift', x: 0, y: 0, size: 0.3, states: [{ at: 0, state: 'show' }] }];
    const pose = (t: number) => storyLayers(items, t)[0] as { x: number; y: number; rot: number };
    for (const t of [3, 7.7, 15]) {
      expect(pose(t + DRIFT_LOOP).x).toBeCloseTo(pose(t).x, 9);
      expect(pose(t + DRIFT_LOOP).rot).toBeCloseTo(pose(t).rot, 9);
    }
    // within its old reach (0.015 across, 0.02 up and down)
    const xs = Array.from({ length: 240 }, (_, i) => pose(1 + i / 10).x);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(0.015);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.005);
  });

  it('a hanging hero loops whole: its swing and its gust come back together every DRIFT_LOOP s, no jump at the seam', async () => {
    const { DRIFT_LOOP } = await import('./story');
    for (const n of [0, 1, 4]) {
      const items: StoryItem[] = [...Array.from({ length: n }, () => ({ kind: 'pop', prop: 'x', at: -99, dur: 0, x: 0, y: 0, size: 0.1 }) as StoryItem), { kind: 'hero', prop: 'lamp', motion: 'hang', x: 0, y: 0, size: 0.3, states: [{ at: 0, state: 'show' }] }];
      const rot = (t: number) => (storyLayers(items, t).at(-1) as { rot: number }).rot;
      for (const t of [3, 10.4, 20]) expect(rot(t + DRIFT_LOOP)).toBeCloseTo(rot(t), 9);
    }
  });

  it('a fly lands past its point by as much as it came in fast, and is at rest when its flight ends', async () => {
    const { flyOvershoot } = await import('./story');
    expect(flyOvershoot(1, 2)).toBe(0);
    expect(flyOvershoot(2, 1)).toBeGreaterThan(flyOvershoot(2, 1.5));
    expect(flyOvershoot(20, 0.1)).toBe(1.2);
    const fly = (dur: number): StoryItem[] => [{ kind: 'fly', prop: 'plane', motion: 'still', at: 0, dur, from: 'left', x: 0.6, y: 0, size: 0.2, until: 20 }];
    const xAt = (dur: number, k: number) => (storyLayers(fly(dur), k * dur)[0] as { x: number }).x;
    const past = (dur: number) => Math.max(...Array.from({ length: 100 }, (_, i) => xAt(dur, i / 100))) - 0.6;
    expect(past(0.8)).toBeGreaterThan(0.01);
    expect(past(4)).toBeLessThanOrEqual(1e-9);
    expect(xAt(0.8, 1)).toBeCloseTo(0.6, 9);
  });
});

describe('velocity banking (props lean with their own speed)', () => {
  const sprite = (items: StoryItem[], t: number) => storyLayers(items, t).find((l) => l.kind === 'sprite') as { rot: number; x: number } | undefined;
  it('a flying prop leans into its travel, either way, and stands up as it lands', () => {
    for (const from of ['left', 'right'] as const) {
      const fly: StoryItem = { kind: 'fly', prop: 'bird', motion: 'sit', at: 1, dur: 1.2, from, x: 0, y: 0, size: 0.2 };
      const mid = sprite([fly], 1.5)!;
      // (left: travelling right leans right, clockwise; from the right the other way)
      expect(Math.sign(mid.rot)).toBe(from === 'left' ? 1 : -1);
      expect(Math.abs(mid.rot)).toBeLessThan(0.45);
      // no jump at the landing: the lean is gone by the time it is at rest
      expect(Math.abs(sprite([fly], 2.19)!.rot - sprite([fly], 2.21)!.rot)).toBeLessThan(0.02);
    }
  });

  it('a journey leans while it moves fast and is upright when it slows into its stops', () => {
    const j: StoryItem = { kind: 'journey', prop: 'car', motion: 'still', from: 0, to: 4, pts: [[-0.8, 0], [0.8, 0]], size: 0.2 };
    expect(sprite([j], 2)!.rot).toBeGreaterThan(0.05);
    expect(Math.abs(sprite([j], 3.99)!.rot)).toBeLessThan(0.01);
    expect(Math.abs(sprite([j], 0.01)!.rot)).toBeLessThan(0.01);
  });
});

describe('elastic follow (a prop trailing another on a spring)', () => {
  const lead: StoryItem = { kind: 'journey', prop: 'kid', motion: 'still', from: 0, to: 3, pts: [[-0.8, -0.6], [0.8, -0.6]], size: 0.3 };
  const kite: StoryItem = { kind: 'follow', prop: 'kite', after: 'kid', x: -0.2, y: 0.5, size: 0.2, string: '#ffffff' };
  const at = (t: number) => {
    const ls = storyLayers([lead, kite], t);
    const [k, f] = ['journey', 'follow'].map((r) => ls.find((l) => l.ref?.startsWith(r)) as { x: number; y: number; rot?: number; opacity?: number });
    return { k, f, string: (ls.find((l) => l.ref?.startsWith('follow')) as { tether?: { ref: string; from: [number, number] } } | undefined)?.tether, threads: ls.filter((l) => l.kind === 'thread').length };
  };

  it('lags behind its leader while it moves, comes in after it stops, then settles at its offset', () => {
    const mid = at(1.5);
    expect(mid.f.x).toBeLessThan(mid.k.x - 0.2);
    // the leader has stopped; the follower is still coming in (its overshoot on a sudden stop: settle.spec)
    expect(at(3.05).f.x).toBeLessThan(0.6 - 0.002);
    const rest = at(5);
    expect(rest.f.x).toBeCloseTo(0.6, 2);
    expect(rest.f.y).toBeCloseTo(-0.1, 2);
  });

  it('is a function of time alone and hangs on a string from its leader', () => {
    expect(at(2.2)).toEqual(at(2.2));
    // the string is the follower's own, from its leader's place: never a separate layer that could be left behind
    const s = at(2.2);
    expect(s.threads).toBe(0);
    expect(s.string!.ref.startsWith('journey#0')).toBe(true);
    expect(s.string!.from[0]).toBeCloseTo(s.k.x, 6);
  });

  it('shows only while its leader is up', () => {
    expect(at(-0.5).f).toBeUndefined();
  });
});

describe('validateStory keeps a follower only with its leader', () => {
  it('drops a follow whose leader is not in the story', async () => {
    const { validateStory } = await import('./story');
    const plan = { props: [{ id: 'kid', what: '', hero: false }, { id: 'kite', what: '', hero: false }], items: [
      { kind: 'journey', prop: 'kid', from: 1, to: 4, pts: [[-0.8, -0.6], [0.8, -0.6]], size: 0.3 },
      { kind: 'follow', prop: 'kite', after: 'kid', x: -0.2, y: 0.5, size: 0.2 },
      { kind: 'follow', prop: 'kite', after: 'nobody', x: 0, y: 0.5, size: 0.2 },
    ] } as never;
    const { items, fixes } = validateStory(plan, 60);
    expect(items.filter((x) => x.kind === 'follow').length).toBe(1);
    expect(fixes.some((f) => f.includes('nobody'))).toBe(true);
  });
});

describe('elastic follow comes in smoothly', () => {
  it('never jumps as the spring fills with its leader\'s past (frame to frame no further than the leader moves)', () => {
    const lead: StoryItem = { kind: 'journey', prop: 'kid', motion: 'still', from: 1, to: 3, pts: [[-0.9, -0.6], [0.9, -0.6]], size: 0.3 };
    const kite: StoryItem = { kind: 'follow', prop: 'kite', after: 'kid', x: -0.2, y: 0.5, size: 0.2 };
    const pos = (t: number) => storyLayers([lead, kite], t).find((l) => l.ref?.startsWith('follow')) as { x: number } | undefined;
    const lx = (t: number) => (storyLayers([lead], t)[0] as { x: number }).x;
    for (let t = 1.0 + 1 / 60; t < 1.6; t += 1 / 60) {
      const [a, b] = [pos(t - 1 / 60), pos(t)];
      if (!a || !b) continue;
      expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(Math.abs(lx(t) - lx(t - 1 / 60)) * 1.2);
    }
  });
});

describe('elastic follow cost', () => {
  it('works out its leader\'s place once per time a frame needs, without the leader\'s trail', async () => {
    const { followStats } = await import('./story');
    const lead: StoryItem = { kind: 'journey', prop: 'kid', motion: 'still', from: 0, to: 4, pts: [[-0.9, -0.6], [0.9, -0.6]], size: 0.3, trail: '#ffffff' };
    const kite: StoryItem = { kind: 'follow', prop: 'kite', after: 'kid', x: -0.2, y: 0.5, size: 0.2 };
    followStats.evals = 0;
    storyLayers([lead, kite], 2);
    // 36 spring taps, the lean's two sides sharing theirs (37), the leader now: no more
    expect(followStats.evals).toBeLessThanOrEqual(75);
  });
});
