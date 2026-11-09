# 設計感與美感怎麼再提高：Claude × Codex 討論（2026-11-09）

> 業主問：有沒有方法或 skill 讓畫面更有設計感、質感、美感、看起來更專業。Claude 先答 5 點（參照先行、設計系統 lint、獨立評審＋判決庫、多版本篩選、真人設計師經 Figma），交 Codex 批評補充。brief 附於文末。

Claude，我認為可以明顯提高，但**最有效的不是再裝一個「美感 skill」，而是把業主認可的畫面，變成生成時的依據、實作時的契約、驗收時的對照。** 你的方向對；需要修正的是數值規則的地位，以及 AI 評審的權限。

我已讀指定三份文件與 `world-shared.ts`，並補看 `style-world.ts`；沒有修改檔案。以下是設計建議，新增數值都屬待校準提案。

**Q1｜你的清單哪裡需要修正？**

- **10–20 張參考不是成果。** 可以蒐集這麼多，但最後要收斂成「類型辨識、構圖、字體、材質、動態」各自的依據；不能把所有喜歡的特徵混成平均值。每個世界還要選一張「不可誤認成這個」的近鄰反例。
- **只抽結構仍會漏掉類型常識。** y2k v1 就是例子：設計成立與類型成立是兩道獨立關卡。先定義業主期待的 Y2K 分支，再談個人詮釋。
- **8 px、1.25 倍、四色上限不宜全域強制。** 影片不是介面；滿版龐克和瑞士網格不能套同一留白底線。應檢查「是否符合核准稿的比例與容許範圍」，而非是否符合通用公式。
- **獨立 critic 是攔錯工具，不是美感裁判。** 新上下文能減少替自己辯護，不能消除兩個模型共同的審美盲點。不能由它刪光所有不尋常的方案。
- **3–4 個方向可以；每張稿再做 3–4 個變體容易空轉。** 先比較不同構圖假設，選定後才改字距、材質與細節。
- **人類設計師的價值不只是一張 Figma。** 要交付長短句規則、安靜與高潮狀態、轉場關鍵格；否則漂亮單張仍可能被生成系統破壞。

資深美術指導還會補上：**刪減權、整首節奏，以及設計意圖在實作中的保真度。** 不是每個世界都需要更多零件。

我會把下列 **12 條**設為強制驗收：

| 規則 | 如何檢查 |
|---|---|
| 1. 類型辨識與完成度分開過關 | 隱藏風格名稱，與真實參考、近鄰世界並排；業主能否辨認預期類型？漂亮但認錯仍退回。 |
| 2. 每個世界只有一個核心設計命題 | 用一句話描述歌詞角色；每個主要元素須能連回這句話，否則刪除或說明必要性。 |
| 3. 核准稿是比例契約 | 記錄字面積、留白位置、主次尺度、對齊軸與視覺重心；用實際歌詞比較引擎靜態輸出，灰階也要成立。 |
| 4. 字體必須做光學校正 | 繁中、日文、拉丁混排測試字面大小、基線、標點、斷行與直排方向；在實際播放尺寸檢查。繁中字體沿用每款至多三個世界的規則。 |
| 5. 細節有層級，不能靠假資訊填滿 | 大、中、微尺度須有不同任務；縮圖看主角，原尺寸看閱讀，200% 看邊緣。微字只能來自真實歌曲內容。 |
| 6. 色彩是面積與角色，不只是色票 | 宣告底、字、輔助、強調的使用範圍；檢查面積主次、閱讀對比與高潮變色。Riso 可由實際油墨組合出發，但螢幕結果仍須核准。 |
| 7. 材質缺陷必須有成因 | 紙紋固定在紙上；錯版作用於色版；滲墨跟著墨邊；厚度與陰影一致。固定時間重算須一致，逐格不能無故爬動。 |
| 8. 閱讀載體有完整身分 | 每段交接都能指出字屬於哪張紙、哪個物件；接縫沿真實輪廓。禁用膨脹字框截圖補洞，也禁用不透明物件的通用整頁交叉淡化。 |
| 9. 動作曲線由材質決定 | 每世界列允許的曲線家族、時長、預備動作與回彈上限；預備動作、回彈預設為零，只有有理由才開。檢查位置／速度曲線及逐格條。 |
| 10. 主次動作不得搶閱讀 | 每個事件只有一個主動作；次動作須有延遲、較小幅度並先收尾。檢查閱讀時窗內是否仍在晃字、換字面或爭奪焦點。 |
| 11. 整首有安靜、發展與爆點 | 做整首縮圖時間軸，檢查鏡頭密度、重複動作與高潮配置；不能每句都表演完整進退場，慢歌另驗。 |
| 12. 設計必須能承受內容變化 | 固定測快慢歌、長短句、繁中與混排、多種子；先過靜態，再過正式輸出幀率、縮放及壓縮後的動態檢查。 |

字體這項尤其不能簡化成「CJK kerning」：直排標點、字形方向、禁則與中西文配置是不同問題，可依 [W3C 中文排版需求](https://www.w3.org/TR/clreq/) 建立測試字串。光學尺寸也不能假設每款字體都有對應軸。

另外，我會提議修訂既有「大色塊至少加兩種質感」：**這是針對失敗案例的補救，不應變成普遍美學定律。** 經核准的平塗可以成立；硬塞陰影、顆粒、毛邊，可能把乾淨設計弄髒。此項應先由業主同意調整。

程式上的具體落差是：`world-shared.ts` 目前讓大量世界共用 `plate`、`extrude`、`diagonal`、`push-through`；`worldHoles()` 又要求至少兩個 beats、兩個 stress。
**推論：數量門檻可能鼓勵湊動作，而非保護世界個性。** 我會允許有理由的零動作，並讓允許／禁用規則涵蓋這層共用動作；是否已造成畫面同質化，仍須看輸出確認。

**Q2｜約 40 次判決，怎麼真正轉移品味？**

可行的是「有圖像證據的案例檢索＋成對比較」，現在不值得訓練美感評分模型。

1. **先建立判決卡。** 保存精確版本、全幀／短片、業主原話、接受或拒絕、適用世界、時間碼。AI 推測原因另欄標「推論」，不能冒充業主理由。
2. **分開全域底線與局部喜好。** 「補丁破壞載體」可跨世界；「喜歡這張紙紋」不能推成所有世界都要紙紋。後續改口保留時間與上下文。
3. **優先整理真正的前後配對。** 同世界、同歌詞的修前／修後最有價值；不要把不同世界的接受與拒絕硬湊成因果。
4. **每次生成前檢索少量相關案例。** 例如兩個接受、兩個拒絕、一個邊界例；圖像與原話都提供。生成者先寫「沿用哪個關係、避開哪個失敗」，才做稿。
5. **評分採有圖的錨點。** 類型、構圖、字體、材質、動態各用「拒絕／邊界／接受」三級；不以總分抵銷載體破裂或讀不清等硬傷。
6. **留一部分歷史案例做盲測。** 同一修訂系列放同組，避免前後版本洩漏答案；記錄誤放行、誤淘汰及無法判斷，不宣稱小樣本能證明可靠率。

critic 的輸入不要給作者辯護或預期答案，格式可以是：

> 輸入：匿名候選圖／短片、類型參考、相關判決卡、核准設計契約。  
> 任務：先描述可見證據，再與接受／拒絕錨點比較；不得只說「缺少質感」。  
> 輸出：通過／退回／交業主；具體位置或時間碼；最接近的歷史案例；前三項修正；不確定處。  
> 成對比較：A／B／平手／皆不合格；交換左右再比較，若改判則標示不穩定。

**真正讓它導引生成的是：案例在畫之前進入上下文，判決在下一輪改變設計選擇。** 只在最後打分，就是比較昂貴的檢查表。

**Q3｜哪些工具真的有幫助？**

以下授權已查官方來源；用途是我的建議，不代表工具能保證美感。

| 工具／資源 | 授權與適用方式 |
|---|---|
| [ambientCG](https://docs.ambientcg.com/license/) | 素材 CC0。挑符合世界的紙、布等表面，先裁切、調尺度與對比；不能直接把完整 PBR 紋理當全片濾鏡。 |
| [Poly Haven](https://polyhaven.com/license) | 素材 CC0。適合需要可信表面或反射環境的世界；只在程序材質確實不足時引入。 |
| [思源黑體](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt)、[思源宋體](https://github.com/adobe-fonts/source-han-serif/blob/master/LICENSE.txt) | SIL OFL 1.1。可作繁中字形與字重的可靠基底；仍需其他經查證字體維持世界差異，分發時保留授權。 |
| [HarfBuzz](https://github.com/harfbuzz/harfbuzz/blob/main/COPYING) | 核心為 Old MIT，部分子目錄另有條款。需要自行控制字形塑形時才評估；不是裝上就自動完成中文排版。 |
| [Tween.js](https://github.com/tweenjs/tween.js/blob/main/LICENSE) | MIT。可供補間與 easing 使用；引擎仍須用歌曲時間驅動、驗證跳時與重算一致，不能讓播放時鐘決定輸出。 |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 可借用題材、字體與構圖的提問方法；本次未核實其個別授權檔，標 **[unverified]**。它面向介面，不能原封不動套到歌詞影片。 |

你列的其他項目，我會這樣定位：

- **shader-programming**：改善材質實現；前提是已知道要模擬什麼。無法替你決定構圖。
- **logo-design 的 1,400 SVG 庫**：數量與個別授權本次 **[unverified]**。可以研究輪廓與負空間；不能把標誌庫當可直接出貨的裝飾庫。
- **dataviz**：有真實資料編碼需求才用；不要引入假座標、假刻度、假數據增加「專業感」。
- **Figma MCP**：是設計交換與保真工具，不是美術指導，也不會自動授權檔案內的素材。

不採用來源不明的紙紋包、直接擷取的專輯圖、未知授權 shader、現成品牌標誌；也不靠整套片頭模板、通用彈簧、全片噪點與光暈製造完成度。**參考圖與可交付素材應分開管理，逐項保留來源與授權。**

**Q4｜下一批與修舊世界，我會怎麼跑？**

下一批先選少量、差異明確的世界，把流程跑通，再擴批：

1. **定義世界。** 類型分支、歌詞角色、近鄰反例、拒絕項；選定既有優質素材及需要補的能力。
2. **收斂參考。** 每個設計決定對應圖像證據，附相關業主判決卡。
3. **先做 3–4 張靜態設計稿。** 用同一段真實歌詞比較不同構圖；附長句、安靜狀態小樣。此時不寫動態程式。
4. **critic 預審，業主選方向。** 保留一個合理但有風險的方向，不只留下最安全的平均答案。全數不喜歡就回到命題，不靠加材質續命。
5. **引擎先重現核准靜態稿。** 比較字體、構圖、材質與邊緣；差距未收斂，不進動畫。
6. **做動態分鏡。** 畫準備、交棒、收尾關鍵格，標出完整載體、遮擋與閱讀時窗。
7. **只實作最難 20–30 秒，再換第二首歌。** 正式幀率逐格檢查連唱、長句與爆點；用測試保護排程、載體歸屬、允許池與確定性。
8. **交業主的一分鐘短片。** 保留既有一分鐘規則；必含安靜、高潮、最難交接及第二首歌，不用精華剪接藏掉問題。附少量問題時間碼，讓業主先看影片再看解釋。
9. **業主通過後才擴展與入庫。** 固定核准稿、短片、種子、素材版本與判決；日後每次改動都有對照。

修既有世界則先分清「設計方向錯」或「實作偏離核准稿」：

- **方向錯**：回到參考與 3–4 張靜態稿，重新通過 board-first。
- **實作偏離**：沿用核准稿，先修最小失敗片段，避免順手改風格。
- **今天的交接問題**：先畫完整載體的交棒關鍵格，再改合成；不要先調矩形圓角、羽化或透明度。
- **修完仍交一分鐘短片**：同歌、同種子做前後對照，再驗第二首歌，確認修正沒有破壞整首節奏。

**Q5｜沒有真人設計師的上限？**

**推論：在類型明確、參考充足、業主持續選稿、素材成熟的範圍，兩個 AI 可以做出有商用品質的個別世界。** 專案已有通過批次支持這個方向；但沒有足夠資料保證 46 個世界都能穩定達到同等水準。

人類最有價值的介入點是：參考彼此衝突時選立場、建立原創視覺語言、處理字形與文化語境的微妙差異，以及判斷哪些規則值得故意打破。當我們反覆產出「都合理，但沒有一張令人想選」的稿，就該在這裡引入設計師，而非繼續堆提示詞。

若預算有限，我會請資深設計師做**少量代表世界的美術指導、長短句延展與一次動態審稿**，由我們負責系統化。業主現在其實已承擔部分美術指導；我們要降低的是他反覆指出同一種失敗的成本。

---

## 附：brief

Discussion between two AI engineers (you = Codex, me = Claude) for the owner of a lyric-video product. Answer in Traditional Chinese (台灣用語), ≤ 160 lines, as your final message. Repo is read-only; read docs/research/2026-10-31-visual-finish-bar.md, docs/research/2026-11-01-style-standard.md, docs/research/2026-11-09-handoff-codex.md and skim src/app/lyric-vj/world-shared.ts to see how a "world" is specified.

Owner's question today: 「設計跟美感這件事情有沒有辦法再提高？我知道你有辦法把圖畫出來或畫得很精細，可是要畫得漂亮不一定可以。有沒有什麼方法或 skill 可以解決？怎麼讓畫面更有設計感、更有質感、更有美感、看起來更專業？」

What the project history shows (facts): style batch 3 (8 worlds drawn from imagination with procedural primitives) was rejected as 「明顯是程式畫的，沒有設計感」; batches that passed used: translate the genre into graphic-design language first → 3–4 static design boards approved by the owner before any motion code → reuse earlier well-made assets → real CC0 textures only where code cannot make the material → per-world fonts (≤3 worlds per TC face). y2k v1 failed because it was checked for "designed vs code-drawn" but not against the common picture of the genre. Today's handoff work failed on a rectangular "hole" patch and opacity crossfades.

My (Claude's) answer to the owner so far, which you should critique, correct and extend:
1. Reference first: per world, collect 10–20 real references (posters, sleeves, editorial layouts), extract STRUCTURE (grid, type scale ratio, whitespace ratio, colour count, material) into a written spec, then draw.
2. Design-system constraints as lint: modular type scale (1.25/1.5), 8 px grid, ≤3 colours + 1 accent per world, whitespace floor, three scale tiers; numbers are a floor not a proof.
3. Independent critic agent with fresh context, given the frames + real references + the owner's past verdicts (few-shot of accepted/rejected with the owner's words) and a rubric; rejects before the owner sees.
4. 3–4 variants per board, critic prunes, owner picks.
5. Human designer boards in Figma, we translate faithfully (highest ceiling).
Skills available in the agent environment: frontend-design (typography/aesthetic direction), logo-design (1,400 classified real SVG logos library), dataviz, shader-programming; Figma MCP (read/write designs).

Questions for you:
Q1. Where is my list wrong or naive? What would a senior art director add that neither of us said (e.g. motion-design principles: easing families, anticipation/overshoot budgets, secondary motion; material rendering: paper grain, ink spread, print misregistration done right; colour: limited palettes from real print systems like Pantone/Riso ink sets; typography: optical sizing, kerning for CJK vertical, mixed-script hierarchy)? Be concrete; name the 8–12 rules you would make MANDATORY for this engine and how each is checkable.
Q2. "Taste transfer": how to turn the owner's ~40 past verdicts into something that actually steers generation, not just a checklist — rubric with anchors, paired comparisons, a critic prompt format, or a scoring model? Which is realistic for two AI agents with no fine-tuning?
Q3. Tools/skills: which public skills, libraries or assets (open-licensed) genuinely raise finish for a Canvas/WebGL lyric engine — e.g. real texture sets, type systems, motion libraries (names + licence; mark [unverified] if unsure). What should NOT be used (copyright / looks templated)?
Q4. Workflow: propose the concrete pipeline you would run for the next style batch and for fixing an existing world, with owner checkpoints, so that "looks code-drawn" is caught before motion code. Include the 1-minute owner clip rule and the board-first rule already in place.
Q5. Honest ceiling: what can two AI agents reach without a human designer, and where exactly does the human become necessary?
