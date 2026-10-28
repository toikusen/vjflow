import { Component, computed, effect, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { phraseBoundaries } from '../../lyric-vj/phrases';
import { SongTimeline, toLrc, toSrt } from '../../lyric-vj/timeline';
import { BetaFeedback, BetaJob, BetaSong, BetaTier, CONCEPT_PRICE, coverTint, feedbackLine, minutesBetween, songKind, songView, SongView, TIER_INFO } from './beta';
import { BetaPage } from './beta.page';
import { ReportFormComponent } from './report-form.component';
import { clock, failureCard, heroTone, jobTitle, jobTotal, stamp, stepClocks } from './song';
import { BalanceComponent } from './ui/balance.component';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';
import { StatusChip } from './ui/status';
import { StatusChipComponent } from './ui/status-chip.component';

const TIERS = Object.keys(TIER_INFO) as BetaTier[];
const RETRY_CHIP: StatusChip = { icon: '↻', label: '自動重試中 · 第一次製作遇到系統問題，不另外收費', tone: 'warn' };

/** One song (`/my/song?id=`): hero, the job in progress (or the failure), every finished result, then 製作新版本. */
@Component({
  selector: 'app-beta-song-page',
  imports: [NgTemplateOutlet, ReportFormComponent, BalanceComponent, ConfirmDialogComponent, PriceComponent, StatusChipComponent],
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
  protected readonly conceptPrice = CONCEPT_PRICE;
  protected readonly totals = TIERS.map((t) => TIER_INFO[t].price);
  /** The song's length from its timing (for the hero and the `1080p · m:ss` label), once the timing is confirmed. */
  protected readonly duration = signal<number | null>(null);
  /** Phones fold the step list under 「看全部 N 個步驟 ▾」. */
  protected readonly stepsOpen = signal(false);
  /** Result videos the person started; their native controls show from then on, in place of the play button. */
  protected readonly played = signal<ReadonlySet<string>>(new Set());
  /** The failure card's 「聯絡管理者」 note. */
  protected readonly contacted = signal(false);
  /** Past reports per result job, read once when the page first sees the result (and again after a send). */
  protected readonly reports = signal<Readonly<Record<string, BetaFeedback[]>>>({});
  private readonly asked = new Set<string>();
  protected readonly reportCount = (j: BetaJob) => this.reports()[j.id]?.length ?? 0;
  protected readonly summary = (j: BetaJob) => feedbackLine(this.reports()[j.id] ?? []);
  protected readonly tierList = TIERS.map((id) => ({ id, ...TIER_INFO[id] }));
  protected readonly tierName = (t?: BetaTier) => (t ? TIER_INFO[t].name : '');
  protected readonly tierPrice = (t: BetaTier) => TIER_INFO[t].price;
  protected readonly picked = signal<BetaTier | null>(null);
  /** The tier the person picked, else the first one this song has no result for yet. */
  protected readonly chosen = computed<BetaTier>(() => {
    const made = new Set(this.sv()?.results.map((j) => j.tier));
    return this.picked() ?? TIERS.find((t) => !made.has(t)) ?? TIERS[0];
  });
  protected readonly minutes = (j: BetaJob) => minutesBetween(j.startedAt, j.endedAt);
  protected readonly videoUrl = (j: BetaJob) => `/beta/jobs/${j.id}/video`;
  /** The result card whose report form is showing (one at a time). */
  protected readonly reporting = signal<string | null>(null);
  /** Cards whose form was ever opened on this page; their forms stay mounted and keep their drafts. */
  protected readonly opened = signal<ReadonlySet<string>>(new Set());
  private askedTiming = false;

  constructor() {
    super();
    effect(() => {
      for (const j of this.sv()?.results ?? []) if (j.status === 'done' && !this.asked.has(j.id)) this.loadReports(j.id);
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
    a.download = `${(this.song()?.title ?? 'lyrics').replace(/[\\/:*?"<>|]/g, '_')}.${kind}`;
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

  /** Arrow keys move the choice inside the tier radio group. */
  protected moveTier(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TIERS[(TIERS.indexOf(this.chosen()) + step + TIERS.length) % TIERS.length];
    this.picked.set(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tier="${next}"]`)?.focus();
  }

  protected confirmMake(song: BetaSong, tier: BetaTier) {
    const t = TIER_INFO[tier];
    this.ask.set({
      eyebrow: `${song.title} · ${t.name}`,
      title: `製作${t.name}`,
      body: `${t.about}製作${t.minutes}，開始後無法取消；可以離開頁面，完成後回來下載。`,
      cost: t.price,
      go: () => this.make(song, tier),
    });
  }

  private async make(song: BetaSong, tier: BetaTier) {
    const r = await fetch(`/beta/songs/${song.id}/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier }) });
    // a proxy error page (502) is not JSON
    const why = async () => ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`;
    this.message.set(r.ok ? `「${song.title}」已開始排隊製作${TIER_INFO[tier].name}。` : `無法開始：${await why()}`);
    if (r.ok) this.picked.set(null);
    await this.poll();
  }
}
