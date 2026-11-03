import { EditResult, graphemeIndexAt, mergeLines, moveEdge, reflow, shiftAll, snapTo, splitLine, TAP_REACTION } from './timing-edit';
import { phraseBoundaries } from '../../lyric-vj/phrases';
import { Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { BetaJob, jsonOrError } from '../beta/beta';
import { timingSaveWarning } from '../beta/make';
import { Ask } from '../beta/ui/confirm';
import { ConfirmDialogComponent } from '../beta/ui/confirm-dialog.component';
import { StatusChipComponent } from '../beta/ui/status-chip.component';
import { applyProof, exportIssues, LyricProof, proofNote, SongTimeline, TimelineCue, toLrc, toSrt, vocalActivity, voicedSpans } from '../../lyric-vj/timeline';
import { checkLines, ISSUE_LABEL, LineCheck } from '../../lyric-vj/timing-qa';
import { busyLock, BusyLock, clock, confirmBlocker, countChips, GUIDE_SEEN_KEY, hint, Hint, leaveGuard, lineTag, LineTag, localChips, localTag, nextProblemIndex, peaksOf, playingLabel, readFlag, remaining, rowNumber, sec, SHORTCUTS, singleFlight, songPageHref, stepRow, timingChanged, visibleRows, writeFlag } from './timing-view';

interface SongItem {
  id: string;
  title: string;
  lines: number;
  review: number;
  confirmedAt: string | null;
}

type Status = 'red' | 'yellow' | 'ok';

/**
 * A song the editor holds only in memory: nothing is fetched or saved through a server. The host owns the file and the
 * lines; `keep` hands it every edit and says whether the work is safe, and `song.cues` carry a `review` note on the lines
 * still to be checked.
 */
export interface LocalTiming {
  song: SongTimeline;
  /** A blob URL of the person's own file. */
  audioUrl: string;
  /** Per 10 ms, as peaksOf gives them; the waveform stays empty without. */
  peaks?: Float32Array;
  /** Lines a person already set: they stop a ripple and read as checked. */
  settled: ReadonlySet<string>;
  keep: (cues: TimelineCue[], settled: ReadonlySet<string>) => boolean;
}

const QA_LABELS = new Set(Object.values(ISSUE_LABEL));
const VIEW_SEC = 16; // seconds visible on the waveform at first; the wheel zooms between these
const VIEW_MIN = 2;
const VIEW_MAX = 60;
const NUDGE = 0.05;
const EDGE_LISTEN = 0.5; // Q/W/E/D play this long before/after a line's start or end
const SNAP = 0.15; // Shift while dragging: an edge within this of a beat, a voice onset or a line edge lands on it
const SPEEDS = [0.5, 1, 1.5];
const JOBS_POLL_MS = 5000; // how often a tester's editor re-reads /beta/jobs for a job that locks the timing

/**
 * Lyric timing editor: the song plays over a lyrics-only preview while each line's start/end is checked live against
 * the vocal stem. Red lines need the person's look (fixed, or kept with 「我確認沒問題」); yellow lines were uncertain for the aligner. Nothing is generated until the
 * user confirms the timeline here.
 */
@Component({
  selector: 'app-timing-page',
  imports: [ConfirmDialogComponent, StatusChipComponent],
  templateUrl: './timing.page.html',
  styleUrl: './timing.page.scss',
})
export class TimingPage implements OnInit {
  /** Set by a host that brings its own song (/free): no list, no server, no jobs. Read from ngOnInit on, never earlier. */
  readonly local = input<LocalTiming>();
  /** A local song is finished with, at this playhead time. */
  readonly done = output<number>();
  protected readonly songs = signal<SongItem[]>([]);
  /** A beta tester's song (/timing?beta=<id>): read and saved through scripts/lyric-vj/beta/server.mts, no song list. */
  protected readonly beta = new URLSearchParams(location.search).get('beta');
  protected readonly songId = signal<string | null>(this.beta ?? new URLSearchParams(location.search).get('song'));
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
  private poll = { id: 0, gone: false };
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
  /** The 更多 menu (downloads, undo, whole-song shift, every shortcut). */
  protected readonly more = signal(false);
  protected readonly shortcuts = SHORTCUTS;
  /** The 「?」 panel: how to check, and every shortcut. */
  protected readonly help = signal(false);
  protected readonly guideSteps = [
    '列表列出每一句，系統標出來要確認的句子是紅色或黃色（按「只看需要確認的」可以只看那幾句）',
    '按「聽」；對得上就按「我確認沒問題」（或「保留現在的」），會自動跳到下一句；對不上才改開始／結束（或唱到時按「設為現在」）',
    '沒有需要確認的句子後，按「確認時間軸」',
  ];
  protected readonly sec = sec;
  protected readonly rowNumber = rowNumber;
  /** Back to the tester's song page, or to the dashboard's song list. */
  protected readonly backHref = this.beta ? songPageHref(this.beta) : '/timing';
  /** The warning before a save that would void a tester's pending concept (beta mode only); saving charges nothing. */
  protected readonly ask = signal<Ask | null>(null);
  /** Which save button is waiting on the server (both stay off meanwhile). */
  protected readonly saving = signal<'draft' | 'confirm' | null>(null);
  /**
   * A tester's concept, video or fix running on this song (polled from /beta/jobs): the editor is read-only until it
   * ends. Edits made before stay in memory. The server refuses a save then too; this only says so up front.
   */
  protected readonly lock = signal<BusyLock | null>(null);
  /** Edits are off while a job locks the timing or a save is on the way (the reload after it would drop them). */
  protected readonly readOnly = computed(() => !!this.lock() || !!this.saving());
  /** The 「怎麼檢查」 guide: open on the first visit, folded on later ones. */
  protected readonly guideOpen = signal(!readFlag(() => localStorage.getItem(GUIDE_SEEN_KEY)));
  /** 「只看需要確認的」: the list shows only red/yellow lines and the selected one; off at the start, every line listed (nothing is remembered). */
  protected readonly onlyProblems = signal(false);
  /** The 演唱者 card: one line until opened; open from the start when the song already has singers. */
  protected readonly singersOpen = signal(false);

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
  protected readonly shown = computed(() => visibleRows(this.statuses(), this.selected(), this.onlyProblems()));
  /** The filter is on and every line is fine: the list shows a single line saying so. */
  protected readonly nothingToCheck = computed(() => this.onlyProblems() && !this.shown().some(Boolean));
  protected readonly counts = computed(() => ({
    red: this.statuses().filter((s) => s === 'red').length,
    yellow: this.statuses().filter((s) => s === 'yellow').length,
    ok: this.statuses().filter((s) => s === 'ok').length,
  }));
  /** The big readout split so the hundredths can be smaller; both parts keep their width. */
  protected readonly clock = computed(() => clock(this.time()));
  protected readonly todo = computed(() => (this.local() ? this.chips()[0].label.replace(/^(\d+)/, '還有 $1') : remaining(this.counts().red, this.counts().yellow)));
  protected readonly chips = computed(() => (this.local() ? localChips(this.counts()) : countChips(this.counts())));
  protected readonly blocker = computed(() => confirmBlocker(this.counts().red));
  protected readonly nowLabel = computed(() => playingLabel(this.playingIndex(), this.playing(), this.song()?.duration ?? 0));
  /** The line on screen in the lyrics-only preview. */
  protected readonly current = computed(() => this.cues().find((c) => this.time() >= c.start && this.time() < c.end) ?? null);
  /** The preview stage: the line sung now, else the next one dimmed so a gap shows what comes. */
  protected readonly stageLine = computed(() => {
    const c = this.current();
    if (c) return { cue: c, next: false };
    const n = this.cues().find((x) => x.start > this.time());
    return n ? { cue: n, next: true } : null;
  });
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
    // unsaved edits (twenty lines moved on a phone, say) must not vanish on a back tap or a switch of app
    const stay = leaveGuard(() => this.dirty());
    addEventListener('beforeunload', stay);
    const poll = { id: 0, gone: false };
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(raf.id);
      this.audio.pause();
      removeEventListener('beforeunload', stay);
      poll.gone = true;
      clearInterval(poll.id);
    });
    this.poll = poll;
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
    // a local song is kept by its host edit by edit; `dirty` stays up only if that failed, and the guard then asks
    effect(() => {
      const host = this.local();
      if (!host || !this.dirty()) return;
      this.dirty.set(!host.keep(this.cues(), this.touched()));
    });
  }

  ngOnInit() {
    const host = this.local();
    if (host) return this.openLocal(host);
    if (this.beta) {
      const beta = this.beta;
      const poll = this.poll;
      // a reply that lands after the page is gone must not touch it
      // one read at a time: a slow reply must not land after (and overwrite) a newer one
      const check = singleFlight(async () => {
        const jobs = await this.fetchJobs();
        if (poll.gone || !jobs) return; // an unreadable list keeps the last answer
        this.lock.set(busyLock(jobs, beta));
        if (this.lock()) this.drag = null;
      });
      void check();
      poll.id = window.setInterval(() => void check(), JOBS_POLL_MS);
    }
    if (!this.beta) void this.loadList();
    const id = this.songId();
    if (id) void this.open(id);
  }

  /**
   * Opens the host's song. Estimated times can be seconds off, so unlike a saved song: the lines after a moved line move
   * with it, and the selection stays where Enter left it instead of following times that are not right yet.
   */
  private openLocal(host: LocalTiming) {
    this.song.set(host.song);
    this.cues.set(host.song.cues.map((c) => ({ ...c })));
    this.touched.set(new Set(host.settled));
    this.onlyProblems.set(false);
    this.follow.set(false);
    this.ripple.set(true);
    this.peaks = host.peaks ?? null;
    this.selected.set(Math.max(0, this.statuses().findIndex((s) => s !== 'ok')));
    this.audio.src = host.audioUrl;
  }

  protected finish() {
    this.audio.pause();
    this.done.emit(this.audio.currentTime);
  }

  protected issueText(i: number): string {
    const qa = this.checks()[i]?.issues.map((k) => ISSUE_LABEL[k]) ?? [];
    const aligner = this.statuses()[i] === 'yellow' ? (this.cues()[i].review ?? []).filter((r) => !QA_LABELS.has(r)) : [];
    return [...qa, ...aligner].join('、');
  }

  /** The status column of row i. */
  protected tag(i: number): LineTag {
    const c = this.cues()[i];
    return (this.local() ? localTag : lineTag)(this.statuses()[i], { listening: i === this.selected() && i === this.playingIndex() && this.playing(), verified: c.confidence === 'verified' || this.touched().has(c.id) });
  }

  /** The line under row i when it needs a look: a fix to take or the reason, and a way to keep it. */
  protected hint(i: number): Hint | null {
    if (this.local() && i !== this.selected()) return null; // every line of a new song is estimated: one note, not a list of them
    return hint(this.cues()[i], this.checks()[i], this.statuses()[i], this.issueText(i));
  }

  /** The 更多 menu and the 「?」 panel close on a click anywhere outside them. */
  @HostListener('document:click', ['$event'])
  protected outside(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.more')) return;
    this.more.set(false);
    this.help.set(false);
  }

  /** Where a song's timing, audio and cues are served. */
  private api(id: string) {
    return this.beta ? `/beta/songs/${encodeURIComponent(id)}` : `/lyric-vj/songs/${encodeURIComponent(id)}`;
  }

  private async loadList() {
    const r = await fetch('/lyric-vj/songs', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return this.message.set('讀不到歌曲清單，請先執行 npx tsx scripts/lyric-vj/dashboard.mts');
    this.songs.set(await r.json());
  }

  protected async open(id: string) {
    this.songId.set(id);
    if (!this.beta) history.replaceState(null, '', `/timing?song=${encodeURIComponent(id)}`);
    const base = this.api(id);
    this.loading.set('讀取歌曲…');
    const r = await fetch(this.beta ? `${base}/timing` : base, { cache: 'no-store' }).catch(() => null);
    const body = r ? await jsonOrError<SongTimeline>(r) : { error: '無法連線，請稍後再試' };
    // a song still preparing (409), someone else's (404), or an error page: say so instead of 讀取歌曲… for ever
    if (!r?.ok || body.error) {
      this.loading.set(null);
      this.message.set(`讀不到這首歌：${body.error ?? `HTTP ${r?.status}`}`);
      return;
    }
    const song = body as SongTimeline;
    this.song.set(song);
    writeFlag(() => localStorage.setItem(GUIDE_SEEN_KEY, '1'));
    this.cues.set(song.cues.map((c) => ({ ...c })));
    this.singers.set((song.singers ?? []).map((x) => ({ ...x })));
    this.singersOpen.set(this.singers().length > 0);
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
      this.peaks = peaksOf(ch, decoded.sampleRate);
      this.selected.set(Math.max(0, this.statuses().findIndex((s) => s !== 'ok')));
      this.loading.set(null);
    } catch {
      this.loading.set('讀不到人聲分離軌：無法即時檢查時間');
    }
  }

  /** True (and the reason shown) while a job locks the timing or a save is on the way: every edit entry checks this first. */
  private locked(): boolean {
    const l = this.lock();
    if (l) this.message.set(l.message);
    else if (this.saving()) this.message.set('儲存中，存好後才能繼續改');
    return !!l || !!this.saving();
  }

  // ---- editing
  private setLine(i: number, patch: Partial<Pick<TimelineCue, 'start' | 'end'>>, ripple = this.ripple(), snapshot = true) {
    if (this.locked()) return;
    if (snapshot) this.remember();
    const list = this.cues().map((c) => ({ ...c }));
    const c = list[i];
    const lo = i > 0 ? list[i - 1].start + 0.05 : 0;
    if (patch.start !== undefined) {
      const before = c.start;
      const shift = Math.max(lo, patch.start) - before;
      // a line estimated seconds early ends before the moment it is really sung: it goes there whole
      if (this.local() && !ripple && patch.start >= c.end - 0.1) c.end = patch.start + c.end - before;
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
    this.cues.set(this.local() ? reflow(list, this.song()!.duration, (x) => x.id === c.id || this.touched().has(x.id)) : list);
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
    if (this.locked()) return;
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
    if (this.locked()) return;
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
  protected nextProblem(quiet = false) {
    const j = nextProblemIndex(this.statuses(), this.selected(), this.shown());
    if (j === undefined) return quiet ? undefined : this.message.set('沒有待確認的句子了');
    this.selected.set(j);
    this.scrollTo(j);
    const at = Math.max(0, this.cues()[j].start - 1);
    // while playing, following must not pull the selection back to the line sung in the lead-in second
    this.lastFollow = this.cues().reduce((k, c, x) => (c.start <= at ? x : k), -1);
    this.audio.currentTime = at;
  }

  /** Shift-drag: the nearest beat, voice onset or other line edge within SNAP. */
  private snapped(t: number, index: number): number {
    const song = this.song()!;
    const onsets = this.active() ? voicedSpans(this.active()!).map((x) => x[0]) : [];
    const edges = this.cues().flatMap((c, j) => (j === index ? [] : [c.start, c.end]));
    return snapTo(t, [...(song.beats ?? []), ...onsets, ...edges], SNAP);
  }

  protected setNow(i: number, edge: 'start' | 'end') {
    if (this.locked()) return;
    // a tap lands ~0.12 s after the sound (reaction time); a start then snaps to the voice onset nearby
    let t = this.audio.currentTime - (edge === 'start' ? TAP_REACTION : 0);
    const spans = this.active() ? voicedSpans(this.active()!) : [];
    if (edge === 'start') {
      const onset = spans.map((x) => x[0]).filter((o) => o >= t - 0.3 && o <= t + 0.15).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
      if (onset !== undefined) t = onset;
    }
    this.setLine(i, { [edge]: t });
  }

  /** Enter's edit: line i starts now and the next line is up. */
  private setAndStep(i: number) {
    this.setNow(i, 'start');
    this.lastFollow = i; // the line just tapped is now playing: following must not pull the selection back to it
    this.selected.set(Math.min(this.cues().length - 1, i + 1));
    this.scrollTo(this.selected());
  }

  /** The phone's big button (a local song): what Enter does while the song plays; before that it starts the song. */
  protected tapSelected() {
    if (this.audio.paused) return void this.audio.play();
    this.setAndStep(this.selected());
    // the new selection opens its controls on the next render; here the editor scrolls, not the list, and at once: the next tap may be a second away
    setTimeout(() => this.list()?.nativeElement.querySelector(`[data-index="${this.selected()}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  protected useStart(i: number, t: number) {
    if (this.locked()) return;
    this.setLine(i, { start: t });
    this.playLine(i);
    this.advance();
  }

  protected accept(i: number) {
    if (this.locked()) return;
    this.remember();
    this.touched.update((s) => new Set(s).add(this.cues()[i].id));
    this.dirty.set(true);
    this.advance();
  }

  /** A line just settled hands over to the next one to check (none left: the list says so). */
  private advance() {
    this.nextProblem(true);
  }

  // ---- singers
  private static readonly SWATCHES = ['#ff5c8a', '#4fb3ff', '#ffd23f', '#5ce1a1', '#b38bff', '#ff8a3d', '#f4f2ee', '#ff4d4d'];

  protected addSinger() {
    if (this.locked()) return;
    const n = this.singers().length;
    this.singers.update((l) => [...l, { name: `成員${n + 1}`, color: TimingPage.SWATCHES[n % TimingPage.SWATCHES.length] }]);
    this.dirty.set(true);
  }

  protected editSinger(k: number, patch: Partial<{ name: string; color: string }>) {
    if (this.locked()) return;
    const old = this.singers()[k];
    const name = patch.name?.trim();
    if (patch.name !== undefined && (!name || this.singers().some((x, j) => j !== k && x.name === name))) return;
    this.singers.update((l) => l.map((x, j) => (j === k ? { ...x, ...patch, ...(name ? { name } : {}) } : x)));
    // a renamed member keeps their lines
    if (name && name !== old.name) this.cues.update((l) => l.map((c) => (c.singer === old.name ? { ...c, singer: name } : c)));
    this.dirty.set(true);
  }

  protected removeSinger(k: number) {
    if (this.locked()) return;
    const gone = this.singers()[k].name;
    this.singers.update((l) => l.filter((_, j) => j !== k));
    this.cues.update((l) => l.map((c) => (c.singer === gone ? { ...c, singer: undefined } : c)));
    this.dirty.set(true);
  }

  protected setSinger(i: number, name: string) {
    if (this.locked()) return;
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
    if (this.locked() || !text || text === this.cues()[i].text) return;
    this.remember();
    this.cues.update((l) => l.map((c, j) => (j === i ? { ...c, text } : c)));
    this.touched.update((s) => new Set(s).add(this.cues()[i].id));
    this.dirty.set(true);
  }

  /**
   * A suspected typo the proofreading pass found (proofread.mts): taken (the line retyped with the correction) or
   * dismissed; either way it leaves the line's review.
   */
  protected fixProof(i: number, p: LyricProof, take: boolean) {
    if (this.locked()) return;
    this.remember();
    const c = this.cues()[i];
    const rest = { proof: c.proof?.filter((x) => x !== p), review: c.review?.filter((r) => r !== proofNote(p)) };
    this.cues.update((l) => l.map((x, j) => (j === i ? { ...x, ...rest, text: take ? applyProof(x.text, p) : x.text } : x)));
    if (take) this.touched.update((s) => new Set(s).add(c.id));
    this.dirty.set(true);
  }

  /** A new line after line i: in the gap before the next line, or the second half of line i when there is none. */
  protected addAfter(i: number) {
    if (this.locked()) return;
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
    if (this.locked() || this.cues().length <= 1) return;
    this.remember();
    this.cues.update((l) => l.filter((_, j) => j !== i));
    this.selected.set(Math.min(i, this.cues().length - 1));
    this.dirty.set(true);
  }

  private apply(r: EditResult<TimelineCue>, touch: string[]) {
    if (this.locked()) return;
    if (!r.ok) return this.message.set(r.message);
    this.remember();
    this.cues.set(r.lines);
    this.touched.update((s) => new Set([...s, ...touch]));
    this.dirty.set(true);
    this.message.set(null);
  }

  /** Splits line i where the caret is in its text, at the playhead (the right half becomes a new line). */
  protected split(i: number, input: HTMLInputElement) {
    const c = this.cues()[i];
    const newId = `n${Date.now().toString(36)}`;
    this.apply(splitLine(this.cues(), c.id, graphemeIndexAt(c.text, input.selectionStart ?? 0), +this.audio.currentTime.toFixed(3), newId), [c.id, newId]);
  }

  protected mergeNext(i: number) {
    this.apply(mergeLines(this.cues(), this.cues()[i].id), [this.cues()[i].id]);
  }

  protected shiftEverything(value: string) {
    const ids = this.cues().map((c) => c.id);
    this.apply(shiftAll(this.cues(), Number(value), this.song()!.duration), ids);
  }

  /** Downloads the lines as they are in the editor (saved or not); rounding problems are reported, not fixed. */
  protected download(kind: 'lrc' | 'srt') {
    const song = this.song()!;
    const cues = this.cues();
    const text = kind === 'lrc'
      ? toLrc({ title: song.title, cues }, (t) => [...phraseBoundaries(t)].sort((a, b) => a - b).filter((b) => b < [...t].length))
      : toSrt(cues);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `${song.title.replace(/[\\/:*?"<>|]/g, '_')}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
    const issues = exportIssues(cues);
    const unsaved = this.dirty() ? '（含尚未儲存的修改）' : '';
    this.message.set(issues.length ? `已下載 ${kind.toUpperCase()}${unsaved}，但請檢查：${issues.join('；')}` : `已下載 ${kind.toUpperCase()}${unsaved}`);
  }

  protected edit(i: number, edge: 'start' | 'end', value: string) {
    if (this.locked()) return;
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
    // read-only: the editing keys (undo/redo, Enter, ←/→) do nothing but say why; listening keys keep working
    const editKey = (mod && (e.code === 'KeyZ' || e.code === 'KeyY')) || (!mod && ['Enter', 'ArrowLeft', 'ArrowRight'].includes(e.code));
    if (editKey && this.locked()) return e.preventDefault();
    if (mod && e.code === 'KeyZ') e.shiftKey ? this.redo() : this.undo();
    else if (mod && e.code === 'KeyY') this.redo();
    else if (mod) return;
    else if (e.code === 'Escape' && (this.more() || this.help())) [this.more, this.help].forEach((s) => s.set(false));
    else if (e.code === 'KeyQ') this.playRange(c.start - EDGE_LISTEN, c.start);
    else if (e.code === 'KeyW') this.playRange(c.start, c.start + EDGE_LISTEN);
    else if (e.code === 'KeyE') this.playRange(c.end - EDGE_LISTEN, c.end);
    else if (e.code === 'KeyD') this.playRange(c.end, c.end + EDGE_LISTEN);
    else if (e.code === 'KeyL') this.loop.set(!this.loop());
    else if (e.code === 'KeyN') this.nextProblem();
    else if (e.code === 'BracketLeft') this.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed()) - 1)]);
    else if (e.code === 'BracketRight') this.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed()) + 1)]);
    else if (e.code === 'Space') this.toggle();
    else if (e.code === 'Enter') this.setAndStep(i);
    else if (e.code === 'ArrowLeft') this.nudge(i, e.shiftKey ? 'end' : 'start', -NUDGE, e.altKey !== this.ripple());
    else if (e.code === 'ArrowRight') this.nudge(i, e.shiftKey ? 'end' : 'start', NUDGE, e.altKey !== this.ripple());
    else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      this.selected.set(stepRow(this.shown(), i, e.code === 'ArrowUp' ? -1 : 1));
      this.scrollTo(this.selected());
    }
    else return;
    e.preventDefault();
  }

  /**
   * Saves the lines (and confirms the timing). A tester's song with a finished concept awaiting a decision asks first
   * when the lines changed: the server refuses to accept that concept once the timing differs from the concept's copy,
   * so the person must know before saving.
   */
  protected async save(confirm: boolean, warned = false) {
    const id = this.songId();
    if (!id || this.locked()) return;
    this.saving.set(confirm ? 'confirm' : 'draft');
    this.drag = null;
    const sent = await this.put(id, confirm, warned).finally(() => this.saving.set(null));
    if (!sent) return;
    this.dirty.set(false);
    // a design styles each line by id: added, removed or retyped lines need the design redone
    const before = this.song()!.cues;
    const reshaped = before.length !== this.cues().length || this.cues().some((c, i) => c.id !== before[i]?.id || c.text !== before[i]?.text);
    const note = reshaped && !this.beta ? '歌詞的句子有增減或改字：已經做好的設計要到 Studio 按「方向不對，重做設計」才會套用新歌詞。' : '';
    if (this.beta && confirm) return void location.assign(this.backHref);
    this.message.set(`${confirm ? '時間軸已確認，可以開始生成 VJ。' : '已儲存。'}${note}`);
    await this.open(id);
    if (!this.beta) await this.loadList();
  }

  /**
   * Sends the lines; false when nothing was saved (the person is asked first, or the server or the network said no,
   * with the reason in the toast). The server's own refusal (a job started meanwhile) stays the last line of defence.
   */
  private async put(id: string, confirm: boolean, warned: boolean): Promise<boolean> {
    if (this.beta && !warned && timingChanged(this.song()?.cues ?? [], this.cues())) {
      const warning = timingSaveWarning((await this.fetchJobs()) ?? [], id);
      if (warning) {
        this.ask.set({ ...warning, eyebrow: this.song()?.title, cost: 0, confirmLabel: confirm ? '仍要確認' : '仍要儲存', go: () => void this.save(confirm, true) });
        return false;
      }
    }
    try {
      const r = await fetch(`${this.api(id)}/cues`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cues: this.cues().map(({ id, start, end, text, singer }) => ({ id, start, end, text, singer: singer ?? '' })), confirm, accepted: [...this.touched()], singers: this.singers() }),
      });
      const body = await jsonOrError<{ error?: string }>(r);
      if (!r.ok) {
        this.message.set(`儲存失敗：${body.error ?? `HTTP ${r.status}`}`);
        return false;
      }
      return true;
    } catch {
      this.message.set('儲存失敗，請檢查網路後再試');
      return false;
    }
  }

  /**
   * The tester's jobs, for the pending-concept warning and the read-only lock; null when unreadable (no warning then,
   * and the lock keeps its last answer: the server still refuses what it must).
   */
  private async fetchJobs(): Promise<BetaJob[] | null> {
    try {
      const r = await fetch('/beta/jobs', { cache: 'no-store' });
      return r.ok ? ((await r.json()) as BetaJob[]) : null;
    } catch {
      return null;
    }
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
      g.fillStyle = bars.has(b.toFixed(2)) ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)';
      g.fillRect(x(b), 0, devicePixelRatio, h);
    }
    const dpr = devicePixelRatio;
    g.fillStyle = '#3a414b';
    g.fillRect(0, h / 2, w, dpr);
    const st = this.statuses();
    const sel = this.selected();
    this.cues().forEach((c, i) => {
      if (c.end < t0 || c.start > t0 + view) return;
      // the selected line is the coral span; the others are tinted by their status
      g.fillStyle = i === sel ? 'rgba(255,106,77,.2)' : st[i] === 'red' ? 'rgba(255,107,107,.18)' : st[i] === 'yellow' ? 'rgba(255,200,87,.16)' : 'rgba(199,204,211,.09)';
      g.fillRect(x(c.start), 0, x(c.end) - x(c.start), h);
      g.fillStyle = i === sel ? '#ff6a4d' : '#c7ccd3';
      g.fillRect(x(c.start) - dpr, 0, 2 * dpr, h);
      g.font = `500 ${11 * dpr}px 'Noto Sans TC', system-ui`;
      g.fillStyle = i === sel ? '#f4f5f7' : '#8b929c';
      g.fillText(c.text, x(c.start) + 6 * dpr, h - 10 * dpr, Math.max(0, x(c.end) - x(c.start) - 10 * dpr));
    });
    if (this.peaks) {
      g.fillStyle = 'rgba(244,245,247,.7)';
      const max = 0.0001 + this.peaks.reduce((m, v) => Math.max(m, v), 0) * 0.8;
      for (let px = 0; px < w; px += 2) {
        const f = Math.floor((t0 + (px / w) * view) * 100);
        const v = Math.min(1, (this.peaks[f] ?? 0) / max);
        g.fillRect(px, h / 2 - (v * h) / 2.8, 1.5, (v * h) / 1.4);
      }
    }
    // the coral playhead with its time tag hanging from the top edge
    const px = x(this.time());
    g.fillStyle = '#ff6a4d';
    g.fillRect(px - dpr, 0, 2 * dpr, h);
    g.font = `700 ${10 * dpr}px 'JetBrains Mono', monospace`;
    const label = this.time().toFixed(2);
    const tw = g.measureText(label).width + 12 * dpr;
    const left = Math.max(0, Math.min(w - tw, px - tw / 2));
    g.beginPath();
    g.roundRect(left, 0, tw, 16 * dpr, [0, 0, 5 * dpr, 5 * dpr]);
    g.fill();
    g.fillStyle = '#1a0c08';
    g.textBaseline = 'middle';
    g.fillText(label, left + 6 * dpr, 8 * dpr);
    g.textBaseline = 'alphabetic';
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
    const i = this.readOnly() ? -1 : this.cues().findIndex((c) => near(c.start) || near(c.end));
    if (i >= 0) {
      // Alt flips "move the rest with it" for this drag; one undo step for the whole drag
      this.drag = { index: i, edge: near(this.cues()[i].start) ? 'start' : 'end', ripple: e.altKey !== this.ripple() };
      this.remember();
      this.selected.set(i);
    } else this.audio.currentTime = t; // click empty space to seek
  }

  protected move(e: MouseEvent) {
    if (!this.drag || this.readOnly()) return;
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
