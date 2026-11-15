# 字級下限（type floor）：量測紀錄 2026-11-12

分支 `feat/type-floor`，程式變更為 7e54161（WIP 為 aeb4550）。量測版本 aeb4550；改前為 ffee2a7 加一行 `userData.set`（`../type-floor-base`）。

## 規則

內文歌詞字形不得小於 `max(該 set 的 lo, 84 px)`。放不下時重新排版（換 set、整句不拆、換行），不是把字縮小。`render/type-floor.ts` 是唯一來源：`TYPE_FLOOR`、`floorOf`、`underFloor`、`leastOf`、`heldScale`、`fitAtFloor`。

## 落實位置（7e54161）

- `blockOf`：任一步驟把字設到下限以下，整句重排（不拆），再套 set 的列；仍不行則標 `floorMiss`。
- `splitBlock` / `columnsApart`：拆開的小半維持在下限，主角讓位；框仍壓小的半，改整句排。
- composer：`seatMissed`（bands 或 floor）取代 `bandMissed`，所有 set 與共用鏡頭的 slot 都適用；超過長度但守得住下限的 set 優先；同頁座位要求每個部分都達下限。
- `blowPose`：放大關鍵字周圍的字在下限，否則不放大。
- engine 的 frame fit：world line 的字保持在下限（carrier 可超出安全邊）；drift 停在安全區。
- calls 由 78 px 改 84 px；stack 退後的行與 typeset particle 不低於下限；world job 的共用 template 行在 84 px 以下改用分段列。
- 新增 `type-floor-scan.mts`（每個歌詞字形的實際繪製大小）、`type-floor-sets.mts`（哪些行改了 set 與原因）。

## 掃描：改前 vs 第一版改後（aeb4550，歷史數字，最終見下）

範圍：45 個 offered worlds × 5 首歌 × seeds 0,1,2，33210 行。`under` 指任一內文字形在該行兩個取樣時刻低於其下限。

| 項目 | 改前 off | 改後 off | 改前 on | 改後 on |
|---|---|---|---|---|
| 低於下限的行 | 2557 | 391 | 2527 | 376 |
| 低於 set lo（>84，如 110）| 8 | 2 | 10 | 4 |
| calls 低於下限 | 3105（78 px）| 0 | 3105 | 0 |
| particle 低於下限 | 7951 | 3919 | 7948 | 3910 |
| 有低於下限行的 world 數 | 40 | 22 | - | 22 |
| 各 world 最小字（最差者）| screentone 44 | art-deco 63 | - | art-deco 63 |

「on」是 composition scheduler 開啟（`--on`）。改後 off 的 391 行：art-deco 271（pillars 91、arch 82、marquee 55、marquee-low 42、plaque 1，多數最小字 81 至 83 px，最差 63），其餘 21 個 world 合計 120 行（最小 67.6 px，其中 93 行在 80 px 以上）。各 world 最小字改前至改後（off）：silk 57→83、silk-cold 52→78、file 53→84、screentone 44→84、embroidery 52→84、xerox 53→84、cyanotype 54→84、notebook 53→84、art-deco 56→63、riso 59→68、spy 66→69。

## 規則的定義（2026-11-14 定案）

- 字級是 em 高：一個字形在畫面上的字級，取它兩個軸向縮放中較大的那個（`max(|scale.x|, |scale.y|)` 乘 `userData.size`）。art-deco 的窄體（scaleX .75）是壓扁的字體，不是縮小的字；滾動、翻轉中的字短暫壓扁也不算縮小。`shearGain` 只讀 shear 的垂直軸。
- 若改成計入被壓扁的寬度，art-deco 的小半邊要排在 112 px 才算數，放不下，結果是 art-deco 的 poster-panel 版型在 taimei 一行都排不出（11 行變 0），4a/4c 的測試與 pin 也一起壞。這是量過的事實，所以不採用。
- 壓扁只能用核准的字體：`MIN_CONDENSE = 0.75`（art-deco 目前最窄、已檢查過筆畫不會黏在一起）。`type-floor.spec.ts` 檢查每個 set 的 shear 橫軸不得小於它，所以任何更窄的壓扁都得先重新跑「筆畫在畫出來的字形上不合併、不低於筆畫下限」的檢查才能放行。
- 內文歌詞字形一律受規則約束，包含助詞與小假名（particle）。裝飾用的複製品（`userData.decor`：放大字的 stress 副本、carrier 的 keyline 層）不是被閱讀的字，不計入；這個分類寫在 `render/type-floor-page.mts`、`engine.ts` 的 `restingWords` 與 `type-floor-scan.mts`。

## 每一步怎麼守住（最終）

- 版面：`layFloorOf`（set 的 lo 與 84 / shearGain 取大，無條件進位到整數 px）、`blockOf` 重排、`splitBlock`、composer 的 `seatMissed`，以及 `blowPose`（放大字只放到「姿態連同 line-grow 的 1.12 倍、每個字的 em 框」在重拍上放得進畫面；放不下就不放大）。
- 助詞：`holdParticles` 把排在已達下限的列裡、被排版器縮小的助詞或小假名，提升到畫出來的下限（不超過該列字級）。stack 往後退時以該行最小的字形為準。
- 引擎：`holdScale` 在一行第一次播放時，以每 1/30 秒讀它整段閱讀時間「實際播放」的字級與位置，算出一個常數（`playScale(natural, hold)` 只擋住鏡頭或漂移造成的縮小，不自己動）；瞄準下限加 0.6 px，邊界 `HOLD_EDGE` = 8 px。擋不住的放大字（`holdFalls`）整個放棄放大，連另一種墨色的版本（twin）一起重排；世界裡每一行都套用 stair 後備（`inWorld`，以 cue.world 判定）。stair 在最寬一列低於 90 px 時多切一列（至六列）。
- 單幀硬抬（`liftToFloor`）試過後移除：它會讓正在唱的行逐幀變大小，進場動畫也會被撐大。

## 殘留與歷程

全掃描（45 世界 × 5 首 × 3 種子，33210 行）各版本低於 84 px 的行數（off，on 相差不到 2%）：

| 版本 | 行 | 助詞 | 說明 |
|---|---|---|---|
| ffee2a7（改前）| 2557 | 7951 | calls 3105 處 78 px |
| aeb4550 | 391 | 3919 | 前一輪報告 |
| r2 | 113 | 351 | 版面算法加入 shear 增益等 |
| r3 | 3 | 3 | 放大字與動態保持 |
| r4 | 0 | 0 | 當時以壓扁寬度計 art-deco 並有逐幀硬抬 |
| r5 | 22 | 11 | 改為 em 高、移除硬抬後：framed 世界在播放中被「滾動壓扁」讀小、放大字與鏡頭行的常數保持不足 |
| 定案版（針對性掃描）| 0 | 0 | 見下 |

r5 的 22 行與 11 個助詞已全部對應到原因並修正：量測改為兩軸取大、保持改讀「播放中」的字級與位置（每 1/30 秒）、twin 版本跟著重排、保持邊界 8 px 並瞄準 +0.6 px。針對性掃描（受影響的 15 個世界，全部 5 首 × 3 種子，off）結果：gameshow、idol-live、y2k、phone、scrapbook、claymation、art-deco 共 13 個世界 0 行、0 個助詞；silk-cold、gothic-lolita、chiyogami、chalkboard、papercut、led-board、silk、dark-glitch、spy 共 9 個世界 0 行、0 個助詞（最後一輪 gothic-lolita、chiyogami、chalkboard 兩個種子：2214 行，0 行、0 助詞）。

**審查後的最後一版（aa3cbb9）**：針對性掃描（16 個先前有殘留的世界，5 首 × 3 種子，off，11808 行）低於 84 px 的行 0、助詞 0；`floorMissed` 0；放大字放棄 97 行（frame 47、blowPose 無空間 50、stair 0）。三個世界的 gate（isometric、scrapbook、cel80s）加三個抽樣世界（silk-cold、dark-glitch、notebook）：規則回歸 0、fails 0、contract 0。完整 `ng test`：149 個檔、1826 個測試通過。全部 45 世界的單次 off 全掃描（`out/research/type-floor/final4/after-off.json`）依擁有者縮小後的範圍只跑一次；on 模式與 45 世界完整 gate 不跑，這是已知的未驗證範圍。

審查後新增的規則：
- 保持（hold）在「只屬於這一行自己的空間」讀（`inOwnSpace`），不受前一幀的 kick、sway、漂移與鏡頭影響；每一行在版面定案後讀一次（`settleHold`），分段渲染、跳轉、live 結果相同。
- 保持的邊界是整段播放中的最壞情況：鏡頭（slide、rise、lean、rig、換行推移）與漂移的每一幀姿態（含旋轉後的方框四角），再疊 kick 與 sway（`holdRoom`）。
- 一行任何 set 都放不下時改用 stair，並帶著原本 set 要求的字級（`rt.params.floor`），最後仍放不下記為 `floorMissed`。
- 放大字被 blowPose 拒絕時，整行從原本的 set 重建（載體、墨色、版面都保留）。放棄放大的原因（frame、pose、stair）逐行記錄，在 metrics、掃描與 gate 都有計數。

仍存在的設計取捨：
- document / feed c041 這種任何 set 都放不下的句子，現在由 stair 後備接手（世界裡每一行都套用）；art-deco 在 em 高定義下不再是殘留。
- 保持要把字抬到下限時，整行會比自然的 fit 略大（最多幾 %），並不超出畫面邊 8 px；超出就放棄放大或改 stair。
- 一行以一個常數保持，不是逐幀調整：該行本來的漂移、鏡頭與 line-grow 照常運動，保持只擋住縮到下限以下。

## Gate

`style-gate-reading.mts`，45 worlds × 5 首 × 489 個檢查點，baseline `scripts/lyric-vj/style-gate-rules.baseline.json`。

- 第一輪（aeb4550，off 與 on）：fails 0、contract 0、camDrops 0；規則回歸 2 項：`isometric: low 11/489`、`cel80s: plate 33/489 (was 20)`。
- r4（形狀已改）：回歸只剩 `isometric: low 11/489`（cel80s 已回到基線）。
- r5：`scrapbook: carrier-overflow 2/489`（scrapbook choroin c012）。
- 定案版（isometric、scrapbook、cel80s 三個世界，5 首）：回歸 0 項，fails 0，contract 0：isometric low 0/489、scrapbook carrier-overflow 0/489、cel80s plate 在基線內。完整 45 世界的 gate 與全掃描一起，送審前跑一次。

原因與修法：
- isometric low：這 11 個時刻是被下限重排從 terrace 換到 `isometric/corner`、`corner-l` 的行。那兩個 set 宣告「字站在 plateInk（深藍）上」，但頁面實際畫的是珊瑚紅與深青的牆；共用的墨色邏輯（`keyFor`）因此把關鍵字的墨色挑成「在深藍上夠亮」的淺珊瑚，印在紅牆與青牆上只有約 2.5–3:1。修法不是改墨色，而是讓宣告說實話：`SetSpec.groundHex` 記下頁面實際鋪的牆色（`CORNER_WALLS`），`groundsUnder`、`partGrounds`、`keyFor`（plan 與 renderer 共用的墨色邏輯）都讀它，於是關鍵字墨色在兩面牆上都夠 4.5:1，不夠就退回內文墨色。`style-worlds-b4b.spec.ts` 鎖住：所有配色下，corner 兩個 set 的內文墨與關鍵字墨在兩面牆上都 ≥ 4.5。
- scrapbook carrier-overflow：兩個時刻（choroin c012）是 r5 的保持把「播放中尚未到位的位置」算進方框造成的，改為讀播放中的位置後消失。
- cel80s plate：r4 起已在基線內。

## Line set 變動（type-floor-sets）

off：33345 行中 4299 行換了 set（改前已有 915 行放不下）；on：4307 行（改前 886 行放不下）。最大的是 silk-cold（266 行，改前 109 行放不下，主要是 `right-column` 換到 `low-far` / `upper-left`）。

## 13-world 與 45-world 中位數（measure-world-events，seeds 0,1,2）

| 組 | 改前 fast / calm | 改後 fast / calm |
|---|---|---|
| five（5）| 3.6 / 2.8 | 3.6 / 2.8 |
| eight（8）| 3.6 / 3.2 | 3.6 / 3.2 |
| thirteen（13）| 3.6 / 3.2 | 3.6 / 3.2 |
| all45 | 3.2 / 3.2 | 3.2 / 3.2 |

三個 seed 的穩定度：five calm 由 [2.8,3.2,2.8] 變 [2.8,2.8,2.8]，其餘不變。節奏中位數沒有因字級下限而移動。

## 指紋（default-hash，`out/research/type-floor/fp`）

225 列（5 首歌 × 45 world）中改變的列數：seed 0 為 91、seed 1 為 98、seed 2 為 93、q1 為 92。改前指紋在 ffee2a7，改後在 aeb4550。hash pins 已隨 7e54161 更新。

## 測試

`npx ng test --watch=false`（定案版）：Test Files 149 passed (149)；Tests 1819 passed (1819)。`tsc -p tsconfig.app.json` 與 `tsc -p tsconfig.spec.json` 無錯誤。新增 `render/type-floor-fit.spec.ts` 與 `type-floor.spec.ts`、`style-worlds-b4b.spec.ts`、`style-worlds-b5.spec.ts` 的案例（frameFit、blowPose 在 line-grow 下放得進畫面、holdParticles、stairRows、holdMultiple、holdFalls、playScale 不逐幀改變行的大小、MIN_CONDENSE、corner 牆上的墨色）。

## 限制

- 掃描讀的是每行可讀時間內的兩個時刻（中間與結束前 0.08 s），不是逐幀；保持本身讀的是每 1/30 秒。
- 5 首歌 × 3 個種子為樣本，不是全部歌曲；最終全掃描與完整 gate 在送審前跑一次，此前只有針對性證據。
- 只量字形大小，不判斷版面好不好看；換 set 的行在觀感上是否更好，仍需人看。
- `lines_under` 的量測以 render page 內 `userData.set` 為 row type；`--code` 的改前端依賴那一行。
- composer 沒有另外加「墨色讀不到就不是合法座位」的過濾：墨色邏輯是以各 set 宣告的底色為準，宣告不實（isometric corner）會讓 plan 與畫面不一致，所以修的是宣告。一般性的座位墨色過濾若要做，需要先讓所有 set 的底色宣告都可信（目前有 21 個 set 在某些配色下，內文墨對它宣告的底色低於 4.5，多半是頁面自己鋪了另一塊底）。

## 指令

```
cd /Users/seitumbp2025/vjflow.worktrees/q3-scale-policy
# 全掃描（約 70 分鐘一次）
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --out out/research/type-floor/final/after-off.json
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --on --out out/research/type-floor/final/after-on.json
# 針對性掃描（可指定世界）
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --out out/research/type-floor/r6/aff-off.json gameshow idol-live ...
# gate
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/type-floor/r6/gate --baseline scripts/lyric-vj/style-gate-rules.baseline.json isometric scrapbook cel80s
# 改前改後的 line set
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-sets.mts --before /Users/seitumbp2025/vjflow.worktrees/type-floor-base [--on] --out out/research/type-floor/sets-{off,on}.json
nice -n 19 npx ng test --watch=false
```

`type-floor-sets.mts --before` 現在以工作目錄解析相對路徑。
