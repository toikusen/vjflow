# 字墨保證：最終合成閘門（Stage 3）＋ 離線色調表（Stage 2）設計（2026-11-13）

依據：`docs/research/2026-11-13-measured-ink-codex.md`（裁決 (a)+(c)）、`docs/research/2026-11-12-measured-ink.md`（28/44 世界不合格，choroin `--sample 10`），HEAD a41e127（dark-glitch 的 transcript-tape 燈光衰減修正，c078 從 2.52 提高到 6.19）。
產品規則：每個字的每個墨色像素，在**最終合成**中對它實際站的像素達到 ≥ 4.5:1。渲染時不讀回背景。

本文先做 Stage 3（閘門），因為沒有它就量不到任何東西；再做 Stage 2（離線表與計畫端決策）。

---

## 0. 校準（半天，先於一切）

- `scripts/lyric-vj/init-perf.mts`（a41e127 已有）：同機、同歌、同 seed，量 live／非 live 的 cold／warm 初始化，作為 6648366 之後的基準。
- gate v2 做好 Stage 1a 後，先在 dark-glitch × choroin 跑 60 個時刻，量 `s/moment`（三張圖＋比較）與 `s/frame-proof`（只量結構），之後的工時估計都以這兩個數為準。第 3 節的數字是推估。

---

## 1. Stage 3：最終合成閘門（gate v2）

### 1.1 檔案

| 檔案 | 內容 |
|---|---|
| `scripts/lyric-vj/ink-gate2.mts`（新） | 驅動：工作佇列、單一瀏覽器、單次 bundle、checkpoint、彙總。取代 `style-gate-ink.mts`（舊檔保留作 `--legacy` 對照一輪後刪除）。 |
| `scripts/lyric-vj/ink-gate2-page.mts`（新） | 頁面端：`inkGate.moment(t, opts)`，回傳每個字的結果。 |
| `src/app/lyric-vj/ink-verify.ts`（新，純數字，無 DOM） | ID 編碼／解碼、逐像素對比 reduce、狀態分類、JSONL 列型別。單元測試用。 |
| `src/app/lyric-vj/render/ink-mask.ts`（新） | 遮罩材質（ShaderMaterial）、ID 指派、遮罩 render target、warp-only 最終 pass。 |
| `src/app/lyric-vj/render/final-warp.glsl.ts`（新） | 從 `FINAL_SHADER` 抽出 uv 計算（weave、boil、glitch band、shock、glass offset、tile／zoom、pixel snap、aberration taps）成共用 chunk；`FINAL_SHADER` 與遮罩 warp pass 都 `#include` 它，避免兩邊漂移。 |
| `engine.ts`（改） | `inkVerify` 模式掛勾（見 1.3），`glyphMeshes()`，凍結控制遮罩。 |
| `render/runtime.ts`、`world-layout.ts`（改） | `CueLayer.glyphMeshes?(): { i: number; mesh: THREE.Mesh }[]`。world-layout 由 `gs[i].mesh` 直接給出；其他 template 由 `userData['glyph']` traverse 取得（排除 `decor`、`ring`、`noVeil` 與放大字的複本）。 |

### 1.2 字形 ID 遮罩

做法是另跑一個遮罩 pass，用同一批 mesh、同一個變換，**不重建版面**。理由：版面矩形不含抗鋸齒外的實際筆畫、不含 tilt／shear／clip plane（handwrite），也不含最終 pass 的 uv 位移。

- ID：`id = (lineSlot << 16) | (glyphIndex + 1)`，24 bit 放進 RGB8。lineSlot 是本時刻可見行的序號 1..255，對照表隨結果輸出。0 代表沒有字。
- 遮罩材質 `inkIdMaterial(src: MeshBasicMaterial, id)`：沿用原材質的 `map`（含 `repeat`／`offset`）、`clippingPlanes`、`side`；`depthTest=false`；`blending=NoBlending`；`toneMapped=false`。fragment：`a = texture(map, uv).a * (opacity > 0 ? 1 : 0); if (a < 0.5) discard; gl_FragColor = vec4(idRGB, 1);`。不帶 tint、不帶透明度，只決定「哪些像素屬於哪個字」。
- 畫法：暫時把每個字的 mesh 材質換成遮罩材質，其他 mesh（載體、環、decor、背景 scene）全部隱藏。畫進 `idTarget`（`WebGLRenderTarget`、`samples: 0`、`NearestFilter`、`LinearSRGBColorSpace`，無 MSAA）。畫完換回原材質。renderOrder 照舊，所以重疊時上面的字勝出，和畫面一致。
- 經過最終 pass 的位移：再跑一次 `MASK_WARP` pass，用 `final-warp` chunk 算出和 `FINAL_SHADER` 完全相同的 uv 與取樣點。每個輸出像素收集它所有取樣點的 ID：aberration 有 3 個點；zoomHit 有 12 個點，但 text-keep 路徑只取 `uv` 一點；tileHit 取 `fract(uv*3)`；glass 加 offset；pixel 時文字走 `uvText`。所有點的 ID 相同才算這個字的**核心像素**，輸出 `(id, 1)`。不同時輸出 `(id 為多數者, 0)`，記成 `mixed`。
- 2D 層（signature、mini-moment，`main.ts` 的 `compose` 疊在最終畫面上）：Stage 1b 做。在它們的畫字函式加 `idMode`，每個字 `fillStyle` 用 ID 色，關掉 shadow，畫在透明 canvas 上；alpha = 255 的像素才算核心。1b 之前，這些字一律記 `unverified: 'layer-2d'`，**不算通過**。

### 1.3 有墨／無墨配對（控制遮罩一致）

每個時刻 `t` 的流程，都在頁面端：

1. `engine.inkVerify = { binarize: true }`。字的材質（MeshBasicMaterial）用 `onBeforeCompile` 加一行 `diffuseColor.a = step(0.5, diffuseColor.a / max(opacity, 1e-4)) * opacity;`：只把幾何覆蓋率二值化，保留材質色（刺繡、黏土的貼圖）與真實透明度。依裁決，「墨色」可在取消幾何抗鋸齒的驗證 pass 中量，但材質與後效果必須保留。
2. **有墨**：`renderAt(t)`。這次 render 會留下 `tText`（`renderTextMask`）、`ghostA/B`（chroma）以及所有 `finalPass.uniforms` 與 `bloom.strength`。把它們存起來（`frozen = snapshotControls()`）。
3. **無墨**：`showLyrics(false, true)`，並設 `__vjInkRings`（保留載體、底帶、環），再 `renderAt(t, { controls: frozen })`。`tText` 與 ghost RT 用凍結的那份，不重算；uniform 逐一還原成 frozen 的值。關字因此不會順便關掉 tooth／pixel／zoom 的文字保護，也不會改變 chroma 殘影。
4. **遮罩**：照 1.2。
5. **場變化檢查**（`offDrift`）：有墨與無墨兩張圖，在「所有字遮罩各向外擴 R 像素」以外的區域逐像素比較（R 取 bloom／ghost／aberration 的最大鄰域，預設 24 px）。最大差 > 2/255 時，這個時刻的所有字記 `unverified: 'field-drift'`，並另存分層診斷（scene only／text only／final off）。照裁決，關字造成的背景變化不得算成文字對比。
6. **決定性檢查**：每個工作的第 1 個時刻，以及每 50 個時刻抽 1 個，把有墨畫面重畫一次，ink 像素的差必須為 0。不為 0 就整個工作停下，記 `unverified: 'nondeterministic'`。歷史狀態（trail、frameCache、chroma 的 `updateCues(t-lag)`）若造成差異，會在這裡被抓到。

### 1.4 逐字最低對比

- 比較在 GPU 上做。`INK_COMPARE` pass 讀有墨、無墨、遮罩三張貼圖（有墨與無墨各 render 到 `HalfFloat` RT），只在核心像素輸出 `ratio = (max(Lon, Loff) + 0.05) / (min(...) + 0.05)`。L 是 WCAG 相對亮度，sRGB 解碼方式和 `lumOf` 相同。輸出 RGBA32F：`(id, ratio, Lon, Loff)`。
- 只讀回所有字 union bbox 的範圍（`readPixels`，Float32），一次讀回，不再經過 `OffscreenCanvas` 與 `getImageData`。
- CPU reduce（`ink-verify.ts reduceGlyphs`）：每個 id 收集 `min`、`p01`、`median`、`n`、`minAt`（x,y、Lon、Loff）；`mixed` 像素另計 `edge: { n, min }`。
- 判定：`status = n === 0 ? 'unverified:no-core' : min >= 4.5 ? 'pass' : 'fail'`。不四捨五入，`INK_MIN` 照舊為 4.5。`edge` 只作診斷。邊緣是否另立規則交業主與 Codex 決定（見第 4 節），閘門**不會默默排除**它：輸出裡 `edge.min < 4.5` 的字一律列出。
- 不再有 `moving`、`faint`、`small`、`unsung` 的略過。這些改成每個字附帶 `phase: 'enter' | 'exit' | 'rest' | 'hold' | 'fade' | 'unsung'`，只用於分流修正，**照樣判定**。「顯示中」的定義：遮罩有核心像素，或 mesh 可見且 opacity > 0.01。前者為 0、後者為真時，記 `unverified:no-core`（被 warp 打散、太小等），不算通過。
- 平均與 3×3 格中位數只留作診斷欄位，不參與判定。

### 1.5 取樣：「全量」與證明覆蓋

`--frames all | proof | sample:N`

- `all`：可見歌詞的每一個輸出幀（fps 取自 job），每個字。這是裁決的「全量」。
- `proof`（Stage 2 上線後使用）：plan 中 `world.ink.proof === 'analytic'` 的行，在證明涵蓋的區間內，每幀只做**結構驗證**，不 render 像素：
  - `glyphBoxes()` 與 `glyphMeshes` 的世界座標，加上 `final-warp` 的位移上界，必須落在 decision 記錄的 `reach` 內；
  - 當幀的 final uniforms 必須落在 decision 的 `fxBox` 內；
  - 載體 mesh 必須可見，且覆蓋 `reach`。
  - 結構驗證失敗：那一幀改做像素驗證。
  - 證明區間外、或 `proof: 'sampled'` 的行，逐幀做像素驗證。
  - 證明區間內，另以每 30 幀 1 幀做像素驗證，用來驗證證明機制本身。它不是保證的來源，抓到失敗就表示證明有 bug，整個表版本作廢。
- `sample:N`：沿用舊的分層規則，只作快速回歸，報表標明「非驗收」。
- 強制重播清單 `scripts/lyric-vj/ink-replays.json`：cel80s／tsuzuki c010、y2k／tenmon c023 beat-punch、scrapbook snow c043 echo、idol-live beat-punch、y2k／choroin c006 12.91 s、dark-glitch／choroin c078。每次都跑。
- hold 時刻：開始前 1 幀、狀態切換幀（由 `beat.at`、`span`、`stepped` 的步點推出）、效果最差相位（flicker 的每個離散 hash 狀態由 `held` 幀覆蓋；scan 的空間相位由逐像素覆蓋）、結束後 1 幀。`all` 模式本來就包含這些時刻。

### 1.6 輸出格式（JSONL，可續跑）

`out/research/ink/gate2/<runId>/<world>__<song>__s<seed>__<mode>__<sched>.jsonl`

- 第 1 列 `meta`：`{ commit, dirty, tableVersion, fxVersion, font, size: [1920,1080], fps, seed, mode: 'live'|'export', scheduled, frames, coverage: {lines, holds, sets, palettes, carriers, materials} }`
- 每個時刻 1 列：`{ t, frame, lines: {slot: cueId}, offDrift, glyphs: [{ cue, i, ch, phase, status, min, p01, median, n, minAt: [x,y,Lon,Loff], ink, ground, edge?: {n,min}, decision?: 'own'|'moved'|'world'|'band'|'carrier' }] }`。通過的字只寫 `[cue,i,min]` 的壓縮形式，以控制檔案大小。
- 最後 1 列 `done`：`{ moments, glyphs, fails, unverified: {reason: n}, worst, wallSec }`。
- 證據：每個工作的前 20 個 fail，各存一組 crop（有墨／無墨／遮罩／ratio 熱圖，PNG，字框外擴 32 px）到 `shots/`。
- 續跑：已有 `done` 列的檔案整個略過；沒有的，從最後一列的 `frame` 之後接著跑。
- `summary.json`：每個世界的 `fails` 與 `unverified`。任何 `unverified > 0` 或沒有 `done` 列，都列為**未完成**，不算零失敗（watercolor 規則）。

### 1.7 便宜、循序地跑

- 單一 node 程序，`nice -n 19`，`--jobs world:song,...` 佇列一次一個。esbuild 每個 run 只 bundle 一次（現在 seq.sh 每個世界重新 bundle 一次）；chromium 只啟動一次；每個工作開一個新 page，跑完就關。
- live 模式驗主體。export 模式（非 live）在相同時間點做 `--frames sample:20` 的配對比對：兩者 ink 像素的 ratio 差 > 0.01 就記 `mode-diverge`。正式交付影片另以 `--from-video` 讀成品幀，只有讀不到遮罩的部分沿用同時間點的 live 遮罩，用來驗縮放與壓縮後的結果，列為最終驗收步驟。
- 第一個 fail 出現時：`--stop-on-fail` 讓該工作停止放行流程，但照樣把 crop 存好；修正之後再跑全量。
- watchdog：每個工作的上限是 `estimated × 2`，超時記 `timeout`，列為未完成。

### 1.8 測試

- `ink-verify.spec.ts`：ID 編碼往返；`reduceGlyphs`（合成資料：單一像素 4.49 → fail；mixed 不影響判定、但會列出；`n = 0` → unverified）；JSONL 續跑定位。
- `final-warp.spec.ts`：用字串斷言 `FINAL_SHADER.fragmentShader` 與 `MASK_WARP` 引用同一個 chunk，且 chunk 的 hash 寫進 `FX_VERSION`。
- 頁面端煙霧測試 `ink-gate2.test.mts`：一個合成 job（平底＋一行白字＋`uFlicker = 0.97`），ratio 必須等於解析值 ±0.01；再把字放到載體邊緣外 → fail；`offDrift` 用一個依賴 `tText` 的 tooth 場景驗證凍結有效。

---

## 2. Stage 2：離線色調表＋計畫端決策

### 2.1 鍵

```ts
// src/app/lyric-vj/render/ink-tones.ts
interface ToneKey {
  set: string;             // SetSpec id，例如 'dark-glitch/tape'
  slots: string;           // 當行實際 Slots 色碼（ground,plate,ink,ink2,accent,plateInk,...）排序後的 8 字 hash
  ground: 'page' | `carrier:${WorldObject}` | `band:${number}` | `ring:${SurfaceKind}`;
  material: string;        // 字的 surfaceKey（kind|tint|core|eaten），flat 字用 'flat'
  size: 0 | 1 | 2 | 3;     // 字級桶：<60 / 60–100 / 100–160 / >160 px（影響材質縮小後的墨色）
  fx: string;              // FX_VERSION：final-warp chunk + FINAL_SHADER + medium.ts MEDIA + bloom 參數 + world-objects 繪製版本的 hash
}
const keyOf = (k: ToneKey) => [k.set, k.slots, k.ground, k.material, k.size, k.fx].join('|');
```

效果參數不放進鍵，而是由 entry 自帶 `fxBox`，記錄它證明過的參數範圍。查表時，plan 推出的該行 fxBox 必須**包含於** entry 的 fxBox，才可使用。

### 2.2 存的內容

```ts
interface FxBox { flicker: [number, number]; hit: [number, number]; flash: [number, number]; glitch: [number, number]; sweep: boolean; rays: [number, number]; beams: [number, number]; scan: [number, number]; grain: [number, number]; paper: [number, number]; tooth: [number, number]; lift: [number, number]; pixel: [number, number]; vignette: [number, number]; fade: [number, number]; glass: [number, number]; zoom: boolean; tile: boolean; warpPx: number }
interface ToneEntry {
  proof: 'analytic' | 'sampled';
  samples: number;                // sampled：取樣幀數；analytic：0
  fxBox: FxBox;
  grid: [number, number, number, number, number, number]; // 覆蓋區 [col0,row0,cols,rows]、tile=40px、frame 48×27
  pre: string;                    // base64：每 tile 的 pre-final sRGB 通道 [rmin,gmin,bmin,rmax,gmax,bmax] u8；未覆蓋 tile = 255,255,255,0,0,0
  inks: Record<string, [number, number, number, number, number, number]>; // 候選墨色 → pre-final 畫面上的通道區間（材質、二值化覆蓋率）
}
type ToneFile = { v: 1; world: string; fx: string; built: string; commit: string; entries: Record<string, ToneEntry> };
```

- 存 **pre-final**（最終 pass 之前）的區間，再由 `finalBounds()` 以區間算術推到最終合成。理由：最終 pass 的點運算可以解析界定（flicker、vignette、exposure、scan、paper、grain、flash、fade、rays、beams、sweep、glitch block noise 都是逐像素的單調或有界加減），不必為每組參數各渲染一次。
- `finalBounds(ch: [lo,hi]×3, fx: FxBox, tile): [lo,hi]×3`（`ink-tones.ts`）逐行照抄 `FINAL_SHADER` 的運算順序：乘法取兩端；加法取 `[min add, max add]`；vignette 依 tile 位置取因子範圍；`tooth` 對文字像素乘 `(1 - 0.8·keep)`，keep 取 [0,1] 保守；pixel dither 加 ±0.25 量化；flash 用 `mix` 後再乘曝光。抄錯的風險由 `final-bounds.spec.ts` 控制：對 200 組隨機 (c, uniforms)，以 GLSL 同式的 TS 版逐點計算，結果必須落在區間內。閘門的像素驗證也會在 sampled 交叉驗證中抓到。
- 鄰域效果（aberration、boil、weave、glitch 位移、shock、glass、zoom、tile、pixel snap）：覆蓋區向外擴 `fxBox.warpPx`（由 final-warp 的位移上界算出）再取 tile。zoom、tile 為真時，文字取樣點走 text-keep 路徑，但地面走 smear：地面區間取整個畫面的 [min,max]，plan 實際上就會在這種 hit 上拒絕非載體的字。
- 區間最低對比（`ink-tones.ts minContrast`）：

```ts
// I、G：最終合成的 WCAG 亮度區間（由通道區間取 lumOf 的最小／最大）
const minContrast = ([i0, i1]: [number, number], [g0, g1]: [number, number]) =>
  i0 > g1 ? (i0 + 0.05) / (g1 + 0.05) : g0 > i1 ? (g0 + 0.05) / (i1 + 0.05) : 1; // 區間重疊：中間可達 1:1
```

  墨與地面視為獨立（flicker 等同時作用於兩者的相關性被忽略），所以結果偏保守，是安全的。

### 2.3 離線生成（`scripts/lyric-vj/ink-tones.mts`，仿 advance-table.mts）

- 輸出 `src/app/lyric-vj/render/ink-tones/<world>.json`。`--check` 模式重讀表，和閘門報表對帳（表說 ≥ 4.5、閘門量到 < 4.5 → 列出）。
- 頁面使用 `__vjToneSweep` 模式（engine）：final pass 全關（沿用 `__vjFinalOff`，名單擴為全部 uniform），字關掉、載體留著，每幀讀回覆蓋區（只讀 bbox）並累積 per-tile min/max，在頁面內累積，最後只回傳 packed 結果。
- 三類 entry：
  1. **載體（analytic）**：每個 `CARRIERS` 物件 × slots，在 SetSpec 的最小與最大 block 尺寸、`pad` 內縮區、`carrier-settle`／`panel-open` 的滑動範圍上，畫出載體面，取 face 的通道區間。載體面不隨背景變，只隨自身動畫（tape 的 roll／燈光衰減）變化，所以涵蓋它自身動畫週期的每一幀。這是**新歌也成立**的保證，標 `analytic`。底帶（band）同理：純色加上世界紙紋。
  2. **頁面地面（sampled）**：每個 (set, slots)，用 5 首歌 × seed 0..2 的真實 job 渲染。只取該 set 實際出現的區段，每 2 幀取 1 幀（15 fps），另加各 section 切換點。覆蓋區取所有出現過的行的 reach（2.5）聯集再外擴 1 tile。標 `sampled`，`samples` 記幀數。
  3. **墨色**：每個 world 的候選墨色（Slots 全部、`SetSpec.tones`、`inkFor` 會移動到的色相階梯 ±0.12 OKLab、黑、白）× material × size 桶。在純黑與純白兩個地面上畫測試字串（「永國酬あア！Ag」）：二值化覆蓋率、材質照舊，取核心像素的通道區間。flat 墨色直接解析，不需渲染。
- 失效：`fx` 或 world-objects 繪製 hash 改變時，該世界整檔作廢，查表一律 miss（2.6）。CI 檢查 `FX_VERSION` 與表頭一致，不一致時 `ng test` 失敗，提示重建。

### 2.4 Lazy 載入

```ts
// ink-tones.ts，同 layout-measure ensureAdvances
const cache = new Map<string, ToneFile>();
export async function ensureInkTones(world: string): Promise<void>; // browser：await import(`./ink-tones/${world}.json`)（各自 chunk）；node：readFileSync
export function toneEntry(world: string, key: ToneKey): ToneEntry | undefined; // 未載入就 throw（同 advance table 的守則）
```

`freeJob` 在 `ensureAdvances()` 之後 `await ensureInkTones(style.id)`。`main.ts` 不需要它，因為渲染器只讀 plan。

### 2.5 計畫端決策 `decideInks`

新檔 `src/app/lyric-vj/ink-decide.ts`（純函式，不碰 DOM）：

```ts
interface InkDecision {
  v: 1; table: string;                       // 表版本（world json 的 fx+commit）
  reach: [number, number, number, number];   // frame px：該行在整段可走到的範圍（含 warpPx）
  fxBox: FxBox;                              // 該行時間窗推出的效果範圍
  parts: { ink: string; from: 'own' | 'moved' | 'world'; min: number }[];   // 每個 part／row 的基本墨色與區間最低對比
  hold?: { kind: BeatKind; ink?: string; dropped?: 'ink' | 'event'; min?: number };
  band?: { tone: string; rows: number[] };   // 只用世界已核准的 band 詞彙
  set?: { from: string; to: string };        // 最後手段：同世界已核准替代 set，或 world.safeSet
  proof: 'analytic' | 'sampled' | 'none';
  status: 'ok' | 'refused';
}
export function decideInks(line: PlanWorldLine, ctx: { world: string; slots: Slots; spec: SetSpec; text: string; fx: FxBox; measure: Measure; strict: boolean }): InkDecision;
```

- `reach`：由 `blockOf(text, spec, measure)` 與 `spec.at`／`ax`／`ay`／`slot` 得到靜止 rect。依序外擴 drift、swell（0.05–0.08）、cam rig 的 reach、`carrierRoom` 的 dx／dy、`growRoom` 的 k、hold 的 span 位移、讓位位移，最後是 `fxBox.warpPx`。`reachOf()` 放進 `hold-room.ts` 旁的新檔 `line-reach.ts`，閘門的結構驗證（1.5）也用它。
- `fxBox`：由 treatment 推出該行 `[showFrom, exitAt + exitDur]` 時間窗內的 medium（固定）、hit／flash／glitch／sweep／rays／shock／glass 事件（取聯集），以及 fade（片尾）。
- 優先序（照裁決，第一個成立的就停）：
  1. **換墨**：原墨在所有 tile 上 `minContrast ≥ 4.5`（以 `INK_AIM = 4.8` 作選色餘裕，最終判定仍用 4.5）→ `own`。否則同色相小步移動（`readableHue`、OKLab ≤ 0.12）→ `moved`。再不行就從世界既有墨色挑 → `world`。以完整 part 或 row 為單位，整段穩定，不逐格追著底色換。
  2. **拿掉 hold 的顏色**：基本墨色合格，只有 hold 墨色不合格時，`dropped: 'ink'`。若是位移本身把字帶出合格區，`dropped: 'event'`。局部例外：基本字已合格、只有裝飾性 hold 換墨不合格時，先拿掉換墨，不為它新增底帶。
  3. **加底帶**：沒有單一墨色涵蓋全部 tile，且 world 的 band 詞彙裡有合適的底帶時，底帶以 analytic 載體 entry 判定，必須完整覆蓋 reach。
  4. **換 set**：`seatsFor()` 中、同 level、有 analytic 載體的 set，最後是 `WorldPool.safeSet`（新欄位，每世界一個已核准、不透明載體的 set）。
- `strict`（產品對新歌的預設）：只接受 `proof: 'analytic'`。`sampled` entry 只在閉集（5 首驗收歌）或已被閘門全量驗過的 (job) 上使用。非 strict 只給研究用。
- **缺鍵**：entry 不存在、fxBox 不包含、或表版本不符時，直接走第 3、4 步的 analytic 載體與墨色組合。也沒有時，`status: 'refused'`：plan 拒用這個 (set, line) 配置，改用 safeSet；safeSet 也無 → `freeJob` 拋錯（`plan refused: ink`），不出片。

### 2.6 接點（一份決策，渲染器與閘門共讀）

- `free-plan.ts freeJob`：在最後一次 `drawOf` 之後（失敗 composite／hold 已處理完、`seenColours` 之後）插入 `withInkDecisions(plan, job, world)`。它對每條 world line 寫入 `world.ink: InkDecision`。有 `set` 或 `hold.dropped: 'event'` 時，改動 plan，再 `jobOf` 一次，並重跑 `verifyWorldEvents`；最多兩輪，第二輪仍改動就 throw。換 set 走 world-events 的 `layout-seat` 規則（同 `seatsFor` 的合法性），記進 `worldEvents.warnings`。
- `lineplan-core.ts inkFits`（Stage 2b，可延後）：`partGrounds` 加上該 set 表中 reach tiles 的最終區間端點，讓 composer 一開始就少排讀不到的 key pulse。這只是減少後續 drop，**不是**保證來源。
- `world-layout.ts`：有 `world.ink` 時，base ink、hold ink、band 一律照 decision，不再自行以 `seen` 重算（`keyFor`／`inkChecks` 的 `seen` 參數在渲染端不再改墨，只供紀錄）；沒有時（舊 job）維持現狀。
- 閘門：每個字輸出 `decision` 欄位；畫面上的墨色和 decision 不符時（`ink` 欄位偏差 > ΔE 3）記 `decision-mismatch`，算 fail。

### 2.7 測試

- `ink-tones.spec.ts`：`minContrast`（區間重疊 → 1；邊界 4.5 不放行 4.4999）、`keyOf` 穩定、缺鍵行為、lazy 未載入時 throw。
- `final-bounds.spec.ts`：上述隨機包含測試；每個 uniform 單獨極值的 golden 值。
- `ink-decide.spec.ts`：四級優先序各一個 fixture（own 合格；需 moved；只有 hold 不合格 → drop ink；跨深淺兩地 → band；band 無 → safeSet；safeSet 無 → refused），strict 拒用 sampled，decision 穩定（同輸入同輸出）。
- `free-plan.spec.ts` 增項：freeJob 輸出的每條 world line 都有 `world.ink`；渲染端不呼叫任何 readback（沿用 6648366 的守則測試）。
- 效能：`init-perf.mts` 比較加入 `ensureInkTones` 與 `decideInks` 前後的 cold／warm init。目標是 decide 的總時間在 500 ms 以內（純查表）。

---

## 3. MVP 範圍、順序、工時

### 3.1 先出貨的版本

1. **M1 閘門 v2（1a）**：world 與 stair 行的 GL 字形、遮罩 warp、凍結控制遮罩、GPU compare、JSONL checkpoint、決定性與 offDrift 檢查。signature／mini 記 `unverified: layer-2d`。
2. **M2 重量 dark-glitch**（a41e127 之後）：choroin 先跑 `sample:10`，再跑 `all`。用來確認燈光衰減修正後還剩什麼，並依裁決逐項消融（字 tone、載體動作、final uniforms，經 `__vjFinalOff`）。
3. **M3 表與決策（analytic 先行）**：所有 CARRIERS 的載體 entry、band entry、flat 墨色與 `finalBounds`，以及 `decideInks` 的 1–3 級與 safeSet。世界依序：dark-glitch → neon-stage → embroidery／claymation → citypop／idol-live（不合格字次 355／217／149／137／80）。
4. **M4 頁面地面 sampled entry**：同樣 5＋1 個世界，接著 y2k／cel80s，再接其餘 22 個失敗世界。
5. 可延後：1b 的 2D 層、2b 的 composer 前置、`--from-video` 交付驗收、其餘 15 個原本 0 失敗的世界的全量（照裁決，共用材質或效果被改到時要重跑）。

### 3.2 工時（推估，一個 worker、nice 19；Stage 0 校準後改寫）

依據：舊探針 choroin 全密度約 350 個時刻、≥ 25 分鐘/世界，約 4 s/時刻（兩張圖＋JS 逐像素）。v2 每個時刻三張圖，但比較在 GPU、只做一次 bbox 讀回，假設 2–3 s/時刻；結構驗證幀假設 0.05 s。

| 工作 | 量 | 時數 |
|---|---|---|
| M2 dark-glitch × choroin，`all` | 可見歌詞約 205 s × 30 fps ≈ 6,200 幀 | 3.5–5.5 h |
| 28 失敗世界＋claymation＋watercolor × choroin，`all`，無表 | 30 × 6,200 幀 | 105–155 h（太貴） |
| 同上，表上線後 `proof` | 估 50–70 % 的幀被 analytic 覆蓋；其餘像素驗證＋1/30 交叉 | 25–45 h |
| 其餘 4 首歌（nun／snow／tsuzuki／tenmon，可見約 640 s）× 30 世界，`proof` | 約 3× choroin | 75–135 h |
| 表生成：analytic（載體、band、墨色） | 約 19 種載體 × slots × 尺寸 | 2–3 h（全世界） |
| 表生成：sampled 頁面地面，MVP 6 世界 | 約 6 × 8 sets × 3 schemes，各 600–1,200 幀，只讀 bbox | 4–6 h |
| 表生成：sampled，全 45 世界 | | 30–45 h |
| export 模式配對（`sample:20`）× 30 世界 | | 3–5 h |

MVP 的總量（M1–M3，加上 6 世界 × choroin 的 `proof` 全量）約 **15–25 h**。

### 3.3 不降低保證的降本法

- 被 analytic 證明覆蓋的幀，只做結構驗證，加 1/30 交叉驗證：保證來自證明，交叉樣本用來抓證明的 bug，不是抽樣放行。
- 決策把難的行導向 analytic 載體或底帶，覆蓋率愈高，像素驗證愈少。
- 單一程序、一次 bundle、一次啟動；每個 world × song 的 init 只付一次；bbox 讀回；GPU compare。
- 時刻間的去重：連續兩幀的 final uniforms、所有字的 world matrix、scene 的 `held` 幀號（medium `step`）、背景動畫狀態全部相同時，第二幀的結果沿用第一幀（hash 相等才沿用，這是同一張圖，不是近似）。paper／crayon／cutout 的 8–12 fps step 在靜止行上可省 50–60 %。
- 第一個 fail 就停該工作的放行，修完再跑：避免把整首跑完才發現同一個錯。

---

## 4. 風險與須業主看的項目

### 風險

- **淡入淡出**：不再略過 `faint`／`moving` 之後，凡是 alpha 淡入淡出的 enter／exit，前幾幀幾乎必定 < 4.5。修法只能改成不降低對比的揭露方式（wipe、mask、clip、逐字 cut）。影響所有世界的進出場，是最大的一筆變更。
- **邊緣像素**：1.4 以二值化覆蓋率驗證核心像素；`mixed`／`edge` 只列出、不判定。若業主或 Codex 要求連混色邊緣都 ≥ 4.5，就必須改渲染方式（例如加描邊或襯底），無法由閘門解決。
- **材質字逐像素**：刺繡、黏土、riso 的亮線與顆粒在逐像素規則下可能低於 4.5（舊探針以 3×3 中位數放過了它們）。可能須提高材質線色的明度對比，或縮小線色的變化幅度。
- **grain 與 glitch noise**：它們是逐像素的 ±噪點，逐像素最小值會被它們拉低。`finalBounds` 會把噪點幅度算進去，可能使暗底上的中間調墨色全部失效。
- **sampled ≠ 保證**：頁面背景若依賴歌曲（section 時間、palette），取樣無法涵蓋新歌。所以 strict 只接受 analytic，代價是新歌上更多行會被放上載體或底帶。
- **finalBounds 與 GLSL 漂移**：以共用 chunk、FX_VERSION 與包含測試控制，但 GLSL 改了而 TS 沒跟上時，表會錯。CI 要擋。
- **決定性**：歷史狀態（chroma ghost、trail、frameCache）若使無墨 pass 與有墨 pass 不一致，相關時刻全部 `unverified`。可能需要為閘門加 `__vjNoHistory`，或在 render 前重放前幾幀。
- **reach 低估**：讓位、鏡頭的位移若沒有寫進 `reachOf`，結構驗證會擋下並改做像素驗證（安全），但會吃掉省下的工時。
- **工時**：上面的數字都是推估；在 nice 19 下若慢 2 倍，全量（5 首歌）會超過 200 h，須靠 analytic 覆蓋率壓下來。

### 須業主看（每項附修前／修後同句、同時間碼的短片與量測）

1. 進出場由 alpha 淡入淡出改為不降低對比的揭露方式（全世界）。
2. 換 set 與每個世界的 `safeSet` 指定，涉及核准構圖。
3. 新增或延伸底帶與載體（尤其是把既有 bands 卡用在未核准的世界）。
4. 基本墨色由 `own` 改為 `world`，或改變強調、主次色、成員色的角色；拿掉已核准的主要 hold 事件或爆點（`dropped: 'event'`）。
5. 材質字的線色與顆粒調整（embroidery、claymation、riso）。
6. 邊緣像素的規則（只驗核心像素，或連邊緣一起驗）——交業主與 Codex 共同決定。
7. 業主核准不能豁免 4.5:1；對比過關也不代表構圖已核准。

---

### 實作關鍵檔案

- `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/render/engine.ts`（FINAL_SHADER 約在 :436、composer 約在 :717–746、renderTextMask 約在 :2570、glyphBoxes 約在 :1443、`__vjFinalOff`）
- `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/render/world-layout.ts`（`gs[i].mesh`、glyphBoxes :596）
- `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/free-plan.ts`（freeJob 的 drawOf 與 seenColours 迴圈，約 :447–505）
- `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/render/hold-room.ts` 與 `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/lineplan-core.ts`（inkFits :1163）
- `/Users/seitumbp2025/vjflow.worktrees/q1-world-events/scripts/lyric-vj/style-gate-ink.mts`、`/Users/seitumbp2025/vjflow.worktrees/q1-world-events/scripts/lyric-vj/advance-table.mts`、`/Users/seitumbp2025/vjflow.worktrees/q1-world-events/src/app/lyric-vj/render/layout-measure.ts`（作為範本）
