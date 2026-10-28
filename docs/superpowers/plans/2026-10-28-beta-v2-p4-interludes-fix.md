# Beta v2 — Plan 4: Interludes Without Pictures, and the Fix Flow (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unsung stretches (intro, interlude, outro) carry no props or illustrations by default — only backdrop change and graphic motion — unless the director gives a reason for an exception; and a finished video can be "fixed" (修正) for two narrow kinds of problem without re-running the director: pictures in a marked time range removed, and lyric timing re-applied after the person re-times.

**Architecture:** One shared `unsungWindows(song)` helper decides what "unsung" means. The director writes `interludes: [{start,end,mode,reason}]` into the treatment; typeplan reads it, its prompt changes, and a deterministic pass strips sprites from cuts inside `backdrop` windows; keyframes (hybrid) keeps advancing the picture but only with scenery in those windows. The fix flow is a new job kind `fix`: it copies the source run into a new run folder, edits `typeplan.json` (picture fix) or the run's `song.json` (timing fix), rebuilds with `typeplan --plan` (no model call) and re-renders through `make.sh`.

**Tech Stack:** Node 22 + tsx (`node:test`), bash, Angular untouched (the form's 修正 button is enabled in the redesign's front-end work).

**Spec:** `docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md` §4.3, §4.5, §4.9. Code facts: see the Plan 4 exploration in the P3 ledger (typeplan T:299 currently tells the planner to use 人物 in unsung stretches; keyframes K:161 demands picture progress there; typeplan `--plan` rebuilds from a saved plan at $0).

## Global Constraints

- "Unsung" windows: gaps with no sung cue of at least **4 s** at the start (intro), **6 s** between lines (interlude), **6 s** at the end (outro) — the same thresholds as `titleGaps` in `src/app/lyric-vj/structure.ts`.
- Default mode for every unsung window: `backdrop` (backdrop change, graphic motion, rhythm; no sprite/prop/illustration). `pictures` only when the director writes a reason (≥ 8 characters) tied to the song's story; the concept card will show these reasons.
- The rule applies to every tier and every style: it is general, never per-song.
- (My call, narrowing spec §4.5: the 「某句歌詞看不清」 fix is left out — the treatment has no per-line colour or position field, so its scope cannot be made certain yet.) Fix v1 offers only kinds whose scope is certain: `picture` (remove pictures in the marked ranges; img tier only) and `timing` (re-apply the person's new lyric timing; all tiers). Every other problem category stays 「只回報」 or 「重做」.
- Fix price (placeholder, user decides): `fix 1` USD. A fix is a new version; the old one stays.
- Never edit `make.sh`/`prep.sh`/`concept.sh` in place (`.new`, chmod 755, `mv`, `bash -n`). Implementers never run the pipelines or the director for real, never `ng build` into `dist/`, never stop/signal the live server on 127.0.0.1:4320, never touch `out/beta`.
- Code/comments/commits English; Chinese prompt text written in the existing prompts' voice; Gitmoji + Conventional Commits; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx tsx --test scripts/lyric-vj/*.test.mts scripts/lyric-vj/beta/*.test.mts`; `npx ng test --watch=false` for `src/app/lyric-vj`.

## Review Focus

1. A song with no gaps, a song that is mostly instrumental, and a song whose last line ends at the very end → `unsungWindows` gives sensible windows (none / long / no outro) → tests in Task 1.
2. The deterministic strip must never remove a sprite from a cut that overlaps sung time, and must respect `pictures` exceptions → tests in Task 3.
3. Studio/CLI runs of direct.mts and typeplan.mts without the new data still work (treatment without `interludes` → every unsung window treated as `backdrop`) → tests in Tasks 2–3.
4. A fix on a legacy run (no runDir, `make/` folder) or on a hybrid video asking for `picture` is refused cleanly → tests in Task 5.
5. A timing fix uses the song's current timing, re-renders, and never re-runs the director or typeplan's model → tests in Task 5 (stub commands asserting the arguments).

---

### Task 1: `unsungWindows`

**Files:** Modify `src/app/lyric-vj/structure.ts`; Test `src/app/lyric-vj/structure.spec.ts` (create or extend).

**Interfaces:** Produces `export interface UnsungWindow { start: number; end: number; kind: 'intro' | 'interlude' | 'outro' }` and `export function unsungWindows(song: Pick<SongTimeline, 'cues' | 'duration'>): UnsungWindow[]` — same thresholds as `titleGaps` (refactor `titleGaps` to use it if they share logic; keep `titleGaps`' behaviour identical).

- [ ] Step 1: failing tests — no gaps → `[]`; intro 5 s → one intro; a 7 s gap → interlude; a 5 s gap → none; last cue ends at duration → no outro; instrumental song (no cues) → one window `[0, duration]` of kind `intro`.
- [ ] Step 2 RED → Step 3 implement → Step 4 GREEN (and existing `titleGaps` tests still pass).
- [ ] Step 5: commit `✨ feat(lyric-vj): one shared definition of the unsung stretches`

### Task 2: The director decides each interlude

**Files:** Modify `scripts/lyric-vj/direct.mts`, `scripts/lyric-vj/brief.mts` (prompt text helper), `src/app/lyric-vj/treatment.ts` (type `interludes?`); Test `scripts/lyric-vj/brief.test.mts`.

**Interfaces:**
- Produces in the director's `SCHEMA` (D:275): optional `interludes: { start: number; end: number; mode: 'backdrop' | 'pictures'; reason: string }[]` (not in `required`; the comment at D:97 asks to keep the grammar small).
- Produces `interludeText(windows: UnsungWindow[]): string` in brief.mts — the instruction block listing the song's windows (`mm:ss–mm:ss 前奏/間奏/尾奏`) and the rule: default `backdrop` (背景換段、圖形動態、節奏撐畫面，不放道具或插圖); `pictures` only when the story needs a picture there, with the reason; returns `''` when there are no windows (so a song without windows has an unchanged prompt).
- Produces a normaliser `normaliseInterludes(treatment, windows): string[]` (returns fix lines like the director's other `fixes`): drops entries that do not overlap a window, snaps entry times to the window, sets `mode: 'backdrop'` when `reason` is shorter than 8 characters, and fills missing windows with `backdrop`. Called after validation, before writing treatment.json.
- [ ] Step 1: failing tests for `interludeText` (empty for no windows; lists windows; contains the default rule) and `normaliseInterludes` (each case above).
- [ ] Step 2 RED → implement → GREEN; the "prompt unchanged without new data" test from Plan 3 still passes for songs with no windows.
- [ ] Step 5: commit `✨ feat(lyric-vj): the director decides how each interlude looks`

### Task 3: typeplan follows the decision

**Files:** Modify `scripts/lyric-vj/typeplan.mts`; Test `scripts/lyric-vj/typeplan.test.mts`.

**Interfaces:**
- Consumes `t.interludes` from the base treatment and `unsungWindows(song)`.
- Produces prompt change at T:299: replace 「用圖形、人物和節奏撐」 with the decision: in `backdrop` windows 「用背景換段、圖形和節奏撐，不放人物、道具或插圖」; in `pictures` windows the director's reason is quoted. Windows without a decision count as `backdrop`.
- Produces `export function stripUnsungSprites(cuts: { at: number; end: number; sprite?: string }[], windows: UnsungWindow[], interludes?: Interlude[]): { cuts; removed: number }` — removes `sprite` from a cut only when `[at, end)` lies **entirely** inside a `backdrop` window; called inside `buildCuts` before the layer is built; logs `interludes: removed N pictures`.
- [ ] Step 1: failing tests — cut fully inside a backdrop window loses its sprite; cut straddling the window edge keeps it; cut inside a `pictures` window keeps it; no interludes data → backdrop default; no windows → nothing removed.
- [ ] Step 2 RED → implement → GREEN.
- [ ] Step 5: commit `✨ feat(lyric-vj): no pictures in interludes unless the director says why`

### Task 4: Story frames and the concept card follow the decision

**Files:** Modify `scripts/lyric-vj/keyframes.mts` (prompt rule at K:161), `scripts/lyric-vj/beta/concept-summary.mts` (+ test); `src/app/pages/beta/beta.ts` (`ConceptSummary.interludes?` type only).

**Interfaces:**
- Produces a pure `unsungFrameRule(windows, interludes): string` in keyframes.mts (exported, tested): `backdrop` windows → frames there show only the place, light and time passing (no people, no props), still at most 9 s each; `pictures` windows → the old rule plus the reason.
- Produces `ConceptSummary.interludes?: { start: number; end: number; mode: 'backdrop' | 'pictures'; reason?: string }[]` read from `base/treatment.json` (Task 5–7 of Plan 3 will show 「間奏處理：…」 on the concept card).
- [ ] Steps 1–4: tests RED → implement → GREEN. Step 5: commit `✨ feat(lyric-vj): story frames and the concept summary follow the interlude decision`

### Task 5: Fix jobs (backend)

**Files:** Create `scripts/lyric-vj/beta/fix.sh`, `scripts/lyric-vj/beta/fix-apply.mts` (+ `fix-apply.test.mts`); Modify `scripts/lyric-vj/beta/store.mts` (`kind 'fix'`, `PRICE.fix = 1`), `feedback.mts` (accept `action: 'fix'` for allowed kinds), `server.mts` (route, command), `server.test.mts`.

**Interfaces:**
- Produces `FixKind = 'picture' | 'timing'`; `fixKindFor(marks): FixKind | undefined` — `picture` when there is at least one mark and every mark's category is `picture`; `timing` when there is at least one mark and every mark is `timing`; otherwise undefined (fix not offered for that report).
- Produces in `parseFeedback`: `action: 'fix'` is accepted when `fixKindFor(marks)` is defined and (for `picture`) the job's tier is `img`; otherwise 400 「這類問題目前只能重做或只回報」.
- Produces route behaviour: a feedback with `action: 'fix'` (owner, job done) also enqueues a `fix` job: price `PRICE.fix`, tier = source job's tier, a fresh `runDir`, `inputs: { from: <source runDir id>, kind, ranges: [{at,end}] }`; legacy source (no runDir) → 409 「這支舊影片無法修正，請重做」. Event `job.queued` with kind fix.
- Produces `fix-apply.mts --run <newRun> --kind picture --ranges <json>` — edits `<run>/<tier dir>/typeplan.json`: blank `sprite` on every cut overlapping any range (end defaults to at + 2 s); writes a `fix.json` record; exports `applyPictureFix(plan, ranges): { plan; removed: number }` (tested).
- Produces `fix.sh <song dir> <tier> <new run> <from run> <kind>`: copies `<from run>` into `<new run>` (excluding `video/`, `video.mp4`, `stills*`), then for `picture`: `fix-apply.mts` and `typeplan.mts --plan <tier dir>/typeplan.json` with the same arguments as make.sh's `plan` (so assets match); for `timing`: replaces `<new run>/song.json` with `<song dir>/song.json`; then `make.sh <song dir> <tier> <new run>` (every earlier step skips; horizon and render run). Phases: `##PHASE 套用修正`, then make.sh's phases.
- [ ] Step 1: failing tests — `fixKindFor` cases; `applyPictureFix` overlap cases; route: fix accepted for img picture, refused for hybrid picture, refused for legacy source, timing accepted for any tier, price 1, fresh runDir, inputs; the stub command receives `fix.sh … picture|timing`.
- [ ] Step 2 RED → implement → GREEN; `bash -n fix.sh`.
- [ ] Step 5: commit `✨ feat(beta): fix a finished video — remove pictures in a range or re-apply timing`

### Task 6: Benchmark check (controller, needs the user's OK)

- [ ] Step 1: Estimate the cost of re-running the director + typeplan (no render) on the 6 benchmark songs (`scripts/lyric-vj/bench.sh` list) and ask the user.
- [ ] Step 2: With approval, run them, count sprites in unsung windows before/after, and look at 6 stills per song from interludes; report. No deploy of the interlude rule to testers until the user has seen this.
