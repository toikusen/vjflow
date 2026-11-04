import { describe, expect, it } from 'vitest';
import { blockOf, SET_SPECS, SetSpec, TYPE_FLOOR } from './world-sets';
import { splitParts } from './world-split';

const measure = (s: string) => [...s].length * 100;
const inFrame = (b: { cx: number; cy: number; w: number; h: number }) => Math.abs(b.cx) + b.w / 2 <= 960 && Math.abs(b.cy) + b.h / 2 <= 540;

describe('split lines (one line in two sizes or two containers)', () => {
  it('break only at a space the lyric has, each part two characters or more', () => {
    expect(splitParts('快使用雙截棍 哼哼哈兮', 'tail')).toEqual(['快使用雙截棍', '哼哼哈兮', false]);
    expect(splitParts('如果我有輕功 飛簷走壁', 'lead')).toEqual(['飛簷走壁', '如果我有輕功', true]);
    expect(splitParts('快使用雙截棍', 'tail')).toBeUndefined();
    expect(splitParts('快使用雙截棍 哼', 'tail')).toBeUndefined();
  });
  it('set the small part smaller, never under the type floor, and the whole line inside the frame', () => {
    for (const [id, s] of Object.entries(SET_SPECS).filter(([, s]) => s.split)) {
      for (const text of ['快使用雙截棍 哼哼哈兮', '如果我有輕功 飛簷走壁', '習武之人切記 仁者無敵 是誰在練太極 風生水起']) {
        const b = blockOf(text, s, measure);
        expect(inFrame(b), `${id} ${text}`).toBe(true);
        // (two sizes that would not read as two are laid out whole)
        if (!b.lines) continue;
        const small = b.small!.map((r) => b.lines![r].size);
        const big = b.lines!.filter((_, r) => !b.small!.includes(r)).map((l) => l.size);
        expect(Math.max(...small), `${id} ${text}`).toBeLessThan(Math.min(...big));
        expect(Math.min(...small), `${id} ${text}`).toBeGreaterThanOrEqual(TYPE_FLOOR.lo * 0.7);
        expect(inFrame(b), `${id} ${text}`).toBe(true);
      }
    }
  });
  it("split the boards' own lines", () => {
    for (const id of ['popart/balloon', 'brutalist/headline', 'citypop/facade-title', 'y2k/fan', 'psychedelic/tunnel']) expect(blockOf(id.includes('fan') ? '如果我有輕功 飛簷走壁' : '快使用雙截棍 哼哼哈兮', SET_SPECS[id], measure).lines, id).toBeDefined();
  });
  it('keep a line with no break laid out whole', () => {
    expect(blockOf('快使用雙截棍', SET_SPECS['popart/balloon'], measure).lines).toBeUndefined();
  });
  it('put a part set apart at its own place, clear of the hero', () => {
    const b = blockOf('快使用雙截棍 哼哼哈兮', SET_SPECS['popart/balloon'], measure);
    const [hero, small] = [b.lines![0], b.lines![1]];
    expect(small.x0).toBeGreaterThan(hero.x0 + hero.bw);
  });
});

describe('the type floor against the frame', () => {
  it('sets a line too long for its set smaller rather than run it off the frame', () => {
    const long = '習武之人切記 "仁者無敵" 是誰在練太極';
    for (const id of ['gameshow/board', 'idol-live/cards', 'gameshow/answers']) {
      const b = blockOf(long, SET_SPECS[id], measure);
      expect(Math.abs(b.cx) + b.w / 2, id).toBeLessThanOrEqual(960 - 60);
    }
  });
  it('leaves a line that fits at its own size', () => {
    const s: SetSpec = SET_SPECS['gameshow/board'];
    expect(blockOf('快使用雙截棍', s, measure).size).toBe(176);
  });
});
