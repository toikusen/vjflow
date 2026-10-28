# Beta v2 — Plan 2: Layout, Results, Feedback, Admin Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Testers get a song page with a separate results section (time spent, price paid, style, download) and a problem-report form whose answers are all stored; system failures retry once on their own for free; the admin gets a per-song production log page; the two restart races left by Plan 1 are closed.

**Architecture:** Backend changes in `scripts/lyric-vj/beta/*` (queue hold flag, automatic retry, feedback records and routes, job style/duration fields). Front end: the list page `/my` keeps its create panel and shows compact song cards; a new song page `/my/song?id=<id>` holds 製作新版本 / 進行中 / 成品; a new admin song page `/my/admin/song?id=<id>` shows the timeline. Routing stays the path check in `src/app/app.ts`. All new pages reuse `beta.page.scss`.

**Tech Stack:** Node 22 + tsx (`node:test`), Angular 22 signals + vitest (`ng test`), Playwright (screenshots only).

**Spec:** `docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md` (§4.4 layout, §4.5 feedback form and raw storage, §4.6 layer 1 raw feedback, §4.7 admin log UI). Plan 1 ledger rulings carried here: P1 residual I-1 (pump ignores the startup wait), stopBeta during the wait does not hard-kill re-queued orphans, waitGone gives up silently. User decision 2026-10-28: a system failure retries once automatically for free; a fuse trip does not auto-retry; a second failure waits for the admin.

## Global Constraints

- One Mac, one job at a time; `nextJob` = oldest queued when nothing runs.
- Never edit `make.sh`/`prep.sh` in place (write `.new`, chmod 755, `mv`, `bash -n`). This plan should not need to touch them.
- Never `ng build` into `dist/` and never stop/signal the live server on 127.0.0.1:4320 from an implementer; only the deploy task (controller) does that, after checking no job is running or queued.
- Users see only their fixed price (`priceUsd`); platform cost (`costUsd`) is admin-only.
- Feedback categories (exact ids and labels): `lyrics` 歌詞看不清, `timing` 時間不準, `picture` 圖片不搭, `empty` 畫面空, `style` 風格不對, `rhythm` 節奏轉場, `other` 其他.
- Feedback actions: `fix` 修正, `redo` 重做, `none` 只回報. In this plan the form offers only `none` (and the 沒問題 path); `fix`/`redo` are stored types for Plans 3–4 and the form shows them disabled with the line 「修正與重做即將開放」.
- Limits: suggestion and each note ≤ 1000 characters; ≤ 20 marks per report; a mark's `at`/`end` are seconds within the video (0 ≤ at ≤ end ≤ duration when known, else ≥ 0).
- Every feedback submission is kept forever (never overwritten): a second report on the same video is a new record.
- User copy Traditional Chinese (Taiwan); code/comments/commits English; Gitmoji + Conventional Commits; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend tests `npx tsx --test scripts/lyric-vj/beta/*.test.mts`; front end `npx ng test --watch=false`.

## Review Focus

1. A tester must never see or submit feedback for another person's video, and admin-only fields (costUsd, other users) never reach tester routes → tests in Task 3.
2. An automatic retry must not double-charge: the failed job charges 0, the retry charges the fixed price once; and a retry that also fails must not retry again → tests in Task 2.
3. A song with only legacy jobs (no runDir, `make/base/treatment.json`) must still show its result card with style name and duration → test in Task 4.
4. Enqueuing during the startup wait must not start a pipeline beside an orphan → test in Task 1.
5. The song page must render sensibly for every song state: preparing, prep failed, waiting for timing, ready with no results, making, auto-retrying, failed for good, several results → covered by `songView` tests in Task 4 and screenshots in Task 8.

---

### Task 1: Close Plan 1's restart races

**Files:**
- Modify: `scripts/lyric-vj/beta/queue.mts`, `scripts/lyric-vj/beta/server.mts`
- Test: `scripts/lyric-vj/beta/server.test.mts`

**Interfaces:**
- Produces: `Queue.holding?: boolean` — while true, `pump` returns without starting anything. `createBetaServer` sets it before `killRunning` and clears it in `ready` just before the first `pump`.
- Produces: `createBetaServer` keeps the orphan pids it waits on; `stopBeta` hard-kills them too (`killGroup(pid, 0)`).
- Produces: event `queue.orphan.timeout` (`pids: number[]`) logged once per affected song when `waitGone` gives up; `waitGone` returns the pids still alive (`Promise<number[]>`).

- [ ] **Step 1: Write the failing tests** — `server.test.mts`:
  - `enqueuing during the startup wait does not start a job beside the orphan`: orphan stub job that ignores SIGTERM (`trap '' TERM; sleep 3`) so it outlives the first signal, second server on the same root, POST a make for another song immediately → that job stays `queued` until the orphan group is gone; its `startedAt` is after the orphan exited.
  - `stopBeta during the startup wait kills the waited-on orphans`.
  - `waitGone reports survivors and the server logs queue.orphan.timeout` (use a tiny timeout).
- [ ] **Step 2: Run** backend tests — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** backend tests (full suite twice) — Expected: PASS, no leftover processes (`ps`).
- [ ] **Step 5: Commit** `🐛 fix(beta): hold the queue until orphans are gone and kill them on stop`

### Task 2: One free automatic retry for system failures

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts`, `scripts/lyric-vj/beta/queue.mts`, `scripts/lyric-vj/beta/server.mts` (admin retry uses the helper)
- Modify: `src/app/pages/beta/beta.ts` (`BetaJob.retryOf?`, `BetaJob.auto?`)
- Test: `store.test.mts`, `server.test.mts`

**Interfaces:**
- Produces: `Job.retryOf?: string`, `Job.auto?: boolean` (true for the automatic retry), `Job.fused?: boolean` (set when the fuse trips).
- Produces: `retryJob(db: Db, failed: Job, opts: { auto: boolean }): Job` in `store.mts` — new queued job: same `userId`, `songId`, `kind`, `tier`, `runDir`, `priceUsd`, `reservedUsd`; `retryOf = failed.id`; `auto`; fresh `id`/`createdAt`. Pushes it to `db.jobs` and returns it. No limit check (the failed job charges 0, so the money is the same).
- Produces: in the queue's close/error path, after a job ends `failed` and the queue is not stopping: if `!job.fused && !job.auto && !job.retryOf`, create `retryJob(db, job, { auto: true })`, emit `job.autoretry` (`retryOf`) on the song's log, persist, pump. Exit 10 (`admin`) never auto-retries.
- Produces: the admin retry route calls `retryJob(db, j, { auto: false })` after its existing checks, keeps its `refuse` check, and its events (`job.queued`, `admin.retry` with `by`).

- [ ] **Step 1: Write the failing tests**
  - store: `retryJob copies the run and price, links retryOf, and the user pays once` — failed job (price 6) + retry done → `spent` 6.
  - server: `a failed job retries once by itself; a second failure waits for the admin` — stub `exit 1` → two jobs, the second `auto: true`, both `failed`, no third job; events include `job.autoretry` once.
  - server: `a fuse trip and an admin hold do not auto-retry`.
  - server: `an automatic retry resumes in the same run folder`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** backend + front-end tests — Expected: PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): retry a system failure once for free`

### Task 3: Feedback records and routes

**Files:**
- Create: `scripts/lyric-vj/beta/feedback.mts` (types, validation, `addFeedback`)
- Modify: `scripts/lyric-vj/beta/store.mts` (`Db.feedback`, `emptyDb`, `load` default), `scripts/lyric-vj/beta/server.mts` (routes, events)
- Modify: `src/app/pages/beta/beta.ts` (front-end types and `FEEDBACK_CATEGORIES`)
- Test: `scripts/lyric-vj/beta/feedback.test.mts` (create), `server.test.mts`

**Interfaces:**
- Produces (`feedback.mts`):
  - `export type FeedbackCategory = 'lyrics' | 'timing' | 'picture' | 'empty' | 'style' | 'rhythm' | 'other'`
  - `export type FeedbackAction = 'fix' | 'redo' | 'none'`
  - `export interface FeedbackMark { at: number; end?: number; category: FeedbackCategory; note: string }`
  - `export interface Feedback { id: string; jobId: string; songId: string; userId: string; ok: boolean; marks: FeedbackMark[]; suggestion: string; action: FeedbackAction; createdAt: string; tier?: Tier; style?: string }` — `tier`/`style` copied from the job at submission so the record stays meaningful later.
  - `export function parseFeedback(body: unknown, duration?: number): { ok: true; value: Pick<Feedback, 'ok' | 'marks' | 'suggestion' | 'action'> } | { ok: false; error: string }` — enforces the Global Constraints limits; `ok: true` with marks is allowed (a nit on a good video); `ok: false` needs at least one mark or a non-empty suggestion (error 「請標出哪裡有問題，或寫下建議」); trims text; in this plan any action other than `none` is rejected with 「修正與重做即將開放」.
  - `export function addFeedback(db: Db, job: Job, value, userId: string, style?: string): Feedback`
- Produces (routes):
  - `POST /beta/jobs/:id/feedback` — owner only (admin may not post on someone else's job), job must be a `make` job with status `done`; 201 with the record; event `feedback.submitted` (`feedbackId`, `ok`, `action`, `marks` count).
  - `GET /beta/jobs/:id/feedback` — owner or admin; array, newest first.
  - `GET /beta/admin/feedback` — admin; all records, newest first.

- [ ] **Step 1: Write the failing tests**
  - `feedback.test.mts`: limits (21 marks rejected, 1001-char note rejected, `end < at` rejected, `at` beyond duration rejected, unknown category rejected, `fix` rejected in this plan, `ok:false` with nothing rejected, text trimmed).
  - `server.test.mts`: owner posts and reads back; another tester gets 404 on post and get; admin can read but not post on the tester's job; a second report creates a second record; posting on a running job → 409; `/beta/admin/feedback` 403 for testers; the event is logged.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. `load` defaults `feedback: []` for existing db files.
- [ ] **Step 4: Run** backend + front-end tests — Expected: PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): keep every problem report on a finished video`

### Task 4: Result fields and the song view model

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts` (`workPath`), `scripts/lyric-vj/beta/server.mts` (`publicJob`)
- Modify: `src/app/pages/beta/beta.ts` (`songView`)
- Test: `server.test.mts`, `src/app/pages/beta/beta.spec.ts`

**Interfaces:**
- Produces: `workPath(root, job)` — the job's working folder: `runPath(root, job)` when `runDir` is set, else `<song>/make` (legacy).
- Produces: `publicJob` adds, for `make` jobs in `done`/`admin`: `style?: string` (Chinese name of `design.language` from `<workPath>/base/treatment.json` via `LANGUAGES[id].name` in `src/app/lyric-vj/languages.ts`; undefined when unreadable; read once and cached in memory by job id) and keeps `startedAt`/`endedAt`/`priceUsd`/`retryOf`/`auto`.
- Produces in `beta.ts`:
  - `export interface SongView { stage: 'preparing' | 'prepFailed' | 'timing' | 'ready'; prep?: BetaJob; active?: BetaJob; retrying: boolean; failedFor?: BetaTier; results: BetaJob[] }`
  - `export function songView(song: BetaSong, jobs: BetaJob[]): SongView` — `results`: this song's make jobs with status `done` (and `admin`, shown as held), newest first; `active`: the queued or running job of this song if any; `retrying`: `active?.auto === true`; `failedFor`: tier of the latest make job when it is `failed` and nothing is active (shown as 「製作失敗，管理者會協助處理」); prep states as in `songStage`.
  - `export const minutesBetween = (a?: string, b?: string) => number | undefined` (rounded up to whole minutes).

- [ ] **Step 1: Write the failing tests**
  - server: a done job with `runs/<id>/base/treatment.json` `{design:{language:'silkscreen'}}` exposes `style: '絲網海報'`; a legacy done job with `make/base/treatment.json` does too; a missing file gives no `style` and no error.
  - beta.spec: `songView` for preparing, prepFailed, timing, ready with no results, making, auto-retrying (`retrying: true`), failed for good (`failedFor`), two results ordered newest first, held result included.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** both suites — Expected: PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): style, duration and a song view for result cards`

### Task 5: Song page and compact song list

**Files:**
- Create: `src/app/pages/beta/song.page.ts`, `src/app/pages/beta/song.page.html`
- Modify: `src/app/app.ts` (route `/my/song` → `app-beta-song-page`, before `/my`), `src/app/pages/beta/beta.page.html`, `beta.page.ts` (cards link to the song page), `beta.page.scss` (new blocks only)
- Test: `src/app/pages/beta/beta.spec.ts` (route choice if extracted as a function), screenshots in Task 8

**Interfaces:**
- Consumes: `songView`, `minutesBetween`, `jobProgress`, `TIER_INFO`, `PREP_PRICE`, the existing confirm dialog pattern (`ask` signal + overlay) and progress template from `beta.page.*`.
- Produces: `/my/song?id=<songId>` page, polling `/beta/me`, `/beta/songs`, `/beta/jobs` every 5 s like the list page, with these sections top to bottom:
  1. **歌曲資訊**: back link 「← 我的歌曲」, title, artist・language, timing status with the link 「再看一次歌詞時間」 to `/timing?beta=<id>`.
  2. **製作新版本** (only in `ready`): the three tiers as selectable cards (`role="radio"`, one selected, default the first not yet made), price chip, minutes; one button 「製作{tier name}・${price}」 that opens the confirm dialog. Disabled with the line 「目前有工作在進行，完成後才能再製作」 while `active` exists.
  3. **進行中** (when `active`): the progress block; when `retrying`, the heading line 「第一次製作遇到系統問題，正在自動重試（不另外收費）」.
  4. **成品**: one card per `results` entry: video player, 「下載 1080p」, tier name, `style` (omit when absent), 「完成於 {MM-DD HH:mm}」, 「花費時間 約 {n} 分鐘」, 「費用 ${priceUsd}」 (legacy without price: omit the line), held results show 「已完成，管理者確認後就能下載」 instead of the player; a 「回報這個作品」 button (wired in Task 6). Empty state: 「還沒有成品」.
  - `failedFor` shows 「上一次製作失敗，系統已自動重試仍未成功，管理者會協助處理」 above 製作新版本.
  - Preparing / prepFailed / timing states reuse the list page's copy and the timing callout.
- Produces: list page `/my` right column = compact cards (cover letter, title, artist・language, status chip, `N 個成品` or progress percent) linking to `/my/song?id=`; tier cards and videos move off the list page.

- [ ] **Step 1: Write the failing test** for the route choice: extract `pageFor(path: string)` from `app.ts` into `src/app/pages/beta/route.ts` (or keep it in `app.ts` exported) and test `/my/song` → `beta-song`, `/my/admin/song` → `beta-admin-song`, `/my/admin` → `beta-admin`, `/my` → `beta`.
- [ ] **Step 2: Run** front-end tests — Expected: FAIL.
- [ ] **Step 3: Implement** the route function, song page and list cards.
- [ ] **Step 4: Run** front-end tests — Expected: PASS. Run `npx ng build --output-path <scratch>` once to catch template errors (never into `dist/`).
- [ ] **Step 5: Commit** `💄 feat(beta): song page with its own results section; compact song list`

### Task 6: Problem-report form on result cards

**Files:**
- Create: `src/app/pages/beta/report-form.component.ts`, `report-form.component.html`
- Modify: `src/app/pages/beta/song.page.ts/.html`, `beta.page.scss`
- Test: `src/app/pages/beta/report-form.spec.ts` (create) for the pure parts

**Interfaces:**
- Consumes: `FEEDBACK_CATEGORIES` (Task 3), `POST/GET /beta/jobs/:id/feedback`.
- Produces: `<app-report-form [job] [video]>` where `video` is the card's `HTMLVideoElement` (template ref):
  - First choice: 「沒問題」 / 「有問題」 (two large toggle buttons).
  - 沒問題: optional one-line note → 「送出」.
  - 有問題: list of marks; 「標記目前時間」 adds a mark at `video.currentTime` (rounded to 0.1 s); each mark shows `mm:ss`, an optional end 「設為結束」 (sets `end` to current time when > at), category chips (one required), a note field, remove ×; clicking a mark's time seeks the video there. Then 建議 textarea, then 處理方式: 修正 / 重做 disabled with 「修正與重做即將開放」, 只回報 selected.
  - Validation mirrors `parseFeedback` (pure helper `validateReport(...)` in the component file, tested); server errors shown inline.
  - After a successful submit: the card shows 「已收到回報，謝謝！」 plus a summary of past reports for this video (count, newest first: 沒問題/有問題, marks count, date).
- [ ] **Step 1: Write the failing tests** for `validateReport` and `formatTime(seconds) → 'm:ss'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the component and wire it into result cards.
- [ ] **Step 4: Run** front-end tests — Expected: PASS; scratch `ng build` clean.
- [ ] **Step 5: Commit** `✨ feat(beta): report problems on a finished video`

### Task 7: Admin song log page

**Files:**
- Create: `src/app/pages/beta/admin-song.page.ts`, `admin-song.page.html`
- Modify: `src/app/app.ts` (route), `src/app/pages/beta/beta-admin.page.html` (songs table with links), `beta-admin.page.ts`, `beta.page.scss`
- Modify: `scripts/lyric-vj/beta/server.mts` only if a needed admin read is missing (song list for admin already exists via `/beta/songs`)
- Test: `src/app/pages/beta/beta.spec.ts` (pure `timeline(...)` helper)

**Interfaces:**
- Consumes: `/beta/admin/songs/:id/events`, `/beta/admin/songs/:id/logs`, `/beta/admin/songs/:id/logs/<path>`, `/beta/admin/jobs`, `/beta/admin/feedback`, `/beta/songs`, `/beta/admin/users`.
- Produces: `export function timeline(events: BetaEvent[]): { jobId?: string; title: string; at: string; detail?: string; tone: 'ok' | 'warn' | 'bad' | 'info' }[]` in `beta.ts` (tested): one row per event, Chinese titles for each event type (song.created 建立歌曲, audio.uploaded 上傳音檔, timing.saved 儲存時間／確認時間, job.queued 排隊, job.started 開始, job.phase 步驟：{phase}, job.cost 費用 ${usd}（{key}）, job.ended 結束：{status}, job.fused 保險絲觸發, job.requeued 重開機後重新排隊, job.autoretry 自動重試, admin.retry 管理者重跑, admin.approve 管理者放行, feedback.submitted 使用者回報, queue.orphan.timeout 殘留程序未結束), tones: failed/fused/timeout bad, autoretry/requeued warn, done ok.
- Produces: `/my/admin/song?id=<id>` page:
  - header: title, owner name, created date, totals (user charged = sum of that song's charged jobs, platform cost = sum of `costUsd`).
  - per job (newest first): tier/kind, status chip, price, platform cost, unsettled, error, step table (phase, start time, duration to next step), cost rows (key, usd), retryOf/auto badges.
  - timeline list from `timeline(events)`.
  - logs: list with sizes; clicking one loads its text into a `<pre>` (last 2000 lines shown, with 「下載完整 log」 link).
  - feedback for this song (from `/beta/admin/feedback` filtered): each record with marks, suggestion, action, linked job.
  - admin page `/my/admin` gets a 「歌曲」 table (title, owner, last activity, jobs count) linking here.
- [ ] **Step 1: Write the failing test** for `timeline`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the helper, page, route and admin table.
- [ ] **Step 4: Run** front-end tests — Expected: PASS; scratch `ng build` clean.
- [ ] **Step 5: Commit** `✨ feat(beta): admin song page with timeline, steps, costs, logs and reports`

### Task 8: Screenshots, deploy, first feedback record (controller)

**Files:** `scripts/.shot-beta.mjs` (untracked helper, extend locally), no tracked changes expected.

- [ ] **Step 1:** Extend the mock screenshot script for `/my`, `/my/song?id=` (states: making, retrying, failed-for-good, two results, report form open) and `/my/admin/song?id=`, at 1440 and 390 wide; check no horizontal overflow and read every image.
- [ ] **Step 2:** Confirm no job is running or queued in `out/beta/db.json`; back up `db.json` to the scratchpad.
- [ ] **Step 3:** Build to scratch, `rsync -a --delay-updates --delete` into `dist/vjflow/browser/`, stop the server task, start it again; `/my` → 200.
- [ ] **Step 4:** Record the user's first report (spec §4.5). The API needs the owner's cookie, so do it with the server stopped (between Step 3's stop and start): run a one-off `npx tsx -e` that loads `out/beta/db.json`, calls `addFeedback` for 行星's done 插圖版 job with exactly `ok: false`, `marks: []`, `suggestion: '間奏不要放圖片，只要背景變換就好（要看歌適不適合；行星這首間奏就不該放圖）（使用者選擇修正，這次不重跑）'`, `action: 'none'` (修正 is not open yet), saves, and logs `feedback.submitted`.
- [ ] **Step 5:** Report to the user with the screenshots' paths and what changed.
