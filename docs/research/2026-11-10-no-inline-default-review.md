# 獨立審查：預設產品句內不換座（1d27374 / 9eb3be3）

審查者沒有寫這段程式。分支沒有改動。審查時間 2026-11-10。
自己的掃描與畫格：`out/research/q1-1109/no-inline/review-scan/`（`rect-scan.mts`、`an2.py`、`grab.mts`、`after.json`、`before.json`、`beats-*.json`、`grid.jpg`、`card.jpg`）。
改前（46d2b53）在 scratchpad 的 detached worktree 跑，`node_modules`、`out` 用 symlink。

## 總結

**FAIL。** 換座本身確實修好了：畫出來的字框在句內不再跳位（改前 1181 次跳位都落在 repose 上，改後 0 次）。但留下來的「地面 turn」在 **card** 世界不只是換背景：card 的地面就是 set 自己的頁（`pageOf(card, 'card/pair') = 'card/pair'`），turn 把 fx 換成 `card/table`，原本 set 的載體卡片跟著消失，字還留在 `card/pair` 的版面上。第二行白字（原本在紫色或紅色卡片上）就落到奶油色的整頁卡片上，幾乎看不見（`review-scan/card.jpg`、`grid.jpg` 第 1 列）。改前同一個時間點，整句會換座到 `card/long`，用深色字放在新卡片上，可以讀（`grid.jpg` 第 4 列）。這正是交辦裡說的主要風險，而且已經發生：card 在樣本裡保留下來的 25 個 turn，有 13 個之後字的像素掉到 70 % 以下（最嚴重 tsuzuki c011：2161 → 430）。閱讀閘門看不到這個問題：第一行還在，所以 share 夠；白字疊在奶油色上，on/off 差異低於門檻，所以也不會被算成墨色。付費路徑也一樣受影響（見 claim 1）。

## 逐項判定

### (1) `world.repose` 是唯一的句內換座路徑：預設路徑 PASS，付費路徑沒寫清楚（PARTIAL）

- 渲染器：`render/world-layout.ts:437` `poseAt` 和 `:432`、`:502`、`:510` 是唯一讀 `wl.repose` 的地方；`:287` 只是看有沒有 repose。
- 寫 `repose` 的只有兩處：`lineplan-core.ts`（已拿掉）和 `world-events-apply.ts:74`。後者只在 `scheduled` 時寫入（`free-plan.ts:466`），而 `scheduled` 需要 opt-in 或 `compositionsOf(...).enabled`；`world-shared.ts:389-408` 五個世界都是 `enabled: false`。所以預設路徑上沒有別的寫入點。
- 其他會讓字移動的東西（drift、swell、hold、世界相機在句首、Q3 scale 和 Q5 moment 為 opt-in）都不是換 set。我自己的像素掃描也證實了這一點（見 claim 2）。
- **付費路徑**：`scripts/lyric-vj/linedirect-core.mts:599` 用 `worldPoolOf` 呼叫 `composePlan`（`paid-world.mts:48`，沒有 scheduled，也沒有 stillLines），走的是同一個 `compose`。所以付費輸出也改了：repose 拿掉，turn 留著，card 的問題付費也會遇到。改後的付費測試結果：`paid-world.test.mts` 6 個中 5 個過，1 個沒過（`worldCandidates` 期望 45 得到 1）；改前 46d2b53 也是同一個沒過，是既有問題。`linedirect.test.mts`、`lineplan.test.mts` 全過。文件 §5 只提到付費「spec」改了，沒有說付費輸出也改了。

### (2) 掃描數字 6025 → 0 等：PASS（數字本身）；方法是同義反覆

- 他們的 `inline-reseat-scan.mts` 只讀 `w.repose`，所以改後是 0 是必然的。
- 我自己的掃描：在 10 個世界（spy、chalkboard、card、riso、silk、ink-wash、terminal、silk-cold、ukiyoe、art-deco）× 5 首歌 × seed 0 上，分別渲染有歌詞層和沒有歌詞層的畫面，比較 320×180 的差異框。每句從第一個唱出的字到句尾取 5 個時間點，每個 turn 再加 ±0.12 秒。共 2210 句、13684 個時間點。
- 改前：1501 對跳動，其中 1181 對跨在 repose 上。改後：0 對跨在 repose 上（因為已經沒有 repose）。改後跨在 turn 上的跳動有 13 對，全部都是 card：字沒有移動，是第二行看不見了，差異框因此縮小。
- 改後還剩的、沒有 hold 能解釋的位移（204 句；改前是 185 句）大多是 10–12 px、尺寸變化 ≤ 0.05、跨 1–3 秒的漂移（`drift`）。現在漂移整句不重設，所以累積得比較多；這不算換座。line-grow、roll 等 hold 錨點不動，可以接受。

### (3) 指紋 99/225 列、剛好 20 個世界、`--q1` 不變：PASS

我自己重跑了 `default-hash.mts`：seed 0 改前 `69af54b8`、改後 `50823875`；`--q1` 前後都是 `aef5d3f3`。變動的是 99 列、20 個世界，card 在 snow 沒變。和他們存的 `hash-*` 檔一致；s1、s2 只比對了他們的檔案。

### (4) 中位數下降、ON 不變：PASS（只部分查證）

`measure-before/after.json` summary：fast `medianBefore` 4 → 3.2，calm 3.2 → 3.2，ON 不變。13 世界、各 seed 那幾列沒有逐列重算。Q2 的數字沒有重跑。

### (5) 閘門 off 0、on 只有 1 個既有 fail：PASS（只核對了產出檔）

`gate-off`、`gate-on`、`gate-on-chiyo-base` 的 JSON 和 commit 對得上：on 的 fail 是 chiyogami tsuzuki c013 158.05，在 46d2b53 也一樣出現。但這個閘門看不到 card 第二行消失的問題（見總結）。所以「閘門 0 fail」不能拿來證明地面 turn 是安全的。

### (6) tsc、ng test：PASS

`tsc -p tsconfig.app.json` 和 `tsc -p tsconfig.spec.json` 都乾淨。`ng test`：142 個檔案、1726 個測試全過。

### (7) 兩個 spec 期望改動有沒有道理：PASS

- `world-shared.spec.ts:60-80`：改成「沒有 repose」，同時保留「turn 超過 6 個、而且落在詞界 ±0.3 秒內」，沒有放水。
- `world-events-wiring.spec.ts:260-267`：「不被排程」的檢查保留，再加上「沒有 repose」和「repose cut 大於 0」，沒有放水。
- 新的 `no-inline-reseat.spec.ts` 也合理。
- 但沒有任何 spec 檢查 turn 之後字是否還讀得到（card 的漏洞）。

### (8) 業主片子 v4：PASS

我在 1.3/1.7、2.3/2.7、5.3/5.8、22.8/23.2 秒抽了畫格：左邊跳位、改大小；右邊位置、字級、斷行都不變，背後地面換，金色字在深色地面上清楚。spy 世界沒有問題，問題出在 card，而業主沒看過 card。

### 主要風險：保留的 turn 對比是否 ≥ 4.5:1：FAIL（card）

- 1317 個 turn 裡，有 1 個在 turn 之後的 `low` 大於 0.5（ink-wash snow c003 7.43，0.55–0.60；改前最高 0.42）。
- turn 之後字的像素掉到 70 % 以下的有 14 個：card 13 個、ukiyoe 1 個。ukiyoe 那個看畫格還讀得到；card 的看不見。
- 整體 `low` 大於 0.5、而且不在 hold 裡的時間點：改後 24 個，改前 21 個。
- 根本原因：`pageSeats` 的世界，set 的頁就是地面。turn 的地面輪替（`lineplan-core.ts:1697-1698` 的 `reposeGrounds`）換到別的 set 的頁，字所在 set 的載體就不見了。
- 建議修法：turn 只能換到與目前 set 相容的地面。例如 `pageOf(world, set)` 有值時，不留這個 turn，或者只在同一頁內輪替。然後加一個 spec：每個 turn 之後，字的 on/off 像素不得少於 turn 前（或者閘門在 turn 後加一個取樣點）。

### 文件是否誠實寫出密度下降：PASS（有一處遺漏）

§4.3、§7 都寫了 OFF 的換景次數下降（45 世界 fast 4.0 → 3.2），也寫了 hold 增加。遺漏的是：付費輸出也改了，以及 page 世界的 turn 會連載體一起換掉。

## 整體：FAIL

阻擋項只有一個：card（以及所有 `pageSeats`、set 頁就是地面的世界）保留下來的 turn 會讓句子後半段看不見。預設和付費兩條路徑都會遇到。其他宣稱都成立。

---

# 第二輪（修正 af1559c、e020521，文件 08c6a32；審查 HEAD 08c6a32）

新的檔案放在 `review-scan/`：`r2.json`、`beats-r2.json`、`af1559c/`、`v5-card.jpg`、`v5-spy.jpg`。af1559c 在 scratchpad 的 detached worktree 跑，跑完已刪除。

## 總結

**PASS**，附兩個不擋合併的註記：

- 句中的 turn 大幅減少。這是保守的選擇，文件有寫。
- card 的 roll 在紅卡上只有約 1.2:1。這是改前就有的另一個可讀性問題。

## (1) turn 規則與我的像素掃描：PASS

`render/turn-rule.ts:39` `turnTakes` 的五條：

1. set 有自己的頁時，turn 只能留在那一頁。
2. 不能換到別的 set 的頁。
3. 字的每一部分都要站在自己的載體上，split 的小段和放大字不算。
4. 墨色在新地面上不能變差。
5. 原本 ≥ 4.5:1 的，之後也要 ≥ 4.5:1。

composer（`lineplan-core.ts:1705-1712`）和 `turnChecks`（`world-events-adapter.ts:502`）用的是同一個函式。閘門的 `TURN`（`style-gate-reading.mts:45`）取 turn 前 0.12 秒、後 0.2 秒，規則是像素 ≥ 70 %、low > 0.5 而且上升超過 0.05 才算失敗。

注意：composer 呼叫時 `before` 和 `after` 傳的是同一個 print，所以第 4、5 條在 composer 裡永遠成立。真正把關的是第 3 條「要有載體」；在 `turnChecks` 裡，前後才是真的不同。

我在 HEAD 重跑自己的掃描（同樣 10 個世界 × 5 首 × seed 0，共 2210 句）：

| | 46d2b53 | 1d27374 | HEAD |
|---|---:|---:|---:|
| 句內 turn | 1317 | 1317 | 176（ink-wash 69、ukiyoe 89、terminal 16、card 2） |
| turn 問題（像素 < 70 % 或 low 上升） | — | 14（card 13、ukiyoe 1） | **0** |
| turn 後最高 low | — | — | 0.0016 |
| low > 0.05 的 turn（前／後） | — | — | 0／0 |
| 落在 repose 上的跳位 | 1181 | — | 0 |
| 落在 turn 上的跳位 | — | — | 0 |

- 不在 hold 內、low > 0.5 的時間點：改前 21，HEAD 22，多出的是 ink-wash 一個。
- 沒有 hold 能解釋的位移：改前 185 句，HEAD 193 句，新增 30 句。這 30 句都是 ≤ 17 px（320 寬）、尺寸變化 ≤ 0.06 的慢速漂移。有一句 chalkboard choroin c060 只有 0.3 秒，是進場的尾巴，改前也有類似的框變化。沒有發現換座。
- 協調者說的「35 → 0」是他們閘門的數字（card＋ink-wash：22 個 final check 加 13 個像素）。我的掃描只算 seed 0 的像素：card 13 個、ukiyoe 1 個，到 HEAD 都是 0。

## (2) 拿掉字直接站在地面上的 turn：PASS（理由成立，代價已寫）

af1559c 的閘門在讀過的 2950 個 turn 中找到 5 個問題。我在 af1559c 用自己的掃描重量了這 4 個 job：

- neon-stage choroin c036：字像素 2982 → 1467；c041：9011 → 3270。重現了。
- silent-film snow c003：low 0.00 → 0.47。
- silk-cold nun c002：low 0.01 → 0.40。
- dark-glitch snow c003：low 0.36 → 0.49。

後三個在我 +0.12 秒的取樣點還低於 0.5，他們在 +0.2 秒量到超過 0.5。無論如何，對比都是被 turn 拉低的，所以問題是真的。

5／2950 只占 0.17 %，但他們一律拿掉這類 turn（三個 seed 合計 9182 → 2794）。這是保守的作法：計畫讀不到圖片地面上畫了什麼。§7 寫了失去什麼：spy、chalkboard、silk、silk-cold、riso 長句中間不再換地面，慢歌的詞界換景也沒了，業主沒單獨看過。

`world-shared.spec.ts` 的詞界時間檢查也跟著刪了，因為 silk-cold 已經沒有 turn。現在沒有任何 spec 檢查保留下來的 turn 是否落在詞界。這是小缺口。

## (3) 付費路徑：PASS

`r2/scan-before` 對 `r3/scan-after`：付費 202 → 0（換座次數 273 → 0，turn 300 → 2）。文件 §結論、§2 都寫了付費輸出也改了。我在 HEAD 跑付費測試：`paid-world` 6 個中 5 個過，沒過的 `worldCandidates` 改前就有；`linedirect`、`lineplan` 全過。

## (4) 指紋、中位數、Q2、閘門：PASS

- 我重跑了 seed 0：`470e5709`，99 列，20 個世界，和 1d27374 是同一組列。`--q1` 是 `aef5d3f3`。
- r3 的 hash、gate 檔與文件一致：off 0 fail、0 contract、讀過 922 個 turn、0 個問題；on 1 個 fail，是既有的 chiyogami c013。
- 中位數和 Q2 只核對了檔案，沒有重算。

## (5) tsc、ng test：PASS

app 和 spec 兩個 tsconfig 都乾淨。`ng test`：142 個檔案、1727 個測試全過。

## (6) v5 片子：PASS；card roll 另記為 FAIL（改前就有）

- spy 1.3/1.7、5.3/5.8 秒：右邊字和背景都不動。
- card 9.2/9.8、34.3/34.9 秒：右邊兩張疊卡留著、字不動；左邊跳成一張大卡。
- card roll：我在全解析度量了右半邊第二行。34.5–34.8 秒是白字對紅卡，約 5.6:1。34.9–35.3 秒變成紫字 (91,69,152) 對紅卡 (170,56,41)，**約 1.2:1**，遠低於 4.5:1。35.5 秒回到 5.6:1。左邊 33.6 秒看起來是同樣的紫字壓在紅卡上（我框的範圍沒有對準，沒有量到準確數字）。這是改前就有的另一個可讀性問題：`roll` 的鍵色沒有對 split 載體檢查。說明.md 和文件 §6 都寫了，要另外修。

## 第二輪整體：PASS

第一輪的 card turn 問題已經修好，沒有發現其他退步。

---

# 第三輪（d158cbc 併入 4D、7642658＋14bd24c 每一部分的 hold 墨色、文件 c7da56c；審查 HEAD c7da56c）

新的檔案放在 `review-scan/`：`r3.json`、`hold-scan.mts`、`hold-full.mts`、`hold-an*.py`、`hold-head.json`、`hold-08c.json`、`r3-y2k-roll.jpg`、`r3-cel80s.jpg`、`v6-card.jpg`、`r3gate/`。4b333dc 和 08c6a32 在 scratchpad 的 detached worktree 跑，已刪除。

## (1) 併入 4D 後句內不換座：PASS

- 寫 `world.repose` 的地方，只剩排程器路徑的 `world-events-apply.ts:74`，另外是研究用腳本。
- 4D 的 `bandMiss`／`bandMissed`（`world-sets.ts:369`，`lineplan-core.ts:399/402/1411/1613`）只在選 set 時用，不會在句中換。
- 我在 HEAD 重跑像素掃描（10 個世界 × 5 首 × seed 0，2210 句）：

| 項目 | 結果 |
|---|---|
| 落在 repose 上的跳位 | 0 |
| 落在 turn 上的跳位 | 0 |
| turn 數 | 176 |
| turn 問題 | 0 |
| turn 後最高 low | 0.0016 |
| 不在 hold 內的 low 時間點 | 22，和第二輪相同 |
| 新增位移 | 30 句，與第二輪相同（慢速漂移，≤ 17 px） |

## (2) 每一部分的 hold 墨色：FAIL（主要風險成立：有別的 set 也是一部分一個載體）

**做法。** 我自己寫了逐像素探針 `hold-scan.mts`。對每一句「會改字色的 hold」：

- 取樣時間：hold 前 0.15 秒，hold 中 25 %、50 %、75 %，以及 stays 之後。
- 每個點各抓一張有字、一張沒字的畫面，對每個字的像素算它和同一位置背景的 WCAG 對比。
- 把字的像素依 y 分成幾段，每段取第 90 百分位當作那段的對比，低於 4.5 就記錄。
- 只看會改字色、而且 set 有 split、`rowInk`、多個 `on` 或 `rowOn` 的句子。

**驗證。** 在 08c6a32 跑 card：10 個 hold 全部被抓到，第二行約 1.1–1.5:1，正好是他們說的「10 → 0」那 10 個。

**HEAD 結果。** 23 個有多部分載體的世界 × 5 首 × seed 0，共 439 個 hold、1410 個取樣點。card 是 0。低於門檻的先在 480 寬量，再用 1920×1080 複量：

- **y2k/strips，choroin c006，`roll`（12.91 秒起 1 秒）：FAIL。** 直立的彩虹長條，每個字下面的顏色都不同。roll 的灰色鍵色 (62,62,64) 經過最上面那個字時，下面是桃紅色 (239,78,132)，只有 **3.12:1**。hold 前同一個字是 5.34:1。畫格見 `r3-y2k-roll.jpg`。這個 set 沒有 `on`，也沒有 `rowOn`，所以 `partGrounds` 根本看不到這些顏色。4b333dc 的 y2k 計畫和現在完全一樣，所以是改前就有的問題；但它正是交辦裡說的那種風險。
- **y2k/strips，tenmon c023，`beat-punch`：PASS，但很勉強。** 全解析度每一段 4.54–6.0。
- **embroidery/columns，choroin c006：PASS。** 480 寬量到 4.35，是縮圖造成的誤差；全解析度 5.5–6.2。
- **cel80s/ending-l，tsuzuki c010：PASS（不是 hold 造成的）。** 第二段是米白字 (252,241,223) 直接站在淡紫色天空漸層 (165,138,235) 上，hold 前後都只有 **2.53:1**。這是改前就有的基本墨色問題（見 `r3-cel80s.jpg`），它的 `ink-swap` 也照樣通過了檢查。
- 其他 435 個 hold，每一段都 ≥ 4.5:1。

他們的「掃描 10 → 0」用的是自己的部分地面模型，只認得已宣告的 `on`／`rowOn`，所以模型裡算出來確實是 10 → 0。但像 y2k 長條這種「每個字下面的顏色都不同、卻沒有宣告」的 set，它看不到。這正是交辦預期的盲點，而且已經發生。

建議：

- y2k/strips 這類每格一色的長條，宣告每一格的載體色，或者讓鍵色對長條上的每一種顏色都檢查。
- cel80s/ending-l 的第二段要另外修它的基本墨色。

## (3) card v6：PASS

右半第二行在全解析度量：34.5／34.7／34.9／35.0／35.1／35.2／35.3／35.5 秒都是 (249,242,227) 對紅卡 (172,56,43)，**5.62:1**。他們寫 5.9，我量的比較低，但都 ≥ 4.5，也沒有紫色。右邊兩張卡和字都沒有移動，只有卡角的指示點在換。左邊 34.9 秒以後跳成一張大卡。

## (4) 指紋：PASS

我在 4b333dc 和 HEAD 各自重算：

| | 4b333dc | HEAD | 改變的列 |
|---|---|---|---|
| seed 0 | `a2724b6e` | `a1c8935d` | 99 列，同樣 20 個世界 |
| seed 1 | `e9d06e6a` | `cee589ee` | 99 列，同樣 20 個世界 |
| seed 2 | `a6581fa6` | `9b2d9cff` | 99 列，同樣 20 個世界 |
| `--q1` | `27645458` | `641c1058` | 只有 card 3 列（choroin、nun、tsuzuki） |

popart、midcentury、scrapbook、claymation 一列都沒變。

## (5) 閘門：PASS

- 他們的 `r4/gate-off`、`gate-on`（14bd24c，24 個世界，各 11736 個時刻）：fails 0、contract 0、regressions 0；off 讀了 922 個 turn、0 個問題。
- 我自己在 HEAD 重跑 chiyogami 的 off 和 on，兩邊都 exit 0：各 489 個時刻、0 fail、0 contract、0 regressions；off 讀了 65 個 turn、0 個問題。
- c013 那個 fail 已經不見了。

## (6) tsc、ng test：PASS

app 和 spec 兩個 tsconfig 都乾淨。`ng test`：146 個檔案、1790 個測試全過。

## 第三輪整體：FAIL

阻擋項只有 (2)：會改字色的 hold 只認得已宣告的部分載體。y2k/strips 的 roll 讓灰字壓在桃紅格上，只有 3.12:1；這是改前就有的，但沒被新規則抓到。另外 cel80s/ending-l 的基本墨色只有 2.53:1，是另一個改前就有的問題，不是這輪造成的。其他項目都成立。
