import { AudioAnalysis } from './audio-analysis.model';
import { computeSongProfile, detectMode } from './song-profile';

/** Chroma of a triad whose root is weighted like a bass note. */
function triad(root: number, third: number): number[] {
  const c = new Array(12).fill(0.05);
  c[root % 12] = 1;
  c[(root + third) % 12] = 0.7;
  c[(root + 7) % 12] = 0.8;
  return c;
}

function analysis(overrides: Partial<AudioAnalysis> = {}): AudioAnalysis {
  const duration = 60;
  const frameInterval = 0.05;
  const frames = Array.from({ length: duration / frameInterval }, (_, i) => ({
    time: i * frameInterval, energy: 0.5, bass: 0.5, mid: 0.5, treble: 0.5, spectralFlux: i % 10 === 0 ? 0.9 : 0.1,
  }));
  const beats = Array.from({ length: duration * 2 }, (_, i) => i * 0.5);
  return {
    duration, frameInterval, frames, beats, tempo: 120,
    sections: [{ start: 0, end: 30, energy: 0.3 }, { start: 30, end: 60, energy: 0.8 }],
    summary: { chroma: triad(0, 4), centroidHz: 1500 },
    ...overrides,
  };
}

describe('detectMode', () => {
  it('hears a C major triad as major and an A minor triad as minor', () => {
    expect(detectMode(triad(0, 4)).mode).toBe('major');
    expect(detectMode(triad(9, 3)).mode).toBe('minor');
    expect(detectMode(triad(9, 3)).modeConfidence).toBeGreaterThan(0);
  });

  it('has zero confidence without harmonic content', () => {
    expect(detectMode(new Array(12).fill(0))).toEqual({ mode: 'major', modeConfidence: 0 });
  });
});

describe('computeSongProfile', () => {
  it('rates faster songs as more intense', () => {
    expect(computeSongProfile(analysis({ tempo: 160 })).arousal).toBeGreaterThan(computeSongProfile(analysis({ tempo: 80 })).arousal);
  });

  it('rates minor, dark songs lower in valence', () => {
    const happy = computeSongProfile(analysis());
    const sad = computeSongProfile(analysis({ summary: { chroma: triad(9, 3), centroidHz: 600 } }));
    expect(sad.valence).toBeLessThan(happy.valence);
    expect(sad.brightness).toBeLessThan(happy.brightness);
  });

  it('uses section spread as dynamics', () => {
    const flat = analysis({ sections: [{ start: 0, end: 60, energy: 0.5 }] });
    expect(computeSongProfile(analysis()).dynamics).toBeGreaterThan(computeSongProfile(flat).dynamics);
  });

  it('stays finite and in range for silence', () => {
    const silent = analysis({ frames: [], beats: [], sections: [], tempo: 0, summary: { chroma: new Array(12).fill(0), centroidHz: 0 } });
    const p = computeSongProfile(silent);
    expect(p.brightness).toBe(0.5);
    expect(p.modeConfidence).toBe(0);
    for (const v of [p.valence, p.arousal, p.brightness, p.pulse, p.dynamics]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
