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

---

# 第二輪（Codex 提示詞修正，`claude-haiku-5-5`，effort `medium`）

**結論：照 Codex（`docs/research/2026-11-09-meaning-prompt-codex.md`）§2 改了提示詞，用 `medium` effort 重讀五首，總花費 $0.01496。key 從 7 個增加到 42 個，moment 候選從 4 個增加到 19 個。各自單獨跑 `checkMoments()` 時有 12 個通過，全部來自 snow（7）和 tsuzuki（5）。Codex §1 表列的候選中，key 命中 5／12，moment 命中 6／8。Q5 的 `songsReaching36of45` 從 1 變成 2（snow 45／45、tsuzuki 45／45）；Q3 的 nun 從 0 key 變成 5 key，在 36–40／45 個世界出現 edgeFit，逐世界 edgeFit 中位數從 0 變成 2。另有 4 個候選的 `why` 有讀錯或證據薄弱的問題（見下）。**

## 提示詞改了什麼

- `keys`、`keys.phrase`、`keys.why`、`moments`、`moments.why` 的 description 全部換成 Codex §2 的原文（`scripts/lyric-vj/meaning-read.mts` 的 keys schema；`src/app/lyric-vj/signature-moments.ts` 的 `MOMENTS_SCHEMA`）。
- `keys` 新增必要欄位 `why`，並取消「2 到 6 個字」的限制；字串長度是否放得下交給 Q3 判斷。
- `moments` 新增必要欄位 `evidenceCueId`（`word` 所在句的 id）。
- `momentsHelp()` 刪掉「整首最多 2 句、大多數歌是 0 句」和「最好在副歌」；實際演出的上限仍由排程器負責。
- 其餘 prompt 文字不變。`MomentAsk.evidenceCueId` 和 `Meaning.keys[].why` 設為選填，讀舊快取時不會出錯。用沒有 API key 的環境對 nun 的舊快取跑 `lineplan.mts`，產出的 plan.json 和改動前（HEAD）逐位元組相同。
- effort：claude-api skill 的模型表寫明 Haiku 5.5 支援 `low` 到 `max`，預設是 `medium`。本輪用 `medium`，五次呼叫都是 `end_turn`。為了避免思考 token 把輸出截斷，`max_tokens` 拉到 16000；最壞情況每次約 $0.009，遠低於 $0.50 的上限。正式的 `lineplan.mts` 仍維持 `low`／6000。
- `checkMoments()` 的 30 秒間距和 3 個上限會依輸入順序截斷，所以 `meaning-reread.mts` 先把每個候選單獨跑一次 `checkMoments([ask])`（`passAlone`），再整批跑一次（`passTogether`）。正式程式的上限邏輯沒有改。

## 各首結果（`meaning.haiku-1109b.json`，報告：`out/research/meaning-reread-1109/haiku-1109b.json`）

| 歌 | keys | moments 提出 | 單獨通過 checkMoments | 整批通過 | tokens in+out | USD |
|---|---|---|---|---|---|---|
| nun | 5 | 2 | 0（c019 有喊聲；c020+c021 是重唱，不算 echo） | 0 | 6303+3270 | 0.00227 |
| snow | 5 | 7 | 7 | 3 | 5698+4161 | 0.00265 |
| tsuzuki | 5 | 5 | 5 | 3 | 5462+3536 | 0.00231 |
| choroin | 21 | 4 | 0（3 個是重唱，1 個的配對不合法） | 0 | 6752+9062 | 0.00521 |
| tenmon | 6 | 1 | 0（重唱） | 0 | 5738+3896 | 0.00252 |
| **合計** | **42** | **19** | **12** | **6** | 29953+23925 | **0.01496** |

19 個候選的 `evidenceCueId` 都指向 `word` 所在的句子。

## 和 Codex §1 表比對（人工閱讀）

| 歌 | Codex 的 key：命中／漏掉 | Codex 的 moment：命中／漏掉 | 模型多出來的 |
|---|---|---|---|
| nun | 命中「柔中帶剛」c007；「仁者無敵」只出現在整句 phrase 裡（c022）。漏掉「雙截棍」c007 | 命中 c019 踢開（被喊聲擋下，符合 Codex 的判斷）。漏掉 c007 `shape/chain` | key：c016、c019、c027；moment：c020+c021 echo（是重唱，被拒絕） |
| snow | 命中「說再見」（模型選的是同一句重唱的 c039，不是 c021，而且整句都當成 phrase）。漏掉「無盡的思念」c003 | 命中 c009 `shape/fall`、c003 `strike/tear`、melt（模型選同一句先唱的 c005，Codex 說的是 c018） | key：c002、c013、c020、c023；moment：c001 大雪 fall、c008 飄雪 fall、c022 一瞬間 freeze、c042+c043 echo |
| tsuzuki | 命中「信じてみる」c014。漏掉「信じられる」c005（改用 c005+c007 echo moment 呈現） | 命中 c011 wave、c002 `strike/wipe` | key：c010、c011、c022、c027；moment：c001 海 wave、兩個 echo |
| choroin | 命中「君が最上級」c066（整句）。漏掉「愛情欠乏」c024 | Codex 認為 0 個合理；模型提出 4 個，全部被硬條件擋下 | 共 21 個 key，接近逐句湊數，違反「不要逐句湊數」 |
| tenmon | 漏掉「僕のこと見て」c006、「好きになって」c008、「好きになられて」c009（0／3） | 漏掉 c004 `shape/circle` | key：c001、c002、c012、c018、c037、c043；moment：c013+c038 echo（是重唱，被拒絕） |

合計：key 命中 5／12，moment 命中 6／8。另外，模型常把**整句**當成 phrase（例如 nun c022、snow c039、choroin c038），新的描述「以完整詞組為準」被讀得太寬。

**讀錯或證據薄弱（Codex 擔心的杜撰問題）：**
1. **snow c005 melt**：`why` 寫「悲傷真的化開消散」。原句「那些悲傷融化了從前」的主詞是悲傷，被融化的是從前，模型把它讀成傷痛消散，正是 Codex 指出的誤讀。這個候選單獨通過 `checkMoments`，在 5／45 個世界被計畫選中。
2. **choroin c043+c045 `shape/fall` 雨**：c043「雨降んないでよ」是希望不要下雨，模型卻把它和 c045 一起當成真的下雨。這是把願望或否定改寫成事實，已被配對規則擋下。
3. **snow c022 freeze「一瞬間」**：`why` 有保留「是期待而非已發生」，但 Codex 認為「一瞬間」本身不足以證明時間凍結。證據薄弱，卻在 19／45 個世界被選中。
4. **tsuzuki c001 wave「海」**：原句講的是「海のにおい」，是氣味的回憶。只因為有「海」字就選 wave，接近關鍵字觸發。在 17／45 個世界被選中。

`why` 有保留否定或願望語氣的例子：snow c023「就像是」的假設、tsuzuki c014「みる」的嘗試、choroin c043 的 key。

## Q3／Q5 dry-run（只在計畫層；`--meaning-suffix haiku-1109b`；合併檔 `merged-1109` 的數字幾乎相同）

**Q3**（`out/research/q3-1109/coverage-haiku-b.json`，nun 和 snow、3 seeds、45 世界）：

| 歌/seed | keys | 合法語意候選（段次） | edgeFit 段 | 有 edgeFit 的世界（round 1 → round 2） |
|---|---|---|---|---|
| nun/0,1,2 | 5 | 109／108／93 | 82／82／73 | 0 → 40／39／36 |
| snow/0,1,2 | 5 | 52／51／54 | 20／19／24 | 16／17／18 → 14／12／18 |

逐世界中位數：policy 9／9／10，medianEdgeFit 0 → 2，medianToday 8 → 10。

**Q5**（`out/research/q5-1109/moments-haiku-b.json`，seed 0）：`songsReaching36of45` 1 → 2。有 ≥1 時刻的世界：nun 0、snow 45（38 個世界有 2 個時刻）、tsuzuki 45（45 個世界都有 2 個時刻）、choroin 0、tenmon 0。nun 的 c019 在新政策裡是被 timing 擋下（「踢」沒有逐字時間），不是喊聲。

**排程缺口（被 Q2 hold 擋下，不是缺語意）**。數字是 45 個世界中撞上 Q2 hold 的世界數：

| 候選 | 撞 Q2 hold | 撞其他事件（Q4 link） | 被選中 |
|---|---|---|---|
| snow c001 大雪 fall | 35 | 2 | 1 |
| snow c003 破碎 tear | 33 | 0 | 12 |
| snow c005 融化 melt | 33 | 2 | 5 |
| snow c009 楓葉 fall | 25 | 0 | 1 |
| snow c008 飄雪 fall | 22 | 9 | 0 |
| snow c022 一瞬間 freeze | 7 | 4 | 19 |
| tsuzuki c002 消えて wipe | 25 | 0 | 15 |
| tsuzuki c001 海 wave | 13 | 0 | 17 |
| tsuzuki c014+c016 echo | 6 | 2 | 36 |

snow 的 c042+c043 echo 在 45 個世界都被選中，tsuzuki c011 波 在 12 個世界被選中，其餘未被選中的是因為每首 ≤2 個或間距 30 秒（notChosen）。每個候選在各世界的完整結果見 `docs/research/assets/2026-11-09-meaning-reread/q5-summary-b.json` 的 `perCandidateOver45Worlds`。

## Q5 驗收（依 Codex §5 改寫）

- `songsReaching36of45` 只作為診斷數字；3／5 不再是阻擋驗收的條件。
- 導演確認的每一個合法語意候選，都要有逐世界的實現或拒絕紀錄（本次的 `perCandidateOver45Worlds` 是計畫層版本）。沒有候選的歌明確記 0。
- 事先固定、而且符合總量與間距的導演選定時刻，必須在 ≥36／45 個世界**實際渲染成立**。不足的部分記為覆蓋缺口，不放寬硬條件，也不事後刪掉分母。
- snow 的 Q2 hold 碰撞記為排程缺口，不歸類成缺語意。目前的 dry-run 只證明計畫層有選中，還不算實際演出驗收。

## 合併快取（Codex §4）

`scripts/lyric-vj/meaning-merge.mts` 以既有的 `meaning.json` 為底，只換掉 `keys` 和 `moments`，並在輸出中加上 `source: {base: <sha256>, overlay, model, effort, date}`。輸出為 `out/research/instant/plans/<song>/meaning.merged-1109.json`；單元測試是 `scripts/lyric-vj/meaning-merge.test.mts`。

換檔指令（**尚未執行**；先確認其他 worktree 的量測已經結束）：

```sh
cd /Users/seitumbp2025/vjflow.worktrees/lyric-editing
for s in nun snow tsuzuki choroin tenmon; do d=out/research/instant/plans/$s; cp -p $d/meaning.json $d/meaning.instant-1101.json && cp -p $d/meaning.merged-1109.json $d/meaning.json; done
```

合併後 palette 和 parts 不變，所以同目錄的 `base.json`、`plan.json`、`palette` 不必因為配色或分段而重算。但新的 keys 和 moments 會改變計畫，正式出片前仍要重跑 `lineplan.mts`。

上面第一輪的換檔指令（`meaning.haiku-1109.json`）作廢；第二輪的指令也已被第三輪取代（見下）。

---

# 第三輪：候選複審（verify pass）

**結論：多加一次呼叫，讓模型以導演身分逐一複審每個候選，就能擋下硬條件抓不到的語意誤讀。第二輪標出的 4 個問題擋下 3 個（snow c005 melt、snow c022 freeze、tsuzuki c001 海），另一個 choroin 雨被保留，但它本來就會被硬條件擋下。誤刪 1 個：tsuzuki c002 `strike/wipe` 是 Codex 認可的候選。複審五首花 $0.0122，加上 lineplan 旗標的一次實測 $0.0044，本輪共 $0.0166。Q5 的 `songsReaching36of45` 仍是 2，但留下的時刻都通過了語意複審。Q3 的 snow 因為整句 key 被刪，edgeFit 世界從 14／12／18 降到 4／4／3；nun 仍有 40／39／35。**

## 機制

- `scripts/lyric-vj/meaning-read.mts` 新增並匯出 `verifyCandidates()`、`verifyRequest()`、`applyVerdicts()`，之後 lineplan 可以直接重用。
- 每首一次呼叫，模型 `claude-haiku-5-5`，effort `medium`。輸入是附 cue id 的完整歌詞，加上每個 key（句、phrase、why）和每個 moment（form／variant、句、證據句、word、why）。
- 提示詞要求模型以導演身分逐一獨立重判，逐項回答：(a) phrase 是否原樣唱出；(b) 把否定、願望、疑問、條件、反諷一起讀，這句是否支持該形式或強調；(c) 若是比喻，寫出「本體→喻體」，形式畫的東西不是句子在講的就判不支持（例如海的氣味→海浪）；(d) 主受詞方向是否正確；(e) key 是否整句（除非短句且整句就是重點，否則 drop）。
- 輸出用 strict schema，`id` 只能是清單裡的 `k<i>`／`m<i>`，不能新增候選。
- `applyVerdicts` 的規則：只有 `keep` 而且 (a)(b)(d) 都為真才保留；`keep` 但自身檢查不一致時會被推翻；沒有 verdict 的候選一律 drop；重複的 verdict 只取第一個。
- 單元測試：`scripts/lyric-vj/meaning-verify.test.mts`（fixture 回應 → 套用刪除；request 的 id 列舉）。
- `lineplan.mts --verify-meaning`：只有在新讀歌詞時才複審，複審後的結果寫入快取；命中既有快取時照原樣使用。預設關閉，預設行為和 HEAD 逐位元組相同（已驗證）。用 tsuzuki 實測新讀＋複審：先讀花 $0.0017，複審花 $0.0027，刪掉 1 個 moment。**是否在正式環境開啟由之後決定**：每首約 2 次呼叫，約 $0.004。
- 執行腳本是 `scripts/lyric-vj/meaning-verify.mts`：讀 `meaning.haiku-1109b.json`，寫出 `meaning.haiku-1109c.json`，報告在 `out/research/meaning-reread-1109/verify-1109c.json`（複本：`assets/.../verify-1109c.json`）。

## 結果

| 歌 | keys 前→後 | moments 前→後 | tokens in+out | USD |
|---|---|---|---|---|
| nun | 5→3 | 2→2 | 3274+2255 | 0.00145 |
| snow | 5→1 | 7→5 | 3264+3772 | 0.00221 |
| tsuzuki | 5→3 | 5→3 | 2750+3747 | 0.00215 |
| choroin | 21→15 | 4→4 | 5312+7439 | 0.00425 |
| tenmon | 6→3 | 1→1 | 2753+3734 | 0.00214 |
| **合計** | **42→25** | **19→15** | | **0.0122** |

**第二輪標出的 4 個問題：**
- snow c005 melt：**已 drop**。理由寫明「方向是悲傷把從前化掉，why 卻說悲傷自己消散」。
- snow c022 freeze：**已 drop**。理由是「屬願望而非已發生」。
- tsuzuki c001 海 wave：**已 drop**。理由是「講的是海的氣味，形式卻畫海浪」。
- choroin c043+c045 雨 fall：**仍保留**。複審認為 c045 的雨是真的雨。這個候選原本就被硬條件（配對規則）在 45／45 個世界擋下，不會演出。

**誤刪：**
- 第二輪單獨通過 `checkMoments` 的 12 個時刻中，留下 8 個，刪掉 4 個。其中 3 個是上面的預期刪除；誤刪 1 個：**tsuzuki c002 消えて wipe**。複審理由是「疑問句，消失沒有被肯定發生」，但 Codex 認為「どうして…消えてしまうの」問的是為什麼會消失，消失本身是前提。這次複審對疑問句太嚴格。
- 和 Codex §1 表比對：moment 命中 6 個，留下 4 個（c005 melt 是預期刪除，c002 wipe 是誤刪）。key 命中 5 個，留下 3 個（柔中帶剛、信じてみる、君が最上級）。被刪的 nun「仁者無敵」和 snow「說再見」，第二輪的 phrase 都是整句，照規則 (e) 刪除是一致的，但也表示第一輪應該只取詞組。

**choroin 的 21 個 key 留下 15 個。** 被刪的 6 個都是長整句；留下的有 7 個是「短句整句」的例外，這個例外的認定偏寬。

**複審本身的弱點：** 重唱被當成 echo 的候選（nun c020+c021、choroin 三個 echo、tenmon あれ）全部被保留，但 `checkMoments` 的「重唱不算 echo」規則會擋下。所以複審負責語意，硬條件負責形式，兩者要一起用。另外 tenmon k2 的理由有指出 why 把「言ってみたい」的願望寫成承諾，但仍判 keep：複審對 key 的 why 錯誤是「修正說明」而不是 drop。

## Q3／Q5 dry-run（`--meaning-suffix haiku-1109c`；Q5 另外跑了 `merged-1109c`，結果相同）

**Q3**（`out/research/q3-1109/coverage-haiku-c.json`）：

| 歌/seed | keys | 合法語意候選 | edgeFit 段 | 有 edgeFit 的世界（第二輪 → 第三輪） |
|---|---|---|---|---|
| nun/0,1,2 | 3 | 85／83／73 | 74／72／63 | 40／39／36 → 40／39／35 |
| snow/0,1,2 | 1 | 13／9／9 | 4／4／3 | 14／12／18 → 4／4／3 |

逐世界中位數：medianEdgeFit 2／2／1，medianToday 11。

**Q5**（`out/research/q5-1109/moments-haiku-c.json`，seed 0）：`songsReaching36of45` = 2（診斷用）。有 ≥1 時刻的世界：nun 0、snow 45、tsuzuki 45、choroin 0、tenmon 0。

每個候選在 45 個世界的結果（被選中／撞 Q2 hold／撞其他事件／因名額或間距未選）：

| 候選 | 選中 | Q2 hold | 其他 | 名額或間距 |
|---|---|---|---|---|
| snow c001 大雪 fall | 2 | 35 | 2 | 6 |
| snow c003 破碎 tear | 12 | 33 | 0 | 0 |
| snow c008 飄雪 fall | 5 | 22 | 9 | 9 |
| snow c009 楓葉 fall | 10 | 25 | 0 | 10 |
| snow c042+c043 三年後 echo | 45 | 0 | 0 | 0 |
| tsuzuki c011 波 wave | 42 | 0 | 0 | 3 |
| tsuzuki c005+c007 echo | 11 | 0 | 3 | 31 |
| tsuzuki c014+c016 echo | 36 | 6 | 2 | 1 |
| nun c019 踢 tear | 0（timing：「踢」沒有逐字時間） | | | |
| nun c020+c021、choroin ×4、tenmon ×1 | 0（legalCue：重唱或配對不合法） | | | |

snow 的 Q2 hold 碰撞仍是排程缺口。拿掉 c005 和 c022 之後，snow 的楓葉 c009 被選中次數從 1 增加到 10。

## 換檔指令（已於 2026-11-10 執行，Q1 3a 合併 d298d7b 之後；舊檔備份為 meaning.instant-1101.json）

```sh
cd /Users/seitumbp2025/vjflow.worktrees/lyric-editing
./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/lyric-vj/meaning-merge.mts --overlay-suffix haiku-1109c --out-suffix merged-1109c --effort medium+verify  # already run
for s in nun snow tsuzuki choroin tenmon; do d=out/research/instant/plans/$s; cp -p $d/meaning.json $d/meaning.instant-1101.json && cp -p $d/meaning.merged-1109c.json $d/meaning.json; done
```

這組指令取代第二輪的 `merged-1109` 版本；已被第四輪取代（見下）。

---

# 第四輪：疑問句規則、整句 key 收窄（今天最後一輪）

**結論：tsuzuki c002 wipe 這次被保留。另有 10 個整句 key 被收窄成同句裡的一段後保留。Codex 表裡的 key 只回來 1 個，是 snow「說再見」，收窄成「學不會說再見」。新增 2 個誤刪：snow c009 楓葉 fall 和 nun「仁者無敵」。複審沒有重讀歌詞，花 $0.01828。Q3 的 snow 有 edgeFit 的世界從 4／4／3 回升到 41／41／44，逐世界 edgeFit 中位數為 3。Q5 的 `songsReaching36of45` 仍是 2。同一批候選在第三輪和第四輪的判決有幾處相反，單次複審有抽樣變異，正式採用前要處理。**

## 改了什麼（只改複審，不重讀）

- 規則 (b) 加上疑問句的分辨：問「為什麼／怎麼會 X」的感嘆或反問，X 本身確實發生，判為支持；問「X 會不會發生」或希望 X 發生，判為不支持。
- 規則 (e) 改成：整句 key 不直接 drop。複審可以在新欄位 `narrowedPhrase` 填入同一句裡承載重點、原樣連續唱出的一段（不能換句、改字、補字或拼接）。沒有收窄時填空字串，moment 一律填空字串。
- `applyVerdicts(m, verdicts, cues)` 套用收窄後，會用 validMeaning 同樣的 `text.includes` 原文檢查再確認一次；收窄後的詞段不在該句裡就 drop。收窄紀錄放在 `narrowed[]`。
- 單元測試（`meaning-verify.test.mts`，3 個 test）：fixture 裡 tsuzuki c002 這種感嘆疑問判 keep 並保留，snow c022 這種願望判 drop。另有兩個收窄例子：合法的收窄被套用；改了字（「學會說再見」）或指到別句的收窄被 drop。最後確認 prompt 裡有疑問句規則、schema 有 `narrowedPhrase`。
- 腳本：`meaning-verify.mts --to haiku-1109d --report out/research/meaning-reread-1109/verify-1109d.json`；`meaning-merge.mts --overlay-suffix haiku-1109d --out-suffix merged-1109d`。

## 結果（輸入都是第二輪的 `haiku-1109b` 候選）

| 歌 | keys（第三輪 → 第四輪） | 收窄 | moments（第三輪 → 第四輪） | USD |
|---|---|---|---|---|
| nun | 3 → 4 | 0 | 2 → 2 | 0.00254 |
| snow | 1 → 5 | 2 | 5 → 4 | 0.00374 |
| tsuzuki | 3 → 5 | 1 | 3 → 4 | 0.00330 |
| choroin | 15 → 20 | 6 | 4 → 4 | 0.00572 |
| tenmon | 3 → 5 | 1 | 1 → 1 | 0.00298 |
| **合計** | **25 → 39** | **10** | **15 → 15** | **0.01828** |

- **tsuzuki c002 消えて wipe：保留。** 複審理由是「確實消失的感嘆式疑問」。snow c022 願望仍然 drop。
- **第二輪標出的 3 個誤讀維持 drop**：snow c005 melt、snow c022 freeze、tsuzuki c001 海。choroin 雨仍被保留，但硬條件會擋下。
- **收窄的 10 個 key**：
  - snow：「才想起」c020、「學不會說再見」c039
  - tsuzuki：「よせる波に隠れてしまう」c011（只去掉了の，等於沒收窄）
  - choroin：「はずなのに満たされないの」、「ノンフィクションなラブを君と紡ぎたい」、「でも”繋がり”はNG」、「恋に恋しているんです」、「いっぱい言ってくれたじゃんか「スキスキ」」、「だって好きなんだもん」
  - tenmon：「わからないけどまあいいや」
- **Codex 表的 key**：回來 1 個，snow「說再見」（以「學不會說再見」的形式）。「無盡的思念」從第二輪起就不在候選裡；複審不能新增候選，所以不可能回來，要靠讀歌詞那一輪列出。nun「仁者無敵」這次被整個 drop，複審理由是「整句沒有戲謔」，但 Codex 認為它是習武價值的重點，這是判錯 why 而連帶刪掉詞組，屬於誤刪。
- **新的誤刪**：snow c009「回憶就像是那凋落的楓葉」shape/fall。第三輪保留它，這輪卻依規則 (c) 判為「畫喻體」而 drop。Codex 認為這句明確把回憶比作凋落，應該提出。規則 (c) 的例子（海的氣味→海浪）被套到「明喻、喻體就是形式的意思」的句子上了。
- **判決不穩定**：同一批候選，第三輪和第四輪對 snow c009、nun k4「為人耿直不屈」、snow 的整句 key 都給出相反的判決。單次 Haiku 複審有抽樣變異。要穩定下來，可以跑多次取多數決，或在規則 (c) 補上「明喻、喻體就是形式所畫的意思時支持」；兩者都還沒做。

## Q3／Q5 dry-run（`--meaning-suffix haiku-1109d`；Q5 另外跑了 `merged-1109d`，結果相同）

**Q3**（`out/research/q3-1109/coverage-haiku-d.json`），有 edgeFit 的世界：
- nun：40／39／36（第三輪 40／39／35）
- snow：41／41／44（第三輪 4／4／3）

逐世界 edgeFit 中位數為 3／3／3（第三輪 2／2／1）。

**Q5**（`out/research/q5-1109/moments-haiku-d.json`）：`songsReaching36of45` = 2（診斷用）。每個候選在 45 個世界的結果：

| 候選 | 選中 | Q2 hold | 其他 | 名額或間距 |
|---|---|---|---|---|
| snow c001 大雪 fall | 4 | 35 | 2 | 4 |
| snow c003 破碎 tear | 12 | 33 | 0 | 0 |
| snow c008 飄雪 fall | 9 | 22 | 9 | 5 |
| snow c042+c043 echo | 45 | 0 | 0 | 0 |
| tsuzuki c011 波 wave | 25 | 0 | 0 | 20 |
| tsuzuki c002 消えて wipe | 20 | 25 | 0 | 0 |
| tsuzuki c005+c007 echo | 11 | 0 | 3 | 31 |
| tsuzuki c014+c016 echo | 34 | 6 | 2 | 3 |

nun、choroin、tenmon 仍是 0，原因是 timing 或 legalCue。Q2 hold 碰撞仍是排程缺口。

## 換檔指令（已於 2026-11-10 執行，Q1 3a 合併 d298d7b 之後；舊檔備份為 meaning.instant-1101.json）

```sh
cd /Users/seitumbp2025/vjflow.worktrees/lyric-editing
for s in nun snow tsuzuki choroin tenmon; do d=out/research/instant/plans/$s; cp -p $d/meaning.json $d/meaning.instant-1101.json && cp -p $d/meaning.merged-1109d.json $d/meaning.json; done
```

這組指令取代第三輪的 `merged-1109c` 版本。換檔前建議先決定怎麼處理上述兩個誤刪和判決不穩定的問題。
