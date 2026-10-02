import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { JobStage, jobProgress, jobState, JobStatus, RunState, STAGES, stageProgress, totalCost } from '../../lyric-vj/job-status';
import { Tier, TIERS } from '../../lyric-vj/tiers';

const POLL_MS = 3000;
const STATE_LABEL: Record<RunState, string> = { pending: '等待中', running: '進行中', done: '完成', failed: '失敗' };

/** Admin: production status of lyric-VJ jobs (served by scripts/lyric-vj/dashboard.mts through the dev proxy). */
@Component({
  selector: 'app-jobs-page',
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './jobs.page.html',
  styleUrl: './jobs.page.scss',
})
export class JobsPage {
  protected readonly jobs = signal<JobStatus[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly lastPoll = signal<Date | null>(null);
  protected readonly running = computed(() => this.jobs().filter((j) => jobState(j) === 'running').length);
  protected readonly stages = STAGES;
  protected readonly label = STATE_LABEL;
  protected readonly progress = jobProgress;
  protected readonly stageProgress = stageProgress;
  protected readonly state = jobState;
  protected readonly cost = totalCost;
  protected readonly tierName = (t: string) => TIERS[t as Tier]?.name ?? t;

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.poll();
  }

  protected file(path: string) {
    return `/lyric-vj/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  protected isVideo(path?: string) {
    return !!path?.endsWith('.mp4');
  }

  /** "3 分 12 秒" for a finished stage, elapsed time for a running one. */
  protected duration(s?: JobStage) {
    if (!s?.startedAt) return '';
    const end = s.endedAt ? Date.parse(s.endedAt) : (this.lastPoll()?.getTime() ?? Date.now());
    const sec = Math.max(0, Math.round((end - Date.parse(s.startedAt)) / 1000));
    return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`;
  }

  private async poll() {
    try {
      const res = await fetch('/lyric-vj/jobs', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.jobs.set(await res.json());
      this.error.set(null);
    } catch (e) {
      this.error.set(`讀不到製作狀態（${(e as Error).message}）。請先執行 npx tsx scripts/lyric-vj/dashboard.mts`);
    }
    this.lastPoll.set(new Date());
  }
}
