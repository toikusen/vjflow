import { TestBed } from '@angular/core/testing';
import { AudioAnalysis } from '../../audio/audio-analysis.model';
import { VjRendererService } from '../../vj/renderer/vj-renderer.service';
import { VjEngineService } from '../../vj/vj-engine.service';
import { GeneratorStore } from './generator.store';
import { PreviewExportService } from './preview-export.service';
import { PreviewPlayerComponent } from './preview-player.component';

const analysis: AudioAnalysis = {
  duration: 30,
  frameInterval: 0.5,
  frames: Array.from({ length: 60 }, (_, i) => ({ time: i * 0.5, energy: 0.5, bass: 0.5, mid: 0.5, treble: 0.5, spectralFlux: 0.2 })),
  beats: Array.from({ length: 60 }, (_, i) => i * 0.5),
  tempo: 120,
  summary: { chroma: new Array(12).fill(0), centroidHz: 0 },
  sections: [{ start: 0, end: 30, energy: 0.5 }],
};

/** Controllable stand-in for <audio>: jsdom can't play media. */
function fakeAudio(el: HTMLAudioElement) {
  const state = { paused: true, ended: false, currentTime: 0 };
  Object.defineProperties(el, {
    paused: { get: () => state.paused },
    ended: { get: () => state.ended },
    currentTime: { get: () => state.currentTime, set: (t: number) => ((state.currentTime = t), (state.ended = false)) },
  });
  el.play = async () => void (state.paused = false);
  el.pause = () => {
    if (state.paused) return;
    state.paused = true;
    el.dispatchEvent(new Event('pause'));
  };
  return {
    state,
    /** What a browser does when media plays to its natural end. */
    playToEnd(duration: number) {
      state.currentTime = duration;
      state.paused = true;
      state.ended = true;
      el.dispatchEvent(new Event('pause'));
      el.dispatchEvent(new Event('ended'));
    },
    seeked: () => el.dispatchEvent(new Event('seeked')),
  };
}

async function setup() {
  let finish!: (b: Blob) => void;
  const exporter = {
    start: vi.fn(async () => ({ done: new Promise<Blob>((r) => (finish = r)), format: { mime: 'video/webm', ext: 'webm' } })),
    stop: vi.fn(() => finish?.(new Blob())),
    dispose: vi.fn(),
  };
  const renderer = {
    stats: {}, currentTime: 0, canvas: document.createElement('canvas'),
    initialize: vi.fn(async () => {}), setClock: vi.fn(), loadProject: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(), destroy: vi.fn(),
  };
  TestBed.configureTestingModule({ imports: [PreviewPlayerComponent], providers: [GeneratorStore] });
  TestBed.overrideComponent(PreviewPlayerComponent, {
    set: { providers: [{ provide: VjRendererService, useValue: renderer }, { provide: PreviewExportService, useValue: exporter }] },
  });
  const store = TestBed.inject(GeneratorStore);
  store.analysis.set(analysis);
  const project = TestBed.inject(VjEngineService).createProject({ analysis, styleId: 'edm', mode: 'full' });
  store.project.set(project);
  store.state.set('PREVIEW_READY');

  const fixture = TestBed.createComponent(PreviewPlayerComponent);
  fixture.componentRef.setInput('project', project);
  fixture.componentRef.setInput('audioUrl', 'blob:test');
  await fixture.whenStable();
  const audio = fakeAudio(fixture.nativeElement.querySelector('audio'));
  const player = fixture.componentInstance as unknown as { exportPreview(): Promise<void>; cancelExport(): void };
  return { store, exporter, renderer, audio, player };
}

describe('PreviewPlayerComponent export', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('finishes and downloads when the track plays to its natural end (range end = track end)', async () => {
    const { store, exporter, audio, player } = await setup();
    const exporting = player.exportPreview();
    await vi.waitFor(() => expect(exporter.start).toHaveBeenCalled());
    await vi.waitFor(() => expect(audio.state.paused).toBe(false));

    audio.playToEnd(30);
    await exporting;

    expect(exporter.stop).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(store.state()).toBe('PREVIEW_READY');
  });

  it('does not start recording when cancelled while seeking back to the start', async () => {
    const { store, exporter, audio, player } = await setup();
    audio.state.currentTime = 12; // not at the start → export must wait for 'seeked'
    const exporting = player.exportPreview();
    expect(store.state()).toBe('EXPORTING');

    player.cancelExport();
    audio.seeked();
    await exporting;

    expect(exporter.start).not.toHaveBeenCalled();
    expect(audio.state.paused).toBe(true);
    expect(store.state()).toBe('PREVIEW_READY');
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});
