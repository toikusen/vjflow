# 預設產品也不再句內換座（2026-11-10，含審查後修正）

**結論。** 排程器關閉（今天的預設產品）時，composer 自己的 `repose` 會讓正在唱的句子換到另一個 set，位置、大小、斷行都跟著變。現在任何路徑上，一句從第一個唱出的字到句尾都留在同一個 set；set 只在換句時改變。付費導演共用同一個 composer，所以付費輸出也一起改了。

自己的掃描（45 世界 × 5 首 × seed 0–2）：

- 排程器關：在唱的時候換座的句子 **6025 → 0**，換座次數 8798 → 0；另有 384 次換 set 但字框不變，也 → 0。
- holds-first 開：0 → 0。
- 付費（spy、card、chalkboard × 5 首）：202 句 → **0**。
- spy 大雪：每個 seed 45 次、31 句，與審查數字相同 → 0。

句中「只換地面、字不動」的 turn 現在只在字站在自己載體上時保留（每頁的頁面、卡片、底板都要留著），三個 seed 合計 9182 → 2794。閘門 off／on：contract 0，regressions 0，turn 讀取 922 次、0 個問題。排程器開的計畫完全不變（`--q1` 指紋 `aef5d3f3…`）。

程式：`1d27374`（拿掉句內換 set）、`af1559c`（turn 規則、final check、閘門 turn 規則）、`e020521`（turn 只留在有載體的字下面）。

業主原話與卡：`docs/design-bar/cards/2026-11-10-no-inline-line-move.md`（「同一句還沒唱完字幕突然從下面變到上面」）、`2026-11-10-motivated-colour-pass.md`（業主的「可以」也回答了預設產品要禁）。排程器路徑上同一條規則（B）見 `docs/research/2026-11-10-pairs-rules.md` §1。審查：`out/research/q1-1109/no-inline/review.md`。

## 1. 規則

一句歌詞從**第一個唱出的字**到**句尾**，座位（seat）、錨點、基本字級、斷行與整個字塊都不變。換 set 只在句與句的交界（或兩句之間）發生。

句中可以保留的變化：

- 只換載體、字不動（art-deco `poster-panel` 的 `carrier-swap`，`sameWords`）；
- hold 動畫（`line-grow`、換墨等），錨點不動；
- 字不動時背後地面的變化（turn），但要符合 §3 的條件；
- Q4 在句縫的交接。

## 2. 原本在哪裡

`src/app/lyric-vj/lineplan-core.ts`（46d2b53）：

- `:1686`：排程器沒接手、也沒被要求（`!W.scheduled && !W.stillLines`）時，`reposeOf` 給出句中換 set 的時間與目標 set，寫進 `world.repose`（`:1731`）。
- `:1692`：同時插入一個 `repose: true` 的 cut，換下一個地面。
- 渲染器 `render/world-layout.ts:437` `poseAt` 依 `repose` 把整句搬到新 set 重排。這是唯一的句內換版位路徑，獨立審查已確認。
- `pace.repose: true` 的 20 個世界的長句都會這樣。

付費路徑：`scripts/lyric-vj/linedirect-core.mts:599` 經 `paid-world.mts:48` `worldPoolOf` 呼叫同一個 `composePlan`，所以付費也有一樣的句內換座。

`reposeOf` 沒有承擔任何換行或放不下的修正（推論，依程式碼）：它只看句長、`pace.repose` 與可用座位，用 `roll` 挑另一個 set。所以沒有東西需要「移到進句時」。

## 3. 改法

**`1d27374`：拿掉句內換 set。**

- `lineplan-core.ts:1697` 的 `turns`：`reposeOf` 照舊算出時間，但不再寫 `world.repose`，只留 cut。
- hold 不再避開換 set（`:1734` 傳空的 `repose`），`noGrow` 條件也拿掉。
- 排程器路徑不變。

**`af1559c`、`e020521`：turn 要保住字讀得到的一切。**

獨立審查發現，card 的 turn 會把 `card/pair` 自己的頁（它就是地面）換成 `card/table`。結果下面那張紅卡消失，白字落在米色上，25 個 turn 中有 13 個字的像素掉到 70 % 以下（tsuzuki c011：2161 → 430 px）。

新規則在 `src/app/lyric-vj/render/turn-rule.ts:39` `turnTakes`，由 composer（`lineplan-core.ts:1705–1712`）和 final check 共用。一個 turn 只有全部符合下列條件才保留：

1. set 有自己的頁（`pageOf`）時，地面只能是那一頁。在實務上等於不換。
2. 新地面不能是另一個 set 的頁。否則那個 set 的載體會跑到這句字下面，例如 card 換到 `card/fan`。
3. 這句的每一部分都站在自己的載體上（`turn-rule.ts:44`，hold-room `carrierSlots`）。split 的小段、放大字的第一個 pose 都站在地面上，所以不算。
   - 原因：字直接站在地面上時，新地面畫在字下面的是圖（引擎從像素取 `backdropAt`），計畫讀不到。
   - `af1559c` 的閘門 turn 規則證明了這點：dark-glitch snow c003（low 0.46 → 0.82）、neon-stage choroin c036／c041（字像素 3191 → 1657、9467 → 3752）、silk-cold nun c002（low 0.14 → 0.59）、silent-film snow c003（放大字站在地面上，low 0.01 → 0.51）。`e020521` 因此加上這一條。
4. 墨色在新地面上不比原本差（`groundsUnder`、`contrast`）；原本 ≥ 4.5:1 的，之後也要 ≥ 4.5:1。

其他改動：

- `WorldPool` 新增 `pages`、`fixedInk`（`style-world.ts:156–157`），composer 用它們算這句的墨色（`lineInkOf`，與 `colourChangeSeen` 相同的解法）。
- **final check**：`world-events-adapter.ts:502` `turnChecks(job, world, turnsAt)` 在畫好的 job 上，對每個句內 turn 跑同一條規則，任何路徑都可以用。
- **閘門規則**：`scripts/lyric-vj/style-gate-reading.mts:45` `TURN`。
  - 每個句內 turn 在 turn 前 0.12 秒、turn 後 0.2 秒各讀一次（on／off 像素）。字像素少於原本 70 %，或 low share 超過 0.5 且比原本高 0.05 以上，就失敗。
  - `turnChecks` 點名的也失敗。兩者都列在 `turns`，exit 非零。
  - 在 1d27374 上跑 card＋ink-wash：35 個問題（card 的 22 個 final check、13 個像素），抓得到審查發現的問題。改後 0 個。
  - 審查提到的 ink-wash snow c003（7.43 秒），turn 前已是 low 0.59–0.69，turn 後 0.55，不是 turn 造成的，閘門規則不算它。

## 4. 數字（改前 46d2b53，改後 e020521）

### 4.1 句內換座與 turn 掃描（`scripts/lyric-vj/inline-reseat-scan.mts`）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/inline-reseat-scan.mts --paid spy,card,chalkboard --out out/research/q1-1109/no-inline/r2/scan-before.json`（在 46d2b53 的 detached worktree 跑）；改後同上，寫到 `r3/scan-after.json`。

- 45 世界 × 5 首 × seed 0–2，Huninn。off = 排程器關，on = holds-first，paid = 付費 composer（沒有導演答覆、每句用 composer 的配方，`worldPoolOf`／`worldTreatment`）。
- 每句依序走過它畫出的 set，用渲染器自己的量法（`seatIn` → `laidSeat`）排版，判斷字框與字級有沒有變（`sameWords`）。
- 另外對每個保留的 turn 跑 `turnChecks`。改前的程式沒有 `turnChecks`，所以那一欄只有改後的數字。

| | off 改前 | **off 改後** | on 改前 | on 改後 | paid 改前 | **paid 改後** |
|---|---:|---:|---:|---:|---:|---:|
| job | 675 | 675 | 675 | 675 | 15 | 15 |
| 世界句 | 32626 | 32626 | 32626 | 32626 | 657 | 657 |
| 在唱的時候換座的句子 | 6025 | **0** | 0 | 0 | 202 | **0** |
| 換座次數（字動） | 8798 | **0** | 0 | 0 | 273 | **0** |
| 換 set 但字框字級不變 | 384 | **0** | 0 | 0 | 27 | **0** |
| 句內 turn | 9182 | **2794** | 0 | 0 | 300 | **2** |
| turnChecks 點名 | — | **0** | — | 0 | — | 0 |

改前 off 換座的 20 個世界（換座句數，3 個 seed 合計）：silk-cold 367、riso 341、silk 329、dark-glitch／terminal／led-board／ink-wash／silent-film 各 315、gothic-lolita 313、neon-stage 312、ukiyoe 312、spy 307、papercut／paper-lantern／chiyogami／woodcut／aizome／crayon 各 306、chalkboard 288、card 45。

改後 seed 0 保留的 turn 有 948 個，都在字有載體的世界：gothic-lolita 130、led-board 110、silent-film 110、papercut 93、ukiyoe 89、neon-stage 76、ink-wash 70、chiyogami 67、paper-lantern 50、crayon 51、dark-glitch 43、aizome 24、woodcut 17、terminal 16、card 2。spy、chalkboard、silk、silk-cold、riso 的字直接站在地面上，turn 是 0。

### 4.2 預設指紋（`default-hash.mts`，45 個 offered 世界 × 5 首）

| | 改前 46d2b53 | 1d27374 | **e020521** |
|---|---|---|---|
| seed 0 | `69af54b8…` | `50823875…` | `470e5709…` |
| seed 1 | `441f17ab…` | `85789e1b…` | `8cd12f1e…` |
| seed 2 | `37fae52a…` | `227d353b…` | `2b81e0d6…` |
| `--q1` | `aef5d3f3…` | `aef5d3f3…` | **`aef5d3f3…`（不變）** |

- 每個 seed 都是 99／225 列改變（相對 46d2b53），剛好是原本有句中換座的 20 個世界：aizome、card（5 首中 4 首，snow 不變）、chalkboard、chiyogami、crayon、dark-glitch、gothic-lolita、ink-wash、led-board、neon-stage、paper-lantern、papercut、riso、silent-film、silk、silk-cold、spy、terminal、ukiyoe、woodcut。
- 其他 25 個世界每一列都相同。
- 檔案：`out/research/q1-1109/no-inline/hash-before-*.json`、`r3/hash-after-*.json`。
- 改變的列裡，job 的差異只有三種：`world.repose` 拿掉；hold 跟著變（不必再避開換 set）；地面 turn 依 §3 減少。

### 4.3 13 世界組中位數（`measure-world-events.mts --seeds 0,1,2`，phase4-groups）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts --seeds 0,1,2 --out out/research/q1-1109/no-inline/{measure-before,r3/measure-after}.json`。

- OFF = 排程器關（`medianBefore`，畫出的構圖切換，句內換座算在內）。
- ON = holds-first（`medianWiredPlanExclUnreliable`，headline）。
- 單位：每 10 秒。

| 組 | seed | OFF 快 | OFF 慢 | ON 快 | ON 慢 |
|---|---|---|---|---|---|
| 13 個 | 0 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |
| 13 個 | 1 | 3.6 → 3.6 | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |
| 13 個 | 2 | 3.6 → 3.6 | 3.2 → **2.8** | 3.6 → 3.6 | 2.8 → 2.8 |
| 原五 | 0 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 2.8 → 2.8 |
| 新八 | 0／1／2 | 3.8／3.6／3.6 → **3.4** | 3.2／3.2／3.2 → 3.2／3.2／3.0 | 3.6 → 3.6 | 不變 |
| 全 45 | 0 | 4.0 → **3.2** | 3.2 → 3.2 | 3.2 → 3.2 | 3.2 → 3.2 |
| 全 45 | 1／2 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |

- OFF 下降：句內換座以前被算成構圖切換。turn 不算構圖切換，所以 turn 減少不影響這張表（與 1d27374 的數字相同）。
- ON 全部不變；contract 改前改後都是 0。
- 沒有為了補回數字做任何調整。

### 4.4 Q2 覆蓋率（`hold-plan-all.mts`，5 首 × 45 世界，seed 0，舊分母）

| 長度 | OFF 改前 | **OFF 改後** | ON 改前 | ON 改後 |
|---|---|---|---|---|
| 0.6–1.5 秒 | 59/495 = 11.9 % | **11.9 %** | 11.9 % | 11.9 % |
| 1.5–3 秒 | 1444/5445 = 26.5 % | **1509/5445 = 27.7 %** | 28.0 % | 28.0 % |
| > 3 秒 | 2840/4815 = 59.0 % | **3087/4815 = 64.1 %** | 64.3 % | 64.3 % |

- OFF 的 hold 總數 4343 → 4655。原因是 hold 不必再避開換 set 與被拿掉的 turn。
- 換色仍全部有理由（`ink-swap` 131 → 145、`line-ink-settle` 320 → 346）；連續同種 hold 仍是 0。
- ON 完全不變。

### 4.5 閘門（`style-gate-reading.mts`，改了計畫的 20 個世界，5 首，e020521）

`... style-gate-reading.mts --out out/research/q1-1109/no-inline/r3/gate-off --baseline scripts/lyric-vj/style-gate-rules.baseline.json aizome card chalkboard chiyogami crayon dark-glitch gothic-lolita ink-wash led-board neon-stage paper-lantern papercut riso silent-film silk silk-cold spy terminal ukiyoe woodcut`；`VJ_WORLD_EVENTS=1` 同上 `gate-on`。

| | 時刻 | fails | contract | rule regressions | 讀過的 turn | turn 問題 |
|---|---:|---:|---:|---:|---:|---:|
| 排程器關 | 9780 | **0** | 0 | 0 | 922 | **0** |
| 排程器開 | 9780 | **1** | 0 | 0 | 0 | 0 |

- 排程器開的 1 個 fail：chiyogami つづく c013 158.05 秒「あなたを想うでしょう」，畫面上沒有字（share 0）。
  - **改前就有**：排程器開的計畫改前改後位元組相同。在 46d2b53 單跑，同一句同一時刻同樣 fail（`no-inline/gate-on-chiyo-base/`）。
  - 以前的閘門只跑四個世界，所以沒看到。這次沒有處理，列為待辦。
- 規則計數沒有一項比基準差；已接受的照舊（chiyogami cross 38/489、ukiyoe low 2/489）。
- 中間版本 af1559c 的 off 閘門找到 5 個 turn 問題（§3 第 3 條），e020521 修掉。

## 5. 測試

- `npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json` 通過。
- `npx ng test --watch=false`：**142 檔／1727 測試全過**。

新檔 `no-inline-reseat.spec.ts`：

1. spy、chalkboard、silk 的長句合成歌：每句只有一個 set；這三個世界的字站在地面上，turn 是 0。大雪 silent-film 的 turn 保留，而且每一個都在有載體的 set 下面。
2. spy 大雪 seed 0–2：沒有一句帶 `repose`，事件表沒有句內事件。
3. card/pair：
   - `turnTakes` 拒絕 card/pair 換到 card/table（頁）、card/main 換到 card/fan（別人的頁）、spy/low-slash（站在地面上）和放大字；接受 card/main 在自己的底板上換地面。
   - つづく 上沒有 card/pair 句帶 turn；`turnChecks` 為 0。
   - 在 c011 植入一個換到 card/table 的 section，final check 會點名它。

改期望：

- `world-shared.spec.ts`：慢歌長句改為「每句一個 set、silk-cold 沒有 turn」。
- `world-events-wiring.spec.ts`：付費池改為「不被排程、句子不換 set、chalkboard 沒有 turn」。

付費測試：`npx tsx --tsconfig tsconfig.json --test scripts/lyric-vj/paid-world.test.mts` 5／6 通過。沒過的 `worldCandidates`（期望 45、得到 1）在 46d2b53 也一樣沒過，是既有問題。`linedirect.test.mts`、`lineplan.test.mts` 全過。

## 6. 給業主的片子

- **v4**（1d27374，只看 spy）：`~/Desktop/vj/output/換色與句內_2026-11-10/v4/`。
- **v5**（e020521）：`~/Desktop/vj/output/換色與句內_2026-11-10/v5/`。左 = 46d2b53（今天的預設），右 = e020521；seed 0、Huninn、排程器關。
  - `spy_三年後的大雪_改前改後.mp4`（135–190 秒）：spy 的計畫在 e020521 又變了（turn 拿掉），所以右邊重新渲染，左邊沿用 v4 的那支。
  - `card_世界のつづき_改前改後.mp4`（130–185 秒）。
- 渲染：`out/research/q1-1109/no-inline/clip5/`、`clip5-spy/`（`run.sh`，一次一支、`--workers 1`、metadata 去除）。

抽幀確認：

- card：9.2／9.8 秒、34.3／34.9 秒，左邊兩張疊卡跳成一張大卡、字縮小；右邊疊卡留著，字不動。
- spy：1.3／1.7 秒、5.3／5.8 秒，左邊跳位；右邊字與背景都不動。
- card 34.5 秒右邊第二行（紅卡上）滾過一道紫色、難讀：這是 `roll` hold 的鍵色沒有對 split 載體檢查。左邊 33.5 秒也一樣，是改前就有的問題，這次沒處理，已寫在 說明.md。

## 7. 限制（照實）

- **turn 大幅減少**：三個 seed 合計 9182 → 2794。字直接站在地面上的世界（spy、chalkboard、silk、silk-cold、riso 等）長句中間不再換地面。2026-11-04 給慢歌加的「詞界換景」（Motion Prompt cross-cutting）在這些世界也就沒了。這是依「計畫讀不到地面上的圖」所做的保守選擇，沒有在片子上單獨給業主看過。
- **閘門的 turn 規則用的門檻是定值**（70 % 像素、low 0.5／+0.05），只依審查的 card 數據與這次的 5 個問題選定，沒有和業主標記校準過。
- **一般的拍點 cut**（不是 turn 的句內地面變化）不在 `turnChecks` 與閘門 turn 規則內；它們是改前就有的行為，這次沒動。用粗略的地面模型對全部句內地面變化跑同一條規則，會點名大量改前就有的 cut，那需要另外處理。
- **掃描是計畫層級的幾何**；像素只在閘門的 turn 規則與兩支片子裡看。
- OFF 的構圖切換中位數下降（全 45 快歌 seed 0：4.0 → 3.2），因為句內換座以前被算進去。
- hold 變多（OFF seed 0：+312），只在這 20 個世界；新的 hold 仍受換色理由、每段兩次、連續不同種的規則約束。
- `pace.repose` 現在只代表「長句中間可以換地面（字有載體時）」，名字沒改。
- 排程器開的 chiyogami つづく c013 fail，以及 card/pair 的 `roll` 鍵色，都是改前就有的問題，列為待辦。
