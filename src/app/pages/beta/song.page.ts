import { Component, computed, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BetaJob, BetaSong, BetaTier, minutesBetween, songView, TIER_INFO } from './beta';
import { BetaPage } from './beta.page';

const TIERS = Object.keys(TIER_INFO) as BetaTier[];
const pad = (n: number) => String(n).padStart(2, '0');

/** One song (`/my/song?id=`): its info, the versions to make, the job in progress and every finished result. */
@Component({
  selector: 'app-beta-song-page',
  imports: [NgTemplateOutlet],
  templateUrl: './song.page.html',
  styleUrls: ['./beta.page.scss', './song.page.scss'],
  host: { '(document:keydown.escape)': 'ask() && answer(false)' },
})
export class BetaSongPage extends BetaPage {
  protected readonly id = new URLSearchParams(location.search).get('id') ?? '';
  protected readonly song = computed(() => this.songs().find((s) => s.id === this.id));
  protected readonly sv = computed(() => {
    const s = this.song();
    return s ? songView(s, this.jobs()) : undefined;
  });
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

  /** `MM-DD HH:mm` in local time. */
  protected stamp(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      title: `製作「${song.title}」${t.name}`,
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
