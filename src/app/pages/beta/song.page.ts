import { Component, computed, effect, ElementRef, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SongTimeline } from '../../lyric-vj/timeline';
import { audioProblem, BetaFeedback, BetaJob, BetaSong, BetaTier, CONCEPT_PRICE, coverTint, feedbackLine, FIX_PRICE, fixableReport, fixKindFor, minutesBetween, songKind, songView, SongView, stepsMin, TIER_INFO } from './beta';
import { BetaPage } from './beta.page';
import { ConceptCardComponent } from './concept-card.component';
import { MakeFormComponent } from './make-form.component';
import { SongFlowComponent } from './song-flow.component';
import { timingCallout } from './song-flow';
import { fixBody, hasDraft, ReportFormComponent } from './report-form.component';
import { interludeLines, stillLabel } from './concept';
import { canReupload, clock, draftsToReopen, failureCard, fitsViewport, heldLines, heroTone, jobTitle, jobTotal, nextHeld, nextSteps, PREP_FAILED_NOTE, resultConcept, SKIP_TIMING_BODY, stamp, timingNote, videoFileName } from './song';
import { BalanceComponent } from './ui/balance.component';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';
import { StatusChip } from './ui/status';
import { StatusChipComponent } from './ui/status-chip.component';

const RETRY_CHIP: StatusChip = { icon: '↻', label: '自動重試中 · 第一次製作遇到系統問題，不另外收費', tone: 'warn' };

/** One song (`/my/song?id=`): hero, the job in progress (or the failure), 做影片 (free, in the tab), then the paid part: a concept awaiting a decision, every finished result, 製作新版本. */
@Component({
  selector: 'app-beta-song-page',
  imports: [NgTemplateOutlet, ConceptCardComponent, MakeFormComponent, SongFlowComponent, ReportFormComponent, BalanceComponent, ConfirmDialogComponent, PriceComponent, StatusChipComponent],
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
  protected readonly timingCallout = timingCallout;
  protected readonly tone = (v: SongView) => heroTone(songKind(v));
  /** 3a / 3b: nothing made and nothing running gets the one-row hero; a song with work to show gets the big one. */
  protected readonly tint = (s: BetaSong) => coverTint(s.id);
  protected readonly title = (j: BetaJob) => jobTitle(j, this.jobs());
  protected readonly total = (j: BetaJob) => jobTotal(j, this.jobs());
  /** The accepted concept behind a result, shown folded under its facts (the concept card leaves the page once decided). */
  protected readonly conceptOf = (j: BetaJob) => resultConcept(j, this.jobs());
  protected readonly interludes = interludeLines;
  protected readonly stillLabel = stillLabel;
  protected readonly stillUrl = (c: BetaJob, name: string) => `/beta/jobs/${c.id}/stills/${name}`;
  protected readonly failure = (j: BetaJob) => failureCard(j, this.jobs());
  protected readonly stamp = stamp;
  protected readonly heldInfo = (j: BetaJob) => heldLines(j);
  protected readonly nextHeld = nextHeld;
  protected readonly clock = clock;
  protected readonly timingNote = timingNote;
  protected readonly canReupload = canReupload;
  protected readonly prepFailedNote = PREP_FAILED_NOTE;
  /** The song's length from its timing (for the hero and the `1080p · m:ss` label), once the timing is confirmed. */
  protected readonly duration = signal<number | null>(null);
  /** Result videos the person started; their native controls show from then on, in place of the play button. */
  protected readonly played = signal<ReadonlySet<string>>(new Set());
  /** Past reports per result job, read once when the page first sees the result (and again after a send). */
  protected readonly reports = signal<Readonly<Record<string, BetaFeedback[]>>>({});
  private readonly asked = new Set<string>();
  protected readonly reportCount = (j: BetaJob) => this.reports()[j.id]?.length ?? 0;
  /** The latest report's verdict and day (「最近：有問題・10-28」); the count is already in the facts beside it. */
  protected readonly lastReport = (j: BetaJob) => feedbackLine(this.reports()[j.id] ?? []).split('・').slice(1).join('・');
  /** The result's newest 只回報 a fix can still be made from (fixableReport). */
  protected readonly fixable = (j: BetaJob) => fixableReport(this.reports()[j.id] ?? [], j, this.jobs());
  protected readonly fixPrice = FIX_PRICE;
  /** The version 接著做 works from: the one the person picked (以這版為底), else the newest. */
  protected readonly base = signal<string | null>(null);
  protected readonly baseOf = (v: SongView): BetaJob | undefined => v.results.find((j) => j.id === this.base()) ?? v.results[0];
  protected readonly isBase = (v: SongView, j: BetaJob) => this.baseOf(v)?.id === j.id;
  private readonly side = viewChild<ElementRef<HTMLElement>>('side');
  /** 接著做 stays pinned only while all of it fits the window; taller, it scrolls with the page so its bottom stays reachable. */
  protected readonly sideFits = signal(true);
  protected readonly versionLabel = (j: BetaJob) => { const t = jobTitle(j, this.jobs()); return `${t.name}${t.version ? ` v${t.version}` : ''}`; };
  protected readonly nextSteps = (j: BetaJob) => nextSteps(j.tier ?? 'none');
  /** 換個概念 opened 製作新版本 (it stays folded once the song has versions). */
  protected readonly newConcept = signal(false);
  /** The make form's tier and feeling; a redo from a report sets them (see `redo`). */
  protected readonly makeTier = signal<BetaTier | undefined>(undefined);
  protected readonly makeFeeling = signal('');
  private readonly makeForm = viewChild(MakeFormComponent);
  protected readonly madeTiers = (v: SongView) => v.results.map((j) => j.tier);
  protected readonly minutes = (j: BetaJob) => minutesBetween(j.startedAt, j.endedAt);
  protected readonly videoUrl = (j: BetaJob) => `/beta/jobs/${j.id}/video`;
  protected readonly videoName = (s: BetaSong, j: BetaJob) => videoFileName(s, j, this.jobs());
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
    effect((onCleanup) => {
      const el = this.side()?.nativeElement;
      if (!el) return;
      const check = () => this.sideFits.set(fitsViewport(el.offsetHeight, window.innerHeight));
      const seen = new ResizeObserver(check);
      seen.observe(el);
      window.addEventListener('resize', check);
      onCleanup(() => {
        seen.disconnect();
        window.removeEventListener('resize', check);
      });
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
      this.message.set(`已上傳，現在可以離開頁面。系統正在準備歌詞時間（約 ${this.prepMin} 分鐘），完成後請回來「確認時間」。`);
    } catch (err) {
      this.message.set(`上傳失敗：${(err as Error).message}`);
    } finally {
      input.value = '';
      this.busy.set(false);
      await this.poll();
    }
  }

  /** 略過檢查，直接製作: warns that unchecked lines may be off, then takes the automatic timing as it is. */
  protected askSkip() {
    this.ask.set({
      eyebrow: this.song()?.title,
      title: '略過檢查，直接製作？',
      body: SKIP_TIMING_BODY,
      cost: 0,
      confirmLabel: '沒問題，直接製作',
      go: () => void this.skipTiming(),
    });
  }

  private async skipTiming() {
    this.busy.set(true);
    try {
      const r = await fetch(`/beta/songs/${this.id}/timing/skip`, { method: 'POST' });
      if (!r.ok) this.message.set(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? '操作失敗，請稍後再試');
    } catch {
      this.message.set('連線失敗，請稍後再試');
    } finally {
      this.busy.set(false);
      await this.poll();
    }
  }

  /** Opens 製作新版本 with a tier chosen and 想要的感覺 filled in (a redo from a report), and scrolls to it. */
  redo(tier: BetaTier, feeling: string) {
    this.makeTier.set(tier);
    if (feeling) this.makeFeeling.set(feeling);
    this.openNewConcept();
  }

  /** 換個概念: shows 製作新版本 (folded away once the song has versions) and scrolls to it. */
  protected openNewConcept() {
    this.newConcept.set(true);
    // the form may mount on this change: reveal once it has rendered
    setTimeout(() => this.makeForm()?.reveal());
  }

  /** The result whose report form was opened to fix (標記問題並修正): the form starts on 修正 and says what it needs. */
  protected readonly fixIntent = signal<string | null>(null);

  /** 標記問題並修正 from 接著做: opens the base version's report form on 修正 and brings the card into view. */
  protected openReport(j: BetaJob) {
    this.fixIntent.set(j.id);
    if (this.reporting() !== j.id) this.toggleReport(j.id);
    setTimeout(() => document.getElementById(`result-${j.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /** 看付費方案: the paid part of the page, the concepts, versions and 製作新版本 below 做影片. */
  protected toPaid() {
    document.getElementById('paid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 目前基底 · 前往接著做 on a narrow screen, where 接著做 sits below the versions. */
  protected toNext() {
    document.getElementById('next-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 依這份回報修正: the fix a 只回報's marks allow, asked for after the fact; the same confirm as the report form's 修正. */
  protected askFix(f: BetaFeedback, j: BetaJob) {
    this.ask.set({
      eyebrow: `${this.song()?.title} · ${TIER_INFO[j.tier ?? 'none'].name}`,
      title: '依這份回報修正',
      body: fixBody(fixKindFor(f.marks, j.tier)),
      cost: FIX_PRICE,
      go: () => void this.fixFrom(f, j),
    });
  }

  private async fixFrom(f: BetaFeedback, j: BetaJob) {
    this.busy.set(true);
    try {
      const r = await fetch(`/beta/feedback/${f.id}/fix`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const b = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) return this.message.set(b?.error ?? `無法送出（HTTP ${r.status}）`);
      await this.loadReports(j.id);
      await this.started(`「${this.song()?.title}」的修正已排隊，完成後會出現在成品。`);
    } catch {
      this.message.set('無法連線，請稍後再試');
    } finally {
      this.busy.set(false);
    }
  }

  /** The confirm before a remake: what is kept and what is made, by the target tier (no concept fee in any case). */
  protected askRemake(j: BetaJob, tier: BetaTier) {
    const own = j.tier ?? 'none';
    const info = TIER_INFO[tier];
    const kept = '導演的風格、配色、字型和故事概念不變';
    const body = tier === own
      ? `${kept}，文字動態重新編排，所以成品會不一樣。`
      : tier === 'img'
        ? `${kept}，這版的鏡頭和文字動態也保留，導演再畫插圖道具放進去。`
        : tier === 'hybrid'
          ? `${kept}，並以這版的鏡頭為底寫故事、畫角色與畫面；成品會依故事重新構圖。完成前可能需要管理者確認關鍵畫面。`
          : `${kept}，直接用這版的鏡頭和文字動態輸出，不放插圖。`;
    this.ask.set({
      eyebrow: `${this.song()?.title} · ${info.name}`,
      title: tier === own ? '用同一個概念再做一版' : `用這個概念做${info.name}`,
      body: `${body}約 ${stepsMin(tier)} 分鐘，可以離開頁面。不另收概念費。`,
      cost: info.rest,
      go: () => void this.remake(j, tier, info.name),
    });
  }

  private async remake(j: BetaJob, tier: BetaTier, name: string) {
    this.busy.set(true);
    try {
      const r = await fetch(`/beta/jobs/${j.id}/remake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier }) });
      const b = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) return this.message.set(b?.error ?? `無法送出（HTTP ${r.status}）`);
      await this.started(`「${this.song()?.title}」已用同一個概念開始製作${name}，完成後會出現在成品。`);
    } catch {
      this.message.set('無法連線，請稍後再試');
    } finally {
      this.busy.set(false);
    }
  }

  protected async started(text: string) {
    this.message.set(text);
    await this.poll();
  }
}
