import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';

interface SongItem {
  id: string;
  title: string;
  lines: number;
  review: number;
  confirmedAt: string | null;
}

interface Language {
  id: string;
  name: string;
  suits: string;
  essence: string;
}

interface StudioState {
  run: { step: string; startedAt: string; endedAt?: string; ok?: boolean; log: string[]; phase?: string; progress?: number; detail?: string } | null;
  design: { language: string | null; font: string | null; concept: string; motif: string | null; drawing: string | null } | null;
  /** The last drawing missed the quality bar: the song keeps its current design (score out of 100, reviewer's words). */
  fallback: { score: number; verdict: string } | null;
  visualQa?: string[];
  costUSD: number;
  previews: string[];
  check: { unreadable: string[]; lingering: string[] } | null;
  outputs: string[];
  props: { contact: string; sprites: number | null } | null;
  feedback: string;
}

const POLL_MS = 3000;
const STEP_LABEL: Record<string, string> = { make: '產生設計與預覽', clip: '30 秒動態預覽', design: '重做設計', render: '渲染完整影片', layer: '輸出歌詞透明層', lrc: '輸出 LRC', props: '重畫素材庫', revise: '依意見修改專屬圖層', draw: '重做專屬圖層' };

/**
 * Studio: one song from confirmed timing to a finished VJ — generate the design (the director picks a design language
 * unless the user does), check the preview, redo only the design or switch language, render, export the transparent
 * lyric layer and LRC. Backed by scripts/lyric-vj/studio.mts through the dev proxy.
 */
@Component({
  selector: 'app-studio-page',
  imports: [NgTemplateOutlet],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage {
  protected readonly songs = signal<SongItem[]>([]);
  protected readonly languages = signal<Language[]>([]);
  protected readonly selected = signal<string | null>(null);
  protected readonly state = signal<StudioState | null>(null);
  protected readonly language = signal<string>('');
  protected readonly error = signal<string | null>(null);
  /** The user's notes for the next revision of the drawing (kept per song once sent). */
  protected readonly feedback = signal('');
  /** Go ahead before the lyric timing is confirmed (a trial; captions may be off). */
  protected readonly unconfirmed = signal(false);
  protected readonly running = computed(() => !!this.state()?.run && !this.state()!.run!.endedAt);
  protected readonly song = computed(() => this.songs().find((s) => s.id === this.selected()) ?? null);
  protected readonly langName = computed(() => {
    const id = this.state()?.design?.language;
    return this.languages().find((l) => l.id === id)?.name ?? id ?? '';
  });
  /** The step the user is on: 1 timing, 2 design and preview, 3 the song's own drawing, 4 output. */
  protected readonly stage = computed(() => {
    const st = this.state();
    if (!this.song()?.confirmedAt && !this.unconfirmed() && !st?.design) return 1;
    if (!st?.design) return 2;
    return st.design.drawing || st.fallback ? 4 : 3;
  });
  protected readonly stepLabel = STEP_LABEL;
  private readonly logBox = viewChild<ElementRef<HTMLPreElement>>('logBox');
  protected readonly now = signal(Date.now());

  /** Minutes:seconds since the run started. */
  protected elapsed(startedAt: string, endedAt?: string) {
    const s = Math.max(0, Math.round(((endedAt ? Date.parse(endedAt) : this.now()) - Date.parse(startedAt)) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  constructor() {
    void this.load();
    const timer = setInterval(() => this.selected() && void this.refresh(), POLL_MS);
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected file(path: string) {
    return `/lyric-vj/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  protected name(path: string) {
    return path.split('/').pop() ?? path;
  }

  protected async select(id: string) {
    this.selected.set(id);
    this.state.set(null);
    await this.refresh();
    this.feedback.set(this.state()?.feedback ?? '');
  }

  protected async run(step: string, seconds?: number) {
    const id = this.selected();
    if (!id) return;
    this.error.set(null);
    const res = await fetch(`/lyric-vj/studio/${encodeURIComponent(id)}/${step}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: this.language() || undefined, seconds, feedback: step === 'revise' ? this.feedback() : undefined, unconfirmed: this.unconfirmed() || undefined }),
    });
    if (!res.ok) this.error.set(((await res.json()) as { error?: string }).error ?? `失敗（${res.status}）`);
    await this.refresh();
  }

  private async load() {
    try {
      const [songs, langs] = await Promise.all([fetch('/lyric-vj/songs').then((r) => r.json()), fetch('/lyric-vj/languages').then((r) => r.json())]);
      this.songs.set(songs);
      this.languages.set(langs);
    } catch {
      this.error.set('連不上後端：請先執行 npx tsx scripts/lyric-vj/dashboard.mts');
    }
  }

  private async refresh() {
    const id = this.selected();
    if (!id) return;
    const res = await fetch(`/lyric-vj/studio/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    // the log follows new lines only while it is scrolled to the bottom (reading back is left alone)
    const box = this.logBox()?.nativeElement;
    const atBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    this.state.set(await res.json());
    if (atBottom) setTimeout(() => this.logBox()?.nativeElement.scrollTo({ top: 1e9 }));
  }
}
