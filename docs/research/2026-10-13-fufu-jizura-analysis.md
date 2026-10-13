# FuFu Studio、Lyric Studio、JIZURA 與 VJFlow 研究

研究日期：2026-10-13（Asia/Taipei）  
對照基準：VJFlow `3bad41b`；研究時 main 領先 origin/main 3 個提交。  
交接文件：[Claude 優化交接](../superpowers/plans/2026-10-13-vjflow-claude-handoff.md)

## 結論

值得吸收的是三種方法：JIZURA 的受限制文字構圖組合、Lyric Studio 的生成後局部修正、FuFu Studio 的「使用者意圖 → 結構化參數 → 使用者微調」操作方式。

VJFlow 應保留 Angular、PixiJS、現有音訊分析與本機 Whisper，優先補歌詞修正與文字構圖，再做固定影格 MP4 匯出。Gemini 可列為日後明確選用的語意分析或文字草稿來源，不應取代已有的本機對時，也不應悄悄成為本機流程的備援。

本文件的「建議／推論」是針對 VJFlow 的設計判斷，不代表已證實對方的效果或效能。

## 1. 證據與研究範圍

- 已讀 Threads 原文與作者留言。
- 已操作 Lyric Studio 的素材、對時、風格、匯出面板與內建範例預覽，並讀取公開部署程式。
- 已透過使用者開啟的 Edge 檢視 FuFu Studio，使用 AI Studio 的官方「Download as .zip file」取得當時可見專案；未修改／Remix 原專案。
- 下載檔案位於 `~/Downloads/remix_-fufu-studio.zip`；選取的原始碼在研究期間解壓到 `/private/tmp/fufu-studio-research`。暫存路徑不是永久交付依賴。
- FuFu 的程式引用以 zip 內相對路徑與行號標示。部署後端是否與下載版本完全相同，未以執行請求驗證。
- 已對照 VJFlow 的歌詞、Worker、編排、繪圖、匯出與歌曲 DNA 規格。
- 沒有上傳使用者音訊、輸入 API key 或執行雲端生成。沒有同歌曲 A/B 準確度或速度測試。先前範例 MP4 匯出未取得可驗證完成結果，不能宣稱匯出實測通過。
- Gemini 模型、TTS 與 ffmpeg.wasm 行為另查官方文件；沒有把介面宣傳或程式註解直接視為已實現能力。

## 2. 三個專案應分開理解

| 專案 | 已確認的角色 | 不應混淆的部分 |
|---|---|---|
| FuFu Studio | 影音提取音訊、Gemini 字幕／LRC、TTS、劇本分析、音色人設設定 | 本機提取音訊，不等於 AI 字幕也不需上傳 |
| Lyric Studio | 四種影片形式、Whisper 本機對時、逐句編輯、影片輸出 | 目前網站能力比原貼文描述更完整 |
| JIZURA | 可組合的文字構圖、演出編排、Canvas2D 繪圖與逐格輸出 | 上游全部功能不等於 FuFu 整合後全部啟用 |

原貼文：[Threads](https://www.threads.com/@xiaochou.chou/post/DeYY0FcD7rv)  
工具：[FuFu Studio](https://aistudio.google.com/apps/a2fc1cf9-999a-4a44-aeff-52a9c4830958)、[Lyric Studio](https://fufuailab.com/tools/lyric-studio)  
上游：[JIZURA](https://github.com/852wa/JIZURA)

## 3. FuFu Studio：實際資料流

### 3.1 提取音訊在本機

`App.tsx:91` 的提取按鈕流程：

1. 判斷行動裝置或檔案大於 50 MiB，採 ffmpeg.wasm。
2. 其他情況使用 FileReader + AudioContext.decodeAudioData。
3. 產生 WAV 與 MP3、建立本機 object URL、呈現波形。

工具與函式：

| 工具 | 實際使用 |
|---|---|
| React 19、TypeScript、Vite、Express | 操作介面與同源 API；依 package.json 宣告 |
| Web Audio API | 解碼與播放音訊 |
| @ffmpeg/ffmpeg、@ffmpeg/util | WASM 轉檔，下載 core 後在瀏覽器執行 |
| lamejs 1.2.1 | 一般路徑的 PCM → MP3，從 CDN 載入 |
| 自寫 WAV encoder | Float32 → 16-bit PCM WAV |
| D3 | SVG 波形圖 |
| @google/genai | 後端呼叫 Gemini；package-lock 鎖定 1.52.0 |
| localStorage | 自訂音色設定，不是訓練模型 |

原始碼：`utils/audioUtils.ts`、`components/Waveform.tsx`、`index.html`、`package.json`。

**重要限制：**

- 「音軌分離」在此是從影音提取混合音軌；未見將人聲／伴奏拆成 stems 的模型。
- FFmpeg 路徑先輸出 192 kbps、44.1 kHz MP3，再解碼該 MP3 產生 WAV；WAV 容器不會恢復先前有損壓縮丟失的資訊。
- 一般路徑的 MP3 encoder 預設是 128 kbps，WAV 採解碼後 buffer 的 sampleRate。介面「24 kHz WAV／192 kbps MP3」不適用所有提取路徑。
- 字幕按鈕自動提取影片時，直接用一般解碼流程；未共用提取按鈕的大檔／行動裝置 FFmpeg 分支。
- 波形只從第一聲道取 160 個等距單點，沒有峰值區間聚合或 onset 偵測。可作概覽，不能當作毫秒級對時證據。
- 「無大小上限」未由程式保證：全檔讀取、WASM 記憶體、瀏覽器記憶體及 API 請求都有限制。ffmpeg.wasm 官方也列有檔案限制。[官方 FAQ](https://ffmpegwasm.netlify.app/docs/faq/)

### 3.2 AI 字幕會送往後端與 Gemini

```text
音訊檔／由影片提取的 MP3
  → FileReader 轉 base64
  → POST /api/subtitles
  → Express + GoogleGenAI
  → Gemini 音訊理解 + 提示詞
  → 模型回傳 SRT／LRC 文字
  → 清理 Markdown；SRT 額外格式正規化
  → 預覽、複製、下載
```

證據：`App.tsx:147`、`services/geminiService.ts:3`、`server.ts:570`。

字幕候選模型明確是 **gemini-2.5-flash 優先、gemini-3.8-flash 備援**，temperature 為 0。頁首的 Gemini 3.8 標示不代表所有功能都優先使用它。字幕回應沒有回傳實際使用的模型。

兩個輸入模式是「直接聽寫」與「提供參考文稿／歌詞」。差別是是否將 transcript 加到提示詞；沒有看到先取得逐字辨識、再執行獨立 forced alignment 的流程。

後端目前把全段音訊透過 inlineData 一次送出，沒有音訊分塊、Files API 或段落重試。Express JSON 上限為 100mb，這不能提高 Gemini 的上游限制；Google 音訊文件列出 inline 請求總大小限制與大檔 Files API 路徑。[官方音訊文件](https://ai.google.dev/gemini-api/docs/audio)

### 3.3 「毫秒級」主要是提示詞要求

`server.ts:600` 的提示策略包括：

- 指定字幕對齊專家角色。
- 要求人聲開始時才出現字幕，不跟伴奏強拍走。
- 要求時間的小數值，禁止整數化與一致句長。
- 規定繁體中文、句長、中英空格及輸出格式。
- 依 SRT／LRC、有無參考稿切換任務描述。

**程式沒有實作提示詞所描述的聲帶震動偵測器。** 沒有看到 VAD／人聲分離／聲學 forced alignment 或波形 onset 後校正；看到的是一般音訊模型依提示詞產生時間。

時間有小數位只代表輸出精度，不能證明和實際發聲的誤差。LRC 提示又指定 `[mm:ss.SS]`，是兩位小數、10 ms 格式解析度，與「毫秒級」宣傳不能畫等號。temperature 0 也不保證時間正確或輸出可重現。

SRT 的 normalizeSrt 主要清理時間格式、序號及區塊，沒有完整驗證負值、超出歌曲、結束早於開始、時間順序與內容保真；LRC 未見相同層級的 parser 驗證。輸出的繁體要求也主要依靠提示詞。

**可借鏡：** 分清聽寫／參考稿對時、限制輸出格式、提供可攜 SRT／LRC。  
**不照搬：** 用要求「絕對精準」代替聲學驗證；讓歌詞走會改寫口誤、刪標點或語氣詞的字幕提示。VJFlow 歌詞模式應保留使用者提供的文字與重複段落。

### 3.4 配音與「捏聲」如何做

| 功能 | 實作 | 可轉化的價值 |
|---|---|---|
| 劇本優化 | Gemini 回傳總體情緒、建議聲音／風格、優化稿、逐段分析 JSON | 分析結果先呈現，再由使用者決定套用 |
| 捏聲 | 描述 → 基底聲音 + 年齡感／質地／節奏／人設等 JSON | 自然語言轉成可編輯的預設參數 |
| TTS | 預設聲音 + speechMetadata.style + inline 發聲標籤 | 內容與表演指示分開 |
| 預設管理 | localStorage 保存人設設定 | 使用者可留存與微調自己的創作配方 |
| 情緒強度 | 1–4 對映為自然語言指示 | 將複雜控制壓成容易理解的少數選項 |

證據：`server.ts:181`、`:295`、`:380`，`components/VoiceOverStudio.tsx:272`、`:450`，`components/CustomVoiceStudioModal.tsx:139`。

TTS 程式依序嘗試使用者選擇的 3.8 Flash／Flash-Lite TTS、另一個 3.8 TTS，再退回 3.1 Flash TTS preview。這些是程式候選清單，不是已驗證每次成功的結果。

「捏聲」沒有建立或訓練新的聲學模型，也未見呼叫官方 Voice design 建立 voice ID；它是在既有 Kore／Aoede／Puck／Charon／Fenrir 上附加人設描述。

值得留意的落差：

- 各段情緒標籤被取出、去重後合成全篇 style，沒有保留每段對應的時間或獨立 turn。逐段分析的精細度不一定能傳到合成結果。
- `[停頓1秒]` 等被統一轉成省略號，沒有保證一秒的排程；指定倍速也是文字指示。
- 3.8 → 3.1 備援使用相同請求構造，未見模型間語法轉接。
- 下載專案的 SDK lock 為 1.52.0，Google 目前 TTS 文件要求較新的 SDK；程式用了 `as any`。這是相容性待驗證事項，不能從靜態碼直接判定所有生成失敗。
- TTS 回傳 bytes 被前端當作 24 kHz 單聲道 PCM 解讀；沒有根據回應 MIME 驗證格式。不同模型／API 版本切換時要核對。

Google 官方確實列出 Gemini 3.8 TTS、speech metadata 與 vocal tags；不應把它們誤判為不存在。但官方建議持久聲音特質用 Voice design／聲音庫，避免靠很長的 style 描述改年齡、性別等固定特質。[TTS 文件](https://ai.google.dev/gemini-api/docs/speech-generation)、[Generate Content TTS](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation)

**VJFlow 的轉化建議：** 將「冷色、留白、副歌才爆發」等使用者意圖轉成白名單視覺參數，呈現給使用者調整並儲存。這是後續功能，不需要先增加整套配音工作室。

## 4. Lyric Studio：本機 AI 與人工修正

與 FuFu Studio 不同，Lyric Studio 的 Worker 使用 Transformers.js 3.8.1 與 `onnx-community/whisper-small_timestamped`：WebGPU encoder fp32／decoder q4，失敗後 WASM q8。分段 15 秒、重疊 3 秒，return_timestamps 為 word。

文字對齊有正規化、序列比對、異常時間過濾、低匹配片段推估。這和 VJFlow 的方向接近；VJFlow 已有無空白語言拆分處理、多窗口語言偵測與大空洞重新辨識，不宜整套換掉。

介面已確認：四步驟導覽、無音檔範例、四種影片模式、逐句開始／結束、拆句、自動斷句、整體平移、LRC 下載、逐句樣式、拖曳位置與縮放、全句套用、背景圖、綠幕、橫式／直式／方形。

動態文字模式目前 UI 有 12 個風格；重新生成時保留位置與樣式。字幕 MV 中的 Karaoke 依整句時間進度裁切填色，不是已驗證的逐字聲學同步。

來源：[工作室程式](https://fufuailab.com/assets/StudioPage-CWOkfBDE.js)、[Worker](https://fufuailab.com/assets/whisper.worker-DFr2fxwQ.js)。雜湊檔名可能隨部署失效。

## 5. JIZURA：值得吸收的編排與整合

JIZURA 把文字鏡頭拆為 layout、enter、hold、exit、decor、treatment、background、camera、fx、transition；先產生計畫，再按時間繪圖，以 seed 決定變化。

編排會考慮字數適用性、鏡頭長度、橫直比例、近期重複與部件搭配。推論：這種有約束的變化，比增加同構圖配色更能改善單調感。

FuFuMotion 的整合重點：

- 將既有句子時間注入上游，歌詞符號按字面處理。
- 用整組位移／縮放保存內部逐字動畫。
- 人工指定字型與顏色優先，關閉部分改色加工。
- 綠幕／背景圖先畫透明前景再合成。
- 使用 `J.plan(project, null)`，並關閉 snap；此整合路徑沒有輸入歌曲分析資料。不能把上游可做節拍同步直接算成網站已啟用的功能。

這提供 VJFlow 的切入點：用已存在的音訊段落、節拍與頻段資料驅動文字構圖；保留歌聲時間，讓動作重點跟拍，不要為了切拍把歌詞開始時間改掉。

來源：[JIZURA 部件文件](https://raw.githubusercontent.com/852wa/JIZURA/main/docs/EXPRESSION_PACKS.md)、[編排器](https://raw.githubusercontent.com/852wa/JIZURA/main/src/08_planner.js)、[FuFu 整合引擎](https://fufuailab.com/lyric-studio/engine.js)。

## 6. 匯出與架構選擇

Lyric Studio 的動態文字模式有 WebCodecs MP4、MediaRecorder WebM、PNG 圖序；其他模式的工作室程式目前選 WebM。不可泛稱所有模式都有 MP4。

WebCodecs 路徑固定影格時間、控制編碼佇列、釋放 VideoFrame，另處理音訊。VJFlow 的 MediaRecorder 即時匯出可保留為備援；新 MP4 路徑要先把粒子／平滑／轉場的狀態推進改為可固定步長驅動。現在有 seed，只代表編排可重現，不代表每次即時渲染逐像素相同。

mp4-muxer 上游已標記停止維護並推薦 Mediabunny；新實作先評估現行方案。不要承諾 WebCodecs 在所有裝置更快，也不要在沒有音訊編碼能力時悄悄匯出無聲片。

來源：[WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)、[mp4-muxer 維護狀態](https://github.com/Vanilagy/mp4-muxer)。

## 7. 與 VJFlow 對照與優先順序

| 項目 | VJFlow 現況 | 決策 |
|---|---|---|
| 音訊特徵、節拍、段落 | 已有 | 保留並接入文字演出 |
| Whisper、本機對齊、補洞 | 已有 | 保留，WebGPU 另做實驗 |
| 三種歌詞樣式 | 已有但構圖變化有限 | 先做少量構圖，再擴充 |
| 手動時間修正 | 未有 | 優先完成，包含復原與匯出 |
| 結構化意圖／使用者預設 | 未有 | 排在穩定時間軸與演出資料之後 |
| 逐格 MP4 | 未有 | 先建立固定步長繪圖，再接 encoder |
| 直式 | 內部固定 1920×1080 | 第一輪構圖設計先考慮直式，全面改比例另分階段 |
| 歌曲 DNA | 研究時是規格，未見對應實作檔案 | 不當成已存在依賴；先做視覺對照實驗 |
| Gemini 雲端字幕 | 未有 | 非必要；需同素材測試勝出才考慮選用 |
| TTS、真正人聲分離 | 未有 | 不列此次核心優化 |

VJFlow 依據：`src/app/lyrics/`、`src/app/vj/vj-timeline.service.ts`、`src/app/vj/renderer/`、`src/app/pages/generator/preview-export.service.ts`、`docs/superpowers/specs/2026-09-30-song-dna-design.md`。

建議順序：基準與四構圖驗證 → 歌詞可修正／可帶走 → 受限制文字編排 → 固定步長 MP4 → 本機加速實驗 → 意圖預設與必要時的雲端語意擴充。

## 8. 引用邊界與未決問題

- JIZURA 為 MIT，可依條件引用並保留版權／授權聲明。[授權](https://raw.githubusercontent.com/852wa/JIZURA/main/LICENSE)
- FuFu 專案可下載原始碼不等於其自訂程式已獲准任意再散布；這次只整理方法與證據，不將整套作者原始碼搬入 VJFlow。
- 若採 JIZURA，記錄來源 commit、採用部件、修改範圍與第三方聲明。不要依賴浮動 main。
- FuFu 同源請求是否經 AI Studio 額外代理、實際計費歸屬與保留政策，此次未確認；不能宣稱永久免費或零上傳。
- 本次靜態碼查核能確認設計與風險，不能決定 Gemini／Whisper 哪個在歌曲上較準，也不能證明 TTS 效果、4K 成功率或匯出速度。
