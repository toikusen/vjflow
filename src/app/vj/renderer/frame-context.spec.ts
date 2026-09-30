import { Envelope } from './frame-context';

describe('Envelope', () => {
  it('approaches the target gradually and decays slower than it attacks', () => {
    const env = new Envelope(0.05, 0.3);
    env.reset(0.2);
    const rise = [1, 2, 3, 4].map(() => env.update(0.9, 1 / 60));
    rise.reduce((prev, v) => (expect(v).toBeGreaterThan(prev), v), 0.2);
    expect(rise[0]).toBeLessThan(0.5);
    const up = env.value;
    env.update(0, 1 / 60);
    expect(up - env.value).toBeLessThan(rise[0] - 0.2);
  });
});
