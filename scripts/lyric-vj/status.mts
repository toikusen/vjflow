// Writes a job's production status to out/jobs/<id>.json (read by the admin page through dashboard.mts).
// Writes are atomic (temp file + rename) because the dashboard reads while scripts write.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { JobItem, JobStage, JobStatus, StageId } from '../../src/app/lyric-vj/job-status';

export const JOBS_DIR = resolve('out/jobs');
const OUT_ROOT = resolve('out');

/** Job id from a job directory such as out/indigo/p1r → "indigo-p1r". */
export const jobIdFor = (dir: string) => `${basename(dirname(resolve(dir)))}-${basename(resolve(dir))}`;

/** A path under out/, as the dashboard serves it. */
export const outPath = (file: string) => relative(OUT_ROOT, resolve(file));

export function jobStatus(id: string, init: Partial<JobStatus> = {}) {
  mkdirSync(JOBS_DIR, { recursive: true });
  const file = join(JOBS_DIR, `${id}.json`);
  const read = (): JobStatus =>
    existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { id, title: id, updatedAt: '', stages: {} };
  const write = (job: JobStatus) => {
    job.updatedAt = new Date().toISOString();
    writeFileSync(`${file}.tmp`, JSON.stringify(job, null, 1));
    renameSync(`${file}.tmp`, file);
  };
  write({ ...read(), ...init });
  const stage = (s: StageId, patch: Partial<JobStage>) => {
    const job = read();
    const prev = job.stages[s] ?? { state: 'pending' };
    const now = new Date().toISOString();
    job.stages[s] = {
      ...prev,
      ...patch,
      startedAt: patch.state === 'running' && prev.state !== 'running' ? now : prev.startedAt,
      endedAt: patch.state === 'done' || patch.state === 'failed' ? now : prev.endedAt,
    };
    write(job);
  };
  return {
    stage,
    item(s: StageId, item: JobItem) {
      const job = read();
      // replace in place: the page keeps the asset order of the treatment
      const prev = job.stages[s]?.items ?? [];
      const items = prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : [...prev, item];
      stage(s, { items, done: items.filter((x) => x.state === 'done').length });
    },
    outputs(files: string[]) {
      const job = read();
      job.outputs = [...new Set([...(job.outputs ?? []), ...files.map(outPath)])];
      write(job);
    },
  };
}
