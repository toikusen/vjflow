import { SongProfile } from '../audio/song-profile';
import { deriveLook, effectiveHitThreshold, fit, hexToHsl, hslToHex, neutralLook, TRANSITION_ENERGY } from './look';
import { EDM_STYLE } from './styles/edm.style';

const profile = (overrides: Partial<SongProfile> = {}): SongProfile => ({
  valence: 0.5, arousal: 0.5, brightness: 0.5, pulse: 0.5, dynamics: 0.5, mode: 'major', modeConfidence: 0, tempo: 120, ...overrides,
});

const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('HSL conversion', () => {
  it('round-trips hex colors', () => {
    for (const hex of ['#ff006e', '#00f0ff', '#070012', '#ffffff', '#000000']) {
      expect(hslToHex(...hexToHsl(hex))).toBe(hex);
    }
  });
});

describe('deriveLook', () => {
  it('shifts hues by at most 40° and never the background hue', () => {
    const sad = deriveLook(profile({ valence: 0 }), EDM_STYLE);
    for (const tier of ['low', 'mid', 'high'] as const) {
      EDM_STYLE.palettes[tier].forEach((set, i) =>
        set.forEach((hex, j) => {
          const [h0, s0] = hexToHsl(hex);
          const [h1] = hexToHsl(sad.palettes[tier][i][j]);
          if (j === 0 && s0 > 0) expect(hueDistance(h0, h1)).toBeLessThan(1);
          if (s0 > 0.05) expect(hueDistance(h0, h1)).toBeLessThanOrEqual(40.5);
        }),
      );
    }
  });

  it('keeps colors unchanged for a perfectly neutral song', () => {
    const look = deriveLook(profile({ arousal: 0.6 }), EDM_STYLE);
    const [h0] = hexToHsl(EDM_STYLE.palettes.mid[0][1]);
    const [h1] = hexToHsl(look.palettes.mid[0][1]);
    expect(hueDistance(h0, h1)).toBeLessThan(1);
  });

  it('prefers fade when calm and flash when intense', () => {
    const calm = deriveLook(profile({ arousal: 0.1 }), EDM_STYLE);
    const hype = deriveLook(profile({ arousal: 0.95 }), EDM_STYLE);
    expect(fit(TRANSITION_ENERGY.fade, calm.arousal)).toBeGreaterThan(fit(TRANSITION_ENERGY.flash, calm.arousal));
    expect(fit(TRANSITION_ENERGY.flash, hype.arousal)).toBeGreaterThan(fit(TRANSITION_ENERGY.fade, hype.arousal));
  });

  it('raises the hit threshold for calm songs and bounds every scale', () => {
    const calm = deriveLook(profile({ arousal: 0 }), EDM_STYLE);
    const hype = deriveLook(profile({ arousal: 1, pulse: 1 }), EDM_STYLE);
    expect(effectiveHitThreshold(EDM_STYLE, calm)).toBeGreaterThan(EDM_STYLE.mapping.hitThreshold);
    expect(effectiveHitThreshold(EDM_STYLE, hype)).toBeGreaterThanOrEqual(EDM_STYLE.mapping.hitThreshold - 0.1);
    expect(calm.speedScale).toBeCloseTo(0.7);
    expect(hype.speedScale).toBeCloseTo(1.3);
    expect(hype.densityScale).toBeCloseTo(1.4);
    expect(calm.sceneLengthScale).toBeCloseTo(1.3);
  });

  it('is deterministic', () => {
    expect(deriveLook(profile({ valence: 0.2 }), EDM_STYLE)).toEqual(deriveLook(profile({ valence: 0.2 }), EDM_STYLE));
  });
});

describe('neutralLook', () => {
  it('leaves the style untouched', () => {
    const look = neutralLook(EDM_STYLE);
    expect(look.palettes).toBe(EDM_STYLE.palettes);
    expect(effectiveHitThreshold(EDM_STYLE, look)).toBe(EDM_STYLE.mapping.hitThreshold);
  });
});
