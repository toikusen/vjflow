**推論：最大收益在於讓現成效果真正作用於主歌詞，並補上版面與跨句銜接；不是再增加背景特效。**

以下為靜態程式碼稽核的**估算**，未實際渲染，沒有足夠資料確認視覺品質完全相當。觀察文件為 12 fps 取樣，格數不當成影片原始幀數。
HAVE＝機制與表現接近且編排可用；WEAK＝較簡化、僅背景或編排未接入；MISSING＝本次檢視未找到對應機制。
192 筆按主要用途各歸一次；混合觀察移除禁用配件後評估，核心屬禁用或妨礙閱讀者排除。同類重複觀察仍各計一筆。

| 面向／納入 family | 原始筆數 | 排除估計 | HAVE 估計 | WEAK 估計 | MISSING 估計 |
|---|---:|---:|---:|---:|---:|
| 版面：composition＋scale_contrast | 30 | 13 | 4 | 7 | 6 |
| 進場：arrival | 33 | 4 | 6 | 14 | 9 |
| 停留：hold＋type_treatment | 30 | 5 | 3 | 15 | 7 |
| 退場：departure | 22 | 0 | 3 | 12 | 7 |
| 裝飾：decoration | 12 | 2 | 0 | 6 | 4 |
| 運鏡：camera | 13 | 0 | 1 | 11 | 1 |
| 轉場：handoff＋rhythm＋screen_hit | 36 | 6 | 3 | 22 | 5 |
| 背景：background＋color | 16 | 1 | 4 | 9 | 2 |
| 合計 | 192 | 31 | 24 | 96 | 41 |

下列各面向依**可見收益由高至低**排列。`R/`＝`src/app/lyric-vj/render/`；`C`＝`scripts/lyric-vj/lineplan-core.mts`。S＝局部接線；M＝擴充單一機制；L＝跨層整合。★＝可優先利用現成程式。

**版面：已有大主詞／小附句、階梯、直排；欠缺精確的空間關係。**

1. WEAK★ 圓弧與波帶主歌詞：啟用 `orbit`、`ribbon` 模板，限制短句與字元傾角；目標 `C`；S。
2. MISSING 非對稱編輯版面：主句與附句各有欄寬、字階及閱讀順序，不填假內文；目標 `R/layouts.ts`、`templates.ts`；M。
3. WEAK 雙色跨界字：現有 `split` 只切背景，新增依交界遮罩切換主字明暗；目標 `R/engine.ts`、`R/kinetic.ts`；M。
4. MISSING L 型／十字錨定：按語意分段配置，共用關鍵字但不重疊筆畫；目標 `R/layouts.ts`、`templates.ts`；M。
5. WEAK★ 跨句累積與對答：讓 `stack`、`couplet` 共用鏡頭，保留上一句並退居次要位置；目標 `C`；M。

**進場：`slam/pop/rip/drop/focus` 已有，主要缺口是歌詞與載體一起運動。**

1. WEAK★ 吊牌落定：把背景 `hang` 的阻尼擺動移植成主歌詞載體，牌面與文字共用旋轉中心；目標 `R/layouts.ts`、`R/kinetic-more.ts`；M。
2. WEAK★ 摺頁揭露：重用 `paperfold` 的面板明暗，讓歌詞貼合摺面並在閱讀前攤平；目標 `R/layouts.ts`、`R/kinetic-loops.ts`；M。
3. WEAK 多條切片歸位：`slice/rip` 目前主要為上下兩半，擴成少量可控橫帶快速對齊；目標 `R/text-fx.ts`、`R/runtime.ts`；M。
4. WEAK★ 小球節奏揭字：接入 `karaoke`，保留整句可讀底字，再讓球落點帶出局部強調；目標 `C`、`R/text-fx.ts`；S。
5. MISSING 送紙／卷面進場：建立連續紙面遮罩，按詞組送入完整字形，不拆筆畫；目標 `R/layouts.ts`、`templates.ts`；M。
6. WEAK★ 紙卡斜落：將 `cardstack/scrapbook` 的載體動作接到主歌詞，避免文字等背景完成才另外浮現；目標 `R/layouts.ts`、`R/kinetic-loops.ts`；M。

**停留：微漂、波動、心跳已有；材質與載體的持續變化較弱。**

1. WEAK★ 厚字印刷質感：接通現成 `finish='extrude'`，先提供穩定硬邊厚度；目標 `C`；S。
2. WEAK 實心／點陣／空心切換：重用既有字紋與描邊，新增局部、短暫切換，保留清楚主輪廓；目標 `R/text-fx.ts`、`R/glyphs.ts`；M。
3. WEAK★ 呼吸波線：接入現成 emphasis `hold`，依長音延伸並限制在字下留白；目標 `C`；S。
4. WEAK 文字鏡面倒影：背景 `mirror` 不等於主句倒影，新增淡化、裁切的單一反射層；目標 `R/text-fx.ts`；M。
5. MISSING 厚度微光：保持正面字穩定，只讓側面明暗緩慢變化；目標 `R/glyphs.ts`、`R/text-fx.ts`；M。

**退場：已有 `collapse/split/slash/shatter`，不必重做一般碎裂。**

1. WEAK 多帶橫向抽離：把兩半 `split` 擴成少量橫帶，按離心加速度退出；目標 `R/text-fx.ts`；M。
2. MISSING 縱片向心收束：整字切成直條，先靠攏再縮窄，僅在閱讀完成後啟動；目標 `R/text-fx.ts`、`treatment.ts`；M。
3. WEAK 掃描線收束：替現有 `collapse` 補上最後一道短亮線及方向選項；目標 `R/text-fx.ts`；S。
4. WEAK 主歌詞失焦退場：現有 `defocus` 屬圖形轉場，另讓歌詞在退出窗口漸失焦；目標 `R/text-fx.ts`、`R/runtime.ts`；M。
5. WEAK 紙面翻折退出：把 `pagecurl` 的視覺機制用於歌詞載體，避免只翻背景；目標 `R/layouts.ts`、`R/motion-transition.ts`；M。

**裝飾：優先做跟字框有關係的裝飾，避免獨立背景物件。**

1. WEAK★ 語意小圖示：編排器雖填 `symbol:'sparkle'`，選法卻沒有 `symbol`；接入歌詞相符的小圖示；目標 `C`；S。
2. WEAK 低速紙屑：重用 `confetti` 幾何，新增低重力漂浮與歌詞區避讓；目標 `R/kinetic-more.ts`、`C`；M。
3. MISSING 跑燈邊框：沿簡潔圓角框追逐亮點，框線與字保持固定安全距離；目標 `R/layouts.ts`；M。
4. WEAK 幾何塗鴉微動：利用現有形狀，改成固定字框周邊的小幅抽格變化；目標 `R/kinetic-more.ts`；M。
5. MISSING 橢圓手繪框：沿字框外緣描出不規則細線，不加入瞄準角標；目標 `R/text-fx.ts`；M。

**運鏡：現有背景鏡頭很多，但主歌詞 `textCam` 只有小幅推拉、平移、升降與傾斜。**

1. WEAK 前景／背景協同運鏡：共用目標點與節奏曲線，分別限制移動量以保住閱讀框；目標 `R/engine.ts`、`R/text-cam.ts`；L。
2. WEAK 關鍵詞追焦：從固定小幅平移改成沿詞組中心移動，完整句保持可見；目標 `R/text-cam.ts`、`R/engine.ts`；M。
3. WEAK★ 立方體換面：已有背景 `cube` 與同名轉場，接成可承載主句的正面停留；目標 `R/layouts.ts`、`R/motion-transition.ts`；L。
4. WEAK 斜角落定：現有文字傾角很小，增加短促旋轉歸正與安全範圍計算；目標 `R/text-cam.ts`、`R/engine.ts`；M。
5. WEAK 底片捲動：`filmstrip` 現只動齒孔，讓歌詞載體同步垂直滑移完成交接；目標 `R/kinetic-more.ts`、`R/engine.ts`；M。

**轉場：`graphics` 的轉場主要處理歌詞下方圖層，不能視為整張歌詞畫面的同等效果。**

1. WEAK 統一載體交接：讓前句、紙卡及後句參與同一轉場，閱讀期間維持穩定；目標 `R/engine.ts`、`R/motion-transition.ts`；L。
2. WEAK★ 翻牌／骨牌：接入現成 `cardflip/domino`，先用於留有換句空檔的段落；目標 `C`；S，含主歌詞則 L。
3. WEAK★ 圓孔開合：`circle/iris` 已有，加入編排候選並讓主字退場與孔洞時間對齊；目標 `C`；S。
4. MISSING 共用錨點交棒：前句底線或幾何端點成為後句的起點，傳遞位置與方向；目標 `R/engine.ts`、`R/layouts.ts`；L。
5. WEAK 快慢鏡頭對比：保留現有張力分級，但安排連續短句後的完整長停留；目標 `C`；M。

**背景：`rays/boxes/spiral/beatbg` 已接入；應補精確變體，避免重造整套。**

1. WEAK★ 透視地面／幾何落日：將現成 `synth` 加入合適的預設候選；目標 `C`；S。
2. WEAK 常駐撕紙邊：`tear` 是一次揭露，另增上下邊緣的低幅持續漂移；目標 `R/kinetic-more.ts`；M。
3. WEAK 人字紋掃掠：在 `pattern` 加低對比 Chevron 變體與單向微移；目標 `R/kinetic-more.ts`；S。
4. WEAK 雙色界面：讓背景分割與主字明暗判定共用遮罩，避免交界處失去對比；目標 `R/kinetic.ts`、`R/engine.ts`；M。

**快速收益核對：**[編排器](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/lineplan-core.mts:14) 未選 `orbit/ribbon/chat` 模板、`karaoke/flap` 進場、`hold/hollow/symbol` 強調，且輸出 `finish:''`；這些是明確未接入項目。
`C` 的預設背景池沒有 `synth/confetti/paperfold/cardstack/scrapbook`，但非 calm 模式可由 `meaning.parts[].fx` 傳入，**不能說它們絕對不可達**；且 `words:[]` 會讓需要詞的背景載體無字可畫。
既有 `beat-cut` 還受逐字時間與完整句回讀時間限制；[閱讀保護](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/lyric-vj/render/runtime.ts:491) 也可能將效果改成硬切，應保留這些限制。