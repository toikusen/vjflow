import { describe, expect, it } from 'vitest';
import { GlyphEnv, moveSec, sungAt, WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './world-motion';
import { blockOf, SET_SPECS } from './world-sets';

const env = (q: number, i = 3): GlyphEnv => ({ q, i, n: 10, u: 0.4, v: 0.5, seed: 7, age: 1.2, sung: 1 });

describe('world moves', () => {
  it('end at the rest pose: what reading sees does not depend on the move', () => {
    for (const [id, m] of Object.entries(WORLD_ENTERS)) {
      for (const i of [0, 3, 9]) {
        const p = m.glyph?.(env(1, i)) ?? {};
        expect(p.a ?? 1, id).toBeCloseTo(1, 1);
        expect(p.tone ?? 1, id).toBeGreaterThanOrEqual(0.99);
        expect(Math.abs(p.dx ?? 0), id).toBeLessThan(0.01);
        expect(Math.abs(p.dy ?? 0), id).toBeLessThan(0.01);
      }
      const b = m.block?.(1, 7) ?? {};
      expect(Math.abs(b.dx ?? 0), id).toBeLessThan(0.01);
      expect(b.sx ?? 1, id).toBeCloseTo(1, 2);
      if (m.clip) expect(m.clip(1).at, id).toBeCloseTo(1);
    }
  });
  it('start from the whole line when they leave', () => {
    for (const [id, m] of Object.entries(WORLD_EXITS)) {
      const p = m.glyph?.(env(0)) ?? {};
      expect(p.a ?? 1, id).toBeGreaterThan(0.9);
      const b = m.block?.(0, 7) ?? {};
      expect(b.a ?? 1, id).toBeCloseTo(1);
      if (m.clip) expect(m.clip(0).at, id).toBeCloseTo(1);
    }
  });
  it('keep held lines within a few pixels', () => {
    for (const [id, h] of Object.entries(WORLD_HOLDS)) for (let age = 0; age < 8; age += 0.13) {
      const p = h({ ...env(1), age });
      expect(Math.abs(p.dx ?? 0), id).toBeLessThanOrEqual(5);
      expect(p.a ?? 1, id).toBe(1);
      expect(p.tone ?? 1, id).toBeGreaterThanOrEqual(0.6);
    }
  });
  it('give a move only the room reading leaves', () => {
    expect(moveSec(0.6, 2)).toBeCloseTo(0.6);
    expect(moveSec(0.6, 0.4)).toBeCloseTo(0.4);
    expect(moveSec(0.6, 0.1)).toBe(0);
  });
  it('lock each character by its own time', () => {
    expect(sungAt(0, 10, 2, 4)).toBe(2);
    expect(sungAt(5, 10, 2, 4)).toBeLessThan(3.1);
    expect(sungAt(1, 2, 2, 4, [2, 3.5])).toBe(3.5);
  });
});

describe('world sets', () => {
  const measure = (s: string) => [...s].length * 100;
  it('never rest under the type floor on an ordinary line', () => {
    for (const [id, s] of Object.entries(SET_SPECS)) for (const text of ['那些話留給了潮汐，你還在等我回來嗎', '一起走', '夜裡的光照亮了街道也照亮了你的臉']) {
      expect(blockOf(text, s, measure).size, `${id} ${text}`).toBeGreaterThanOrEqual(52);
    }
  });
  it('stay inside the frame with their object', () => {
    for (const [id, s] of Object.entries(SET_SPECS)) {
      const b = blockOf('那些話留給了潮汐', s, measure);
      const [px, py] = s.pad ?? [0, 0];
      expect(Math.abs(b.cx) + b.w / 2 + px, id).toBeLessThanOrEqual(960 + 40 + px);
      expect(Math.abs(b.cy) + b.h / 2, id).toBeLessThanOrEqual(540);
    }
  });
});
