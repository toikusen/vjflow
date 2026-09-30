export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export const CENTER_X = STAGE_WIDTH / 2;
export const CENTER_Y = STAGE_HEIGHT / 2;

/** Smoothed audio-reactive values handed to every layer each frame. One instance is reused. */
export interface FrameContext {
  time: number;
  dt: number;
  /** Seconds since the layer's scene started, and 0..1 progress through it. */
  sceneTime: number;
  sceneProgress: number;
  intensity: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  /** 1 right on a beat, decaying towards 0 until the next one. */
  beatPulse: number;
  beatIndex: number;
  /** True only on the frame a new beat is crossed. */
  beat: boolean;
  /** Onset strength (0..1) when the crossed beat is a strong hit, else 0. */
  hit: number;
}

export const createFrameContext = (): FrameContext => ({
  time: 0, dt: 0, sceneTime: 0, sceneProgress: 0, intensity: 0.5,
  energy: 0, bass: 0, mid: 0, treble: 0, beatPulse: 0, beatIndex: -1, beat: false, hit: 0,
});

/**
 * Attack/decay follower: rises with `attack` and falls with `decay` time constants,
 * so a jump 0.2 → 0.9 becomes 0.2, 0.35, 0.55, 0.72 … instead of a hard step.
 */
export class Envelope {
  value = 0;

  constructor(private readonly attack: number, private readonly decay: number) {}

  update(target: number, dt: number): number {
    const tau = target > this.value ? this.attack : this.decay;
    this.value += (target - this.value) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
    return this.value;
  }

  reset(value = 0): void {
    this.value = value;
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
