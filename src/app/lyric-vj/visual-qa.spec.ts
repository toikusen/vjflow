import { describe, expect, it } from 'vitest';
import { frameStats, visualIssues } from './visual-qa';

const frame = (fill: (i: number) => [number, number, number], n = 192 * 108) =>
  Uint8Array.from({ length: n * 4 }, (_, k) => (k % 4 === 3 ? 255 : fill(k >> 2)[k % 4]));

describe('visual QA', () => {
  it('measures a flat frame as blank and a busy one as fine', () => {
    const flat = frameStats(1, frame(() => [240, 235, 225]));
    expect(flat.std).toBeLessThan(1);
    expect(visualIssues([flat])[0]).toMatch(/單色/);
    const busy = frameStats(2, frame((i) => (i % 7 < 3 ? [20, 40, 120] : [230, 220, 200])));
    expect(visualIssues([busy])).toEqual([]);
  });

  it('finds a dark hole on a light look, not lyric strokes', () => {
    const w = 192;
    // a light page with a solid dark square (a mask or an unpainted hole) in the top-left 48×40 px
    const hole = frameStats(3, frame((i) => ((i % w) < 48 && i / w < 40 ? [30, 25, 25] : [235, 225, 210])));
    expect(visualIssues([hole]).join()).toMatch(/純黑/);
    // thin dark strokes everywhere (type): 1 px lines every 4 px never darken a whole block
    const type = frameStats(4, frame((i) => (i % 4 === 0 ? [20, 20, 20] : [235, 225, 210])));
    expect(visualIssues([type])).toEqual([]);
  });

  it('samples choruses, drops and the longest lines besides the even spread', async () => {
    const { sampleTimes } = await import('./visual-qa');
    const song = { sections: [{ start: 0, type: 'intro' }, { start: 41, type: 'chorus' }], cues: [{ start: 70, end: 74, text: 'a much longer lyric line' }, { start: 5, end: 6, text: 'hi' }] };
    const ts = sampleTimes(160, song, [{ kind: 'drop', at: 121 }]);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    for (const want of [42.5, 72, 121.4]) expect(ts.some((t) => Math.abs(t - want) < 2)).toBe(true);
    expect(ts.every((t, i) => i === 0 || t - ts[i - 1] >= 2)).toBe(true);
  });

  it('keeps every event even when the budget is tight', async () => {
    const { sampleTimes } = await import('./visual-qa');
    const cues = Array.from({ length: 20 }, (_, i) => ({ start: i * 9, end: i * 9 + 2, text: i === 13 ? 'the very longest line of them all' : 'line' }));
    const ts = sampleTimes(180, { cues }, [{ kind: 'drop', at: 100.7 }, { kind: 'finale', at: 160.2 }], 4);
    expect(ts).toHaveLength(4);
    for (const want of [101.1, 160.6, 118]) expect(ts.some((t) => Math.abs(t - want) < 0.01)).toBe(true);
  });
});
