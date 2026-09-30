import { AudioAnalysis } from './audio-analysis.model';
import { beatIndexAt, getFeaturesAt } from './audio-features';

const analysis: AudioAnalysis = {
  duration: 1,
  frameInterval: 0.5,
  frames: [
    { time: 0, energy: 0, bass: 0, mid: 0, treble: 0, spectralFlux: 0 },
    { time: 0.5, energy: 1, bass: 0.5, mid: 0, treble: 1, spectralFlux: 1 },
  ],
  beats: [0.1, 0.6],
  tempo: 120,
  summary: { chroma: new Array(12).fill(0), centroidHz: 0 },
  sections: [],
};

describe('getFeaturesAt', () => {
  it('interpolates between frames and clamps at the ends', () => {
    expect(getFeaturesAt(analysis, 0.25).energy).toBeCloseTo(0.5);
    expect(getFeaturesAt(analysis, 0.25).bass).toBeCloseTo(0.25);
    expect(getFeaturesAt(analysis, -1).energy).toBe(0);
    expect(getFeaturesAt(analysis, 9).energy).toBe(1);
  });

  it('reuses the out object', () => {
    const out = getFeaturesAt(analysis, 0);
    expect(getFeaturesAt(analysis, 0.5, out)).toBe(out);
  });
});

describe('beatIndexAt', () => {
  it('returns the last beat at or before time', () => {
    expect(beatIndexAt(analysis.beats, 0)).toBe(-1);
    expect(beatIndexAt(analysis.beats, 0.1)).toBe(0);
    expect(beatIndexAt(analysis.beats, 0.7)).toBe(1);
  });
});
