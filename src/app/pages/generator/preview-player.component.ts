import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, isDevMode, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { VjRendererService, RendererStats } from '../../vj/renderer/vj-renderer.service';
import { VJProject } from '../../vj/vj-project.model';
import { GeneratorStore } from './generator.store';
import { MediaClock } from './media-clock';
import { detectRecorderFormat, PreviewExportService } from './preview-export.service';

const UI_TICK_MS = 100;

/**
 * Owns the preview <audio> element and the renderer, and keeps them in sync:
 * the renderer reads the audio clock every frame; seeks go to both at once.
 */
@Component({
  selector: 'app-preview-player',
  imports: [DecimalPipe],
  providers: [VjRendererService, PreviewExportService],
  templateUrl: './preview-player.component.html',
  styleUrl: './preview-player.component.scss',
})
export class PreviewPlayerComponent {
  readonly project = input.required<VJProject>();
  readonly audioUrl = input.required<string>();

  protected readonly store = inject(GeneratorStore);
  private readonly renderer = inject(VjRendererService);
  private readonly exporter = inject(PreviewExportService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly audioRef = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  private readonly clock = new MediaClock();

  protected readonly debug = isDevMode();
  protected readonly ready = signal(false);
  protected readonly time = signal(0);
  protected readonly stats = signal<RendererStats | null>(null);
  protected readonly exportFormat = detectRecorderFormat();
  protected readonly range = computed(() => this.project().range);
  protected readonly playing = computed(() => this.store.state() === 'PLAYING');
  protected readonly exporting = computed(() => this.store.state() === 'EXPORTING');
  protected readonly exportProgress = computed(() => {
    const { start, end } = this.range();
    return Math.min(1, Math.max(0, (this.time() - start) / Math.max(0.01, end - start)));
  });
  private exportCancelled = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      try {
        await this.renderer.initialize(this.host().nativeElement);
      } catch (err) {
        this.store.fail(err);
        return;
      }
      const audio = this.audio;
      this.renderer.setClock(() => this.clock.read(audio.currentTime, performance.now(), !audio.paused, audio.playbackRate));
      this.ready.set(true);
    });

    effect(() => {
      const project = this.project();
      if (!this.ready()) return;
      this.renderer.loadProject(project);
      this.time.set(this.renderer.currentTime);
    });

    let ticks = 0;
    const timer = setInterval(() => this.onTick(++ticks), UI_TICK_MS);

    destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.audio.pause();
      this.exporter.dispose();
      this.renderer.destroy();
    });
  }

  private get audio(): HTMLAudioElement {
    return this.audioRef().nativeElement;
  }

  private onTick(ticks: number): void {
    if (!this.ready()) return;
    const { end } = this.range();
    if (!this.audio.paused && this.audio.currentTime >= end) {
      this.pause();
      this.audio.currentTime = end;
      if (this.exporting()) this.exporter.stop();
    }
    this.time.set(this.audio.paused ? this.renderer.currentTime : this.audio.currentTime);
    if (this.debug && ticks % 3 === 0) this.stats.set({ ...this.renderer.stats });
  }

  protected async play(): Promise<void> {
    const { start, end } = this.range();
    if (this.audio.currentTime < start || this.audio.currentTime >= end - 0.05) await this.seekAudio(start);
    try {
      await this.audio.play();
    } catch (err) {
      this.store.fail(err);
      return;
    }
    this.renderer.play();
    this.store.setPlaying(true);
  }

  protected pause(): void {
    this.audio.pause();
    this.renderer.pause();
    this.store.setPlaying(false);
  }

  protected onSeekInput(event: Event): void {
    const t = Number((event.target as HTMLInputElement).value);
    this.audio.currentTime = t;
    this.renderer.seek(t);
    this.time.set(t);
  }

  protected onVolumeInput(event: Event): void {
    this.store.volume.set(Number((event.target as HTMLInputElement).value));
  }

  /** Native pause (e.g. media ended, OS media keys) must stop the visuals too. */
  protected onAudioPaused(): void {
    if (this.store.state() === 'PLAYING') this.pause();
  }

  protected async exportPreview(): Promise<void> {
    const canvas = this.renderer.canvas;
    if (!canvas || this.exporting()) return;
    this.pause();
    this.exportCancelled = false;
    this.store.setExporting(true);
    try {
      const { start } = this.range();
      await this.seekAudio(start);
      this.renderer.seek(start);
      const { done, format } = await this.exporter.start(canvas, this.audio, this.store.volume());
      await this.audio.play();
      this.renderer.play();
      const blob = await done;
      if (!this.exportCancelled) this.download(blob, `vjflow-${this.project().styleId}-${this.project().mode}.${format.ext}`);
      this.store.setExporting(false);
    } catch (err) {
      this.exporter.stop();
      this.audio.pause();
      this.renderer.pause();
      this.store.fail(err);
    }
  }

  protected cancelExport(): void {
    this.exportCancelled = true;
    this.audio.pause();
    this.renderer.pause();
    this.exporter.stop();
  }

  private seekAudio(t: number): Promise<void> {
    if (Math.abs(this.audio.currentTime - t) < 0.01) return Promise.resolve();
    return new Promise((resolve) => {
      this.audio.addEventListener('seeked', () => resolve(), { once: true });
      this.audio.currentTime = t;
      this.renderer.seek(t);
    });
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  protected format(t: number): string {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
