# VJFlow

上傳音樂，自動生成跟著節奏變化的 Live House VJ。

所有處理都在瀏覽器內完成：音訊分析、畫面生成、歌詞自動對時、影片匯出都不需要後端，音檔也不會上傳。唯一的對外連線是沒填歌詞時，用檔名到 LRCLIB 搜尋歌詞（只送出檔名）。

## 功能

- **音訊分析**：預先分析整首歌的能量、低中高頻、spectral flux、節拍（BPM）與段落，結果會 cache，播放時只依時間查詢。
- **五種 VJ 風格**：EDM 電音、Cute 可愛、Anime 動漫、Light 光感、Cinematic 電影感。各風格有自己的配色、粒子、構圖、轉場與音訊對應，不只是換顏色。
- **Scene timeline**：以 seed 決定的規則式編排，同一首歌加同一風格每次結果相同；切換風格只重排場景，不重新分析音訊。
- **歌詞**：
  - 沒貼歌詞：先用檔名到 [LRCLIB](https://lrclib.net) 搜尋，找到時間軸歌詞就直接使用；只有純文字就自動對齊歌聲；都找不到才用 Whisper 從歌聲辨識（見下方「自動取得歌詞」）。
  - 貼 LRC：直接使用時間標記。
  - 貼純文字：用瀏覽器內的 Whisper 自動對齊到歌聲。
  - 三種歌詞樣式：極簡、動態、偶像／動漫。
- **生成長度**：前 60 秒預覽或整首歌，由可替換的 generation policy 決定（見下方「付費擴充」）。
- **匯出**：用 `canvas.captureStream()` + `MediaRecorder` 輸出 1920×1080 WebM（VP9／VP8 + Opus），含原始音訊。
- **開發模式 debug panel**：FPS、目前時間、energy／bass／mid／treble、目前 scene。

## 快速開始

需求：Node.js `^22.22.3`、`^24.15.0` 或 `>=26`（Angular 22 的要求）。建議使用近年版本的 Chrome 或 Edge。

```bash
npm install
npm start          # http://localhost:4200
```

其他指令：

```bash
npm test           # 單元測試（Vitest）
npm run build      # production build，輸出到 dist/vjflow
```

## 使用流程

1. 上傳 MP3／WAV／M4A（至少 5 秒）。
2. 等待音訊分析完成（會顯示 BPM、段落數、節拍數）。
3. 選擇 VJ 風格。
4. （選填）貼上歌詞並選擇歌詞樣式。
5. 選擇「前 60 秒預覽」或「整首歌」，按「生成預覽」。
6. 播放、拖曳進度條、調整音量；切換風格或長度會立即重新生成。
7. 按「下載預覽」匯出 WebM。匯出是即時錄製，影片多長就要等多久。

## 架構

```text
src/app/
  audio/              音檔載入、FFT 分析、節拍追蹤、段落偵測、特徵查詢（interpolation）
  lyrics/             LRC 解析、Whisper worker、歌詞對齊演算法
  vj/
    styles/           五種風格的資料定義（palette、preset、transition、mapping、typography）
    renderer/         PixiJS renderer、attack/decay 平滑、particle pool
      layers/         各風格的視覺 layer 與歌詞 layer
      effects/        轉場（fade／flash／zoom／glitch／wipe）
    vj-timeline.service.ts   AudioAnalysis + VJStyle + seed → VJScene[]
    vj-engine.service.ts     組出 VJProject
    generation-policy.ts     生成長度、範圍、點數與授權
  pages/generator/    頁面、狀態機（signals）、播放器與同步、WebM 匯出
```

資料流：

```text
AudioBuffer → AudioAnalysis（cache）
            → VjTimelineService（+ VJStyle + seed）→ VJScene[]
            → VJProject（scenes + range + lyrics）
            → VjRendererService（只讀 VJProject，依 audio 時間逐 frame 繪製）
```

設計重點：

- Renderer 只讀 `VJProject`，不判斷歌曲結構；內部座標固定 1920×1080，預覽時依容器縮放。
- 同步：renderer 每個 frame 讀取 `<audio>` 的時間（經過平滑處理），拖曳進度條時畫面立即跟著跳。
- 效能：texture 只在啟動時產生一次，粒子數量有固定上限，每個 frame 不重新分析音訊。

## 自動取得歌詞

沒有貼歌詞、且勾選「沒填歌詞時自動取得」時，音檔分析完會在背景依序嘗試：

1. **LRCLIB 搜尋**（`src/app/lyrics/lyric-search.service.ts`）：把檔名去掉副檔名、分隔符號和「(Official Video)」「【MV】」這類標記後當作關鍵字。檔名可能是「歌手 - 歌名」或「歌名 - 歌手」，所以不拆欄位，整串搜尋，再挑**長度與音檔相差 3 秒內**的結果，優先選有時間軸的。
2. 找到的歌詞會填進歌詞欄並標示來源，使用者可以直接修改；有時間軸就當 LRC 使用，只有純文字就交給下一節的自動對齊。
3. 找不到（或 8 秒內沒有回應）才用 Whisper 從歌聲辨識。

搜尋還沒結束就按「生成預覽」時，會先等搜尋結果，避免同時啟動語音辨識。只會送出整理過的檔名，不會上傳音檔。

## 歌詞自動對齊

貼純文字歌詞時，會在背景自動對時，期間畫面照常播放：

1. 在 Web Worker 裡用 [transformers.js](https://huggingface.co/docs/transformers.js) 跑 `onnx-community/whisper-small_timestamped`（WASM、int8），取得逐字時間。
2. 你貼的歌詞才是正確答案：用序列比對把歌詞逐字對到辨識結果上，辨識錯幾個字也能對上。比對前會先統一繁簡字。
3. 沒對上的句子，會對應到那段時間有人聲的位置；完全沒人聲時才用時間內插。
4. 超過 8 秒沒辨識到任何字的空洞（Whisper 幻聽後跳段），會單獨重新辨識一次。

注意事項：

- 第一次使用要下載約 250 MB 的模型（來自 Hugging Face），之後由瀏覽器快取。ONNX Runtime 的 WASM 檔案從 jsDelivr 載入。
- 速度參考：60 秒約 30–40 秒，整首（約 4 分鐘）約 3–4 分鐘，視電腦效能而定。
- 準確度（跟網友整理的 LRC 比較）：

  | 歌曲 | 範圍 | 平均誤差 | 0.5 秒內 |
  |---|---|---|---|
  | yosugala〈indigo〉（日文） | 整首 | 0.14 秒 | 56 / 57 句 |
  | 王心凌〈心電心〉（中文） | 前 60 秒 | 0.08 秒 | 13 / 13 句 |
  | 王心凌〈心電心〉（中文） | 整首 | 0.51 秒 | 43 / 53 句 |

- 已知限制：英文和聲（例如中文歌裡的「(It's alright)」）、合唱，以及 Whisper 幻聽的段落，仍可能有幾句偏差 1 秒以上。

## 付費擴充（generation policy）

生成長度與收費邏輯都集中在 `src/app/vj/generation-policy.ts`，UI 與 store 只透過這個介面溝通：

```ts
interface GenerationPolicy {
  // 這次生成涵蓋的範圍、秒數、消耗點數、是否需要解鎖；UI 依此顯示「免費／消耗 N 點／🔒 需解鎖」
  quote(mode: 'preview' | 'full', trackDuration: number): GenerationQuote;
  // 生成前呼叫；在這裡開付款頁或扣點，回傳 false 就不生成
  authorize(quote: GenerationQuote): Promise<boolean>;
}
```

- 目前預設是 `openAccessPolicy`：全部免費開放。
- 要改成「付費解鎖整首」或「依秒數扣 token」，只要提供新的 `GENERATION_POLICY`，不必修改其他程式。
- 同一首歌的同一種長度只會授權一次，切換風格不會重複扣點。
- `PlayRange` 不一定從 0 秒開始，之後可以改成自動挑選「最精彩的 60 秒」。

## 瀏覽器支援

- 繪圖需要 WebGL；若無法啟動，會顯示錯誤並建議開啟硬體加速。
- 匯出需要 `MediaRecorder` 與 `canvas.captureStream()`：Chrome、Edge、Firefox 可輸出 WebM；Safari 會改輸出 MP4；都不支援時會隱藏下載按鈕並顯示說明。

## 尚未實作

帳號、付款、雲端儲存、server 端渲染（1080p／60fps 完整輸出）、人聲分離、AI 影像生成、歌詞手動微調工具。
