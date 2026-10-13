import { moveEdge, snapTo } from './timing-edit';
import { Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SongTimeline, TimelineCue, vocalActivity, voicedSpans } from '../../lyric-vj/timeline';
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
const VIEW_SEC = 16; // seconds visible on the waveform at first; the wheel zooms between these
const VIEW_MIN = 2;
const VIEW_MAX = 60;
const NUDGE = 0.05;
const EDGE_LISTEN = 0.5; // Q/W/E/D play this long before/after a line's start or end
const SNAP = 0.15; // Shift while dragging: an edge within this of a beat, a voice onset or a line edge lands on it
const SPEEDS = [0.5, 0.75, 1];

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
  /** Members and their colours (lines tagged with a member are set in that colour). */
  protected readonly singers = signal<{ name: string; color: string }[]>([]);
  protected readonly touched = signal<Set<string>>(new Set());
  protected readonly selected = signal(0);
  protected readonly time = signal(0);
  protected readonly playing = signal(false);
  protected readonly dirty = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly loading = signal<string | null>(null);
  /** The selection box and the list follow the playing line (like the database viewer). */
  protected readonly follow = signal(true);
  /** Moving a line's start moves the lines after it by the same amount, up to the next line the user fixed. */
  protected readonly ripple = signal(false);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private lastFollow = -1;
  private userScrollAt = 0;
  private readonly active = signal<boolean[] | null>(null);
  private peaks: Float32Array | null = null; // per 10 ms, max |sample| of the vocal stem
  private readonly audio = new Audio();
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  /** Seconds the waveform shows (wheel to zoom, to place edges on the beat). */
  protected readonly viewSec = signal(VIEW_SEC);
  private drag: { index: number; edge: 'start' | 'end'; ripple: boolean } | null = null;
  /** Undo/redo snapshots of the lines and which were touched. */
  private undoStack: { cues: TimelineCue[]; touched: Set<string> }[] = [];
  private redoStack: { cues: TimelineCue[]; touched: Set<string> }[] = [];
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  /** Playback speed (slower to hear where a fast line starts) and looping the selected line. */
  protected readonly speed = signal(1);
  protected readonly speeds = SPEEDS;
  protected readonly loop = signal(false);
  /** Q/W/E/D play a short piece and stop here. */
  private stopAt: number | null = null;

  protected readonly checks = computed<LineCheck[]>(() => (this.active() ? checkLines(this.cues(), this.active()!) : []));
  protected readonly statuses = computed<Status[]>(() =>
    this.cues().map((c, i) => {
      // a line the user changed or vouched for by ear outranks the automatic check
      if (c.confidence === 'verified' || this.touched().has(c.id)) return 'ok';
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
  /** The line being sung: the last one that has started (stays on it through short gaps). */
  protected readonly playingIndex = computed(() => {
    const t = this.time();
    let k = -1;
    this.cues().forEach((c, i) => {
      if (c.start <= t) k = i;
    });
    return k;
  });

  constructor() {
    const raf = { id: 0 };
    const tick = () => {
      const now = this.audio.currentTime;
      if (this.stopAt !== null && now >= this.stopAt) {
        this.audio.pause();
        this.stopAt = null;
      }
      // loop: past the selected line's end, back to just before its start
      const sel = this.cues()[this.selected()];
      if (this.loop() && sel && !this.audio.paused && this.stopAt === null && now > sel.end + 0.3) this.audio.currentTime = Math.max(0, sel.start - 0.5);
      this.time.set(this.audio.currentTime);
      this.draw();
      raf.id = requestAnimationFrame(tick);
    };
    raf.id = requestAnimationFrame(tick);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(raf.id);
      this.audio.pause();
    });
    effect(() => {
      const i = this.playingIndex();
      if (!this.follow() || !this.playing() || i < 0 || i === this.lastFollow) return;
      this.lastFollow = i;
      this.selected.set(i);
      // leave the list alone for a moment after the user scrolls it themselves
      if (Date.now() - this.userScrollAt > 2500) this.scrollTo(i);
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
    this.singers.set((song.singers ?? []).map((x) => ({ ...x })));
    this.touched.set(new Set());
    this.undoStack = [];
    this.redoStack = [];
    this.canUndo.set(false);
    this.canRedo.set(false);
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
  private setLine(i: number, patch: Partial<Pick<TimelineCue, 'start' | 'end'>>, ripple = this.ripple(), snapshot = true) {
    if (snapshot) this.remember();
    const list = this.cues().map((c) => ({ ...c }));
    const c = list[i];
    const lo = i > 0 ? list[i - 1].start + 0.05 : 0;
    if (patch.start !== undefined) {
      const before = c.start;
      const shift = Math.max(lo, patch.start) - before;
      // ripple: alignment errors come in runs (one late line pushes every following one), so the lines after move
      // with it until the next line the user already fixed
      if (ripple && Math.abs(shift) > 0.001) {
        c.end += shift;
        for (let j = i + 1; j < list.length && !this.touched().has(list[j].id); j++) {
          list[j].start = +(list[j].start + shift).toFixed(3);
          list[j].end = +(list[j].end + shift).toFixed(3);
        }
        const stop = list.findIndex((x, j) => j > i && this.touched().has(x.id));
        if (stop > 0) list[stop - 1].end = Math.min(list[stop - 1].end, list[stop].start);
      }
      list.splice(0, list.length, ...moveEdge(list, i, 'start', Math.max(lo, patch.start), this.song()!.duration));
    }
    // a back-to-back neighbour follows the shared edge (timing-edit.ts)
    if (patch.end !== undefined) list.splice(0, list.length, ...moveEdge(list, i, 'end', patch.end, this.song()!.duration));
    this.cues.set(list);
    this.touched.update((s) => new Set(s).add(c.id));
    this.dirty.set(true);
  }

  protected nudge(i: number, edge: 'start' | 'end', d: number, ripple = this.ripple()) {
    this.setLine(i, { [edge]: this.cues()[i][edge] + d }, ripple);
  }

  // ---- undo / redo
  private snapshot() {
    return { cues: this.cues().map((c) => ({ ...c })), touched: new Set(this.touched()) };
  }

  private remember() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.canUndo.set(true);
    this.canRedo.set(false);
  }

  protected undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.cues.set(s.cues);
    this.touched.set(s.touched);
    this.dirty.set(true);
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(true);
  }

  protected redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.cues.set(s.cues);
    this.touched.set(s.touched);
    this.dirty.set(true);
    this.canUndo.set(true);
    this.canRedo.set(this.redoStack.length > 0);
  }

  // ---- listening
  protected setSpeed(v: number) {
    this.speed.set(v);
    this.audio.playbackRate = v;
  }

  /** Plays [from, to] and stops (Q/W/E/D: the half second around a line's start or end). */
  private playRange(from: number, to: number) {
    this.audio.currentTime = Math.max(0, from);
    this.stopAt = to;
    void this.audio.play();
  }

  /** The next line still to check (red first, then yellow), after the selected one; wraps around. */
  protected nextProblem() {
    const st = this.statuses();
    const n = st.length;
    const from = this.selected();
    const find = (want: Status) => Array.from({ length: n }, (_, k) => (from + 1 + k) % n).find((j) => st[j] === want);
    const j = find('red') ?? find('yellow');
    if (j === undefined) return this.message.set('沒有待確認的句子了');
    this.selected.set(j);
    this.scrollTo(j);
    this.audio.currentTime = Math.max(0, this.cues()[j].start - 1);
  }

  /** Shift-drag: the nearest beat, voice onset or other line edge within SNAP. */
  private snapped(t: number, index: number): number {
    const song = this.song()!;
    const onsets = this.active() ? voicedSpans(this.active()!).map((x) => x[0]) : [];
    const edges = this.cues().flatMap((c, j) => (j === index ? [] : [c.start, c.end]));
    return snapTo(t, [...(song.beats ?? []), ...onsets, ...edges], SNAP);
  }

  protected setNow(i: number, edge: 'start' | 'end') {
    // a tap lands ~0.12 s after the sound (reaction time); a start then snaps to the voice onset nearby
    let t = this.audio.currentTime - (edge === 'start' ? 0.12 : 0);
    const spans = this.active() ? voicedSpans(this.active()!) : [];
    if (edge === 'start') {
      const onset = spans.map((x) => x[0]).filter((o) => o >= t - 0.3 && o <= t + 0.15).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
      if (onset !== undefined) t = onset;
    }
    this.setLine(i, { [edge]: t });
  }

  protected useStart(i: number, t: number) {
    this.setLine(i, { start: t });
    this.playLine(i);
  }

  protected accept(i: number) {
    this.remember();
    this.touched.update((s) => new Set(s).add(this.cues()[i].id));
    this.dirty.set(true);
  }

  // ---- singers
  private static readonly SWATCHES = ['#ff5c8a', '#4fb3ff', '#ffd23f', '#5ce1a1', '#b38bff', '#ff8a3d', '#f4f2ee', '#ff4d4d'];

  protected addSinger() {
    const n = this.singers().length;
    this.singers.update((l) => [...l, { name: `成員${n + 1}`, color: TimingPage.SWATCHES[n % TimingPage.SWATCHES.length] }]);
    this.dirty.set(true);
  }

  protected editSinger(k: number, patch: Partial<{ name: string; color: string }>) {
    const old = this.singers()[k];
    const name = patch.name?.trim();
    if (patch.name !== undefined && (!name || this.singers().some((x, j) => j !== k && x.name === name))) return;
    this.singers.update((l) => l.map((x, j) => (j === k ? { ...x, ...patch, ...(name ? { name } : {}) } : x)));
    // a renamed member keeps their lines
    if (name && name !== old.name) this.cues.update((l) => l.map((c) => (c.singer === old.name ? { ...c, singer: name } : c)));
    this.dirty.set(true);
  }

  protected removeSinger(k: number) {
    const gone = this.singers()[k].name;
    this.singers.update((l) => l.filter((_, j) => j !== k));
    this.cues.update((l) => l.map((c) => (c.singer === gone ? { ...c, singer: undefined } : c)));
    this.dirty.set(true);
  }

  protected setSinger(i: number, name: string) {
    this.remember();
    this.cues.update((l) => l.map((c, j) => (j === i ? { ...c, singer: name || undefined } : c)));
    this.dirty.set(true);
  }

  protected singerColor(name?: string) {
    return this.singers().find((x) => x.name === name)?.color ?? 'transparent';
  }

  /** Retypes a line (a misheard or missing word); its per-character times are rebuilt on save. */
  protected retype(i: number, value: string) {
    const text = value.trim();
    if (!text || text === this.cues()[i].text) return;
    this.remember();
    this.cues.update((l) => l.map((c, j) => (j === i ? { ...c, text } : c)));
    this.touched.update((s) => new Set(s).add(this.cues()[i].id));
    this.dirty.set(true);
  }

  /** A new line after line i: in the gap before the next line, or the second half of line i when there is none. */
  protected addAfter(i: number) {
    this.remember();
    const list = this.cues().map((c) => ({ ...c }));
    const c = list[i];
    const next = list[i + 1];
    const gapEnd = next ? next.start - 0.05 : this.song()!.duration;
    let start = c.end + 0.05;
    let end = Math.min(gapEnd, start + 3);
    if (end - start < 0.6) {
      start = +((c.start + c.end) / 2).toFixed(3);
      end = c.end;
      c.end = start;
    }
    const added: TimelineCue = { id: `n${Date.now().toString(36)}`, start, end, text: '新的一句', timingSource: 'lrc', confidence: 'verified' };
    list.splice(i + 1, 0, added);
    this.cues.set(list);
    this.touched.update((s) => new Set(s).add(added.id));
    this.selected.set(i + 1);
    this.dirty.set(true);
    setTimeout(() => this.list()?.nativeElement.querySelector<HTMLInputElement>(`[data-index="${i + 1}"] .text`)?.select());
  }

  protected remove(i: number) {
    if (this.cues().length <= 1) return;
    this.remember();
    this.cues.update((l) => l.filter((_, j) => j !== i));
    this.selected.set(Math.min(i, this.cues().length - 1));
    this.dirty.set(true);
  }

  protected edit(i: number, edge: 'start' | 'end', value: string) {
    const v = Number(value);
    if (Number.isFinite(v)) this.setLine(i, { [edge]: v });
  }

  /** Scrolls only the line list (scrollIntoView would scroll the whole page too). */
  private scrollTo(i: number) {
    const box = this.list()?.nativeElement;
    const el = box?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!box || !el) return;
    if (box.scrollHeight <= box.clientHeight) return void el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // narrow layout: the page scrolls
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }

  protected userScrolled() {
    this.userScrollAt = Date.now();
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
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || !this.song()) return;
    const i = this.selected();
    const c = this.cues()[i];
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.code === 'KeyZ') e.shiftKey ? this.redo() : this.undo();
    else if (mod && e.code === 'KeyY') this.redo();
    else if (mod) return;
    else if (e.code === 'KeyQ') this.playRange(c.start - EDGE_LISTEN, c.start);
    else if (e.code === 'KeyW') this.playRange(c.start, c.start + EDGE_LISTEN);
    else if (e.code === 'KeyE') this.playRange(c.end - EDGE_LISTEN, c.end);
    else if (e.code === 'KeyD') this.playRange(c.end, c.end + EDGE_LISTEN);
    else if (e.code === 'KeyL') this.loop.set(!this.loop());
    else if (e.code === 'KeyN') this.nextProblem();
    else if (e.code === 'BracketLeft') this.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed()) - 1)]);
    else if (e.code === 'BracketRight') this.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed()) + 1)]);
    else if (e.code === 'Space') this.toggle();
    else if (e.code === 'Enter') {
      this.setNow(i, 'start');
      this.lastFollow = i; // the line just tapped is now playing: following must not pull the selection back to it
      this.selected.set(Math.min(this.cues().length - 1, i + 1));
      this.scrollTo(this.selected());
    } else if (e.code === 'ArrowLeft') this.nudge(i, e.shiftKey ? 'end' : 'start', -NUDGE, e.altKey !== this.ripple());
    else if (e.code === 'ArrowRight') this.nudge(i, e.shiftKey ? 'end' : 'start', NUDGE, e.altKey !== this.ripple());
    else if (e.code === 'ArrowUp') {
      this.selected.set(Math.max(0, i - 1));
      this.scrollTo(this.selected());
    } else if (e.code === 'ArrowDown') {
      this.selected.set(Math.min(this.cues().length - 1, i + 1));
      this.scrollTo(this.selected());
    }
    else return;
    e.preventDefault();
  }

  protected async save(confirm: boolean) {
    const id = this.songId();
    if (!id) return;
    const r = await fetch(`/lyric-vj/songs/${encodeURIComponent(id)}/cues`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cues: this.cues().map(({ id, start, end, text, singer }) => ({ id, start, end, text, singer: singer ?? '' })), confirm, accepted: [...this.touched()], singers: this.singers() }),
    });
    const body = await r.json();
    if (!r.ok) return this.message.set(`儲存失敗：${body.error}`);
    this.dirty.set(false);
    // a design styles each line by id: added, removed or retyped lines need the design redone
    const before = this.song()!.cues;
    const reshaped = before.length !== this.cues().length || this.cues().some((c, i) => c.id !== before[i]?.id || c.text !== before[i]?.text);
    const note = reshaped ? '歌詞的句子有增減或改字：已經做好的設計要到 Studio 按「方向不對，重做設計」才會套用新歌詞。' : '';
    this.message.set(`${confirm ? '時間軸已確認，可以開始生成 VJ。' : '已儲存。'}${note}`);
    await this.open(id);
    await this.loadList();
  }

  // ---- waveform
  private viewStart() {
    return Math.max(0, this.time() - this.viewSec() * 0.35);
  }

  private draw() {
    const cv = this.canvas()?.nativeElement;
    const song = this.song();
    if (!cv || !song) return;
    const w = (cv.width = cv.clientWidth * devicePixelRatio);
    const h = (cv.height = cv.clientHeight * devicePixelRatio);
    const g = cv.getContext('2d')!;
    const t0 = this.viewStart();
    const view = this.viewSec();
    const x = (t: number) => ((t - t0) / view) * w;
    g.clearRect(0, 0, w, h);
    // the beat grid: faint beats, stronger bar lines (edges are placed by ear against the rhythm)
    const bars = new Set((song.downbeats ?? []).map((b) => b.toFixed(2)));
    for (const b of song.beats ?? []) {
      if (b < t0 || b > t0 + view) continue;
      g.fillStyle = bars.has(b.toFixed(2)) ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.1)';
      g.fillRect(x(b), 0, devicePixelRatio, h);
    }
    const st = this.statuses();
    this.cues().forEach((c, i) => {
      if (c.end < t0 || c.start > t0 + view) return;
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
        const f = Math.floor((t0 + (px / w) * view) * 100);
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
    return this.viewStart() + ((e.clientX - r.left) / r.width) * this.viewSec();
  }

  protected down(e: MouseEvent) {
    const t = this.timeAt(e);
    const px = this.viewSec() / this.canvas()!.nativeElement.getBoundingClientRect().width;
    const near = (a: number) => Math.abs(a - t) < 6 * px;
    const i = this.cues().findIndex((c) => near(c.start) || near(c.end));
    if (i >= 0) {
      // Alt flips "move the rest with it" for this drag; one undo step for the whole drag
      this.drag = { index: i, edge: near(this.cues()[i].start) ? 'start' : 'end', ripple: e.altKey !== this.ripple() };
      this.remember();
      this.selected.set(i);
    } else this.audio.currentTime = t; // click empty space to seek
  }

  protected move(e: MouseEvent) {
    if (!this.drag) return;
    const t = this.timeAt(e);
    this.setLine(this.drag.index, { [this.drag.edge]: e.shiftKey ? this.snapped(t, this.drag.index) : t }, this.drag.ripple, false);
  }

  protected up() {
    this.drag = null;
  }

  /** Wheel: up/down zooms the waveform, sideways (or Shift) moves through the song. */
  protected wheel(e: WheelEvent) {
    e.preventDefault();
    const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (sideways) {
      const d = (e.shiftKey ? e.deltaY : e.deltaX) / 400;
      this.audio.currentTime = Math.max(0, Math.min(this.song()!.duration, this.audio.currentTime + d * this.viewSec()));
      return;
    }
    this.viewSec.set(Math.min(VIEW_MAX, Math.max(VIEW_MIN, this.viewSec() * Math.exp(e.deltaY / 300))));
    this.draw();
  }
}
