import { TestBed } from '@angular/core/testing';
import { AudioAnalysis } from '../../audio/audio-analysis.model';
import { LoadedAudio } from '../../audio/audio-loader.service';
import { LyricAlignerService } from '../../lyrics/lyric-aligner.service';
import { GENERATION_POLICY, GenerationPolicy, GenerationQuote, openAccessPolicy } from '../../vj/generation-policy';
import { GeneratorStore } from './generator.store';

const analysis: AudioAnalysis = {
  duration: 180,
  frameInterval: 0.5,
  frames: Array.from({ length: 360 }, (_, i) => ({ time: i * 0.5, energy: (i % 60) / 60, bass: 0.5, mid: 0.5, treble: 0.5, spectralFlux: 0.2 })),
  beats: Array.from({ length: 360 }, (_, i) => i * 0.5),
  tempo: 120,
  summary: { chroma: new Array(12).fill(0), centroidHz: 0 },
  sections: [{ start: 0, end: 180, energy: 0.5 }],
};

/** Paid-full-song policy: full costs 1 credit per started minute and needs checkout. */
function paidPolicy(approve: boolean) {
  const calls: GenerationQuote[] = [];
  const policy: GenerationPolicy = {
    quote: (mode, duration) => {
      const q = openAccessPolicy.quote(mode, duration);
      return mode === 'full' ? { ...q, credits: Math.ceil(q.seconds / 60), locked: true } : q;
    },
    authorize: async (q) => (calls.push(q), q.mode === 'preview' || approve),
  };
  return { policy, calls };
}

function setup(policy: GenerationPolicy): GeneratorStore {
  TestBed.configureTestingModule({ providers: [GeneratorStore, { provide: GENERATION_POLICY, useValue: policy }] });
  const store = TestBed.inject(GeneratorStore);
  store.analysis.set(analysis);
  store.state.set('READY');
  return store;
}

describe('GeneratorStore generation length', () => {
  it('generates the 60s preview by default and the whole track in full mode', async () => {
    const store = setup(openAccessPolicy);
    await store.generate();
    expect(store.project()!.range).toEqual({ start: 0, end: 60 });
    store.selectMode('full');
    await vi.waitFor(() => expect(store.project()!.range).toEqual({ start: 0, end: 180 }));
    expect(store.project()!.mode).toBe('full');
  });

  it('does not generate when the unlock is declined', async () => {
    const { policy, calls } = paidPolicy(false);
    const store = setup(policy);
    store.mode.set('full');
    await store.generate();
    expect(calls.map((c) => [c.mode, c.credits])).toEqual([['full', 3]]);
    expect(store.project()).toBeNull();
    expect(store.state()).toBe('READY');
  });

  it('charges a (track, mode) only once, even across style changes', async () => {
    const { policy, calls } = paidPolicy(true);
    const store = setup(policy);
    store.mode.set('full');
    await store.generate();
    store.selectStyle('cute');
    await vi.waitFor(() => expect(store.project()!.styleId).toBe('cute'));
    await store.generate();
    expect(calls.filter((c) => c.mode === 'full')).toHaveLength(1);
    expect(store.quotes()!.full.credits).toBe(3);
  });
});

describe('GeneratorStore automatic lyrics', () => {
  function setupWithAligner() {
    const align = vi.fn(async () => [{ start: 1, end: 2, text: '聽到的歌詞' }]);
    TestBed.configureTestingModule({
      providers: [GeneratorStore, { provide: GENERATION_POLICY, useValue: openAccessPolicy }, { provide: LyricAlignerService, useValue: { align, cancel: vi.fn() } }],
    });
    const store = TestBed.inject(GeneratorStore);
    store.audio.set({ buffer: {} } as LoadedAudio);
    store.analysis.set(analysis);
    store.state.set('READY');
    return { store, align };
  }

  it('recognizes lyrics from the vocals when none are entered', async () => {
    const { store, align } = setupWithAligner();
    await store.generate();
    await vi.waitFor(() => expect(store.lyricTiming()).toBe('transcribed'));
    expect(align).toHaveBeenCalledWith(expect.anything(), expect.anything(), [], expect.anything(), expect.any(Function));
    expect(store.project()!.lyrics!.map((c) => c.text)).toEqual(['聽到的歌詞']);
    await store.generate();
    expect(align).toHaveBeenCalledTimes(1);
  });

  it('skips recognition when turned off', async () => {
    const { store, align } = setupWithAligner();
    store.autoLyrics.set(false);
    await store.generate();
    expect(align).not.toHaveBeenCalled();
    expect(store.lyricTiming()).toBeNull();
  });
});
