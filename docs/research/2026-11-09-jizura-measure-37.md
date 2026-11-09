# JIZURA 節奏量測：全部提供的世界（2026-11-09）

**結論：11-04 的目標在全部世界上大多沒達到，而且當時量過的 11 個世界本身也退了。** 提供中的世界現在是 **45 個**，不是 37 個（`404d73f` 的 `OFFERED_STYLES`，第 5 批 8 個已開放、`HELD_WORLDS` 為空），45 × 2 段全部量完，沒有渲染失敗。

- **快歌切換**：中位 8.0／10 秒（木刻除外），JIZURA 19.2，目標 ≥ 15；只有 3／44 達標（brutalist 19.6、psychedelic 16.8、graffiti 15.2）。**慢歌**中位 4.8，JIZURA 10.8，目標 ≥ 6；13／44 達標。
- **11-04 量過的同 11 個世界**：fast 中位 11.2 → 9.2，calm 6.0 → 4.8，calm 硬切 4.0 → 2.8。其中 9 個世界的計畫（repose、停留動作、放大）和 11-04 完全相同，所以掉的部分來自渲染端（推論，原因沒查）；file、card 的句內換版（repose）在慢歌變成 0，是計畫端的退步。
- **停留事件**：有一半左右的長句有（字墨變色 428／855，畫面 >2 % 329／855）。document、screentone、art-deco 兩段都是 0，embroidery 1／19。
- **進退場**：中位登場 5、退場 4 種，已達 11-04 的 ≥ 4 目標；document（2／1）、watercolor（2／2）沒達標。JIZURA 是 16–17 種登場。
- **關鍵詞放大**：沒有任何世界做到「每段 ≥ 1」，最多 10／17 段。**鏡頭**：document、notebook 兩首都 0 次。**免費簽名時刻**：45 個世界都是 0，符合「可為 0」。
- **最差的世界**：blueprint、chalkboard、art-deco、document、notebook 在切換數上墊底（0–2.4／10 秒），版面數也只有 1.2–7.2／30 秒，就是同一頁停著不換。chalkboard 在 11-04 修正之前有 10.0，現在 0.8。

節奏只看畫面，**沒有聽聲音**。

## 方法

- 程式碼：`feat/lyric-editing` `404d73f`（工作樹的 src/、scripts/ 沒有改動），免費版 `world-clip.mts`，seed 0，既有 meaning.json，**API 費用 $0**。
- 片段與 11-04 相同：雙截棍 76–101 秒（fast）、三年後的大雪 67–92 秒（calm）。一次只渲染一支，`nice -n 10`、`--workers 1`；量完立刻刪掉原片與幀目錄。全程 12:04–15:57。
- 切換、硬切、變動像素、版面分群：11-04 的 `measure.mts`，沒有改。木刻的底紋每 2 幀沸騰，切換與像素數字是假的，列出來但不算進中位數和排名（與 11-04 相同）。
- 版面重疊（IoU）：`measure.mts --overlap`，量在 960×540 重新壓縮的副本上（`small/`；原片每支約 50 MB，90 支會超過磁碟上限）。
- 登場／退場、放大、鏡頭、簽名時刻：從每支的 `treatment.json` 讀（`world.enter`、`world.exit`、`world.blow`、`world.cam`、`design.signature`），程式在 `scripts/aggregate.py`；另外跑了 11-04 的 `variety.py` 和 `planstat.mts`（`variety-all.json`、`plan-window.json`、`plan-full.json`）。
- 停留事件：**11-04 的量測程式沒有留下來**（`gaps-1104/` 只剩結果 JSON）。我照 JSON 的欄位（peak、median、colour_frame、colour_ink）重建成 `scripts/holdmeasure.py`：文字層（ProRes 4444 的 alpha），每個 ≥ 1.5 秒的長句，在句中 [開始 +0.8 秒, 結束 −0.4 秒] 內，看兩幀都是字墨的像素有沒有變色（相隔 2 幀，RGB 差 > 48）。「字墨變色」= 變色像素超過字墨的 15 %，「畫面變動」= 超過畫面的 2 %。**校準**：用 `b57c4d3` 重新渲染 spy、ukiyoe、terminal 的慢歌文字層（`calib/`），和 11-04 的逐句結果比，字墨欄 27 句有 25 句一致，畫面欄 22／27 一致；重建版在畫面欄偏多（13 對 8）。所以停留的數字和 11-04 比只看方向。
- 文字層的靜止比例、進場：11-04 的 `layermeasure.py`，沒有改（`layers/`）。
- JIZURA 的數字全部沿用 11-04 文件，沒有重新量。
- 2 fps 總覽：`sheets/<世界>-<nun|snow>.jpg`，共 90 張，每張 8 × 7 格，涵蓋 25 秒。

### 讀數字時要注意

- **底色不變的世界，場景分數會讀得偏低。** blueprint、chalkboard、document、art-deco、notebook 整段都是同一張底，字換了 ffmpeg 的場景分數也幾乎不動。但總覽（`sheets/blueprint-nun.jpg`、`sheets/chalkboard-nun.jpg`）和版面分群（1.2–7.2／30 秒）都顯示這些世界真的很少換頁，所以排在最後是真的，只是 0 與 0.8 這種數字會把差距誇大。
- **關鍵詞放大的段數算法和 11-04 不同**：本輪用 `song.json` 的 sections 中有唱詞的段（nun 11 段、snow 6 段）；11-04 文件寫的 9／7 段不知道當時怎麼算。放大的句數（nun 7–8、snow 6–7）和 11-04 相同。
- 新的 23 個世界（popart 之後）的文字層「完全靜止」中位是 0.79，舊的 22 個是 0.12：新世界的字到位之後就停住，不再慢漂。這比較接近 JIZURA「停住，然後大跳」的前半段，但停住之後的事件（停留事件）不比舊世界多。

## 量測（每個世界）

### 每 10 秒切換（門檻 0.15）

| 世界 | fast 11-09 | fast 11-04 | calm 11-09 | calm 11-04 |
|---|---|---|---|---|
| silk | 9.2 | 11.6 | 4 | 6.4 |
| silk-cold | 6.8 | 6.8 | 4.8 | 5.2 |
| riso | 8 | 8.4 | 5.2 | 6.4 |
| file | 5.2 | 8.4 | 3.2 | 5.6 |
| spy | 4.8 | 9.2 | 4.8 | 5.6 |
| card | 14 | 14.0 | 2.4 | 6.4 |
| dark-glitch | 8 | 8.0† | 4.8 | 0.0† |
| neon-stage | 10.4 | 11.2 | 4.8 | 3.2 |
| terminal | 8.4 | 10.8 | 2.8 | 3.2 |
| led-board | 10.4 | 12.0† | 2.8 | 2.4† |
| ink-wash | 11.6 | 11.6 | 6 | 6.4 |
| silent-film | 11.6 | 11.2† | 7.2 | 7.2† |
| stained-glass | 6.8 | 12.0† | 4.8 | 4.8† |
| gothic-lolita | 6.8 | 6.4† | 2.4 | 1.6† |
| ukiyoe | 10.8 | 13.2 | 5.6 | 6.0 |
| papercut | 12.4 | 10.8† | 5.2 | 2.8† |
| paper-lantern | 12 | 11.6† | 8 | 4.8† |
| chiyogami | 10.4 | 12.4 | 5.6 | 7.6 |
| woodcut（底紋沸騰，不計） | 46.4 | 54.8† | 22.4 | 21.6† |
| chalkboard | 0.80 | 10.0† | 0.40 | 2.4† |
| aizome | 10 | 11.6† | 4 | 3.6† |
| crayon | 9.2 | 9.2† | 4.8 | 2.8† |
| popart | 10 | — | 6 | — |
| gameshow | 8 | — | 6 | — |
| idol-live | 3.6 | — | 0.40 | — |
| y2k | 4.8 | — | 2.8 | — |
| psychedelic | 16.8 | — | 15.2 | — |
| graffiti | 15.2 | — | 9.2 | — |
| brutalist | 19.6 | — | 18 | — |
| citypop | 7.6 | — | 6 | — |
| phone | 8 | — | 4 | — |
| blueprint | 0 | — | 0.40 | — |
| xerox | 10.4 | — | 4.8 | — |
| cyanotype | 8 | — | 6 | — |
| isometric | 4.8 | — | 3.2 | — |
| cel80s | 10 | — | 6 | — |
| document | 1.6 | — | 2.4 | — |
| embroidery | 6.8 | — | 5.2 | — |
| screentone | 8.4 | — | 6.4 | — |
| art-deco | 1.2 | — | 0.40 | — |
| notebook | 2.4 | — | 1.6 | — |
| scrapbook | 7.2 | — | 4 | — |
| watercolor | 3.6 | — | 3.6 | — |
| midcentury | 8.4 | — | 7.2 | — |
| claymation | 4.8 | — | 2.8 | — |
| **中位（木刻除外）** | 8.0 | 11.2（11 個） | 4.8 | 6.0（11 個） |
| JIZURA | 19.2 |  | 10.8 |  |
| 目標（11-04） | ≥ 15 |  | ≥ 6 |  |

達標：fast ≥ 15 有 3／44，calm ≥ 6 有 13／44。† = 11-04 共用修正之前的值（`measure-all22.json`）；無 † = 修正之後（`gaps-1104/measure-g5.json`）。

### 每 10 秒硬切（門檻 0.3）

| 世界 | fast 11-09 | fast 11-04 | calm 11-09 | calm 11-04 |
|---|---|---|---|---|
| silk | 4 | 6.4 | 2.8 | 4.4 |
| silk-cold | 4.8 | 6.4 | 4.4 | 4.8 |
| riso | 4 | 4.8 | 3.6 | 4.4 |
| file | 2.4 | 4.4 | 2 | 3.6 |
| spy | 1.6 | 3.2 | 2.4 | 4.0 |
| card | 8 | 5.6 | 1.6 | 4.4 |
| dark-glitch | 2.8 | 5.2† | 0.80 | 0.0† |
| neon-stage | 6 | 6.0 | 1.6 | 2.0 |
| terminal | 4 | 6.4 | 0.40 | 1.2 |
| led-board | 4.8 | 3.2† | 0.40 | 0.0† |
| ink-wash | 8.8 | 9.6 | 4.4 | 4.8 |
| silent-film | 7.2 | 7.2† | 5.6 | 4.8† |
| stained-glass | 5.2 | 5.6† | 3.6 | 2.0† |
| gothic-lolita | 3.2 | 4.8† | 0.80 | 0.8† |
| ukiyoe | 5.2 | 6.0 | 4.4 | 4.0 |
| papercut | 4.4 | 4.4† | 1.6 | 1.2† |
| paper-lantern | 5.6 | 4.8† | 3.6 | 2.4† |
| chiyogami | 5.6 | 6.8 | 3.2 | 4.0 |
| woodcut（不計） | 16.4 | 22.0† | 4.8 | 4.0† |
| chalkboard | 0 | 5.2† | 0 | 2.0† |
| aizome | 2 | 4.8† | 2.4 | 2.0† |
| crayon | 4 | 4.8† | 2 | 1.2† |
| popart | 6 | — | 3.2 | — |
| gameshow | 5.6 | — | 3.6 | — |
| idol-live | 0.80 | — | 0 | — |
| y2k | 4.4 | — | 2.8 | — |
| psychedelic | 4 | — | 4.4 | — |
| graffiti | 4.8 | — | 2.8 | — |
| brutalist | 16.8 | — | 14.8 | — |
| citypop | 4.8 | — | 4 | — |
| phone | 4.4 | — | 3.2 | — |
| blueprint | 0 | — | 0.40 | — |
| xerox | 4 | — | 3.2 | — |
| cyanotype | 4.8 | — | 2 | — |
| isometric | 4.4 | — | 2.4 | — |
| cel80s | 3.6 | — | 2.8 | — |
| document | 1.2 | — | 1.2 | — |
| embroidery | 6 | — | 4.4 | — |
| screentone | 5.2 | — | 3.2 | — |
| art-deco | 1.2 | — | 0 | — |
| notebook | 2 | — | 0.80 | — |
| scrapbook | 4 | — | 2.8 | — |
| watercolor | 2.8 | — | 3.2 | — |
| midcentury | 3.2 | — | 3.2 | — |
| claymation | 2.4 | — | 0.80 | — |
| **中位（木刻除外）** | 4.2 | — | 2.8 | 4.0（11 個） |
| JIZURA | 8.8 |  | 4.4 |  |
| 目標（11-04） | — |  | — |  |

### 不同登場／退場（計畫 world.enter／world.exit 種類，25 秒）

| 世界 | 登場 fast | 11-04 | 登場 calm | 11-04 | 退場 fast | 11-04 | 退場 calm | 11-04 |
|---|---|---|---|---|---|---|---|---|
| silk | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| silk-cold | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| riso | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| file | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| spy | 4 | 4 | 5 | 5 | 4 | 4 | 4 | 4 |
| card | 6 | 5 | 6 | 5 | 4 | 4 | 4 | 4 |
| dark-glitch | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| neon-stage | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| terminal | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| led-board | 6 | 3† | 6 | 3† | 4 | 2† | 4 | 2† |
| ink-wash | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 |
| silent-film | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| stained-glass | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| gothic-lolita | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| ukiyoe | 6 | 6 | 6 | 6 | 4 | 4 | 4 | 4 |
| papercut | 6 | 3† | 6 | 3† | 4 | 2† | 4 | 2† |
| paper-lantern | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| chiyogami | 6 | 6 | 6 | 6 | 4 | 4 | 4 | 4 |
| woodcut | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| chalkboard | 6 | 3† | 6 | 3† | 5 | 3† | 5 | 3† |
| aizome | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| crayon | 5 | 2† | 5 | 2† | 4 | 2† | 4 | 2† |
| popart | 7 | — | 7 | — | 5 | — | 5 | — |
| gameshow | 5 | — | 5 | — | 4 | — | 4 | — |
| idol-live | 5 | — | 5 | — | 4 | — | 4 | — |
| y2k | 5 | — | 5 | — | 4 | — | 4 | — |
| psychedelic | 5 | — | 5 | — | 4 | — | 4 | — |
| graffiti | 5 | — | 5 | — | 4 | — | 4 | — |
| brutalist | 5 | — | 5 | — | 4 | — | 4 | — |
| citypop | 5 | — | 5 | — | 4 | — | 4 | — |
| phone | 5 | — | 5 | — | 4 | — | 4 | — |
| blueprint | 5 | — | 5 | — | 4 | — | 4 | — |
| xerox | 5 | — | 5 | — | 4 | — | 4 | — |
| cyanotype | 5 | — | 5 | — | 4 | — | 4 | — |
| isometric | 5 | — | 5 | — | 4 | — | 4 | — |
| cel80s | 5 | — | 5 | — | 4 | — | 4 | — |
| document | 2 | — | 2 | — | 1 | — | 1 | — |
| embroidery | 5 | — | 5 | — | 4 | — | 4 | — |
| screentone | 6 | — | 6 | — | 4 | — | 4 | — |
| art-deco | 5 | — | 5 | — | 4 | — | 4 | — |
| notebook | 6 | — | 6 | — | 4 | — | 4 | — |
| scrapbook | 5 | — | 5 | — | 4 | — | 4 | — |
| watercolor | 2 | — | 2 | — | 2 | — | 2 | — |
| midcentury | 5 | — | 5 | — | 4 | — | 4 | — |
| claymation | 4 | — | 4 | — | 4 | — | 4 | — |
| **中位** | 5 |  | 5 |  | 4 |  | 4 |  |
| JIZURA | 16 |  | 17 |  | — |  | — |  |
| 目標（11-04） | ≥ 4 |  | ≥ 4 |  | 加 2 種會動的 |  | 加 2 種會動的 |  |

† = 11-04 修正之前（`variety-all22.json`，當時全部世界 2／2）。

### 停留事件（文字層，長句 ≥ 1.5 秒；有事件句數／長句數）

| 世界 | 字墨變色 >15 % fast | 11-04 | 同 calm | 11-04 | 畫面變動 >2 % fast | 11-04 | 同 calm | 11-04 |
|---|---|---|---|---|---|---|---|---|
| silk | 3／10 | — | 4／9 | — | 2／10 | — | 3／9 | — |
| silk-cold | 2／10 | 2／10 | 4／9 | 7／9 | 0／10 | 0／10 | 0／9 | 0／9 |
| riso | 3／10 | — | 6／9 | — | 3／10 | — | 3／9 | — |
| file | 4／10 | — | 4／9 | — | 3／10 | — | 0／9 | — |
| spy | 3／10 | 1／10 | 2／9 | 1／9 | 2／10 | 1／10 | 0／9 | 1／9 |
| card | 8／10 | — | 8／9 | — | 8／10 | — | 8／9 | — |
| dark-glitch | 1／10 | — | 3／9 | — | 1／10 | — | 3／9 | — |
| neon-stage | 9／10 | — | 7／9 | — | 9／10 | — | 6／9 | — |
| terminal | 5／10 | 0／10 | 7／9 | 5／9 | 4／10 | 1／10 | 3／9 | 3／9 |
| led-board | 5／10 | — | 7／9 | — | 6／10 | — | 7／9 | — |
| ink-wash | 5／10 | — | 4／9 | — | 8／10 | — | 4／9 | — |
| silent-film | 2／10 | — | 0／9 | — | 6／10 | — | 8／9 | — |
| stained-glass | 8／10 | — | 8／9 | — | 3／10 | — | 1／9 | — |
| gothic-lolita | 6／10 | — | 3／9 | — | 8／10 | — | 7／9 | — |
| ukiyoe | 8／10 | 6／10 | 7／9 | 7／9 | 6／10 | 4／10 | 8／9 | 4／9 |
| papercut | 7／10 | — | 6／9 | — | 7／10 | — | 7／9 | — |
| paper-lantern | 7／10 | — | 9／9 | — | 7／10 | — | 3／9 | — |
| chiyogami | 8／10 | — | 8／9 | — | 8／10 | — | 7／9 | — |
| woodcut | 4／10 | — | 4／9 | — | 3／10 | — | 4／9 | — |
| chalkboard | 4／10 | — | 4／9 | — | 2／10 | — | 0／9 | — |
| aizome | 4／10 | — | 5／9 | — | 3／10 | — | 1／9 | — |
| crayon | 8／10 | — | 6／9 | — | 6／10 | — | 5／9 | — |
| popart | 2／10 | — | 3／9 | — | 4／10 | — | 5／9 | — |
| gameshow | 3／10 | — | 3／9 | — | 8／10 | — | 6／9 | — |
| idol-live | 8／10 | — | 7／9 | — | 7／10 | — | 6／9 | — |
| y2k | 8／10 | — | 8／9 | — | 3／10 | — | 2／9 | — |
| psychedelic | 7／10 | — | 8／9 | — | 3／10 | — | 4／9 | — |
| graffiti | 4／10 | — | 0／9 | — | 4／10 | — | 1／9 | — |
| brutalist | 4／10 | — | 4／9 | — | 4／10 | — | 4／9 | — |
| citypop | 4／10 | — | 8／9 | — | 1／10 | — | 2／9 | — |
| phone | 8／10 | — | 8／9 | — | 6／10 | — | 8／9 | — |
| blueprint | 0／10 | — | 3／9 | — | 0／10 | — | 0／9 | — |
| xerox | 3／10 | — | 4／9 | — | 3／10 | — | 4／9 | — |
| cyanotype | 4／10 | — | 4／9 | — | 0／10 | — | 0／9 | — |
| isometric | 8／10 | — | 6／9 | — | 1／10 | — | 2／9 | — |
| cel80s | 4／10 | — | 4／9 | — | 5／10 | — | 2／9 | — |
| document | 0／10 | — | 0／9 | — | 0／10 | — | 0／9 | — |
| embroidery | 0／10 | — | 1／9 | — | 0／10 | — | 0／9 | — |
| screentone | 0／10 | — | 0／9 | — | 0／10 | — | 0／9 | — |
| art-deco | 0／10 | — | 0／9 | — | 0／10 | — | 0／9 | — |
| notebook | 4／10 | — | 6／9 | — | 3／10 | — | 4／9 | — |
| scrapbook | 8／10 | — | 8／9 | — | 8／10 | — | 6／9 | — |
| watercolor | 1／10 | — | 4／9 | — | 0／10 | — | 0／9 | — |
| midcentury | 6／10 | — | 8／9 | — | 5／10 | — | 2／9 | — |
| claymation | 8／10 | — | 7／9 | — | 8／10 | — | 5／9 | — |
| **合計** | 208／450 |  | 220／405 |  | 178／450 |  | 151／405 |  |
| 11-04 合計（4 世界） |  | 9／40 |  | 20／36 |  | 6／40 |  | 8／36 |
| JIZURA | — |  | — |  | — |  | — |  |
| 目標（11-04） | 每長句中段一次 |  | 每長句中段一次 |  | > 2 % |  | > 2 % |  |

11-04 欄是 `gaps-1104/hold-after/` 依同一定義重算（只有 spy、terminal、ukiyoe、silk-cold 4 個世界，共 76 句；文件的 29／76、14／76 即此）。本輪的量測程式是重建版（見方法），兩輪數字只看方向。

### 關鍵詞放大（整首；放大句數／有放大的段數 of 有唱詞的段數）

| 世界 | fast 11-09 | 11-04 | calm 11-09 | 11-04 |
|---|---|---|---|---|
| silk | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| silk-cold | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| riso | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| file | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| spy | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| card | 8 句／6 of 11 段 | 8 句 | 7 句／4 of 6 段 | 7 句 |
| dark-glitch | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| neon-stage | 7 句／5 of 11 段 | 7 句 | 6 句／3 of 6 段 | 6 句 |
| terminal | 7 句／5 of 11 段 | 7 句 | 6 句／3 of 6 段 | 6 句 |
| led-board | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| ink-wash | 7 句／5 of 11 段 | 7 句 | 6 句／3 of 6 段 | 6 句 |
| silent-film | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| stained-glass | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| gothic-lolita | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| ukiyoe | 7 句／5 of 11 段 | 7 句 | 6 句／3 of 6 段 | 6 句 |
| papercut | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| paper-lantern | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| chiyogami | 7 句／5 of 11 段 | 7 句 | 6 句／3 of 6 段 | 6 句 |
| woodcut | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| chalkboard | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| aizome | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| crayon | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| popart | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| gameshow | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| idol-live | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| y2k | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| psychedelic | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| graffiti | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| brutalist | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| citypop | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| phone | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| blueprint | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| xerox | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| cyanotype | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| isometric | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| cel80s | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| document | 8 句／6 of 11 段 | — | 7 句／4 of 6 段 | — |
| embroidery | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| screentone | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| art-deco | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| notebook | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| scrapbook | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| watercolor | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| midcentury | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| claymation | 7 句／5 of 11 段 | — | 6 句／3 of 6 段 | — |
| JIZURA | 有 |  | 有 |  |
| 目標（11-04） | 每段 ≥ 1 |  | 每段 ≥ 1 |  |

兩首每個有唱詞的段落都有放大句：0／45 個世界。11-04 文件的「nun 7–8／9 段、snow 6–7／7 段」段數算法不同（本輪用 song.json 的 sections 中含唱詞者：nun 11、snow 6）。

### 世界鏡頭動作（整首 world.cam 次數與種類）

| 世界 | fast 整首 | calm 整首 |
|---|---|---|
| silk | 6（diagonal） | 6（diagonal） |
| silk-cold | 7（push-through） | 6（push-through） |
| riso | 7（diagonal） | 6（diagonal） |
| file | 7（push-through） | 5（push-through） |
| spy | 3（diagonal） | 6（diagonal） |
| card | 7（diagonal） | 5（diagonal） |
| dark-glitch | 7（push-through） | 5（push-through） |
| neon-stage | 7（push-through） | 5（push-through） |
| terminal | 7（push-through） | 5（push-through） |
| led-board | 7（diagonal） | 5（diagonal） |
| ink-wash | 7（push-through） | 5（push-through） |
| silent-film | 7（push-through） | 5（push-through） |
| stained-glass | 7（push-through） | 5（push-through） |
| gothic-lolita | 7（push-through） | 5（push-through） |
| ukiyoe | 7（diagonal） | 5（diagonal） |
| papercut | 7（diagonal） | 5（diagonal） |
| paper-lantern | 7（push-through） | 5（push-through） |
| chiyogami | 7（diagonal） | 5（diagonal） |
| woodcut | 7（diagonal） | 5（diagonal） |
| chalkboard | 7（diagonal） | 5（diagonal） |
| aizome | 7（push-through） | 5（push-through） |
| crayon | 7（diagonal） | 5（diagonal） |
| popart | 7（diagonal） | 5（diagonal） |
| gameshow | 7（diagonal） | 5（diagonal） |
| idol-live | 7（diagonal） | 5（diagonal） |
| y2k | 7（push-through） | 5（push-through） |
| psychedelic | 7（push-through） | 5（push-through） |
| graffiti | 7（diagonal） | 5（diagonal） |
| brutalist | 7（diagonal） | 5（diagonal） |
| citypop | 7（push-through） | 5（push-through） |
| phone | 7（push-through） | 5（push-through） |
| blueprint | 7（push-through） | 5（push-through） |
| xerox | 7（diagonal） | 5（diagonal） |
| cyanotype | 7（push-through） | 5（push-through） |
| isometric | 7（iso-slide） | 5（iso-slide） |
| cel80s | 7（diagonal） | 5（diagonal） |
| document | 0（—） | 0（—） |
| embroidery | 7（diagonal） | 5（diagonal） |
| screentone | 7（diagonal） | 5（diagonal） |
| art-deco | 7（push-through） | 5（push-through） |
| notebook | 0（—） | 0（—） |
| scrapbook | 7（diagonal） | 5（diagonal） |
| watercolor | 7（push-through） | 5（push-through） |
| midcentury | 7（diagonal） | 5（diagonal） |
| claymation | 7（diagonal） | 5（diagonal） |
| 11-04（11 世界合計） | nun 11 段次 | snow 11 段次 |
| JIZURA | 有（斜切、俯視、3D 翻轉） | 有 |
| 目標（11-04） | 每世界 1 種 | 每世界 1 種 |

兩首都沒有鏡頭動作的世界：document、notebook。

### 免費簽名時刻（整首 design.signature）與片段內 moments

| 世界 | signature fast | signature calm | moments fast 25 秒 | moments calm 25 秒 |
|---|---|---|---|---|
| silk | 0 | 0 | 0 | 0 |
| silk-cold | 0 | 0 | 0 | 0 |
| riso | 0 | 0 | 0 | 0 |
| file | 0 | 0 | 0 | 0 |
| spy | 0 | 0 | 0 | 0 |
| card | 0 | 0 | 0 | 0 |
| dark-glitch | 0 | 0 | 0 | 0 |
| neon-stage | 0 | 0 | 0 | 0 |
| terminal | 0 | 0 | 0 | 0 |
| led-board | 0 | 0 | 0 | 0 |
| ink-wash | 0 | 0 | 0 | 0 |
| silent-film | 0 | 0 | 0 | 0 |
| stained-glass | 0 | 0 | 0 | 0 |
| gothic-lolita | 0 | 0 | 0 | 0 |
| ukiyoe | 0 | 0 | 0 | 0 |
| papercut | 0 | 0 | 0 | 0 |
| paper-lantern | 0 | 0 | 0 | 0 |
| chiyogami | 0 | 0 | 0 | 0 |
| woodcut | 0 | 0 | 0 | 0 |
| chalkboard | 0 | 0 | 0 | 0 |
| aizome | 0 | 0 | 0 | 0 |
| crayon | 0 | 0 | 0 | 0 |
| popart | 0 | 0 | 0 | 0 |
| gameshow | 0 | 0 | 0 | 0 |
| idol-live | 0 | 0 | 0 | 0 |
| y2k | 0 | 0 | 0 | 0 |
| psychedelic | 0 | 0 | 0 | 0 |
| graffiti | 0 | 0 | 0 | 0 |
| brutalist | 0 | 0 | 0 | 0 |
| citypop | 0 | 0 | 0 | 0 |
| phone | 0 | 0 | 0 | 0 |
| blueprint | 0 | 0 | 0 | 0 |
| xerox | 0 | 0 | 0 | 0 |
| cyanotype | 0 | 0 | 0 | 0 |
| isometric | 0 | 0 | 0 | 0 |
| cel80s | 0 | 0 | 0 | 0 |
| document | 0 | 0 | 0 | 0 |
| embroidery | 0 | 0 | 0 | 0 |
| screentone | 0 | 0 | 0 | 0 |
| art-deco | 0 | 0 | 0 | 0 |
| notebook | 0 | 0 | 0 | 0 |
| scrapbook | 0 | 0 | 0 | 0 |
| watercolor | 0 | 0 | 0 | 0 |
| midcentury | 0 | 0 | 0 | 0 |
| claymation | 0 | 0 | 0 | 0 |
| 11-04 | 0 | 0 | 0 | 0 |
| JIZURA | 有 | 有 | 有 | 有 |
| 目標（11-04） | ≤ 2，可為 0 | ≤ 2，可為 0 |  |  |

### 文字層：完全靜止／靜止或慢漂的幀比例（參考，非 11-04 目標）

| 世界 | 靜止 fast | 靜止或慢漂 fast | 靜止 calm | 靜止或慢漂 calm |
|---|---|---|---|---|
| silk | 0.12 | 0.25 | 0.00 | 0.38 |
| silk-cold | 0.13 | 0.32 | 0.00 | 0.38 |
| riso | 0.12 | 0.28 | 0.00 | 0.04 |
| file | 0.67 | 0.87 | 0.68 | 0.82 |
| spy | 0.23 | 0.55 | 0.00 | 0.45 |
| card | 0.77 | 0.85 | 0.76 | 0.82 |
| dark-glitch | 0.09 | 0.38 | 0.01 | 0.25 |
| neon-stage | 0.22 | 0.67 | 0.11 | 0.82 |
| terminal | 0.11 | 0.31 | 0.02 | 0.27 |
| led-board | 0.19 | 0.70 | 0.13 | 0.41 |
| ink-wash | 0.13 | 0.71 | 0.01 | 0.67 |
| silent-film | 0.05 | 0.53 | 0.10 | 0.74 |
| stained-glass | 0.75 | 0.92 | 0.78 | 0.88 |
| gothic-lolita | 0.12 | 0.61 | 0.03 | 0.87 |
| ukiyoe | 0.13 | 0.34 | 0.19 | 0.54 |
| papercut | 0.10 | 0.35 | 0.03 | 0.52 |
| paper-lantern | 0.19 | 0.56 | 0.01 | 0.38 |
| chiyogami | 0.10 | 0.58 | 0.01 | 0.71 |
| woodcut | 0.07 | 0.24 | 0.01 | 0.12 |
| chalkboard | 0.08 | 0.23 | 0.00 | 0.04 |
| aizome | 0.12 | 0.23 | 0.12 | 0.41 |
| crayon | 0.10 | 0.39 | 0.00 | 0.16 |
| popart | 0.84 | 0.89 | 0.86 | 0.90 |
| gameshow | 0.81 | 0.88 | 0.84 | 0.91 |
| idol-live | 0.72 | 0.86 | 0.67 | 0.79 |
| y2k | 0.78 | 0.89 | 0.78 | 0.86 |
| psychedelic | 0.90 | 0.92 | 0.84 | 0.86 |
| graffiti | 0.58 | 0.91 | 0.74 | 0.86 |
| brutalist | 0.39 | 0.89 | 0.42 | 0.79 |
| citypop | 0.84 | 0.94 | 0.78 | 0.88 |
| phone | 0.72 | 0.87 | 0.70 | 0.82 |
| blueprint | 0.79 | 0.91 | 0.81 | 0.87 |
| xerox | 0.69 | 0.90 | 0.88 | 0.93 |
| cyanotype | 0.80 | 0.93 | 0.73 | 0.89 |
| isometric | 0.82 | 0.90 | 0.81 | 0.87 |
| cel80s | 0.84 | 0.90 | 0.82 | 0.88 |
| document | 0.86 | 0.98 | 0.92 | 0.96 |
| embroidery | 0.78 | 0.90 | 0.78 | 0.84 |
| screentone | 0.73 | 0.87 | 0.77 | 0.88 |
| art-deco | 0.81 | 0.91 | 0.73 | 0.88 |
| notebook | 0.80 | 0.89 | 0.81 | 0.88 |
| scrapbook | 0.74 | 0.82 | 0.66 | 0.83 |
| watercolor | 0.89 | 0.98 | 0.88 | 0.97 |
| midcentury | 0.69 | 0.89 | 0.80 | 0.87 |
| claymation | 0.37 | 0.81 | 0.39 | 0.77 |
| 11-04（spy fast／riso fast／silk-cold calm） | 0.33／0.19／— | 0.62／0.41／— | —／—／0 | —／—／0.39 |
| JIZURA | 0.46–0.63 | 0.31–0.73 | 0.07–0.63 | 0.31–0.73 |

### 參考：每幀變動像素比例與畫面分群版面數（每 30 秒）

| 世界 | 變動 fast | 版面 fast | 變動 calm | 版面 calm |
|---|---|---|---|---|
| silk | 5.2 % | 22.8 | 4.2 % | 8.4 |
| silk-cold | 4.5 % | 13.2 | 3.4 % | 9.6 |
| riso | 4.7 % | 14.4 | 4.5 % | 8.4 |
| file | 3.4 % | 6 | 3.0 % | 3.6 |
| spy | 4.4 % | 14.4 | 3.2 % | 10.8 |
| card | 5.0 % | 14.4 | 1.9 % | 4.8 |
| dark-glitch | 9.2 % | 14.4 | 4.8 % | 8.4 |
| neon-stage | 7.8 % | 16.8 | 5.7 % | 13.2 |
| terminal | 8.3 % | 21.6 | 5.3 % | 8.4 |
| led-board | 16.3 % | 15.6 | 5.1 % | 8.4 |
| ink-wash | 9.0 % | 19.2 | 5.9 % | 10.8 |
| silent-film | 9.6 % | 15.6 | 8.2 % | 14.4 |
| stained-glass | 7.5 % | 9.6 | 9.0 % | 2.4 |
| gothic-lolita | 7.2 % | 16.8 | 6.0 % | 7.2 |
| ukiyoe | 8.8 % | 24 | 8.2 % | 12 |
| papercut | 7.5 % | 19.2 | 6.8 % | 12 |
| paper-lantern | 11.3 % | 14.4 | 7.5 % | 13.2 |
| chiyogami | 10.8 % | 13.2 | 7.1 % | 14.4 |
| woodcut（不計） | 13.3 % | 18 | 9.8 % | 15.6 |
| chalkboard | 4.3 % | 1.2 | 3.5 % | 2.4 |
| aizome | 11.6 % | 12 | 6.2 % | 7.2 |
| crayon | 10.7 % | 20.4 | 8.4 % | 12 |
| popart | 3.4 % | 10.8 | 2.6 % | 7.2 |
| gameshow | 3.9 % | 15.6 | 2.2 % | 10.8 |
| idol-live | 6.6 % | 8.4 | 3.6 % | 2.4 |
| y2k | 3.2 % | 7.2 | 1.6 % | 3.6 |
| psychedelic | 8.1 % | 21.6 | 5.5 % | 15.6 |
| graffiti | 3.6 % | 16.8 | 2.3 % | 13.2 |
| brutalist | 4.8 % | 27.6 | 4.3 % | 14.4 |
| citypop | 2.9 % | 12 | 2.4 % | 10.8 |
| phone | 3.9 % | 12 | 2.5 % | 7.2 |
| blueprint | 1.2 % | 1.2 | 0.9 % | 2.4 |
| xerox | 4.1 % | 16.8 | 2.5 % | 8.4 |
| cyanotype | 5.8 % | 7.2 | 3.8 % | 8.4 |
| isometric | 2.5 % | 8.4 | 2.0 % | 7.2 |
| cel80s | 4.9 % | 8.4 | 2.9 % | 6 |
| document | 0.8 % | 3.6 | 0.9 % | 3.6 |
| embroidery | 2.9 % | 12 | 2.3 % | 6 |
| screentone | 2.7 % | 9.6 | 1.6 % | 7.2 |
| art-deco | 1.4 % | 3.6 | 1.0 % | 2.4 |
| notebook | 1.2 % | 7.2 | 0.8 % | 4.8 |
| scrapbook | 4.0 % | 8.4 | 2.7 % | 4.8 |
| watercolor | 3.1 % | 4.8 | 3.1 % | 7.2 |
| midcentury | 2.6 % | 12 | 1.8 % | 10.8 |
| claymation | 4.4 % | 7.2 | 2.5 % | 3.6 |
| JIZURA（中位） | 8.3 % | 19.2 | 6.0 % | 13.2 |

### 每項最差 5 個世界

- **fast 切換 0.15**：blueprint（0）、chalkboard（0.80）、art-deco（1.20）、document（1.60）、notebook（2.40）
- **calm 切換 0.15**：chalkboard（0.40）、idol-live（0.40）、blueprint（0.40）、art-deco（0.40）、notebook（1.60）
- **fast 硬切 0.3**：chalkboard（0）、blueprint（0）、idol-live（0.80）、document（1.20）、art-deco（1.20）
- **calm 硬切 0.3**：chalkboard（0）、idol-live（0）、art-deco（0）、terminal（0.40）、led-board（0.40）
- **登場種類（fast+calm）**：document（4）、watercolor（4）、claymation（8）、spy（9）、silk（10）
- **退場種類（fast+calm）**：document（2）、watercolor（4）、silk（8）、silk-cold（8）、riso（8）
- **停留事件（字墨變色，兩段合計比例）**：document（0.00）、screentone（0.00）、art-deco（0.00）、embroidery（0.05）、silent-film（0.11）
- **停留事件（畫面 >2 %，兩段合計比例）**：silk-cold（0.00）、blueprint（0.00）、cyanotype（0.00）、document（0.00）、embroidery（0.00）
- **關鍵詞放大段落覆蓋率**：排名沒有意義。38 個世界同為 8／17 段（0.47），silk、silk-cold、riso、file、spy、card、document 為 10／17（0.59）。放大的句子幾乎和世界無關（同一組句子），所以這一項是全面性的缺口，不是哪幾個世界的問題
- **鏡頭動作次數（兩首合計）**：document（0）、notebook（0）、spy（9）、silk（12）、file（12）

### 版面重疊（同歌詞同時間墨位置 IoU，2 fps）

- fast：平均 0.141（0.025–0.445），最像 5 對：stained-glass-nun/graffiti-nun 0.445、card-nun/graffiti-nun 0.384、graffiti-nun/document-nun 0.377、file-nun/stained-glass-nun 0.37、isometric-nun/scrapbook-nun 0.368
- calm：平均 0.119（0.022–0.4），最像 5 對：stained-glass-snow/graffiti-snow 0.4、stained-glass-snow/document-snow 0.395、file-snow/cyanotype-snow 0.393、graffiti-snow/cyanotype-snow 0.366、file-snow/graffiti-snow 0.361
- 11-04 全 22：fast 0.125（0.04–0.24）、calm 0.109（0.03–0.27）；JIZURA 六主題 fast 0.10（0.07–0.13）、calm 0.09（0.07–0.13）
## 哪些缺口是全面的，哪些只在部分世界

1. **全面性：快歌刀數。** 44 個世界只有 3 個到 15／10 秒，中位 8.0，JIZURA 19.2。修這個要改共用框架，不是改個別世界。
2. **全面性：關鍵詞放大的覆蓋。** 每個世界放大的都是同一組句子，最多 10／17 段有。這是共用的規則，不是世界的問題。
3. **全面性：比 11-04 退步。** 同 11 個世界 fast 11.2→9.2、calm 6.0→4.8；其中 9 個的計畫沒變，退步在渲染端（推論）。要先找出原因，否則新加的設計量不出效果。
4. **全面性但幅度較小：慢歌刀數。** 中位 4.8，只有 13／44 到 6。
5. **部分世界：同一頁停著不換。** blueprint、chalkboard、art-deco、document、notebook（還有 idol-live 的慢歌）：切換 ≤ 2.4、版面 ≤ 7.2。
6. **部分世界：沒有停留事件。** document、screentone、art-deco 都是 0，embroidery 1／19；畫面欄另有 silk-cold、blueprint、cyanotype、watercolor 是 0。
7. **部分世界：進退場與鏡頭。** document（登場 2、退場 1、鏡頭 0）、watercolor（2／2）、notebook（鏡頭 0）。其他世界都有 4–7 種登場、4–5 種退場、一種鏡頭動作。
8. **已經沒問題：** 風格之間的重疊（fast 0.141、calm 0.119，11-04 為 0.125／0.109，JIZURA 0.10／0.09）；最像的一對是 stained-glass／graffiti（0.445／0.40）。
9. **未量**：拍點準不準（沒聽聲音）、閱讀閘門（本輪沒跑）、付費版。

## 檔案

- `out/research/jizura-check/1109/measure-all37.json`：45 個世界 × 2 段的全部數字，加上重疊與 variety（檔名照指定，內容是 45 個）。
- `out/research/jizura-check/1109/sheets/`：90 張 2 fps 總覽。
- `out/research/jizura-check/1109/`：`measures/`、`hold/`、`layers/`、`overlap-*.json`、`variety-all.json`、`plan-*.json`、`calib/`、`tables.md`、`scripts/`（run.sh、textclip.mts、holdmeasure.py、aggregate.py，以及 11-04 程式的副本）、`small/`（960×540 副本，約 600 MB，可以刪）。
