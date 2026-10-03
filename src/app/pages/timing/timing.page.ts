import { Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SongTimeline, TimelineCue, vocalActivity } from '../../lyric-vj/timeline';
import { checkLines, ISSUE_LABEL, LineCheck } from '../../lyric-vj/timing-qa';

interface SongItem {
  id: string;
  title: string;
  lines: number;
  review: number;
  confirmedAt: string | null;
}

type Status = 'red' | 'yellow' | 'ok';

const QA_LABELS = new Set(Object.values(ISSUE_LABEL));
const VIEW_SEC = 16; // seconds visible on the waveform
const NUDGE = 0.05;

/**
 * Lyric timing editor: the song plays over a lyrics-only preview while each line's start/end is checked live against
 * the vocal stem. Red lines must be fixed; yellow lines were uncertain for the aligner. Nothing is generated until the
 * user confirms the timeline here.
 */
@Component({
  selector: 'app-timing-page',
  imports: [DecimalPipe],
  templateUrl: './timing.page.html',
  styleUrl: './timing.page.scss',
})
export class TimingPage {
  protected readonly songs = signal<SongItem[]>([]);
  protected readonly songId = signal<string | null>(new URLSearchParams(location.search).get('song'));
  protected readonly song = signal<SongTimeline | null>(null);
  protected readonly cues = signal<TimelineCue[]>([]);
  protected readonly touched = signal<Set<string>>(new Set());
  protected readonly selected = signal(0);
  protected readonly time = signal(0);
  protected readonly playing = signal(false);
  protected readonly dirty = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly loading = signal<string | null>(null);
  private readonly active = signal<boolean[] | null>(null);
  private peaks: Float32Array | null = null; // per 10 ms, max |sample| of the vocal stem
  private readonly audio = new Audio();
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  private drag: { index: number; edge: 'start' | 'end' } | null = null;

  protected readonly checks = computed<LineCheck[]>(() => (this.active() ? checkLines(this.cues(), this.active()!) : []));
  protected readonly statuses = computed<Status[]>(() =>
    this.cues().map((c, i) => {
      if (this.checks()[i] && !this.checks()[i].ok) return 'red';
      const aligner = (c.review ?? []).filter((r) => !QA_LABELS.has(r));
      return aligner.length && !this.touched().has(c.id) ? 'yellow' : 'ok';
    }),
  );
  protected readonly counts = computed(() => ({
    red: this.statuses().filter((s) => s === 'red').length,
    yellow: this.statuses().filter((s) => s === 'yellow').length,
  }));
  /** The line on screen in the lyrics-only preview. */
  protected readonly current = computed(() => this.cues().find((c) => this.time() >= c.start && this.time() < c.end) ?? null);

  constructor() {
    const raf = { id: 0 };
    const tick = () => {
      this.time.set(this.audio.currentTime);
      this.draw();
      raf.id = requestAnimationFrame(tick);
    };
    raf.id = requestAnimationFrame(tick);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(raf.id);
      this.audio.pause();
    });
    this.audio.onplay = () => this.playing.set(true);
    this.audio.onpause = () => this.playing.set(false);
    void this.loadList();
    const id = this.songId();
    if (id) void this.open(id);
  }

  protected issueText(i: number): string {
    const qa = this.checks()[i]?.issues.map((k) => ISSUE_LABEL[k]) ?? [];
    const aligner = this.statuses()[i] === 'yellow' ? (this.cues()[i].review ?? []).filter((r) => !QA_LABELS.has(r)) : [];
    return [...qa, ...aligner].join('、');
  }

  protected suggested(i: number): number | undefined {
    return this.checks()[i]?.suggestedStart;
  }

  private async loadList() {
    const r = await fetch('/lyric-vj/songs', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return this.message.set('讀不到歌曲清單，請先執行 npx tsx scripts/lyric-vj/dashboard.mts');
    this.songs.set(await r.json());
  }

  protected async open(id: string) {
    this.songId.set(id);
    history.replaceState(null, '', `/timing?song=${encodeURIComponent(id)}`);
    const base = `/lyric-vj/songs/${encodeURIComponent(id)}`;
    this.loading.set('讀取歌曲…');
    const song: SongTimeline = await (await fetch(base, { cache: 'no-store' })).json();
    this.song.set(song);
    this.cues.set(song.cues.map((c) => ({ ...c })));
    this.touched.set(new Set());
    this.dirty.set(false);
    this.selected.set(Math.max(0, this.statuses().findIndex((s) => s !== 'ok')));
    this.audio.src = `${base}/audio/mix`;
    this.loading.set('分析人聲…');
    try {
      const buf = await (await fetch(`${base}/audio/vocals`)).arrayBuffer();
      const decoded = await new AudioContext().decodeAudioData(buf);
      const ch = decoded.getChannelData(0);
      this.active.set(vocalActivity(ch, decoded.sampleRate));
      const hop = Math.round(decoded.sampleRate / 100);
      this.peaks = new Float32Array(Math.floor(ch.length / hop));
      for (let i = 0; i < this.peaks.length; i++) {
        let m = 0;
        for (let j = i * hop; j < (i + 1) * hop; j++) m = Math.max(m, Math.abs(ch[j]));
        this.peaks[i] = m;
      }
      this.selected.set(Math.max(0, this.statuses().findIndex((s) => s !== 'ok')));
      this.loading.set(null);
    } catch {
      this.loading.set('讀不到人聲分離軌：無法即時檢查時間');
    }
  }

  // ---- editing
  private setLine(i: number, patch: Partial<Pick<TimelineCue, 'start' | 'end'>>) {
    const list = this.cues().map((c) => ({ ...c }));
    const c = list[i];
    const lo = i > 0 ? list[i - 1].start + 0.05 : 0;
    if (patch.start !== undefined) {
      c.start = Math.max(lo, Math.min(patch.start, c.end - 0.1));
      if (i > 0) list[i - 1].end = Math.min(list[i - 1].end, c.start); // the previous line yields
    }
    if (patch.end !== undefined) c.end = Math.max(c.start + 0.1, Math.min(patch.end, list[i + 1]?.start ?? this.song()!.duration));
    c.start = +c.start.toFixed(3);
    c.end = +c.end.toFixed(3);
    this.cues.set(list);
    this.touched.update((s) => new Set(s).add(c.id));
    this.dirty.set(true);
  }

  protected nudge(i: number, edge: 'start' | 'end', d: number) {
    this.setLine(i, { [edge]: this.cues()[i][edge] + d });
  }

  protected setNow(i: number, edge: 'start' | 'end') {
    this.setLine(i, { [edge]: this.audio.currentTime });
  }

  protected useStart(i: number, t: number) {
    this.setLine(i, { start: t });
    this.playLine(i);
  }

  protected accept(i: number) {
    this.touched.update((s) => new Set(s).add(this.cues()[i].id));
    this.dirty.set(true);
  }

  protected edit(i: number, edge: 'start' | 'end', value: string) {
    const v = Number(value);
    if (Number.isFinite(v)) this.setLine(i, { [edge]: v });
  }

  protected playLine(i: number) {
    this.selected.set(i);
    this.audio.currentTime = Math.max(0, this.cues()[i].start - 1);
    void this.audio.play();
  }

  protected toggle() {
    if (this.audio.paused) void this.audio.play();
    else this.audio.pause();
  }

  // tap timing: Space plays/pauses, Enter sets the selected line's start to now and moves on, ←/→ nudge it
  @HostListener('window:keydown', ['$event'])
  protected key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || !this.song()) return;
    const i = this.selected();
    if (e.code === 'Space') this.toggle();
    else if (e.code === 'Enter') {
      this.setNow(i, 'start');
      this.selected.set(Math.min(this.cues().length - 1, i + 1));
    } else if (e.code === 'ArrowLeft') this.nudge(i, 'start', -NUDGE);
    else if (e.code === 'ArrowRight') this.nudge(i, 'start', NUDGE);
    else if (e.code === 'ArrowUp') this.selected.set(Math.max(0, i - 1));
    else if (e.code === 'ArrowDown') this.selected.set(Math.min(this.cues().length - 1, i + 1));
    else return;
    e.preventDefault();
  }

  protected async save(confirm: boolean) {
    const id = this.songId();
    if (!id) return;
    const r = await fetch(`/lyric-vj/songs/${encodeURIComponent(id)}/cues`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cues: this.cues().map(({ id, start, end }) => ({ id, start, end })), confirm }),
    });
    const body = await r.json();
    if (!r.ok) return this.message.set(`儲存失敗：${body.error}`);
    this.dirty.set(false);
    this.message.set(confirm ? '時間軸已確認，可以開始生成 VJ。' : '已儲存。');
    await this.open(id);
    await this.loadList();
  }

  // ---- waveform
  private viewStart() {
    return Math.max(0, this.time() - VIEW_SEC * 0.35);
  }

  private draw() {
    const cv = this.canvas()?.nativeElement;
    const song = this.song();
    if (!cv || !song) return;
    const w = (cv.width = cv.clientWidth * devicePixelRatio);
    const h = (cv.height = cv.clientHeight * devicePixelRatio);
    const g = cv.getContext('2d')!;
    const t0 = this.viewStart();
    const x = (t: number) => ((t - t0) / VIEW_SEC) * w;
    g.clearRect(0, 0, w, h);
    const st = this.statuses();
    this.cues().forEach((c, i) => {
      if (c.end < t0 || c.start > t0 + VIEW_SEC) return;
      g.fillStyle = st[i] === 'red' ? 'rgba(255,92,108,.28)' : st[i] === 'yellow' ? 'rgba(255,200,87,.22)' : 'rgba(123,97,255,.22)';
      g.fillRect(x(c.start), 0, x(c.end) - x(c.start), h);
      g.fillStyle = i === this.selected() ? '#00e5ff' : '#ece9f7';
      g.fillRect(x(c.start) - 1, 0, 3 * devicePixelRatio, h);
      g.font = `${12 * devicePixelRatio}px system-ui`;
      g.fillText(c.text, x(c.start) + 6, 16 * devicePixelRatio, Math.max(0, x(c.end) - x(c.start) - 10));
    });
    if (this.peaks) {
      g.fillStyle = 'rgba(236,233,247,.75)';
      const max = 0.0001 + this.peaks.reduce((m, v) => Math.max(m, v), 0) * 0.8;
      for (let px = 0; px < w; px += 2) {
        const f = Math.floor((t0 + (px / w) * VIEW_SEC) * 100);
        const v = Math.min(1, (this.peaks[f] ?? 0) / max);
        g.fillRect(px, h / 2 - (v * h) / 2.4, 1.5, (v * h) / 1.2);
      }
    }
    g.fillStyle = '#ff3d9a';
    g.fillRect(x(this.time()), 0, 2 * devicePixelRatio, h);
  }

  private timeAt(e: MouseEvent) {
    const cv = this.canvas()!.nativeElement;
    const r = cv.getBoundingClientRect();
    return this.viewStart() + ((e.clientX - r.left) / r.width) * VIEW_SEC;
  }

  protected down(e: MouseEvent) {
    const t = this.timeAt(e);
    const px = VIEW_SEC / this.canvas()!.nativeElement.getBoundingClientRect().width;
    const near = (a: number) => Math.abs(a - t) < 6 * px;
    const i = this.cues().findIndex((c) => near(c.start) || near(c.end));
    if (i >= 0) {
      this.drag = { index: i, edge: near(this.cues()[i].start) ? 'start' : 'end' };
      this.selected.set(i);
    } else this.audio.currentTime = t; // click empty space to seek
  }

  protected move(e: MouseEvent) {
    if (this.drag) this.setLine(this.drag.index, { [this.drag.edge]: this.timeAt(e) });
  }

  protected up() {
    this.drag = null;
  }
}
