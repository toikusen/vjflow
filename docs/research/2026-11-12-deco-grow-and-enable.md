# art-deco 字變大單一變因配對、popart／midcentury 開啟（2026-11-12）

**結論。**
1. 新增實驗開關 `noLineGrow`（freeJob 選項，或 `VJ_NO_LINE_GROW=1`），預設關閉；開關關閉時預設指紋與 `--q1` 指紋位元組相同。大雪 art-deco 整首 19 個 `line-grow` → 0，**沒有任何替代 hold**（全部變 keep）。90–150 秒內 7 → 0。其餘差異只有 hold 紀錄欄位，構圖、時間碼與其他事件都相同。盲測片已放進業主資料夾。
2. popart、midcentury 的 `compositions.enabled` 改為 `true`。**更正交辦前提**：`enabled` 本身就是排程器的開關（`free-plan.ts` 的 `asked`），所以這兩個世界的**預設產品會改變**，改成排程器開的版本。每個 seed 225 列中有 215 列位元組相同；改變的 10 列正好是 popart／midcentury × 5 首，而且 seed 0 這 10 列與 `--q1` 指紋逐列相同；`--q1` 總指紋不變。排程器開時，閘門 fails 0、contract 0、退步 0，carrier-overflow 與 rule-crosses-text 都是 0。60 個 job 的 final check、verifier 警告都是 0。13 世界組中位數不變。

## 1. 字變大配對（Codex 2026-11-10 pairs A）

**契約**：採用預設產品的契約。art-deco 的 `compositions.enabled` 是 false，所以排程器關閉，由 composer 依世界順位提交 hold，沒有句內換座（2026-11-10 no-inline-default）。條件：三年後的大雪（`out/db/yt_5i50aTB7JFo`）、seed 0、Huninn、片段 90–150 秒。

**開關**：`src/app/lyric-vj/free-plan.ts:394`（選項）、`:434`（`noLineGrow ?? env('VJ_NO_LINE_GROW')`）、`:436`（把世界 `holds` 中 `line-grow` 的口味設為 0）。其他規則照舊：
- `holdCandidatesOf` 的加權抽籤是在「口味 > 0」的清單上排序。`line-grow` 在清單最後，拿掉它不會改變其他種類的索引，所以其他句子的抽籤結果不變。

**計畫差異**：`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/deco-grow-pair.mts --out out/research/deco-grow` 產出 `diff.json`。比對方式是逐葉比較 job 與 treatment 兩邊。

| 差異 | 數量 |
|---|---:|
| 句子的 `world.beat`（line-grow → 無） | 19（整首）／7（窗內） |
| 事件表 `holds` | 19 → 0 |
| 替代 hold（換成其他種類） | **0** |
| 只有紀錄欄位改變：`beatSkip`／`beatWhy` | 31 句 |
| 只有紀錄欄位改變：`beatRejects` | 12 句 |
| 警告少一則（c014 68.08 秒，line-grow 與交接部分重疊，窗外） | 1 |
| 其他欄位（set、構圖、進出場、時間碼、墨色、鏡頭） | 0 |

說明：
- 為什麼沒有替代：大雪是慢歌，art-deco 的句子都落在短句或中句，只能用「會停住的」hold。其中：
  - `ink-swap`／`line-ink-settle` 需要有理由（pairs C）；
  - `carrier-settle`／`panel-open` 這個世界的座位不提供；
  - `plate-spread` 只用在長句。
  所以拿掉 line-grow 後就是 keep。
- 另外 12 句原本的跳過理由是「前一句是 line-grow，不能連續同種」，現在改成「沒有世界允許的動作」，結果仍是 keep。

**兩支片**：
- 渲染：`out/research/deco-grow/run.sh`。一次只跑一支，`nice -n 10`、`--workers 1`；兩支 exit 0。
- metadata 已用 `ffmpeg -map_metadata -1 -c copy` 拿掉，之後用 ffprobe 確認只剩容器品牌標記。
- 交給業主：`~/Desktop/vj/output/字變大比較_2026-11-12/甲.mp4`、`乙.mp4`、`答題.md`。
- 答案只放在 `out/research/deco-grow/key.json`，沒有複製到業主資料夾。
- 抽幀檢查：
  - 片內 12.2 秒（101.47 秒 line-grow 之後），兩支 PSNR 17.1 dB，可以看到一支字比較大；
  - 11.3 秒（hold 之前）是 26.2 dB，差異來自雪與顆粒的雜訊。

**指紋**（`out/research/deco-grow/hash/`，`default-hash.mts`）：

| | ffee2a7（改前） | 698dfe3（開關） |
|---|---|---|
| 預設 seed 0 | `a1c8935d…` | `a1c8935d…` |
| `--q1` | `641c1058…` | `641c1058…` |

**單元測試**：`src/app/lyric-vj/no-line-grow.spec.ts`（3 個）。
- 未設定或 false 時，與預設 job 位元組相同；
- true 時沒有 line-grow，沒長大的句子 hold 不變，把 hold 紀錄拿掉後 job 相同；
- 環境變數與選項的結果相同，明確給 false 時優先於環境變數。

## 2. 開啟 popart、midcentury（Codex 2026-11-10 pairs D.3）

業主已接受 v8：`docs/design-bar/cards/2026-11-10-no-inline-default-and-bands-pass.md`、`2026-11-10-popart-tail-pass.md`。

改動：
- `src/app/lyric-vj/world-shared.ts:423`、`:429` 改為 `enabled: true`，並加上註解。
- `free-plan.ts` 的註解一併修正。
- 規格同步更新，「沒有世界預設開啟」改為「只有這兩個」：
  - `world-events-phase4.spec.ts`
  - `world-events-wiring.spec.ts`
  - `world-events-phase4d.spec.ts`：預設 job 必須與 `worldEvents: true` 位元組相同；`worldEvents: false` 時不出同頁座位；帶狀檢查改跑預設（midcentury 現在是排程器開）。另外把 phase 4d 實歌 describe 的 timeout 從 60 秒提高到 120 秒，因為 midcentury 的預設 job 現在要跑排程器。實測 choroin 單一 job：關 3.9 秒、開 6.1 秒，約 1.6 倍；popart 0.87 → 1.63 秒。

**指紋**（`default-hash.mts --seed N`；698dfe3 → 本 commit）：

| seed | 改前 | 改後 | 改變列 |
|---|---|---|---|
| 0 | `a1c8935d…` | `807541d6…` | 10（popart、midcentury × 5 首；逐列等於 `--q1`） |
| 1 | `cee589ee…` | `cc3529f3…` | 10（同上兩世界） |
| 2 | `9b2d9cff…` | `a387538a…` | 10（同上兩世界） |
| `--q1` | `641c1058…` | `641c1058…` | 0 |

其他 43 個世界每一列都相同。

**計畫檢查**：`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/enable-check.mts --out out/research/deco-grow/enable/check.json`。範圍是 2 世界 × 5 首 × seed 0–2 × 預設／joint，共 60 個 job。結果：
- final check 0、`verifyWorldEvents`（含 pairs B／C、落地）0、`lightGapWarnings` 0、`jointChecks` 0；
- 全部 `source: declared`；
- 預設 job 與 `worldEvents: true` 不同的數量為 0。

**閘門**：`VJ_WORLD_EVENTS=1 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/deco-grow/enable/gate-on --baseline scripts/lyric-vj/style-gate-rules.baseline.json popart midcentury`。commit 698dfe3 加上 enable 的工作樹改動；這次改動只動 `enabled`，計畫與上表相同。

| 世界 | 時刻 | fails | contract | 退步 | carrier-overflow | rule-crosses-text | 其他 |
|---|---:|---:|---:|---:|---:|---:|---|
| popart | 489 | 0 | 0 | 0 | 0 | 0 | 全 0 |
| midcentury | 489 | 0 | 0 | 0 | 0 | 0 | plate 171（accepted，與 4D 合併後相同） |

另有 camDrops 4 筆（popart snow c006、choroin c060、tenmon c019，midcentury choroin c060），是排程器丟掉的世界鏡頭紀錄，不是失敗。

**13 世界組**：`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts --seeds 0,1,2 --out out/research/deco-grow/enable/measure.json`，headline 為 `medianWiredPlanExclUnreliable`，contract []。

| 組 | 快（seed 0／1／2） | 慢（seed 0／1／2） |
|---|---|---|
| 13 個 | 3.6／3.6／3.6 | 3.2／3.2／2.8 |
| 原五 | 3.6／3.6／3.6 | 2.8／3.2／2.8 |
| 新八 | 3.6／3.6／3.6 | 3.2／3.2／3.0 |
| 全 45 | 3.2／3.6／3.6 | 3.2／3.2／3.2 |

與 2026-11-10 no-inline-default §4.3 的 ON 欄相同。這個量測明確指定 `worldEvents` true／false，所以不受 `enabled` 影響。

## 3. 測試

- `npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json`：通過。
- 新測試 `no-line-grow.spec.ts` 3 個全過，`world-events-phase4d.spec.ts` 在單獨跑與長 timeout 全套跑中都通過。
- **完整 `npx ng test --watch=false` 沒有拿到全綠。** 原因是機器負載（load average 35–63，其他 agent 的 Chrome 閘門同時在跑），不是斷言失敗：
  - 預設設定跑了兩次，分別是 67／1794 與 23／1794 失敗，**全部是 timeout**。log 中除了 timeout 之外沒有任何 `AssertionError` 或 `expected`。紀錄：`out/research/deco-grow/ngtest.log`、`ngtest-full3.log`。
  - 加上只拉長預設 timeout 的 runner config（`testTimeout 300000`，不改任何測試；檔案在 scratchpad，未提交），結果 **1793／1794 過**（`ngtest-full4.log`）。
  - 唯一失敗的是 `style-world.spec.ts`「draw only from their own pool」。這個測試自己寫死 30 秒 timeout，在高負載下跑了 39–53 秒；單獨跑同樣是超時。它只跑 `family !== 'print'` 的世界，而 popart、midcentury 都是 print，`noLineGrow` 預設也不開，所以這次的改動碰不到它跑的程式路徑（推論：負載造成）。要確認，需要在機器空閒時重跑一次完整 `ng test`。

## 4. 限制

- 字變大配對用的是預設產品（排程器關）。之前業主看的盲測是排程器開的 holds-first，兩者在構圖上本來就不同，這次沒有混用。
- 拿掉 line-grow 後，art-deco 在這首慢歌整首沒有任何 hold。所以這組比的實際上是「有字變大」對「完全靜止」。如果業主選 ③「減少」，需要另外設計頻率規則，這組片不能回答頻率的問題。
- popart／midcentury 開啟後就是預設產品，沒有另外的業主確認步驟。依據是 v8 已接受，以及 Codex D.3 的順序（midcentury 色條已先通過）。
