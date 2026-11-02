import { analyzeAudio, estimatePeriod } from './audio-analyzer.service';
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

/**
 * Onset curve for a quarter-note pulse at `bpm` with an eighth-note off-beat and dotted-eighth ghosts (a 4:3 relation,
 * 97 BPM against 129 BPM): the shape that made the old single-lag, 120-weighted detector store 129 for 97 BPM songs.
 */
function pulseWithGhosts(bpm: number, seconds: number, frameInterval: number, ghost: number, accents = [1, 0.7]): Float32Array {
  const onset = new Float32Array(Math.round(seconds / frameInterval));
  const quarter = 60 / bpm;
  const add = (t: number, v: number) => {
    const i = Math.round(t / frameInterval);
    if (i < onset.length) onset[i] += v;
  };
  for (let t = 0; t < seconds; t += quarter) {
    add(t, accents[0]);
    add(t + quarter / 2, accents[1]);
  }
  for (let t = 0; t < seconds; t += (quarter * 3) / 4) add(t, ghost);
  return onset;
}

describe('estimatePeriod', () => {
  const fi = 0.0232;
  const bpmOf = (onset: Float32Array) => 60 / (estimatePeriod(onset, fi) * fi);

  it('keeps a 97 BPM pulse (194 BPM eighth grid) instead of the 129 BPM dotted-eighth peak', () => {
    expect(Math.abs(bpmOf(pulseWithGhosts(97, 60, fi, 0.7)) - 97)).toBeLessThan(3);
    expect(Math.abs(bpmOf(pulseWithGhosts(97, 60, fi, 0.8)) - 97)).toBeLessThan(3);
    expect(Math.abs(bpmOf(pulseWithGhosts(97, 60, fi, 0.9, [1, 1])) - 97)).toBeLessThan(3);
  });

  it('keeps ordinary tempos near 100, 107 and 128 BPM', () => {
    for (const bpm of [100, 107, 128]) expect(Math.abs(bpmOf(pulseWithGhosts(bpm, 60, fi, 0)) - bpm)).toBeLessThan(2);
  });
});
