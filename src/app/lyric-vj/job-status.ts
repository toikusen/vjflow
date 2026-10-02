// Production status of one lyric-VJ job, written by the pipeline scripts and read by the admin page.

export type StageId = 'director' | 'assets' | 'render';
export type RunState = 'pending' | 'running' | 'done' | 'failed';

export interface JobItem {
  id: string;
  kind: 'image' | 'video';
  state: RunState;
  /** Path under out/ (thumbnail or clip). */
  file?: string;
  usd?: number;
  /** Why it failed, or what replaced it (e.g. a still instead of the clip). */
  note?: string;
}

export interface JobStage {
  state: RunState;
  startedAt?: string;
  endedAt?: string;
  done?: number;
  total?: number;
  costUSD?: number;
  message?: string;
  items?: JobItem[];
}

export interface JobStatus {
  id: string;
  title: string;
  tier?: string;
  style?: string;
  updatedAt: string;
  stages: Partial<Record<StageId, JobStage>>;
  /** Finished videos, paths under out/. */
  outputs?: string[];
}

export const STAGES: { id: StageId; name: string; weight: number }[] = [
  { id: 'director', name: '導演企劃', weight: 0.1 },
  { id: 'assets', name: '素材生成', weight: 0.6 },
  { id: 'render', name: '渲染輸出', weight: 0.3 },
];

/** 0..1 for one stage: done → 1, running → done/total when known. */
export function stageProgress(s?: JobStage): number {
  if (!s || s.state === 'pending') return 0;
  if (s.state === 'done') return 1;
  return s.total ? Math.min(1, (s.done ?? 0) / s.total) : 0;
}

/** 0..1 for the whole job, weighted by how long each stage usually takes. */
export function jobProgress(job: JobStatus): number {
  return STAGES.reduce((p, st) => p + st.weight * stageProgress(job.stages[st.id]), 0);
}

export function jobState(job: JobStatus): RunState {
  const states = STAGES.map((s) => job.stages[s.id]?.state ?? 'pending');
  if (states.includes('failed')) return 'failed';
  if (states.every((s) => s === 'done')) return 'done';
  return states.some((s) => s !== 'pending') ? 'running' : 'pending';
}

export const totalCost = (job: JobStatus) => STAGES.reduce((c, s) => c + (job.stages[s.id]?.costUSD ?? 0), 0);
