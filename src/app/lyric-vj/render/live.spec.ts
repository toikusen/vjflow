import { describe, expect, it } from 'vitest';
import { LyricVjEngine } from './engine';
import { LivePlayer, tooSlow } from './live';

describe('tooSlow', () => {
  const frames = (ms: number, n = 60) => Array.from({ length: n }, () => ms);
  it('steps down only on a full window of slow frames', () => {
    expect(tooSlow(frames(50), 0)).toBe(true);
    expect(tooSlow(frames(50, 10), 0)).toBe(false);
    expect(tooSlow(frames(17), 0)).toBe(false);
  });
  it('ignores one hitch', () => {
    expect(tooSlow([...frames(17, 19), 200], 0)).toBe(false);
  });
  it('has nowhere to go from the lowest quality', () => {
    expect(tooSlow(frames(90), 2)).toBe(false);
  });
});

describe('the preview remembers which ink reads on a cut', () => {
  const section = { start: 0, layers: [] };
  const engineAt = (read: () => boolean, lit: number) => Object.assign(Object.create(LyricVjEngine.prototype), { job: { treatment: { graphics: { sections: [section] } } }, preview: true, previewLit: new Map(), lit: { t: lit, by: new Map() }, readGround: read });
  const groundLight = (e: unknown, t: number): boolean => (LyricVjEngine.prototype as unknown as { groundLight(this: unknown, id: string, t: number, inks: [string, string]): boolean }).groundLight.call(e, 'c1', t, ['#000', '#fff']);

  it('never keeps a read of the frame before: a seek would hold that ink through the cut', () => {
    const reads = [false, true];
    const e = engineAt(() => reads.shift()!, Number.NaN);
    expect(groundLight(e, 5)).toBe(false); // type laid out before the ground is drawn: the canvas is the last frame
    e.lit = { t: 5, by: new Map() }; // the veil: this frame's ground is on the canvas
    expect(groundLight(e, 5)).toBe(true);
    expect(reads).toEqual([]);
  });
  it('reads a frame\'s own ground once a part of a cut', () => {
    let reads = 0;
    const e = engineAt(() => (++reads, true), 5);
    groundLight(e, 5);
    e.lit = { t: 5.01, by: new Map() };
    groundLight(e, 5.01);
    expect(reads).toBe(1);
  });
});

describe('the frame a waiting song shows', () => {
  const player = (playing: boolean) => Object.assign(Object.create(LivePlayer.prototype), { poster: 12, silent: { at: 0, t: 0, playing } });
  const shownAt = (p: unknown, t: number): number => (LivePlayer.prototype as unknown as { shownAt(this: unknown, t: number): number }).shownAt.call(p, t);
  it('is the first line while the song has not started', () => {
    expect(shownAt(player(false), 0)).toBe(12);
  });
  it('is the song itself once it is played or moved', () => {
    expect(shownAt(player(true), 0)).toBe(0);
    expect(shownAt(player(false), 3)).toBe(3);
  });
});
