import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { LyricPreset } from '../../lyrics/lyric.model';
import { LyricSearchResult } from '../../lyrics/lyric-search.service';
import { FREE_PREVIEW_DURATION, GenerationQuote } from '../../vj/generation-policy';
import { VJ_STYLES } from '../../vj/styles';
import { VJProject } from '../../vj/vj-project.model';
import { GeneratorStore } from './generator.store';
import { PreviewPlayerComponent } from './preview-player.component';
import { StylePickerComponent } from './style-picker.component';

@Component({
  selector: 'app-generator-page',
  imports: [DecimalPipe, PercentPipe, StylePickerComponent, PreviewPlayerComponent],
  providers: [GeneratorStore],
  templateUrl: './generator.page.html',
  styleUrl: './generator.page.scss',
})
export class GeneratorPage {
  protected readonly store = inject(GeneratorStore);
  protected readonly freeSeconds = FREE_PREVIEW_DURATION;
  protected readonly lyricPresets: { id: LyricPreset | 'auto'; label: string }[] = [
    { id: 'auto', label: '自動（依風格）' },
    { id: 'minimal', label: '極簡' },
    { id: 'kinetic', label: '動態' },
    { id: 'idol', label: '偶像／動漫' },
  ];
  private readonly sourceAudio = viewChild<ElementRef<HTMLAudioElement>>('sourceAudio');

  constructor() {
    // Only one thing should be audible: preview playback pauses the source player.
    effect(() => {
      if (this.store.state() === 'PLAYING' || this.store.state() === 'EXPORTING') this.sourceAudio()?.nativeElement.pause();
    });
  }

  protected alignStage(): string {
    const a = this.store.alignment();
    return a.status === 'running' ? a.stage : '';
  }

  protected alignProgress(): number {
    const a = this.store.alignment();
    return a.status === 'running' ? (a.progress ?? 0) : 0;
  }

  protected alignError(): string {
    const a = this.store.alignment();
    return a.status === 'error' ? a.message : '';
  }

  /** e.g. "免費", "消耗 4 點", "🔒 需解鎖" — driven entirely by the generation policy. */
  protected priceLabel(q: GenerationQuote): string {
    if (q.locked) return '🔒 需解鎖';
    return q.credits > 0 ? `消耗 ${q.credits} 點` : '免費';
  }

  protected scopeLabel(): string {
    return this.store.mode() === 'full' ? '整首歌' : `前 ${this.freeSeconds} 秒`;
  }

  /** The style actually used; for an automatic choice, which one and why. */
  protected styleName(project: VJProject): string {
    const name = VJ_STYLES[project.styleId].name;
    return project.autoReason ? `自動 → ${name}（${project.autoReason}）` : name;
  }

  /** The online result, only while the box still holds it unedited. */
  protected foundLyrics(): LyricSearchResult | null {
    const lookup = this.store.lyricLookup();
    return lookup.status === 'found' && lookup.result.text === this.store.lyricsText() ? lookup.result : null;
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.store.loadFile(file);
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && this.store.canUpload()) void this.store.loadFile(file);
  }

  protected onLyricsInput(event: Event): void {
    this.store.lyricsText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onLyricPresetChange(event: Event): void {
    this.store.lyricPreset.set((event.target as HTMLSelectElement).value as LyricPreset | 'auto');
  }

  protected formatDuration(t: number): string {
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  }
}
