// Small reads over the video stage's cuts (scripts/lyric-vj/video-stage.mts), pure so they can be tested.

/** The shots (`shotOf`) on the `n` cuts before cut `i`, nearest first; cuts before the first and cuts with no shot give none. */
export function previousShots<T>(cuts: T[], i: number, shotOf: (c: T) => string | undefined, n = 2): string[] {
  return Array.from({ length: n }, (_, d) => (i - d - 1 >= 0 ? shotOf(cuts[i - d - 1]) : undefined)).filter((x): x is string => !!x);
}
