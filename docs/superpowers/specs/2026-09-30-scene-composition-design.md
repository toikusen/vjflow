# 場景組合系統設計

日期：2026-09-30
狀態：待審
前置：[歌曲 DNA 設計](./2026-09-30-song-dna-design.md) 第 1 階段（已完成，commit `1af2dff`）

## 背景

歌曲 DNA 第 1 階段的影片對照結果：慢歌與快歌「都有旋轉的圖形，也都有從遠處延伸出來的線」，感覺太相近。

根本原因：EDM 只有 3 個寫死的完整畫面（tunnel、grid、bars），歌曲 DNA 只能在這 3 個之間調比例。就算擴充到 7 個，歌曲一多還是會重複；五個風格各自手工做 N 個畫面，工作量也不可行。

## 目標

1. 畫面由**元件組合**而成，不再是整塊寫死的 preset。元件數量線性成長，組合數量乘法成長。
2. 每首歌有自己的**主題元件組**（招牌），同一首歌前後一致，不同歌之間差異明顯。
3. 五個風格**共用元件**：風格只決定「文法」（能用哪些、怎麼搭）與「外皮」（線條質感、動態性格）。
4. 用 WebGL shader 做參數化背景，以少量程式換取大量變化。

非目標：

- 歌詞意象元件（屬於子專案 B，但會直接以「點綴元件」接上本系統）。
- Three.js 3D 元件（屬於子專案 C，之後以新元件加入）。
- 轉場系統與歌詞 layer 不變。

## 核心概念

```text
SongProfile + Style + seed
  → pickMotif()        每首歌一次：從元件池挑 3–5 個主題元件，並抽好各元件的「歌曲級參數」
  → composeScene()     每個場景：依目標能量，從主題元件中選出要出現的子集與強度
  → VJScene.composition: ElementUse[]
  → CompositeLayer     renderer 依 composition 建出各元件並逐格更新
```

### 1. 槽位（slot）

每個場景由最多四個槽位組成，繪製順序由下到上：

| 槽位 | 每場景數量 | 作用 |
|---|---|---|
| `field` 背景場 | 恰好 1 | 填滿畫面的底層：shader 流動、漸層、網點、霧 |
| `figure` 主體 | 0–2 | 視覺焦點：隧道、格線、波形、雷射、方塊牆、同心圓 |
| `accent` 點綴 | 0–2 | 粒子與小物件：火花、光球、碎片、愛心 |
| `post` 後製 | 0–1 | 對前三層整體處理：bloom、殘影、萬花筒 |

「運動方式」不另設槽位，而是 figure 元件的參數（例如隧道可以 `rotate` 或 `still`）。原因：運動與幾何高度耦合，拆開會讓介面變複雜，換來的組合多半不好看。

### 2. 元件定義

```ts
type Slot = 'field' | 'figure' | 'accent' | 'post';

/** Visual traits used by style grammars and variety rules. */
type Trait =
  | 'rotation' | 'perspective' | 'lines' | 'blocky' | 'organic'
  | 'soft' | 'sharp' | 'strobe' | 'iconic' | 'shader';

interface ElementDef {
  id: string;
  slot: Slot;
  /** How intense the element feels, 0..1; matched against the scene's target energy. */
  energy: number;
  traits: Trait[];
  /** Song-level parameters: sampled once per song, so the same element differs across songs. */
  params: Record<string, ParamSpec>;
  create(deps: ElementDeps): VjElement;
}

type ParamSpec =
  | { kind: 'range'; min: number; max: number; int?: boolean }
  | { kind: 'choice'; options: readonly string[] };

interface VjElement {
  readonly view: Container;
  /** `strength` 0..1 lets a scene show an element faintly (verse) or fully (chorus). */
  update(ctx: FrameContext, strength: number): void;
  destroy(): void;
}

interface ElementDeps {
  params: Record<string, number | string>;
  skin: Skin;
  palette: number[];
  textures: VjTextures;
  rng: Rng;
}
```

每個元件是一個獨立檔案（`vj/elements/<slot>/<id>.element.ts`），不依賴其他元件，可以單獨測試。

### 3. 外皮（Skin）

```ts
interface Skin {
  /** How strokes are drawn. */
  line: 'neon' | 'soft' | 'ink' | 'pastel' | 'film';
  lineWidth: number;
  /** 0 = sharp corners, 1 = fully rounded. */
  roundness: number;
  /** Additive glow amount, 0..1. */
  glow: number;
  /** Motion character: how beat pulses ease. */
  motion: 'snappy' | 'bouncy' | 'smooth' | 'slow';
  blend: 'add' | 'normal' | 'screen';
}
```

元件繪製時讀取 skin。例如同樣是 `concentric` 同心圓：EDM 是 `neon` 細線加 glow；Cute 是 `pastel` 粗圓點加 `bouncy` 動態；Cinematic 是 `film` 柔焦加 `slow`。

### 4. 風格文法（StyleGrammar）

`VJStyle` 新增：

```ts
interface StyleGrammar {
  skin: Skin;
  /** Element id → weight multiplier; elements not listed are unavailable. */
  elements: Record<string, number>;
  /** Traits this style never shows (e.g. Cinematic: 'strobe'). */
  forbidden: Trait[];
  /** Pairs that must not appear in the same scene. */
  exclusive?: [string, string][];
  /** Upper bound of figure + accent elements per scene. */
  maxBusy: number;
}
```

原本的 `presets` 欄位移除，由 `grammar.elements` 取代。

### 5. 主題元件組（每首歌）

`pickMotif(profile, style, seed): Motif`

```ts
interface Motif {
  field: ElementPick[];   // 1–2 個，場景間輪替
  figures: ElementPick[]; // 2–3 個
  accents: ElementPick[]; // 1–2 個
  post: ElementPick[];    // 0–1 個
}
interface ElementPick { id: string; params: Record<string, number | string> }
```

- 每個槽位依權重抽樣且不重複：`grammar 權重 × fit(element.energy, songCenter)`。`songCenter` 是歌曲的 arousal，並依 dynamics 放寬 fit 的寬度，所以落差大的歌會同時挑到安靜與激烈的元件。
- **多樣性規則**：同一個主題組中，同一個 trait 最多出現在 2 個 figure 上。這可以避免「全是線條」或「全在旋轉」，直接針對這次的回饋。
- 每個被選中的元件，依自己的 `params` 規格抽一次歌曲級參數，例如隧道邊數、旋轉方向、格線密度、shader 的噪聲尺度與流速。
- 同一首歌、同一風格、同一 seed，會得到同一個主題組。

### 6. 場景組合（每個場景）

`composeScene(motif, target, grammar, rng): ElementUse[]`

```ts
interface ElementUse { id: string; params: Record<string, number | string>; strength: number }
```

- **field**：從 `motif.field` 挑一個，依場景輪替。
- **figure 數量**：target < 0.35 時 0–1 個，0.35–0.7 時 1 個，> 0.7 時 2 個（不超過 `maxBusy`）。挑選依 `fit(energy, target)`，並避免與上一個場景的 figure 組合完全相同。
- **accent**：target 越高，數量越多、`strength` 越大。
- **post**：只在 target > 0.6 的場景啟用。
- `strength = clamp(0.4 + 0.6 × fit(energy, target))`：主歌裡的激烈元件會以低強度出現，形成鋪陳，而不是完全消失。

`VJScene.preset` 由 `VJScene.composition: ElementUse[]` 取代。`id` 與 debug 顯示改用 figure id 的組合。

### 7. 渲染

- `CompositeLayer`（實作 `VjLayer`）依 `composition` 建立各元件，依槽位順序加入 `view`，每格呼叫 `update(ctx, strength)`。現有的轉場直接作用在整個 CompositeLayer 上，不需要改動。
- `STYLE_LAYERS` 與五個 `*.layer.ts` 在遷移完成後移除。
- **shader 元件**：用 PixiJS v8 的 `Filter` + `GlProgram.from({ vertex, fragment })`，套在一個全畫面 Sprite 上；uniform 包含時間、音訊特徵、調色盤與歌曲級參數。
  - 為了效能，背景 shader 先以**半解析度**畫到 RenderTexture，再放大顯示。
  - `post` 的 feedback 殘影用兩張 RenderTexture 輪流使用（ping-pong）。
- **效能預算**：在你的 Mac 上以 1080p 播放時，debug 面板的 FPS ≥ 50。每個場景最多 1 個 shader field 加 1 個 shader post。

### 8. 元件清單

**從現有畫面拆出**（外觀盡量維持原樣，改成讀 skin 與參數）：

| 來源 | 元件 | 槽位 |
|---|---|---|
| EDM tunnel | `polyTunnel`（邊數、扭轉、motion: rotate/still） | figure |
| EDM grid | `perspectiveGrid`（密度、地平線高度、太陽開關） | figure |
| EDM bars | `spectrumBars`（數量、鏡像） | figure |
| EDM haze | `glowHaze` | field |
| EDM sparks | `sparks` | accent |
| EDM glow 複本 | `bloom` | post |
| Cute dots | `dotPattern`（網點尺寸、捲動方向） | field |
| Cute hero + orbit | `orbitIcons`（圖示: heart/star、數量） | figure |
| Cute bursts | `iconBurst` | accent |
| Cute bubbles／sparkles | `bubbles`、`twinkles` | accent |
| Anime speedlines | `speedLines` | figure |
| Anime panels | `mangaPanels` | figure |
| Anime burst | `sunburst` | figure |
| Anime shards | `shards` | accent |
| Light rays／halo | `lightRays`、`halos` | figure |
| Light aurora | `aurora` | field |
| Light dust／Cinematic motes | `dust` | accent |
| Cinematic leak | `lightLeak` | field |
| Cinematic anamorphic | `anamorphicFlare` | figure |
| Cinematic letterbox／grain | `filmFrame` | post |

**新增**（第 1 階段）：

| 元件 | 槽位 | 說明 |
|---|---|---|
| `shaderFlow` | field | domain-warped 雜訊流動；參數：尺度、扭曲量、流速、對比 |
| `waveform` | figure | 橫向示波曲線，隨中頻與人聲起伏 |
| `lasers` | figure | 底部光源射出的光束，隨拍子掃動 |
| `ledWall` | figure | 方塊矩陣依頻段與節拍亮起 |
| `concentric` | figure | 同心圓或同心多邊形，隨低音向外擴散 |
| `orbs` | accent | 柔焦光球，緩慢飄移 |
| `feedback` | post | 上一格回灌造成殘影與拖尾 |

實際的元件 id 與參數在實作計畫中確定。其中從既有 layer 拆出的部分，拆分邊界在實作時會依程式調整。

## 分階段與決策點

**第 1 階段：框架 + EDM + Cute**
- 內容：元件介面、Skin、StyleGrammar、`pickMotif`、`composeScene`、`CompositeLayer`。
- EDM 與 Cute 的現有畫面拆成元件，並加入上表的 7 個新元件。
- Anime、Light、Cinematic 暫時沿用舊的 layer：renderer 依風格決定走舊路徑還是 CompositeLayer，這個分支在第 2 階段移除。

**決策點：多首歌對照（見「驗證」）**

**第 2 階段：Anime、Light、Cinematic 遷移，並加入自動選風格**
- 內容：三個風格遷移、各自的 skin 與 grammar、刪除舊 layer，以及歌曲 DNA 原本的第 2 階段（`rankStyles`、UI 的「自動」）。
- 歌曲 DNA 第 2 階段中「各 layer 讀取 speed」的工作，改由元件統一處理。

**之後**：B 的歌詞意象元件（雨、星、火…）以 accent 加入；C 的 Three.js 元件以 figure／field 加入。

## 錯誤處理

- 主題組挑不到某槽位（grammar 太嚴）→ field 退回 `glowHaze`；figure 或 accent 可以為空，不拋錯。
- shader 編譯失敗（舊 GPU）→ 元件改用純色漸層並在 console 記錄一次；其他元件照常運作。
- 元件 `destroy()` 只銷毀自己的顯示物件；共用 textures 仍由 renderer 管理（沿用現有規則）。

## 測試

單元測試：

- `pick-motif.spec.ts`：
  - 可重現：同樣輸入得到同樣的主題組。
  - 遵守文法：`forbidden` trait 與 `exclusive` 組合從未出現；例如 Cute 從不出現 `strobe`。
  - 多樣性規則：同一個 trait 最多出現在 2 個 figure 上。
  - **跨歌曲差異**：隨機產生 50 組不同的 SongProfile（固定 seed），在 EDM 下至少 40 組的 figure 組合互不相同；慢歌組與快歌組的 figure 集合，Jaccard 相似度平均 < 0.4。
- `compose-scene.spec.ts`：
  - figure 與 accent 數量隨 target 增加，且不超過 `maxBusy`。
  - post 只在 target > 0.6 時出現。
  - 相鄰場景的 figure 組合不完全相同。
- 元件：每個元件建立、更新 100 格、銷毀都不拋錯，而且 `strength = 0` 時畫面不可見（alpha 為 0 或不可見）。
- `vj-timeline.spec.ts`：scene 帶有 composition，並保留既有的覆蓋率與連續性測試。

## 驗證（人工）

- **多首歌對照**：準備至少 5 首風格差異大的歌，分別用 EDM 與 Cute 匯出 60 秒影片（共 10 支），然後逐項確認：
  1. 任兩首歌在同一風格下，主體元件組合是否明顯不同（在 debug 面板記錄 motif）。
  2. 同一首歌前後是否有一致的招牌感，主歌和副歌又有起伏。
  3. EDM 與 Cute 用到同一個元件時，是否因為外皮不同而看起來像兩種東西。
  4. 有沒有不好看的組合（太擠、太亂）→ 回頭調整文法。
  5. FPS ≥ 50；匯出的影片沒有明顯掉幀。
- **通過標準**：1～3 項成立，第 4 項發現的問題已經透過文法修正，第 5 項達標。這時才進入第 2 階段。

## 影響的檔案（第 1 階段，估）

- 新增：`vj/elements/`（介面、registry，以及約 20 個元件檔）、`vj/motif.ts`、`vj/compose-scene.ts`、`vj/renderer/composite.layer.ts`、`vj/renderer/shaders/`，以及各自的 spec。
- 修改：`vj-style.interface.ts`、`edm.style.ts`、`cute.style.ts`、`vj-project.model.ts`、`vj-timeline.service.ts`、`vj-engine.service.ts`、`vj-renderer.service.ts`、`layers/index.ts`、debug panel。
- 刪除：`edm.layer.ts`、`cute.layer.ts`。
