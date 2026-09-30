# 歌曲 DNA（子專案 A）設計

日期：2026-09-30
狀態：待審

## 背景與目標

目前同一風格下，不同歌曲的畫面幾乎一樣。原因是 `buildScenes` 只依能量 tier（low/mid/high）從固定清單挑 preset 與配色，歌曲本身的個性沒有進到畫面。

目標：

1. 從音訊算出一份 **SongProfile**（歌曲 DNA），連續地影響配色、preset／轉場權重、速度、粒子密度、場景長度與整體調色。
2. 影響幅度為「**中等**」：仍認得出是哪個風格，但不同歌差異明顯（例：慢板悲歌選 EDM → 冷藍灰、幾乎不出現頻閃、轉場以 fade 為主）。
3. 新增「**自動**」風格：依 SongProfile 為五種風格打分，選最適合的，並顯示理由。

非目標（屬於後續子專案）：

- 歌詞意象觸發、歌詞情緒、prompt 理解 → 子專案 B
- 後製效果擴充、Three.js 3D 風格 → 子專案 C
- 雲端 LLM（未來付費版）→ B 定義介面時預留

## 整體路線

| 子專案 | 內容 | 依賴 |
|---|---|---|
| **A. 歌曲 DNA**（本文件） | SongProfile、deriveLook、音訊版自動風格 | — |
| B. 歌詞意境 | 關鍵詞意象觸發；瀏覽器內 embedding 模型分析歌詞／prompt，修正 SongProfile 並影響自動風格；文字理解走 InjectionToken，未來可換雲端 LLM | A 的 SongProfile 與 rankStyles |
| C. 畫面質感 | bloom／殘影／色差等後製；以 Three.js 新增 3D 風格（不重寫現有風格） | A 的 Look 參數 |

優先順序：**音訊 DNA 為底 → 歌詞情緒修正（B）→ prompt 最優先（B）**。

## 資料流

```text
AudioBuffer
  → analyzeAudio()            (+ chroma 摘要、spectral centroid 摘要)
  → AudioAnalysis
  → computeSongProfile()      → SongProfile
  → rankStyles(profile)       → 自動模式時決定 styleId
  → deriveLook(profile, style)→ Look
  → buildScenes(analysis, style, seed, look) → VJScene[]
  → VJProject { ..., profile, look }
  → renderer / layers 讀取 look 與 scene.parameters
```

所有步驟都是純函式、可重現：同一首歌 + 同一風格 → 同樣結果。

## 元件設計

### 1. 音訊摘要特徵（`audio/audio-analyzer.service.ts`、`audio-analysis.model.ts`）

在既有的 FFT 迴圈中順便累積，不需第二次掃描：

```ts
interface AudioSummary {
  /** Mean magnitude per pitch class (C..B), normalized so max = 1. */
  chroma: number[];
  /** Mean spectral centroid in Hz over non-silent frames. */
  centroidHz: number;
}
interface AudioAnalysis { /* 既有欄位 */ summary: AudioSummary }
```

- chroma：取 65–2000 Hz 的 bin，`pitchClass = round(12·log2(f/440) + 69) mod 12`，累加 magnitude。
- centroid：每 frame `Σ f·mag / Σ mag`，只計 energy 高於 p20 的 frame（避開靜音）。
- 不存逐 frame 的 chroma／centroid（目前沒有用途）。

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

- **調性**：Krumhansl–Schmuckler，chroma 與 24 個大小調模板做相關；`mode` 取相關最高者，`modeConfidence` = 最佳大調與最佳小調相關差距，換算到 0..1。流行歌調性偵測準確度有限，所以只當 valence 的其中一項。
- **brightness**：`centroidHz` 以對數映射 500 Hz → 0、4000 Hz → 1。
- **pulse**：onset 強度 > 0.5 的拍點每秒數量，映射 0.5/s → 0、4/s → 1。
- **arousal**：`0.4·tempoNorm + 0.3·pulse + 0.3·meanBass`，其中 `tempoNorm = clamp((bpm − 70) / 110)`。
- **valence**：`0.5 + 0.3·modeSign·modeConfidence + 0.15·(brightness − 0.5)·2 + 0.05·(tempoNorm − 0.5)·2`，再 clamp。
- **dynamics**：section energy 的 p90 − p10。

以上是啟發式規則，初版權重需要用真實歌曲依聽感調整（見「驗證」）。

### 3. Look（新檔 `vj/look.ts`）

```ts
interface Look {
  palettes: Record<EnergyTier, string[][]>;
  presetWeights: Record<string, number>;
  transitionWeights: Record<TransitionType, number>;
  speedScale: number;       // 0.7 .. 1.3
  densityScale: number;     // 0.6 .. 1.4
  sceneLengthScale: number; // 0.7 .. 1.3
  hitThresholdOffset: number; // −0.1 .. +0.15
  grade: { saturation: number; contrast: number; brightness: number };
}
export function deriveLook(profile: SongProfile, style: VJStyle): Look;
```

「中等」幅度的上限集中定義為常數 `LOOK_LIMITS`：

- **配色**：每個顏色轉 HSL。
  - 色相往目標色相旋轉：valence 低 → 冷（約 220°）、高 → 暖（約 30°），最多 **±40°**。
  - 飽和度 ×（0.7 … 1.2，依 arousal）。
  - 亮度 ±0.1（依 brightness）。
  - 背景色（palette[0]）只調亮度，維持風格的底色。
  - ponytail 備註：HSL 的色相旋轉在感知上不均勻；若調出來的顏色不好看，再改用 OKLCH。
- **preset 權重**：`PresetDef` 新增 `energy: number`（0..1，這個 preset 的激烈程度，每個風格手動填）。權重 = `max(0.05, exp(−(preset.energy − arousal)² / 0.08))`。tier 篩選照舊。
- **轉場權重**：固定對照表 `fade 0.1 / wipe 0.4 / zoom 0.6 / glitch 0.8 / flash 0.9`，以同樣的高斯方式乘上風格原本的權重。
- **impact 轉場**：`hitThreshold + hitThresholdOffset`；arousal 低時門檻提高，所以頻閃類 impact 很少觸發。
- **速度／密度／場景長度**：`speedScale = 0.7 + 0.6·arousal`、`densityScale = 0.6 + 0.8·pulse`、`sceneLengthScale = 1.3 − 0.6·arousal`。
- **grade**：依 valence／brightness 產生輕度 ColorMatrixFilter 參數，套在 renderer 最外層容器上。飽和度與對比各自限制在 ±15%。

### 4. 場景編排（`vj/vj-timeline.service.ts`）

`buildScenes(analysis, style, seed, look)`：

- 配色從 `look.palettes` 挑。
- preset 改用 `pickWeighted`，權重為 `look.presetWeights`（仍排除上一個 preset）。
- 轉場用 `look.transitionWeights`。
- `sceneLength` 乘上 `sceneLengthScale`。
- `parameters.speed` 乘上 `speedScale`；新增 `parameters.density = densityScale`。

### 5. 渲染（`vj/renderer/*`）

- `BaseLayer` 新增 `protected readonly density`，讀取 `scene.parameters.density`（預設 1）。
- 五個 layer 的粒子 emit rate 乘上 `density`。ParticleSystem 容量不變，超過容量時自然飽和。
- `vj-renderer.service.ts`：
  - `hit` 判斷改用 `style.mapping.hitThreshold + project.look.hitThresholdOffset`。
  - 在最外層容器套 grade filter。

### 6. 專案模型與引擎

- `VJProject` 新增 `profile: SongProfile`、`look: Look`。
- `VjEngineService.createProject` 接受 `styleId: VJStyleId | 'auto'`：
  - `auto` → 取 `rankStyles(profile)[0]`。
  - `VJProject` 新增 `autoReason?: string`。

### 7. 自動選風格（新檔 `vj/style-ranking.ts`）

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

- B 會在這之上加入歌詞與 prompt 的修正。A 只需要讓 `rankStyles` 的輸入是 SongProfile，B 修正 profile 或另外加偏好分數即可接上。

### 8. UI（`pages/generator/*`）

- 風格卡片最前面新增「自動」。store 的 `styleId` 改為 `VJStyleId | 'auto'`，預設維持 `edm`（不改變現有使用者的行為）。
- 選「自動」時，預覽標題顯示實際選中的風格與 `autoReason`，例如「自動 → Cinematic（小調・慢板 78 BPM・聲音偏暗）」。
- 開發模式的 debug panel 顯示 SongProfile 的各項數值，方便調權重。

## 錯誤處理

- 太短或幾乎靜音的歌，chroma 可能全為 0 → `modeConfidence = 0`，valence 只由 brightness／tempo 決定，不拋錯。
- `deriveLook` 輸出的數值一律 clamp 在 `LOOK_LIMITS` 內。
- 舊的 `AudioAnalysis`（沒有 `summary`）只存在記憶體 cache，重新整理頁面後就會消失，不需要做遷移。

## 測試

單元測試（Vitest，和實作一起寫）：

- `song-profile.spec.ts`：
  - 合成 C 大三和弦 → `major`；A 小三和弦 → `minor`。
  - 同樣訊號，節拍越快，arousal 越高。
  - 全靜音不拋錯，且 `modeConfidence = 0`。
- `look.spec.ts`：
  - 色相偏移 ≤ 40°，背景色色相不變。
  - 低 arousal 時，高 energy preset 的權重 < 低 energy preset 的權重。
  - 同樣輸入，輸出完全相同。
- `vj-timeline.spec.ts`：
  - 低 arousal 的 look 產生的 flash／glitch 轉場比例低於高 arousal 的 look。
  - 同一 seed 與 look，結果可重現。
- `style-ranking.spec.ts`：慢、小調、暗 → Cinematic 排第一；快、pulse 高 → EDM 排第一。
- `generator.store.spec.ts`：選 `auto` 時會解析出實際風格，並產生 `autoReason`。

驗證（人工）：準備 4–6 首風格差異大的歌（抒情、電音、偶像、搖滾、爵士…），在 debug panel 看 profile 數值，比對聽感並調整 `PROFILE_WEIGHTS`、`affinity`。

## 影響的檔案（約 20 個）

新增：`audio/song-profile.ts`、`vj/look.ts`、`vj/style-ranking.ts`，以及各自的 spec。

修改：
- `audio-analysis.model.ts`、`audio-analyzer.service.ts`
- `vj-style.interface.ts`、五個 `*.style.ts`（`energy`、`affinity`）
- `vj-timeline.service.ts`、`vj-project.model.ts`、`vj-engine.service.ts`
- `vj-layer.ts`、五個 layer、`vj-renderer.service.ts`
- `generator.store.ts`、`generator.page.html`、`style-picker.component.ts`

## 實作前注意

工作目錄目前有尚未 commit 的歌詞相關修改。依照 git 規則，實作要在 `vjflow.worktrees/` 下另開 feature branch 的 worktree。worktree 只會包含已 commit 的內容，所以要先決定這批歌詞修改是先 commit 還是另外處理。
