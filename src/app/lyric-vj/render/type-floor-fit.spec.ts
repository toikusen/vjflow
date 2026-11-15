// The type floor after the frame fit, the typesetter and the stair template (2026-11-12 residual: blown lines, particles, stair).
import { describe, expect, it } from 'vitest';
import type { Glyph } from './glyphs';
import { frameFit } from './runtime';
import { GROW } from './world-beats';
import { stairRows, STAIR_LEAST } from './stair';
import { holdFalls, holdMultiple, playScale, TYPE_FLOOR } from './type-floor';
import { blowPose, holdParticles, type Pose } from './world-layout';
import { SET_SPECS, shearedSize } from './world-sets';

const glyphs = (text: string, tex: number): Glyph[] => [...text].map((char, i) => ({ char, advance: tex, x: 0, y: 0, index: i, src: i }) as unknown as Glyph);

describe('frameFit (the engine\'s frame fit, shared with the plan)', () => {
  it('is 1 for a box well inside the safe area and under 1 where motion would carry it out', () => {
    expect(frameFit(600, 300, true)).toBe(1);
    expect(frameFit(930, 300, false)).toBeLessThan(1);
    expect(frameFit(880, 300, true)).toBeLessThan(frameFit(880, 300, false));
  });
});

describe('a blown-up key is blown only as big as its pose fits at scale 1 (frame fit .88 to .95 set the words at 78 to 83 px)', () => {
  it('every pose returned fits the frame on a loud beat, so the fit never takes the words under the floor', () => {
    const spec = SET_SPECS['popart/balloon'];
    for (const [text, from, to] of [['快使用雙截棍哼哼哈兮', 3, 6], ['きゅんとさせてほしい恋に恋しているんです', 0, 2], ['教拳腳武術的老闆練鐵沙掌耍楊家槍', 10, 13], ['風生水起', 0, 2], ['あいうえお好きかきくけこ', 5, 7]] as const)
      for (const normal of [84, 100, 130]) {
        const p = blowPose(glyphs(text, 200), from, to, normal, 200, spec);
        if (!p) continue;
        const [w, h] = shearedSize(p.block.w, p.block.h, p.spec.shear);
        expect(frameFit((w / 2) * GROW.want, (h / 2) * GROW.want, true), `${text} ${normal}`).toBeGreaterThanOrEqual(1 - 1e-9);
        for (const [i, s] of p.sizes!.entries()) if (i < from || i >= to) expect(s * 200, `${text} ${normal}`).toBeGreaterThanOrEqual(TYPE_FLOOR.lo - 0.5);
      }
  });
});

describe('particles held at the floor as drawn (holdParticles)', () => {
  const fake = (size: number, rk: number, shear?: SetSpec['shear']): [Pose, { mesh: { userData: Record<string, unknown> } }[]] => {
    const pose = { block: { rows: [], size: 0, w: 0, h: 0, cx: 0, cy: 0 }, spec: { ...SET_SPECS['popart/balloon'], shear }, x: [0, 0], y: [0, 0], turn: [false, false], shown: [true, true], scale: rk, u: [0, 0], v: [0, 0] } as unknown as Pose;
    return [pose, [{ mesh: { userData: { size: 200 } } }, { mesh: { userData: { size } } }]];
  };
  type SetSpec = typeof SET_SPECS[string];
  it('lifts a particle the typesetter set at 0.78 on a 100 px row to the floor, never past its row', () => {
    const [pose, gs] = fake(156, 0.5);
    const held = holdParticles(pose, gs, 200);
    expect(held.sizes![1] * 156).toBeGreaterThanOrEqual(TYPE_FLOOR.lo - 0.5);
    expect(held.sizes![1] * 156).toBeLessThanOrEqual(100 + 1e-6);
    expect(held.sizes![0]).toBe(0.5);
  });
  it('leaves a row under the floor (a call of the set\'s own) and a particle already at it', () => {
    expect(holdParticles(...fake(156, 0.4), 200).sizes).toBeUndefined();
    expect(holdParticles(...fake(190, 0.5), 200).sizes).toBeUndefined();
  });
  it('reads the floor through a squashed height: 84 px drawn at scaleY .75 is 112 px laid', () => {
    const [pose, gs] = fake(156, 0.6, [1, 0, 0, 0.75]);
    const held = holdParticles(pose, gs, 200);
    expect(held.sizes![1] * 156).toBeGreaterThanOrEqual(112 - 0.5);
  });
});

describe('stair rows never set the type under the least size (a 50-character line took 68 px by the frame fit)', () => {
  const widest = (rows: string[]) => Math.max(...rows.map((r) => [...r].length * 100));
  it('adds rows, to six, until the widest sets at STAIR_LEAST or more', () => {
    const text = 'あいうえおかきくけこ さしすせそたちつてと なにぬねのはひふへほ まみむめもやゆよらり るれろわをんがぎぐげ';
    const rows = stairRows(text, [...text.replace(/ /g, '')].length, widest);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.length).toBeLessThanOrEqual(6);
    expect((100 * 0.55 * 1920) / widest(rows)).toBeGreaterThanOrEqual(STAIR_LEAST - 1e-6);
  });
  it('keeps two rows for a short line and three for a long one that fits', () => {
    expect(stairRows('あいう えおか', 6, widest).length).toBeLessThanOrEqual(2);
    const text = 'あいうえおか きくけこさし すせそたちつ';
    expect(stairRows(text, 18, widest).length).toBeLessThanOrEqual(3);
  });
});

describe('the hold on a line\'s fit while it plays (holdMultiple)', () => {
  it('lets a camera zoom out only until the words rest at the floor', () => {
    expect(holdMultiple(100, 84, 600, 300)).toBeCloseTo(0.84);
    expect(holdMultiple(86, 84, 600, 300)).toBeCloseTo(84 / 86);
  });
  it('lifts a fit that left the words under the floor, but not past the frame edge', () => {
    expect(holdMultiple(78, 84, 600, 300)).toBeCloseTo(84 / 78);
    expect(holdMultiple(78, 84, 930, 300)).toBeCloseTo((960 - 24) / 930);
    expect(holdMultiple(78, 84, 930, 300)).toBeLessThan(84 / 78);
  });
});

describe('a line is never resized while it is sung (playScale)', () => {
  const frames = (natural: (k: number) => number, hold: number) => Array.from({ length: 60 }, (_, k) => playScale(natural(k / 59), hold));
  it('is constant while the hold stops a camera zoom-out, then the natural scale', () => {
    const out = frames((k) => 0.93 + 0.07 * k, 0.97);
    const clamped = out.filter((x) => x === 0.97);
    expect(clamped.length).toBeGreaterThan(10);
    expect(out.slice(0, clamped.length).every((x) => x === 0.97)).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });
  it('adds no motion of its own: a line that never dips under its hold plays its natural scale exactly', () => {
    const natural = (k: number) => 1 + 0.012 * (0.5 - 0.5 * Math.cos(Math.PI * k));
    expect(frames(natural, 0.9)).toEqual(Array.from({ length: 60 }, (_, k) => natural(k / 59)));
  });
  it('never changes direction where the natural scale does not (no jitter from the hold)', () => {
    const noisy = frames((k) => 0.95 + 0.04 * k + 0.0001 * Math.sin(k * 40), 0.96);
    let flips = 0;
    for (let i = 2; i < noisy.length; i++) if ((noisy[i] - noisy[i - 1]) * (noisy[i - 1] - noisy[i - 2]) < -1e-12) flips++;
    expect(flips).toBeLessThanOrEqual(2);
  });
});

describe('a blown-up key the frame cannot hold gives way (holdFalls)', () => {
  it('is false where the hold reaches the floor inside the frame, and true where the frame\'s edge stops it short', () => {
    expect(holdFalls(90, 84, 600, 300)).toBe(false);
    expect(holdFalls(78, 84, 600, 300)).toBe(false);
    expect(holdFalls(78, 84, 930, 300)).toBe(true);
    expect(holdFalls(66, 84, 700, 520)).toBe(true);
  });
});
