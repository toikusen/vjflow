# 手法 72 項稽核（2026-11-01）

結論：**完成 63、部分 4、未完成 5。** 未完成：B21、B37、B61、B62、B70，和預期相同。B71 不是只有測試：チョロイン c077 會實際播放，但只算部分。比預期多三項部分：B03、B13、B30，都是這次看新渲染的畫廊才看到的。

## 檢查方式

- **五首使用次數**：用目前程式重建五首計畫（`out/research/instant/plans/`，與 review 版逐欄相同），欄位順序 nun / snow / tsuzuki / choroin / tenmon。B33–B72 的表重寫在 `out/research/lineplan/finish9/usage.md`。
- **程式位置與測試**：`rg` 式比對。「測試」欄是出現手法識別名的測試行數；0 不等於沒測，例如 B26–B32 的測試用 `arrival.ts` 的函式名（`lineplan.test.mts:13`），B04 用 `rigAt`，B55、B59、B64 用 `LINE_GROUNDS`。
- **畫面**：新渲染兩份畫廊。雙截棍 16 種（`out/research/instant/audit/montage-c.jpg`），雪 17 種（`montage-d.jpg`），另看 `montage-a.jpg`、`montage-b.jpg`。批次 1–4 的舊圖還是修整前的底，只當歷史紀錄，不當完成度證據。
- **整首紀錄**：五首 `render/metrics.json` 閱讀失敗 0、rendererErrors 0、floored 0，最小靜止字級 56 px。
- **規則 10**：進退場經 `text-fx.ts:332` 的 `v()` 與 `lineSeed`（`:553`）、`exitSeed`（`:741`）；底經 `line-grounds.ts` 的 songVary（41 處）；載體經 `lyric-carrier.ts`、`carrier-family.ts`。

## 十條規則的整體結果

| 規則 | 結果 |
|---|---|
| 1 沒有裸色塊 | B13 抽屜列未達；B21 因此未開放。其餘底與載體有紙質或陰影 |
| 2 裝飾要有理由 | B61、B62 已移除；其餘有語意條件或貼著字框 |
| 3 圖形不壓字 | B30 畫廊幀有前句未走就疊上；背景 `yields` 退讓正常 |
| 4 三層尺度 | fine tier 有歌名、段落、關鍵詞小字與細線 |
| 5 底不是平的 | paper-surface 全曲同一張紙，五首都有 |
| 6 有深度 | 載體有接觸陰影 |
| 7 一個鏡頭一個主角 | 特殊版面底下用 QUIET_BACKGROUNDS |
| 8 形狀要收尾 | 這次只看 1/3 尺寸幀，**沒有**放大 200% 逐一檢查角落；沒有足夠資料 |
| 9 不和主視覺衝突 | 只用歌曲配色四色 |
| 10 每首不一樣 | 見上，五首抽樣有接 |

另外的弱點：快歌大量進場被閱讀閘門改成 cut。整首紀錄的 entranceLost：雙截棍 13/49、チョロイン 24/75、天文対話 8/43。這是閱讀優先的結果，不是錯誤，但花俏進場在快歌較少見。

## 逐項

| 項目 | 名稱 | 狀態 | 五首使用 | 程式 | 測試行 | 畫面證據 | 備註 |
|---|---|---|---|---|---|---|---|
| B01 | 閱讀時窗與快慢段落調度 | done | 54 / 45 / 28 / 78 / 43 | `render/reading-window.ts:73` | 4 | `五首 metrics.json` |  |
| B02 | 歌詞載體框架 | done | 0 / 3 / 2 / 0 / 1 | `render/contrast-split.ts:7` | 11 | `lineplan/batch1/sheets` |  |
| B03 | 多帶裁切與歸位 | partial | 0 / 0 / 0 / 0 / 0 | `render/runtime.ts:221` | 2 | `instant/audit/montage-d.jpg` | 部分：兩份新畫廊都沒有真的播到 band-in（雙截棍退成 cut，雪該句被交接改成 cut）；修整後沒有新畫面可看。 |
| B04 | 文字與背景共用運鏡 | done | 2 / 0 / 0 / 0 / 0 | `render/text-cam.ts:4` | 0 | `lineplan/finish6/frames/hardcut-55.00.png` |  |
| B05 | 整組畫面滑移交接 | done | 1 / 0 / 0 / 2 / 1 | `render/motion-transition.ts:7` | 1 | `lineplan/batch1/sheets` |  |
| B06 | 雙色交界共用遮罩 | done | 1 / 0 / 0 / 0 / 0 | `render/engine.ts:7` | 4 | `lineplan/batch1/sheets` |  |
| B07 | 字面材質狀態 | done | 0 / 0 / 0 / 0 / 0 | `render/runtime.ts:221` | 1 | `instant/audit/montage-d.jpg` |  |
| B08 | 共用錨點交棒 | done | 0 / 2 / 2 / 0 / 1 | `render/engine.ts:894` | 2 | `lineplan/batch1/sheets` |  |
| B09 | 懸掛落定 | done | 0 / 3 / 1 / 0 / 0 | `render/carrier-moves.ts:6` | 3 | `lineplan/batch2/sheets/hang.jpg` |  |
| B10 | 連續紙面送入 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 3 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B11 | 鉸接摺頁 | done | 0 / 0 / 0 / 0 / 0 | `render/carrier-moves.ts:6` | 0 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B12 | 紙卡落入與顯影 | done | 0 / 2 / 1 / 0 / 0 | `render/engine.ts:288` | 4 | `lineplan/batch2/sheets/card-land.jpg` |  |
| B13 | 格位抽出焦點 | partial | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 3 | `instant/audit/montage-c.jpg、montage-d.jpg` | 部分：字本身可讀，但下方抽屜列是淡灰方塊（雪）與模糊色塊（雙截棍），質感未達規則 1、2，建議使用者看過再定。 |
| B14 | 條帶承載 | done | 0 / 0 / 0 / 1 / 1 | `render/motion-transition.ts:760` | 2 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B15 | 翻牌與骨牌鏈 | done | 3 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 2 | `lineplan/batch2/sheets/panels.jpg` |  |
| B16 | 柔軟厚字浮升 | done | 0 / 0 / 0 / 0 / 2 | `render/engine.ts:873` | 1 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B17 | 非對稱編輯版面 | done | 1 / 0 / 1 / 3 / 1 | `render/engine.ts:9` | 3 | `lineplan/batch3/sheets/b17-editorial.jpg` |  |
| B18 | 轉角與交叉錨定 | done | 0 / 0 / 0 / 1 / 0 | `render/engine.ts:288` | 3 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B19 | 文字便箋框 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 2 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B20 | 稿格落字 | done | 0 / 1 / 0 / 0 / 0 | `render/engine.ts:288` | 3 | `lineplan/batch3/sheets/b20-grid.jpg` |  |
| B21 | 字塊與幾何平衡 | not done | 0 / 0 / 0 / 0 / 0 | `render/line-space.ts:2` | 6 | `lineplan/batch3/sheets/b21-weight.jpg` | 未完成：單一純色幾何違反規則 1；留在畫廊，不進 RECIPES。 |
| B22 | 跨句累積與對答 | done | 4 / 1 / 2 / 8 / 4 | `render/layouts.ts:197` | 2 | `lineplan/batch3/sheets/b22-list.jpg` |  |
| B23 | 分格巡覽落定 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 2 | `instant/audit/montage-c.jpg` |  |
| B24 | 詞組目標追焦 | done | 0 / 0 / 0 / 0 / 0 | `render/camera-rig.ts:5` | 6 | `lineplan/batch3/sheets/b24-track.jpg` | 雙截棍畫廊被閘門擋下（NOT PLACED），依賴 spare，五首 0 句。 |
| B25 | 曲線行進收斂 | done | 0 / 1 / 0 / 0 / 0 | `render/arrival.ts:5` | 1 | `instant/audit/montage-d.jpg` |  |
| B26 | 雙片開門揭句 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-d.jpg` | 只在有時間的句子出現；雪畫廊保留，快歌退成 fade。 |
| B27 | 節奏標記帶字 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B28 | 柔波邊界揭露 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 1 | `instant/audit/montage-d.jpg` | 同上。 |
| B29 | 斜角拋入歸正 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-d.jpg` |  |
| B30 | 完整輪廓套合 | partial | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-d.jpg` | 部分：雪的畫廊幀中，輪廓在前一句還在時就疊上（規則 3）。正常編排有 ARRIVAL_APART 間距，五首 0 句。 |
| B31 | 局部直片轉正 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-c.jpg、montage-d.jpg` | 同上。 |
| B32 | 遮點解碼清晰化 | done | 0 / 0 / 0 / 0 / 0 | `render/arrival.ts:5` | 0 | `instant/audit/montage-c.jpg、montage-d.jpg` |  |
| B33 | 多帶抽離 | done | 2 / 0 / 0 / 2 / 2 | `render/text-fx.ts:30` | 5 | `lineplan/finish5/frames/band-out.png` |  |
| B34 | 直片向心收窄 | done | 0 / 4 / 3 / 3 / 2 | `render/text-fx.ts:30` | 1 | `lineplan/finish5/frames/slat-close.png` |  |
| B35 | 雙軸線性收束 | done | 3 / 5 / 3 / 4 / 2 | `render/text-fx.ts:30` | 1 | `lineplan/finish5/frames/line-fold.png` |  |
| B36 | 載體磁磚旋散 | done | 0 / 0 / 0 / 0 / 1 | `render/line-layouts.ts:255` | 2 | `lineplan/finish5/frames/tile-scatter.png` |  |
| B37 | 單色深度回聲 | not done | 0 / 0 / 0 / 0 / 0 | `render/text-fx.ts:30` | 2 | `lineplan/finish5/frames/echo-travel.png` | 未完成：複本疊成灰塊；只留畫廊，編排器不提供。 |
| B38 | 徑向推拉消散 | done | 3 / 0 / 0 / 1 / 1 | `render/engine.ts:1514` | 2 | `lineplan/finish5/frames/radial-leave.png` |  |
| B39 | 字面碎屑釋放 | done | 1 / 0 / 0 / 2 / 1 | `render/text-fx.ts:30` | 3 | `lineplan/finish5/frames/glyph-shed.png` |  |
| B40 | 波紋蒸散 | done | 0 / 0 / 1 / 0 / 0 | `render/text-fx.ts:30` | 1 | `lineplan/finish5/frames/wave-dissolve.png` |  |
| B41 | 孔洞侵蝕退出 | done | 0 / 4 / 3 / 2 / 2 | `render/text-fx.ts:30` | 2 | `lineplan/finish6/frames/pore-out.png` |  |
| B42 | 主歌詞失焦退場 | done | 0 / 1 / 0 / 0 / 0 | `render/engine.ts:1514` | 2 | `lineplan/finish6/frames/focus-out.png` |  |
| B43 | 立體換面承句 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 1 | `lineplan/finish7/frames-final/fu-box-turn.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B44 | 整幅底片送格 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 1 | `lineplan/finish6/frames/frame-advance.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B45 | 斜視角呼吸落定 | done | 0 / 0 / 0 / 0 / 0 | `render/text-cam.ts:6` | 1 | `lineplan/finish6/frames/lean-settle.png` | 語意限定（不安類詞），五首 0 句，畫廊幀合格。 |
| B46 | 框內推入揭句 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 1 | `lineplan/finish7/frames-final/fu-dive-early.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B47 | 透視導軌送出 | done | 0 / 4 / 3 / 2 / 2 | `render/text-fx.ts:31` | 3 | `lineplan/finish7/frames-final/fu-rail.png` |  |
| B48 | 重力下落接鏡 | done | 2 / 1 / 1 / 2 / 2 | `render/engine.ts:1514` | 2 | `lineplan/finish6/frames/gravity-pass.png` |  |
| B49 | 槓桿平衡載體 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 1 | `lineplan/finish7/frames-final/b49-balance-mid.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B50 | 點陣顯示帶 | done | 0 / 0 / 0 / 0 / 0 | `render/engine.ts:288` | 1 | `lineplan/finish7/frames-final/b50-display-read.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B51 | 厚字、長投影與側面微光 | done | 3 / 0 / 0 / 0 / 0 | `render/runtime.ts:388` | 1 | `lineplan/finish7/frames-final/b51-block.png` |  |
| B52 | 清楚輪廓光 | done | 0 / 1 / 0 / 0 / 0 | `render/arrival.ts:5` | 5 | `lineplan/finish7/frames-final/b52-edge-read.png` |  |
| B53 | 單一鏡面倒影 | done | 0 / 2 / 1 / 0 / 0 | `render/runtime.ts:389` | 2 | `lineplan/finish7/frames-final/b53-mirror.png` |  |
| B54 | 長音呼吸線 | done | 2 / 4 / 3 / 7 / 1 | `render/runtime.ts:390` | 1 | `lineplan/finish8/frames-final/b54-breath.png` |  |
| B55 | 無刻度擴散環 | done | 2 / 5 / 16 / 7 / 1 | `render/line-grounds.ts:393` | 0 | `lineplan/finish7/frames-final/b55-rings.png` |  |
| B56 | 語意圖示與落地影 | done | 0 / 0 / 0 / 0 / 0 | `無` | 4 | `lineplan/finish7/frames-final/b56-icon.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B57 | 周界追光 | done | 0 / 0 / 1 / 0 / 1 | `render/runtime.ts:387` | 2 | `lineplan/finish8/frames-final/b57-read.png` |  |
| B58 | 手繪橢圓包圍 | done | 2 / 4 / 4 / 4 / 1 | `render/kinetic.ts:14` | 15 | `lineplan/finish8/frames-final/b58-oval.png` |  |
| B59 | 低重力紙屑 | done | 1 / 3 / 9 / 7 / 5 | `render/line-grounds.ts:414` | 0 | `lineplan/finish8/frames-final/b59-drift.png` |  |
| B60 | 摺片與印記落點 | done | 0 / 0 / 0 / 0 / 0 | `render/kinetic.ts:54` | 1 | `lineplan/finish8/frames-final/b60-fold.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B61 | 字框周邊塗鴉 | not done | 0 / 0 / 0 / 0 / 0 | `無` | 1 | `無（已移除）` | 未完成：已移除，形狀與字無關（規則 2）。 |
| B62 | 局部幾何織紋生成 | not done | 0 / 0 / 0 / 0 / 0 | `無` | 1 | `無（已移除）` | 未完成：已移除，純格線無理由（規則 2）。 |
| B63 | 圓孔開合與聚焦 | done | 1 / 1 / 0 / 1 / 1 | `render/motion-transition.ts:755` | 8 | `lineplan/finish8/frames-final/b63-aperture.png` |  |
| B64 | 常駐撕紙邊 | done | 5 / 5 / 12 / 8 / 11 | `render/line-grounds.ts:458` | 0 | `lineplan/finish8/frames-final/b64-edge.png` |  |
| B65 | 人字紋掃掠 | done | 4 / 7 / 6 / 8 / 6 | `render/line-grounds.ts:482` | 1 | `lineplan/finish9/frames/b65-herring.png` |  |
| B66 | 落日與水面反光 | done | 0 / 2 / 0 / 0 / 0 | `render/line-grounds.ts:511` | 2 | `lineplan/finish9/frames/b66-sun.png` |  |
| B67 | 訊號材質切換 | done | 0 / 0 / 0 / 0 / 0 | `render/kinetic-more.ts:1256` | 3 | `lineplan/finish9/frames/b67-signal.png` | 語意限定，五首 0 句，畫廊幀合格。 |
| B68 | 背景裂面衝擊 | done | 0 / 1 / 0 / 0 / 0 | `render/line-grounds.ts:538` | 2 | `lineplan/finish9/frames/b68-crack.png` |  |
| B69 | 明暗配色交接 | done | 1 / 2 / 2 / 1 / 1 | `render/motion-transition.ts:733` | 1 | `lineplan/finish9/frames/b69-palette.png` |  |
| B70 | 語意色彩接力 | not done | 0 / 2 / 1 / 0 / 0 | `render/engine.ts:1816` | 0 | `lineplan/finish9/final/snow-clip-B70.png` | 未完成：雪 2 句、世界のつづき 1 句有排 relay，但畫面看到一色；relay 只有在 emphasis 有色差時才動（text-fx.ts:845），目前看不出接力。 |
| B71 | 分段字階落定 | partial | 0 / 0 / 0 / 1 / 0 | `render/arrival.ts:5` | 2 | `lineplan/finish9/frames/b71-step.png` | 部分：チョロイン c077 實際播放，unit test 有；分段字階只有一張畫廊幀，無使用者驗收。 |
| B72 | 字句收成節點 | done | 1 / 4 / 2 / 1 / 2 | `render/text-fx.ts:30` | 2 | `lineplan/finish9/frames/b72-node.png` |  |
