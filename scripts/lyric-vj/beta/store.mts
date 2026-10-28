// The closed beta's records: invited people, their songs, the jobs that make videos, and what each job costs.
// One JSON file written atomically by the one server process (a handful of testers; a database when it is public).
// ponytail: whole-file JSON store, single writer; move to SQLite when more than one process writes.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Tier = 'none' | 'img' | 'hybrid';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'admin';

export interface User { id: string; name: string; tokenHash: string; admin: boolean; limitUsd: number; disabled?: boolean; createdAt: string }
export interface Song { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string }
export interface Job {
  id: string; userId: string; songId: string; kind: 'prep' | 'make'; tier?: Tier; status: JobStatus;
  /** Legacy: what was set aside before the job started. New jobs keep it equal to `priceUsd`. */
  reservedUsd: number;
  /** What the person pays for this job, fixed when it is queued; unset on legacy jobs. */
  priceUsd?: number;
  /** The process id of the running job's shell (its own process group), cleared when it ends. */
  pid?: number;
  /** The phase in progress when the job failed. */
  unsettled?: string;
  /** The measured cost, when the steps report one. */
  costUsd?: number;
  /** Each measured cost once, by key (a repeated line must not count twice); `costUsd` is their sum. */
  costs?: { key: string; usd: number; phase?: string }[];
  /** When each phase began, appended on a change of phase only. */
  steps?: { phase: string; at: string }[];
  createdAt: string; startedAt?: string; endedAt?: string; phase?: string; error?: string;
  /** A make job's own folder, relative to the song folder (`runs/<jobId>`); unset for prep and for jobs made before run folders. */
  runDir?: string;
}
export interface Db { users: User[]; songs: Song[]; jobs: Job[]; globalLimitUsd: number }

/**
 * What a person pays, fixed per step: above the costs seen on the test songs (no image $2.2–2.6, with image $3.5–4.2,
 * hybrid $10–11 plus about $3 of hand redraws). The platform absorbs a run that costs more.
 */
export const PRICE: Record<'prep' | Tier, number> = { prep: 0.5, none: 4, img: 6, hybrid: 16 };
export const priceFor = (kind: Job['kind'], tier?: Tier) => (kind === 'make' && tier ? PRICE[tier] : PRICE.prep);

/** Where a song's files live. */
export const songDir = (root: string, id: string) => join(root, 'songs', id);
/** The folder a job works in: its run folder, or the song folder for prep and legacy jobs. */
export const runPath = (root: string, job: Job) => (job.runDir ? join(songDir(root, job.songId), job.runDir) : songDir(root, job.songId));
/** A make job's finished video; legacy jobs (no run folder) wrote `video-<tier>.mp4` into the song folder. */
export const videoFile = (root: string, job: Job) => (job.runDir ? join(runPath(root, job), 'video.mp4') : join(runPath(root, job), `video-${job.tier}.mp4`));

export const emptyDb = (): Db => ({ users: [], songs: [], jobs: [], globalLimitUsd: 100 });
export const newId = () => randomBytes(9).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function load(file: string): Db {
  return existsSync(file) ? { ...emptyDb(), ...JSON.parse(readFileSync(file, 'utf8')) } : emptyDb();
}

export function save(file: string, db: Db) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(db, null, 1));
  renameSync(`${file}.tmp`, file);
}

/** What a person pays for a job: nothing when it failed, else its fixed price (legacy jobs: measured cost, else the reserve). */
export const charged = (j: Job) => (j.status === 'failed' ? 0 : j.priceUsd ?? j.costUsd ?? j.reservedUsd);
export const spent = (db: Db, userId?: string) => db.jobs.filter((j) => !userId || j.userId === userId).reduce((s, j) => s + charged(j), 0);
/** What the platform pays: a finished job its measured cost; a job still waiting or running the larger of its price and its cost so far. */
export const platformSpent = (db: Db) => db.jobs.reduce((s, j) => s + (j.status === 'queued' || j.status === 'running' ? Math.max(j.costUsd ?? 0, j.priceUsd ?? j.reservedUsd) : j.costUsd ?? 0), 0);

/** Why a job may not be queued (in words for the person), or undefined when it may. */
export function refuse(db: Db, userId: string, kind: Job['kind'], tier?: Tier): string | undefined {
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.disabled) return '帳號無法使用';
  const cost = priceFor(kind, tier);
  if (spent(db, userId) + cost > user.limitUsd) return `額度不足：剩 $${Math.max(0, user.limitUsd - spent(db, userId)).toFixed(2)}，這個步驟需要 $${cost.toFixed(2)}`;
  if (platformSpent(db) + cost > db.globalLimitUsd) return '本期封測的總額度已用完，請聯絡管理者';
  return undefined;
}

/** A new invited person and the one-time secret their login link carries (only its hash is kept). */
export function invite(db: Db, name: string, limitUsd: number, admin = false) {
  const token = randomBytes(24).toString('base64url');
  const user: User = { id: newId(), name, tokenHash: hashToken(token), admin, limitUsd, createdAt: new Date().toISOString() };
  db.users.push(user);
  return { user, token };
}

export const userByToken = (db: Db, token: string | undefined) => (token ? db.users.find((u) => u.tokenHash === hashToken(token) && !u.disabled) : undefined);

/** Jobs a restart interrupted go back to the queue (every pipeline step skips what it already wrote). */
export function requeueRunning(db: Db) {
  for (const j of db.jobs) if (j.status === 'running') Object.assign(j, { status: 'queued', phase: undefined, startedAt: undefined, pid: undefined });
}

/** The next job to run: none while one runs (one machine, one song at a time), else the oldest queued. */
export const nextJob = (db: Db) => (db.jobs.some((j) => j.status === 'running') ? undefined : db.jobs.filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]);
