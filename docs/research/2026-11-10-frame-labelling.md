# 影格檢查的業主盲標：抽樣、片段、答題表、計分（2026-11-10）

**狀態：工具與抽樣已完成，片段尚未定稿，業主現在不要標記。** Codex 第二輪裁決（`docs/research/2026-11-10-phase4-codex-r2.md` §5，feat/lyric-editing a9a9027）要求業主標記改用 **新的 Q1／Q2 共同仲裁契約** 產出的片段；那份契約正在實作，今天量測的事件到時會變。所以這次只產出了流程驗證用的 6 個片段（5 個渲染、1 個裁切，加上 3 個隱藏重複的複本），完整 40／80／12 寫成可續跑的佇列（`out/research/labelling-1110/queue.json`）。契約落地後的順序見最後一節。

依據：`docs/research/2026-11-10-phase4-codex.md` §5（每一條都照做，下表逐條對應）。

## 協定（照 §5 實作）

| §5 要求 | 實作 |
|---|---|
| 舊 28 個 Claude 標記只當開發資料 | `label-samples.mts` 讀 `out/research/q1-1109/calib/index.json`，那 28 件的「世界＋歌＋句」整組關閉（池中 33 件因此排除），不進任何一池。 |
| 40 校準＋80 保留；同歌曲／事件的不同 seed、字型、版本同組，不跨池 | 組 = 世界｜歌｜事件的最後一句。同一組的所有事件、所有版本（4a／4b-r2／日文／尺度開）只取一個版本，整組只進一池（`draw()`，測試「one group one pool」）。只用 seed 0（量測的 headline seed）。 |
| 80 保留 = 40 依實際分布隨機＋40 刻意難例，其中 ≥ 20 個 `outline-only`；不足就全取且該分支不自動放行 | 先抽難例：`outline-only` 隨機取 20（可用 21 組，所以不觸發「不足」旗標；第 21 個也在難例的輪替裡被抽到），其餘依序輪流取：臨界上側、臨界下側、核准未畫、只換歌詞、只換底（墨色／紋理／版色）、微動、尺度關係、hold 等級；難例用完才以隨機補滿並標記 `fill`。接著抽 40 隨機保留，最後抽 40 校準（都按事件實際出現的分布，簡單隨機）。`outlineShort` 寫在 key.json，計分時帶入。 |
| 涵蓋原五＋新八、快慢、語言、句長；混入真換構圖、只換歌詞／墨色／紋理、微動、核准未畫、臨界兩側；不能只抽判成功者 | 分層欄位見下表；難例標籤由 detector 的數字對 `SEEN` 門檻的比值決定（`tagsOf()`）：臨界 = 決定性比值在 0.8–1.25 之間；微動 = 未判定且位移 0.015–0.06；只換歌詞 = 未判定且所有比值 < 0.4；只換底 = 未判定、底面或外框比值 ≥ 0.4 而幾何比值 < 0.8，或吸收了墨色 hold。 |
| 含聲音的前後短片及穩定幀；隱藏演算法判斷、事件名稱與版本 | `label-clips.mts`：事件前約 1.5 秒到後約 1.5 秒（且涵蓋兩張穩定幀），含原曲聲音；兩張穩定幀（量測用的 `stableTimes`）存 PNG。檔名只有匿名 id（`s001.mp4`、`s001_1.png` 較早、`s001_2.png` 較晚）；無疊字、無世界名、無判斷。 |
| 12 個隱藏重複 | `anonymise()`：從已抽的 120 件隨機取 12 件，給新的 id，和其他 120 件一起洗牌編號；重複件的檔案是原件的複本。答題說明不提有重複。 |
| 三題 | `答題.md`：① 是／否／不確定；② 座位／尺度關係／載體／取景（可複選）；③ 硬傷＋片段內秒數。 |
| 40 校準完即凍結門檻；保留集零誤放行、召回 ≥ 90 %；`outline-only` 另報 | `label-score.mts calibrate` 只用校準的 40 件搜門檻（先零誤放行、再最多一致、平手保留現行 `SEEN`、再取較嚴），寫 `frozen-thresholds.json`（門檻、雜湊、校準表雜湊）。`score` 沒有凍結檔就拒絕執行，只對 80 件保留集計分。 |
| 不確定不算通過；重複改變「是否算刀」先釐清再重標；改門檻後保留集降為開發資料 | 計分時 `不確定` 一律當「不是構圖變化」。重複件 Q1 的「是／非是」不同 → `repeats.ok = false`，整體 `pass = false`，並提示先釐清定義重標。保留集計分後若 `calibrate` 再算出不同門檻，直接報錯：要先用新 seed 重抽保留集。 |
| 正式片段的 `outline-only`、臨界、未實現仍需人工覆核；硬傷另走閱讀／載體閘門 | `score` 只回答「計數」；③ 的硬傷列在 `hardFaults` 交給閱讀／載體閘門，不併入 detector 一致率。 |

## 池（今天的量測）

來源（`label-samples.mts` `SOURCES`，排程器全開，seed 0）：

| 來源 | 內容 | commit |
|---|---|---|
| `out/research/q1-1109/phase4b-r2-frames-s0.json` | 13 個宣告世界 × 雙截棍 76–101／大雪 67–92 | 9e33409 |
| `out/research/q1-1109/phase4a.json` | 其餘 32 世界 × 同兩段 | 36a7db8 |
| `out/research/labelling-1110/measure-ja-s0.json`（新跑） | 45 世界 × 天文対話 45–70（快）／世界のつづき 54–79（慢） | f049b76 |
| `out/research/labelling-1110/measure-scale-riso-s0.json`（新跑，`VJ_SCALE=1`） | riso × 四段，只取帶 Q3 尺度事件者 | f049b76 |

為了有日文樣本，`measure-world-events.mts` 加了 `--windows`（預設仍是 `fast,calm`，日文兩段只在指定時跑，不進 phase-4 群組的目標判定）；frames 紀錄多存 `policy` 與 `absorbed`。

**池：1291 件事件、1122 組、45 世界；`outline-only` 21 件（21 組）。**

| 分層 | 件數 |
|---|---|
| detector 判斷 | realized 1223、unrealized 47、outlineOnly 21、核准未畫 0 |
| 世界組 | 原五 126、新八 202、其他 963 |
| 快慢 | 快 705、慢 586 |
| 語言 | 中文 831、日文 460、英文 0 |
| 句長（去標點字數） | 短 ≤ 6：134、中 7–12：886、長 ≥ 13：271 |
| 事件種類 | 座位 1100、載體 159、取景 26、hold 等級 6、尺度關係 0 |
| 難例標籤 | 臨界上 85、臨界下 27、微動 27、只換底 27、只換歌詞 4 |

抽出（seed 20261110）：

| 池 | 件數 | 判斷 | 世界組 五／八／其他 | 語言 中／日 | 種類 |
|---|---|---|---|---|---|
| 校準 | 40 | realized 38、unrealized 2 | 2／3／35 | 26／14 | 座位 35、載體 4、取景 1 |
| 保留・隨機 | 40 | realized 39、unrealized 1 | 1／2／37 | 26／14 | 座位 34、載體 6 |
| 保留・難例 | 40 | outlineOnly 21、unrealized 15、realized 4 | 7／5／28 | 25／15 | 座位 31、hold 4、載體 3、取景 2 |
| 隱藏重複 | 12 | — | — | — | — |

## 缺口（沒有足夠資料，沒有硬湊）

- **英文 0 件。** 量測的四首都是中文或日文；唯一含英文的歌（我愛台妹）以中文為主、沒有 meaning 快取，也沒有影格量測。要補須先選一首英文為主、時間已確認的歌加進 `--windows`。
- **尺度關係 0 件。** Q3 預設關閉；`VJ_SCALE=1` 下 riso 在四首裡只核准一件尺度事件（大雪 c013 @ 62.94），落在量測窗 67–92 之外。要補須擴大量測窗或等 Q3 重開。
- **核准未畫 0 件。** 所有被接管世界的 `unlaid` 都是 0（契約 0）。難例改由「排程核准、畫面未判定」的 unrealized 承擔，key.json 的 `drawnAs` 照實記錄。
- 隨機兩池照實際分布，13 個宣告世界只占約 1／8；它們主要出現在難例池。這是分布本身，不是抽樣偏差。

## 片段與渲染時間

- 渲染：一次一個，`nice -n 10`、`--workers 1`，每次渲染前等 `pgrep -f "scripts/lyric-vj/render[.]mts"` 沒有輸出；整首 job（`--start 0 --end <歌長> --clip a,b`，與量測的整首 job 一致），`--unconfirmed`（大雪、天文対話各有未確認行，量測照原樣讀它們）。
- 重用：事件落在已渲染的業主片段（`render-4b/riso-nun-after`、`silk-snow-after`，與 4b-r2 量測同 commit）內時，直接從該影片裁切。
- HEAD 核對：每件在 HEAD 重建 job，事件（種類、句、時間 0.05 秒內）不在了就記 `stale`、不渲染。
- 驗證集（`out/research/labelling-1110/clips-status.json`）：s059 從 `render-4b/riso-nun-after` 裁切；s052（card 雙截棍）、s015（idol-live 大雪）、s009（phone 天文対話）、s053（document 雙截棍 hold 等級）、s013（crayon 世界のつづき）在 HEAD f049b76 渲染，各 9／33／9／14／11 秒（3 秒片段）；6 件都在 HEAD 找得到原事件（stale 0）；重複 s110、s113、s118 自動複製。片段 1920×1080、含聲音、3.0 秒；穩定幀以肉眼看過 s052 兩張（換句後載體由兩張卡片變為扇形卡堆）。
- 估計：剩 114 件（含 1 件可裁切）約 38 分鐘（`SEC_PER_RENDER`，以驗證集實測換算），低於 2 小時，但依裁決 **不現在渲染**：`queue.json` 只是今天量測的佇列；新契約落地後要先重抽，再跑 `label-clips.mts --first calibration`（可中斷、可續跑）。

## 業主要做的事（契約落地、片段重產之後）

1. 打開 `~/Desktop/vj/output/構圖標記_2026-11-10/答題.md`，照三題填 `答題表.csv`（132 列，約 100 分鐘，可分次）。
2. 不確定就填不確定（算不通過）。③ 填片段內秒數。
3. 交回 CSV。資料夾裡沒有世界名、判斷、版本或前後側資訊；`key.json` 不給業主。

## 結果怎麼進閘門

1. `label-score.mts calibrate --table 答題表.csv`：只讀 40 件校準 → `frozen-thresholds.json`（凍結）。
2. `label-score.mts score --table 答題表.csv`：80 件保留 → `heldout-score.json`。`pass` = 零誤放行 ∧ 召回 ≥ 90 % ∧ 保留集答完 ∧ 重複一致；`outline-only` 另報，`outlineShort` 時該分支不自動放行。
3. 通過：凍結門檻取代 `SEEN` 成為影格核對的正式門檻，`verified*` 數字才可去掉「暫定」；未通過：門檻不得改後再對同一保留集計分，須用新 seed 重抽保留集。
4. 無論通過與否，正式片段的所有 `outline-only`、臨界與未實現事件仍要人工覆核；`hardFaults` 交閱讀／載體閘門。

## 契約落地後的步驟

1. 用新契約重跑量測：`measure-world-events.mts --frames --windows fast,calm,ja-fast,ja-calm`（13 世界與 45 世界；尺度開的 riso 另跑），把 `SOURCES` 指向新檔。
2. 重抽：`label-samples.mts --seed 20261110`（同 seed，新池）。
3. 產片段：`label-clips.mts --first calibration`（先出 40 校準＋其重複，可續跑；完成後把 `答題.md` 的「不要標記」改為定稿：`answerSheet(..., { final: true })`）。
4. 業主作答 → `calibrate` → `score`。

## 檔案

- `scripts/lyric-vj/label-samples.mts`（池、分層、抽樣、匿名化 → `manifest.json`、`key.json`）
- `scripts/lyric-vj/label-clips.mts`（片段、穩定幀、重複複本、`queue.json`、答題表）
- `scripts/lyric-vj/label-sheet.mts`（`答題.md` 內容）
- `scripts/lyric-vj/label-score.mts`、`label-score.test.mts`（計分、凍結；`npx tsx --test scripts/lyric-vj/label-score.test.mts`）
- `scripts/lyric-vj/measure-world-events.mts`（`--windows`、frames 的 `policy`／`absorbed`）
- 輸出：`out/research/labelling-1110/`（`manifest.json`、`key.json`、`queue.json`、`clips-status.json`、量測與 log）
