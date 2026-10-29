import { Component, computed, effect, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { phraseBoundaries } from '../../lyric-vj/phrases';
import { SongTimeline, toLrc, toSrt } from '../../lyric-vj/timeline';
import { audioProblem, BetaFeedback, BetaJob, BetaSong, BetaTier, CONCEPT_PRICE, coverTint, feedbackLine, minutesBetween, songKind, songView, SongView, TIER_INFO } from './beta';
import { BetaPage } from './beta.page';
import { ConceptCardComponent } from './concept-card.component';
import { MakeFormComponent } from './make-form.component';
import { hasDraft, ReportFormComponent } from './report-form.component';
import { canReupload, clock, draftsToReopen, failureCard, heroTone, jobTitle, jobTotal, PREP_FAILED_NOTE, safeName, stamp, stepClocks, timingNote, videoFileName } from './song';
import { BalanceComponent } from './ui/balance.component';
import { PriceComponent } from './ui/price.component';
import { StatusChip } from './ui/status';
import { StatusChipComponent } from './ui/status-chip.component';

const TIERS = Object.keys(TIER_INFO) as BetaTier[];
const RETRY_CHIP: StatusChip = { icon: '↻', label: '自動重試中 · 第一次製作遇到系統問題，不另外收費', tone: 'warn' };

/** One song (`/my/song?id=`): hero, the job in progress (or the failure), a concept awaiting a decision, every finished result, then 製作新版本. */
@Component({
  selector: 'app-beta-song-page',
  imports: [NgTemplateOutlet, ConceptCardComponent, MakeFormComponent, ReportFormComponent, BalanceComponent, PriceComponent, StatusChipComponent],
  templateUrl: './song.page.html',
  styleUrl: './song.page.scss',
})
export class BetaSongPage extends BetaPage {
  protected readonly id = new URLSearchParams(location.search).get('id') ?? '';
  protected readonly song = computed(() => this.songs().find((s) => s.id === this.id));
  protected readonly sv = computed(() => {
    const s = this.song();
    return s ? songView(s, this.jobs()) : undefined;
  });
  /** Whether this song is the signed-in person's own; an admin looking at someone else's cannot make or report. */
  protected readonly mine = computed(() => {
    const s = this.song();
    const m = this.me();
    return !!s && !!m && s.userId === m.id;
  });
  protected readonly heroChip = (v: SongView): StatusChip => (v.retrying ? RETRY_CHIP : this.chip(v));
  protected readonly tone = (v: SongView) => heroTone(songKind(v));
  /** 3a / 3b: nothing made and nothing running gets the one-row hero; a song with work to show gets the big one. */
  protected readonly compact = (v: SongView) => !v.results.length && !v.active;
  protected readonly tint = (s: BetaSong) => coverTint(s.id);
  protected readonly title = jobTitle;
  protected readonly total = (j: BetaJob) => jobTotal(j, this.jobs());
  protected readonly clocks = (j: BetaJob) => stepClocks(j);
  protected readonly failure = (j: BetaJob) => failureCard(j, this.jobs());
  protected readonly stamp = stamp;
  protected readonly clock = clock;
  protected readonly timingNote = timingNote;
  protected readonly canReupload = canReupload;
  protected readonly prepFailedNote = PREP_FAILED_NOTE;
  protected readonly conceptPrice = CONCEPT_PRICE;
  protected readonly totals = TIERS.map((t) => TIER_INFO[t].price);
  /** The song's length from its timing (for the hero and the `1080p · m:ss` label), once the timing is confirmed. */
  protected readonly duration = signal<number | null>(null);
  /** Phones fold the step list under 「看全部 N 個步驟 ▾」. */
  protected readonly stepsOpen = signal(false);
  /** Result videos the person started; their native controls show from then on, in place of the play button. */
  protected readonly played = signal<ReadonlySet<string>>(new Set());
  /** Past reports per result job, read once when the page first sees the result (and again after a send). */
  protected readonly reports = signal<Readonly<Record<string, BetaFeedback[]>>>({});
  private readonly asked = new Set<string>();
  protected readonly reportCount = (j: BetaJob) => this.reports()[j.id]?.length ?? 0;
  /** The latest report's verdict and day (「最近：有問題・10-28」); the count is already in the facts beside it. */
  protected readonly lastReport = (j: BetaJob) => feedbackLine(this.reports()[j.id] ?? []).split('・').slice(1).join('・');
  /** The make form's tier and feeling; a redo from a report sets them (see `redo`). */
  protected readonly makeTier = signal<BetaTier | undefined>(undefined);
  protected readonly makeFeeling = signal('');
  private readonly makeForm = viewChild(MakeFormComponent);
  protected readonly madeTiers = (v: SongView) => v.results.map((j) => j.tier);
  protected readonly minutes = (j: BetaJob) => minutesBetween(j.startedAt, j.endedAt);
  protected readonly videoUrl = (j: BetaJob) => `/beta/jobs/${j.id}/video`;
  protected readonly videoName = videoFileName;
  /** The result card whose report form is showing (one at a time). */
  protected readonly reporting = signal<string | null>(null);
  /** Cards whose form was ever opened on this page; their forms stay mounted and keep their drafts. */
  protected readonly opened = signal<ReadonlySet<string>>(new Set());
  private askedTiming = false;
  /** Results already reopened from a draft, so a later poll does not toggle their form shut. */
  private readonly draftChecked = new Set<string>();

  constructor() {
    super();
    effect(() => {
      for (const j of this.sv()?.results ?? []) {
        if (j.status !== 'done' || this.asked.has(j.id)) continue;
        this.loadReports(j.id);
      }
    });
    // a report half written before a timing edit (the editor sends the person back here) opens again where it was;
    // tracked on mine() too, since the session may answer after the first poll
    effect(() => {
      const ids = draftsToReopen(this.sv()?.results ?? [], this.mine(), this.draftChecked, hasDraft);
      for (const id of ids) {
        this.draftChecked.add(id);
        untracked(() => this.toggleReport(id));
      }
    });
    effect(() => {
      if (!this.song()?.confirmedAt || this.askedTiming) return;
      this.askedTiming = true;
      this.timing().then((t) => this.duration.set(t?.duration ?? null));
    });
  }

  private async timing(): Promise<SongTimeline | null> {
    try {
      const r = await fetch(`/beta/songs/${this.id}/timing`, { cache: 'no-store' });
      return r.ok ? ((await r.json()) as SongTimeline) : null;
    } catch {
      return null;
    }
  }

  /** Downloads the confirmed lyric timing as LRC or SRT (read fresh, so a re-timing since the page opened counts). */
  protected async download(kind: 'lrc' | 'srt') {
    const t = await this.timing();
    if (!t) return this.message.set('無法讀取歌詞時間，請稍後再試');
    const text = kind === 'lrc'
      ? toLrc(t, (x) => [...phraseBoundaries(x)].sort((a, b) => a - b).filter((b) => b < [...x].length))
      : toSrt(t.cues);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `${safeName(this.song()?.title ?? '') || 'lyrics'}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private async loadReports(id: string) {
    this.asked.add(id);
    try {
      const r = await fetch(`/beta/jobs/${id}/feedback`);
      if (r.ok) this.setReports(id, (await r.json()) as BetaFeedback[]);
    } catch {
      // the summary is optional; the report button still works
    }
  }

  protected setReports(id: string, list: BetaFeedback[]) {
    this.reports.update((m) => ({ ...m, [id]: list }));
  }

  protected toggleReport(id: string) {
    this.opened.update((s) => (s.has(id) ? s : new Set(s).add(id)));
    this.reporting.update((cur) => (cur === id ? null : id));
  }

  protected markPlayed(id: string) {
    if (!this.played().has(id)) this.played.update((s) => new Set(s).add(id));
  }

  protected play(id: string, video: HTMLVideoElement) {
    this.markPlayed(id);
    void video.play().catch(() => undefined);
  }

  /** Sends the audio again for a song whose first upload was refused or broke off; the server then starts the preparation. */
  protected async reupload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    const why = audioProblem(file);
    if (why) {
      input.value = '';
      return this.message.set(why);
    }
    this.busy.set(true);
    this.message.set('上傳中，請勿關閉或離開這個頁面…');
    try {
      await this.uploadAudio(this.id, file);
      this.message.set('已上傳，現在可以離開頁面。系統正在準備歌詞時間（約 5–10 分鐘），完成後請回來「確認時間」。');
    } catch (err) {
      this.message.set(`上傳失敗：${(err as Error).message}`);
    } finally {
      input.value = '';
      this.busy.set(false);
      await this.poll();
    }
  }

  /** Opens 製作新版本 with a tier chosen and 想要的感覺 filled in (a redo from a report), and scrolls to it. */
  redo(tier: BetaTier, feeling: string) {
    this.makeTier.set(tier);
    if (feeling) this.makeFeeling.set(feeling);
    this.makeForm()?.reveal();
  }

  protected async started(text: string) {
    this.message.set(text);
    await this.poll();
  }
}
