# 字色量地面：每個字的墨色，量它實際站的地面（2026-11-12）

產品規則：**每個字的墨色，在它實際站的地面上，對比至少 4.5:1。**
過去的檢查只看「宣告」：`inkChecks`、`partGrounds`、`SetSpec.on / rowOn`（`render/hold-room.ts`）。
沒有宣告的多色地面就會漏掉。審查第三輪的逐像素探針抓到兩個例子：

- y2k/strips，choroin c006，12.91 秒的 `roll`：灰色鍵色壓在桃紅色上，只有 3.12:1。
- cel80s/ending-l，tsuzuki c010：第二段米白字站在淡紫天空上，只有 2.53:1。

這次改成「量」，不再只信宣告。

## 1. 做法

### 1.1 分工：計畫端（a）與繪製端（b）

**繪製端（b）是保證。** 每一行字建好、擺到畫面上的位置之後，`world-layout` 的 `measureInks` 會做以下幾件事：

- 在每個要讀的時刻，從字的 mesh 取得每個字的 em 框。時刻包括：姿勢靜止時，以及 hold 前、hold 的 25 / 50 / 75 %、hold 留下之後。所以 line-grow 這類會移動字的 hold，也是在字真正所在的位置量。
- 請引擎重畫那個時刻的背景（`engine.groundTones`）。做法和 `groundBehind` 一樣，畫的時候會替這一行讓位。
- 讀出每個字框內圈 80 % 的地面，取亮度第 10 和第 90 百分位兩個色調（`measured-ink groundTones`）。

接著依序決定墨色。一律以 `INK_AIM` = 4.8 為準；比 4.5 多留 0.3，是因為顆粒、纖維、筆畫邊緣會在畫面上吃掉一點對比。

1. **基本墨色。** 一段同色的字（一個部分、一列、鍵字）稱為一個 run。
   - 原墨色在每個字的地面上都讀得到：不動。
   - 讀不到：先把同一色相的明度移一點（OKLab 距離 ≤ 0.12）。
   - 還是不行：改用這個世界自己的墨色中讀得最好的那一個。
   - 還是不行（例如一行字同時壓在白色 CD 和深色天空上）：這一段保留原墨色，從第一個讀不到的字到最後一個，在字下鋪一條「讀得到的地面色」色帶（每個字的 em 框放大 6 %，相鄰的接成一條）。這條色帶就成為這些字的地面。
2. **有環的字**（keyline、海報色帶、y2k 的錯版粉紅、應援字的成員色環、黏土字的落影）：
   - 先分辨環是哪一種。環蓋住整個字的墨色（≥ 97 %，例如 keyline 或往外長的色帶）時，它就是字讀的地面。環只是偏移的一份（錯版、落影）時，它大多藏在字後面，不算地面，字改讀背後的畫面。
   - 算地面的環，取字的墨色底下實際的環色。這是從字和環的貼圖逐像素讀出來的，因為成員環每個字顏色都不同。
   - 只有「一個色調、等於它 slot 色」的環才會移動環的色調，字色不變。其他情況改動字色。
3. **材質字**（刺繡的緞面線、黏土、印刷顆粒）：
   - 畫面上的墨色不是 tint。檢查時先把字的貼圖縮到畫面上的大小、疊在地面上，再像閘門一樣讀出墨色。縮小在線性光下做，和 GPU 一樣。
   - 例：刺繡 tint `#1C2850`，畫面上是 `#565968`，在麻布上只有 4.47。
   - 標準是 `INK_AIM` + 0.2。
4. **站在自己載體上的字**（黏土的牌子、卡片）：
   - 地面是這行自己畫的載體，用它的 slot 色，不讀背景。
   - 色帶不會鋪在載體上。
5. **hold 的墨色**（roll、ink-run、light-sweep、beat-punch、ink-swap、line-ink-settle）：
   - 在 hold 的時刻，hold 墨色必須在它經過的每個字的地面上讀得到。站在色帶上的字，以色帶為地面。
   - 讀不到：先移一點。
   - 移完和字的本色太近（< 0.08）或還是讀不到：**拿掉這個 hold 的墨色**。hold 的動作保留，字保留本色。
   - 永遠不出現 < 4.5 的新墨色。
6. **signature 時刻**（`signature.ts`）：
   - 第一次畫某個時刻時先試畫一次，記下每個字的框（未唱的字以 ghost 畫出，所以位置都有），再把畫面還原。
   - 墨色在每個字框的地面上挑（`inkOnAll`），不再用整個區域的平均。
   - 分層輸出（`--layer text`）時，地面改讀後面的背景（`groundBehind`）。
   - 煙的色調（`signature-forms toneOver`）在分層輸出時也改讀背景，不再讀被清空的畫布。

7. **不是世界版型的行**（低於字級下限、改畫成 stair 的行）：`engine.bandUnread` 用同樣的方法量。讀不到的那一列，從第一個讀不到的字到最後一個，在字下鋪一條色帶，色帶跟著字的不透明度一起出現、消失。cel80s/ending-l 的 c010 就是這種行，它下修到 stair，所以先前的 hold 墨色檢查根本沒有經過它。

**計畫端（a）只補「頁面上看得到、但沒有 slot 的顏色」。**

- `SetSpec.tones`：可以填色碼或 slot 名稱。`partGrounds` 會把它們算進去，所以計畫不會排出畫面上讀不到的 hold 墨色。
- 掃過全部 SetSpec，量測確認漏掉的有兩組：
  - y2k/strips：箔條五個色標，加上蝴蝶夾的粉紅、紫色翅膀。蝴蝶夾正好壓在第一個字下面，這就是 3.12:1 的來源。
  - cel80s/ending 與 ending-l：黃昏天空三段，`#3B2380`、`ink2`、`#FF9F7A`。
- 其他多色地面（白色 CD、雲邊線、成員環），計畫端沒有辦法知道。這些交給繪製端量。

### 1.2 閘門：`scripts/lyric-vj/style-gate-ink.mts`

- 範圍：每個世界 × 5 首歌，seed 0，排程器關閉（`VJ_WORLD_EVENTS=1` 時是開啟）。
- 取樣時刻（每一行）：
  - 讀字時間的中點，以及結束前 0.08 秒。最後一行改為中點前 1 秒，因為片尾淡出會帶走它。
  - 每個 hold：前 0.15 秒、25 / 50 / 75 %，以及會留下的 hold 結束後 0.15 秒。
  - signature 的行：同樣的基本時刻，讀它自己那一層畫的字。
- 每個時刻畫兩張全尺寸畫面：一張有字，一張沒字。沒字的那張保留字站的東西：載體、色帶，以及字底下的環。
- 每個字：
  - 字框內，和沒字畫面相差 ≥ 60 的像素算文字像素。
  - 其中接近最常見文字色的才算墨色像素。如果繪製時知道這個字的墨色，就用它當提示，避免把放大字後面的複本當成墨色。
  - 每個墨色像素和同一位置的地面比 WCAG 對比。地面用沒字畫面周圍 ±4 px 的平均，所以紙的纖維不算一種地面。
  - 把字框切成 3 × 3，每格取中位數，字的讀數是最差的那一格。
  - **任何一個字 < 4.5 就是不合格。** 判定沒有寬限，只有下面列出的「不讀」情況。
- 不讀，但分開計數：
  - `moving`：這個字自己的進場或退場正在跑。逐字顯示時，每個字在它被唱到時才進場；進場中還不是讀的時刻。
  - `faint`：不透明度 < 0.35，也就是行自己淡入淡出、快要消失的那幾格。設計上本來就半透明的字（例如 paper-lantern 的紙燈字）照樣讀，因為那就是它被看到的樣子。
  - `unsung`：signature 還沒唱到的字。它的 ghost 色調本來就設計得很淡。
  - `small`：墨色像素少於 40。
  - 這些都是「進出場或刻意淡化」的畫格，不是讀字的時刻。

## 2. 數字（未完成）

### 2.1 怎麼取樣

全密度的探針太慢：機器限制一次只跑一個工作，而且要 `nice -n 19`。在這個條件下，一個世界要 25 分鐘以上，跑完 45 個世界的改前加改後要一天以上。所以改成分層取樣（`--sample 10`），改前和改後用同一套規則：

- 每個 hold：取中點；墨色會留下的 hold，再取結束之後一格。
- 每一行 signature：取中點。
- 一般行：依歌曲裡的行序，每 k 行取一行的中點（k = ⌈行數 / 10⌉）。
- 只跑 choroin 一首歌。

改前有 32 個世界是全密度跑的，用 `compare.py` 依同一套規則抽出同樣的時刻。另外 12 個世界是直接用取樣跑的。

### 2.2 改前（44 個世界，choroin，取樣）

- 有不合格字的世界：28 個，共 1548 個不合格字次。
- 依不合格字次排序：dark-glitch 355、neon-stage 217、embroidery 149、citypop 137、idol-live 80、isometric 76、spy 70、gothic-lolita 58、riso 57、led-board 56、silk 43、graffiti 42、popart 42、y2k 37、cel80s 24、paper-lantern 21、ink-wash 17、chalkboard 15、file 10、aizome 8、card 8、silent-film 8、silk-cold 8、cyanotype 5、blueprint 2、crayon 1、stained-glass 1、terminal 1。
- 沒有資料：watercolor 兩次都卡住，被看門狗停掉。

### 2.3 改後（只跑完兩個世界）

| 世界 | 改前 | 改後 | 狀態 |
|---|---|---|---|
| y2k | 37 | **0** | 完成 |
| dark-glitch | 355 | 355 | 完成。機制沒有改到它（見限制） |
| cel80s | — | — | 原本因 stack overflow 中斷，f049025 修好；重跑時又被看門狗在 45 分鐘停掉 |
| neon-stage | — | — | 被看門狗在 45 分鐘停掉 |
| 其餘 40 個世界 | — | — | 沒跑 |

小量驗證（有時間壓力前跑的 t-系列，choroin，非取樣）：

- embroidery 470 → 0；claymation 3142（改前全密度）→ 0。
- psychedelic、isometric 0。
- idol-live 1（beat-punch 的邊緣格 3.79）。

### 2.4 指令

```
seq.sh <worktree> out/research/ink/{before,after}
SONGS=choroin python3 compare.py before after summary-choroin.json
```

`seq.sh` 一次跑一個世界，`nice -n 19`，參數是 `--sample 10 --songs choroin`。

## 3. 三個指名的例子

畫格用 `ink-frames.mts` 抓，存在 `out/research/ink/frames/{before,after}`。

- **cel80s/ending-l，tsuzuki c010，Huninn。**
  - 這一行低於字級下限，改畫成 stair，所以 hold 檢查根本沒有經過它。
  - 改前：米白字壓在淡紫天空上，畫面看得到，但探針讀不到這種行。
  - 改後：鋪上深藍底帶，126.00 / 127.40 / 130.00 秒最差的字分別是 13.19 / 13.78 / 14.16。
- **y2k/strips，choroin c006，roll，12.91 秒。**
  - 改後的 y2k 取樣是 0 不合格。
  - 灰色 roll 被拿掉；字下面鋪了一條淺色底帶，因為最下面的「！」掉出箔條外。
  - 影片：第 1 段 0:10–0:15。
- **y2k tenmon c023 beat-punch（4.54，邊界）。** 沒有單獨重量。tenmon 沒有在取樣範圍內。
- **signature echo（scrapbook snow c043，167.44 秒）。** 逐字中位數 4.64，改前 t8 已經 ≥ 4.5，改後沒有重量。

## 4. 限制

- **繪製端的量測是估的，閘門量的才是畫面。**
  - 繪製端在建行時重畫背景來量。實際畫面還有很多它沒有算到的東西：行的漂移、畫面的晃動、鏡頭推拉、別的行讓位。
  - 所以繪製端多留了邊：每邊 10 px，`INK_AIM` 4.8，材質字再加 0.2。
  - 最後的保證是閘門，不是繪製端。
- **色帶是補救，不是設計。** 色帶出現的地方，通常是版型本身有問題：一行字太長、穿過自己的 `clear` 區，例如 y2k 的光碟；或一長句橫跨兩種底色。正確的做法是版型讓開。這次沒有改版型。
- **環的分類**用前三個字的貼圖判斷，門檻是覆蓋 97 %。
- **材質字的畫面墨色**是用貼圖模擬 GPU 縮小推算的，沒有讀真正的畫面。
- **計畫端**只宣告了量測找到、而且頁面固定會畫的兩組顏色（y2k/strips、cel80s/ending 系列）。光碟、雲邊、成員環這類東西，計畫端不知道；繪製端拿掉 hold 墨色時，計畫裡的 hold 仍然在（動作保留，只是不換色）。
- **閘門的時間**：沒有跑完。改前 44 個世界、改後 2 個世界，都只有 choroin、取樣。既有閘門規則 off/on、指紋、`ng test` 也都沒跑。
- **建行變慢**：`measureInks` 讓整首、非 live 的 render 初始化變得很慢。y2k 改後的 clip 用 `render.mts` 一般模式跑，超過 300 秒等待逾時，所以改後那一側改用 `--live`。這是產品端的效能風險。
- **dark-glitch 等世界沒有改善**：改後的讀數和改前一樣。推論：畫面在合成之後還有一層調暗、閃爍（`carrier-settle`、`flicker`），繪製端量的背景不包含這一層。
- **閘門的讀數**：
  - 字的讀數 = 3 × 3 格裡最差那一格的中位數。
  - 比一格的一半還細的線（例如雲邊）壓過筆畫，不一定會被判定不合格。
  - 低於 0.35 不透明度的淡入淡出畫格不讀。

## 2026-11-14: reading roles, opaque reveal, ink halo (ruling 2, docs/research/2026-11-13-ink-halo-codex.md)

Commits 9c727b1 (reading roles, shape gate, diagnostics, opt-in halo) and 31571f6 (opaque reveal by default).

dark-glitch × choroin, `--frames all` (out/research/ink/gate2/q1-halo-all), 6436 moments, 108 488 glyph-frames:

| run | fails | no-core | field-drift | enter / exit / rest / hold |
|---|---|---|---|---|
| fades (QA `--fade-reveal`) | 11 341 | 175 | 0 | 1708 / 1732 / 7320 / 581 |
| opaque reveal | 10 339 | 135 | 0 | 1612 / 826 / 7320 / 581 |
| opaque reveal + halo 4,6 | 6 585 | 135 | 0 | 815 / 675 / 4887 / 208 |

Every run is `complete: false`, because of its no-core glyphs.

The 6 585 left with the halo, by what the worst pixel was read against:
- ground 4 469 (3 756 of them with the ink lighter than the ground; c059 1 960, c002 368, c031 351). All are within the
  clean zone, so this is the ink's own colour against the ground: M3 territory.
- copy 2 034 (c045 522, c059 490, c013 351): the undeclared extrude and the ghosts next to the face.
- off 82: all `other` meshes at opacity 0.21 at 73.43 s. These are non-world word meshes the opaque reveal does not
  reach.
- shape `joins`: 125.

By worst ratio: under 1.5, 711; 1.5–3, 1 931; 3–4, 3 038; 4–4.5, 905.

No-core 135 (out/research/ink/halo/nocore-135.json): all mid-move (exit 102, enter 33), mostly c013 32, c061 26, c035 20,
c078 19, c074 16.
推論: the glyph is shown but drawn wholly outside the frame or behind its move's clip plane, so the mask has no pixel of
it. Not yet traced.

Reveal timing (reveal-timing.mts, 78 lines):
- no line becomes whole and opaque later than with the fades;
- the first visible frame is 1 frame later on 5 lines (c031, c042, c059, c064, c075).

Halo comparison for the owner:
- ~/Desktop/vj/output/字色可讀_2026-11-12/v4 (dark-glitch 146–156 s, popart 82–92 s; now, 4+2, 8+4).
- The four-way stills (ink-halo-compare.mts) stopped after the `now` pass: the halo page did not get ready within 600 s
  while the type-floor scan ran. To retry on an idle machine.
- The popart window shows no extrude blow.
