# Beta v2 — Plan 3b: Platform Redesign ("Signal") with the Concept Gate Front End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every beta page is rebuilt to the approved Claude Design handoff (direction 1b "Signal"), and the front end of the concept gate (Plan 3 Tasks 5–7) and the fix/redo actions (Plan 4) are built inside the new design; then Plans 3 and 4 ship together.

**Architecture:** Same Angular app and routes (`pageFor` in `src/app/pages/beta/route.ts`). A shared shell component (sidebar on desktop, bottom tabs + 56 px top bar on phones) wraps every beta page; design tokens move to `src/styles.scss`; small shared pieces (`<app-price>`, status chip, confirm dialog, progress block) live in `src/app/pages/beta/ui/`. Page logic (polling, `songView`, `jobProgress`, API calls) is reused; templates and styles are replaced.

**Tech Stack:** Angular 22 standalone + signals (zoneless), SCSS, vitest (`ng test`), Playwright (screenshots), Google Fonts (Unbounded, Noto Sans TC, JetBrains Mono, fallback Manrope).

**Design source (read first, every task):** `/Users/seitumbp2025/Downloads/design_handoff_vjflow_redesign/README.md` (exact sizes, tokens, copy, behaviour) and `VJFlow 重新設計.dc.html` (open in a browser or Playwright; artboards are numbered 1b, 2a–2e, 3a–3e, 4a, 4b; 1a is rejected). The README is high-fidelity: colours, type sizes, spacing and copy are final.

**Spec:** `docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md`; backend from Plans 1–4 (all merged on this branch).

## User decisions (2026-10-28) that override the design
1. After a failure for good (auto-retry also failed), the person CAN still make a new version. In 3b drop 「期間這首歌暫時不能再製作」 and the paused make row; keep 「這次的 $X 已退回你的餘額。管理者已收到通知，會查原因後幫你重跑或聯絡你。」 and show the make section normally.
2. Fix (修正) and redo (重做) are both enabled in the report form (not 「即將開放」). Fix is offered only when the backend allows it (img tier + all marks 圖片不搭 → remove pictures; any tier + all marks 時間不準 → re-apply timing after re-timing); otherwise the fix card is disabled with one line saying why. Redo stores the report and takes the person to 製作新版本 with that tier selected (a new concept, at the normal price). 只回報 says only 「只回報 · 免費」 — no 「讓導演學起來」.
3. The sidebar 風格 tab and the balance pill's 儲值 stay, and show 「即將推出」 when used (no page/flow behind them yet).

## Global Constraints
- Pixel-faithful to the handoff README and artboards at 1440 and 390 wide; no horizontal scroll at 390; mobile tables become 「標籤：值」 stacks.
- Tokens exactly as the README's Design Tokens block; coral `#ff6a4d` only on paying buttons, progress, current selection and 「下一步」 links.
- Every paying action: button text includes the amount → shared confirm dialog (2b) → request. Prices come from the backend's fixed prices (concept 2.5, rest none 1.5 / img 3.5 / hybrid 13.5, prep 0.5, fix 1); totals $4 / $6 / $16. Through `<app-price>` only (tokens later).
- Users never see platform cost; admin pages show it.
- Status vocabulary and icons exactly as the README (◐ ◷ ✓ ● ↻ ! ?).
- Things the handoff lists as not designed (4b): build the simplest version consistent with the tokens and mark it in the report: style full-page browse (hidden while ≤ 6 styles), still lightbox (full-screen overlay with the image), phone add-song form (full page), 「沒問題」 branch (as the README says), admin 歌曲 tab (reuse the 3d entry list), login landing (unchanged), insufficient balance (button disabled + 「餘額不足，請聯絡管理者」), empty states (dashed box + one line).
- Style category chips (全部/手繪/平面/攝影/3D) and the horizontal scroller appear only when more than 6 styles are offered (today 5 + 交給導演).
- Never `ng build` into `dist/` (temp output path only), never stop/signal the live server on 127.0.0.1:4320, never touch `out/beta`, never run pipelines.
- User copy Traditional Chinese (Taiwan) as in the handoff; code/comments/commits English; Gitmoji + Conventional Commits; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Style budget: component styles over 16 kB fail the build — split per component.
- Tests: `npx ng test --watch=false`; backend `npx tsx --test scripts/lyric-vj/beta/*.test.mts` when touched.

## Review Focus
1. Every song state renders the right sections in the right order (preparing, timing, ready, making, auto-retrying, failed for good with/without results, concept pending, concept with concerns, 3rd attempt, several results incl. fixes) → songView/chip tests + controller screenshots per task.
2. Paying actions always show the confirm dialog with the right amount and remaining balance, and buttons are disabled with a reason when the balance is short or a job is active.
3. Phone 390: no horizontal scroll on any page; sticky paying buttons don't cover content.
4. Fix offered only in the backend-allowed cases; redo leads to a concept at the normal price.
5. Admin-only data (platform cost, margin, other users) never reaches tester pages.

---

### Task 1: Shell, tokens, shared UI
**Files:** `src/index.html` (fonts), `src/styles.scss` (tokens), create `src/app/pages/beta/ui/shell.component.*`, `price.component.ts`, `status-chip.component.ts`, `confirm-dialog.component.*`; `src/app/app.ts` (wrap beta pages); tests for pure helpers.
**Interfaces:** `<app-beta-shell [me] [active]>` with `<ng-content>`; sidebar 88 px (歌曲 / 風格 / 管理-admin-only, avatar bottom), phone bottom tabs (歌曲 / 風格 / 我) + 56 px top bar (back, title, balance pill); balance pill = remaining + 4 px bar + 「儲值」 (opens a small 「即將推出」 note); 風格 tab → 「即將推出」 page. `<app-price [amount] [unit]>` (tabular nums). `<app-status-chip [chip]>` (icon + label + tone per README). `<app-confirm [ask]>` = 2b dialog (Esc/backdrop closes, focus trap, amount rows, 「確認，扣 $X」).
- [ ] Tests for helpers (chip mapping incl. 概念待確認, price formatting) → RED → implement → GREEN → temp build → commit `💄 feat(beta): Signal shell, tokens and shared pieces`

### Task 2: 我的歌曲 list (1b-1, 2e)
**Files:** `beta.page.*` (list page).
**Interfaces:** add-song card (`260px 1fr 1fr`: drop zone, inputs + language segmented + 「上傳並準備 · $0.50」 + note, lyrics); filter chips 全部 / 要你處理 · N / 進行中 · N / 有成品 · N (counts from `songView`); 5-column song cards (square cover: first letter Unbounded 72 on a per-song stripe tint; status chip top-left; 4 px progress for preparing/making; title, subtitle, 「下一步 →」 copy per state: 看概念 / 約剩 N 分 / 聯絡管理者 / 確認時間 / 製作新版本). Phone: 64 px list rows; add-song as an entry row opening a full-page form.
- [ ] Tests for `nextStep(view)` and filter counts → implement → screenshots → commit `💄 feat(beta): song list in the Signal design`

### Task 3: Song page — hero, progress, results, failure (1b-2, 3a, 3b, 2e)
**Files:** `song.page.*`.
**Interfaces:** order Hero → 進行中 (or 概念卡, Task 5) → 成品 → 製作新版本 (Task 4); hero tint per state (making default, preparing blue, failed red); progress card `1fr 1.4fr` (72 px percent, step, ETA, 8-step two-column list with done/now/number badges and per-step durations from `steps`); retry hero chip 「↻ 自動重試中 · 第一次製作遇到系統問題，不另外收費」; result cards `480px 1fr` (16:9 video, tier, style chip, price top-right, 完成於 / 花費時間 / 回報 N 次, 「下載 1080p」 white + 「回報這個作品」; fixes labelled 「依回報修正」); 3a preparing card (blue, prep steps, note) and the make row collapsed as in 3a; 3b failure card with user decision 1 copy; empty results dashed box.
- [ ] Tests for any new pure helpers (hero tone, result labels) → implement → screenshots of 1b-2, 3a, 3b states → commit `💄 feat(beta): song page in the Signal design`

### Task 4: 製作新版本 — tiers, feeling, references, style (1b-2 lower part, 2b)
**Files:** `song.page.*`, new `make-form.component.*`.
**Interfaces:** three tier cards (radio, name, total `<app-price>`, description, Mono 「概念 2.5 + 製作 X · 約 N 分」); 「想要的感覺（選填）」 500 with counter; 參考圖 (n/5) thumbnails from `GET /beta/songs/:id/refs`, × deletes (`DELETE`), + uploads (`PUT`, accept jpeg/png/webp, client checks ≤ 10 MB) — hidden + when 5; style grid from `GET /beta/styles` (first card 交給導演, then each style: 3-image collage from `/beta/styles/:id/image`, name, suits; single select; chips/scroller only when > 6); bottom bar 「產生概念 · $2.5」 (+ disabled reasons: job active 「目前有工作在進行，完成後才能再製作。」, balance short), note 「接受概念後再扣製作費 $X，中途不會另外收費。」, right 「這次費用 / 扣除後剩餘」; confirm dialog copy from the README (2b); POST `/beta/songs/:id/make` `{ tier, concept?, style?, refs }`; server errors shown inline (incl. 「這個版本有一個概念還沒決定」, 3-attempt text). Phone: tier rows, horizontal style cards 140×150, sticky button.
- [ ] Tests for `makeBody(form)` and disabled-reason logic → implement → screenshots → commit `✨ feat(beta): make a new version — tier, feeling, references and style`

### Task 5: Concept card and decisions (2a)
**Files:** `song.page.*`, new `concept-card.component.*`; `beta.ts` (`ConceptSummary` type incl. `interludes`, `songView.concept`, chip 「? 概念待確認」).
**Interfaces:** header 「{tier}的概念」 + 「第 n 次 · 最多 3 次」 + 「概念費 $2.5 已扣 · 接受後再扣製作 $X」; concerns box with checkbox; `1fr 400px`: three stills (`/beta/jobs/:id/stills/:name`, ⤢ → lightbox), info row (風格 / 字型 / 5 swatches), 故事概念, 「你寫的感覺，導演這樣理解」 (briefReading), 間奏處理 line from `interludes` (pictures entries with reasons; else 「間奏只做背景變換」); right column sticky: 接受 (`POST /beta/jobs/:id/accept {confirmConcerns}`; 409 「歌詞時間已修改，請重做概念」 shown inline), 依意見調整 (textarea 1–500, `POST …/adjust {note}`), 換一個方向 (`POST …/redo`); all through the confirm dialog; after 3 attempts only 接受 + 「已試過 3 次，請聯絡管理者」.
- [ ] songView/chip tests for concept states → implement → screenshots (with/without concerns, 3rd attempt) → commit `✨ feat(beta): the concept card — accept, adjust or another direction`

### Task 6: Report form with fix and redo (2d)
**Files:** `report-form.component.*`, `song.page.*`, `beta.ts` (fix kind helpers mirroring the backend), backend `scripts/lyric-vj/beta/feedback.mts` + `server.mts` (accept `action: 'redo'`: store the report, enqueue nothing), tests both sides.
**Interfaces:** `grid 1fr 440px`: video + 4 px timeline with numbered 20 px marker badges (seek), current time, 「● 標記目前時間 m:ss」 (keeps playing); right: ① 沒問題/有問題 segmented, ② marks (badge, time, range or 單點, 設為結束, ×, 7 category chips single-select, note), ③ suggestion + three action cards — 修正 (enabled only when `fixKindFor(marks)` and tier allow; price $1; one-line reason otherwise; for timing: link 「先到歌詞時間改好」 and the backend's 409 texts shown inline), 重做 (after submit: scroll to 製作新版本 with the tier selected and the suggestion prefilled into 想要的感覺), 只回報 · 免費 (default); 送出回報 (fix goes through the confirm dialog with $1). 沒問題 hides ② and the action cards. Phone: video + mark button sticky top, submit sticky bottom.
- [ ] Tests for the action availability helper (mirrors `fixKindFor` and tier rules) and the backend redo acceptance → implement → screenshots → commit `✨ feat(beta): report with fix and redo in the Signal design`

### Task 7: 歌詞時間校正 redesign (2c, 2e)
**Files:** `src/app/pages/timing/timing.page.*` (template/styles; logic kept).
**Interfaces:** top bar (← song, 「歌詞時間」, three count chips, 「更多 ▾」 menu with LRC/SRT and all shortcuts, 「儲存草稿」 = existing save without confirm, primary 「確認時間軸，可以製作了」 disabled with must-fix lines); left 480 px player card (140 px waveform canvas reuse, play button, big time, speed 0.5/1/1.5, toggle chips 跟著播放 / 後面一起移 / 循環這一句), shortcut hints, singers row, 「還有 N 句建議確認」 + 「下一個待確認 · N」; right table `40px 1fr 110px 110px 150px` with the selected row's toolbar (− value + 設為現在 for start and end, ▶ 聽這句, ✂ 拆句, ⤵ 併入下句, ＋ 插入, 刪除) and the suggestion row (「系統聽到的結束時間是 X，和歌詞排版差 N 秒」 + 改成 X / 保留現在的); inline text edit. Phone: sticky compact player, rows with Mono times, selected row 2×2 controls. Keep every existing keyboard shortcut and behaviour (push-not-pull edges, fixed-width time readout).
- [ ] Keep existing timing tests green; add tests for any new pure helper → implement → screenshots → commit `💄 feat(timing): lyric timing in the Signal design`

### Task 8: Admin — overview, song log, styles (3c, 3d, 3e)
**Files:** `beta-admin.page.*`, `admin-song.page.*`, new `admin-styles` section; backend only if a field is missing (e.g. a `resolved`/need-help count derived on the client).
**Interfaces:** 3c tabs 總覽/歌曲/工作/風格; 5 KPIs (全站已用 / 平台成本（毛利） / 測試者 / 進行中工作 / 需要協助); invite and global-limit single-row forms; accounts table and job queue (Mono right-aligned numbers, platform cost yellow); 3d header numbers (使用者已付 / 平台成本 / 毛利), job cards expandable (`1fr 260px` steps + cost rows), timeline (green/red/yellow), logs, reports; 3e style table (`150px 150px 1fr 150px 70px 70px 70px 110px`: collage, name, suits, tier select ✓ 已驗證 / ? 候選 / — 未上架 via `PUT /beta/admin/styles/:id`, accept/adjust/redo counts, acceptance mini bar). Phone: 3d number cards + segmented 工作/時間線/Log/回報; fixes Plan 2's 18 px overflow.
- [ ] Tests for KPI/acceptance helpers → implement → screenshots → commit `💄 feat(beta): admin pages in the Signal design`

### Task 9: Compare, deploy Plans 3 + 4, one real concept (controller)
- [ ] Screenshot every page/state at 1440 and 390 next to the matching artboards; list differences; fix rounds through the task owners.
- [ ] No job running/queued; back up `db.json`; build to scratch; rsync; restart the server; `/my` 200.
- [ ] Ask the user, then produce one real concept on a song they choose through the platform (≈ $2.5) and report what the card shows.
