# Codex review of hold events round 2 (2026-11-09)

Verdict MERGE WITH CHANGES: add line-ink-settle as the fallback family, split the empty-pool reasons and count safe windows separately, drop crack/plate-slip from hold candidates for now. Coverage targets re-set: 0.6–1.5 s all lines 30 % improvement target, lines with a safe window and readable second ink ≥ 80 %.

**判決：MERGE WITH CHANGES。** 方向正確，但候選篩選仍有可修正缺口；不能把目前覆蓋率當成五家族的能力上限。建議完成下列三項再合入 `feat/lyric-editing`。

**1．1522：同時包含規劃過嚴與結構限制，主要先查 `swapSpan()`。**

我以相同五首歌、45 worlds、seed／meaning 重算，重現 **1522**。以下集合互有重疊：

| 條件 | 句數 | 判讀 |
|---|---:|---|
| `swapSpan()` 找不到完整詞組 | 839 | 35–60% 硬範圍排除太多；新版已允許字墨比例達標，原本的面積理由不再充分 |
| 沒有 `CARRIERS` 合格載體 | 1409 | 不能靠放寬位移門檻解決 |
| 無載體且 `growFits()` 不通過 | 643 | 確有空間瓶頸，但這是規劃器粗估，並非精確字框證明 |
| `plain` | 397 | 禁用局部換墨是風格限制，不代表整句不能改變 |
| `standsOn` | 895 | 禁放大包含所有 `spec.object`，範圍大於 `CARRIERS` |

無載體且粗估不能放大的代表版型：`document/feed` 67、`xerox/strips-r` 29、`notebook/spiral` 24、`screentone/narration` 22、`embroidery/columns` 20、`art-deco/arch` 18。

另外幾個明確限制：
- `carrierRoom()` 繪製最低 40 px，規劃經 `ROUGH` 要 **50 px**；`panel-open` 是 60→75 px。屬刻意保守，尚無資料證明放寬能補多少。
- `growFits()` 要 1.10×，繪製接受 1.08×；也是保守差額。
- `plate-spread` 對所有中短句停用；`screentone` 的 `ink-swap` 權重為零；`document` 禁 grow／settle／open。這些是政策，不是幾何必然。
- 不建議取消 `CARRIERS` 或降低 `swapReads()` 的對比要求；否則可能重新引入畫不出來或難讀的事件。

**第六家族：`line-ink-settle`，整句墨色／墨密度一次落定。**
所有 glyph 同時改變，固定位置、字框、字距與透明度；`plain` 仍維持整句單色，不依賴詞組切分、載體或外部空間。

建議試作尺度：短句 0.12–0.18 秒、中句 0.22–0.30 秒；目標改變至少 30% 實心字墨，RGB 至少一通道差值 ≥48，留餘裕跨過量測的 **≥15% 字墨、通道差 >40**。這是試作值，須實測。
它走字墨分支，不保證全畫面 `text` 的兩個 >2% 條件；報告應分開寫。
閱讀風險是中間色對比下降、既有重點消失，以及大字造成明暗跳變；須檢查過渡全程與實際底色。

**幾何上可套任何 world line，不等於每句都能安全達標。** 調色盤若沒有足夠色差又可讀的第二色，就應跳過。沒有足夠資料支持「任何句必過」；基線下降與底線也都需要空間，不能作無條件備援。

**2．短句 60% 不宜作全部句子的硬門檻。**

目前 321 句先被候選池排除，之後才檢查時間，因此 **16% 不能證明時間上限只有這麼低**。
0.55 秒鎖限制整體換光，不應直接套在所有局部字墨事件；若整句大字實際造成大面積換光，仍須納入。

**推論／建議目標：** `0.6–1.5 s` 全體先訂 **30% 改善目標**，獨立判定有安全窗口及可讀墨色的句子訂 **≥80%**；前者不是已證明可達的保證，也不能拿後者替換全體分母。
`<0.6 s` 維持不要求額外事件。
一秒句只選 `line-ink-settle`：例如進場在 0.30 秒完成，0.45 秒拍點開始、0.60 秒落定，維持到句尾；不移字、不遮字、不復原。進場較晚或沒有安全拍點就跳過。

**3．合併前限定三項修改：**

1. 加入 `line-ink-settle` 作無合格詞組時的備援，保留各世界配色與全程對比檢查；補整詞、`plain`、無可用第二色的單元測試。
2. 把空池原因拆成 span／palette／carrier／grow／world-policy，另獨立統計安全窗口；重跑覆蓋與分層量測，勿把以上重疊數字加總。
3. 此輪先移除 `crack`、`plate-slip` 的 hold 候選資格，讓長句嘗試其他事件；兩者各 0/2 不足以宣判全域失敗，但足以不把它們當已驗證方案。

保留切換、共享判斷與消除靜默事件值得合入；**目前中句是片段 71%、全曲 64%，短句 16%，Q2 覆蓋目標仍未達**。36/37 是已安排且可量測事件的成功率，不是句子覆蓋率。
本輪未修改檔案；1393 tests 與 1956-frame reading gate 採用你提供的結果，未重跑。