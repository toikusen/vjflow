// Small reads over the video stage's cuts (scripts/lyric-vj/video-stage.mts), pure so they can be tested.

/** The shots (`shotOf`) on the `n` cuts before cut `i`, nearest first; cuts before the first and cuts with no shot give none. */
export function previousShots<T>(cuts: T[], i: number, shotOf: (c: T) => string | undefined, n = 2): string[] {
  return Array.from({ length: n }, (_, d) => (i - d - 1 >= 0 ? shotOf(cuts[i - d - 1]) : undefined)).filter((x): x is string => !!x);
}

/** How a cut shows a scene panel: in the language's round window beside the words, larger under a blown-up word. */
export type SceneTake = { id: string; mode: 'circle' | 'large' };

/**
 * The scene panel a line's first cut takes, if any. The script names a scene shot for a line because the line names
 * that place (大雪's bridge, its heavy-snow panel), so the panel wins over a prop the binder put there; a line with a
 * blown-up word shows it larger (a small window beside the big word left the frame empty, and leaving the cut without
 * it left 大雪's climax as bare text, 2026-11-17). Each line's panel is shown once, on its
 * first cut (`placed` holds the lines already given theirs).
 */
export function sceneTake(line: { cue: string; shots: string[] } | undefined, frameOf: (id: string) => string | undefined, hasPicture: (id: string) => boolean, blown: boolean, placed: ReadonlySet<string>): SceneTake | undefined {
  if (!line || placed.has(line.cue)) return undefined;
  const id = line.shots.find((x) => frameOf(x) === 'scene' && hasPicture(x));
  return id ? { id, mode: blown ? 'large' : 'circle' } : undefined;
}
