// Runs the beta's jobs one at a time on this machine: each job is one shell command whose `##PHASE <label>` lines
// become the progress the person sees and whose `##COST <usd> [key]` lines add up to its measured cost. A
// `##NORETRY <reason>` line marks a failure that a rerun would repeat: the reason becomes the error, no automatic retry.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, uptime } from 'node:os';
import { join } from 'node:path';
import type { BetaEvent } from './events.mts';
import { Db, Job, nextJob, platformSpent, retryJob } from './store.mts';

export interface Queue {
  db: Db;
  persist: () => void;
  /** The shell command of a job, or a reason it cannot run. */
  command: (job: Job, db: Db) => string | { error: string };
  logDir: string;
  /** Extra environment for the jobs (default: the API keys in ~/.config/vjflow/*.env). */
  env?: Record<string, string>;
  /** Environment for one job, read when it starts (e.g. the candidate languages a concept job may pick). */
  jobEnv?: (job: Job) => Record<string, string>;
  /** The shell that runs a job's command (default `bash`; tests point it at a missing file to see a failed start). */
  shell?: string;
  /** Set while the server shuts down: jobs killed then stay `running` (a restart re-queues them) and nothing new starts. */
  stopping?: boolean;
  /** Set while the server waits for orphaned pipelines to exit: `pump` starts nothing. */
  holding?: boolean;
  /** Told when a job starts, enters a phase, adds a measured cost or ends. */
  onEvent?: (job: Job, e: Omit<BetaEvent, 'at' | 'jobId'>) => void;
}

/**
 * The API keys the steps need, read from ~/.config/vjflow/*.env (KEY=value lines). An interactive login shell, which
 * the dev Studio used to pick the keys up from ~/.zshrc, never finishes without a terminal, so a server started in the
 * background cannot use one.
 */
export function keyEnv(dir = join(homedir(), '.config/vjflow')) {
  const env: Record<string, string> = {};
  if (!existsSync(dir)) return env;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.env')))
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const m = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  return env;
}

/**
 * Reads one output line of a job into it; true when the line changed something the page shows.
 * `##COST <usd> [key]`: a key already seen is ignored; no key becomes `phase:<phase>#<n>`.
 */
export function readLine(job: Job, line: string, now: () => string = () => new Date().toISOString()) {
  const n = /^##NORETRY (.+)/.exec(line);
  if (n) {
    Object.assign(job, { noRetry: true, error: n[1].trim() });
    return true;
  }
  const p = /^##PHASE (.+)/.exec(line);
  if (p) {
    const phase = p[1].trim();
    if (phase === job.phase) return false;
    job.phase = phase;
    (job.steps ??= []).push({ phase, at: now() });
    return true;
  }
  const c = /^##COST ([\d.]+)(?:\s+(\S+))?/.exec(line);
  if (!c) return false;
  const costs = (job.costs ??= []);
  const prefix = `phase:${job.phase}#`;
  const key = c[2] ?? `${prefix}${costs.filter((x) => x.key.startsWith(prefix)).length + 1}`;
  if (costs.some((x) => x.key === key)) return false;
  costs.push({ key, usd: Number(c[1]), phase: job.phase });
  job.costUsd = +costs.reduce((s, x) => s + x.usd, 0).toFixed(3);
  return true;
}

/** Stops a job's whole process group; a group that ignores SIGTERM gets SIGKILL after `graceMs`. */
export function killGroup(pid: number, graceMs = 10_000) {
  try { process.kill(-pid, 'SIGTERM'); } catch { return; }
  setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } }, graceMs).unref();
}

/**
 * Stops every running job's process group (server shutdown, or a crash left pipelines behind). A job that started before
 * the machine booted is skipped: its saved pid may belong to an unrelated process now.
 */
export const killRunning = (db: Db, graceMs?: number, bootMs = Date.now() - uptime() * 1000) => {
  const pids: number[] = [];
  for (const j of db.jobs) if (j.status === 'running' && j.pid && !(j.startedAt && Date.parse(j.startedAt) < bootMs)) { killGroup(j.pid, graceMs); pids.push(j.pid); }
  return pids;
};

/** Resolves with the pids whose group still exists: none once all are gone, or those left after `timeoutMs` (default: past the 10 s SIGKILL escalation). */
export async function waitGone(pids: number[], timeoutMs = 12_000, pollMs = 50): Promise<number[]> {
  const alive = (pid: number) => { try { process.kill(-pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } };
  const until = Date.now() + timeoutMs;
  while (pids.some(alive) && Date.now() < until) await new Promise((ok) => setTimeout(ok, pollMs));
  return pids.filter(alive);
}

/** A system failure runs once more by itself (inside the global budget); a fuse trip, a `##NORETRY` failure, a retry of a retry and an admin hold wait for the admin. */
function autoRetry(q: Queue, job: Job) {
  if (q.stopping || job.status !== 'failed' || job.fused || job.noRetry || job.auto || job.retryOf) return;
  if (platformSpent(q.db) + (job.priceUsd ?? job.reservedUsd) > q.db.globalLimitUsd) {
    q.onEvent?.(job, { type: 'job.autoretry.skipped', retryOf: job.id, reason: 'global-limit' });
    return;
  }
  const next = retryJob(q.db, job, { auto: true });
  q.persist();
  q.onEvent?.(job, { type: 'job.autoretry', retryOf: job.id });
  q.onEvent?.(next, { type: 'job.queued', kind: next.kind, tier: next.tier, priceUsd: next.priceUsd, auto: true });
}

/** Starts the next queued job when nothing runs; call after any change to the queue. */
export function pump(q: Queue) {
  if (q.stopping || q.holding) return;
  const job = nextJob(q.db);
  if (!job) return;
  const cmd = q.command(job, q.db);
  const now = () => new Date().toISOString();
  if (typeof cmd !== 'string') {
    Object.assign(job, { status: 'failed', error: cmd.error, endedAt: now() });
    q.persist();
    q.onEvent?.(job, { type: 'job.ended', status: 'failed', error: cmd.error });
    return pump(q);
  }
  Object.assign(job, { status: 'running', startedAt: now(), error: undefined });
  q.persist();
  mkdirSync(q.logDir, { recursive: true });
  const log = join(q.logDir, `${job.id}.log`);
  // the keys only reach the job's process, never the pages or the records
  const child = spawn(q.shell ?? 'bash', ['-c', cmd], { env: { ...process.env, ...(q.env ?? keyEnv()), ...q.jobEnv?.(job) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  job.pid = child.pid;
  q.persist();
  q.onEvent?.(job, { type: 'job.started' });
  /** readLine, telling onEvent about the phase or cost it added. */
  const read = (line: string) => {
    const [steps, costs] = [job.steps?.length ?? 0, job.costs?.length ?? 0];
    const changed = readLine(job, line);
    if ((job.steps?.length ?? 0) > steps) q.onEvent?.(job, { type: 'job.phase', phase: job.phase });
    const added = job.costs?.[costs];
    if ((job.costs?.length ?? 0) > costs && added) q.onEvent?.(job, { type: 'job.cost', key: added.key, usd: added.usd });
    return changed;
  };
  let fused = false;
  let rest = '';
  const take = (b: Buffer) => {
    appendFileSync(log, b);
    const lines = (rest + b.toString()).split(/\r|\n/);
    rest = lines.pop() ?? '';
    if (lines.map((l) => read(l)).some(Boolean)) q.persist();
    // the fuse: a run that costs more than twice its price is stopped (the whole group, or bash's children keep the pipe open)
    if (!fused && job.costUsd !== undefined && job.costUsd > 2 * (job.priceUsd ?? Infinity)) {
      fused = true;
      job.fused = true;
      job.error = '成本超過上限，已通知管理者';
      q.onEvent?.(job, { type: 'job.fused', costUsd: job.costUsd, priceUsd: job.priceUsd });
      killGroup(child.pid!);
    }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  let ended = false;
  // bash that cannot start (missing, no process slots) must fail the job, not crash the server; `close` may follow, the job ends once
  child.on('error', (err) => {
    if (q.stopping || ended) return;
    ended = true;
    Object.assign(job, { status: 'failed', endedAt: now(), error: `無法啟動：${err.message}`, unsettled: job.phase ?? '啟動', pid: undefined });
    q.persist();
    q.onEvent?.(job, { type: 'job.ended', status: job.status, error: job.error, unsettled: job.unsettled, costUsd: job.costUsd });
    autoRetry(q, job);
    pump(q);
  });
  child.on('close', (code) => {
    if (q.stopping || ended) return;
    ended = true;
    if (rest) read(rest);
    // a job that needs the admin (a key shot no try drew cleanly) says so on its last line: exit 10
    const failed = code !== 0 && code !== 10;
    Object.assign(job, {
      status: code === 0 ? 'done' : code === 10 ? 'admin' : 'failed',
      endedAt: now(),
      error: failed ? (fused || job.noRetry ? job.error : `exit ${code}`) : undefined,
      unsettled: failed ? job.phase : undefined,
      pid: undefined,
    });
    q.persist();
    q.onEvent?.(job, { type: 'job.ended', status: job.status, error: job.error, unsettled: job.unsettled, costUsd: job.costUsd });
    autoRetry(q, job);
    pump(q);
  });
}
