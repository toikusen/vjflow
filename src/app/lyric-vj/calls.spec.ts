import { callTimes, mapRange, splitCalls } from './calls';

describe('calls', () => {
  it('splits a leading call off the main line and maps indexes onto it', () => {
    const s = splitCalls('(幹什麼? 幹什麼?) 呼吸吐納心自在');
    expect(s.main).toBe('呼吸吐納心自在');
    const full = [...'(幹什麼? 幹什麼?) 呼吸吐納心自在'];
    expect(s.calls).toEqual([{ text: '幹什麼? 幹什麼?', from: 0, to: (full.indexOf(')') + 1) / full.length }]);
    const at = [...'(幹什麼? 幹什麼?) 呼吸吐納心自在'].indexOf('心');
    expect(s.map[at]).toBe([...'呼吸吐納心自在'].indexOf('心'));
    expect(mapRange(s.map, at, at + 2)).toEqual([4, 6]);
    expect(mapRange(s.map, 1, 4)).toBeUndefined();
  });

  it('handles trailing and full-width calls', () => {
    const s = splitCalls('愛してる（Hey!）');
    expect(s.main).toBe('愛してる');
    expect(s.calls[0].text).toBe('Hey!');
    expect(s.calls[0].to).toBe(1);
  });

  it('leaves lines without a closed call, or made only of a call, as they are', () => {
    expect(splitCalls('快使用雙截棍').calls).toEqual([]);
    expect(splitCalls('(哼)').main).toBe('(哼)');
    expect(splitCalls('不會(閉合').main).toBe('不會(閉合');
  });

  it('times each call by its opening bracket, or by its share of the line', () => {
    const timed = callTimes([
      { id: 'a', start: 10, end: 12, text: 'ねえ（ねえ！）', charStarts: [10, 10.4, 11.5, 11.5, 11.5, 11.5, 11.5] },
      { id: 'b', start: 20, end: 24, text: '燃やせ（あわ！）' },
    ]);
    expect(timed).toEqual([
      { text: 'ねえ！', at: 11.5, cueId: 'a' },
      { text: 'あわ！', at: 20 + (3 / 8) * 4, cueId: 'b' },
    ]);
  });

  it('lines call words up side by side without overlap, wrapping a row too long for the room', async () => {
    const { lineUp } = await import('./calls');
    expect(lineUp([100, 200, 200, 200], 600, 50)).toEqual([{ x: -250, row: 0 }, { x: -50, row: 0 }, { x: 200, row: 0 }, { x: 0, row: 1 }]);
  });

  it('sets a long aside in phrases of a few words, never a word per row', async () => {
    const { callPhrases } = await import('./calls');
    expect(callPhrases('you see me go, coming out of the black Benz SLR').length).toBeLessThanOrEqual(4);
    expect(callPhrases('キタ drift, drift, drift')).toEqual(['キタ drift,', 'drift, drift']);
  });

  describe('placeCalls', () => {
    const W = 1920;
    const H = 1080;
    const boxOf = (p: { x: number; y: number }, u: { w: number; h: number }) => ({ x0: p.x - u.w / 2, x1: p.x + u.w / 2, y0: p.y - u.h / 2, y1: p.y + u.h / 2 });
    const clear = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a, gap: number) =>
      a.x1 + gap <= b.x0 || b.x1 + gap <= a.x0 || a.y1 + gap <= b.y0 || b.y1 + gap <= a.y0;

    it('sets the call over a horizontal line with a clear gap', async () => {
      const { placeCalls } = await import('./calls');
      const line = { x0: -400, x1: 400, y0: -60, y1: 60 };
      const u = { w: 560, h: 96 };
      const at = placeCalls([u], { line, avoid: [line], W, H })!;
      expect(at[0].y).toBeGreaterThan(line.y1);
      expect(clear(boxOf(at[0], u), line, 28)).toBe(true);
    });

    it('never puts a call on a vertical line that runs the frame height: beside it instead', async () => {
      const { placeCalls } = await import('./calls');
      // 呼吸吐納心自在 as a column from the top of the frame to its foot (psychedelic 雙截棍 c009)
      const line = { x0: -820, x1: -680, y0: -500, y1: 500 };
      const u = { w: 560, h: 96 };
      const at = placeCalls([u], { line, avoid: [line], W, H })!;
      expect(at).toBeDefined();
      expect(clear(boxOf(at[0], u), line, 28)).toBe(true);
      expect(at[0].x - u.w / 2).toBeGreaterThanOrEqual(line.x1 + 28);
    });

    it('keeps clear of every other lyric on screen, not only its own line', async () => {
      const { placeCalls } = await import('./calls');
      const line = { x0: -300, x1: 300, y0: -60, y1: 60 };
      const other = { x0: -500, x1: 500, y0: 100, y1: 260 };
      const u = { w: 400, h: 96 };
      const at = placeCalls([u], { line, avoid: [line, other], W, H })!;
      expect([line, other].every((o) => clear(boxOf(at[0], u), o, 28))).toBe(true);
    });

    it('drops the call when no spot is free, never laying it over glyphs', async () => {
      const { placeCalls } = await import('./calls');
      const full = { x0: -W / 2, x1: W / 2, y0: -H / 2, y1: H / 2 };
      expect(placeCalls([{ w: 300, h: 96 }], { line: full, avoid: [full], W, H })).toBeUndefined();
    });
  });
});
