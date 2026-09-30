import { analyzeAudio } from './audio-analyzer.service';
import { AudioBufferLike } from './audio-analysis.model';
import { getFeaturesAt } from './audio-features';

/** Synthetic kick track: decaying 60 Hz bursts every `interval` seconds, quiet first half, loud second half. */
function kickTrack(seconds: number, bpm: number, sampleRate = 22050): AudioBufferLike {
  const data = new Float32Array(seconds * sampleRate);
  const interval = 60 / bpm;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const since = t % interval;
    const gain = t < seconds / 2 ? 0.2 : 0.9;
    data[i] = gain * Math.exp(-since * 30) * Math.sin(2 * Math.PI * 60 * since) + 0.01 * Math.sin(2 * Math.PI * 5000 * t);
  }
  return { sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data };
}

describe('analyzeAudio', () => {
  it('finds tempo, regular beats, normalized features and sections', async () => {
    const a = await analyzeAudio(kickTrack(40, 120));
    expect(a.duration).toBeCloseTo(40, 1);
    expect(Math.abs(a.tempo - 120)).toBeLessThan(4);

    const gaps = a.beats.slice(1).map((b, i) => b - a.beats[i]).sort((x, y) => x - y);
    expect(gaps[Math.floor(gaps.length / 2)]).toBeCloseTo(0.5, 1);
    for (const b of a.beats.slice(2, -2)) {
      const phase = b % 0.5;
      expect(Math.min(phase, 0.5 - phase)).toBeLessThan(0.06);
    }

    for (const f of a.frames) {
      for (const v of [f.energy, f.bass, f.mid, f.treble, f.spectralFlux ?? 0]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(a.sections[0].start).toBe(0);
    expect(a.sections.at(-1)!.end).toBeCloseTo(40, 1);
    expect(a.sections.length).toBeGreaterThanOrEqual(2);
    expect(getFeaturesAt(a, 30).energy).toBeGreaterThan(getFeaturesAt(a, 10).energy);
  });
});

/** Sum of sines, constant loudness. */
function toneTrack(freqs: number[], seconds = 6, sampleRate = 22050): AudioBufferLike {
  const data = new Float32Array(seconds * sampleRate);
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    data[i] = freqs.length ? freqs.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / freqs.length : 0;
  }
  return { sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data };
}

describe('analyzeAudio summary', () => {
  it('puts a pure A4 into pitch class A', async () => {
    const { chroma } = (await analyzeAudio(toneTrack([440]))).summary;
    expect(chroma.indexOf(1)).toBe(9);
  });

  it('reports a higher centroid for brighter audio', async () => {
    const dark = await analyzeAudio(toneTrack([200]));
    const bright = await analyzeAudio(toneTrack([3000]));
    expect(dark.summary.centroidHz).toBeGreaterThan(150);
    expect(bright.summary.centroidHz).toBeGreaterThan(dark.summary.centroidHz * 5);
  });

  it('returns finite zeros for silence', async () => {
    const { summary } = await analyzeAudio(toneTrack([]));
    expect(summary.centroidHz).toBe(0);
    expect(summary.chroma.every((v) => v === 0)).toBe(true);
  });
});
