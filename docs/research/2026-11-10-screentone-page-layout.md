# screentone 整頁契約：Q3 尺度構圖重新開啟（2026-11-10，phase 4e）

The screentone whole-page layout contract (Codex `2026-11-10-phase4-codex.md` §4, r2 §5 point 4): one pure `pageLayout()` from the glyphs as drawn, every line present and the declared bleed edge, read by the scheduler (plan time, shaped measure), the renderer (before it commits the pose, and on every frame) and the verifier. Every invariant is a check (`verifyPage`) and a unit test; a page that has no legal solution is refused and the line stays on its original page, whole. Measured: invariants pass on every candidate the scheduler approves, so `WORLD_SCALE.screentone.withheld` is removed. Q3 stays opt-in (`VJ_SCALE`); default fingerprints unchanged.

**結論：已重新開啟。** 契約實作完成，所有不變量在量測上通過：計畫層 3 個 seed 的所有核准構圖都有合法整頁（`pageRefusedDrawn` 0）；閘門（screentone，VJ_SCALE 開，5 首）489 個時刻 fails 0、contract 0、退步 0，含 138 個逐幀頁面檢查；業主片段逐幀檢查見下方「片段」。因此 `world-shared.ts WORLD_SCALE.screentone` 拿掉 `withheld`。仍是 opt-in（`VJ_SCALE` / `scaleContrast`），預設輸出逐位元組不變。

## 契約（實作版）

`src/app/lyric-vj/render/page-layout.ts`（純函式，無 DOM／THREE）。

- **輸入**：`page`（該句 set 的頁面，如 `screentone/shout`，決定載體種類）、`edge`（事件宣告的出血邊，只接受 `top`／`bottom`）、`lines`（此刻在場的每一句：每個字的 em 框（frame px，y 向下）、字級、show；被放大的那句 `scaled`）。
- **輸出**：一個頁面解或拒絕（`noPageSolution: …`）。頁面解＝
  - **一個分格**：看板 b 的單一寬格（60,60–1860,1000，框線 7 px）。`bleed` 時在宣告邊開口、跟著出畫（`open: 'top' | 'bottom'`）。舊頁的其他分格一律不畫：沒有字的格不存在，也就沒有內部舊格線。
  - **放大句的載體**（依頁面種類）：shout／burst／sfx → 尖刺爆炸框（圓角底框＋外刺，刺長 44 px、間距 104 px）；balloons → 圓角對話框＋固定尾巴（根寬 110 px、長 96 px，batch-5 卡 `2026-11-09-screentone-balloon-thin-line` 的短寬楔形）；narration／caption → 旁白框（44／34 px 內距）。尾巴是外框路徑的一部分（拼接進輪廓），不是另一塊。
  - **其他在場句**：各自一個旁白框（46／40 px 內距），必須在格內、不碰放大句的載體、彼此不重疊。
  - `foot`：頁腳（時間碼）在出血邊的對側。
- **模式**：先試 `closed`（輪廓連同 stroke、尾巴全在安全區內），不成再試 `bleed`（只從宣告邊出畫）。兩者都不成 → 拒絕。`pageLayout` 回傳前一定先跑 `verifyPage`，有任何違反就不回傳那個解。
- **計畫層（同一份量測）**：`scale-policy.ts fitOf` 對 `ground:` 載體（頁面自己畫載體的 set）改用 `pageGlyphRoom(page, edge)`：安全區∩分格內側，非宣告邊再留出載體需要的空間（`pageRoom`：spiky 99、oval 61、box 49 px），字的 em 框比字寬多出的 ¼ em 也算進去（`EM_OVERHANG`）；舊頁的 `clear` 區不再適用（舊頁不畫了）。`policy-candidates.ts scaleMissOf` 用 shaped measure 擺字後呼叫 `scale-pose.ts scalePage` → 拒絕記為 `noPageSolution: …`。該句有括號呼喊（call）→ `noPageSolution`（新頁不替呼喊擺載體）。
- **排程器**：`world-events.ts` Q3 拒絕條件新增：頁面載體的構圖，若**下一句**的 Q4 linked handoff 會把這一頁滑出 → `noPageSolution: the next line's linked handoff (Q4, fixed) carries the page out…`。原因：link 轉場把舊頁當成舊 set 的圖片滑出，不是整頁重排後的頁（2026-11-10 實測 66.87 s：舊頁以原版面加空爆炸框滑出）。事件身分不變：核准的尺度構圖仍共用該句的 eventId（`shared`），不另加一刀。
- **渲染端**：
  - `world-layout.ts`：`scaleLayout` 後再跑 `scalePage`；拒絕 → 整句當 `miss`（原頁、原姿勢、折疊的 line-grow 還回去），**原子式**，沒有半套。通過 → 把字的 face（直立，帶 `scale: { edge, line, show }`）交給頁面。
  - 頁面載體的放大句，進場／退場改為同時長的「切」（`cutOf`：不位移、不縮放，只有出現／消失；link 類不變）：原本的 stack-rise（位移 130 px）、line-open／sfx-slam（放大 1.22–1.25）、page-flip-out（位移 140 px）會把字帶出載體。WORLD_SCALE 宣告的 curve 本來就是 `cut`。
  - `world-b5-screentone.ts`：六個頁面都包一層 `orRelaid`：有放大 face 時，**整頁**改畫 `pageLayout` 的結果（單格＋格內網點／集中線＋載體＋頁腳），不畫原版面；每幀都重新計算並 `verifyPage`。
- **驗證端**：
  - 每個輸出影格兩道檢查：(1) 頁面在當幀的在場句上重算 `pageLayout`（內含 `verifyPage`），失敗記入 `globalThis.vjPageChecks.fails`；(2) `engine.ts pageGlyphCheck`：該句**實際畫出**的每個字 em 框（含 textRoot 漂移、kick）必須在**同一幀**頁面畫出的載體輪廓內，且同幀確實有頁面（否則 `oneCarrier`）。`render.mts` 把結果寫進 `metrics.json pageChecks`，閱讀閘門把失敗列為 contract。
  - `world-events-adapter verifyWorldEvents` 不需改：計畫層的頁面判斷已在候選端（同一個 `scalePage`），核准事件的身分檢查沿用。

## 不變量 ↔ 檢查 ↔ 測試

`verifyPage` 的名稱（`PAGE_INVARIANTS`）；測試在 `src/app/lyric-vj/render/page-layout.spec.ts`。

| 不變量（Codex §4） | 檢查名 | 正向測試 | 反向測試（verifyPage 會抓到） |
|---|---|---|---|
| 每句恰一個主載體；未 show 的歌詞不填格 | `oneCarrier`；每幀 `pageGlyphCheck`（字在、頁不在 → oneCarrier） | carries every present line exactly once…；carries several lines present at once… | oneCarrier: a line with two carriers, or none |
| 載體含完整字形＋padding；字在 SAFE 內 | `balloonHolds`、`glyphsInSafe`；每幀實際字框 | holds the full glyphs and their padding… | balloonHolds: a carrier that no longer holds…；refuses… (glyphs past the safe area) |
| closed：輪廓＋stroke＋尾巴在安全區 | `closedInSafe` | closes a balloon round words… (closed mode) | closedInSafe: a closed carrier past the safe area |
| bleed：只從宣告的 top 或 bottom 出畫 | `bleedOnlyDeclared` | bleeds through the declared top edge only…；bleeds through the bottom edge as well… | bleedOnlyDeclared and bleedClip: a spike off the right side |
| 路徑閉合、不自交；裁切只在宣告邊 | `pathSimple`、`bleedClip`（畫框只在宣告邊切到輪廓，而且一定切到） | 同上 | pathSimple: an outline that crosses itself |
| 其他格承載合法在場句，否則移除；無空殼；合併後無內部舊格線 | `noEmptyPanel`、`noInnerPanelLine` | carries every present line exactly once… | noEmptyPanel and noInnerPanelLine… |
| 格距、讀序、主次；格線不穿字框 | `panelSpacing`、`readingOrder`、`hierarchy`、`panelLineClear` | carries several lines present at once… | panelLineClear and panelSpacing…；readingOrder and hierarchy… |
| 尾巴根部接輪廓、無碎片、不穿字或鄰格、沿用固定比例 | `tailAttached`、`tailWedge`、`tailClear` | gives the balloon page its short wide wedge tail… | tailAttached, tailWedge, tailClear… |
| 其他句的載體在格內、不碰放大載體 | `carrierClear` | carries several lines present at once… | refuses the page atomically… |
| 案例：上／下出血、長短句、中／日／Latin、同時多句 | — | lays short and long lines, Chinese, Japanese and Latin（3 種頁面 × 6 句）；bleeds through the bottom edge…；carries several lines… | — |
| 無合法解 → 拒絕、原子式回原頁 | `noPageSolution` | refuses the page atomically…；reports the page refusal at plan time and draws no composition on a refused page；approves only compositions whose whole page is legal… | — |
| 字不被進出場帶出載體 | 每幀 `pageGlyphCheck` | cuts a page-carried composition in and out… | — |
| 排程器與渲染端同一份幾何 | — | stands a page-carried ink box inside the page glyph room…；leaves a sheet carrier (riso) fitted as before | — |

## 數字

計畫層（`npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-scale-coverage.mts --phase 2 --world screentone --out out/research/q3-1109/phase4e.json`，5 首 × seed 0／1／2，0 次 API；「畫出」＝渲染端自己的 `scaleLayout`＋`scalePage` 在 shaped measure 下成立）：

| seed | 有唱詞段落 | 政策計畫 | 排程器核准 | 畫出 | edgeFit | unrealized | 有候選因 noPageSolution 被拒的段落 | 核准但頁面不成立 |
|---|---|---|---|---|---|---|---|---|
| 0 | 58 | 46 | 24 | 24 | 7 | 1 | 15 | 0 |
| 1 | 58 | 47 | 25 | 25 | 6 | 0 | 17 | 0 |
| 2 | 58 | 47 | 28 | 28 | 6 | 1 | 17 | 0 |

- 暫停前（v1，沒有整頁契約）是 30／36／35；少掉的主要是兩條新規則：下一句 Q4 link 會把頁滑出（seed 0：9 個候選）、句子有括號呼喊（seed 0：4）。逐段 `rows[].sections[].rejections`、`noPageSolution`、`chosen.page`（mode／edge／載體種類／尾巴）。
- 頁面模式（三個 seed 合計 77 次核准）：bleed/top 65（spiky 16、box 42、oval 7）、bleed/bottom 12（box 10、oval 1、spiky 1）；closed 0（edgeFit 都貼安全邊，closed 只在測試中出現）。
- 三年後的大雪 seed 0：c004（shout，2.4×）、c011（balloons，2.4×，帶尾巴）、c020（burst-r，edgeFit 2.4×）、c029、c036（caption，1.76／1.77×），全是 bleed/top。c013「這次我們的手沒牽好」現在被拒：下一句 c014 以 Q4 link 進場。

閘門（`VJ_WORLD_EVENTS=1 VJ_SCALE=1 … style-gate-reading.mts --out out/research/q3q5-1110/gate-4e --baseline scripts/lyric-vj/style-gate-rules.baseline.json screentone`）：489 個時刻 **fails 0、contract 0（含逐幀頁面檢查 138 幀）、rule regressions 0**；cross 7（baseline 4，與暫停時相同，靠 2 % 容許）。`out/research/q3q5-1110/gate-4e.log`、`gate-4e/screentone.json`。

預設指紋（`default-hash.mts`，5 首 × 45 世界，`out/research/q3-1109/hash-4e/`）：seed 0／1／2 = `12ec6c83…`／`b754f055…`／`9b13e671…`，`--q1` = `9422bbda…`，與交辦值相同。screentone 在 scale 關閉時計畫逐位元組相同，所以 Q1／Q2 不變。

測試：`npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json` 通過；`npx ng test --watch=false` 140 檔／1699（原 139／1671；新增 `page-layout.spec.ts` 28 個，`q3q5-wiring.spec.ts` 兩個暫停期測試改為重開後的版本）。

## 片段

`~/Desktop/vj/output/語意巨字與時刻_2026-11-10/v2/screentone_改前改後.mp4`（左＝改前 scale 關、右＝改後 scale 開；三年後的大雪 55–115 秒，seed 0，`--font Huninn --fps 30 --workers 1 --unconfirmed`，`nice -n 10`，每次渲染前等 `pgrep -f "scripts/lyric-vj/render[.]mts"` 為空）＋`說明.md`。treatment：`out/research/q3q5-1110/tr4e/screentone-snow-{before,after}/treatment.json`（`freeJob(…, { scaleContrast: true })`）。

- 放大句：c011「總在喧囂人群裡面找擁抱」（balloons，sectionScale 2.4×，圓角框＋尾巴，bleed/top）、c020「才想起大雪的那一天」（burst-r，edgeFit 2.4×，尖刺框，bleed/top）。v1 的 c013 現在被 Q4 出場規則拒絕，畫面與改前相同。
- 逐幀檢查（`clip/metrics.json pageChecks`）：頁面重排並 `verifyPage` 190 幀、實際字框對載體 181 幀，**失敗 0**；改前片段沒有任何頁面檢查（沒有放大句）。兩邊的 `readable` 未過的都是同一句 c043（1.07／1.13 s，既有，與本次無關），rendererErrors 0。
- 評審影格（匿名評審用，`out/research/q3q5-1110/critic-4e/`）：`screentone-snow_{63s,85s,57.5s}_{before,after}.png`。63 s 兩邊相同（c013 不再放大，且該幀是世界的翻頁進場）；85 s 是 c020；57.5 s 是 c011（中段）。

## 已知限制（未解決，照實列出）

1. **世界自己的翻頁進場（`manga-flip`）**：c011 55.20–55.56 s，翻頁紙從右往左蓋過整頁、只留字框，最後一刻整頁出現。這是 screentone 所有頁面共用的既有進場（核准稿動作），不是整頁契約的半套結果；逐幀檢查量的是當幀畫好的頁面，翻頁紙在其上。評審若認為「字在白紙上 0.36 秒」不可接受，要改的是世界的翻頁動作，不在本次範圍。
2. **對比與最低字級**：沿用頁面原本的墨色與紙色（字的墨色、載體填色與原頁相同），由閱讀閘門的規則量（low／plate／small 皆 0）；`verifyPage` 本身不量對比。
3. **多句同時在場**：契約與單元測試涵蓋（旁白框、讀序、主次、拒絕）；片段與閘門實際畫出的幀裡沒有出現頁面失敗，但沒有逐幀統計「多句在場」的幀數，無法說有多少真實多句案例被檢查到（沒有足夠資料）。
4. **大片空白**：放大句貼頂、整頁只剩一格時，下半部是集中線／網點的空格面（合法：單一大格），是否好看交評審與業主。
5. 覆蓋率下降（seed 0：30 → 24），原因是上面兩條拒絕規則，屬設計取捨。
