# VJFlow beta 前端稽核（Fable）— 2026-10-29

範圍：`src/app/pages/beta/**`（含 `ui/`）、`src/app/pages/timing/**`、`src/app/app.*`、`src/styles.scss`、`src/index.html`、`angular.json`、`proxy.conf.json`，對照 `scripts/lyric-vj/beta/server.mts`（路由、body、狀態碼、錯誤文字）與 `store.mts` / `feedback.mts`。
方法：逐檔讀 `git diff f90c189~1 HEAD`；以 playwright（`scratchpad/audit/shot390.mjs`、`view390.mjs`、`tools390.mjs`）對 `127.0.0.1:4200` 的 ng serve 以 mock `/beta/**` 跑 390×844（`isMobile`+`hasTouch`）與 1440×900；截圖在 `scratchpad/audit/shots/`。唯讀，未碰 4320、未讀 out/beta。
未執行 `ng test`（純函式 spec 以閱讀為主，見文末）。

---

## A. Codex 前端發現逐項驗證

| # | 判定 | 說明 |
|---|---|---|
| 9（client） | **CONFIRMED** | `make.ts:28-31` `conceptAttempts`：`failedForGood` 只看一層 `retryOf`。鏈 A(failed) → B(auto retry of A, failed) → C(admin retry of B, done)：A 的 retries=[B] 全失敗→不計；B、C 有 `retryOf`→排除；結果 0。`concept.ts:15-24` 的「第 n 次」與 `makeBlock` 的三次上限都吃這個值，和 server `store.mts:82` 同病。**最小修正**：以 `retryOf` 遞迴找根：`const chainOk = (j) => j.status !== 'failed' \|\| jobs.filter(r => r.retryOf === j.id).some(chainOk)`，計 `!j.retryOf && chainOk(j)`（server 同改）。 |
| 10 | **CONFIRMED** | `beta.ts:177` `concept` 只取最新一個未決概念；server `server.mts:244` 的「還沒決定」檢查是**每 tier** 各一，所以 none 與 img 可同時待決。`song.page.html:89` 只渲染一張卡；`make.ts:34 pendingConcept` 讓 make-form 預設跳到最新的 tier，切到另一個待決 tier 只會顯示「這個版本有一個概念還沒決定」而沒有入口（截圖 `song-s5-phone-*.png`：兩個待決只見「插圖版的概念」）。`timingSaveWarning` 也只提一個。**最小修正**：`songView` 回傳 `concepts: BetaJob[]`（全部待決，新到舊），`song.page.html` `@for` 每個一張 `app-concept-card`；`timingSaveWarning` 列出所有待決 tier。 |
| 11 | **CONFIRMED** | `report-form.component.html:115` `<a [href]="timingUrl()">` 是整頁導覽（app 無 router，`app.ts:17`），草稿只在元件 signal（`report-form.component.ts:104-107`）；且 `timing.page.ts:578` 確認後 `location.assign` 回歌曲頁，整頁重載，`opened`/`reporting` 也歸零。**最小修正**：該連結加 `target="_blank"`（草稿留在原分頁；回來後只需重新送出），或離開前把 `{verdict, marks, suggestion, action}` 以 `report:<jobId>` 存 sessionStorage、建構時還原、送出成功後清除。 |
| 12 | **CONFIRMED** | `song.page.html:77` `(click)="contacted.set(true)"` 不發任何請求；`:79` 顯示「管理者已收到通知」。後端無任何通知路由或事件（grep `contact|notify|help` 於 server.mts 無）；管理者只有打開 `/my/admin` 輪詢時才看得到 KPI。另外 `:69/:71` 的內文本身就已宣稱「管理者已收到通知」。**最小修正**：拿掉假按鈕，改文案為「管理者會在管理頁看到這筆失敗」；若要保留按鈕，加 `POST /beta/jobs/:id/help` 寫 `help.requested` 事件並在 `needHelp` 顯示。 |
| 13 | **CONFIRMED（Minor）** | `admin.ts:44-52` `needHelp` 只收 `prepFailed`/`help`；`status: 'admin'` 的 job 在 `songView` 進 `results`（`beta.ts:176`），`songKind` 回 `ready`。KPI「需要協助 0 · 沒有卡住的歌」同時佇列表有「放行」鈕（截圖 `admin-jobs-phone-2.png`）。**最小修正**：`needHelp` 加 `jobs.some(j => j.songId===s.id && j.status==='admin')` → `why: '等你放行'`。 |
| 14 | **CONFIRMED** | `admin.ts:27` `pct = spentUsd / globalLimitUsd`，server `store.mts:143` 以 `platformSpent` 比 `globalLimitUsd`。mock 下顯示「全站已用 $12.60 · 12.6%」而平台成本 $31.20（31.2%）。**最小修正**：`pct` 與「總額度」子行改用 `t.platformSpentUsd`，搬到「平台成本」卡；「全站已用」只當營收。 |
| 15 | **CONFIRMED** | `admin-song.page.ts:113-114` 無進行中 job 即 return；`load()` 只跑一次（`:46`）。輪詢中也只更新 jobs/events（`:116-118`），`feedback`/`logs` 永不更新：使用者送回報、job 結束後出現的新 log 檔都看不到，必須重新整理。**最小修正**：`refresh()` 不要提前 return（三個 GET 很便宜），並在 jobs 集合或任一 job 的 `status/endedAt` 變動時重讀 `feedback` 與 `logs`。 |

判定統計：7/7 CONFIRMED（#13 維持 Minor）。沒有 FALSE / PARTLY。

---

## B. Codex 漏掉的（前端半邊）

### Important

**B1. 音檔上傳失敗會留下孤兒歌曲：無法重新上傳、沒有大小／類型預檢**
- `beta.page.ts:105-127`，server `server.mts:300-315, 365-373`。
- 情境：`POST /beta/songs` 已建歌（201），接著 `PUT /audio` 失敗——(a) 檔案 > 80 MB：server `saveBody` `req.destroy()`（`:112`），瀏覽器得到 `TypeError: Failed to fetch`，toast 顯示「上傳失敗：Failed to fetch」，沒提到大小；(b) `.ogg`/`.aiff` 等 → 415；(c) 行動網路中斷。歌曲已存在但沒有 prep job → 列表卡片「準備中 · 看進度」、歌曲頁永遠「等待上傳音檔」（截圖 `song-s4-phone.png`）。使用者再送一次就產生第二首同名歌；server 其實允許對同一首再 PUT（`:368` 只擋非失敗的 prep），但前端沒有入口，也沒有刪除路由。
- 修正：`confirmAdd()` 先檢 `file.size > 80_000_000` 與 `AUDIO` 類型表（用 server 的字串「音檔太大（上限 80 MB）」「請上傳 mp3、wav、flac、m4a 或 aac」）；`add()` 的 audio 失敗分支保留 `song.id`，歌曲頁 `stage==='preparing' && !v.prep` 時顯示「重新上傳音檔」檔案鈕直接 PUT 同一首。
- 信心：confirmed（code + 截圖）。

**B2. 手機版歌詞時間編輯器沒有「儲存草稿」，也沒有離頁保護**
- `timing.page.html:82` `class="button desk"`；`timing.page.scss:787` 720px 以下 `.desk{display:none}`；`timing.page.ts` 沒有 `beforeunload`。
- 情境：手機上改了二十句，仍有「必須修正」的紅句（`:83` 確認鈕 disabled）→ 完全無法存；切 app、按返回、或 shell 底部分頁一點，全部遺失。桌機至少有草稿鈕。
- 修正：把「儲存草稿」放進手機的 `更多` 選單（`:52` `.menu-row`）；`dirty()` 時加 `beforeunload` 擋（list 頁 `beta.page.ts:79` 已有同樣寫法可抄）。
- 信心：confirmed（code + 截圖 `timing-phone-0.png` 僅見「確認時間軸」）。

### Minor

**B3. 管理者歌曲頁（手機）切到 時間線／Log／回報 時，工作清單仍整個顯示在上面**
- `admin-song.page.scss:106` `.sec.jobs{display:flex}`（0,2,0）勝過 `:487` 媒體查詢裡的 `.sec{display:none}`（0,1,0）；只有 `.side .sec` 被藏。截圖 `v-admin-song-timeline.png`、`admin-song-時間線-phone-1.png`：選「時間線」仍先看到 8 張 job 卡，時間線在最下面。
- 修正：媒體查詢內改成 `.grid .sec, .grid .sec.jobs { display: none }` 再由 `:host([data-section=…])` 打開。
- 信心：confirmed。

**B4. 輪詢錯誤的 toast 永不清除**
- `beta.page.ts:146-148`、`beta-admin.page.ts:164-166`、`admin-song.page.ts:119-121`：失敗寫 `message`，成功不清。tunnel 一次 502/逾時 → 「HTTP 502」或「Failed to fetch」掛在頁首直到下次動作，與下方正常更新的資料矛盾。
- 修正：輪詢成功時若 `message` 是輪詢寫的就清掉（另設 `pollError` signal 分開顯示）。
- 信心：confirmed。

**B5. 編輯器 `open()` 不檢查 `r.ok`：準備中／不存在的歌卡在「讀取歌曲…」**
- `timing.page.ts:199-201`：`(await fetch(...)).json()` 後直接 `song.cues.map`；server 對未完成的歌回 409 `{error:'歌曲還在準備中'}`（`:380`）、無權回 404。可由瀏覽器返回鍵、書籤、或管理者早開測試者歌曲到達。畫面只剩「讀取歌曲…」，沒有錯誤文字。
- 修正：`if (!r.ok) return this.loading.set(null), this.message.set(body.error)`。
- 信心：confirmed。

**B6. 編輯器 `save()` 對非 JSON 回應會靜默失敗**
- `timing.page.ts:571` `await r.json()` 無 catch；proxy/tunnel 502 HTML → SyntaxError 未處理，無「儲存失敗」訊息、`dirty` 不變，使用者以為沒按到。同型問題 `beta.page.ts:111`（`made.json()`）。
- 修正：`r.json().catch(() => ({ error: \`HTTP ${r.status}\` }))`（其他元件已這樣寫，如 `make-form.component.ts:192`）。
- 信心：confirmed。

**B7. 管理者額度欄位清空即送 0**
- `beta-admin.page.html:60` `(change)="setLimit(u, lim.value)"`、`.ts:91` `Number('')===0`；server `:513` 接受 0。誤刪數字→該測試者立即「額度不足」。
- 修正：`value===''||!Number.isFinite(n)` 就還原欄位不送；或送出前 confirm。
- 信心：confirmed。

**B8. 歌曲頁 hero 文案把條件句寫成事實**
- `song.page.html:20`：只要有待決概念就顯示「（改了時間，待確認的概念要重新產生）」，即使時間沒改。桌機截圖 `song-s1-desk.png` 可見。
- 修正：「（若再改時間，待確認的概念要重新產生）」。
- 信心：confirmed。

**B9. 下載影片沒有檔名**
- `song.page.html:115` `<a … download>` 無值；URL 末段是 `video` → 存成 `video`（Safari 不補副檔名）。多首歌下載互相覆蓋。
- 修正：`[attr.download]="s.title + '-' + t.name + '.mp4'"`。
- 信心：confirmed。

**B10. 製作進度與「約 N 分」估計把概念已做完的步驟算進去**
- `beta.ts:56-58` `JOB_STEPS.none/img/hybrid` 以 `DIRECT`(9 分)+`TEXT`(4 分) 開頭；但 `make.sh:28,38` 在 `base/treatment.json`、`noimg/treatment.json` 已存在（概念 run 已產）時瞬間跳過。接受對話框「約 25/30/45 分鐘」（`concept-card.component.ts:103`）與 hero 的「約剩 N 分」因此高估約 13 分；`concept.sh:58` 的 `等你確認概念`、`make.sh:71` 的 `完成` 不在任何 step 內，`jobProgress` 會短暫退回第 1 步。只影響顯示，不影響金額。
- 修正：make job 的 steps 去掉 DIRECT/TEXT（或以 `job.steps` 實際出現的 phase 決定 index，缺的視為已跳過）。
- 信心：confirmed（估計值），實際秒數未量。

### 觀察（非缺陷，列供判斷）
- 管理者的 `/my`「我的歌曲」列出所有測試者的歌（server `/beta/songs`、`/beta/jobs` 對 admin 回全部），「要你處理」計數含別人的歌；`mine()` 有正確藏起操作。若非刻意，列表應以 `s.userId===me.id` 過濾。
- 390 px 實測：list／list-compose／我 sheet／song（準備中、失敗、概念待決、三個成品、回報表單展開、步驟展開、示意圖放大）／timing（更多選單、選中列工具、確認對話框）／admin 四分頁／admin-song 四段／styles，皆 `scrollWidth-innerWidth = 0`，無元素超出視窗（示意圖與風格卡是刻意的橫向捲軸）。make-form 底部 sticky 列與 timing 頂部 sticky 播放器在真實視窗下正常（`v-make-*.png`、`v-timing-*.png`）；手機點列會開工具（`tools390.mjs` 三種點法皆 `tools:true`）。
- 小於 28 px 高的可點元素：`儲值`（24）、`看全部 N 個步驟`（17）、`全部 15 個 →`（17）、參考圖 `×`（20）——不到 44 px 的觸控目標，但都有替代路徑，列為提醒。

---

## Checked and fine
- 路由／body 對照：`POST /make`（tier、concept≤500 chars、style、refs）、`accept/adjust/redo`（`confirmConcerns`、`note`）、`PUT refs`（type、10 MB、5 張）、`POST feedback`（marks/action/suggestion 與 `parseFeedback` 同序同字）、`PUT cues`（`cues/confirm/accepted/singers`）、admin `users/limit/retry/approve/styles`——前端送的鍵名、限制與錯誤字串都和 server 一致；`makeBlock`／`acceptBlock`／`fixBlock` 的餘額檢查以分計算，對應 `refuse` 的 `TIER_TOTAL`／`PRICE[tier]`／`PRICE.fix`。
- 所有付費動作都經 `app-confirm`；`submitting`／`acting` 防重送；403/401 都有中文訊息；502 非 JSON 在 make-form／concept-card／report-form 有 catch（timing、list 例外，見 B6）。
- `songView`、`songKind`、`nextStep`、`inFilter` 與 server 狀態語意一致；`jobTotal` 把接受的概念費加進成品價（$16 而非 $13.5）正確；失敗卡退款金額＝該 job `priceUsd`，與 `charged()` 一致。
- `applyTimingEdit` 草稿儲存不會清掉 `timingConfirmedAt`（`timing-qa.ts:130`），所以桌機「儲存草稿」不會把歌退回「待確認時間」。
- 無 `innerHTML`；`[style.background]` 接 LLM 產出的色碼經 Angular 消毒；圖片 URL 皆同源 `/beta/...`。
- `proxy.conf.json` 新增 `/beta`→4320 正確；`angular.json` 只放寬 component style budget；`index.html` 僅加 Google Fonts preconnect。
- spec：`beta/concept/make/song/report-form/admin/ui/timing-edit/timing-view` 皆為純函式測試，呼叫真實程式碼（非 mock），每檔 26–132 個 `expect`；未見空斷言。未執行 `ng test`。
