import { parseLyrics } from './lyric-parser.service';

describe('parseLyrics', () => {
  it('parses LRC timestamps, skips metadata and caps cue length', () => {
    const r = parseLyrics('[ar:Someone]\n[00:12.50]Hello\n[00:15.00][00:40.00]Again\n\n[00:20]World', 60);
    expect(r.timing).toBe('timestamped');
    expect(r.cues.map((c) => [c.start, c.text])).toEqual([
      [12.5, 'Hello'],
      [15, 'Again'],
      [20, 'World'],
      [40, 'Again'],
    ]);
    expect(r.cues[0].end).toBe(15);
    expect(r.cues[2].end).toBe(28);
  });

  it('spreads plain text evenly as provisional timing', () => {
    const r = parseLyrics('one\n  \ntwo\nthree\nfour', 40);
    expect(r.timing).toBe('provisional');
    expect(r.cues.map((c) => [c.start, c.end])).toEqual([[0, 10], [10, 20], [20, 30], [30, 40]]);
  });
});
