# 免費版進度紀錄

逐階段更新，工作階段中斷時從這裡接續。不 commit、不 push、不部署，除非使用者明確要求。

## 順序（使用者 2026-11-01 確認）

1. 七項整首修正：完成。五首整首閱讀時間全過，樣片在 `~/Desktop/vj/output/逐句編排樣片_2026-10-31/整首驗證/`。
2. 付費導演升級：完成，等使用者看對照片判斷。`scripts/lyric-vj/linedirect.mts`，手動開啟，現有付費流程未變；API 共 $1.691。
3. 免費版與文字動態版 A/B 並排：片子已做好，`~/Desktop/vj/output/付費導演對照_2026-11-01/`（含 `說明.md`）。判斷前不開放免費版。
4. 一鍵換版（seed）
5. 逐句即時生成
6. 瀏覽器即時預覽
7. WebCodecs 匯出
8. 5～10 種風格（由語言抽出輕量版）
9. 網站免費入口（只到本機）

## 手法狀態

67/72 完成（B71 只過單元測試）。未完成：B21、B37、B61、B62、B70。導演升級後三首定稿：B40 一句、B45 兩句，B43、B44、B46、B49、B50、B56、B60 仍是 0 句。

## 驗證標準

改編排器後要跑五首整首：nun、snow、tsuzuki、choroin、tenmon，看逐句中點圖，並和 `out/research/lineplan/review/paid/base-48-56` 比付費路徑。

## 付費導演（2026-11-01）

- 用法與設計：規格 §6.6。測試：`npx tsx scripts/lyric-vj/linedirect.test.mts`。
- 回覆存在 `out/research/linedirect/<id>/direction.json`，重建不花錢；費用帳在 `out/research/linedirect/costs.jsonl`。チョロイン重跑一次，第一版留在 `direction.v1.json`。
- 三首整首在 `out/research/linedirect/<id>/full2/`。チョロイン與世界のつづき閱讀全過；雙截棍 c002 少 0.13 秒（1.87／2.00，改用規則版後一樣）。rendererErrors 全空，無字級退回。
- 重建時要帶 `--metrics out/research/linedirect/<id>/full/metrics.json`，雙截棍 c002 才會維持規則版。
- 下一步：等使用者判斷。若要接進 `make.sh`，要先定開關與費用。

## 即時生成（2026-11-01，步驟 4–9）

產物放 `out/research/instant/`。規則核心搬到 `src/app/lyric-vj/lineplan-core.ts`，`scripts/lyric-vj/lineplan-core.mts` 改成轉出。

- 步驟 0 完成：`docs/research/2026-11-01-technique-audit.md`、`out/research/lineplan/finish9/usage.md`。
- 意外：第一次跑五首時 shell 參數錯，沒複製到 meaning.json，呼叫了一次 Haiku，花費 $0.0008。之後的腳本都帶 `--no-reading` 且先複製快取。
- 步驟 4（seed）完成：`composePlan(..., { reroll })`，不帶 reroll 時五首計畫與 review 版逐欄相同。`freeJob`（`src/app/lyric-vj/free-plan.ts`）與 `typeplan.mts --plan` 的 treatment 五首完全相同（`scripts/lyric-vj/free-plan.check.mts`）。五首各 5 個 seed 用真引擎量過（`scripts/lyric-vj/seedcheck.mts`，報告 `out/research/instant/seed/report.json`）：閱讀失敗 0、字級低於 52 px 0、斷在詞中 0。雙截棍 seed 3 整首在 `out/research/instant/seed/full-nun-3/`，逐句圖 `sheet-1.jpg`。
  - 我的決定：reroll 的配色只在各歌配色池內輪替；安靜的歌不抽 lacquer、sugar。「第二把 key」程式與文件都查不到，推論是第二組配色與第二份 seed，用非預設 seed 的整首逐句圖驗。
- 步驟 5（逐句即時生成）完成：`job.live`（只對編排器計畫生效），句子在時間前 2 秒才建，過後放掉；`grains`、`blurred` 上限 240，`glyph` 快取上限 900，引擎有 `dispose()`。雙截棍 54 句：就緒 2.4 秒 → 0.55 秒；チョロイン 3.6 → 0.6 秒；世界のつづき 1.35 → 0.4 秒。離線 eager 對 review：PSNR 43.2、metrics 相同。同一份程式重畫一次的雜訊底是 42.5 dB；live 對 eager 最差片段 42.1 dB，與雜訊同級，metrics 逐欄相同。修過兩個真差異：量字框時圖層還在搖晃，以及已播放的句子被拿去量交接。付費 `--clip 48,56`：46.1 dB，cues、readable、fixes、rendererErrors 相同。
- 步驟 6（瀏覽器預覽）完成：`src/app/lyric-vj/render/live.ts`。Chrome、M4 Pro 整首 60 fps，CPU 限速 4× 仍 58 fps。關鍵是預覽不再每幀 `getImageData`，每刀最多讀三次，畫布才留在 GPU；否則 21 fps。**CPU 限速不會降 GPU，這個數字不能代表手機。**
- 步驟 7（WebCodecs 匯出）完成：`src/app/lyric-vj/render/export.ts`，新增依賴 `mp4-muxer` 5.2.2（MIT，無執行期依賴）。`node_modules` 是連到別的 worktree 的連結，所以用 `--package-lock-only` 改 lock，再手動解壓到 `node_modules/mp4-muxer`，沒有跑 npm install。H.264 + AAC，整首 3.6–4.1 倍速，與離線同段 42.8 dB。AAC 編碼器有 44 ms 前導，已補償，量到延遲 0 ms。浮水印（規格 §4.5）還沒做。
- 步驟 8（風格）完成：`src/app/lyric-vj/free-styles.ts` 六種（絲網海報、冬夜網版、孔版印刷、網點檔案、諜報片頭、圖形卡），全出自 5 種已驗證語言，沒有用待驗證或擱置語言。每種跑五首 × 4 個版本共 120 次：閱讀失敗 0、字級低於 52 px 0。詞界檢查標出 6 次，都是 チョロイン c048「お願い／だから」，是真的詞邊界，只是不在編排器的停靠清單裡。逐句圖在 `out/research/instant/styles/sheets/`。
  - 我的決定：冬夜網版是絲網的冷色版；配色另存 `STYLE_PALETTES`，不動導演用的 `PALETTES`。
- 步驟 9（本機入口）完成：`/free`，只在 `isDevMode()` 時有；資料來自唯讀 `scripts/lyric-vj/free-local.mts`；`proxy.conf.json` 加 `/free-data`。貼歌詞、換版、換風格、沒有 WebCodecs 的提示都實測過。沒有音檔時用頁面自己的時鐘。
- 手機：沒有實機資料。純軟體 WebGL（無 GPU）約 9 fps（自動降到 50%），是最差情況，不代表手機。
- Codex 獨立審查 NOT DONE：workspace 沒有額度（`Your workspace is out of credits`），重試也一樣。改成自己照審查項目看過一輪，修了：seek 回去時交接重複疊加、匯出取消沒關 encoder、物件網址沒回收、同時間戳歌詞、忙碌時還能換風格。
- 最後檢查：tsc 通過，lineplan、linedirect 測試通過，`ng test` 952 通過（原 932），付費 `--clip 48,56` 45.8 dB，cues、readable、fixes、rendererErrors 相同。樣片在 `~/Desktop/vj/output/免費版即時生成_2026-11-01/`。

## A/B 判斷（2026-11-01）

使用者看完：免費版和新導演版差不多。依 §6.4 第 3 點，**關卡未通過，免費版不開放**。下一步待使用者決定方向。

## 免費版範圍（2026-11-01）

使用者指出 JIZURA 是整首，決定免費版維持整首，不做精華限制。差距改由 720p、浮水印、固定風格，以及付費專屬時刻、全曲弧線、逐字對拍拉開。下一步：雙截棍 20 秒手工專屬時刻測試。

## 方案方向更新（2026-11-01）

見規格 §6.7：免費版取代文字版；插圖版、故事版都接新文字動態，再加插圖與專屬時刻。待辦：專屬時刻重做（進行中）、對齊成本實測、慢歌驗專屬時刻、新文字動態接進插圖版與故事版。

## 46 種風格（2026-11-01）

見規格 §6.8。等 JIZURA 實際對照回來後，先定義一種風格要有哪些元素，再分批做，每批出樣片讓使用者看。

## 專屬時刻（2026-11-01）

使用者看完保留背景的版本：很好，沒問題。專屬時刻方向通過，測試程式仍是一次性 spike。

## JIZURA 實際對照（2026-11-01）

結果：還沒追上。13 類 較好 0、差不多 2、較弱 11，只有閱讀贏。見 `docs/research/2026-11-01-jizura-comparison.md`。下一步：StyleWorld 架構、提高版面與切換密度、第 1 批 8 種。預設：46 種全留；dark-glitch 改為自有恐怖世界（使用者尚未確認，可逆）。

使用者確認（2026-11-01）：46 種全留、dark-glitch 改為自有恐怖世界，把沒做的補上，目標追上 JIZURA。第 1 批之後依序做第 2～6 批，並補完 B21、B37、B61、B62、B70 與部分完成的 B03、B13、B30、B71。

## StyleWorld 與第 1 批（2026-11-01）

- 步驟 1 結構完成：`src/app/lyric-vj/style-world.ts`（20 欄位、`poolOf`、`worldHoles`）、`style-worlds.ts`（14 種）。`PlanForce.world` 是關閉的池：配方、背景、轉場、鏡頭都只從世界裡抽，重抽不會跑出去；沒有帶 world 的路徑逐字元不變。零件只吃語意色槽（`render/world-objects.ts` 的 `Slots`），原始碼有色值就過不了第一級。
- 缺口原因：材質改為每世界一組 `frameStack`（`design.world.frame`，引擎 `renderAt`、`uScan`）；繁中字每世界自訂；`language` 以 `design.world.language` 保留。**我的決定：** 沒有把 `design.language` 直接打開，因為引擎那條路會帶進殘影、文字墨色與字級上限，都是這份規格排除或世界自己管的；抽格改由 `frameStack.koma` 接手。
- 新零件：一個版型渲染器 `render/world-layout.ts` 吃 `world-sets.ts` 的數字；動作 `world-motion.ts`；字的材質 `world-glyph.ts`；承載物件 `world-objects.ts`；背景與轉場 `world-grounds.ts`。全部沒開 `out/research/jizura-source/`，由材質物理過程推導。
- 步驟 2 密度：`pace.every`、一句中換版（`repose`，換在拍點上、不動閱讀預算）、亮暗交替的背景序列；世界切換上限每秒兩次（光敏）。
- 我的決定：世界的進退場不進 `LINE_ENTERS`，改放 `cue.world`，所以付費導演清單完全不變；模板 `world-set`、`world-pair` 只在 `design.world` 存在時才通過驗證，`templates.ts` 與 typehelp `TEMPLATES` 未動。
- 步驟 3：8 種世界完成（dark-glitch、neon-stage、terminal、led-board、ink-wash、silent-film、stained-glass、gothic-lolita）。原 6 種進新結構，每種 3 個專屬版型與自有動作，轉場仍共用，要等第 6 批。
- 步驟 4：`scripts/lyric-vj/style-gate.mts`（第 1、2 級）、`scripts/lyric-vj/style-gate-visual.mts`（第 3 級）。
- 磁碟：工作中可用空間從 3.4 GB 掉到約 0.5 GB，**不是這份工作的輸出**（`out/research/styles` 共 371 MB），已照規定停止影片輸出。原因沒有足夠資料。

結果（2026-11-01 收尾）：
- 關卡校準值：第 1 級跨家族 ≥6 軸、同家族 ≥4 軸；第 2 級沿用標準提案（同句版型、進場 ≤0.20，退場 ≤0.30，停留 ≤0.35，TVD ≥0.60，背景 Jaccard ≤0.25，風格／種子比 ≥2.0），14 種 91 對全過，實測最差 0.15、0.15、0.196、0.189、0.85、0.85、0.20、4.66。第 3 級墨重疊 ≤0.20：跨風格最高 0.167，同風格重抽 0.224–0.51，閾值放在兩者之間；換色最近鄰 0.098。
- 閱讀：14 種 × 5 首 × 3 版共 210 次，閱讀失敗 0、低於 52 px 0、斷詞 0。修過：片語字級 47 px（版型下限改 70）、計畫移進世界鏡頭的句子沒有 world 時頁面崩潰（`orPlain`）。
- 測試：tsc、lineplan、linedirect、`ng test` 967 通過。
- 密度與判定見 `~/Desktop/vj/output/風格第1批_2026-11-01/說明.md`。結論：風格拉開已追上（快 0.077、慢 0.088），切換與動量沒有追上。
- NOT DONE：25 秒片、整首輸出、付費 `--clip` 影片比對（磁碟不足，只做到 48 句逐欄相同）、led-board、慢歌密度、原 6 種升級。

第二輪（2026-11-01）：付費 `--clip 48,56` 45.8 dB、四項全同。修了換版型後字色錯（總覽空白幀）；字級與物件放大（`fill`）；彩繪玻璃、默片、水墨非暗色；雜訊降到不靠閃爍；每行移動與背景慢滑；原 6 種有自己的背景與轉場。第 3 級門檻由 0.20 放寬到 0.25：字變大後跨風格最高 0.211，同風格重抽最低 0.161，兩者已經重疊，這一級目前分不開風格與重抽。數字與判定見 `~/Desktop/vj/output/風格第1批_2026-11-01/說明.md`。NOT DONE：dark-glitch、led-board 切換，慢歌切換。

## 第 1 批使用者回饋（2026-11-01）

默片普通、水墨不自然、終端機怪（應沿用 stage2 的綠色 terminal 與 Mac 介面）；全部變化太少、不驚艷。第三輪：沿用既有成果、每種世界 3–5 個大型場面。第 2 批等第三輪看過再開工。

第三輪（2026-11-02）：終端機改走 ui 層；27 個大型場面（`render/world-pieces.ts`）；水墨 `render/world-ink.ts`（擴散場、乾筆、留白 `reservePaper`）；默片光圈／燒片／跳片／手繪字卡；同風格跨歌關卡 `scripts/lyric-vj/style-song-gate.mts`（版面 ≤0.75、開場 ≤0.34、背景 ≤0.60、配色 ≥3），背景序列相似度沒有改善（0.50）。驗證：1029 測試、閱讀 210 次、關卡 1–3 全過。弱點：dark-glitch 與 gothic-lolita 切換低、慢歌偏靜。GSAP 未用；`origins` 未跑。詳見 `~/Desktop/vj/output/風格第1批_2026-11-01/說明.md`。

## 免費版歌詞時間（2026-11-01，規格 §6.9）

`/free` 改成訪客路徑：預設分頁「我的歌」，選音檔、貼歌詞或匯入 `.lrc`，打拍，生成，匯出。沒有伺服器工作。檢查腳本：`scripts/lyric-vj/free-tap-check.mts`（真頁面）、`free-tap-reading.mts`（閱讀）、`beat-check.mts`（拍點）。

- 歌詞（`free-lyrics.ts`）：純文字、LRC 或混合。沒有時間的行依長度放在前後句之間。錯的時間戳會指出第幾行。同一時刻的兩行（原文＋譯文）留第一行，算在略過。歌詞框是時間的唯一一份，打拍後寫回框內，所以之後改字不會掉時間，也能下載 LRC。
- 打拍（`free-tap.ts`、`pages/free/tap-panel.ts`）：空白鍵或大按鈕（用 `pointerdown`），Backspace 復原，每句都能「從這句打」，之前的時間保留，之後的舊時間要到新拍越過時才清掉。反應時間 0.12 秒與時間軸頁共用 `TAP_REACTION`，行為沒變；另外扣掉事件在佇列等待的時間。可 0.75／0.5 倍速。
- 我的決定：復原後音檔倒回被取消那一拍之前 3 秒。太早或太晚按都能重打，代價是多聽幾秒。
- 拍點（`beat-detect.ts`、`beat.worker.ts`）：對數頻帶 spectral flux、自相關（1、2、4 倍週期加總，偏向 120 BPM）、Ellis 動態規劃。五分鐘的歌約 0.3 秒，在 worker 跑。全新寫的，只共用 repo 自己的 `Fft` 與 `beatStrengths`，沒開 `out/research/jizura-source/`。
- 限制：音檔 10 秒～15 分鐘、300 MB。超過音檔長度的句子略過並說明。太快的打拍撐開到 0.15 秒間距，不丟句子。
- 公開歌詞庫（`lyric-lookup.ts`、`pages/free/lyric-search.ts`）：有做，手動查，先看全文才能用。

### 驗證

- tsc 通過；`ng test` 1029 通過（原 967）。
- 真頁面（Chrome headless，`mix.mp3`，世界のつづき）：28 句按鍵打完，含復原、長按只算一拍、從第 8 句重打；與目標時間最大差 7 ms。整首匯出 181 秒（1.6 倍速，另一個工作同時在跑），H.264 + AAC，影像 295.0 秒、聲音 295.04 秒，ffprobe 與 mean_volume −25.3 dB 確認有聲音。全程沒有非 GET 請求。手機 390×844：大按鈕 120 px、無橫向捲動，觸控打拍與復原可用。**手機是模擬視窗，不是實機。**
- 閱讀（真引擎）：世界のつづき 28 句、チョロイン 75 句 0 失敗；雙截棍 1 句 c038 1.77／1.83，同一首用原時間的對照組也有 1 句 c002 1.77／2.00。每秒一句的過快版本 0 失敗。對照組也少 5 句重複副歌，這是編排器原本的行為。
- 拍點：見下表。**存的拍點不是標準答案**，來自 `analyzeAudio`，所以另外用 librosa 當第二個參考（同家族演算法，也不是標準答案）。

| 歌 | 偵測 BPM | 存的 BPM，F(±70 ms) | librosa BPM，F |
|---|---|---|---|
| 世界のつづき | 151.0 | 128.7，0.32 | 152.0，0.91 |
| 雙截棍 | 100.9 | 101.4，0.99 | 99.4，0.98 |
| 我愛台妹 | 107.2 | 107.5，0.95 | 107.7，0.94 |

17 首：對存的拍點，速度差 4% 內 8 首、F 中位數 0.37；對 librosa，15 首、F 中位數 0.85。點擊音軌單元測試誤差 20 ms 內。174 BPM 的點擊音軌會算成 87，拍子仍在點上。

### 意外發現：存的拍點常常是錯的

17 首有 9 首存的速度與偵測差超過 4%，其中 6 首是 3:4（例如存 128.7，偵測 97）。看過自相關的兩首（ぷろふぃ〜る、チョロイン），峰在 97／194，128 附近沒有峰或很弱。推論：`analyzeAudio` 的搜尋上限 180 BPM，194 BPM 的歌被算成 2/3。librosa 在這 6 首中有 5 首站在偵測這邊。影響付費路徑的 `song.json`，這次沒有動。沒有人工標記，要定案需要標幾首。

### 未完成與弱點

- LRCLIB 授權：程式庫 MIT 只涵蓋伺服器程式；文件沒有寫歌詞資料的授權、商用或署名條款，也沒有禁止。對外開放前要向專案確認，歌詞本身的著作權也要處理。CORS 沒問題。
- LRCLIB 實測：`/api/search` 測試時持續回 500（curl 也一樣），`/api/get` 正常。瀏覽器用同樣的標頭打 `/api/get` 成功。搜尋結果到歌詞框只用假回應驗過（含惡意內容，未被執行）。第一次測試顯示的是「連不上」而不是 500，原因沒有足夠資料。
- `Lrclib-Client` 只有名稱與版本；文件要求附網站或聯絡方式，開放前要補。
- 拍點只假設 4/4，小節起點是猜的，沒有驗證。3/4 歌會錯。慢歌與無鼓的歌只有少量樣本。
- 免費版仍沒有 `sections` 與 `energy`：`freeJob` 用 `fallbackParts`，`mood` 偏低。
- 打拍沒有吸附到拍點；重新整理會失去進度，只有離開提示與下載 LRC。非 UTF-8 的 `.lrc`（Big5、Shift-JIS）只會報錯，不會轉碼。
- 空白鍵在 Safari、實體手機都沒測。

## 夜間順序（2026-11-02，使用者授權不用等看過）

1. 第三輪回報後驗收，更新 artifact https://claude.ai/artifact/2Qa3JfttsDFEzZMGPJeeFH。
2. 查 `analyzeAudio` 180 BPM 上限與付費 `song.json` 影響，只出報告，不改付費結果。
3. 第 2 批 8 種，沿用第三輪做法（既有成果、大型場面、同風格跨歌差異）。
4. 把已核可的專屬時刻做成導演能力（開關後面，API 總額 $5 內）。
5. 新文字動態接插圖版，用既有素材做對照。

不 commit、不部署、不重啟 4320；要使用者判斷的事記下來，不停工。

## 第 2 批風格（2026-11-02，進行中）

目標：ukiyoe、papercut、paper-lantern、chiyogami、woodcut、chalkboard、aizome、crayon。程式：`src/app/lyric-vj/style-worlds-hand.ts`（資料）、`render/world-b2-*.ts`（每世界一檔）、`render/world-craft.ts`（共用）、`render/world-glyph-hand.ts`（字面）、`render/world-packs.ts`（登記）。看圖工具：`scripts/lyric-vj/world-stills.mts`（全尺寸靜幀，`--pieces` 把每個場面強制放到有唱的句子上）。工作檔在 `out/research/styles2/`。8 種都已接上。其他修正：`wall-word` 只顯示正在唱的那句（`layer.world.lines`）；彩繪玻璃碎裂時字所在的那格留著；dark-glitch、gothic-lolita 加淺色切換（`tape-wall`、`leaf-wall`）；同文極短 cue 併回前一句（`withoutEchoes`，c049）；世界句子用 `CueLayer.poses` 回報真實位置；帶 Call 的句子在世界裡不併句、不換版。終端機：不再重新點陣化（`phosphor`），行距 1.36、字距 0.08，桌面視窗放不下時離開（`leaves`），場面視窗只放在不碰字的格子。frame 的 `tooth` 會露出物件平面的對角接縫，第 2 批三個世界改為 0。檢查工具鏈在 scratchpad 的 `redo.sh`，結果在 `out/research/styles2/run/`；樣片在 `~/Desktop/vj/output/風格第2批_2026-11-02/`。

第二輪（使用者：woodcut 快、papercut／aizome 慢都不改；四個紙類世界都留）：閘門 3 的 9 項修到 0，做法是讓每個世界有自己的版面位置，不靠改色。ukiyoe 的字放在天空與兩側直排，山與海收成中段一條帶子，前景用 `lowMist` 遮成白紙；paper-lantern 的字放在中間的窗，紙層退到下三分之一；chiyogami 的花紋改成一張斜放的卡（`cardAt`），不再滿版，紙帶全部斜放，出場慢拉到摺線再壓平；woodcut 的字放在版的下半部；crayon 每一級都用 `colour-over`（0.56 秒）換畫面。chalkboard 擦痕上的對角線原因是噪點 x、y 共用同一個亂數，已修。注意：閘門 3 的「墨」是指偏離畫面最常見色調的像素，主要受背景大面積影響，只移動字的位置效果有限；`ukiyoe/sky-title` 往上移會讓三句疊放時最上面那句出畫（snow c042–c044 讀不到），所以維持在 0.26。結果在 `out/research/styles2/run4/`。

## 第 1 批第三輪判斷（2026-11-02）

使用者：除了終端機文字擠在一起看不清楚，其他可以。方向通過，第 2 批沿用同一做法；終端機在第 2 批內修。

## 歌詞時間編輯器取代打拍（2026-11-02）

使用者試過打拍覺得難用，音檔估算差 4–6 秒不能當成品，要和付費版同一個編輯器。`/free` 的打拍面板已移除（`tap-panel.*`），`編輯歌詞時間` 開啟 `TimingPage` 本身：新增 `local` 輸入（`LocalTiming`）與 `done` 輸出，同一份程式，沒有複製。付費路徑只有 `ngOnInit` 的搬動；本機模式的分支都看 `local()`。

- 本機模式不呼叫伺服器：音檔是 blob URL，波形用 `analyse` 算好的 `peaksOf`，沒有人聲分離軌所以 `active` 是空的，不跑紅燈檢查。估算的句子帶 `review`（`free-timing.ts`），沿用黃色狀態、下一個待確認、只看需要確認的。
- 我的決定：本機模式預設「後面一起移」開、「跟著播放」關。估算差好幾秒時，跟著播放會把選取拉到錯的句子，Enter 就設錯句；一起移則讓後面的句子跟著第一刀靠近。大幅移動後用 `reflow` 排回順序、留在歌曲內，不丟句子。
- 手機：底部大按鈕（`pointerdown`），暫停時先播放，播放中等同 Enter；旁邊有復原。桌機一行提示 Enter。
- 時間順序：LRC 時間戳 → 背景查 LRCLIB（失敗重試一次）→ 估算，標「時間是估算的」，表單與匯出按鈕上方都有。查到的結果必須有一半以上句子與貼上的歌詞相同才提示（標題可能只是檔名），看過才能用。
- 歌詞框仍是時間的唯一一份。每次編輯都寫回框內並存 localStorage（`free-work:<size>:<name>`，含 seed、風格、每句來源）。頁面拿不回檔案，重新整理後要重選同一個音檔。`free-song.ts` 改成尊重句子自己的 `end`，否則長句會被截到 6 秒。
- LRCLIB：2026-11-02 `/api/search` 用 track_name 有回 200（curl），瀏覽器裡有幾次回 503 `ServerOverloaded`，另一次回 200 且頁面出現真實結果（Ado 世界のつづき，4:54），是間歇的。授權仍未確認，維持只在開發版（`/free` 本身 `isDevMode`，查詢也再判斷一次）。
- `free-tap.ts` 與 spec 留著：`free-tap-reading.mts` 還在用，頁面已不用。`free-tap-check.mts` 改寫成驅動編輯器流程。

## 免費流程接進歌曲頁（2026-11-02）

歌曲頁（`/my/song?id=`）的第一順位改成「做影片」：用這首歌確認過的歌詞、時間與音檔，選風格、馬上預覽、換一版、在瀏覽器匯出 720p。沒有伺服器算圖、不扣額度。

- 共用元件：`src/app/pages/free/instant-stage.*`（畫面、播放列、換一版、風格卡、匯出）。`/free` 只留表單，仍只在開發建置出現；`window.vjFree` 指向 stage 並掛上表單的 signal，檢查腳本不用改。
- 歌曲頁：`src/app/pages/beta/song-flow.component.*`、`song-flow.ts`。只用既有的兩個 GET：`/beta/songs/:id/timing`、`/beta/songs/:id/audio/mix`。**伺服器沒有改動。** 風格與版本存 localStorage（每首歌一筆）。
- 片尾：2026-11-02 移除署名（`end-credit.ts` 已刪），影片長度＝歌曲長度。匯出只在分頁裡，用下載連結存檔，沒有上傳端點。
- 付費方案、價格、請求都沒變；頁面上放在「付費版本」標題下，流程底下一顆「看付費方案」捲過去。文字動態版沒有刪除或改價，要不要拿掉由使用者決定。
- 我的決定：管理者看別人的歌完全不顯示流程，只有一行說明（預覽雖然沒有副作用，但這頁其他製作動作也是只有主人能用）。首次生成會從第一句前 1 秒開始播，否則前奏可能很長。歌曲沒有付費成品時，「版本 0 個」的空區塊不對主人顯示。片尾文字是我定的，要改在 `END_CREDIT_TEXT`。
- 列表頁下一步文字由「製作新版本」改成「做影片」，上傳確認與空列表步驟加入免費這一步。

弱點：
- 上傳歌曲的準備仍要 $0.5，所以「免費」只到影片，不含準備。§6.7 的方向若要整條免費，要另外決定準備費。
- 免費片是規則編排，沒有 `meaning`（那是付費 Haiku 呼叫），和 `/free` 貼歌詞一樣；歌曲本身的 `sections`、`energy` 有用到。
- 手機只測模擬視窗，沒有實機；手機瀏覽器能不能編 H.264、記憶體夠不夠，沒有足夠資料。
- 匯出整段放在記憶體，整首解碼音檔也一樣；分頁關掉就沒了，只有文字提醒。
- 字型仍走 Google Fonts（§6.7 未解決項）。風格 46 種未滿，§6.4 的 A/B 關卡當時未通過，開放與否由使用者決定。

驗證：tsc（app、spec）通過；`ng test` 1087 通過（原 1076）；伺服器 82、make-sh 10 通過；正式建置到 `out/research/song-flow/prod-build` 無預算錯誤（`dist` 沒動）。真頁面腳本 `scripts/lyric-vj/song-flow-check.mts`（Chrome headless、種子資料與假工作在 `out/research/song-flow/seed.mts`，埠 4421／4398，沒有碰 `out/beta`），結果 `out/research/song-flow/run2/report.json`，全過：生成、換版、換風格、匯出 ffprobe（H.264 + AAC，62 秒片 63.5 秒、整首 296.5 秒，片尾靜音 −91 dB）、全程只有 GET、額度不變、管理者唯讀、未確認、準備中、手機 390×844、零額度、付費工作進行中、時間編輯器鎖定。付費表單送出內容 `{tier:'img',refs:[]}`、扣 $2.5、假指令有被呼叫。`free-tap-check.mts --to 20 --mock-lookup` 也跑完，`/free` 的時間編輯路徑正常。

匯出速度：整首 295 秒在這次測試花 433 秒（0.68 倍速，開發建置、機器負載 11–16，另有工作在跑）。之前量到 1.6–4.1 倍速。安靜機器上的數字這次沒有重量。
