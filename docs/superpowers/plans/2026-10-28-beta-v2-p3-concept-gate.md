# Beta v2 — Plan 3: Concept Gate, Inputs and Style Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the full video is made, the director produces a concept (style, palette, font, story idea, how it read the person's wishes, any concerns, three sample frames) for a small fixed price; the person accepts it, asks for an adjustment, or asks for a new direction, and only an accepted concept goes on to the full make. The person can write the feeling they want, upload reference images and pick a style (or leave it to the director).

**Architecture:** A new job kind `concept` runs `scripts/lyric-vj/beta/concept.sh` in its own run folder: the director (`direct.mts`, now also given the person's text, reference images and style), the text layout (`typeplan.mts` for `noimg`), three stills (`render.mts --stills`), and a `concept.json` summary. Accepting creates a `make` job on the same run folder, so `make.sh` skips the steps already done. Adjust / new direction create a new `concept` job in a new run folder. A style catalog with three tiers (proven / candidate / unlisted) lives in the db; with no candidates yet, the menu and the director keep to the proven languages.

**Tech Stack:** Node 22 + tsx (`node:test`), bash, Angular 22 signals + vitest, Anthropic Messages API (vision image blocks), Playwright (screenshots only).

**Spec:** `docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md` §4.1, §4.2, §4.9. Plan 2 residual carried: admin song page overflows 18 px at 390 px wide.

## Global Constraints

- Prices (placeholders until the user sets token prices; my call keeping each tier's total unchanged): `concept 2.5` USD for each concept attempt; after acceptance `none 1.5`, `img 3.5`, `hybrid 13.5`; `prep 0.5` unchanged. A person who stops after the concept pays only the concept.
- At most **3** concept attempts per song and tier (first + 2 adjust/redo); the 4th is refused with 「這個版本已試過 3 次概念，請聯絡管理者」.
- The person's concept text: ≤ 500 characters. Reference images: ≤ 5 per song, jpg/png/webp, ≤ 10 MB each, validated by content type and magic bytes on the server; only the owner and admins can read them.
- Named artists, studios or works in the concept text (e.g. 宮崎駿) are translated by the director into visual traits; the concept card shows that reading; no names, characters or logos are drawn.
- The style menu lists the languages whose tier is `proven` or `candidate`, each with its reference image; the menu shows no tier label (tiers are admin-only). Default 「交給導演」. When the person leaves it to the director, the director picks only from `proven` + `candidate`; a `candidate` pick must be justified in the concept. (No candidate exists until the user supplies songs for reference images — Plan 6.)
- When the person picked a style, it is used as given; if the director thinks it does not suit the song, it writes `concerns`, the card shows them above the buttons, and accepting needs one extra tick 「我了解，仍要用這個風格」.
- Never edit `make.sh`/`prep.sh`/`concept.sh` in place while a job may run (write `.new`, chmod 755, `mv`, `bash -n`). Implementers never run the pipelines for real (paid API calls), never `ng build` into `dist/`, never stop/signal the live server on 127.0.0.1:4320, never touch `out/beta`.
- Users see only their fixed price; platform cost is admin-only.
- User copy Traditional Chinese (Taiwan); code/comments/commits English; Gitmoji + Conventional Commits; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: backend `npx tsx --test scripts/lyric-vj/beta/*.test.mts` (+ any new `scripts/lyric-vj/*.test.mts` for director helpers); front end `npx ng test --watch=false`.

## Review Focus

1. Accepting a concept must charge exactly the tier's remaining price once, reuse that concept's run folder, and never re-run (or re-charge) the director → tests in Task 1 and Task 4.
2. Reference images are a trust boundary: wrong types, oversized files, fake extensions, path tricks in names, a 6th image, and another user reading them → tests in Task 4.
3. A concept job that fails (system failure) follows Plan 2's free automatic retry and never leaves the song stuck in 「概念待確認」 → test in Task 4 and the songView tests in Task 6.
4. Old songs and jobs (no concept jobs, legacy make jobs) still render and can still be made — the make button now starts a concept → songView tests in Task 6.
5. The director's new inputs must not break the existing studio/CLI uses of `direct.mts` (no `--refs`, no `--style`) → test in Task 3 of the prompt builder with and without them.

---

### Task 1: Concept job kind, prices and attempts in the store

**Files:**
- Modify: `scripts/lyric-vj/beta/store.mts`
- Test: `scripts/lyric-vj/beta/store.test.mts`

**Interfaces:**
- Produces: `Job.kind: 'prep' | 'concept' | 'make'`.
- Produces: `PRICE: Record<'prep' | 'concept' | Tier, number> = { prep: 0.5, concept: 2.5, none: 1.5, img: 3.5, hybrid: 13.5 }`; `priceFor(kind, tier?)` returns `PRICE.concept` for concept, the tier price for make, `PRICE.prep` for prep. `TIER_TOTAL(tier) = PRICE.concept + PRICE[tier]` exported for the UI copy.
- Produces: `Job.inputs?: { concept: string; style?: string; refs: string[]; note?: string; from?: string }` (concept text, chosen language id or undefined = director, ref file names copied into the run, the adjust note, the concept job it adjusts/redoes).
- Produces: `Job.decision?: 'accepted' | 'adjusted' | 'redone'` on concept jobs; `Job.conceptOf?: string` on the make job created by acceptance.
- Produces: `MAX_CONCEPTS = 3`; `conceptAttempts(db, songId, tier): number` — an attempt is a concept job (with `tier`) that has no `retryOf`; it counts unless it and every job retrying it (`retryOf === its id`) ended `failed` (a system failure never uses up an attempt). Concept jobs always carry the `tier` they are for.
- Produces: `refuse(db, userId, kind, tier, songId?)` also returns 「這個版本已試過 3 次概念，請聯絡管理者」 for a 4th concept.
- Legacy: existing `make` jobs (no `conceptOf`) keep their stored `priceUsd`; `charged` unchanged.

- [ ] **Step 1: Write failing tests** — prices and `TIER_TOTAL('img') === 6`; `conceptAttempts`: failed + retry done counts 1, failed + retry failed counts 0, counts per tier; the 4th concept refused with the exact text; a legacy make job's charge unchanged.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): concept jobs, split prices and attempt limits`

### Task 2: concept.sh pipeline and concept summary

**Files:**
- Create: `scripts/lyric-vj/beta/concept.sh`, `scripts/lyric-vj/beta/concept-summary.mts` (+ `concept-summary.test.mts`)
- Modify: `scripts/lyric-vj/beta/server.mts` (`command` for `concept`)

**Interfaces:**
- Produces: `concept.sh <song dir> <run dir>` — reads `<run>/inputs.json` (written by the server: `{ concept, style?, refs: string[], note?, previous? }`), snapshots `song.json` into the run (as make.sh does), then:
  1. `##PHASE 導演規劃段落與故事` → `direct.mts --song <run>/song.json --start 0 --end <dur> --out <run>/base --style-id emotional --tier still --history out/design-history.json` plus `--style <file>` (Task 3 accepts a file path for the person's text), `--refs <run>/refs` when refs exist, `--language <id>` when chosen, `--candidates <ids>` (from the server env `VJ_CANDIDATES`, may be empty), `--previous <run of the adjusted concept>/base/treatment.json` and the note inside the style file for an adjustment. Same awk sub-phases as make.sh; cost key `direct`.
  2. `##PHASE 編排文字動態` → `typeplan.mts` into `<run>/noimg` exactly as make.sh's `plan "$w/noimg"`; cost key `plan-noimg`.
  3. `##PHASE 準備示意畫面` → three still times from `concept-summary.mts --times <run>` (the middle of the first sung line of the shots at 20 %, 50 % and 80 % of the song, via `stillAt` from `scripts/lyric-vj/preview.mts`), then `render.mts --song … --treatment <run>/noimg/treatment.json --assets <run>/noimg/assets.json --stills <t1,t2,t3> --out <run>/stills`.
  4. `##PHASE 整理概念` → `concept-summary.mts --write <run>` writes `<run>/concept.json`.
  5. `##PHASE 等你確認概念` and exit 0.
- Produces: `concept-summary.mts` exports `summarize(run: string): ConceptSummary` and `stillTimes(run: string): number[]`, where `ConceptSummary = { language: string; languageName: string; font: string; palette: string[] /* up to 5 unique hex from design.colorScript shadow/highlight/accent in order */; concept: string /* treatment.concept */; briefReading?: string; concerns?: string; candidateReason?: string; stills: string[] /* file names under stills/ */ }`.
- Produces: server `command` for `concept`: `bash scripts/lyric-vj/beta/concept.sh <songDir> <runPath>`; `make` jobs with `conceptOf` keep `make.sh <songDir> <tier> <runPath>` (the run already has `base/` and `noimg/`, so make.sh skips them).

- [ ] **Step 1: Write failing tests** for `summarize` and `stillTimes` on a fixture run folder (a small `base/treatment.json` with design.language `silkscreen`, colorScript of 3 entries, concept text, briefReading/concerns fields; `noimg/treatment.json` with shots; `song.json` with cues; a `stills/` folder with three pngs).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** both files; `bash -n concept.sh`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): concept pipeline — director, layout, three stills, summary`

### Task 3: The director reads the person's wishes and reference images

**Files:**
- Modify: `scripts/lyric-vj/direct.mts`
- Create: `scripts/lyric-vj/brief.mts` (+ `brief.test.mts`) — pure helpers used by direct.mts

**Interfaces:**
- Produces: direct.mts options: `--style <text or @file>` (an `@path` reads the file), `--refs <dir>` (every jpg/png/webp in it, at most 5, sent as base64 image blocks in the first user message, before the text), `--candidates <comma ids>` (languages added to the allowed list when `--language` is not given), `--previous <treatment.json>` (the concept being adjusted: its concept text, language and font are quoted to the director as 「上一版」).
- Produces: in the director's output schema, three optional string fields on the treatment: `briefReading` (「你寫的『…』我理解成：…」, required in the instructions when the person wrote text or gave refs), `concerns` (required when `--language` is given and the director judges it a poor fit for this song; empty otherwise), `candidateReason` (required when the chosen language is in `--candidates`). They are copied into `base/treatment.json` unchanged.
- Produces in `brief.mts`: `briefText(o: { style?: string; note?: string; previous?: { concept: string; language: string; font: string }; candidates: string[]; chosen?: string; hasRefs: boolean }): string` — the Chinese instruction block appended to 【這首歌的說明】, with exactly these rules: translate any named artist/studio/work into concrete visual traits and never draw names, characters or logos; write briefReading; when `chosen` is set, use it and write concerns if it does not suit; when picking a candidate, write candidateReason; for an adjustment, keep what the person did not ask to change. `loadRefs(dir: string): { media_type: string; data: string }[]` — max 5, sorted by name, skips non-images.
- Behaviour without the new flags is unchanged (the prompt text equals today's when no flag is given).

- [ ] **Step 1: Write failing tests** — `briefText` contains each rule only when its condition holds and returns `''` with no inputs; `loadRefs` caps at 5, sorts, skips a `.txt`; a test asserting direct.mts's built user prompt is byte-identical to before when no new flag is given (extract the builder if needed; do not call the API).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS (also the existing lyric-vj tests: `npx tsx --test scripts/lyric-vj/*.test.mts`).
- [ ] **Step 5: Commit** `✨ feat(lyric-vj): the director reads the person's wishes, references and style pick`

### Task 4: Server routes — refs, concept, decisions, stills, styles

**Files:**
- Modify: `scripts/lyric-vj/beta/server.mts`, `scripts/lyric-vj/beta/store.mts` (`Db.styles`)
- Test: `scripts/lyric-vj/beta/server.test.mts`

**Interfaces:**
- Produces: `Db.styles?: Record<string, { tier: 'proven' | 'candidate' | 'unlisted' }>`; `styleTier(db, id)` defaults to `proven` when `LANGUAGES[id].proven`, else `unlisted`.
- Produces routes (owner = song owner; admin may read):
  - `PUT /beta/songs/:id/refs` (raw image body, content-type image/jpeg|png|webp, magic bytes checked, ≤ 10 MB, ≤ 5 per song) → 201 `{ name }` (server-chosen `ref-<n>.<ext>`); `GET /beta/songs/:id/refs` → names; `GET /beta/songs/:id/refs/:name` (owner/admin, name `^ref-\d+\.(jpg|png|webp)$`); `DELETE /beta/songs/:id/refs/:name` (owner).
  - `POST /beta/songs/:id/make` body `{ tier, concept?, style?, refs?: string[] }` now enqueues a **concept** job (price `PRICE.concept`), writes `<run>/inputs.json`, copies the chosen refs into `<run>/refs/`; validates `concept` ≤ 500 chars, `style` is `proven`/`candidate` or absent, refs exist. Event `job.queued` gains `inputs`.
  - `POST /beta/jobs/:id/accept` body `{ confirmConcerns?: boolean }` (owner; concept job `done`, no `decision`) → `decision='accepted'`, a `make` job with `conceptOf`, same `runDir`, tier price; 409 when `concerns` exist and `confirmConcerns !== true`.
  - `POST /beta/jobs/:id/adjust` body `{ note }` (1–500 chars) and `POST /beta/jobs/:id/redo` → `decision` set, new concept job (new run folder) with `inputs.from`, `inputs.note` (adjust), inputs copied; attempt limit applies.
  - `GET /beta/jobs/:id/stills/:name` (owner/admin; name from the job's concept.json).
  - `GET /beta/styles` (logged-in) → `[{ id, name, suits, image }]` for proven+candidate (no tier field); `GET /beta/styles/:id/image` serves `scripts/lyric-vj/references/kits/<id>.jpg` or `samples/<id>.jpg` (plus, later, admin-picked images).
  - `GET /beta/admin/styles` → all languages with tier; `PUT /beta/admin/styles/:id` `{ tier }`.
- Produces: `publicJob` for a done concept job adds `concept: ConceptSummary` (read once, cached by job id) and `decision`; `inputs` shown to owner/admin.
- Produces: queue env `VJ_CANDIDATES` = comma list of candidate ids at job start (server passes it in `command`).

- [ ] **Step 1: Write failing tests** — every route above incl. refs boundary cases (Review Focus 2), accept charges the tier price once and reuses runDir, accept with concerns needs the tick, adjust/redo attempt limit, stills only for the owner/admin, styles list hides tiers and unlisted ids, a failed concept job auto-retries (Plan 2 behaviour) and its retry carries the same inputs/runDir.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `✨ feat(beta): concept routes, reference images and the style catalog`

### Task 5: 製作新版本 form — concept text, reference images, style picker

**Files:**
- Modify: `src/app/pages/beta/song.page.ts/.html/.scss`, `src/app/pages/beta/beta.ts` (types: `BetaStyle`, `ConceptSummary`, `JOB_STEPS.concept`)
- Test: `src/app/pages/beta/beta.spec.ts`

**Interfaces:**
- Produces: `JOB_STEPS.concept = [導演三步 (as make), step('正在編排歌詞文字動態', 4, '編排文字動態'), step('正在準備示意畫面', 2, '準備示意畫面'), step('正在整理概念', 0.5, '整理概念')]`.
- Produces in 製作新版本 (owner only): tier cards now show 「概念 $2.5＋製作 ${PRICE[tier]}」 under the total; below them:
  - 「想要的感覺（選填）」 textarea, 500 chars, placeholder 「例如：宮崎駿那種溫暖的手繪感、九〇年代日本動畫、深夜城市」.
  - 「參考圖（選填，最多 5 張）」 — thumbnails of this song's refs with ×, an add button (file input accept="image/jpeg,image/png,image/webp"), upload via PUT; selected refs are all refs of the song.
  - 「風格」 — a grid of style cards: first 「交給導演」 (「導演依這首歌挑最適合的」), then each `/beta/styles` entry with its image (the kit strip shown as a cropped banner), name, suits; one selected.
  - Button 「產生概念・$2.5」 → confirm dialog 「先產生概念」 with body 「導演會依你的選擇提出風格、配色和三張示意畫面，你確認後才會開始製作完整影片（{tier}，再 ${rest}）。」.
- [ ] **Step 1: Write failing tests** for a pure `makeBody(form)` helper (trims, omits empty concept, omits style for 交給導演) and the steps entry.
- [ ] **Step 2–4:** RED → implement → GREEN; temp-folder `ng build` clean.
- [ ] **Step 5: Commit** `✨ feat(beta): say what you want — feeling, references and style before making`

### Task 6: Concept card and decisions

**Files:**
- Modify: `src/app/pages/beta/beta.ts` (`songView`, `songChip`), `song.page.ts/.html/.scss`
- Test: `src/app/pages/beta/beta.spec.ts`

**Interfaces:**
- Produces: `SongView.concept?: BetaJob` — the latest concept job of the song that is `done` with no `decision`, while no make job for it exists; `songChip` → 「概念待確認」 (warn) when `concept` is set and nothing is active.
- Produces: a 概念 card (in place of 進行中 when `concept` is set):
  - title 「{tier name}的概念」, attempt 「第 {n} 次（最多 3 次）」;
  - three stills (click to enlarge in the existing overlay), language name, font, palette swatches, concept text, 「你寫的感覺，導演這樣理解」 + briefReading (when present), candidateReason is not shown to the person;
  - `concerns` as a warn box at the top with the tick 「我了解，仍要用這個風格」;
  - buttons: 「接受，開始製作・${rest}」 (disabled until the tick when concerns exist) → confirm dialog with rest price; 「依意見調整・$2.5」 opens a textarea (1–500) then confirm; 「換一個方向・$2.5」 → confirm; both hidden after 3 attempts with 「已試過 3 次，請聯絡管理者」.
- Produces: songView tests for: concept pending, concept accepted → make active, adjusted → new concept active, concept failed → auto-retry → active, legacy song with only make jobs unchanged, 3 attempts used.
- [ ] **Step 1–4:** tests RED → implement → GREEN; temp-folder `ng build` clean.
- [ ] **Step 5: Commit** `✨ feat(beta): concept card — accept, adjust or try another direction`

### Task 7: Admin — style tiers, concept inputs, Plan 2 overflow

**Files:**
- Modify: `src/app/pages/beta/beta-admin.page.*` (styles table), `admin-song.page.*` (per job: inputs, concept summary, decision; refs thumbnails), `admin-song.page.scss` (the 18 px overflow at 390 px)
- Test: `src/app/pages/beta/beta.spec.ts` (any pure helper), screenshots by the controller

**Interfaces:**
- Produces: admin page 「風格」 table: image, name, suits, tier select (已驗證 / 候選 / 未上架) → `PUT /beta/admin/styles/:id`; counts of concepts accepted / adjusted / redone per language from `/beta/admin/jobs` (the acceptance statistics the spec uses for promotion).
- Produces: admin song page shows each concept job's inputs (concept text, style or 交給導演, refs thumbnails, note), summary (language, briefReading, concerns, candidateReason) and decision; timeline titles for `job.queued` with kind concept 「排隊（概念）」.
- Produces: no horizontal overflow on the admin song page at 390 px.
- [ ] **Step 1–4:** helper test RED → implement → GREEN; temp-folder `ng build` clean.
- [ ] **Step 5: Commit** `✨ feat(beta): admin style tiers and concept details`

### Task 8: Screenshots, deploy, one real concept (controller)

- [ ] **Step 1:** Mock screenshots (1440/390): 製作新版本 with style grid and refs, concept card with and without concerns, admin styles table, admin song page (no overflow).
- [ ] **Step 2:** No job running/queued; back up `db.json`; build to scratch; rsync; restart the server; `/my` 200.
- [ ] **Step 3:** Ask the user before spending: one real concept run on a song they choose (≈ $2.5 platform cost, ~13 min) to check the director's briefReading/concerns and the stills; report the result.
