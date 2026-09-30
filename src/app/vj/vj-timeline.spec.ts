import { AudioAnalysis } from '../audio/audio-analysis.model';
import { SongProfile } from '../audio/song-profile';
import { deriveLook } from './look';
import { CUTE_STYLE } from './styles/cute.style';
import { EDM_STYLE } from './styles/edm.style';
import { buildScenes } from './vj-timeline.service';

function fakeAnalysis(duration = 180): AudioAnalysis {
  const frameInterval = 0.05;
  const frames = Array.from({ length: Math.ceil(duration / frameInterval) }, (_, i) => {
    const t = i * frameInterval;
    const loud = Math.floor(t / 30) % 2 ? 0.9 : 0.3;
    return { time: t, energy: loud, bass: loud, mid: 0.5, treble: 0.4, spectralFlux: i % 10 === 0 ? 0.9 : 0.1 };
  });
  const beats = Array.from({ length: Math.floor(duration / 0.5) }, (_, i) => i * 0.5);
  const sections = Array.from({ length: duration / 30 }, (_, i) => ({ start: i * 30, end: (i + 1) * 30, energy: i % 2 ? 0.9 : 0.3 }));
  return { duration, frameInterval, frames, beats, tempo: 120, sections, summary: { chroma: new Array(12).fill(0), centroidHz: 0 } };
}

describe('buildScenes', () => {
  const analysis = fakeAnalysis();

  it('is deterministic for the same seed and varies with the seed', () => {
    expect(buildScenes(analysis, EDM_STYLE, 42)).toEqual(buildScenes(analysis, EDM_STYLE, 42));
    expect(buildScenes(analysis, EDM_STYLE, 42)).not.toEqual(buildScenes(analysis, EDM_STYLE, 43));
  });

  it('covers the whole track contiguously with reasonable scene lengths', () => {
    const scenes = buildScenes(analysis, EDM_STYLE, 1);
    expect(scenes[0].start).toBe(0);
    expect(scenes.at(-1)!.end).toBe(analysis.duration);
    scenes.slice(1).forEach((s, i) => expect(s.start).toBe(scenes[i].end));
    for (const s of scenes) {
      expect(s.end - s.start).toBeGreaterThan(EDM_STYLE.sceneLength.min * 0.5);
      expect(s.end - s.start).toBeLessThan(EDM_STYLE.sceneLength.max * 1.6);
    }
    scenes.slice(1).forEach((s, i) => expect(s.preset).not.toBe(scenes[i].preset));
  });

  it('maps loud sections to higher tiers and uses only the style transitions', () => {
    const scenes = buildScenes(analysis, CUTE_STYLE, 7);
    const allowed = new Set(CUTE_STYLE.transitions.map((t) => t.type).concat(CUTE_STYLE.impactTransition));
    scenes.forEach((s) => expect(allowed.has(s.parameters['transition'] as never)).toBe(true));
    const quiet = scenes.find((s) => s.start < 20)!;
    const loud = scenes.find((s) => s.start >= 32 && s.end <= 60)!;
    expect(loud.intensity).toBeGreaterThan(quiet.intensity);
  });
});

describe('buildScenes with a song look', () => {
  const analysis = fakeAnalysis(600);
  const profile = (overrides: Partial<SongProfile>): SongProfile => ({
    valence: 0.5, arousal: 0.5, brightness: 0.5, pulse: 0.5, dynamics: 0.5, mode: 'major', modeConfidence: 0, tempo: 120, ...overrides,
  });
  const scenesFor = (overrides: Partial<SongProfile>) =>
    [1, 2, 3, 4, 5].flatMap((seed) => buildScenes(analysis, EDM_STYLE, seed, deriveLook(profile(overrides), EDM_STYLE)));
  const share = (scenes: { preset: string; parameters: Record<string, unknown> }[], test: (s: (typeof scenes)[number]) => boolean) =>
    scenes.filter(test).length / scenes.length;

  it('keeps a calm, flat song away from the most intense preset, even in its loud scenes', () => {
    const scenes = scenesFor({ arousal: 0.1, dynamics: 0.1 });
    const loud = scenes.filter((s) => s.parameters['tier'] === 'high');
    expect(loud.length).toBeGreaterThan(0);
    expect(share(loud, (s) => s.preset === 'grid')).toBeGreaterThan(0);
    expect(share(scenes, (s) => s.preset === 'bars')).toBeLessThan(share(scenes, (s) => s.preset === 'grid'));
  });

  it('cuts calm songs mostly with fades and intense songs with hard transitions', () => {
    const calm = scenesFor({ arousal: 0.1, dynamics: 0.1 }).slice(1);
    const hype = scenesFor({ arousal: 0.95 }).slice(1);
    const isFade = (s: { parameters: Record<string, unknown> }) => s.parameters['transition'] === 'fade';
    const isHard = (s: { parameters: Record<string, unknown> }) => ['flash', 'glitch'].includes(s.parameters['transition'] as string);
    expect(share(calm, isFade)).toBeGreaterThan(0.5);
    expect(share(calm, (s) => s.parameters['transition'] === 'flash')).toBeLessThan(0.1);
    expect(share(hype, isHard)).toBeGreaterThan(share(hype, isFade));
  });

  it('spreads scene targets further apart for songs with more dynamics', () => {
    const range = (scenes: { parameters: Record<string, unknown> }[]) => {
      const targets = scenes.map((s) => s.parameters['target'] as number);
      return Math.max(...targets) - Math.min(...targets);
    };
    expect(range(scenesFor({ dynamics: 0.9 }))).toBeGreaterThan(range(scenesFor({ dynamics: 0.1 })));
  });

  it('is deterministic for the same seed and look', () => {
    const look = deriveLook(profile({ arousal: 0.3 }), EDM_STYLE);
    expect(buildScenes(analysis, EDM_STYLE, 9, look)).toEqual(buildScenes(analysis, EDM_STYLE, 9, look));
  });
});
