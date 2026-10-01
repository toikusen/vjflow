import { SongProfile } from '../audio/song-profile';
import { describeProfile, rankStyles } from './style-ranking';

const profile = (overrides: Partial<SongProfile>): SongProfile => ({
  valence: 0.5, arousal: 0.5, brightness: 0.5, pulse: 0.5, dynamics: 0.5, mode: 'major', modeConfidence: 0, tempo: 120, ...overrides,
});

describe('rankStyles', () => {
  it('picks Cinematic for a slow, minor, dark song', () => {
    expect(rankStyles(profile({ valence: 0.25, arousal: 0.3, brightness: 0.3 }))[0].styleId).toBe('cinematic');
  });

  it('picks EDM for a fast, driving song', () => {
    expect(rankStyles(profile({ valence: 0.5, arousal: 0.9, brightness: 0.6, pulse: 0.9 }))[0].styleId).toBe('edm');
  });

  it('picks Cute for a happy, bright song', () => {
    expect(rankStyles(profile({ valence: 0.9, arousal: 0.6, brightness: 0.8 }))[0].styleId).toBe('cute');
  });

  it('ranks every style, best first', () => {
    const ranked = rankStyles(profile({}));
    expect(ranked).toHaveLength(5);
    ranked.slice(1).forEach((r, i) => expect(r.score).toBeLessThanOrEqual(ranked[i].score));
  });
});

describe('describeProfile', () => {
  it('summarizes mode, tempo, energy and timbre', () => {
    expect(describeProfile(profile({ mode: 'minor', modeConfidence: 0.8, tempo: 78, arousal: 0.2, brightness: 0.2 }))).toBe('小調・慢板 78 BPM・氣氛平靜・聲音偏暗');
  });

  it('leaves out an uncertain mode', () => {
    expect(describeProfile(profile({ modeConfidence: 0.1 }))).toBe('120 BPM');
  });
});
