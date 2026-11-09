# 連唱換句的頁面交接：Codex 看逐格條後的設計意見（2026-11-09）

> `codex exec` 附 isometric 92.9 s、riso 114.5 s、notebook 88.2 s 三張 10 fps 逐格條（~/Desktop/vj/output/進退場家族_2026-11-09/seq）作答。brief 附於文末。

**保留「閱讀面穩定」，淘汰「按字框補回靜止截圖」作為通用解法。** 問題不只矩形或淡化：目前文字已屬於新頁，周圍空間卻仍屬於舊頁，載體的前後關係斷裂。改成圓角、斜角或更柔的羽化，仍然像補丁。

先修正我先前 Q4 的建議：「字不動、載體動」少了一個必要條件——**字下必須有完整、可信的承載物，而且交接時始終知道它屬於誰。** 閱讀閘門通過，只證明讀得到。

**1．哪些畫格證明問題**

以下各圖都按左至右、上至下編為第 1–10 格。

| 畫面 | 證據與判斷 |
|---|---|
| isometric 第 5–7 格 | 新階梯與文字先以矩形截圖片段出現；舊牆仍在離場。第 6–7 格又同時出現半透明牆面、階梯與柱體，空間關係變混濁。這同時證明「局部補回新頁」與「整頁透明度交接」都有問題。 |
| isometric 第 8–10 格 | 階梯完整後，斜向文字與側面重新成為同一物件。證明應保護的是**完整階梯載體**，不是文字的螢幕矩形。 |
| riso 第 5–7 格 | 圓形圖案被水平與垂直切口截開，第 7 格只剩細窄殘片；這裡即使沒有明顯混濁，也看得見切片運算。第 8–10 格乾淨，但不能挽救交接途中。 |
| notebook 第 5–7 格 | 上方舊頁、下方線圈本與直排文字周圍的紙面形成階梯狀接縫。矩形本身符合紙張語彙，問題是接縫沒有沿完整紙邊、裝訂或頁籤走。第 8–10 格才恢復清楚的整本關係。 |

程式原因也吻合：

- `engine.ts::linkHolesAt()` 用 `lyricRects + 24` 決定形狀，再依 `r.from` 與 `sec.start` 推定來源頁；它不知道真正的載體輪廓與交接狀態。
- `keepHoles()` 直接補回原位置截圖。所謂 36 px 羽化，實際是三層擴張矩形各以 `0.3` 疊上去，再補不透明核心；會留下帶狀混色。
- `linkSeat()` 另外讓整頁改變透明度。**只移除 `keepHoles()` 的羽化，仍會留下整頁重影。**
- `linkRelay()`、`linkOpen()` 主體沒有相同的整頁淡化，但最後補洞仍會破壞接力邊界。

**2．建議交接文法，依優先順序**

以下 `t=0` 是 A 結束、B 開唱；每列是 0.1 秒觀察點，僅為設計範例，不宣稱等於歌曲半拍。

**① 首選：先備妥閱讀面，再準時換字；兩段硬交接**

新頁的**完整閱讀載體**先在下層落定；A 的完整閱讀載體留到句尾。到零點硬切載體所有權與文字，之後只收走字外舊層。不要讓 B 先出現在未完成的新頁截圖上。

| 時間 | 觀眾看到 |
|---|---|
| −0.2 s | A 照常可讀；字外新頁邊緣開始接入。 |
| −0.1 s | B 的完整閱讀面已在下層定位，尚未顯字；A 的承載物完整。 |
| 0.0 s | A 換成 B；閱讀面一次交棒，無透明重疊、無移動字。 |
| +0.1 s | 舊頁外緣／襯層繼續離開，B 的閱讀面固定。 |
| +0.2 s | 舊層退出，只留新頁既有結構。 |
| +0.3 s | 全部落定。 |

閱讀風險：前置動作不得侵入 A；兩個載體重疊時，以不透明遮擋處理。沒有安全前置空間，就沿用閱讀面或直接切頁，不能硬塞。

修改處：`world-handoff.ts::linkGrounds()` 增加準備、交棒、收尾三個時間點，不能只掛固定 `dur: 0.5`；`engine.ts::linkHolesAt()` 改讀明確載體狀態；三個 `link*` 改用不透明遮擋，`linkSeat()` 移除整頁透明度動畫。真正兩個半拍應由節拍資料排程。

**② 次選：保留完整載體，沿它自己的輪廓換景**

適合 isometric：保留整個承字階梯，讓牆、柱、地面在它後面交接。輪廓由物件決定，不能只是把字框改成斜四邊形。

| 時間 | 觀眾看到 |
|---|---|
| 0.0 s | B 與完整新階梯一起硬切到位，包含踏面、側面與必要厚度。 |
| +0.1 s | 舊牆從階梯後方退出；階梯不動、不透明。 |
| +0.2 s | 柱體／地面沿自身幾何接入，沒有重影。 |
| +0.3 s | 舊場景退出。 |
| +0.4 s | 字外構件完成最後位移。 |
| +0.5 s | 新場景穩定。 |

閱讀風險：必須確認完整階梯能合理遮住舊景，且新場景不穿字；若透視或前後關係不成立，退回硬切。

修改處：`linkHolesAt()` 改傳載體 ID、輪廓與遮擋順序；`keepHoles()` 改為繪製完整載體層，不能再裁背景截圖。`linkRelay()`／`linkOpen()` 只處理字外場景；`groundLink()` 依世界能力選擇。這需要上游提供載體分層資料，單改矩形遮罩不夠。

**③ 條件式備選：既有紙籤跨頁留存**

適合原本就有紙籤的 notebook；riso 只有既有版面包含標籤時才用。不可每次換句都憑空生一張字幕卡。

| 時間 | 觀眾看到 |
|---|---|
| 0.0 s | 同一張固定紙籤上的 A 換成 B。 |
| +0.1 s | 舊頁從紙籤後方退出。 |
| +0.2 s | 新頁邊緣接上。 |
| +0.3 s | 新頁到位；紙籤仍是同一物件。 |
| +0.4 s | 字外頁邊收尾。 |
| +0.5 s | 紙籤繼續保留，不在唱詞中途拆掉。 |

閱讀風險最低，視覺風險是所有世界被做成同款字幕卡。

修改處：`world-handoff.ts` 保存跨句載體身分；`linkHolesAt()` 不再補洞；`link*` 僅換紙籤後方的頁面。紙籤本身需在載體層建立。

不建議預設採用「B 暫時印在 A 上，再換到底頁」：即使墨色合格，也多一次文字與材質重新配對。只有兩頁本來共用同一閱讀面時才成立。

**3．三個家族怎麼取捨**

| 家族 | riso／notebook 頁面世界 | isometric 場景世界 |
|---|---|---|
| `edge-relay` | **保留並修改，作為主力。** 接力邊必須是完整紙邊；riso 不可留下圓形殘片，notebook 要沿紙頁或裝訂結構。 | **修改後保留。** 讓牆邊、地面邊或完整物件接力；禁用整張場景平移加字框補洞。 |
| `layer-seat` | **修改。** notebook 適合不透明紙層依序落位；riso 僅在確實存在疊紙時使用。刪除整頁淡化。 | **移出連唱預設池。** 現行縮放、上移、淡化沒有可信的立體拆裝關係；日後有物件分層再重建。 |
| `frame-open` | **條件保留。** notebook 沿封面／頁邊；riso 沿既有版框，沒有框就跳過。不得用保護洞把圖案切碎。 | **移出連唱預設池。** 只有場景本來有門、屏風或可開啟牆面時才啟用。 |

`pickWorldMoves()` 應先按載體能力與安全時窗篩選，再做家族去重；不能為湊種類輪播。

**4．一個能抓到這次問題的腳本驗收**

新增 **「載體來源與接縫一致性」檢查**：以正式輸出幀率跑完整交接，另輸出每個像素的來源頁權重、載體 ID，以及設計允許的紙邊／物件輪廓。

同一項檢查有兩個失敗條件：

- **混濁：** 排除輪廓的 2 px 抗鋸齒區後，同一像素仍有 A、B 各超過 5% 的合成貢獻，即失敗。
- **補丁：** 來源頁交界沒有落在已登記的載體輪廓或接力邊上，卻沿著膨脹字框形成接縫，即失敗。合法紙籤的矩形會有載體 ID，因此不會被誤殺。

以上數值是**建議門檻，尚未實測**。推論：isometric 第 6–7 格會觸發混色檢查，第 5–7 格會觸發非法接縫檢查。這比偵測「畫面有沒有矩形」可靠，也能抓到換成圓角後仍存在的補丁。

---

## 附：brief

You are a senior motion designer reviewing a lyric-video engine's new "page handoff" between back-to-back sung lines (no gap between lines). Answer in Traditional Chinese (台灣用語), ≤ 120 lines, as your final message. Repo is read-only for you; read docs/research/2026-11-09-rhythm-gaps-codex.md (your earlier Q4 answer) and src/app/lyric-vj/render/world-handoff.ts, render/motion-transition.ts (functions keepHoles, link-relay-x/y, link-seat, link-open-*), render/engine.ts linkHolesAt.

Implemented: when line A ends exactly as line B starts, the words switch on time and do not move; the PAGE runs edge-relay / layer-seat / frame-open across the boundary (~0.5 s). To keep legibility, the engine keeps a "hole" = glyph box + 24 px with a 36 px edge fade, in which the page the words were set on stays still. Reading gate passes (ink ≥ 4.5:1, nothing crosses glyphs).

Attached images are 10 fps strips of three handoffs (isometric 92.9 s, riso 114.5 s, notebook 88.2 s; two rows of 5, read left→right, top→bottom). The owner's taste: rejects anything that "looks code-drawn" — bare rectangles, blurred blobs, muddy crossfades; loves crisp relays. In isometric frames 5–7 the incoming words sit on a cut-out rectangle of the NEW page while the old page is still lifting, and the two pages crossfade into mud.

Questions:
1. Is the "hole" concept itself wrong for a designer's eye, or only its rectangular shape / the crossfade? Say which frames prove it.
2. Propose the handoff grammar a designer would use for back-to-back lines (ranked, 2–3 options): e.g. incoming page seats fully under the glyph area BEFORE its words appear, words meanwhile on the old page with their own ink; hole cut along the carrier's own silhouette; hard relays only (no crossfade), motion split into two half-beats; words carried on a small card that bridges pages. For each: what the viewer sees per 0.1 s, legibility risk, where it would change in the named files.
3. Which of the three families should stay, change, or be dropped for back-to-back lines, per world type (page worlds like riso/notebook vs scene worlds like isometric)?
4. One acceptance check a script can run that would have caught the mud/rectangle problem.
