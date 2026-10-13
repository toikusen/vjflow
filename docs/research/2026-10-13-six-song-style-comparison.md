# 六首跑分歌的風格對照（2026-10-13）

用途：作為「風格收斂」下一批的證據。本文件只整理現況，不提出實作。

標示：**已驗證** = 讀 treatment 或截圖確認；**推論** = 從資料推得；**未測** = 沒有資料。

## 資料來源

- 各首最新成品：雙截棍、チョロイン、天文対話、世界のつづき 用 `out/research/benchmark/run4`；Utsusemi、行星 用 `run3`。跑分資料夾之外，這六首沒有更新的 treatment（已用檔案時間確認）。
- 截圖：用同一份程式（feat/lyric-editing 目前的工作區，A 預設、未加 `--short-enter`）重新渲染，每首在全曲 9 個等距時間點取樣，拼成 3×3。原本 run 資料夾裡的截圖是用今天修改前的程式渲染的，チョロイン的 run4 也只有 1 張，所以不直接採用。
- 截圖：`assets/2026-10-13-six-song-style/{wf,hc,iw,b3,zn,z8}.jpg`。

## 一覽（已驗證：treatment 欄位）

| 歌 | 視覺語言 | 主字型 | 媒材 | 高潮效果 | 主要背景圖層 | 模板（鏡頭數） |
|---|---|---|---|---|---|---|
| 雙截棍 | spy-titles | Chiron Sung HK | cutout | vacuum | skyline/city 16、band/solid 9、frame/brackets 9 | stack 9、stair 5、frame-split 5 |
| チョロイン | risograph | Zen Maru Gothic | cutout | vacuum | paper 16、photo 11、halftone 8、bands 7 | stack 18、stair 6、scatter 5、vertical 5 |
| 天文対話 | risograph | M PLUS Rounded 1c | paper | burst | paper 16、halftone 11、photo 9、blob 7 | vertical 6、quiet 6、stair 5、stack 5 |
| 世界のつづき | silkscreen | Zen Kaku Gothic New | paper | vacuum | paper 15、bands 15、skyline/hills 7 | vertical 12、quiet 9、stair 9、typewriter 7 |
| Utsusemi | risograph | M PLUS Rounded 1c | paper | rays | paper 16、halftone 16、photo 9、blob 7 | stair 8、scatter 8、vertical 5、quiet 5 |
| 行星 | silkscreen | Noto Sans TC | paper | burst | paper 16、bands 16、blob 9、skyline/peaks 6 | quiet 15、stair 14、vertical 11、typewriter 9 |

調色盤背景色（`styleAnchor.palette.background`）：

- 深藍系 4 首：天文対話 #15123a、世界のつづき #141a3c、Utsusemi #14226b、行星 #141a45
- 其他 2 首：チョロイン #f4ede0（米白）、雙截棍 #120808（近黑）
- 強調色都在橘到粉紅之間：#e8b13a、#ff4fa3、#ff3d8b、#ff6a3d、#ff5e3a、#ff7a3d

## 收斂在哪裡

**已驗證（欄位與截圖）**

- **視覺語言只有三種**：risograph 3 首、silkscreen 2 首、spy-titles 1 首。
- **同語言的歌，畫面近似度很高**：
  - 世界のつづき 和行星（silkscreen）：都是橫條紋色帶、層疊山形剪影、圓形日月、星星，配色也都是深藍加橘。截圖並排時，兩首的構成元素幾乎相同；能不能一眼分辨，留給你判斷。
  - 天文対話 和 Utsusemi（risograph）：同一款主字型，都有網點紙、矩形照片插圖、斜向深藍色帶，粉紅或紅色橫帶。
- **paper 圖層 6 首都用**，halftone 網點出現在 4 首。
- **片尾標題卡的版式相同**：天文対話、Utsusemi、行星、雙截棍 都是「小字藝人名 + 大字歌名 + 細線」。
- **雙截棍**：9 張截圖中有 7 張出現角框或框線（`frame/brackets`），和先前跑分紀錄「每段都加框」的發現一致。

**推論**

- 導演的選擇集中在少數幾種語言，而且同一種語言的程式繪製圖層（色帶、山形、網點）重複度高。所以光是「換一種語言」也還不夠：同語言的歌之間，需要有更多段落層級的差異。
- 4 首用深藍底配橘或粉紅強調色。這可能來自語言預設配色，也可能是導演的偏好，兩者還沒分開確認（未測）。

## 其他觀察（已驗證：截圖）

- **Utsusemi** 第一張截圖（約 11 s）幾乎是一片泛白的畫面，只隱約看得到文字和照片。可能是開頭的轉場或曝光過度；原因未查。
- **チョロイン** 是六首裡最有辨識度的 risograph：粉紅格紋、偶像舞台照片、旋轉木馬 hero。它和另外兩首 risograph 的區隔，主要來自素材（照片與道具），不是程式繪製的圖層。
- **雙截棍** 的風格最獨特（紅黑、武術道具），但角框使用頻率過高。

## 對下一批的意義（推論，待你決定方向）

- 單靠「避免連續兩首用同一種語言」（現有 history 機制）不夠：六首裡仍有兩對同語言、畫面高度相似的歌。
- 可能的方向（都還沒評估成本與效果）：
  - 同語言內的變體：不同的色帶結構、地形、紙材
  - 段落層級的版面差異
  - 標題卡版式輪替
  - 配色不固定在深藍底
- 驗收應該用並排截圖讓你判斷「能不能一眼分出是哪首歌」，不只看欄位是否不同。

## 未測

- 跨更多歌（跑分以外）的語言分布。
- 配色收斂的原因（語言預設 vs 導演選擇）。
- Utsusemi 開頭泛白的原因。
