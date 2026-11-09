# 切換數退步的原因（b57c4d3 → 404d73f，2026-11-09）

**結論：chalkboard 的 10.0 → 0.8 是單一 commit 造成的：`686bcde`（file、card、chalkboard、stained-glass 照第二輪設計稿重做）。** 父 commit `b2c4780` 量 8.4，`686bcde` 本身量 1.6（5.3 倍）。這是那個世界本身重畫，不是共用渲染器的修正。計畫在 76–101 秒的切點完全沒變（27 個 section、10 個 shot，三個 commit 都一樣），變的是每個切點換上去的東西：舊黑板每個切點都在 5 種底之間換，而且有 wipe-pass 換場；新黑板只在兩張幾乎一樣的深綠板之間換，換句時也沒有換場。

**另外 11 個世界整體的下滑（以 spy 二分）找不到單一的共用 commit**，是好幾個小台階疊起來的。最大的一階也是單一世界自己的改動（`9b9d982`，spy 換字體）。詳見下面「spy」一節。

## 方法

- 照 `out/research/jizura-check/1109/scripts/run.sh` 的合成片段做法：`world-clip.mts --song nun --style <世界> --clip 76,101 --workers 1`，seed 0，既有的 `out/research/instant/plans/nun/meaning.json`，再用 1109 的 `measure.mts`（25 秒，ffmpeg 場景分數門檻 0.15 與 0.3）。只量合成片段，沒有量文字層。
- 每個 commit 都放在 `/private/tmp/claude-501/bisect-<sha>` 的 detached 工作樹，node_modules 和 out 用 symlink 指到 lyric-editing。舊 commit 的 `world-clip.mts` 還不吃 `--workers`，所以把 404d73f 版放進工作樹（只差參數解析那兩行）。一次只跑一支，`nice -n 10`，每支開跑前先等別的渲染結束。量完就刪片段，工作樹也全部移除了。
- 不用渲染的檢查：每個 commit 都用 `freeJob` 印出計畫（section 和 shot 的時間、每個 section 的 `fx` 底與 `world.slots`），拿來確認計畫的切點沒有變。
- 404d73f 的 chalkboard 重跑一次是 0.8／0，和 1109 一樣，所以這套方法重現得出來。

## 數字（雙截棍 76–101 秒，每 10 秒）

### chalkboard

| commit | 說明 | 切換 0.15 | 硬切 0.3 | 版面／30 秒 | 段數 |
|---|---|---|---|---|---|
| `b57c4d3` | 11-04 起點 | 10.0 | 4.8 | 18.0 | 26 |
| `b2c4780` | `686bcde` 的父 commit | 8.4 | 4.0 | 16.8 | 22 |
| `686bcde` | 黑板重做 | **1.6** | **0** | 4.8 | 5 |
| `404d73f` | 現在 | 0.8 | 0 | 1.2 | 3 |

`b57c4d3` → `b2c4780` 掉的 1.6 是中間那幾個共用修正（1c82a59「字後面不再墊柔光」那一批，見下面 spy 的數字），`686bcde` → `404d73f` 掉的 0.8 是之後的小修（4fdd610、6e8277c 等，沒有一個一個分開量）。

### spy（拿來代表 11-04 量過的那 11 個世界；計畫只差多了 `title`／`lang` 參數，section 數 35 = 35）

| commit | 說明 | 切換 0.15 | 硬切 0.3 |
|---|---|---|---|
| `b57c4d3` | 起點 | 9.2 | 3.2 |
| `dc73220` | `1c82a59` 的父 commit | 9.2 | 3.2 |
| `1c82a59` | 字後面不再墊柔光；雜訊記號讓出字的位置 | 8.4 | 2.8 |
| `5a534b4` | 9b9d982 的父 commit（中間包含 686bcde 等） | 7.6 | 2.0 |
| `9b9d982` | spy 改用 LXGW Marker Gothic | 6.0 | 2.0 |
| `248ea91`、`5ed275f` | | 6.0 | 2.0 |
| `8cd7fc7` | 一句留在自己的鏡頭裡 | 4.8 | 1.6 |
| `1708713` | 11-05 | 5.6 | 1.6 |
| `404d73f` | 現在（1109 的量測） | 4.8 | 1.6 |

二分（門檻：≥ 7 算好）最後停在 `9b9d982`（7.6 → 6.0）。但沒有任何一個 commit 讓 spy 掉到一半：每一階都在 0.8–1.6 之間（25 秒裡 2–4 個切點），加起來才是 9.2 → 4.8。

## 黑板的機制（686bcde）

- **底的種類**：舊版每一層張力都有好幾種會換的底，`b2c4780:src/app/lyric-vj/style-worlds-hand.ts:248`（`slate/stave/sun-patches`、`smeared/stave/doodled/colour-field`、`colour-field/doodled/smeared`，peak 是 `all-chalk`）。這幾種底彼此差很多：`colour-field` 和 `all-chalk` 用 `ink2` 側拿粉筆塗滿半邊（`b2c4780:src/app/lyric-vj/render/world-b2-chalk.ts:79-84`），所以每個切點都是一次大面積的明暗變化。新版只剩 `slate` 和 `worn`（`404d73f:src/app/lyric-vj/style-worlds-r2.ts:121`），`worn` 就是 `slate` 加上三條 alpha 0.05 的板擦弧（`404d73f:src/app/lyric-vj/render/world-b2-chalk.ts:145,147`）。計畫照樣在 27 個切點換 `fx`（例如 76.32 `slate` → 78.66 `slate` → 79.74 `worn`），但畫面上幾乎看不出差別，場景分數到不了 0.15。
- **換句的換場**：舊版 `transitions.line` 是 `lv([''], ['wipe-pass', ''], ['wipe-pass'])`（`b2c4780:…/style-worlds-hand.ts:250`），新版是 `lv([''], [''], [''])`（`404d73f:…/style-worlds-r2.ts:123`），換句時不再有 wipe-pass。
- **配色**：舊版有 5 套配色，包含亮底的 `pale-dust`（`b2c4780:…/style-worlds-hand.ts:231`），這首歌 seed 0 剛好抽到它，暗字在亮底上，每換一張底都很明顯。新版 5 套都是暗或中間調的板（`404d73f:…/style-worlds-r2.ts:102-106`，`groundBand` 是 `dark`、不翻，`:108`），這首歌抽到 `school-green`。推論：暗板加細粉筆字，字換了，整幀的亮度變化也很小，所以連換字都很少過 0.15（這和 1109 文件「讀數字時要注意」說的一樣）。
- 同一個 commit 也把 file、card、stained-glass 的 `transitions.line` 改成全空（`686bcde:src/app/lyric-vj/style-worlds-r2.ts:44, 82, 158`；舊的 file 換句用 `['push', 'blinds']`，在 `b2c4780:src/app/lyric-vj/style-worlds.ts:378-387`），card 的底只剩 `card/table`／`card/fan`（`:80`）。file 和 card 都在 11-04 那 11 個世界裡，1109 文件說 file 的 repose 在慢歌變成 0，原因多半也在這裡（推論，沒有另外渲染）。

## 是不是故意的

是。commit 訊息：

> ♻️ refactor(worlds): file, card, chalkboard and stained-glass rebuilt from their round-2 boards
> The four worlds the 2026-11-04 audit condemned, redrawn from the owner-approved round-2 boards (風格設計稿_第二輪) …
> - chalkboard: a deep green board, faint eraser arcs, the tray with sticks and eraser; the only chalk lines are a teacher's (underline, ring and arrow, a long rule, a column rule with the title). Chalk is pitted, never blurred.

意思是故意改成一張深綠黑板、只有很淡的板擦痕。切換數掉下來是這個設計的副作用，訊息裡沒有提，也沒有量。（對照：同一段時間的 `93b0469` 和 `7737367` 都寫明「owner wants density higher」，有量切換數。）

## 保留原意的修法（一段，不寫程式）

黑板保持一張深綠板、不回到塗滿的色塊和亮底，但讓計畫裡已經有的 27 個切點在畫面上看得出來，而且用的都是黑板真的會發生的事：每個切點擦掉一次（`worn` 不只是 alpha 0.05 的弧，而是一道看得出來的板擦帶，把前一句擦成灰，擦痕的位置和方向每次不同）；鏡頭在板面上換位置或換景別（左半板、右半板、近到看見粉筆孔，板溝跟著移），讓同一張板在不同切點有不同構圖；換句的換場在第 1、2 層用回板擦式的 wipe-pass，或者用第二輪設計稿裡老師的那幾種線（底線、圈加箭頭、分欄線）在切點一次畫上去。底的種類可以從設計稿再加一兩種同一塊板的狀態（剛擦乾淨的、寫滿擦過的、午後斜光照到的），但都要是深色板，配色也照設計稿只用暗或中間調。驗收：同樣用 seed 0 的雙截棍 76–101 秒，切換數回到改版前的 8–10／10 秒，閱讀門檻不能新增失敗。file、card、stained-glass 是同一個 commit 重做的，同樣的做法也該套用在它們自己的換場上。spy 這類慢慢累積下滑的世界，問題不在單一 commit；比較合理的做法是在 world gate 加一條「計畫切點有多少比例在畫面上過得了 0.15」的檢查，以後換字體或拿掉墊底時馬上會被看到（推論）。

## 沒有做的

- 11 個世界裡只二分了 spy 一個；silk、terminal、ukiyoe 等是不是同一串台階，沒有量。
- 慢歌（大雪 67–92）和文字層都沒有重跑。
- 實測量數字：`/private/tmp/claude-501/-Users-seitumbp2025-vjanalytics/b1656c41-c6be-4018-ab8d-17ab46a436d2/scratchpad/measures/`（暫存，不在 repo 裡）。
