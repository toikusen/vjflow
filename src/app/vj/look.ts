import { SongProfile } from '../audio/song-profile';
import { VJStyle } from './styles/vj-style.interface';
import { EnergyTier, TransitionType } from './vj-project.model';

/** How one song bends a style: palette shift, pacing and grading. Pure data, derived once per project. */
export interface Look {
  /** False = neutral look: scene planning behaves as if no song profile existed. */
  adaptive: boolean;
  arousal: number;
  dynamics: number;
  palettes: Record<EnergyTier, string[][]>;
  speedScale: number;
  densityScale: number;
  sceneLengthScale: number;
  hitThresholdOffset: number;
  /** Deltas for the scene color grade; 0 = unchanged. */
  grade: { saturation: number; contrast: number; brightness: number };
}

/** "Moderate" bounds: the style stays recognizable. */
export const LOOK_LIMITS = {
  maxHueShift: 40,
  coolHue: 220,
  warmHue: 30,
  saturation: [0.7, 1.2] as const,
  lightness: 0.1,
  speed: [0.7, 1.3] as const,
  density: [0.6, 1.4] as const,
  sceneLength: [1.3, 0.7] as const,
  hitOffset: [-0.1, 0.15] as const,
  grade: 0.15,
};

/** How intense each transition feels, on the same 0..1 scale as preset energy and arousal. */
export const TRANSITION_ENERGY: Record<TransitionType, number> = { fade: 0.1, wipe: 0.4, zoom: 0.6, glitch: 0.8, flash: 0.9 };

/** Closeness of an intensity to a target; floored so nothing disappears entirely. */
export const fit = (energy: number, target: number): number => Math.max(0.05, Math.exp(-((energy - target) ** 2) / 0.08));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function deriveLook(profile: SongProfile, style: VJStyle): Look {
  const L = LOOK_LIMITS;
  const { valence, arousal, brightness, pulse } = profile;
  const recolor = (hex: string, index: number) =>
    shiftColor(hex, {
      hueTarget: valence < 0.5 ? L.coolHue : L.warmHue,
      hueAmount: index === 0 ? 0 : Math.abs(valence - 0.5) * 2,
      saturation: index === 0 ? 1 : lerp(L.saturation[0], L.saturation[1], arousal),
      lightness: (brightness - 0.5) * 2 * L.lightness,
    });
  const palettes = Object.fromEntries(
    Object.entries(style.palettes).map(([tier, sets]) => [tier, sets.map((set) => set.map(recolor))]),
  ) as Record<EnergyTier, string[][]>;

  return {
    adaptive: true,
    arousal,
    dynamics: profile.dynamics,
    palettes,
    speedScale: lerp(L.speed[0], L.speed[1], arousal),
    densityScale: lerp(L.density[0], L.density[1], pulse),
    sceneLengthScale: lerp(L.sceneLength[0], L.sceneLength[1], arousal),
    hitThresholdOffset: clamp((0.5 - arousal) * 0.3, L.hitOffset[0], L.hitOffset[1]),
    grade: {
      saturation: (valence - 0.5) * 2 * L.grade,
      contrast: (0.5 - valence) * 2 * L.grade,
      brightness: (brightness - 0.5) * 0.1,
    },
  };
}

/** Today's behaviour: the style exactly as authored. */
export function neutralLook(style: VJStyle): Look {
  return {
    adaptive: false,
    arousal: 0.5,
    dynamics: 0.5,
    palettes: style.palettes,
    speedScale: 1,
    densityScale: 1,
    sceneLengthScale: 1,
    hitThresholdOffset: 0,
    grade: { saturation: 0, contrast: 0, brightness: 0 },
  };
}

/** The one place both scene planning and live rendering read the "strong hit" threshold from. */
export const effectiveHitThreshold = (style: VJStyle, look: Look): number => style.mapping.hitThreshold + look.hitThresholdOffset;

interface ColorShift {
  hueTarget: number;
  /** 0..1 of the way towards the target, capped at maxHueShift degrees. */
  hueAmount: number;
  saturation: number;
  lightness: number;
}

// ponytail: HSL hue rotation is perceptually uneven; switch to OKLCH if shifted palettes look off.
export function shiftColor(hex: string, { hueTarget, hueAmount, saturation, lightness }: ColorShift): string {
  const [h, s, l] = hexToHsl(hex);
  const diff = ((hueTarget - h + 540) % 360) - 180;
  const shift = Math.sign(diff) * Math.min(Math.abs(diff), LOOK_LIMITS.maxHueShift) * hueAmount;
  return hslToHex((h + shift + 360) % 360, clamp(s * saturation, 0, 1), clamp(l + lightness, 0, 1));
}

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
