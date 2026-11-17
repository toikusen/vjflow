import { describe, expect, it } from 'vitest';
import { GlyphEnv, moveSec, sungAt, WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './world-motion';
import { blockOf, SET_SPECS, TYPE_FLOOR } from './world-sets';

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
    // (dark-glitch's carrier tears a band of the line sideways on purpose: at most 30 px, under a sixth of the time)
    const TEARS = new Set(['carrier-hum']);
    for (const [id, h] of Object.entries(WORLD_HOLDS)) for (let age = 0; age < 8; age += 0.13) {
      const p = h({ ...env(1), age });
      expect(Math.abs(p.dx ?? 0), id).toBeLessThanOrEqual(TEARS.has(id) ? 30 : 5);
      expect(p.a ?? 1, id).toBe(1);
      expect(p.tone ?? 1, id).toBeGreaterThanOrEqual(0.6);
    }
  });
  it('tear a held line only now and then', () => {
    const ages = Array.from({ length: 800 }, (_, k) => k * 0.01);
    const torn = ages.filter((age) => Math.abs(WORLD_HOLDS['carrier-hum']({ ...env(1), age }).dx ?? 0) > 5).length;
    expect(torn / ages.length).toBeLessThan(1 / 6);
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
  it('set a short line big, whatever small numbers a set asks for (no small words in a corner of an empty frame)', () => {
    for (const [id, s] of Object.entries(SET_SPECS)) expect(blockOf('一起走', s, measure).size, id).toBeGreaterThanOrEqual(TYPE_FLOOR.lo);
    expect(blockOf('一起走', SET_SPECS['ink-wash/corner'], measure).size).toBeGreaterThanOrEqual(TYPE_FLOOR.hi);
    expect(blockOf('一起走', SET_SPECS['dark-glitch/dead-air'], measure).size).toBeGreaterThanOrEqual(TYPE_FLOOR.hi);
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

// legibility is absolute (lyric-vj-legibility-absolute): a move may slide, fade or scale a row, but two characters of one
// row never cross or close on each other past their side bearings — 「失う怖さも」 read 「失怖」 for 0.1 s while slice-out
// pulled neighbours of one row opposite ways (v4 review, 2026-11-17)
describe('no move merges glyphs', () => {
  const SIZE = 100;
  const BEARING = 0.1; // the share of a glyph's advance two neighbours may close by before strokes can meet
  const rows = 2, perRow = 6;
  const moves = { ...Object.fromEntries(Object.entries(WORLD_ENTERS).map(([k, m]) => [`in:${k}`, m])), ...Object.fromEntries(Object.entries(WORLD_EXITS).map(([k, m]) => [`out:${k}`, m])) };
  it.each(Object.entries(moves).filter(([, m]) => m.glyph))('%s keeps the characters of a row apart', (id, m) => {
    for (const seed of [3, 7, 12]) {
      for (let q = 0; q <= 1.0001; q += 0.04) {
        for (let r = 0; r < rows; r++) {
          const poses = Array.from({ length: perRow }, (_, c) => {
            const i = r * perRow + c;
            // (a row's glyphs sit at slightly different heights: a stair, a drop, a glyph's own dy)
            const v = (r + 0.5) / rows + ((c % 3) - 1) * 0.04;
            return m.glyph!({ q, i, n: rows * perRow, u: (c + 0.5) / perRow, v, seed, age: 1, sung: 1, row: r });
          });
          for (let c = 1; c < perRow; c++) {
            const [a, b] = [poses[c - 1], poses[c]];
            if ((a.a ?? 1) < 0.05 || (b.a ?? 1) < 0.05) continue;
            const closed = (a.dx ?? 0) - (b.dx ?? 0);
            expect(closed, `${id} q=${q.toFixed(2)} row ${r} glyphs ${c - 1},${c} closed by ${closed.toFixed(1)} px`).toBeLessThanOrEqual(SIZE * BEARING);
          }
        }
      }
    }
  });
});
