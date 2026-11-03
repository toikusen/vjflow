import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { audioType, BetaJob, BetaMe, BetaSong, CONCEPT_PRICE, coverTint, errorOf, filterCounts, inFilter, jobProgress, jsonOrError, nextStep, pollToast, songChip, SongFilter, SONG_FILTERS, songView, SongView, stepsMin, TIER_INFO } from './beta';
import { MAX_CONCEPTS } from './make';
import { balance } from './ui/balance';
import { BalanceComponent } from './ui/balance.component';
import { Ask } from './ui/confirm';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';
import { BetaSession, pollGate, signedOutBy } from './ui/session';
import { StatusChipComponent } from './ui/status-chip.component';

const POLL_MS = 5000;

export type { Ask } from './ui/confirm';
const LANGS: Record<string, string> = { ja: '日文', zh: '中文', en: '英文', ko: '韓文' };
/** Thrown by a fetch whose answer was 401, so the page shows its signed-out panel instead of a toast. */
const SIGNED_OUT = new Error('signed out');

/** A tester's songs (served by scripts/lyric-vj/beta/server.mts): 做一支新影片 on top; each card opens its song page. */
@Component({
  selector: 'app-beta-page',
  imports: [BalanceComponent, ConfirmDialogComponent, PriceComponent, StatusChipComponent],
  templateUrl: './beta.page.html',
  styleUrl: './list.page.scss',
})
export class BetaPage {
  /** Shared with the shell, so its balance pill follows this page's poll. */
  private readonly session = inject(BetaSession);
  protected readonly me = this.session.me;
  /** A /beta request answered 401 (no or stale invite link): the page shows only how to get a new link. */
  protected readonly signedOut = signal(false);
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly jobs = signal<BetaJob[]>([]);
  protected readonly message = signal('');
  /** An upload is in flight: the browser warns before the page is left. */
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  protected readonly chip = (v: SongView) => songChip(v);
  protected readonly progress = (j: BetaJob) => jobProgress(j);
  protected readonly filters = SONG_FILTERS;
  protected readonly filter = signal<SongFilter>('all');
  /** Each song as its card shows it: state, chip, cover tint, subtitle, progress (while something runs) and next step. */
  protected readonly cards = computed(() =>
    this.songs().map((song) => {
      const view = songView(song, this.jobs());
      const job = view.active ?? (view.stage === 'preparing' ? view.prep : undefined);
      const progress = job ? jobProgress(job) : undefined;
      const made = view.results.length;
      return {
        song,
        view,
        chip: songChip(view),
        tint: coverTint(song.id),
        meta: [song.artist, this.langName(song.language), made ? `${made} 個成品` : '尚無成品'].filter(Boolean).join(' · '),
        pct: progress?.pct,
        next: nextStep(view, progress),
      };
    }),
  );
  protected readonly counts = computed(() => filterCounts(this.cards().map((c) => c.view)));
  protected readonly shown = computed(() => this.cards().filter((c) => inFilter(this.filter(), c.view)));
  protected readonly ask = signal<Ask | null>(null);
  protected readonly prepMin = stepsMin('prep');
  protected readonly conceptPrice = CONCEPT_PRICE;
  protected readonly conceptMin = stepsMin('concept');
  protected readonly maxConcepts = MAX_CONCEPTS;
  protected readonly tiers = [TIER_INFO.none, TIER_INFO.img, TIER_INFO.hybrid];
  protected readonly langName = (l: string) => LANGS[l] ?? l;
  /** What the signed-in person has left, null until `/beta/me` answers. */
  protected readonly left = () => {
    const m = this.me();
    return m ? balance(m).left : null;
  };
  /** The poll in flight, if any, and the order of polls: a tick waits while one runs, a late answer or one begun before a 401 is dropped. */
  private polling: Promise<void> | null = null;
  private readonly polls = pollGate();
  /** The toast the last failed poll wrote, cleared by the next poll that succeeds. */
  private readonly toast = pollToast();

  constructor() {
    const timer = setInterval(() => void (this.polling ?? this.poll()), POLL_MS);
    // leaving mid-upload cuts the audio off; once it is on the server the work goes on without this page
    const stay = (e: BeforeUnloadEvent) => this.busy() && e.preventDefault();
    addEventListener('beforeunload', stay);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      removeEventListener('beforeunload', stay);
    });
    this.poll();
  }

  /**
   * Sends a song's audio (`PUT /beta/songs/:id/audio`); the server starts the preparation on success. Throws with the
   * server's words when it refuses, or a connection line when the upload broke off.
   */
  protected async uploadAudio(songId: string, file: File): Promise<void> {
    let up: Response;
    try {
      up = await fetch(`/beta/songs/${songId}/audio`, { method: 'PUT', headers: { 'content-type': audioType(file) ?? 'audio/mpeg' }, body: file });
    } catch {
      throw new Error('連線中斷，請確認網路後再試');
    }
    if (signedOutBy(up.status)) throw SIGNED_OUT;
    if (!up.ok) throw new Error(errorOf(await jsonOrError(up), up.status));
  }

  /** Forgets the person and their songs after a 401; polls still in flight cannot bring them back. */
  protected signOut() {
    this.polls.signOut();
    this.session.signOut();
    this.songs.set([]);
    this.jobs.set([]);
    this.loaded.set(false);
    this.message.set('');
    this.signedOut.set(true);
  }

  protected poll(): Promise<void> {
    const run = async () => {
      const n = this.polls.begin();
      const get = async <T,>(path: string): Promise<T> => {
        const r = await fetch(path, { cache: 'no-store' });
        if (signedOutBy(r.status)) throw SIGNED_OUT;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      // settled one by one, so a 401 still counts when another request of the batch failed first
      const [me, songs, jobs] = await Promise.allSettled([get<BetaMe>('/beta/me'), get<BetaSong[]>('/beta/songs'), get<BetaJob[]>('/beta/jobs')]);
      const failed = [me, songs, jobs].filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
      // a 401 counts even from an older poll; a network error or another status keeps the old lists and is a toast
      if (failed.includes(SIGNED_OUT)) return this.signOut();
      if (failed.length) {
        if (this.polls.latest(n)) this.message.set(this.toast.failed(failed[0] instanceof Error ? failed[0].message : String(failed[0])));
        return;
      }
      // a newer poll (after an action) began meanwhile: its answer is the fresher one
      if (!this.polls.latest(n) || me.status !== 'fulfilled' || songs.status !== 'fulfilled' || jobs.status !== 'fulfilled') return;
      this.signedOut.set(false);
      this.me.set(me.value);
      this.songs.set([...songs.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      this.jobs.set(jobs.value);
      this.loaded.set(true);
      this.message.update((m) => this.toast.ok(m));
    };
    const p = run().finally(() => {
      if (this.polling === p) this.polling = null;
    });
    return (this.polling = p);
  }
}
