# 歌曲 DNA（子專案 A）設計

日期：2026-09-30
狀態：待審（第 2 版，已納入規格審查意見）

## 背景與目標

目前同一風格下，不同歌曲的畫面幾乎一樣。原因是 `buildScenes` 只依能量 tier（low/mid/high）從固定清單挑 preset 與配色，歌曲本身的個性沒有進到畫面。

目標：

1. 從音訊算出一份 **SongProfile**（歌曲 DNA），連續地影響配色、preset／轉場選擇、速度、粒子密度、場景長度與場景調色。
2. 影響幅度為「**中等**」：仍認得出是哪個風格，但不同歌差異明顯（例：慢板悲歌選 EDM → 冷藍灰、幾乎不出現頻閃、轉場以 fade 為主）。
3. 新增「**自動**」風格：依 SongProfile 為五種風格打分，選最適合的，並顯示理由。

非目標（屬於後續子專案）：

- 歌詞意象觸發、歌詞情緒、prompt 理解 → 子專案 B
- 後製效果擴充、構圖與動態設計、Three.js 3D 風格 → 子專案 C
- 雲端 LLM（未來付費版）→ B 定義介面時預留

已知限制：A 只改變「選哪個場景、什麼顏色、多快、多密」，不改變圖形本身。若單調感主要來自構圖與動態，A 的改善有限；這由第 1 階段的影片對照判斷（見「分階段與決策點」）。

## 整體路線

| 子專案 | 內容 | 依賴 |
|---|---|---|
| **A. 歌曲 DNA**（本文件） | SongProfile、deriveLook、音訊版自動風格 | — |
| B. 歌詞意境 | 關鍵詞意象觸發；瀏覽器內 embedding 模型分析歌詞／prompt，修正 SongProfile 並影響自動風格；文字理解走 InjectionToken，未來可換雲端 LLM | A 的 SongProfile 與 rankStyles |
| C. 畫面質感 | 構圖與場景內動態、bloom／殘影／色差等後製；以 Three.js 新增 3D 風格（不重寫現有風格） | A 的 Look 參數 |

優先順序：**音訊 DNA 為底 → 歌詞情緒修正（B）→ prompt 最優先（B）**。

## 分階段與決策點

**第 1 階段：只做 EDM**
- 範圍：音訊摘要、SongProfile、deriveLook、場景編排改動、EDM 的 style 與 layer、renderer 調色。
- 其他四個風格暫時使用中性的 Look（所有倍率為 1、不偏移配色），行為與現在相同。

**決策點：影片對照（見「驗證」）**
- 若 EDM 前後差異明顯 → 進入第 2 階段。
- 若看起來仍只是「同樣的圖形換色、變速」→ 暫停 A，把 C 的構圖與動態設計提前，再回來完成第 2 階段。

**第 2 階段：擴展到其他四個風格，並加入自動選風格**
- 內容：Cute、Anime、Light、Cinematic 的 `energy`／`affinity` 數值與 layer 改動、`rankStyles`、UI 的「自動」選項。

## 資料流

```text
AudioBuffer
  → analyzeAudio()            (+ chroma 摘要、spectral centroid 摘要)
  → AudioAnalysis
  → computeSongProfile()      → SongProfile
  → rankStyles(profile)       → 自動模式時決定 styleId（第 2 階段）
  → deriveLook(profile, style)→ Look
  → buildScenes(analysis, style, seed, look) → VJScene[]
  → VJProject { ..., profile, look }
  → renderer / layers 讀取 look 與 scene.parameters
```

所有步驟都是純函式、可重現：同一首歌 + 同一風格 → 同樣結果。

## 元件設計

### 1. 音訊摘要特徵（`audio/audio-analyzer.service.ts`、`audio-analysis.model.ts`）

```ts
interface AudioSummary {
  /** Mean magnitude per pitch class (C..B), normalized so max = 1; all zeros for silence. */
  chroma: number[];
  /** Mean spectral centroid in Hz over non-silent frames; 0 when the track is silent. */
  centroidHz: number;
}
interface AudioAnalysis { /* 既有欄位 */ summary: AudioSummary }
```

- **chroma**：在既有 FFT 迴圈中直接累加。取 65–2000 Hz 的 bin，`pitchClass = round(12·log2(f/440) + 69) mod 12`。
- **centroid**：FFT 迴圈中把每個 frame 的 `Σ f·mag / Σ mag` 暫存在一個 `Float32Array`。迴圈結束、energy 正規化之後，才算得出 energy 的 p20，這時再只取 energy 高於 p20 的 frame 求平均。這個暫存陣列不放進 `AudioAnalysis`。
- 全靜音（沒有任何 frame 超過門檻，或 `Σ mag = 0`）時，`centroidHz = 0`，chroma 全為 0。

### 2. SongProfile（新檔 `audio/song-profile.ts`）

```ts
interface SongProfile {
  valence: number;     // 0 悲 … 1 喜
  arousal: number;     // 0 靜 … 1 激
  brightness: number;  // 0 暗 … 1 亮
  pulse: number;       // onset 密度 0..1
  dynamics: number;    // 段落能量落差 0..1
  mode: 'major' | 'minor';
  modeConfidence: number; // 0..1
  tempo: number;       // BPM，給理由文字用
}
export function computeSongProfile(a: AudioAnalysis): SongProfile;
```

計算（常數集中在一個 `PROFILE_WEIGHTS` 物件，方便調整）：

- **調性**：Krumhansl–Schmuckler，chroma 與 24 個大小調模板做相關。
  - `mode` 取相關最高者。
  - `modeConfidence` = 最佳大調與最佳小調相關的差距，換算到 0..1。
  - chroma 全為 0 時，`mode = 'major'`、`modeConfidence = 0`。
  - 流行歌調性偵測準確度有限，所以只當 valence 的其中一項。
- **brightness**：`centroidHz` 以對數映射 500 Hz → 0、4000 Hz → 1，再 clamp。`centroidHz ≤ 0` 時固定為 0.5，避免 `log(0)`。
- **pulse**：onset 強度 > 0.5 的拍點每秒數量，映射 0.5/s → 0、4/s → 1。
- **arousal**：`0.4·tempoNorm + 0.3·pulse + 0.3·meanBass`，其中 `tempoNorm = clamp((bpm − 70) / 110)`。
- **valence**：`0.5 + 0.3·modeSign·modeConfidence + 0.15·(brightness − 0.5)·2 + 0.05·(tempoNorm − 0.5)·2`，再 clamp。
- **dynamics**：section energy 的 p90 − p10。用途見第 4 節的「場景目標能量」。

所有輸出都保證是有限數值，落在 0..1 範圍內（`tempo` 除外）。以上是啟發式規則，初版權重需要用真實歌曲調整。

### 3. Look（新檔 `vj/look.ts`）

```ts
interface Look {
  arousal: number;          // 帶給場景編排算目標能量用
  dynamics: number;
  palettes: Record<EnergyTier, string[][]>;
  transitionWeights: Record<TransitionType, number>;
  speedScale: number;       // 0.7 .. 1.3
  densityScale: number;     // 0.6 .. 1.4
  sceneLengthScale: number; // 0.7 .. 1.3
  hitThresholdOffset: number; // −0.1 .. +0.15
  grade: { saturation: number; contrast: number; brightness: number };
}
export function deriveLook(profile: SongProfile, style: VJStyle): Look;
export const NEUTRAL_LOOK: (style: VJStyle) => Look; // 第 1 階段給非 EDM 風格使用
export function effectiveHitThreshold(style: VJStyle, look: Look): number;
```

「中等」幅度的上限集中定義為常數 `LOOK_LIMITS`：

- **配色**：每個顏色轉 HSL。
  - 色相往目標色相旋轉：valence 低 → 冷（約 220°）、高 → 暖（約 30°），最多 **±40°**。
  - 飽和度 ×（0.7 … 1.2，依 arousal）。
  - 亮度 ±0.1（依 brightness）。
  - 背景色（palette[0]）只調亮度，維持風格的底色。
  - ponytail：HSL 的色相旋轉在感知上不均勻；若調出來的顏色不好看，再改用 OKLCH。
- **轉場權重**：固定對照表 `TRANSITION_ENERGY = { fade 0.1, wipe 0.4, zoom 0.6, glitch 0.8, flash 0.9 }`。權重 = 風格原權重 × `fit(TRANSITION_ENERGY[t], arousal)`，其中 `fit(e, target) = max(0.05, exp(−(e − target)² / 0.08))`。
  - 前提是每個風格都要有 `fade`：**EDM 與 Anime 各加入 `{ type: 'fade', weight: 1 }`**。高 arousal 時 fade 的 fit 很低，所以快歌的轉場大致不變；低 arousal 時 fade 會成為主要轉場。
- **impact 門檻**：`effectiveHitThreshold = style.mapping.hitThreshold + look.hitThresholdOffset`。arousal 低時 offset 為正（門檻變高）。場景編排與即時渲染的 `hit` 判斷**都呼叫這個函式**，不可以各自計算。
- **速度／密度／場景長度**：
  - `speedScale = 0.7 + 0.6·arousal`
  - `densityScale = 0.6 + 0.8·pulse`
  - `sceneLengthScale = 1.3 − 0.6·arousal`
- **grade**：依 valence／brightness 產生輕度的 ColorMatrixFilter 參數，飽和度與對比各自限制在 ±15%。套用範圍見第 5 節。

### 4. 場景編排（`vj/vj-timeline.service.ts`）

`buildScenes(analysis, style, seed, look)`：

- **preset：tier 從硬篩選改為軟性加權**
  - `PresetDef` 新增 `energy: number`（0..1，這個 preset 的激烈程度，每個風格手動填；EDM 暫定 grid 0.3、tunnel 0.65、bars 0.9）。
  - 每個場景先算**目標能量**：`target = clamp(arousal + tierOffset · (0.1 + 0.4·dynamics))`，其中 `tierOffset` 為 low −1、mid 0、high +1。
    - 效果：落差小的慢歌，每個場景的目標都接近歌曲整體的低 arousal，慢歌裡能量相對高的 high 場景也不會被推到 bars。落差大的歌，主歌與副歌的差距會拉開。這就是 `dynamics` 的用途。
  - 候選 = 全部 preset 扣掉上一個（只剩一個 preset 的風格例外）。權重 = `fit(preset.energy, target) × (preset.tiers.includes(tier) ? 1 : 0.3)`。
    - tier 只是加分項，不再把候選刪到只剩一個，所以權重一定有作用。
- **配色**：從 `look.palettes[tier]` 挑。
- **轉場**
  - 強拍判斷改用 `effectiveHitThreshold(style, look)`。
  - 強拍時，只有在 `fit(TRANSITION_ENERGY[style.impactTransition], target) ≥ 0.5` 時才使用 `impactTransition`，否則照一般權重挑。慢歌 EDM 因此不會在場景切換時被強制用 flash。
  - 其他情況用 `look.transitionWeights` 加權挑選。
- `sceneLength` 乘上 `sceneLengthScale`。
- `parameters.speed` 乘上 `speedScale`；新增 `parameters.density = densityScale`。

### 5. 渲染（`vj/renderer/*`）

- **速度**：`BaseLayer.speed` 已經存在，但各 layer 讀取的程度不一。下表列出每個風格會受速度控制的動作；標示「新增」的，要改成乘上 `this.speed`。

| 風格 | 受速度控制的動作 | 階段 |
|---|---|---|
| EDM | tunnel／grid 前進（已有）、bars 波動（已有）、tunnel 旋轉（新增） | 1 |
| Cute | 底紋捲動、環繞物（已有） | 2 |
| Anime | burst 旋轉（已有）、speedlines 移動與 panels 飄移（新增） | 2 |
| Light | 光束相位（已有） | 2 |
| Cinematic | 鏡頭推移與晃動、motes 飄移（全部新增） | 2 |

- **密度**：`BaseLayer` 新增 `protected readonly density`，讀取 `scene.parameters.density`（預設 1）。各 layer 的粒子 emit rate 乘上 `density`。ParticleSystem 容量不變，超過容量時自然飽和。
- **hit**：`vj-renderer.service.ts` 改用 `effectiveHitThreshold(style, project.look)`。
- **調色範圍**：grade filter 只套在 `sceneRoot`（場景 layer）。轉場覆蓋層（`transition.overlay`）與歌詞 layer 都掛在 `stage` 上，所以不會被調色，歌詞的顏色與對比維持不變。

### 6. 專案模型與引擎

- `VJProject` 新增 `profile: SongProfile`、`look: Look`。
- 第 1 階段：EDM 使用 `deriveLook`，其他風格使用 `NEUTRAL_LOOK`。
- 第 2 階段：`VjEngineService.createProject` 接受 `styleId: VJStyleId | 'auto'`。
  - `auto` → 取 `rankStyles(profile)[0]`。
  - `VJProject` 新增 `autoReason?: string`。

### 7. 自動選風格（第 2 階段，新檔 `vj/style-ranking.ts`）

```ts
interface StyleScore { styleId: VJStyleId; score: number }
export function rankStyles(profile: SongProfile): StyleScore[];
export function describeProfile(profile: SongProfile): string; // 「小調・慢板 78 BPM・聲音偏暗」
```

- `VJStyle` 新增 `affinity: { valence; arousal; brightness }`。score = 負的加權歐氏距離（權重 arousal 0.45、valence 0.35、brightness 0.2）。
- 初始 affinity（需依聽感調整）：

| 風格 | valence | arousal | brightness |
|---|---|---|---|
| EDM | 0.5 | 0.85 | 0.6 |
| Cute | 0.85 | 0.6 | 0.75 |
| Anime | 0.65 | 0.7 | 0.6 |
| Light | 0.6 | 0.3 | 0.7 |
| Cinematic | 0.3 | 0.35 | 0.35 |

- B 會在這之上加入歌詞與 prompt 的修正。

### 8. UI（`pages/generator/*`）

- 第 1 階段：開發模式的 debug panel 顯示 SongProfile 的各項數值，以及目前場景的目標能量。
- 第 2 階段：
  - 風格卡片最前面新增「自動」。store 的 `styleId` 改為 `VJStyleId | 'auto'`，預設維持 `edm`。
  - 選「自動」時，預覽標題顯示實際選中的風格與 `autoReason`。

## 錯誤處理

- 靜音或極短的歌：chroma 全為 0、`centroidHz = 0` → `modeConfidence = 0`、`brightness = 0.5`。所有 profile 數值都是有限的，而且落在 0..1 範圍內。
- `deriveLook` 輸出的數值一律 clamp 在 `LOOK_LIMITS` 內。
- 舊的 `AudioAnalysis`（沒有 `summary`）只存在記憶體 cache，重新整理頁面後就會消失，不需要做遷移。

## 測試

單元測試（Vitest，和實作一起寫）：

- `song-profile.spec.ts`：
  - 合成 C 大三和弦 → `major`；A 小三和弦 → `minor`。
  - 同樣訊號，節拍越快，arousal 越高。
  - 全靜音不拋錯，所有欄位都是有限數值，且 `brightness = 0.5`、`modeConfidence = 0`。
- `audio-analyzer.spec.ts`：高頻為主的訊號，`centroidHz` 高於低頻為主的訊號；靜音時 `centroidHz = 0`。
- `look.spec.ts`：
  - 色相偏移 ≤ 40°，背景色色相不變。
  - 低 arousal 時 fade 權重最高；高 arousal 時 flash／glitch 權重高於 fade。
  - `effectiveHitThreshold` 在低 arousal 時高於原門檻。
  - 同樣輸入，輸出完全相同。
- `vj-timeline.spec.ts`：
  - 低 arousal、低 dynamics 的 EDM：即使有 high tier 的場景，bars 的比例也低於 grid。
  - 低 arousal：強拍處的轉場不是 flash。
  - high tier 只有兩個 preset、又排除上一個時，仍然能選到 tier 以外的 preset（驗證不會被硬篩選卡死）。
  - 高 dynamics 的歌，low 與 high 場景的目標能量差距大於低 dynamics 的歌。
  - 同一 seed 與 look，結果可重現。
- `vj-renderer`（或 hit 判斷的純函式）：`hit` 使用 `effectiveHitThreshold`。
- 第 2 階段：
  - `style-ranking.spec.ts`：慢、小調、暗 → Cinematic 排第一；快、pulse 高 → EDM 排第一。
  - `generator.store.spec.ts`：選 `auto` 時會解析出實際風格，並產生 `autoReason`。

## 驗證（人工）

### 數值校準

- 準備 4–6 首風格差異大的歌（抒情、電音、偶像、搖滾、爵士…）。
- 在 debug panel 看 profile 數值，比對聽感，調整 `PROFILE_WEIGHTS` 與 `affinity`。

### 影片對照（第 1 階段的決策點，必做）

- **固定條件**：同一首歌、EDM、同一個 seed（`variation = 0`）。在實作前的 commit 與實作後各匯出一次 WebM（整首或固定的 60 秒區間）。
- **歌曲**：至少一首慢歌與一首快歌。每首的區間都要同時包含主歌與副歌。
- **逐項檢查**（每項在筆記中寫下「前／後」的觀察）：
  1. **構圖差異**：慢歌與快歌出現的 preset 組合是否不同。
  2. **動態起伏**：主歌與副歌的速度、粒子密度、preset 激烈程度是否有明顯落差。
  3. **轉場**：慢歌是否以 fade 為主、少有 flash／glitch；快歌是否維持原本的衝擊感。
  4. **配色**：慢歌與快歌的色調是否明顯不同，但仍認得出是 EDM。
  5. **歌詞可讀性**：開啟歌詞時，文字的顏色與對比和實作前相同。
- **通過標準**：第 1～4 項中，至少三項在慢歌與快歌之間有明顯差異，而且第 5 項沒有退步。否則依「分階段與決策點」，先把 C 的構圖與動態設計提前。

## 影響的檔案

第 1 階段（約 14 個）：

- 新增：`audio/song-profile.ts`、`vj/look.ts`，以及各自的 spec。
- 修改：
  - `audio-analysis.model.ts`、`audio-analyzer.service.ts`
  - `vj-style.interface.ts`、`edm.style.ts`、`anime.style.ts`（只加 fade）
  - `vj-timeline.service.ts`、`vj-project.model.ts`、`vj-engine.service.ts`
  - `vj-layer.ts`、`edm.layer.ts`、`vj-renderer.service.ts`
  - `preview-player.component.ts`／`.html`（debug panel）

第 2 階段（約 12 個）：

- 新增：`vj/style-ranking.ts`（含 spec）。
- 修改：
  - 其餘四個 `*.style.ts` 與四個 layer
  - `generator.store.ts`、`generator.page.html`、`style-picker.component.ts`

## 審查修正紀錄（第 2 版）

| # | 問題 | 修正 |
|---|---|---|
| 1 | EDM 沒有 fade；強拍時的 impact 轉場會繞過權重 | EDM／Anime 加入 fade；impact 只在與目標能量相符時才使用；編排與渲染共用 `effectiveHitThreshold` |
| 2 | tier 硬篩選抵銷了權重 | tier 改為軟性加權（不符合的 ×0.3）；以「歌曲 arousal + tier 偏移 × dynamics」算每個場景的目標能量 |
| 3 | centroid 的 p20 在 FFT 迴圈中還算不出來 | 先暫存逐 frame 的 centroid，迴圈結束後再篩選；定義靜音時的預設值 |
| 4 | `dynamics` 沒被使用；部分 layer 沒讀 speed | `dynamics` 用在目標能量；列出每個風格受速度控制的動作 |
| 5 | 調色會連歌詞一起改到 | grade 只套在 `sceneRoot` |
| 6 | 驗收沒有檢查畫面 | 新增固定條件的影片對照、逐項檢查、通過標準；先做 EDM，並設決策點 |
