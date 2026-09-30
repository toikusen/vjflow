/**
 * Smooths a coarse media clock (HTMLMediaElement.currentTime can update in steps)
 * by extrapolating with wall time between updates, snapping back when drift exceeds `maxDrift`.
 */
export class MediaClock {
  private anchorMedia = -1;
  private anchorWall = 0;
  private last = 0;

  constructor(private readonly maxDrift = 0.08) {}

  read(mediaTime: number, wallMs: number, playing: boolean, rate = 1): number {
    if (!playing) return this.sync(mediaTime, wallMs);
    if (mediaTime !== this.anchorMedia) {
      this.anchorMedia = mediaTime;
      this.anchorWall = wallMs;
    }
    const estimate = this.anchorMedia + ((wallMs - this.anchorWall) / 1000) * rate;
    const t = Math.abs(estimate - mediaTime) > this.maxDrift ? mediaTime : Math.max(this.last, estimate);
    // Never run backwards unless the media itself jumped back (seek).
    this.last = mediaTime < this.last - this.maxDrift ? mediaTime : t;
    return this.last;
  }

  private sync(mediaTime: number, wallMs: number): number {
    this.anchorMedia = mediaTime;
    this.anchorWall = wallMs;
    this.last = mediaTime;
    return mediaTime;
  }
}
