import { camTime, DOC_KINDS, drawKinetic, fitInRoom, freeBand, KINETIC_CAMS, GROUNDS, KINETIC_FX, KineticLayer, oppositeSide, THREAD_MARKS } from './kinetic';
import { capEach, capRound, drawMove, Env, FLOWS, MORE, reading, ROUND_FX, turnFor } from './kinetic-more';

describe('kinetic cuts', () => {
  const stub = (calls: string[]) =>
    new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...args: unknown[]) => calls.push(String(k)) && args && undefined),
      set: () => true,
    });

  it('draws every move on the paper, and the character when there is one', () => {
    for (const fx of KINETIC_FX) {
      const calls: string[] = [];
      const pic = { width: 200, height: 400 } as unknown as CanvasImageSource;
      const l: KineticLayer = { kind: 'kinetic', fx, words: ['君', '夕焼け'], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', sprite: 'me.side_bike' };
      drawKinetic(stub(calls), l, 0.5, { pulse: 0.5 }, (id) => (id === 'spr:me.side_bike' ? pic : undefined));
      expect([fx, calls[0]]).toEqual([fx, 'save']);
      expect(calls.includes('fillRect') && calls.includes('drawImage') ? fx : `${fx} missing`).toBe(fx);
    }
  });

  it('keeps every move to a tenth of the song, the rest taking the shot\'s other moves', () => {
    const others = ['wall', 'stars', 'motes', 'tunnel', 'ring', 'bars', 'stack', 'split', 'dots', 'boxes'];
    const fx = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'rays' : others[(i / 2) % others.length]));
    const shot = fx.map((_, i) => `s${Math.floor(i / 10)}`);
    const out = capEach(fx, shot);
    expect(out.filter((f) => f === 'rays').length).toBe(6);
    expect(out.every((f, i) => i === 0 || f !== out[i - 1] || f !== 'rays')).toBe(true);
  });

  it('keeps round moves to a share of the song, swapping the rest for the shot\'s own other moves', () => {
    const fx = Array.from({ length: 50 }, (_, i) => (i % 2 ? 'spectrum' : i % 4 ? 'wall' : 'rays'));
    const shot = fx.map((_, i) => `s${Math.floor(i / 10)}`);
    const out = capRound(fx, shot);
    expect(out.filter((f) => ROUND_FX.has(f)).length).toBe(6);
    expect(out.slice(0, 12)).toEqual(fx.slice(0, 12));
    expect(out.every((f) => ['spectrum', 'wall', 'rays'].includes(f))).toBe(true);
  });

  it('turns a move to run each way it can, its text back to reading, and leaves the context as it found it', () => {
    const calls: string[] = [];
    const ctx = stub(calls);
    const env = (style = 0): Env => ({ ctx, age: 0.6, k: 1, pulse: 0.5, since: 0.1, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322', word: () => '詞', txt: () => undefined, cx: 400, seed: 3, W: 1920, H: 1080, style });
    for (const [fx, m] of Object.entries(MORE).filter(([, m]) => m.flows || m.styles))
      for (const flow of [undefined, ...FLOWS])
        for (let style = 0; style < (m.styles?.length ?? 1); style++) expect(() => drawMove(m, env(style), flow), `${fx} ${flow} ${style}`).not.toThrow();
    expect(Object.prototype.hasOwnProperty.call(ctx, 'fillText')).toBe(false);
    expect([turnFor('ltr', 'rtl'), turnFor('btt', 'ttb'), turnFor('ltr', 'ttb'), turnFor('ltr', 'ltr')]).toEqual(['mx', 'my', 'cw', undefined]);
  });

  it('prints every kind of document label and every paper', () => {
    for (const kind of DOC_KINDS)
      for (const ground of GROUNDS) {
        const calls: string[] = [];
        const l: KineticLayer = { kind: 'kinetic', fx: 'wall', words: ['詞'], ink: '#111111', paper: '#eeeeee', accent: '#dd3322', ground, meta: { kind, fig: 'FIG.01', n: 12, total: 80 } };
        drawKinetic(stub(calls), l, 0.5, { pulse: 0 }, () => undefined);
        expect(calls.filter((c) => c === 'fillText').length, `${kind} ${ground}`).toBeGreaterThan(1);
      }
  });

  it('stands the character on the other side from where the lyric over the cut actually sits', () => {
    const left = { from: 0, to: 4, x0: 100, x1: 800 };
    expect(oppositeSide([left], 1, 3)).toBe('right');
    expect(oppositeSide([{ from: 0, to: 4, x0: 1200, x1: 1800 }], 1, 3)).toBe('left');
    expect(oppositeSide([{ from: 0, to: 4, x0: 500, x1: 1420 }], 1, 3)).toBeUndefined();
    expect(oppositeSide([left], 5, 6)).toBeUndefined();
  });

  it('reads numbers from the song or the director, never one fixed value', () => {
    expect(reading('+3 cm', '141 cm', 0.5)).toBe('+2 cm');
    expect(reading(undefined, '141 cm', 1)).toBe('141 cm');
    expect(reading('1.5 m', 'x', 1)).toBe('1.5 m');
    const said: string[] = [];
    const ctx = stub([]);
    const env: Env = { ctx, age: 0, k: 1, pulse: 0, since: 0, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322', word: () => '詞', txt: (x) => void said.push(x), cx: 400, seed: 3, W: 1920, H: 1080, style: 0, at: 61, len: 196 };
    MORE['progress'].draw(env);
    expect(said).toContain('1:01');
    expect(said).toContain('-2:15');
  });
});

describe('the song\'s thread', () => {
  it('draws every mark in the corner, eased from the level before', () => {
    for (const mark of THREAD_MARKS) {
      const calls: string[] = [];
      const ctx = new Proxy({} as CanvasRenderingContext2D, {
        get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...a: unknown[]) => calls.push(String(k)) && a && undefined),
        set: () => true,
      });
      drawKinetic(ctx, { kind: 'kinetic', fx: 'motes', words: [], ink: '#111111', paper: '#eeeeee', accent: '#dd3322', thread: { mark, level: 0.8, from: 0.2 } }, 0.3, { pulse: 0 }, () => undefined);
      expect([mark, calls.includes('fill') || calls.includes('stroke')]).toEqual([mark, true]);
    }
  });

  it('plans the floor: the character fits in the room the lyric leaves on its side', () => {
    const lines = [{ from: 0, to: 2, x0: 200, x1: 900 }, { from: 2, to: 4, x0: 300, x1: 1000 }];
    expect(freeBand(lines, 0, 4, 'right')).toEqual([1040, 1920]);
    expect(freeBand(lines, 0, 4, 'left')).toBeUndefined();
    expect(freeBand(lines, 5, 6, 'right')).toBeUndefined();
    // a close-up 1400 px wide shrinks to the 880 px room less its padding and stands inside it
    const { s, x } = fitInRoom([1040, 1920], 1400, 1498);
    expect(s).toBeCloseTo(832 / 1400);
    expect(x - (1400 * s) / 2).toBeGreaterThanOrEqual(1040 + 24 - 1e-6);
    expect(fitInRoom([1040, 1920], 300, 1498)).toEqual({ s: 1, x: 1498 });
  });

  const stub = (calls: string[]) =>
    new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : (...args: unknown[]) => calls.push(String(k)) && args && undefined),
      set: () => true,
    });

  it('plays the cut in its camera\'s time: a ramp rushes then slows, a freeze stops once landed, the rest run as is', () => {
    expect(camTime('ramp', 0.25)).toBeCloseTo(0.6);
    expect(camTime('ramp', 2) - camTime('ramp', 1)).toBeCloseTo(0.45);
    expect(camTime('freeze', 3)).toBe(0.6);
    expect(camTime('pan', 3)).toBe(3);
  });

  it('draws every camera move over a move and a character without throwing', () => {
    const calls: string[] = [];
    const pic = { width: 100, height: 200 } as unknown as CanvasImageSource;
    for (const cam of KINETIC_CAMS)
      for (const age of [0, 0.5, 3]) {
        const l: KineticLayer = { kind: 'kinetic', fx: 'wall', words: ['雪'], ink: '#26489E', paper: '#F5EFE4', accent: '#FF6B2C', sprite: 'x', cam, song: 3 };
        expect(() => drawKinetic(stub(calls), l, age, { pulse: 0 }, () => pic)).not.toThrow();
      }
  });

  it('flies a character along its path only when there is one', () => {
    const calls: string[] = [];
    const e = { ctx: stub(calls), age: 1, k: 1, pulse: 0, since: 0, bpm: 120, ink: '#111111', paper: '#eeeeee', accent: '#dd3322', word: () => '雪', txt: () => undefined, cx: 960, seed: 1, W: 1920, H: 1080, style: 0, song: 5 } as unknown as Env;
    expect(MORE['glide'].draw(e)).toBe(false);
    expect(MORE['glide'].draw({ ...e, art: { img: {} as CanvasImageSource, w: 300, h: 300, y: 500 } })).toBe(true);
  });
  it('blurs a rack focus once, after the move is drawn, never as a filter on every primitive', () => {
    // a filter set while a dot field draws blurred every dot on its own and lost the WebGL context (終わりじゃない, 2026-10-30)
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 100 }) : (...args: unknown[]) => calls.push(String(k)) && args),
      set: (_, k, v) => (calls.push(`${String(k)}=${String(v)}`), true),
    });
    const l: KineticLayer = { kind: 'kinetic', fx: 'dots', words: ['詞'], ink: '#111111', paper: '#eeeeee', accent: '#dd3322', cam: 'rack' };
    drawKinetic(ctx, l, 0.1, { pulse: 0 }, () => undefined);
    const blurs = calls.map((c, i) => [c, i] as const).filter(([c]) => /^filter=blur/.test(c));
    expect(blurs.length).toBe(1);
    expect(blurs[0][1]).toBeGreaterThan(calls.lastIndexOf('arc'));
    expect(calls[blurs[0][1] + 1]).toBe('drawImage');
  });

});

