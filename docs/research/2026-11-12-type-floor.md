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

## 掃描：改前 vs 改後

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

## 殘留

- document / feed c041：80 px，沒有任何 set 能容納該句。
- world camera moments（`plan: cam:*`）：鏡頭縮放後的 frame fit 仍有 1 至 3 px 的差（例如 silk/top-slab 83 px）。
- art-deco 的 pillars / arch / marquee 系列在整句重排後仍落在 81 至 83 px，這是量測到的事實，本次沒有改程式去處理（任務限制）。
- 部分 template 行（riso `stair`，67.6 至 73 px，fit 0.81）。
- particle 3919：這是 typeset 在列內的粒子比例，與主字級分開報告。

## Gate

`style-gate-reading.mts`，45 worlds × 5 首 × 489 個檢查點，baseline `scripts/lyric-vj/style-gate-rules.baseline.json`，off 與 on（`VJ_WORLD_EVENTS=1`）各一次。

- fails 0、contract 0、turns 0、camDrops 0；checked 22005；fillMedian 0.149（on 0.148）。
- 規則回歸 2 項（兩次相同）：`isometric: low 11/489 (was 0/489)`、`cel80s: plate 33/489 (was 20/489)`。這兩項是 gate 報的回歸，未處理。
- 已接受項：ukiyoe low 1、chiyogami cross 39（on 40）、scrapbook cross 114、watercolor plate 41、midcentury plate 173（on 175）。
- 與 baseline 比有變動的規則計數共 54 項（off 與 on 同為 54）。增加的：file.cross 4→5（on 6）、spy.cross 0→1、spy.low 2→3、dark-glitch.plate 2→3、dark-glitch.low 5→8（on 7）、neon-stage.clip 0→1、ink-wash.small 0→1、ink-wash.low 0→2、gothic-lolita.plate 1→3、gothic-lolita.small 0→1、paper-lantern.low 0→4、chiyogami.cross 34→39（on 40）、chiyogami.low 0→1、woodcut.cross 0→4、aizome.low 1→2、crayon.low 0→1、popart.cross 0→1、idol-live.small 0→1、brutalist.small 0→1、blueprint.small 0→1、cyanotype.plate 50→51、isometric.plate 7→9、isometric.low 0→11、cel80s.plate 20→33、screentone.cross 4→6、watercolor.plate 40→41、midcentury.plate 167→173（on 175）、art-deco.small 2→1（on 3）、aizome.cross（僅 on，0→1）。減少的：silk.low 1→0、silk-cold.low 5→0、riso.small 3→2、riso.low 4→0、file.clip 1→0、dark-glitch.small 1→0、terminal.plate 1→0、ink-wash.cross 1→0、stained-glass.low 2→1、ukiyoe.low 3→1、papercut.plate 5→4、papercut.low 1→0、woodcut.plate 8→7、chalkboard.low 6→1、y2k.clip 1→0、psychedelic.cross 6→3、psychedelic.low 5→1、citypop.clip 1→0、citypop.low 2→0、phone.clip 1→0、cyanotype.cross 6→0、cyanotype.low 2→1、embroidery.plate 2→0、embroidery.low 1→0、scrapbook.cross 141→114。

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

`npx ng test --watch=false`：Test Files 148 passed (148)；Tests 1801 passed (1801)。（jsdom 的 canvas `getContext` 警告為既有雜訊。）

## 限制

- 掃描讀的是每行可讀時間內的兩個時刻（中間與結束前 0.08 s），不是逐幀。
- 5 首歌 × 3 個 seed 為樣本，不是全部歌曲。
- 只量字形大小，不判斷版面好不好看；換 set 的行在觀感上是否更好，仍需人看。
- `lines_under` 的量測以 render page 內 `userData.set` 為 row type；`--code` 的改前端依賴那一行。

## 指令

```
cd /Users/seitumbp2025/vjflow.worktrees/q3-scale-policy
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --out out/research/type-floor/after-off.json
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --on --out out/research/type-floor/after-on.json
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts --jobs 1 --on --code ../type-floor-base --out out/research/type-floor/before-on.json
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/type-floor/gate-off --baseline scripts/lyric-vj/style-gate-rules.baseline.json <45 worlds>
VJ_WORLD_EVENTS=1 nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/type-floor/gate-on --baseline scripts/lyric-vj/style-gate-rules.baseline.json <45 worlds>
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-sets.mts --before /Users/seitumbp2025/vjflow.worktrees/type-floor-base [--on] --out out/research/type-floor/sets-{off,on}.json
nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts --seeds 0,1,2 --out out/research/type-floor/we-after.json
nice -n 19 npx ng test --watch=false
```

改前的 before-off 掃描（ffee2a7）為先前已跑完的 `before-off.json`。`type-floor-sets.mts` 的 `--before` 必須用絕對路徑（相對路徑會被解成 `scripts/` 底下而失敗）。
