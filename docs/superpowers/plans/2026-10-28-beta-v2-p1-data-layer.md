# Beta v2 — Plan 1: Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every make job gets its own run folder and input snapshot, users are charged a fixed price (platform absorbs overruns, system failures free), and every job records per-step times, deduplicated costs and an append-only per-song event log that the admin can read.

**Architecture:** All changes live in the beta backend (`scripts/lyric-vj/beta/*`) plus the small front-end type/URL adjustments needed so the current pages keep working. The JSON store stays (single writer). A job carries `runDir`, `priceUsd`, `steps[]`, `costs[]`; the queue fills `steps`/`costs` from `##PHASE`/`##COST` lines; a new `events.mts` appends JSON lines to `songs/<id>/events.jsonl`.

**Tech Stack:** Node 22 + tsx (`node:test`), bash, Angular 22 (vitest via `ng test`).

**Spec:** `docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md` (§3, §4.7, §4.8, §4.9, §5). Later plans: P2 layout/results/feedback form/admin log page, P3 concept gate + inputs + style tiers, P4 interlude rule + fix flow, P5 lessons base, P6 style reference images (deferred by the user).

## Global Constraints

- One Mac, one job at a time; the queue stays `nextJob` = oldest queued when nothing runs.
- Never edit `scripts/lyric-vj/beta/make.sh` in place while a job runs: write `make.sh.new` and `os.replace`/`mv` it over (bash reads the running script by offset).
- Never `ng build` into `dist/` while the server runs: build to a scratch folder, then `rsync -a --delay-updates --delete <scratch>/browser/ dist/vjflow/browser/`.
- Restarting the server re-queues a running job (`requeueRunning`), which reruns it; only restart when no job runs, or with the user's OK.
- Prices (my call, from the existing `RESERVE`, which already sits above measured costs; admin decides final numbers): `prep 0.5`, `none 4`, `img 6`, `hybrid 16` USD.
- Fuse: a job whose measured cost passes `2 ×` its price is stopped and marked failed with error `成本超過上限，已通知管理者`; the user is not charged for it.
- User-facing copy is Traditional Chinese (Taiwan); code, comments, identifiers, commits English; commits Gitmoji + Conventional Commits.
- Backend tests: `npx tsx --test scripts/lyric-vj/beta/*.test.mts`. Front-end tests: `npx ng test --watch=false`.

## Review Focus

1. A job that existed before this change (no `runDir`, no `priceUsd`, video at `songs/<id>/video-<tier>.mp4`) must still show, download and count as before → test in Task 1 (legacy video) and Task 3 (legacy price).
2. Admin "retry" of a failed job must resume in the same run folder, not start an empty one (the steps skip what they wrote) → test in Task 1.
3. A server restart mid-job must not double-count costs already recorded for that job when the rerun re-prints `##COST` for a step it redoes → test in Task 2 (same key twice counts once).
4. A failed job that had started a paid step must show that step as unsettled for the admin, while the user is charged 0 → test in Task 3.
5. The admin log endpoints must refuse paths outside the song folder (`..`, absolute, other songs) and refuse non-admins → test in Task 4.

---

### Task 1: One run folder per make job

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts` (Job type, `load` defaults)
- Modify: `scripts/lyric-vj/beta/server.mts` (enqueue, retry, video routes, `command`)
- Modify: `scripts/lyric-vj/beta/make.sh` (third argument: run dir; atomic replace)
- Modify: `src/app/pages/beta/beta.ts`, `beta.page.ts`, `beta.page.html`, `beta-admin.page.ts` (video URL by job)
- Test: `scripts/lyric-vj/beta/server.test.mts`, `scripts/lyric-vj/beta/store.test.mts`, `src/app/pages/beta/beta.spec.ts`

**Interfaces:**
- Produces: `Job.runDir?: string` — path relative to the song dir, `runs/<jobId>` for make jobs, unset for prep and legacy jobs.
- Produces: `export const runPath = (root: string, job: Job) => string` in `store.mts` — absolute run dir; `songDir(root, job.songId)` when `runDir` is unset.
- Produces: `export const videoFile = (root: string, job: Job) => string` in `store.mts` — `<run>/video.mp4`, or legacy `<song>/video-<tier>.mp4` when `runDir` is unset.
- Produces: route `GET /beta/jobs/:jobId/video` (owner or admin; job `done`, or `admin` status for admins).
- Produces: `BetaStage` `ready` gains `videos: { tier: BetaTier; jobId: string }[]` (latest done job per tier) in `src/app/pages/beta/beta.ts`.
- Produces: `make.sh <song dir> <tier> <run dir>`: `S=$run/song.json`, `w=$run`, output `$run/video.mp4`; `song.json` is copied into the run dir at the start when missing (the snapshot).

- [ ] **Step 1: Write the failing tests**

`server.test.mts`:
```ts
test('each make job gets its own run folder with a snapshot, and its video is served by job', async () => {
  // command stub writes the video into the run dir it is given
  // POST /beta/songs/s1/make {tier:'img'} → job.runDir === `runs/${job.id}`
  // after done: GET /beta/jobs/<id>/video → 200 for the tester, 404 for another user's job id
});
test('admin retry of a failed make job reuses its run folder', async () => {
  // failed job j1 with runDir 'runs/j1' → POST /beta/admin/jobs/j1/retry → new job.runDir === 'runs/j1'
});
test('a legacy job without runDir still serves songs/<id>/video-<tier>.mp4', async () => {});
```
`store.test.mts`:
```ts
test('videoFile and runPath fall back to the song folder for legacy jobs', () => {
  assert.equal(videoFile('/r', job({ songId: 's', tier: 'img' })), '/r/songs/s/video-img.mp4');
  assert.equal(videoFile('/r', job({ songId: 's', runDir: 'runs/j' })), '/r/songs/s/runs/j/video.mp4');
});
```
`beta.spec.ts`: extend the `ready` expectation with `videos: [{ tier: 'img', jobId: 'b' }]`.

The setup's `command` stub must receive the run dir: change `createBetaServer`'s `command(job, db)` contract so `command` builds paths with `runPath(root, job)` (the stub writes `video.mp4` there with `mkdir -p`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test scripts/lyric-vj/beta/*.test.mts` and `npx ng test --watch=false`
Expected: FAIL (`runDir` undefined, `videoFile` not exported, route 404, `videos` missing).

- [ ] **Step 3: Implement**

- `enqueue` sets `runDir: kind === 'make' ? \`runs/${id}\` : undefined` (generate `id` first); retry passes the failed job's `runDir` through.
- Video routes: new `/beta/jobs/:id/video`; keep `/beta/songs/:id/video/:tier` for old links, resolving to the latest `done` job of that tier via `videoFile`.
- `command` in the `import.meta.url` block: `bash scripts/lyric-vj/beta/make.sh <songDir> <tier> <runPath>`.
- `make.sh`: `run=$3`; `mkdir -p "$run"`; `[ -f "$run/song.json" ] || cp "$d/song.json" "$run/song.json"`; replace `S=$d/song.json; w=$d/make` with `S=$run/song.json; w=$run`; final copy goes to `$run/video.mp4`. Write the new file as `make.sh.new`, `chmod 755`, then `mv make.sh.new make.sh`; check `bash -n`.
- Front end: `video(...)` uses `/beta/jobs/${jobId}/video`; `songStage` fills `videos` from the latest `done` make job per tier.

- [ ] **Step 4: Run tests to verify they pass**

Run: both test commands. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lyric-vj/beta src/app/pages/beta
git commit -m "✨ feat(beta): one run folder and song snapshot per make job"
```

### Task 2: Per-step times and deduplicated costs

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts` (Job fields)
- Modify: `scripts/lyric-vj/beta/queue.mts` (`readLine`)
- Modify: `scripts/lyric-vj/beta/make.sh`, `scripts/lyric-vj/beta/prep.sh` (cost keys; atomic replace for make.sh)
- Test: `scripts/lyric-vj/beta/queue.test.mts` (create)

**Interfaces:**
- Produces: `Job.steps?: { phase: string; at: string }[]` — appended whenever `phase` changes (not on a repeat of the same phase).
- Produces: `Job.costs?: { key: string; usd: number; phase?: string }[]`; `Job.costUsd` stays the sum of `costs`.
- Produces: line format `##COST <usd> <key>`; `<key>` optional; a missing key becomes `phase:<current phase>#<n>` where n counts unkeyed lines in that phase (so old scripts still add up).
- Produces: `readLine(job: Job, line: string, now?: () => string): boolean` (same return meaning as today).

- [ ] **Step 1: Write the failing test** — `queue.test.mts`:

```ts
test('phases are timed once each and costs count once per key', () => {
  const j = { id: 'j', status: 'running' } as Job;
  const t = ['T1', 'T2', 'T3'];
  readLine(j, '##PHASE 導演規劃段落與故事', () => t[0]);
  readLine(j, '##PHASE 導演規劃段落與故事', () => t[1]);
  readLine(j, '##COST 2.021 direct', () => t[1]);
  readLine(j, '##COST 2.021 direct', () => t[2]);
  readLine(j, '##PHASE 畫道具', () => t[2]);
  readLine(j, '##COST 0.5', () => t[2]);
  assert.deepEqual(j.steps, [{ phase: '導演規劃段落與故事', at: 'T1' }, { phase: '畫道具', at: 'T3' }]);
  assert.equal(j.costUsd, 2.521);
  assert.equal(j.costs!.length, 2);
});
```

- [ ] **Step 2: Run** `npx tsx --test scripts/lyric-vj/beta/queue.test.mts` — Expected: FAIL.

- [ ] **Step 3: Implement** `readLine` as specified; in `make.sh` pass a key per step to `cost_json`/`cost_log` (`direct`, `props`, `plan-<name>`, `keyframes`, `cutout`, `horizon`), e.g. `cost_json <file> <key>` printing `##COST %.3f <key>`; in `prep.sh` key `proofread`. Atomic replace for `make.sh`.

- [ ] **Step 4: Run** all backend tests — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "✨ feat(beta): time each job step and count each cost once"`

### Task 3: Fixed price, free system failures, cost fuse

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts` (`RESERVE` → `PRICE`, `charged`, `spent`, `platformSpent`, `refuse`)
- Modify: `scripts/lyric-vj/beta/queue.mts` (fuse: kill the child)
- Modify: `scripts/lyric-vj/beta/server.mts` (`publicUser`, admin users/jobs payloads, enqueue stores `priceUsd`)
- Modify: `src/app/pages/beta/beta.ts` (`TIER_INFO.reserve` → `price`, `PREP_RESERVE` → `PREP_PRICE`), `beta.page.html` and `beta-admin.page.html` copy: 「預留」→「費用」; dialog rows 「這次費用／目前剩餘／扣除後剩餘」; drop the line 「先預留，完成後改按實際花費計算。」
- Test: `store.test.mts`, `server.test.mts`, `beta.spec.ts`

**Interfaces:**
- Produces: `export const PRICE: Record<'prep' | Tier, number> = { prep: 0.5, none: 4, img: 6, hybrid: 16 }` and `priceFor(kind, tier?)`.
- Produces: `Job.priceUsd?: number` (set at enqueue); legacy jobs fall back to today's `charged` (`costUsd ?? reservedUsd`).
- Produces: `charged(j: Job): number` — user charge: `0` when `status === 'failed'`; `priceUsd` when set; else legacy rule.
- Produces: `platformSpent(db: Db): number` — real money: sum of `costUsd ?? (queued|running ? priceUsd ?? reservedUsd : 0)`. The global limit check in `refuse` uses `platformSpent`; the per-user check uses `spent` (sum of `charged`).
- Produces: `Job.unsettled?: string` — the phase in progress when a job failed (set in the queue's `close` handler on non-zero, non-10 exit).
- Produces: fuse in `pump`'s `take`: after `readLine`, if `job.costUsd > 2 * (job.priceUsd ?? Infinity)`, set `job.error = '成本超過上限，已通知管理者'` and kill the whole process group (`spawn(..., { detached: true })`, then `process.kill(-child.pid!, 'SIGTERM')`): killing only `bash` leaves its children holding the stdout pipe, so `close` would wait for them. The `close` handler keeps that error instead of `exit <code>`. `charged` returns 0 for every failed job, legacy ones included.
- Produces: admin payloads add `priceUsd`, `costUsd`, `unsettled`; `/beta/admin/users` adds `platformSpentUsd`.

- [ ] **Step 1: Write the failing tests**

`store.test.mts`:
```ts
test('users pay the fixed price; failed jobs are free; the platform pays the measured cost', () => {
  const db = emptyDb(); const { user } = invite(db, 'A', 20);
  db.jobs.push(job({ userId: user.id, tier: 'img', priceUsd: 6, costUsd: 3.62, status: 'done' }));
  db.jobs.push(job({ userId: user.id, tier: 'img', priceUsd: 6, costUsd: 1.1, status: 'failed' }));
  db.jobs.push(job({ userId: user.id, tier: 'none', priceUsd: 4, status: 'running' }));
  assert.equal(spent(db, user.id), 10);
  assert.equal(platformSpent(db), 3.62 + 1.1 + 4);
});
test('a legacy job without priceUsd is charged as before', () => {
  const db = emptyDb(); db.jobs.push(job({ reservedUsd: 6, costUsd: 3.62 }));
  assert.equal(spent(db), 3.62);
});
```
`server.test.mts`:
```ts
test('a job whose cost passes twice its price is stopped and not charged', async () => {
  // command stub: echo '##COST 13 x'; sleep 5   (img price 6)
  // → job.status 'failed', error '成本超過上限，已通知管理者', /beta/me spentUsd 0, finishes well under 5 s
});
test('a failed job records the step it was in as unsettled', async () => {
  // stub: echo '##PHASE 畫道具'; exit 1 → admin job payload unsettled === '畫道具'
});
```

- [ ] **Step 2: Run** backend + front-end tests — Expected: FAIL.

- [ ] **Step 3: Implement** per Interfaces. Keep `reservedUsd` on new jobs equal to `priceUsd` so old readers stay correct.

- [ ] **Step 4: Run** all tests — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "✨ feat(beta): fixed prices, free system failures and a cost fuse"`

### Task 4: Per-song event log and admin read API

**Files:**
- Create: `scripts/lyric-vj/beta/events.mts`
- Modify: `scripts/lyric-vj/beta/queue.mts` (emit job events), `scripts/lyric-vj/beta/server.mts` (emit song/admin events; admin routes)
- Test: `scripts/lyric-vj/beta/events.test.mts` (create), `server.test.mts`

**Interfaces:**
- Produces: `export type BetaEvent = { at: string; type: string; jobId?: string; by?: string; [k: string]: unknown }`.
- Produces: `logEvent(root: string, songId: string, e: Omit<BetaEvent, 'at'>, now?: () => string): void` — appends one JSON line to `songs/<songId>/events.jsonl` (creates the folder).
- Produces: `readEvents(root: string, songId: string): BetaEvent[]` — `[]` when missing; skips unparsable lines.
- Event types (exact strings): `song.created`, `audio.uploaded`, `timing.saved` (`confirmed: boolean`), `job.queued` (`kind`, `tier`, `priceUsd`), `job.started`, `job.phase` (`phase`), `job.cost` (`key`, `usd`), `job.ended` (`status`, `error?`, `unsettled?`, `costUsd?`), `admin.retry`, `admin.approve`.
- `Queue` gains `onEvent?: (job: Job, e: Omit<BetaEvent, 'at' | 'jobId'>) => void`; `pump` calls it for started/phase/cost/ended (phase/cost only when `readLine` actually added a step or a new cost key). The server wires it to `logEvent(o.root, job.songId, { ...e, jobId: job.id })`.
- Admin routes:
  - `GET /beta/admin/songs/:id/events` → `readEvents` array.
  - `GET /beta/admin/songs/:id/logs` → `{ path: string; bytes: number }[]` for every `*.log` under the song folder (recursive, paths relative to it), plus `out/beta/logs/<jobId>.log` for that song's jobs as `jobs/<jobId>.log`.
  - `GET /beta/admin/songs/:id/logs/<relative path>` → `text/plain; charset=utf-8`; 400 when the resolved path leaves the song folder (or is not a `.log`), 404 when missing.

- [ ] **Step 1: Write the failing tests**

`events.test.mts`:
```ts
test('events append as JSON lines and read back in order, skipping broken lines', () => {
  // logEvent twice, append 'not json\n' by hand, logEvent again → readEvents length 3, types in order
});
```
`server.test.mts`:
```ts
test('a make job leaves queued, started, phase, cost and ended events', async () => {
  // stub: echo '##PHASE 製作中'; echo '##COST 2.5 x' → GET /beta/admin/songs/s1/events types ===
  // ['job.queued','job.started','job.phase','job.cost','job.ended']
});
test('admin logs list and read; traversal and non-admins are refused', async () => {
  // write songs/s1/runs/j/direct.log → list includes 'runs/j/direct.log'; read returns its text
  // GET .../logs/..%2F..%2Fdb.json → 400; tester GET .../events → 403
});
```

- [ ] **Step 2: Run** backend tests — Expected: FAIL.

- [ ] **Step 3: Implement** per Interfaces; `logEvent` uses `appendFileSync`; path check with `resolve` + `startsWith(songDir + sep)`.

- [ ] **Step 4: Run** all backend tests — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "✨ feat(beta): per-song event log and admin log reader"`

### Task 5: Progress uses the recorded step times

**Files:**
- Modify: `src/app/pages/beta/beta.ts` (`BetaJob.steps?`, `jobProgress`), `scripts/lyric-vj/beta/server.mts` (`publicJob` adds `steps` and, for the owner, `priceUsd`, `costUsd` when done)
- Test: `src/app/pages/beta/beta.spec.ts`

**Interfaces:**
- Consumes: `Job.steps` (Task 2).
- Produces: `jobProgress(job, now)` uses the last `steps` entry's `at` as the start of the current step when present (time in the current step = `now - at`, capped at 90 % of its estimate, earlier steps counted in full); unchanged fallback when `steps` is absent.
- Produces: `BetaJob` gains `steps?`, `priceUsd?`, `costUsd?` (P2 shows time and cost on result cards from these and `startedAt`/`endedAt`).

- [ ] **Step 1: Write the failing test**

```ts
it('times the current step from its recorded start', () => {
  const j = job({ kind: 'make', tier: 'img', status: 'running', phase: '畫道具', startedAt: '2026-10-27T00:00:00Z',
    steps: [{ phase: '導演規劃段落與故事', at: '2026-10-27T00:00:00Z' }, { phase: '畫道具', at: '2026-10-27T00:20:00Z' }] });
  const p = jobProgress(j, Date.parse('2026-10-27T00:21:00Z'));
  expect(p.pct).toBe(Math.round(((9 + 1) / 30) * 100));
});
```

- [ ] **Step 2: Run** `npx ng test --watch=false` — Expected: FAIL.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run** front-end and backend tests — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "✨ feat(beta): progress from recorded step times"`

### Task 6: Deploy without disturbing a running job

**Files:** none changed.

- [ ] **Step 1:** Check no job runs: `python3 -c "import json;print([j['id'] for j in json.load(open('out/beta/db.json'))['jobs'] if j['status'] in ('running','queued')])"` → Expected: `[]`. If not empty, stop and ask the user.
- [ ] **Step 2:** Build to scratch and sync: `npx ng build --output-path <scratch>/dist-next` then `rsync -a --delay-updates --delete <scratch>/dist-next/browser/ dist/vjflow/browser/`.
- [ ] **Step 3:** Restart the server (stop the running `tsx scripts/lyric-vj/beta/server.mts`, start it again in the background); `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4320/my` → `200`; `/beta/admin/songs/<行星 id>/events` → `[]` or newer events (old jobs have none; expected).
- [ ] **Step 4:** Report to the user what changed for testers (「預留」→ fixed 「費用」, failed jobs refunded) and that old jobs keep their old charges.
