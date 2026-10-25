import { LED_IDLE, ledCallLayout } from './kit';

describe('ledCallLayout', () => {
  it('sets each call of a burst after the one before it, never on top of it', () => {
    const lay = ledCallLayout([30, 20, 40], [10, 10.3, 10.5], 10.6, 200, 16)!;
    expect(lay.items.map((x) => x.x)).toEqual([16, 62, 98]);
    expect(lay.shift).toBe(0);
  });

  it('slides the row left when a new call would run past the edge', () => {
    const lay = ledCallLayout([80, 80], [10, 10.5], 11, 150, 10)!;
    // second call ends at 10 + 80 + 10 + 80 + 10 = 190: 40 dots past the edge
    expect(lay.shift).toBeCloseTo(40);
  });

  it('starts a new burst afresh and goes idle after a quiet stretch', () => {
    expect(ledCallLayout([30], [10], 9, 200, 16)).toBeUndefined();
    expect(ledCallLayout([30], [10], 10 + LED_IDLE + 0.1, 200, 16)).toBeUndefined();
    const lay = ledCallLayout([30, 20], [10, 20], 20.2, 200, 16)!;
    expect(lay.items).toEqual([{ i: 1, x: 16, age: 20.2 - 20 }]);
  });
});
