import { exitAfterSung, SUNG_TAIL } from './sung-tail';

describe('exitAfterSung', () => {
  it('holds a line that would leave on its last sung character until the tail has passed', () => {
    expect(exitAfterSung(22.22, 22.34, 30)).toBeCloseTo(22.34 + SUNG_TAIL, 5);
  });
  it('leaves an exit alone that already starts after the tail', () => {
    expect(exitAfterSung(23.5, 22.34, 30)).toBe(23.5);
  });
  it('never runs into the next line: the latest clearing exit caps the tail', () => {
    expect(exitAfterSung(22.22, 22.34, 22.4)).toBeCloseTo(22.4, 5);
  });
  it('keeps the planned exit when the next line is already closer than it', () => {
    expect(exitAfterSung(22.22, 22.34, 22.0)).toBe(22.22);
  });
  it('a line with no sung times keeps its exit', () => {
    expect(exitAfterSung(22.22, undefined, 30)).toBe(22.22);
  });
});
