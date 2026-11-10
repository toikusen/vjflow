# 預設產品也不再句內換座（2026-11-10）

**結論。** 排程器關閉（今天的預設產品）時，composer 自己的 `repose` 會讓正在唱的句子換到另一個 set（位置、大小、斷行都變）。現在任何路徑上，一句從第一個唱出的字到句尾都留在同一個 set；set 只在換句時改變。自己的掃描（45 世界 × 5 首 × seed 0–2）：排程器關，在唱的時候換座的句子 **6025 → 0**（換座 8798 次 → 0；另有 384 次換 set 但字框與字級不變，也一併 → 0）；holds-first 開 **0 → 0**。spy 大雪每個 seed 45 次換座、31 句（與獨立審查的數字相同）→ **0**。排程器開的計畫完全不變（`--q1` 指紋 `aef5d3f3…` 改前改後相同）。程式：`1d27374`。

業主原話與卡：`docs/design-bar/cards/2026-11-10-no-inline-line-move.md`（「同一句還沒唱完字幕突然從下面變到上面」）、`2026-11-10-motivated-colour-pass.md`（「可以」也回答了預設產品要不要禁：要禁）。排程器路徑上的同一條規則（B）見 `docs/research/2026-11-10-pairs-rules.md` §1。

## 1. 規則

一句歌詞從**第一個唱出的字**到**句尾**，座位（seat）、錨點、基本字級、斷行與整個字塊都不變。換 set 只能發生在句與句的交界（或兩句之間）。

不算換座、照舊保留的：

- 只換載體、字不動的變化（art-deco `poster-panel` 的 `carrier-swap`，`sameWords` 保證字框與字級相同）；
- hold 動畫（`line-grow`、換墨等），錨點不動；
- 字不動時，背後地面（ground）的變化；
- Q4 在句縫的交接。

## 2. 原本在哪裡

`src/app/lyric-vj/lineplan-core.ts`（改前 46d2b53）`:1686`：世界句在排程器沒接手、也沒被要求（`!W.scheduled && !W.stillLines`）時，呼叫 `reposeOf` 取得「句中換到別的 set」的時間與目標 set，寫進 `world.repose`（`:1731`），同時在那個時間插入一個 `repose: true` 的 cut，換下一個地面（`:1692`）。渲染器（`render/world-layout.ts` `poseAt`、`restRects`）依 `repose` 把整句搬到新 set 的版位重排。宣告 `pace.repose: true` 的世界（spy、chalkboard、silk、silk-cold、riso 等 20 個）長句都會這樣。排程器開時 `stillLines` 早已關掉這條路；排程器關時沒有。

`reposeOf` 本身沒有承擔任何修正（推論，依程式碼）：它只看句長、`pace.repose` 與可用座位，用 `roll` 挑另一個 set。句子太長、換行等由進句時的 set 決定，換座不是為了讓長句放得下。所以這次沒有東西需要「移到進句時」。

## 3. 改法（`1d27374`）

- `lineplan-core.ts:1692` `turns`：`reposeOf` 照舊算出長句中間的時間點，但**只留下 cut**（地面在字後面換），不再把目標 set 寫進 `world.repose`。句子整句留在自己的 set。cut 的時間、地面輪替、「接近 repose 的拍點 cut 讓位」都與改前相同，所以畫面的換景節奏不變，只是字不動。
- hold 不再需要避開「換 set」：`beatOfLine`／`holdCandidatesOf` 的 `repose` 參數傳空（`:1719`）；地面 cut 本來就在 `cutsAt` 裡，hold 照舊避開它。原本「句中會換到放不下放大的 set → 不准 line-grow」的 `noGrow` 條件拿掉（沒有第二個 set 了）。
- 排程器路徑（`W.scheduled`、`W.stillLines`）一行都沒改。
- `stillLines` 與 `reposeOf` 的說明改成新的意思。`pace.repose` 留著：它現在只決定長句中間要不要換地面。

## 4. 數字

### 4.1 句內換座掃描（`scripts/lyric-vj/inline-reseat-scan.mts`）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/inline-reseat-scan.mts --out out/research/q1-1109/no-inline/scan-{before,after}.json`（before 在 46d2b53 的 detached worktree 跑）。45 世界 × 5 首（hold-plan-all 同一組）× seed 0–2，Huninn；off = 排程器關，on = holds-first（`worldEvents: true`）。每句依序走過它畫出的 set（自己的 `set`，再每個 `repose`），用渲染器自己的量法（`seatIn` → `laidSeat`）排版；在第一個唱出的字（`charStarts`）到句尾之間換 set、而字框或字級改變（`sameWords` 不成立）就算一句「在唱的時候換座」。

| | off 改前 | **off 改後** | on 改前 | **on 改後** |
|---|---:|---:|---:|---:|
| job | 675 | 675 | 675 | 675 |
| 世界句 | 32626 | 32626 | 32626 | 32626 |
| 在唱的時候換座的句子 | 6025 | **0** | 0 | **0** |
| 換座次數（字動） | 8798 | **0** | 0 | **0** |
| 換 set 但字框字級不變（沒有 material） | 384 | **0** | 0 | 0 |
| 第一個字唱出前換 set | 0 | 0 | 0 | 0 |

改前 off 的 20 個世界（換座的句數，3 個 seed 合計）：silk-cold 367、riso 341、silk 329、dark-glitch／terminal／led-board／ink-wash／silent-film 各 315、gothic-lolita 313、neon-stage 312、ukiyoe 312、spy 307、papercut／paper-lantern／chiyogami／woodcut／aizome／crayon 各 306、chalkboard 288、card 45。改後剩下 0 件，沒有需要逐件說明的例外。

### 4.2 預設指紋（`default-hash.mts`，45 個 offered 世界 × 5 首）

| | 改前 | 改後 |
|---|---|---|
| seed 0 | `69af54b8…` | `50823875…` |
| seed 1 | `441f17ab…` | `85789e1b…` |
| seed 2 | `37fae52a…` | `227d353b…` |
| `--q1`（排程器開） | `aef5d3f3…` | **`aef5d3f3…`（相同）** |

每個 seed 都是 99／225 列改變，剛好是 4.1 的 20 個世界：aizome、card（5 首中 4 首）、chalkboard、chiyogami、crayon、dark-glitch、gothic-lolita、ink-wash、led-board、neon-stage、paper-lantern、papercut、riso、silent-film、silk、silk-cold、spy、terminal、ukiyoe、woodcut（其餘各 5 首）。其他 25 個世界每一列都相同。檔案：`out/research/q1-1109/no-inline/hash-{before,after}-s{0,1,2}.json`、`-q1.json`。

改變的列裡，job 的差異（seed 0 逐欄比對）只有：`world.repose` 拿掉（2009 句）；hold 跟著變（186 句從 skip 變成有 hold、233 句 hold 時間改變，因為不必再避開換 set）；off 路徑的事件紀錄表（`worldEvents`，只是紀錄）少了那些句內換座。地面（sections）沒有任何差異。

### 4.3 13 世界組中位數（`measure-world-events.mts --seeds 0,1,2`，phase4-groups）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts --seeds 0,1,2 --out out/research/q1-1109/no-inline/measure-{before,after}.json`。OFF = 排程器關（`medianBefore`，畫出的構圖切換，句內換座算在裡面）；ON = holds-first（`medianWiredPlanExclUnreliable`，headline）。每 10 秒。

| 組 | seed | OFF 快 | OFF 慢 | ON 快 | ON 慢 |
|---|---|---|---|---|---|
| 13 個 | 0 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |
| 13 個 | 1 | 3.6 → 3.6 | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |
| 13 個 | 2 | 3.6 → 3.6 | 3.2 → **2.8** | 3.6 → 3.6 | 2.8 → 2.8 |
| 原五 | 0 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 2.8 → 2.8 |
| 新八 | 0 | 3.8 → **3.4** | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |
| 全 45 | 0 | 4.0 → **3.2** | 3.2 → 3.2 | 3.2 → 3.2 | 3.2 → 3.2 |
| 全 45 | 1／2 | 3.6 → **3.2** | 3.2 → 3.2 | 3.6 → 3.6 | 3.2 → 3.2 |

OFF 下降是因為句內換座原本被算成構圖切換，現在沒有了；地面 cut 不算構圖切換。ON 全部不變。contract 改前改後都是 0。沒有為了補回數字做任何調整。

### 4.4 Q2 覆蓋率（`hold-plan-all.mts`，5 首 × 45 世界，seed 0，舊分母）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-plan-all.mts > out/research/q1-1109/no-inline/planall-{before,after}-off.json`；`VJ_WORLD_EVENTS=1` 同上 `-on`。

| 長度 | OFF 改前 | **OFF 改後** | ON 改前 | ON 改後 |
|---|---|---|---|---|
| 0.6–1.5 秒 | 59/495 = 11.9 % | **59/495 = 11.9 %** | 11.9 % | 11.9 % |
| 1.5–3 秒 | 1444/5445 = 26.5 % | **1472/5445 = 27.0 %** | 28.0 % | 28.0 % |
| > 3 秒 | 2840/4815 = 59.0 % | **2991/4815 = 62.1 %** | 64.3 % | 64.3 % |

OFF 上升是因為 hold 不必再避開句中換 set。hold 總數 4343 → 4522（+179）；換色仍全部有理由（`ink-swap` 131 → 134、`line-ink-settle` 320 → 356，理由 meaning／section／repeat 都有記錄），連續同種 hold 仍是 0。

### 4.5 閘門（`style-gate-reading.mts`，改了計畫的 20 個世界，5 首）

`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/q1-1109/no-inline/gate-off --baseline scripts/lyric-vj/style-gate-rules.baseline.json aizome card chalkboard chiyogami crayon dark-glitch gothic-lolita ink-wash led-board neon-stage paper-lantern papercut riso silent-film silk silk-cold spy terminal ukiyoe woodcut`；`VJ_WORLD_EVENTS=1` 同上 `gate-on`（commit `1d27374`）。

| | 時刻 | fails | contract | rule regressions |
|---:|---:|---:|---:|---:|
| 排程器關 | 9780 | **0** | 0 | 0 |
| 排程器開 | 9780 | **1** | 0 | 0 |

排程器開的 1 個 fail：chiyogami つづく c013 158.05 秒「あなたを想うでしょう」畫面上看不到字（share 0）。**改前就有**：排程器開的計畫改前改後位元組相同（`--q1` 指紋同為 `aef5d3f3…`），在 46d2b53 的 detached worktree 單跑 chiyogami つづく，同一句同一時刻同樣 fail（`out/research/q1-1109/no-inline/gate-on-chiyo-base/`）。以前的閘門只跑 art-deco／file／card／spy 四個世界，所以沒看到。這次沒有處理，列為待辦。

規則計數（off 與 on 相同的世界）沒有任何一項比基準差；已接受的兩項照舊（chiyogami cross 38/489、ukiyoe low 2/489）。排程器開的 camDrops 6 個（card、chalkboard、riso、silk、spy 的 `diagonal` 相機）與改前一樣是計畫裡已解決的紀錄，不是 contract。

## 5. 測試

`npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json` 通過；`npx ng test --watch=false`：**142 檔／1726 測試全過**（原 141／1724）。

- 新檔 `no-inline-reseat.spec.ts`：(1) spy、chalkboard、silk 的長句合成歌——composer 會在句中找到換點，但每句只有一個 set，換點只留成 cut；(2) spy 大雪 seed 0–2（業主看到的那首）：沒有一句帶 `repose`，事件表沒有句內事件。
- 改期望：`world-shared.spec.ts` 慢歌長句「在詞界換到第二個 set」改為「在詞界換地面、字留在同一個 set」；`world-events-wiring.spec.ts`「付費池保留 repose」改為「付費池不被排程、句子不換 set、換點只是 cut」。

## 6. 給業主的片子

`~/Desktop/vj/output/換色與句內_2026-11-10/v4/`：spy 三年後的大雪 135–190 秒，左 = 改前（今天的預設），右 = 改後；seed 0、Huninn、排程器關。渲染清單與腳本：`out/research/q1-1109/no-inline/clip/`（`run.sh`，一次一支、`--workers 1`、metadata 去除）。

抽幀確認（左／右）：1.3→1.7 秒「無盡的思念總是破碎在冬天」左邊從上方大字跳到中間偏左的小字，右邊原位；5.3→5.8 秒「在夢中看見你身影的那一瞬間」左邊放大換位，右邊字不動、背後色塊換；22.8→23.2 秒同樣。這段左邊 12 次句中換座（c034–c041），右邊 0 次。

## 7. 限制（照實）

- **掃描是計畫層級的幾何，不是逐格像素。** `inline-reseat-scan.mts` 用渲染器自己的排版量法讀每個 set 的字框與字級；`repose` 是渲染器裡唯一會在句中換版位的資料（`world-layout.ts` `poseAt`）。hold 動畫、地面、Q4 交接不在掃描裡。只有片子這一段用眼睛看過。
- **長句中間的地面 cut 留著。** 改前它和換座同時發生；現在字不動、背後換地面。這是依交辦「字不動時背後地面的變化不算、要保留」所做的選擇，業主還沒看過「只換地面」單獨出現的樣子（片子裡看得到）。如果業主覺得這也算「突然變」，可以再把它拿掉，那時 OFF 的換景次數會再少。
- **OFF 的構圖切換中位數下降**（全 45 快歌 seed 0 4.0 → 3.2），因為句內換座以前被算進去。
- **hold 變多**（+179，OFF，seed 0）：只發生在原本有句內換座的 20 個世界；新的 hold 一樣受換色理由、每段兩次、連續不同種的規則約束（`hold-plan-all` 的 `repeats` 仍是 0）。
- `pace.repose` 這個名字現在只代表「長句中間換地面」，名字沒改，以免動到 20 個世界宣告。
