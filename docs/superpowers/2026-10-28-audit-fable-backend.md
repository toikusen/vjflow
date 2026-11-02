# VJFlow beta 後端稽核（Fable）— 2026-10-29

範圍：`scripts/lyric-vj/beta/**`、`scripts/lyric-vj/{brief,interludes,direct,typeplan,keyframes,cutout,render}.mts`、`beta/*.sh`、`src/app/lyric-vj/{structure,treatment}.ts`，range `f90c189~1..HEAD`。
方法：逐檔讀 diff／全文；可純函式重現的以 scratch 腳本重現（`scratchpad/audit/pure.mts`、`range.mts`）；未碰 out/beta、未呼叫付費 API、未動正式服務。
既有單元測試：`store/queue/fix-apply/feedback/concept-summary/events/brief` 82 通過。

路徑縮寫：`S=scripts/lyric-vj/beta/server.mts`、`Q=…/queue.mts`、`ST=…/store.mts`、`FA=…/fix-apply.mts`。

---

## A. Codex 後端發現逐項查證

| # | 判定 | 查證 | 最小修正 |
|---|---|---|---|
| 1 | **CONFIRMED** | `S:50-55`：`Range: bytes=1-0` → start=1,end=0；`writeHead(206)` 後 `createReadStream({start:1,end:0})` 同步丟 `ERR_OUT_OF_RANGE`，外層 catch `json(res,400)` 再丟 `ERR_HTTP_HEADERS_SENT`，async handler 的 rejection 無人接 → 程序結束。`range.mts` 以 `/beta/songs/s1/audio/mix` 重現，程序死亡（stack 在 `S:128`/`S:606`）。`bytes=500-`（start ≥ size）同路徑。 | `sendFile`：`if (!Number.isFinite(start) \|\| start > end \|\| start >= size) return res.writeHead(416, {'content-range': 'bytes */'+size}).end()`；串流加 `.on('error', () => res.destroy())`；外層 catch 改 `res.headersSent ? res.destroy() : json(...)`。 |
| 2 | **PARTLY** | 機制屬實：`Q:152-158` 在 `take` 內觸發保險絲，`Q:178-185` close(0) 不看 `fused` → `status=done`、`error` 清空、`charged=2.5`（`pure.mts` 重現：status done / fused true / error undefined / charged 2.5，事件序列 started,cost,fused,ended）。但 (a) 規格 §183-184 只要求「停止、通知、不多扣」：成品已完成而收固定價不違反規格；真正的缺陷是紀錄不一致（done+fused、錯誤文字消失、管理者收到「已停止」但其實沒停）。(b) 實務窗口：最後一行 `##COST` 之後即刻 exit 才會發生；`make.sh` 最後的成本是 horizon，之後還有長時間 render（會被殺→failed，正確）；`prep.sh:18-19` 的 proofread 成本後直接結束，是唯一真實窗口（proofread > $1 才觸發）。(c) 另一漏洞：`Q:176` 的 `read(rest)`（最後沒換行的那行）在 close 內讀取，不經過保險絲檢查。 | close()：`const status = fused && code === 0 ? 'admin' : code === 0 ? 'done' : code === 10 ? 'admin' : 'failed'`（成品留給管理者看、保留 `error`、收固定價）；`read(rest)` 後補跑同一段保險絲判斷。若採 Codex 的「fused 一律 failed、收 0」亦可，但使用者會失去已完成的成品。 |
| 3 | **CONFIRMED（且範圍更大）** | `FA:32-40` `cutSpans` 對每個 cut 都給 span，包括因 hold gap 沒落地的 cut；`pure.mts` 重現 Codex 案例：cuts 0/1/4 s、gap 4 → spans `a 0-4, b 1-10, '' 4-10`，標 4.5-5 s 得 `removed=1`。另見 B1：還有三種「從沒畫出來卻算移除」的來源。 | 見 B1：以建好的 `img/treatment.json` 圖層（有 `sprite` 的 kinetic layer 及其 section 時間）判定「有顯示」，只有命中這些 span 才算 removed。 |
| 4 | **CONFIRMED（既有）** | `render.mts:322` `mux(silent, …, vocal)` 直接寫正式檔名（ffmpeg `-y` 進最終檔）；`make.sh:63` 只用 glob 判斷續跑。更糟的是 SIGTERM（`stopBeta`／保險絲 `killGroup`）下 ffmpeg 會寫 trailer 正常結束 → 留下**可播放但被截短**的 mp4，續跑時 `cp` 成 `video.mp4` 並 `done` 收費。情境：保險絲殺掉 render → failed → 管理者重跑 → 直接交出截短影片。 | `make.sh:63` 改以 `[ -f "$tr/video/metrics.json" ]` 判斷（render.mts:344 只在 mux 成功後寫）；或 `mux` 寫 `${file}.tmp.mp4` 再 `renameSync`。 |
| 5 | **CONFIRMED** | `S:480-482` adjust 與 redo 都傳 `from`；`concept.sh:27,36` 有 `from` 就 `--previous`；`brief.mts:92` `if (o.previous)` 一律「這是調整…沒有要求改的（設計語言、字型、色調、故事）都保留」，`brief.mts:101` 設計階段亦「保留上一版字型」。前端 `concept-card.component.html:118` 承諾「導演重新提一個完全不同的概念」。 | 不用改 shell／server（adjust 的 `note` 已強制非空，`S:479`）。`brief.mts` 兩處改以 `o.note?.trim()` 分支：有 note → 現有調整規則；無 note → 「這是重做：上一版…。這次要換明顯不同的方向（設計語言／字型／色調至少換兩樣，概念不得重複上一版）」；`designBriefText` 同理不保留字型。 |
| 6 | **PARTLY** | 機制屬實：`S:381` 讀 timeline、`S:385-386` 查工作狀態都在 `await readJson`（`S:387`）之前；await 期間另一分頁 accept 可 enqueue make。但 (a) 小 body 幾乎總是與 header 同批到達，窗口是 microtask 等級；(b) make 用的是概念 run 內的 `song.json` 快照（`make.sh:14`），後果是「歌曲 song.json 與成品不一致」而非錯誤扣款。嚴重度 Minor。 | 把 `S:381` 的讀檔與 `S:385-386` 兩個檢查移到 `await readJson` 之後。 |
| 7 | **CONFIRMED** | `direct.mts:86` candidates 過濾掉常數 `PROVEN_LANGUAGES`；`:93` `allowedLanguages = [...PROVEN_LANGUAGES, ...candidates]`。後端只傳 `VJ_CANDIDATES`（tier==='candidate'，`S:204`）。下架（unlisted）的 proven 語言仍在自動可選集合；升為 proven 的非常數語言既不在 candidates 也不在常數 → 自動模式選不到（使用者手選則可，`S:447` 用 db 判斷）。 | `S:204` 另傳 `VJ_PROVEN=<styleTier===proven 的 id>`；`concept.sh` 轉成 `--proven`；`direct.mts` `const proven = a.proven ? parse(a.proven) : PROVEN_LANGUAGES`，`:86`/`:93` 改用 `proven`。 |
| 8 | **CONFIRMED（spec 明定）** | 規格 §97：「故事版沿用 keyframes 既有的 `--style`／`--style-ref`」。`make.sh:51` 兩者皆未傳；`keyframes.mts:191` 只在 `--style` 時設 `board.userStyle`；`cutout.mts:478-480` 無 `userStyle` 即用平面海報 LOOK（含 `no painterly texture`）。同條規格也要求 typeplan 收到概念文字與參考圖，`make.sh:32`/`concept.sh:43`、`props.mts:15` 完全沒有接點（img 方案亦未沿用使用者的要求）。成品偏差未付費驗證（推論）。 | `make.sh` hybrid：`b=$w/brief.txt`（concept run 已有）；`[ -s "$b" ] && kf+=(--style="$(cat "$b")")`；`r=$(ls "$w"/refs/* 2>/dev/null \| head -1); [ -n "$r" ] && kf+=(--style-ref "$r")`。typeplan／props 的接點需另立小計畫。 |
| 9 | **CONFIRMED** | `ST:82-84` 只看直接 `retryOf===root`；`pure.mts`：root failed → auto failed(retryOf root) → admin done(retryOf auto) 得 `conceptAttempts=0`。管理者可重跑 auto 那筆（`S:537` 只擋「已被重跑過」的那筆），所以鏈深 2 真會出現。影響：多一次 $2.5 概念（平台成本上限被繞過一次，使用者仍付費）。 | `const rootOf = (j) => j.retryOf ? rootOf(byId(j.retryOf)) : j`；以 root 分組，整組全 failed 才不計。前端 `make.ts:28` 同步。 |
| 14 | **FALSE（後端側）** | `S:498` 已同時回 `spentUsd` 與 `platformSpentUsd`；`ST:143` 的全站上限用 `platformSpent`。分子錯誤只在 `admin.ts:27`。 | 後端免改；可選：欄位改名 `usedUsd` 讓前端不易選錯。 |

---

## B. Codex 未提到的後端發現

### Important

**B1. 修圖收費但影片不變：`fix-apply` 還有三種「從沒畫出來」的圖被算進 removed** — `FA:62-69`、`FA:56-60`、`typeplan.mts:527,566-592`、`make.sh:32`、`fix.sh:42`
- (a) `parts.keep.items`：typeplan 只在 `--board` 時建板（`typeplan.mts:40 default false`、`:527`），`make.sh`／`fix.sh` 從未傳 `--board` → 這些 sprite 從沒出現在影片，`FA:62-69` 卻只要範圍落在該 part 內就全部清空並 `removed++`。重現：只有 keep.items、cut 無 sprite 的 plan，標 2-3 s → `removed=1`。
- (b) 背景段（interludes backdrop）的 cut：typeplan 建圖時 `stripUnsungSprites` 拿掉 sprite（`typeplan.mts:566`），但存檔的 `typeplan.json` 仍保留原 sprite；`applyPictureFix` 不讀 interludes → 標在間奏得 `removed=1`。重現：同一 cut 在 typeplan 得 `sprite=(none)`，fix 得 `removed=1`。
- (c) `DIAGRAM_FX` 的 cut（`typeplan.mts:581`）與 `sameSpot` 坐掉的 cut（`:584`）同樣沒畫出 sprite，fix 一律計入。
- 情境：使用者在這些時間標「圖片有問題」→ 伺服器通過、fix 重算、重 render 出一模一樣的影片，收 $1；`NOTHING_TO_REMOVE` 擋不到。
- 修正：`fix-apply` 讀 `$run/img/treatment.json`，取 `graphics.sections` 中帶 `sprite` 的 kinetic layer 與其 `start`/下一段 start 為「實際顯示 span」；`removed` 只計命中這些 span 的 sprite（plan 內多清幾個沒畫的無害）。補回歸：沒落地 cut、backdrop 段、keep.items 三例皆應 `removed=0`。
- 信心：confirmed（(a)(b) 已重現；(c) 讀碼）。

**B2. 歌名或歌手以 `-` 開頭時 prep 必失敗，且自動重試同樣失敗** — `prep.sh:14`、`S:618`、`song.mts:19`
- `--title "$title"`，title=`[artist, title].join(' - ')`；Node 22 `parseArgs` 對以 `-` 開頭的值丟 `ERR_PARSE_ARGS_INVALID_OPTION_VALUE: argument is ambiguous`（已實測）。例：歌手欄填 `-` 或歌名 `-ERROR`。prep 失敗 → auto retry 失敗 → 管理者重跑亦失敗；使用者雖可重新上傳（`S:368` 容許 failed），但同一歌名仍失敗，卡死。
- 修正：`prep.sh:14` 改 `--title="$title"`；日後給 keyframes 的 `--style` 亦用 `=` 形式。
- 信心：confirmed（parseArgs 行為實測；呼叫路徑讀碼）。

**B3. `sendFile` 的串流沒有 error handler：open/read 失敗會讓整個服務掛掉（與 #1 同等級）** — `S:55`、`S:58`
- `existsSync` 與 `createReadStream` 之間檔案消失（DELETE ref 與 GET 同時；影片資料夾被清理）、或讀取 I/O 錯誤 → ReadStream 非同步 emit `'error'`，無 listener → `uncaughtException` → 程序結束。靜態頁路徑已有防護（`S:277`），`sendFile` 沒有。
- 修正：`createReadStream(...).on('error', () => res.destroy()).pipe(res)`（兩處）。
- 信心：likely（Node 語意確定；觸發需競態或 I/O 錯誤）。

### Minor

**B4. 音檔上傳中斷時 `saveBody` 永不 settle，留下半個 `upload.<ext>` 與未關的 fd** — `S:108-116`
- 只監聽 `data`/`finish`/`error`；client 中斷時 `req` 只 emit `aborted`/`close`，`pipe` 不會 end 目的串流 → promise 懸置、fd 洩漏。無使用者可見後果（連線已斷），但累積洩漏。`readBody` 有處理 `close`，`saveBody` 沒有。
- 修正：`req.on('close', () => { if (!settled) { out.destroy(); rmSync(file, { force: true }); fail(new Error('上傳中斷')); } })`。
- 信心：likely。

**B5. prep 失敗後重新上傳，新音檔不會被用到** — `S:368-369`、`prep.sh:10`
- 伺服器容許 prep failed 後再 PUT audio，但 `prep.sh:10` `[ -f mix.mp3 ] ||` 沿用舊的（含 ffmpeg 失敗時留下的半截）`mix.mp3`；且 `ls upload.* | head -1` 取字母序最前者（舊 `upload.aac` 壓過新 `upload.mp3`）。使用者以為換了檔案，其實重跑同一份。
- 修正：PUT audio 收到新檔前先刪 `upload.*`、`mix.mp3`、`vocals*.wav`、`song.json`（或 prep.sh 在 upload 比 mix 新時重做轉檔，並取最新 mtime 的 upload）。
- 信心：likely（讀碼；未實跑 ffmpeg 半截情境）。

**B6. 等待孤兒程序期間再次崩潰，孤兒就再也殺不到** — `S:206-225`、`ST:158-161`
- 啟動時 `requeueRunning` 立刻把 `pid` 清掉並 persist（`S:208,211`），孤兒實際是否結束要等 `waitGone`（≤12 s）。此窗口內若伺服器再崩潰（或被 start.sh 重啟），下次啟動 db 裡已無 pid，孤兒管線繼續花錢並與重跑並行寫同一 run 資料夾。
- 修正：requeue 時保留 `pid`（或另存 `orphanPids`），`release()` 之後才清。
- 信心：likely。

**B7. `horizon --apply` 非原子覆寫 `$tr/treatment.json`，中斷後每次重試都失敗** — `horizon.mts:82-83`、`make.sh:31,60,63`
- 寫入中被殺 → 檔案半截；續跑時 `plan()` 看到檔案存在就跳過，render 解析失敗 → auto retry 與管理者重跑都失敗，需手動刪資料夾。
- 修正：`.tmp` + `renameSync`（如 `FA:145-148`）。
- 信心：likely。

**B8. 管理者數值欄位驗證過寬** — `S:502-503`、`S:513`、`S:526-527`
- `Number(null)`=0、`Number('')`=0、`Number(true)`=1 都通過 `>= 0`：PATCH 傳 `limitUsd: null`／空字串會把額度設成 0。`Number('Infinity')` 通過後 `JSON.stringify` 寫成 `null`，重啟後 `spent + need > null` 恆真 → 全站拒絕。
- 修正：`const v = b.limitUsd; if (typeof v === 'number' && Number.isFinite(v) && v >= 0)`。三處同。
- 信心：confirmed（讀碼；JS 語意）。

**B9. 概念次數上限的語意可能與規格差一** — `ST:79-85`、規格 §77
- 規格：「依意見調整」「換一個方向」每首每方案上限 3 次；程式把**第一次概念也算進** `MAX_CONCEPTS=3` → 實際只能調整／重做 2 次。brief 寫「max 3 attempts」語意模糊，請決定（推論，非確定缺陷）。
- 修正（若採規格）：`conceptAttempts` 只計 `inputs.from` 非空者，或 `MAX_CONCEPTS=4`。

**B10. `status: 'admin'` 的工作已向使用者計價，卻沒有退回／歸零的管理路徑** — `ST:126`、`S:551-559`
- `charged()` 對 `admin` 狀態收固定價；管理者只能 approve。若管理者判定成品不可交付，只能手改 db.json。
- 修正：加 `POST /beta/admin/jobs/:id/reject` → `status='failed'`、`error`、事件；或 approve 帶 `charge:false`。
- 信心：confirmed（流程缺口）。

---

## Checked and fine

- 路由權限／擁有權：songs、jobs、video、stills、refs（讀：owner+admin；寫：owner）、feedback（POST owner、GET owner+admin）、admin 前綴統一 403。
- 路徑：refs 名稱白名單 regex；stills 名必須在 `concept.json.stills` 內且無 `/`；logs 以 `resolve` + `startsWith(dir+sep)` + `.log`；jobs log 需屬同一歌。
- Shell：`shq` 單引號跳脫；所有腳本用 array 傳參、`set -euo pipefail`；`from` 在 server 與 concept.sh 雙重 regex；`fix.sh` 的 symlink 守門與 rsync 排除。
- 併發：`enqueue` 同步且在 await 後執行；accept 在 await 後重查 `decision`；同歌 queued/running 互斥；auto-retry 不重複（`retryOf`/`auto`/`noRetry`/`fused`）。
- 金額：固定價、failed 收 0、`platformSpent` 以 `max(cost, price)` 預留；重試不重報已跳過步驟的成本（cost_json 在 skip 分支內）；`##COST` key 去重。
- 保險絲在程序仍在跑時：killGroup → close(null) → failed、error 保留、無自動重試（正確）。
- `##NORETRY`／exit 3 路徑：failed、noRetry、`nothingToRemove` 對外、不自動重試。
- timing fix 確實有效：render 以 `song.json` 的 cue 時間排字（`render.mts:104` `cuesIn(song)`），非 treatment。
- fix 重跑 horizon 不再花錢（strip 檔已複製，`horizon.mts:54` 跳過）。
- 概念 run 快照（song.json、refs、inputs.json）與 make 共用同一 run；stills 以 `.tmp` → `mv` 原子落地；db 以 `.tmp` + rename。
- `unsungWindows` 重疊 cue 的 `maxEnd` 修正正確；`normaliseInterludes` 一段一筆、理由門檻、對齊；typeplan／keyframes／cutout 的 backdrop 規則接線一致。
- 既有測試皆有斷言（掃描 `test(` 區塊無零 assert 者）；82 個非伺服器測試通過。未跑 server.test.mts 全套（會啟動多個伺服器與子程序）與 Angular 測試。
