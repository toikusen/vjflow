// The closed beta's records: invited people, their songs, the jobs that make videos, and what each job costs.
// One JSON file written atomically by the one server process (a handful of testers; a database when it is public).
// ponytail: whole-file JSON store, single writer; move to SQLite when more than one process writes.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Feedback, FixKind, FixRange } from './feedback.mts';
import { LANGUAGES, type LanguageId } from '../../../src/app/lyric-vj/languages';

export type Tier = 'none' | 'img' | 'hybrid';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'admin';

export interface User { id: string; name: string; tokenHash: string; admin: boolean; limitUsd: number; disabled?: boolean; createdAt: string }
export interface Song { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string; timingSkipped?: boolean }
export interface Job {
  id: string; userId: string; songId: string; kind: 'prep' | 'concept' | 'make' | 'fix'; tier?: Tier; status: JobStatus;
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
  /** The failed job this one runs again. */
  retryOf?: string;
  /** True for the automatic retry of a system failure (an admin's retry leaves it unset). */
  auto?: boolean;
  /** Set when the cost fuse stopped the job; such a job never retries by itself. */
  fused?: boolean;
  /** Set when the steps said a rerun would fail the same way (`##NORETRY`); such a job never retries by itself. */
  noRetry?: boolean;
  /**
   * A concept job's input: the concept text, the chosen language id (unset = the director picks), reference file names
   * copied into the run, the adjust note, and the concept job it adjusts or redoes. A fix job's: the run id of the video
   * it fixes, what it does and the marked ranges.
   */
  inputs?: ConceptInputs | FixInputs;
  /** What the person decided about a finished concept. */
  decision?: 'accepted' | 'adjusted' | 'redone';
  /** On the make job an acceptance created: the concept job it came from. */
  conceptOf?: string;
}
export interface ConceptInputs { concept: string; style?: string; refs: string[]; note?: string; from?: string; kind?: undefined; ranges?: undefined }
export interface FixInputs { from: string; kind: FixKind; ranges: FixRange[]; feedbackId?: string; concept?: undefined; style?: undefined; refs?: undefined; note?: undefined }
/** True for the jobs that make a video a person watches: a make, or a fix of one (a new version beside the old). */
export const madeVideo = (j: Pick<Job, 'kind'>) => j.kind === 'make' || j.kind === 'fix';
export type StyleTier = 'proven' | 'candidate' | 'unlisted';
export interface Db { users: User[]; songs: Song[]; jobs: Job[]; globalLimitUsd: number;
  /** Every problem report ever submitted, never overwritten. */
  feedback: Feedback[];
  /** The admin's tier per design language; a language not listed here takes its default (see styleTier). */
  styles?: Record<string, { tier: StyleTier }>;
  /** Pipelines a crash left behind, kept until each is confirmed gone (a db from before this field has none). */
  orphans?: Orphan[] }
/** A crash-orphaned pipeline's process group; `since` is when its job started (or when it was found, lacking that). */
export interface Orphan { pid: number; jobId: string; since: string }

/** A language's tier: the admin's choice, else `proven` for a proven language and `unlisted` for the rest. */
export const styleTier = (db: Db, id: string): StyleTier => db.styles?.[id]?.tier ?? (LANGUAGES[id as LanguageId]?.proven ? 'proven' : 'unlisted');
/** True when the person may pick the language: its tier is proven or candidate. */
export const styleOffered = (db: Db, id: string) => Object.hasOwn(LANGUAGES, id) && styleTier(db, id) !== 'unlisted';
/** The candidate languages, in catalog order (the director must give a reason when it picks one). */
export const candidateIds = (db: Db) => Object.keys(LANGUAGES).filter((id) => styleTier(db, id) === 'candidate');
/** The proven languages at run time, in catalog order: the set the director picks from without a reason. */
export const provenIds = (db: Db) => Object.keys(LANGUAGES).filter((id) => styleTier(db, id) === 'proven');

/**
 * What a person pays, fixed per step (placeholders): each concept attempt, then the rest once the concept is accepted.
 * Together they stay above the costs seen on the test songs; the platform absorbs a run that costs more.
 */
export const PRICE: Record<'prep' | 'concept' | 'fix' | Tier, number> = { prep: 0.5, concept: 2.5, fix: 1, none: 1.5, img: 3.5, hybrid: 13.5 };
export const priceFor = (kind: Job['kind'], tier?: Tier) => (kind === 'concept' ? PRICE.concept : kind === 'fix' ? PRICE.fix : kind === 'make' && tier ? PRICE[tier] : PRICE.prep);
/** One concept plus the rest: what a tier costs a person who accepts the first concept. */
export const TIER_TOTAL = (tier: Tier) => PRICE.concept + PRICE[tier];
export const MAX_CONCEPTS = 3;

/** The job a retry chain started from: `retryOf` followed to the end (a retry of a retry included). */
export function rootOf(db: Db, job: Job): Job {
  const byId = new Map(db.jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  let j = job;
  while (j.retryOf && byId.has(j.retryOf) && !seen.has(j.id)) { seen.add(j.id); j = byId.get(j.retryOf)!; }
  return j;
}

/**
 * Concept attempts used for a song and tier: a concept job with every retry of it (and of those) counts once, unless
 * every job of the chain failed (a system failure never uses up an attempt).
 */
export function conceptAttempts(db: Db, songId: string, tier: Tier): number {
  const chains = new Map<string, Job[]>();
  for (const j of db.jobs) {
    if (j.kind !== 'concept' || j.songId !== songId || j.tier !== tier) continue;
    const root = rootOf(db, j).id;
    chains.set(root, [...(chains.get(root) ?? []), j]);
  }
  return [...chains.values()].filter((chain) => chain.some((j) => j.status !== 'failed')).length;
}

/** Where a song's files live. */
export const songDir = (root: string, id: string) => join(root, 'songs', id);
/** The folder a job works in: its run folder, or the song folder for prep and legacy jobs. */
export const runPath = (root: string, job: Job) => (job.runDir ? join(songDir(root, job.songId), job.runDir) : songDir(root, job.songId));
/** The job's working folder: its run folder, or `<song>/make` for a legacy job. */
export const workPath = (root: string, job: Job) => (job.runDir ? runPath(root, job) : join(songDir(root, job.songId), 'make'));
/** A make job's finished video; legacy jobs (no run folder) wrote `video-<tier>.mp4` into the song folder. */
export const videoFile = (root: string, job: Job) => (job.runDir ? join(runPath(root, job), 'video.mp4') : join(runPath(root, job), `video-${job.tier}.mp4`));

export const emptyDb = (): Db => ({ users: [], songs: [], jobs: [], globalLimitUsd: 100, feedback: [] });
export const newId = () => randomBytes(9).toString('base64url');

/**
 * Queues a new job that runs a failed one again: same person, song, kind, tier, run folder (the steps resume from what
 * they wrote), inputs, accepted concept and fixed price. No limit check: the failed job charges nothing, so the person still pays the price once.
 */
export function retryJob(db: Db, failed: Job, opts: { auto: boolean }): Job {
  const job: Job = {
    id: newId(), userId: failed.userId, songId: failed.songId, kind: failed.kind, tier: failed.tier, status: 'queued',
    reservedUsd: failed.reservedUsd, priceUsd: failed.priceUsd, runDir: failed.runDir, retryOf: failed.id,
    ...(failed.inputs ? { inputs: failed.inputs } : {}), ...(failed.conceptOf ? { conceptOf: failed.conceptOf } : {}),
    ...(opts.auto ? { auto: true } : {}), createdAt: new Date().toISOString(),
  };
  db.jobs.push(job);
  return job;
}
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

/** Why a job may not be queued (in words for the person; `price` overrides the step's price), or undefined when it may. */
export function refuse(db: Db, userId: string, kind: Job['kind'], tier?: Tier, songId?: string, price?: number): string | undefined {
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.disabled) return '帳號無法使用';
  if (kind === 'concept' && songId && tier && conceptAttempts(db, songId, tier) >= MAX_CONCEPTS) return '這個版本已試過 3 次概念，請聯絡管理者';
  const cost = price ?? priceFor(kind, tier);
  // a concept is only worth starting when the whole version fits the person's limit: a balance that covers the concept
  // alone would leave a concept nobody can accept (the accept's make would be refused); the beta's budget keeps counting
  // each step as it is spent
  const whole = kind === 'concept' && tier && price === undefined;
  const need = whole ? TIER_TOTAL(tier) : cost;
  if (spent(db, userId) + need > user.limitUsd) return `額度不足：剩 $${Math.max(0, user.limitUsd - spent(db, userId)).toFixed(2)}，${whole ? '完成這個版本' : '這個步驟'}需要 $${need.toFixed(2)}`;
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

/**
 * Lists every running job's pid in `db.orphans` (call and persist before requeueRunning clears the pids), merged with
 * the entries an earlier start left there, and returns them all. Like killRunning, an entry or job from before the
 * machine booted is dropped: its pid may belong to an unrelated process now. Only liveness is checked beyond that.
 */
export function trackOrphans(db: Db, bootMs: number, now = new Date().toISOString()) {
  const before = (since: string | undefined) => !!since && Date.parse(since) < bootMs;
  const orphans = (db.orphans ?? []).filter((o) => !before(o.since));
  for (const j of db.jobs) {
    if (j.status !== 'running' || !j.pid || before(j.startedAt) || orphans.some((o) => o.pid === j.pid)) continue;
    orphans.push({ pid: j.pid, jobId: j.id, since: j.startedAt ?? now });
  }
  db.orphans = orphans;
  return orphans;
}

/** Jobs a restart interrupted go back to the queue (every pipeline step skips what it already wrote). */
export function requeueRunning(db: Db) {
  const requeued: Job[] = [];
  for (const j of db.jobs) if (j.status === 'running') { Object.assign(j, { status: 'queued', phase: undefined, startedAt: undefined, pid: undefined }); requeued.push(j); }
  return requeued;
}

/** The next job to run: none while one runs (one machine, one song at a time), else the oldest queued. */
export const nextJob = (db: Db) => (db.jobs.some((j) => j.status === 'running') ? undefined : db.jobs.filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]);
