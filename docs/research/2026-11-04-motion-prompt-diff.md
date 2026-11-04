# Motion Prompt 新增效果對照（2026-11-04）

來源：github.com/showheyohtaki/motion-prompt（MIT）。只讀 `api/v1/en/e/NNN.txt` 的名稱與「What happens」說明；本文件的描述全部用我們自己的話重寫，沒有抄任何程式、shader、常數或色值（origins 規則）。

## 數量

| 時間點 | 效果數 | 依據 |
|---|---|---|
| 10-19 研究時 | 120（#1–120） | repo `b4b676e`（10-19）才加入 motion2 #121–144 |
| 10-21 refs-watch 已看過 | 144 | `out/knowledge/refs-seen.json` 的 motion-prompt 有 144 筆；`scripts/lyric-vj/typeplan.mts:210` 寫明 10-21 學過 #121–144 |
| 現在（repo HEAD `7819d38`，10-29） | 192 | 新增 lp2 #145–168（`bd6bf08`，10-23）、camera2 #169–192（`46614ed`，10-29） |

Threads 說的「168」是 lp2 之後、camera2 之前的數字。相對 10-19 新增 **72** 個；其中 #121–144 的 24 個 10-21 已經學進引擎，**真正沒看過的是 #145–192 共 48 個**。

`refs-watch.mts` 正是這件事的工具（clone、列出沒看過的 id、寫回 refs-seen.json）；本次為了唯讀，沒有執行它（它會寫 refs-seen.json）。下次學完這批再跑一次即可記為已看。

## 我們現有的詞彙（比對基準）

- 逐句登場／退場／停留：`src/app/lyric-vj/treatment.ts:30-32`（LINE_ENTERS 31 種、LINE_EXITS 18 種、LINE_IDLES 8 種）、`:50-54`（ENTER_KINDS、EXIT_KINDS、CAMERAS 只有 static/push/pan/parallax、TRANSITIONS、EMPHASIS_METHODS）
- 世界動作：`render/world-motion.ts:60/130/179`、`render/world-b3-motion.ts:11/46/65`
- kinetic 動作與鏡頭：`render/kinetic.ts:24-26`、`render/kinetic-more.ts`（MORE_FX）、`render/kinetic.ts:164` KINETIC_CAMS（snap roll flip shake tilt pan dolly crane orbit vertigo rack ramp freeze tiltshift pullback）
- 轉場：`render/transition.ts:11`（遮罩 22 種）、`render/motion-transition.ts`（動態轉場，含 push、blinds、pagecurl、pixelate、cube、dipblack、iris 等）
- 全畫面打擊：`render/screen-hit.ts:4` 只有 zoom、tile 兩種
- 注意：鏡頭詞彙大多只在 kinetic 層；世界模板的鏡頭欄全是 push（`docs/research/2026-11-04-jizura-comparison.md:75`）

狀態定義：**have** 已有等價動作；**weak** 有近似但缺關鍵部分或只在某一層；**missing** 沒有；**n/a** 不適合歌詞影片。
缺口欄對應 `2026-11-04-jizura-comparison.md:104-110` 的五項：**H** 停留事件、**R** 慢歌多刀、**S** 字級對比、**E** 進退場種類（含會動的退場、銜接）、**C** 打擊＋鏡頭。

## #121–144（motion2，10-21 已學）

| # | 名稱 | 狀態 | 缺口 | 動作（我們的話） |
|---|---|---|---|---|
| 121 | Anticipation | have | E | 先往反方向縮一下蓄力，再彈出去；= enter `windup`、`squash` |
| 122 | Follow-through | have | E | 主體急停後，附屬的部分還在晃、慢慢停；= enter `settle` |
| 123 | Bounce | have | E | 掉下來一次比一次彈得低直到停；= enter `drop`/`settle` |
| 124 | Wiggle | have | H | 一直不規則小抖；= emphasis `shake`、hold `hand-shake` |
| 125 | Pulse | have | H | 心跳式雙拍放大，外圈擴散；= idle `thump`、fx `pulse` |
| 126 | Motion path | have | — | 物件沿虛線路徑飛並轉向；= fx `glide` |
| 127 | Ping-pong loop | have | — | 走到底再原路倒回，循環；loops 已涵蓋 |
| 128 | Stop-motion style | have | H | 低格率跳步、每格微偏；= idle `hop` |
| 129 | Text scramble | have | E | 亂碼由左到右鎖定成正確字；= enter `decode`、exit `scramble` |
| 130 | Wave text | have | E | 字母依序上下起伏成波；= enter `wave-reveal` |
| 131 | Text on a path | have | — | 一行字沿波浪線流動、每字順線轉；= fx `path` |
| 132 | Variable font | have | H | 同一字由細到極粗再回來；= emphasis `weight` |
| 133 | Text mask | weak | S | 粗字挖空，只在字形裡看得到會動的畫面；引擎有 text mask 目標（`engine.ts:2457`）但沒有「字裡透出背景景物」的選項 |
| 134 | Repeater | have | — | 一個形狀沿圓複製、錯拍轉動脈動；fx `ring`、`kaleido` 近似 |
| 135 | Kaleidoscope | have | — | 八向對稱圖樣旋轉外擴；= fx `kaleido` |
| 136 | Line boil | have | H | 手繪線每幾格抖一次、畫面本身不動；= idle `boil`、`crayon-boil` |
| 137 | Push | have | E | 下一景從側邊推進把現景擠出；= 轉場 `push`、`lyric-push` |
| 138 | Blinds | have | E | 細條間縫變寬直到下一景全開；= 轉場 `blinds` |
| 139 | Cube | have | E | 像立方體轉面換景；= 轉場 `cube`、fx `cube` |
| 140 | Page curl | have | E | 從角落翻頁露出下一頁；= 轉場 `pagecurl` |
| 141 | Pixelate | have | E | 越來越粗的馬賽克，最粗時換景再變清楚；= 轉場 `pixelate`、exit `pixel` |
| 142 | Shatter | have | E | 畫面如玻璃裂開碎片飛走；= exit `shatter`、遮罩 `shatter` |
| 143 | Exploded view | have | — | 物件分層拆開再合回；= fx `layers` |
| 144 | Split screen | have | R | 一格拆成兩格再三格各自動；= fx `panels` |

## #145–168（lp2，網頁效果，未看過）

| # | 名稱 | 狀態 | 缺口 | 動作（我們的話） |
|---|---|---|---|---|
| 145 | Timeline on scroll | n/a | — | 一條線往下長，碰到節點就點亮並滑入年份與事件；是網頁的歷程表，歌詞極少有編年結構 |
| 146 | Scroll text reveal | have | H | 淺灰標題逐字變深；= enter `karaoke` |
| 147 | Stacking cards | weak | E | 下一張卡從下方升起疊在上一張上面，被壓住的那張微縮、變暗；我們有卡片登場（`card-land`）和 fx `stack`，但沒有「上一句被下一句壓下去」這種連動退場 |
| 148 | Background color change | weak | H | 進入新段落時整個底色漸變到下一色，深底時字自動轉白；我們每段可換世界與 warmth，但沒有同一版面內的整片底色漸換＋字反色 |
| 149 | Hide-on-scroll header | n/a | — | 往下捲標頭收起、往上捲回來；介面行為 |
| 150 | Scrollspy | weak | H | 目錄跟著閱讀位置，正在讀的那項亮起並移交；可轉成「整段歌詞列表、唱到的那句亮」，我們只有單句 karaoke、沒有列表版面 |
| 151 | Back-to-top | n/a | — | 圓形按鈕出現、按下回頂端；介面元件 |
| 152 | Zoom on scroll | weak | S | 中央小圖放大到滿版，周圍文字淡掉，標題浮上；我們有 `zoomin` 轉場、`fill`，但沒有「小物件長成整個畫面、同時周圍讓位」的字級對比用法 |
| 153 | 3D tilt + glare | weak | H | 卡片隨游標往深處傾斜，表面一道反光掃過；我們有 emphasis `shine` 與 cam `tilt`，但沒有字卡實際 3D 傾斜＋反光同步 |
| 154 | Spotlight hover | have | H | 暗色面上只有一圈被照亮；= world `spot-on`、`beam-sweep` |
| 155 | Image swap on hover | n/a | — | 商品正面交叉淡到背面；電商用 |
| 156 | Text roll | weak | H, E | 字逐個往上滾出，同一個字換強調色從下方逐個滾進；我們有 `slot` 登場與 `rise` 退場，但沒有「同一句原地翻成另一色」的停留事件／交接 |
| 157 | Hover image reveal | n/a | — | 滑到清單列時旁邊浮出跟著游標的圖；需要游標 |
| 158 | Floating label | weak | S | 標籤縮小並移到框線上，讓出內容位置；可轉為「上一個大字縮成角落小註記」，我們沒有字從主角縮成註記的動作 |
| 159 | Inline validation | n/a | — | 欄位紅錯誤→綠勾；表單行為 |
| 160 | Loading button | n/a | — | 按鈕縮成圓轉圈，再展開成完成勾；介面行為 |
| 161 | Shared element transition | missing | E | 清單裡的同一張圖直接長成下一頁的主圖、其他東西換掉；轉成歌詞＝上一句的某個詞留下來，移動、放大到下一句裡它的位置。比對文件 `:74` 指出我們沒有「上一句變成下一句」 |
| 162 | Lightbox | weak | S | 頁面變暗，被點的縮圖放大到中央，關閉時縮回原位；我們有 emphasis `scale`，但沒有「底壓暗＋一個詞從原位飛到中央放大再回去」 |
| 163 | Hotspots | n/a | — | 產品圖上脈動圓點、點開說明框；說明型 |
| 164 | Countdown timer | have | — | 只有變動的位數上滑換掉；= fx `counter` |
| 165 | Shape divider | have | — | 兩層波浪分界緩緩搖；fx `flow`、world `wave-in` 近似，屬裝飾 |
| 166 | Like button | have | H | 心形彈跳填色、周圍粒子爆開；= emphasis `symbol`、fx `sparkle` |
| 167 | Scroll-down cue | n/a | — | 滑鼠圖示與箭頭重複往下；介面提示 |
| 168 | Background video | have | H | 背景雲浪持續動、標題按鈕不動；即世界背景常態 |

## #169–192（camera2，鏡頭與剪輯，未看過）

| # | 名稱 | 狀態 | 缺口 | 動作（我們的話） |
|---|---|---|---|---|
| 169 | Pedestal | weak | C | 鏡頭垂直升起不改方向，地平線不動、景物往下滑；kinetic 有 `crane`，世界層沒有 |
| 170 | Barrel roll | weak | C | 繞鏡頭軸整整轉一圈再回水平；cam `roll` 只是小角度回正，screen-hit 也沒有旋轉 |
| 171 | Hyperlapse | weak | R | 邊往前移、光影行人快轉；fx `corridor` 有前進，沒有時間快轉，需要場景，次要 |
| 172 | Long take | n/a | — | 一鏡到底不切；是剪輯理念，不是動作 |
| 173 | Steadicam | have | H | 平順往前跟、只有慢慢的微晃；即世界的慢漂 |
| 174 | Follow shot | n/a | — | 從背後跟著走動的人；需要角色動畫，文字層用不上 |
| 175 | Locked-off | have | — | 完全不動的機位；= CAMERAS `static` |
| 176 | Fly-through | missing | C, E | 鏡頭朝牆上的開口前進、穿過去進入另一邊的場景；比對文件 `:110` 要的「推穿」。fx `window` 只有框景不穿過 |
| 177 | Low angle | weak | C, S | 鏡頭貼地往上看，人顯大、建物高聳；kinetic 有 `stage` 透視，但字沒有仰角排法 |
| 178 | High angle | weak | C, S | 鏡頭升高往下看，人變小、地面佔滿；同上，沒有俯角排法 |
| 179 | POV | n/a | — | 第一人稱，畫面下方有手；需要角色 |
| 180 | Over-the-shoulder | weak | S | 前景一個模糊的肩頭壓在畫面邊，主體清楚；有 `bokeh`、`tiltshift`，沒有「前景模糊大物件框住字」 |
| 181 | Bird's-eye | weak | C | 正上方俯視，畫面隨上升看到更多；fx `corridor` 是正視，世界沒有俯視底 |
| 182 | Deep focus | n/a | — | 前後景同時清楚；是靜態屬性 |
| 183 | Establishing shot | weak | H | 高處遠景慢推，左下角出現地點字卡；fx `chapter` 有段落卡，但世界開場沒有「遠景＋地點小字」 |
| 184 | Extreme close-up | weak | S, C | 從臉部特寫推到只剩眼睛；轉成字＝從整句推進到單一字，字大到出血。cam `vertigo`/`dolly` 推幅很小（`kinetic.ts:403`），沒有推到單字 |
| 185 | Insert shot | missing | H, S | 句中插入約 1 秒多的局部大特寫，再回到原來的同一個畫面；轉成字＝停留中途切到關鍵詞出血特寫，然後回原版面不變 |
| 186 | Morph cut | weak | E | 同一人兩段影像用位置姿態內插接起，沒有跳；轉成字＝前後兩句同版面時字形滑到新位置而不是硬切。轉場 `lyric-chain` 只鏈接、不內插 |
| 187 | Fade to black | have | E | 全黑再從黑亮出下一景；= 轉場 `dipblack` |
| 188 | Iris out | have | E | 圓圈收到全黑再打開；= 遮罩 `iris`、world `iris-close` |
| 189 | Cutaway | weak | R | 從主體切到別的對象再切回；可轉為長句中切到世界裡的物件一下再回字，我們的道具層不會插刀 |
| 190 | Cross-cutting | missing | R | 兩條同時發生的線交替剪，刀越來越短；轉成字＝一句長慢句在兩個版面／世界角落之間來回切、刀距縮短。比對文件 `:107` 的慢歌一句一刀正是這個 |
| 191 | Bullet time | weak | H, C | 跳到最高點時間幾乎停住、鏡頭繞人轉；我們有 cam `freeze` 與 `orbit` 但不能同時用 |
| 192 | Montage | weak | R | 七個短鏡頭直切、右上日期跳；fx `counter`/`chapter` 有數字，沒有「一句切多個極短版面」的剪輯 |

## 分類統計（72 個）

- have 33（#121–144 中 23 個、#145–192 中 10 個）
- weak 22（#133、lp2 8 個、camera2 13 個）
- missing 4（#161、#176、#185、#190）
- n/a 13（lp2 9 個網頁介面行為、camera2 4 個理念或需要角色）

## 建議要做的清單（依缺口優先排序，≤12）

1. **#185 插入特寫 → 停留事件**（H、S）：句長 ≥1.5 秒時，中段切 0.8–1.3 秒到關鍵詞出血大字，再切回完全相同的原版面。直接補「停留沒有事」與「字級單一」兩項，且是硬切、不靠新素材。
2. **#190 交叉剪接 → 慢歌多刀**（R）：一句慢長句在同一世界的兩種構圖之間交替，刀距逐漸縮短；只在句意有兩方／兩地時用（遵守時刻看句意）。
3. **#184 極特寫推進 → 推到單字**（S、C）：鏡頭從整句推到一個字填滿畫面、字形出血，可作句尾或副歌起點；讀完才推（閱讀優先）。
4. **#176 穿越開口 → 推穿換句**（C、E）：鏡頭推進穿過字的內白或世界裡的窗洞，穿出時已是下一句的世界；比對文件第 5 項明列。
5. **#161 共用元素 → 上一句變成下一句**（E）：上一句的一個詞留下，平移縮放到下一句裡它的位置，其他字退場；需要兩句有同字或同詞。
6. **#156 文字滾換 → 原地換色停留／交接**（H、E）：字逐個往上滾出、同句換強調色從下滾回；停留中段做一次就是明確事件。
7. **#170 整圈翻滾 → 新 screen-hit 種類**（C）：副歌重拍時背景整圈轉一次，字照 screen-hit 規則保持清楚；每首 ≤2 次。
8. **#147 卡片疊壓 → 會動的退場**（E）：下一句的卡升上來壓住，上一句往後縮、變暗，留一點邊；退場不再只是淡出。
9. **#162＋#152 燈箱／放大 → 字級對比**（S）：底壓暗，一個詞從它在句中的位置飛到中央放大，句子其他字讓位；說完縮回。
10. **#186 形變接 → 慢歌銜接**（E）：前後兩句版面相近時，相同或相鄰的字形滑到新位置，取代硬切；calm 歌用。
11. **#177／#178 仰角／俯角 → 世界鏡頭角度**（C、S）：字放在透視地面上，仰角時高聳、俯角時變小，讓世界層第一次有 push 以外的鏡頭。
12. **#191 子彈時間 → 長音停格**（H、C）：唱長音時字與背景凍住、只有鏡頭慢慢繞；讓 freeze 與 orbit 可同時作用。

不建議：#145、#149、#151、#155、#157、#159、#160、#163、#167（介面行為）；#172、#174、#179、#182（理念或需要角色）。

## 備註

- 每項做的時候照既有流程：動作、knobs、help 行、測試，再跑 `origins.mts` 補一列（`scripts/lyric-vj/refs-watch.mts:1-4`）。
- 學完後執行 `npx tsx scripts/lyric-vj/refs-watch.mts`，把 #145–192 記入 `out/knowledge/refs-seen.json`。
