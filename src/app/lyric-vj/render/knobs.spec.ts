import { drawKinetic, KINETIC_FX, KineticLayer } from './kinetic';
import { Env, kn, MORE } from './kinetic-more';
import { KNOBS } from './knobs';

describe('move knobs', () => {
  const stub = () =>
    new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : () => undefined),
      set: () => true,
    });

  it('gives every move something that changes from song to song, each in a sane range', () => {
    const moves = new Set(Object.keys(KNOBS).map((k) => k.split('.')[0]));
    expect(KINETIC_FX.filter((f) => !moves.has(f))).toEqual([]);
    for (const [key, [what, lo, hi]] of Object.entries(KNOBS)) expect([key, !!what, lo < hi]).toEqual([key, true, true]);
  });

  it('keeps a song\'s value all song long and gives other songs others, within the range', () => {
    for (const [key, [, lo, hi, int]] of Object.entries(KNOBS)) {
      const vals = Array.from({ length: 12 }, (_, s) => kn({ song: s * 7919 + 13 }, key));
      expect(vals.every((v) => v >= lo - 0.5 && v <= hi + 0.5 && (!int || Number.isInteger(v)))).toBe(true);
      expect(new Set(vals).size).toBeGreaterThan(1);
      expect(kn({ song: 42 }, key)).toBe(kn({ song: 42 }, key));
    }
  });

  it('draws every move in any song\'s arrangement', () => {
    for (const song of [1, 99991, -123456])
      for (const fx of KINETIC_FX) {
        const l: KineticLayer = { kind: 'kinetic', fx, words: ['君', '夕焼け'], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', song };
        expect(() => drawKinetic(stub(), l, 0.7, { pulse: 0.5 }, () => undefined)).not.toThrow();
      }
  });

  const env = (song: number, calls: [string, unknown[]][], words: string[]): Env => ({
    ctx: new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...a: unknown[]) => void calls.push([String(k), a])),
      set: () => true,
    }),
    age: 5, k: 1, pulse: 0, since: 0, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322',
    word: (i: number) => words[i % words.length], txt: (s: string, x: number, y: number) => void calls.push(['txt', [s, x, y]]), cx: 1500, seed: 3, W: 1920, H: 1080, style: 0, song,
  });

  it('keeps every meteor and the word at its end inside the frame, whatever the song\'s shower', () => {
    for (let s = 0; s < 40; s++) {
      const calls: [string, unknown[]][] = [];
      MORE['meteor'].draw(env(s * 7919 + 1, calls, ['夢見る星']));
      const xs = calls.filter(([k]) => k === 'txt').map(([, a]) => a[1] as number);
      expect(xs.length).toBeGreaterThan(1);
      expect(xs.every((x) => x - 150 >= 0 && x + 150 <= 1920)).toBe(true);
    }
  });

  it('hangs one lamp for each beam', () => {
    for (let s = 0; s < 20; s++) {
      const calls: [string, unknown[]][] = [];
      const e = env(s * 104729 + 5, calls, ['光']);
      MORE['beams'].draw(e);
      expect(calls.filter(([k]) => k === 'roundRect').length).toBe(kn(e, 'beams.n'));
    }
  });

  it('leans speeds and counts with the song\'s mood: calm songs slower and sparser', () => {
    const mean = (mood: number, key: string) => Array.from({ length: 30 }, (_, s) => kn({ song: s * 31337 + 7, mood }, key)).reduce((a, b) => a + b) / 30;
    expect(mean(1, 'meteor.n')).toBeGreaterThan(mean(0, 'meteor.n'));
    expect(mean(1, 'meteor.dur')).toBeLessThan(mean(0, 'meteor.dur'));
  });

  it('draws ridges as hidden lines with no paper laid over the backdrop', () => {
    const calls: [string, unknown[]][] = [];
    MORE['ridges'].draw(env(77, calls, ['雪']));
    expect(calls.some(([k]) => k === 'fill' || k === 'fillRect')).toBe(false);
    expect(calls.filter(([k]) => k === 'stroke').length).toBe(kn(env(77, [], ['雪']), 'ridges.n'));
  });

  it('keeps a split panel\'s word an outline where the lyric sits, solid in the room it leaves', () => {
    const outlined = (room?: [number, number]) => {
      const words: unknown[][] = [];
      const e = { ...env(5, [], ['大雪', '石橋', '楓葉']), room, txt: (...a: unknown[]) => void words.push(a) };
      MORE['panels'].draw(e as Env);
      return words.map((w) => !!w[6]);
    };
    expect(outlined().every((o) => !o)).toBe(true);
    expect(outlined([0, 0]).every((o) => o)).toBe(true);
    expect(outlined([1300, 1920]).at(-1)).toBe(false);
  });
});
