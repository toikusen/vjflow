import { describe, expect, it } from 'vitest';
import { blockOf, SET_SPECS, SetSpec, TYPE_FLOOR } from './world-sets';
import { splitParts, wrapRows } from './world-split';

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
        // (a set that splits only to ink the part apart keeps one size: scale ≥ 0.9)
        if (s.split!.scale < 0.9) expect(Math.max(...small), `${id} ${text}`).toBeLessThan(Math.min(...big));
        else expect(Math.max(...small), `${id} ${text}`).toBeLessThanOrEqual(Math.min(...big));
        expect(Math.min(...small), `${id} ${text}`).toBeGreaterThanOrEqual(TYPE_FLOOR.lo * 0.7);
        expect(inFrame(b), `${id} ${text}`).toBe(true);
      }
    }
  });
  it("split the boards' own lines", () => {
    for (const id of ['popart/balloon', 'brutalist/headline', 'citypop/facade-title', 'y2k/hook', 'y2k/eq', 'psychedelic/tunnel']) expect(blockOf(id.includes('eq') ? '如果我有輕功 飛簷走壁' : '快使用雙截棍 哼哼哈兮', SET_SPECS[id], measure).lines, id).toBeDefined();
  });
  it('keep a line with no break laid out whole', () => {
    expect(blockOf('快使用雙截棍', SET_SPECS['popart/balloon'], measure).lines).toBeUndefined();
  });
  it("set a column line's second phrase down its own strip, tops level, read right to left", () => {
    for (const id of ['graffiti/strips', 'y2k/strips']) {
      const b = blockOf('什麼刀槍跟棍棒 我都耍的有模有樣', SET_SPECS[id], measure);
      const [first, second] = b.lines!;
      expect(first.v && second.v, id).toBe(true);
      expect(first.x0, id).toBeGreaterThan(second.x0 + second.bw);
      expect(Math.abs(first.y - second.y), id).toBeLessThan(1);
      expect(inFrame(b), id).toBe(true);
    }
  });
  it('wrap a part with no phrase break evenly, never starting a row on a small kana', () => {
    expect(wrapRows('信じてみるんだ', 2)).toEqual(['信じてみ', 'るんだ']);
    expect(wrapRows('ちょっと', 2).every((r) => !/^[ょっ]/.test(r))).toBe(true);
    expect(wrapRows('哼哼哈兮', 1)).toEqual(['哼哼哈兮']);
  });
  it("hold a part set apart to its container's width (the burst), wrapping it first", () => {
    for (const id of ['popart/balloon', 'popart/balloon-r']) {
      const s = SET_SPECS[id];
      const b = blockOf('信じてみる 信じてみるんだ', s, measure);
      const rows = b.small!.map((r) => b.lines![r]);
      expect(rows.length, id).toBe(2);
      for (const r of rows) expect(r.bw, id).toBeLessThanOrEqual(s.split!.share! * 1920 + 1);
    }
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
