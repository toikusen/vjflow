import { mapRange, splitCalls } from './calls';

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
});
