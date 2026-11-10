# 成對盲測兩條裁決的落實：句內不換座（B）、換色要有理由（C）（2026-11-10）

**結論。** 兩條規則都已落在計畫、交給渲染器的資料、最後檢查（verifier）與量測裡，不只是設定。B：所有世界都不再有句內 `layout-seat`，一句最多一個可見構圖動作；大雪 art-deco（排程器開、holds-first）整首句內換座 14 → **0**、一句兩個構圖的句子 13 → **0**（業主指認的 120–122 秒那一跳也在內）。C：`ink-swap` 只在有可追溯理由的句子成立，時間錨在被換色詞組的演唱起點；雙截棍 file 70–130 秒 ink-swap 19 → **3**（整首 47 → 5），每個都帶 `why` 與來源，連續兩句同種 hold 16 → **0**，每段最多 2 次。代價照實報：Q2 覆蓋率下降（預設 1.5–3 秒 55.0 % → 43.9 %），而且**被拿掉的片語換色大多換成了「整句換墨」（`line-ink-settle`）**：file 這段 21 句裡 9 句是整句換墨。C 的理由白名單只管 `ink-swap`，整句換墨不在裡面；業主是否也覺得它「隨便換」，需要看片子（見 §5）。13 世界組中位數不變（快 3.6／慢 3.2）；原五世界慢歌 4.0 → 2.8。閘門 off／on 兩次都是 contract 0、fails 0、regressions 0。

裁決原文：`out/research/q1-1109/codex-pairs.md` B、C、D.1；事實：同目錄 `codex-pairs-brief.md`；卡：`docs/design-bar/cards/2026-11-10-no-inline-line-move.md`、`2026-11-10-pairs-holds-first-colour.md`。

## 1. 規則 B：正在唱的句子不換座

| 實作 | 位置 |
|---|---|
| `layout-seat` 的 `allowedAt` 拿掉 `'in-line'`：blueprint、chalkboard、notebook、art-deco 與 `DEFAULT_ALLOWED_AT` | `world-shared.ts`、`world-events.ts` `DEFAULT_ALLOWED_AT` |
| `IN_LINE_ORDER` 拿掉 `layout-seat`：就算某個世界之後又宣告 `in-line`，排程器的句內路徑也不會產生它 | `world-events.ts` `IN_LINE_ORDER` |
| `line.given` 路徑：被排程器接管的世界，composer 給的句內 repose 一律不排、記在 `rejected`（理由「given repose inside the line」）；排程器開關被要求時（`worldEvents: true` 或 `VJ_WORLD_EVENTS=1`），composer 連沒宣告能力的世界也不再產生句內 repose（`WorldPool.stillLines`） | `world-events.ts` given 迴圈、`free-plan.ts`、`lineplan-core.ts` `stillLines` |
| `carrier-swap`（poster-panel）留在句內，但字必須在完全相同的框與字級（`sameWords`）；而且進句已有可見構圖時不再追加：`entranceAndInLine` 整個撤銷（宣告、caps、`jointChecks` 的 `pairOk`、`supplyCap` 的 `capTwo`）；holds-first 路徑同樣「進句有構圖就不做句內」 | `world-events.ts` `inLine` 的 `poolOf`、`entered()`／`rejectInLine()`；`world-events-adapter.ts`；`measure-world-events.mts` |
| verifier：`verifyWorldEvents` 對任何 `layout-seat` + `in-line` 報 `pairs B`；一句超過一個可見構圖（layout-seat、carrier-swap、page-handoff、ground-role、camera-reframe）報；畫面上（job 的 `repose`）出現不帶 material 的句內換座，或 carrier-swap 讓字的框／字級改變，也報。`jointChecks` 一律一句一動作 | `world-events-adapter.ts` `verifyWorldEvents` 開頭、`VISIBLE_COMPOSITIONS` |
| 被拒的句內候選仍留下原因（`reject(...)`：進句已構圖、沒有可靠詞界、hold 的空間等） | `world-events.ts` |

沒有禁止 line-grow 或其他 hold 的動畫（Codex B §3）。

**預設產品不受 B 影響**：排程器沒被要求時，composer 自己的 repose 照舊（例：chalkboard 的 `pace.repose: true`），預設指紋 seed 0 = `12ec6c83…`，與 phase 4c 相同（`out/research/q1-1109/hash-pairs/b-seed0.json`，commit e4680da）。

## 2. 規則 C：換色要有理由

| 條 | 實作 | 位置 |
|---|---|---|
| 1 連續唱句不同種 | 前一個**唱句**選中的 hold 種類直接排除（不是降順位），任何種類、包括 `line-ink-settle`；前一句沒有 hold（keep，或不是世界句）就解除。有其他合法候選依世界順位選，否則 keep。holds-first 與預設由 composer 落實（`lastBeat` 改為每句重設）；joint 由排程器以「前一句實際提交的 hold」落實，composite 路徑一併檢查。不會為了避開重複而開世界沒開的種類 | `lineplan-core.ts` `holdCandidatesOf`（`listed`／`order`）、`compose`；`world-events.ts` `jointLine` 的 `barred`／`refuse` |
| 2 理由白名單 | `swapCausesOf`：(i) **meaning**：該句的 meaning key 詞組，或 `evidenceCueId` 是該句、且字在句中的 moment；`cover` 為該詞組的字元範圍，被換色的 span 必須**就是**它或**完整包含**它（`swapSpan(text, key, cover)`；沒有合格段落時，若詞組本身 ≥ 2 字就用詞組本身）。key 存在但詞組不在該句、或 moment 沒有 `evidenceCueId`，都不算。(ii) **section**：song.json `sections` 中，類型與前一段不同，或 `|Δenergy| ≥ SECTION_ENERGY_STEP = 0.15` 的段落，其第一個唱句。(iii) **repeat**：去掉呼喊、只留字母數字並正規化後相同的句子，**第二次**出現（一組只一次，第三次以後不算）。順序 meaning → section → repeat，取第一個找得到 span 的。沒有理由 → `ink-swap` 不是候選 | `lineplan-core.ts` `swapCausesOf`、`SECTION_ENERGY_STEP`、`swapSpan` |
| 紀錄 | hold 上寫 `why: { kind, source, span, at }`；`source` 為 `key:<cue>`、`moment:<i>`、`section:<段落序>`、`repeat:<第一句 cue>` | `HoldPlan.why`、渲染資料 `world.beat.why` |
| 3 上限 | 每句最多一次（hold 本來就一句一個）；每個音樂段落最多 `SWAP_CAP = 2` 次，沿整首時間軸累計（composer 依段落計數；joint 依排程器已提交的 hold 計數），不在剪輯起點重設；沒有段落資料時整首共用 2 次 | `world-events.ts` `SWAP_CAP`、`sectionAt`；`lineplan-core.ts` `swapLine`／`spend` |
| 4 時間 | 錨點 = span 第一個字的 `charStarts`（只用 `charTimed` 的逐字時間）；只有落在該詞組演唱區間內、且距錨點 ≤ `SWAP_SNAP`（= `BEAT_SNAP` 0.12 秒）的拍點可吸附；兩者都還要過原本的閱讀窗（進句後 0.1 秒到句尾前、離換座／剪接的間隔）。沒有可靠逐字時間、或錨點不在閱讀窗內 → 不換色（`timing`），不回退到「句首後 N 秒」。`ink-swap` 在 `WORLD_BEATS` 本來就是 `stays: true`（維持到句尾） | `lineplan-core.ts` `swapAt` |
| 5 拒絕紀錄 | 每句 `beatRejects`（composer）與 joint 的 `outcome.holdRejects`（排程器）：`no-reason`／`repeat-kind`／`section-cap`／`timing`／`span`。`hold-plan-all.mts` 多報 `rejects`、`swapWhy`、`repeats`，**分母不變** | `hold-plan-all.mts`、`phase4c-report.mts` |
| verifier | `holdSequenceChecks`（併入 `verifyWorldEvents`）讀畫面：連續兩個唱句畫出同種 hold、`ink-swap` 沒有 `why` 或 `why.span` 與畫出的 span 不同、時間不在詞組演唱起點到 +0.12 秒內，都報 `pairs C`。段落上限需要歌曲段落，job 裡沒有，由計畫與報表檢查 | `world-events-adapter.ts` `holdSequenceChecks` |

`no-reason` 的定義：世界允許 `ink-swap`、調色盤讀得到、這句本來有可換的詞組，但沒有任何白名單理由。

## 3. 數字（改前 e78987a，改後 995210c；程式改動在 e4680da（B）與 134fe73（C））

### 3.1 四組盲測片段（`scripts/lyric-vj/pairs-rules.mts`，seed 0、Huninn、排程器開）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/pairs-rules.mts --out out/research/q1-1109/pairs-rules/pairs-{before,after}.json`（before 在 e78987a 跑）。

| | 改前 | 改後 |
|---|---|---|
| 大雪 art-deco holds-first，整首句內 `layout-seat`（計畫／畫面） | 14／14 | **0／0** |
| 同上，一句兩個可見構圖的句數 | 13 | **0** |
| 同上，90–150 秒窗內（句內換座／兩構圖句） | 9／8 | 0／0 |
| 大雪 art-deco joint，整首句內換座／兩構圖句 | 14／14 | 0／0 |
| 雙截棍 file holds-first，70–130 秒 ink-swap | **19** | **3**（全部有 `why`：section 1、repeat 2） |
| 同上，整首 ink-swap | 47 | 5（section 2、meaning 1、repeat 2） |
| 同上，窗內連續唱句同種 hold（整首） | 16（40） | **0（0）** |
| 同上，每段最多 ink-swap（整首） | 8 | **2** |
| 同上，窗內 hold 句數與種類 | 21：ink-swap 19、ink-run 2 | 14：**line-ink-settle 9**、ink-swap 3、ink-run 2 |
| 雙截棍 file holds-first 整首拒絕紀錄 | — | ink-swap：no-reason 36、timing 7、repeat-kind 3；line-ink-settle：repeat-kind 23 |
| card 大雪 60–120 holds-first ink-swap（窗內／整首） | 4／9 | 2／5（都是 repeat） |
| spy 大雪 135–190 holds-first ink-swap（窗內／整首） | 1／7 | 0／2 |
| contract（四組 × holds-first／joint） | 0 | 0 |

### 3.2 13 世界組（`measure-world-events.mts --seeds 0,1,2`，與 phase 4c 同片段：雙截棍 76–101、大雪 67–92；計畫層級、排除比例時間詞界）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts --seeds 0,1,2 --out out/research/q1-1109/pairs-rules/measure-{before,after}.json`（before 在 e78987a 的 detached worktree 跑）。OFF = 排程器關（`before` 欄，`planCutsPer10`），ON = 排程器開 holds-first（`wired` 欄，`planExclUnreliablePer10`）。seed 0：

| 組 | OFF 快／慢（改前 → 改後） | ON 快／慢（改前 → 改後） | ON seed 0/1/2 慢（改後） |
|---|---|---|---|
| 13 個 | 3.6／3.2 → 3.6／3.2 | 3.6／3.2 → **3.6／3.2** | 3.2／3.2／2.8 |
| 原五 | — | 3.6／4.0 → 3.6／**2.8** | 2.8／3.2／2.8 |
| 新八 | — | 3.6／3.2 → 3.6／3.2 | 3.2／3.2／3.0 |
| 全 45 | — | 3.6／3.2 → **3.2**／3.2 | — |
| art-deco | 3.6／3.2 → 3.6／3.2 | 4.0／4.0 → 3.6／3.2 | — |

下降來自 B：原五世界的慢歌過去靠「換句換位＋句中再換」超過一句一件的上限（art-deco、notebook、blueprint）；全 45 快歌的下降來自 `stillLines`（開關被要求時，沒宣告能力的世界也不再有 composer 的句內 repose）。沒有為了補回數字做任何調整。contract：改前 0、改後 0。

### 3.3 Q2 覆蓋率（`hold-plan-all.mts`，5 首 × 45 世界，seed 0，舊分桶、舊分母）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-plan-all.mts > out/research/q1-1109/pairs-rules/planall-{before,after}-off.json`；`VJ_WORLD_EVENTS=1` 同上 `-on`。

| 長度 | OFF 改前 | **OFF 改後** | ON 改前 | **ON 改後** |
|---|---|---|---|---|
| 0.6–1.5 秒 | 163/495 = 32.9 % | **119/495 = 24.0 %** | 32.9 % | **24.0 %** |
| 1.5–3 秒 | 2994/5445 = 55.0 % | **2388/5445 = 43.9 %** | 55.8 % | **45.8 %** |
| > 3 秒 | 3318/4815 = 68.9 % | **2969/4815 = 61.7 %** | 70.6 % | **67.4 %** |

舊 Q2 目標（30 %／80 %）不是這次的驅動指標（Codex C），照實列下降。hold 種類（OFF）：`ink-swap` 1231 → **195**（理由：meaning 77、section 41、repeat 77）；`line-ink-settle` 784 → **1389**（+605）；`line-grow` 1670 → 1288。總 hold 6475 → 5476。整首連續同種 hold：0。

拒絕紀錄（OFF，整批）：ink-swap `no-reason` 2113、`timing` 822、`span` 253、`repeat-kind` 94、`section-cap` 21；所有種類 `repeat-kind` 共 3104。ON：no-reason 2113、timing 695、span 253、repeat-kind 108、section-cap 26。

### 3.4 預設產品只因 C 改變

預設指紋 seed 0（`default-hash.mts`）：B 之後仍是 `12ec6c83…`；C 之後 `f8e0b00e…`（225 組全變，因為 hold 變了）。把每個 job 的 `beat*` 欄與事件表的 `holds` 拿掉再比：225 組中 220 組與改前位元組相同，其餘 5 組只差「hold 部分壓到交接窗」的警告紀錄（同樣來自 hold 改變）。排程器的 `--q1` 指紋：`aa59d72b…`。兩個位元組釘選測試改指向 `out/research/q1-1109/hash-pairs/c-seed0.json`、`c-q1.json`（原釘選檔仍在磁碟上）。

### 3.5 閘門（`style-gate-reading.mts`，art-deco、file、card、spy，5 首，`--baseline scripts/lyric-vj/style-gate-rules.baseline.json`）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/q1-1109/pairs-rules/gate-off --baseline … art-deco file card spy`；`VJ_WORLD_EVENTS=1` 同上 `gate-on`。

| | 時刻 | fails | contract | rule regressions |
|---|---:|---:|---:|---:|
| 排程器關（134fe73） | 1956 | 0 | 0 | 0 |
| 排程器開（995210c，程式同 134fe73） | 1956 | 0 | 0 | 0 |

另外：5 首 × 45 世界 × holds-first／joint 共 450 個排程器開的 job，final check 警告 0（含新的 pairs B／C 檢查）。

## 4. 測試

`npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json` 通過；`npx ng test --watch=false`：**141 檔／1721 測試全過**（原 140／1706）。改動的期望各自對應規則：

- B：`world-events.spec.ts` 句內時鐘的測試改用 carrier-swap 世界（同字同框、只換載體），新增「宣告 in-line 也不排、移動字的 carrier-swap 不提供」；`world-events-wiring.spec.ts` 同理，`notebook／art-deco／blueprint` 實歌測試改為「句內沒有 layout-seat、剩下的 carrier-swap 字不動」（拿掉「至少一次句內切換」，原因見 §5）；篡改測試改為「畫出句內換座／計畫裡植入句內 layout-seat 都被點名」；`world-events-3b.spec.ts` chalkboard 擦除改用 seed 1（seed 0 的那次是跟在前一句的句內換座後面，B 之後不再發生）；`world-events-4c.spec.ts` 的 art-deco 兩動作測試改為「每個世界一句一件」。
- C：`hold-events.spec.ts`、`world-events-4c.spec.ts` 直接呼叫 `beatOfLine`／`holdCandidatesOf` 期待 `ink-swap` 的地方，補上理由與逐字時間；「剪接點」測試接受「詞組時間落在剪接上 → 不換色、記 timing」。新檔 `pairs-rules.spec.ts`（14 個）：理由白名單三類與反例、時間錨點與吸附、meaning span 必含詞組、段落上限、重複種類排除、joint 選擇器的兩條、雙截棍 file 三條路徑（預設／holds-first／joint）的整首檢查，與 `holdSequenceChecks` 的三種篡改。
- 指紋：`world-events-4a.spec.ts`、`world-events-4c.spec.ts` 的位元組釘選改指向本次的指紋檔（§3.4）。

## 5. 限制（照實）

- **（已由 §7 解除）整句換墨變多。** C 的白名單只約束 `ink-swap`。被拒的片語換色，在世界順位上常由 `line-ink-settle`（整句一起換到第二墨色）接手；file 70–130 秒 21 句裡 9 句是整句換墨，因為「連續不同種」讓它與 keep 或其他種類交替。整批 `line-ink-settle` 784 → 1389。業主覺得「隨便換」的若是「顏色在固定時間點變」，整句換墨可能仍會被看成同一件事；要不要把同樣的理由規則延伸到整句換墨，需要業主看片後決定，這次沒有自行延伸。
- **段落能量門檻 0.15 是提案值**，只依兩首歌的段落能量分布選定，沒在影片上量；雙截棍前五段都被標成 chorus，類型變化只出現在 chorus → verse／bridge。
- **meaning 理由很少成立**：整首 45 世界 × 5 首只有 77 次。推論（未逐句量）：meaning 詞組常在句首，演唱起點早於進句結束，落不進閱讀窗；`timing` 拒絕 822 次可能多半是這個原因。要確認需要逐句列出被拒 span 的錨點與 `entered`。
- **重複句規則依文字相同判斷**，不是依音樂分析的樂句；呼喊不同的同一句會被視為同一組，歌詞稍有差異的重複不會被認出。
- **段落上限不在畫面檢查裡**：job 不帶歌曲段落，`holdSequenceChecks` 只查連續同種與 `why`／時間；段落上限由計畫、`pairs-rules.spec.ts` 與 `hold-plan-all.mts` 檢查。
- **同頁座位（`+second`、`+margin`、`+detail`）幾乎用不到了**：它們原本主要是句內換座的目標；B 之後只有在換句時恰好被選中才會出現，兩首測試歌 seed 0 都沒有。
- **預設產品裡的 composer repose 沒有動**：排程器沒被要求時，chalkboard 等 `pace.repose: true` 的世界仍會在句中換 set（預設行為，依交辦「預設只因 C 改變」保留）。業主的「同一句不換位」若要套到預設產品，需要另外決定。
- line-grow 是否該在慢歌 art-deco 降順位（Codex A 的待驗假說），這次沒有處理；改後 art-deco 的 line-grow 因「不連續同種」變成隔句出現（窗內 15 → 7）。

## 6. 給業主的片子

`~/Desktop/vj/output/換色與句內_2026-11-10/v1/`：四組，左 = 業主盲看時那支 holds-first（`pairs-4c/1-甲、2-乙、3-乙、4-甲`），右 = 同條件（seed 0、Huninn、排程器開、holds-first、同時間窗）在本 commit 重新渲染。治療檔與清單：`out/research/q1-1109/pairs-rules/clips/`（`pairs-rules-clips.mts`、`run.sh`，一次一支渲染，metadata 去除）。spy 是回歸對照。

## 7. 擴充：所有顏色變化都要理由（694c32b）

**推論（不是 Codex 原文）**：業主原話是「顏色變換要合理，不是隨便換」，指的是任何顏色變化，不只片語換色。所以把 C 擴充到整句換墨（`line-ink-settle`）。這是依業主措辭所做的延伸，Codex C 的白名單原本只寫 `ink-swap`。§5 第一條限制因此解除。

| 實作 | 位置 |
|---|---|
| `COLOUR_HOLDS` = `ink-swap`、`line-ink-settle`；按鍵色的脈衝（ink-run、light-sweep、roll、beat-punch：換過去再換回來）不算 | `lineplan-core.ts` `COLOUR_HOLDS` |
| 整句換墨只在有理由的句子成為最後備援，理由同樣是 meaning／section／repeat，`why` 記在 hold 上（沒有詞組時 `span` 為整句）；沒有理由的句子 keep，不再整句換墨 | `holdCandidatesOf` `settleCause`、`fallback` |
| 兩種顏色變化共用每段 2 次的額度（composer 的 `spend`、joint 選擇器的 `colour`） | `lineplan-core.ts`、`world-events.ts` `jointLine` |
| 時間：meaning 理由 → 該詞組的演唱起點（或詞組內、距離 ≤ 0.12 秒的拍點），只用可靠逐字時間；section／repeat 理由沒有詞組 → 閱讀入場後的第一個拍點（在閱讀窗內、離換座／剪接夠遠）；找不到就不換 | `settleAt` |
| verifier：整句換墨沒有 `why` 報錯；有詞組時檢查時間 | `holdSequenceChecks` |
| joint 篡改測試從 document 換到 card（document 的 hold 幾乎全是整句換墨，擴充後 joint 下 0 個） | `world-events-4c.spec.ts` |

**數字（694c32b）**

- 雙截棍 file holds-first 70–130 秒（21 句）：ink-swap 19 → 3 → **2**；整句換墨 0 → 9 → **2**；keep 0 → 7 → **15**（改前 → §3 版 → 本版）。4 個顏色變化都有 `why`（section 1、repeat 3），每段最多 2 次，連續同種 0。整首：ink-swap 4、整句換墨 4、keep 39／53。窗內被拒：`ink-swap` no-reason 12、section-cap 3、timing 2、repeat-kind 2；`line-ink-settle` no-reason 12、section-cap 3、timing 2。
- card 60–120：ink-swap 2、整句換墨 2、keep 2；spy 135–190：整句換墨 1、keep 4；art-deco 不變。
- 13 世界組 seed 0：OFF 3.6／3.2、ON 3.6／3.2（不變）；原五 ON 3.6／2.8，全 45 ON 3.2／3.2。contract 0。
- Q2 覆蓋率（舊分母）OFF：0.6–1.5 秒 **11.9 %**（59/495）、1.5–3 秒 **27.1 %**（1477/5445）、> 3 秒 **59.0 %**（2841/4815）；ON：11.9 %、28.8 %、64.4 %。hold 總數 6475 → 4377（OFF）。ink-swap 181、整句換墨 1389 → **304**。
- 被拒（OFF，整批）：`line-ink-settle` no-reason 3205、timing 945、section-cap 173、repeat-kind 102；`ink-swap` no-reason 2113、timing 797、span 253、section-cap 147、repeat-kind 68。顏色變化的理由：ink-swap meaning 77、section 41、repeat 63；整句換墨 section 164、repeat 114、meaning 26。連續同種 0。
- 預設產品：仍然只因 hold 改變。225 組把 hold、`holds` 表與 hold 相關警告拿掉後，與 e78987a 全部相同。新指紋 seed 0 `4082184a…`、`--q1` `41415d9a…`（`hash-pairs/c-seed0.json`、`c-q1.json`，覆蓋 §3.4 的 `f8e0b00e…`／`aa59d72b…`）。
- 閘門（art-deco、file、card、spy，5 首）：見下表。450 個排程器開的 job，final check 0。
- 測試：141 檔／**1722** 全過；tsc app／spec 通過。

| 閘門 | 時刻 | fails | contract | regressions |
|---|---:|---:|---:|---:|
| 排程器關（694c32b） | 1956 | 0 | 0 | 0 |
| 排程器開（694c32b） | 1956 | 0 | 0 | 0 |

**片子**：`~/Desktop/vj/output/換色與句內_2026-11-10/v2/`。第1組計畫沒變，沿用 v1；第2–4組重新渲染（`out/research/q1-1109/pairs-rules/clips2/`）。

**新的限制**：Q2 覆蓋率大幅下降（1.5–3 秒 55 % → 27 %），因為很多世界的備援 hold 原本就是整句換墨（document 幾乎全是）。document 在 joint 下沒有 hold，業主看到的 document 會比以前安靜很多。section／repeat 理由的整句換墨落在入場後第一拍，不是某個詞，這是「沒有詞組時」的人為選擇，沒有在影片上驗證過。
