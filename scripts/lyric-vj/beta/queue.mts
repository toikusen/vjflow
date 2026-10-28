// Runs the beta's jobs one at a time on this machine: each job is one shell command whose `##PHASE <label>` lines
// become the progress the person sees and whose `##COST <usd> [key]` lines add up to its measured cost.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Db, Job, nextJob } from './store.mts';

export interface Queue {
  db: Db;
  persist: () => void;
  /** The shell command of a job, or a reason it cannot run. */
  command: (job: Job, db: Db) => string | { error: string };
  logDir: string;
  /** Extra environment for the jobs (default: the API keys in ~/.config/vjflow/*.env). */
  env?: Record<string, string>;
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

/** Starts the next queued job when nothing runs; call after any change to the queue. */
export function pump(q: Queue) {
  const job = nextJob(q.db);
  if (!job) return;
  const cmd = q.command(job, q.db);
  const now = () => new Date().toISOString();
  if (typeof cmd !== 'string') {
    Object.assign(job, { status: 'failed', error: cmd.error, endedAt: now() });
    q.persist();
    return pump(q);
  }
  Object.assign(job, { status: 'running', startedAt: now(), error: undefined });
  q.persist();
  mkdirSync(q.logDir, { recursive: true });
  const log = join(q.logDir, `${job.id}.log`);
  // the keys only reach the job's process, never the pages or the records
  const child = spawn('bash', ['-c', cmd], { env: { ...process.env, ...(q.env ?? keyEnv()) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let rest = '';
  const take = (b: Buffer) => {
    appendFileSync(log, b);
    const lines = (rest + b.toString()).split(/\r|\n/);
    rest = lines.pop() ?? '';
    if (lines.map((l) => readLine(job, l)).some(Boolean)) q.persist();
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('close', (code) => {
    if (rest) readLine(job, rest);
    // a job that needs the admin (a key shot no try drew cleanly) says so on its last line: exit 10
    Object.assign(job, { status: code === 0 ? 'done' : code === 10 ? 'admin' : 'failed', endedAt: now(), error: code === 0 || code === 10 ? undefined : `exit ${code}` });
    q.persist();
    pump(q);
  });
}
