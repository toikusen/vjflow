// A sprite clip's own clock: which frame a cut-out plays at song time t. The clock starts at `start` and runs on
// regardless of the cuts drawn under the sprite (the subject keeps moving while the background, layout and text cut
// on the beat); past its last frame the clip holds it, or loops when it is a loopable motion.

export interface SpriteClock { count: number; fps: number; start: number; loop: boolean }

/** The frame index at song time t: 0 before the clock starts, the last frame held after the end, modulo when looping. */
export function clipFrame(c: SpriteClock, t: number): number {
  if (c.count <= 0) return 0;
  const f = Math.floor(Math.max(0, t - c.start) * c.fps);
  return c.loop ? f % c.count : Math.min(c.count - 1, f);
}
