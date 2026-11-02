import { describe, expect, it } from 'vitest';
import { loadPick, paidLine, readProblem, savePick, songAudioUrl, songTimingUrl, timingCallout } from './song-flow';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('song flow', () => {
  it('reads the song only from what the server already serves', () => {
    expect(songAudioUrl('s1')).toBe('/beta/songs/s1/audio/mix');
    expect(songTimingUrl('s1')).toBe('/beta/songs/s1/timing');
  });
  it('remembers the style and version per song', () => {
    const store = memory();
    savePick('a', { styleId: 'silk', seed: 3 }, store);
    expect(loadPick('a', store)).toEqual({ styleId: 'silk', seed: 3 });
    expect(loadPick('b', store)).toBeUndefined();
  });
  it('a pick with no version yet stays without one', () => {
    const store = memory();
    savePick('a', { styleId: '' }, store);
    expect(loadPick('a', store)).toEqual({ styleId: '' });
  });
  it('takes nothing it cannot read from storage', () => {
    expect(loadPick('a', { getItem: () => 'not json' })).toBeUndefined();
    expect(loadPick('a', { getItem: () => '{"seed":2}' })).toBeUndefined();
    expect(loadPick('a', { getItem: () => { throw new Error('off'); } })).toBeUndefined();
  });
  it('a store that refuses does not stop the page', () => {
    expect(() => savePick('a', { styleId: 'silk' }, { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
  it('says what is wrong in the person\'s words', () => {
    expect(readProblem(401)).toContain('登入');
    expect(readProblem(409)).toContain('準備');
    expect(readProblem(500)).toContain('500');
  });
  it('promises free video only to the owner', () => {
    expect(timingCallout(true)).toContain('免費');
    expect(timingCallout(false)).not.toContain('免費');
  });
  it('puts a waiting paid concept before the sales line', () => {
    expect(paidLine(0)).toContain('付費');
    expect(paidLine(2)).toContain('2 個');
  });
});
