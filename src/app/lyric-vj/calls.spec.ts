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
});
