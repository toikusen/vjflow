# 2026-11-09 五首測試歌重讀 meaning（claude-haiku-5-5, low effort）

**結論：用現行 prompt 重讀五首，總花費 $0.0066。新讀法共 7 個 key（nun 0、snow 1、tsuzuki 1、choroin 3、tenmon 2）、4 個 moment 候選（nun 1、snow 2、tsuzuki 1，另兩首 0），其中 2 個通過 `checkMoments()`。Q5 計畫層：`songsReaching36of45` 0 → 1（tsuzuki 45/45、snow 6/45）。Q3：snow 的語意候選與 edgeFit 從 0 變成每個 seed 16–18 個世界有 edgeFit；nun 仍是 0 key，所以仍是 0。舊快取沒有被改動；新檔案放在旁邊，名稱是 `meaning.haiku-1109.json`。**

## 舊快取缺什麼、為什麼

- `out/research/instant/plans/<song>/meaning.json` 五份都寫於 2026-11-01 13:06。
- **moments**：`lineplan.mts` 的 schema 到 e7cdcba（2026-11-04）才加上 `moments`，而且遇到已存在的 `meaning.json` 會直接沿用、不重新呼叫 API，所以這五份從來沒有被要求產生 `moments`（跟 Q5 phase 1 的判斷一致）。
- **keys**：第一版 prompt（dc3202b）就已經要求 `keys`（schema 的 `required` 裡有 keys）。所以 `keys: []` 不是漏問。推論：可能是模型回傳了很少的 key，而 `valid()` 把不是原樣出現在該句的 phrase 濾掉；也可能是模型自己就沒有給。舊回應沒有留存，無法分辨是哪一種。這次重讀的結果支持「這個 prompt 本來就只會給很少 key」：schema 對 keys 的描述是「值得強調的句子才列，可以很少」，對 moments 的描述是「專屬時刻，通常是空的」。nun 這次也只給了 1 個 key，而且被 `validMeaning` 濾掉（phrase 不是該句歌詞的原文）。
- 本次**沒有改 prompt 內容**。prompt、schema、模型、effort 都和 `lineplan.mts` 原本的相同。

## 做法

- `scripts/lyric-vj/meaning-read.mts`：把 `lineplan.mts` 原本的 prompt、schema 和 API 呼叫原封不動抽出來。`lineplan.mts` 改成 import 它，行為不變：prompt 和 schema 逐行比對都相同，另外用 snow 的快取跑過一次 smoke test。
- `scripts/lyric-vj/meaning-reread.mts`：對五首（nun `yt_w_fCuUR3lEs`、snow `yt_5i50aTB7JFo`、tsuzuki `yt_b3GCfyNKeLs`、choroin `yt_hCCskTJwvuc`、tenmon `yt_iwYXfOhcsYI`）依序呼叫 `claude-haiku-5-5`，設定 `output_config.effort: 'low'`、json_schema 結構化輸出、`max_tokens` 6000。結果經過 `validMeaning` 後寫成 `meaning.haiku-1109.json`。目標檔已存在時會跳過，加 `--force` 才會重問。每次呼叫前先用最壞情況估成本，超過 $0.50 就停止。每首都會跑 `checkMoments()` 和免費層的 `todayGate()`。
- 金鑰：`~/.config/vjflow/anthropic.env`（`ANTHROPIC_API_KEY`）。先用一次最小請求測試，回傳 200 / `end_turn`（12 in + 4 out tokens）。10-31 記錄的 401 已經不存在。
- 價格：每 1M token 輸入 $0.10、輸出 $0.50（Haiku 5.5，prompt 小於 100K）。

## 各首結果

| 歌 | keys（有效/要求） | moments 候選 | 通過 checkMoments | 免費層 todayGate 保留 | tokens in+out | USD |
|---|---|---|---|---|---|---|
| nun 雙截棍 | 0/1 | 1（c019 strike/tear 踢開） | 0（旁邊有喊聲，shout） | 0 | 4528+1467 | 0.00119 |
| snow 三年後的大雪 | 1/1（c018 融化了從前） | 2（c018 strike/melt 融化；c017 freeze/stop 一瞬間） | 1（一瞬間 被判為「那一」的一部分，evidence） | 0（不在副歌） | 3923+1323 | 0.00105 |
| tsuzuki 世界のつづき | 1/1（c027 共に生きよう） | 1（c011 shape/wave 波） | 1 | 0（不在 downbeat 上） | 3687+1673 | 0.00121 |
| choroin プラトニックチョロイン | 3/3 | 0 | 0 | 0 | 4977+2162 | 0.00158 |
| tenmon 天文対話 | 2/2 | 0 | 0 | 0 | 3963+2249 | 0.00152 |
| **合計** | **7** | **4** | **2** | **0** | 21078+8874 | **0.00655** |

重讀的內容不只多了 keys 和 moments，palette、parts 也變了（例如 nun 改成 lacquer、6 段）。所以換檔後，所有讀這些快取的量測（不只 Q3／Q5）都會跟著改變。

## Q3／Q5 dry-run（只在計畫層，沒有渲染）

兩支量測腳本新增了 `--meaning-suffix <s>` 參數，改讀 `meaning.<s>.json`；不帶這個參數時行為不變。

**Q5**（`measure-free-moments.mts`，45 世界，seed 0）：

| 歌 | 候選 前→後 | 有 ≥1 時刻的世界 前→後 | 0 時刻的原因（後） |
|---|---|---|---|
| nun | 0→1 | 0→0 | noCandidatePassed 45（喊聲） |
| snow | 0→2 | 0→6（y2k、psychedelic、blueprint、xerox、screentone、art-deco） | noCandidatePassed 39：c018 的 big 視窗與 Q2 hold `ink-run@c018` 撞在一起；c017 未通過 evidence |
| tsuzuki | 0→1 | 0→45（mini、type-only，140.84 s） | — |
| choroin | 0→0 | 0→0 | noMeaningCandidate |
| tenmon | 0→0 | 0→0 | noMeaningCandidate |

`songsReaching36of45`：0 → 1（目標是 ≥3）。

**Q3**（`measure-scale-coverage.mts`，nun 和 snow、3 seeds、45 世界，instant 變體）：

| 歌/seed | keys | 合法語意候選（段次，前→後） | 選中語意（前→後） | edgeFit 段（前→後） | 有 edgeFit 的世界 |
|---|---|---|---|---|---|
| nun/0–2 | 0 | 0→0 | 0→0 | 0→0 | 0/45 |
| snow/0 | 1 | 0→21 | 0→21 | 0→16 | 16/45 |
| snow/1 | 1 | 0→21 | 0→21 | 0→17 | 17/45 |
| snow/2 | 1 | 0→27 | 0→27 | 0→18 | 18/45 |

逐世界中位數（兩首合計）：policy 9/9/10 → 9/10/10，medianEdgeFit 仍是 0（nun 沒有 key，snow 只有一段有 key），worldsFullPolicy 3/3/1 → 4/4/1。

讀法：重讀確實讓語意層開始有作用，但現行 prompt 在 low effort 下給的 key 和 moment 非常少。要讓 Q3 的 edgeFit 中位數或 Q5 的 3/5 目標達標，要另外決定是否修改 keys 和 moments 的 prompt 描述（「可以很少」、「通常是空的」）。這屬於 prompt 變更，本次沒有做。

## 檔案

- 新讀法：`out/research/instant/plans/<song>/meaning.haiku-1109.json`（複本放在 `docs/research/assets/2026-11-09-meaning-reread/meaning/`）
- 重讀報告：`out/research/meaning-reread-1109/report.json`（複本：`assets/.../reread-report.json`）
- 量測：`out/research/q3-1109/coverage-haiku.json`（15 MB，未 commit）、`out/research/q5-1109/moments-haiku.json`；摘要在 `assets/.../q3-summary.json`、`q5-summary.json`（含前後對照）

## 換檔指令（尚未執行）

先確認 `vjflow.worktrees/q1-world-events` 的量測已經結束。舊檔會備份成 `meaning.instant-1101.json`：

```sh
cd /Users/seitumbp2025/vjflow.worktrees/lyric-editing
for s in nun snow tsuzuki choroin tenmon; do d=out/research/instant/plans/$s; cp -p $d/meaning.json $d/meaning.instant-1101.json && cp -p $d/meaning.haiku-1109.json $d/meaning.json; done
```

同一個目錄裡的 `base.json`、`plan.json`、`palette` 是用舊讀法算出來的；換檔後要用 `lineplan.mts` 重算，才會和新讀法一致。
