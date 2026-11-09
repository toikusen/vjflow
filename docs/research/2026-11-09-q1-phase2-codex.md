**MERGE WITH CHANGES** — 可合併排程基礎，但 HEAD 不宜直接作為預設啟用、已驗收的 Q1。先修正下述事件落地契約；4.0／6 尚未達標，不能用「contract first」視為驗收完成。

另先校正：若「Gate 0 fails」指閱讀閘門失敗，與文件不符；報告是 **0 fails、0 regressions**。失敗的是密度目標。1495 green 是既有報告，本次唯讀審查未重跑。

**1. MERGE WITH CHANGES — dry-run 下降有輸入修正，也有額外政策收緊，不能全部歸因於接線。**

- `baseline.json`：dry-run 快／慢 **4.0／5.2**；`wired.json.summary`：目前 dry-run **3.6／2.4**，wired **3.6／3.2**。所以不是同一套候選單純落地後少了刀。
- **輸入修正正確**：`shownOf()` 共用 `lineShows()`，取得實際 show、Q4 prepare／clear；hold 使用儲存的 `at/sec`，候選受實際排版與 Q2 保留區限制。舊 adapter 的近似 show、推導能力不能當正式承諾。
- **沒有足夠資料量化各因素貢獻**：目前同時改了輸入、能力及政策；要用固定 job、逐項切換的消融量測才能拆出各自損失。
- **正確**：已接管世界停用 `reposeOf()` 的時間決策，由 scheduler 統一安排；禁止比例詞界；不新增獨立鏡頭拍點；缺 renderer 的動作保持 pending。
- **過度保守**：所有句內換位一律要求相同 `carrierId`。原 A 允許安全的 `carrier-swap`，禁止的是抽走唯一載體，不是禁止所有承載關係改變；cap 裁決也沒有全面禁止它。
- **實作限制，不是設計要求**：把 blueprint／notebook／art-deco 每個座位都綁成不同頁，因而完全禁止句內換位。
- **過度保守**：`MOOD_PACE.run` 的 1／2／3 硬上限。B 要求 `keep` 正常、避免每句完整進退場，沒有要求每若干次直接換座就強制停一次。
- pinned／Q4 應計入實際視覺密度與間距；但不應因此耗盡另一個硬性的「可選換座配額」。改成節奏偏好，別靠排除 Q4 計數灌水。
- Q2 hold 綁定原 set 在目前 renderer 下合理；長期應依 hold 的實際相容條件篩座位，不能把「有 hold」永久等同整句不可換起始座位。

**2. RETURN — 五世界退步不能當完成交付；宣告確實比 C 窄。**

移除假詞界造成的下降可以接受，也不應恢復；由能力缺失、頁面綁定、硬性 run cap 造成的下降，則需要補實作或暫緩啟用。

應提供的具體能力／座位如下；這些是待實作座位語意，不是聲稱已有的 set identifier：

| 世界 | 應允許的能力與座位 |
|---|---|
| blueprint | `layout-seat`：同圖紙內全圖版心／細部閱讀區；`camera-reframe`：有真實細部內容的 `detail-viewport`，本階段仍限段落入口 |
| chalkboard | `layout-seat`：左／右／中央板區；`ground-role`：擦除已唱完區域後的 `erase-reseat`，必須實際改變閱讀關係 |
| document | 自有 `page-handoff`：`feed-advance`／`tear-next`，前後收據段各有合法閱讀區；維持 `camera: still`，不用通用 Q4 假冒 |
| notebook | `layout-seat`：同頁主欄／足夠字級的頁邊；`page-handoff`：沿上方裝訂的 `page-turn` |
| art-deco | `layout-seat`：同框主／副版心；`carrier-swap`：有實際承載關係變化的 `poster-panel`，不只是不同 set 名稱 |

其中 notebook 的「頁邊座位各是一頁」、art-deco 缺 `carrier-swap`、document `kinds: []`，都尚未實現 C 的完整能力。不能只擴充宣告，必須同步有畫法、字框及承載驗證。

**3. MERGE — 決定保留 40 世界接線前行為；HEAD 已如此實作。**

`freeJob()` 只在有 `compositions` 時設定 `scheduled`、套用 `applyWorldEvents()`；未宣告世界保留 composer repose，由 adapter 登記為 `pinned/given`。

因此「no capability → keep」應解讀為 **scheduler 不新增或改寫動作**，不是所有句子沿用同座位。維持現狀是正確的漸進接管方式，但不得宣稱這 40 世界已滿足新間距契約；其既有衝突仍只是被記錄。

**4. MERGE WITH CHANGES — 可排除此次接線，但不能斷言是 key-ink 修正。**

- 同一基底下 silk／terminal 接線前後完全相同，支持差異早於 Phase 2；不是本次 scheduler 導致。
- `92f4bce` 已包含 `key-ink.ts` 的 4.5:1 邏輯，round-3 文件也明列該修正。因此「4ff79f6 才加入 key-ink，所以不同」缺乏支持。
- **推論：**合併時保留 Q4、修改 `LINK_PREPARE` 前的 hold 截止條件，以及當時實際 render artifact／參數不同，都可能改變 cuts015；像素指標也可能受字墨影響，但目前無法指定單一原因。
- 應固定 song、meaning、seed、字型、解析度、fps、取樣方式，對 round-3 實際程式版本與 `4ed20ec` 重渲染，核對新增／消失的閾值跨越時間。先確認 artifact provenance，再做 key-ink／Q4 的對照。
- 文件中的「可能是 Q4」只能保留為推論。

**5. MERGE WITH CHANGES — Phase 3 按以下順序做。**

1. **先修事件落地一致性。**  
   修 `planWorldEvents()` → `applyWorldEvents()` → `freeJob()`：核准時間、最終 show、set／page 必須一致。測試比較每件事件的種類、座位與完整時窗，不能只比刀數。

2. **建立可信的候選與量測。**  
   `seatsFor()`／`seatIn()` 提供每句實際排版後字框、載體及受保護區；`seatsDiffer()` 不只依名目框或 carrier 名稱。  
   `measure-world-events.mts --frames` 補尺度、載體輪廓與相對位置；目前只測中心位移／方向，會漏掉合法尺度變化及同位換頁。用人工標記樣本校準，重新分類 111 件 `unrealized`。

3. **先補同頁座位，再補複雜動作。**  
   優先 notebook 主欄／頁邊、art-deco 同框主副版心、blueprint 同圖紙閱讀區；讓 `seatsFor()` 與 adapter 能表達「同載體不同座位」。  
   測試可靠詞界上最多一次、前後各 0.35 秒、完整歌詞、字級與對比；無可靠詞界必須零句內換位。

4. **補 C 的 pending renderer。**  
   chalkboard `erase-reseat`、document feed／tear、art-deco 真正 `carrier-swap`；接上能力專屬的 duration／curve／protectedRegion。  
   測試已唱完才擦／撕、承載不中斷、Q2 不被遮擋；每個動作核對前後穩定幀。

5. **調整節奏政策，再逐批接管其他世界。**  
   `MOOD_PACE`／`boundary()` 移除無設計依據的換座硬上限，保留能量節奏與正常 `keep`；不放寬 0.55／0.65／0.10／0.35。  
   依核准構圖逐世界宣告，固定 seed 做前後比較。只改善五世界不足以保證 45 世界中位數達標。

6. **同一組資料完成驗收。**  
   固定快慢片段、45 世界、seed 0，報 plan 中位 **4.0／6**、逐世界及五世界結果；另外報完整視覺核對數，兩者不能混稱。  
   同時重跑 Q2 coverage、閱讀閘門、跨事件間距、Q4 單次計數及整首播放。對齊覆蓋改善另立工作，不以比例時間補缺口。

**6. MERGE WITH CHANGES — 以下契約問題應在預設啟用前修正。**

- **P1：核准時間可能沒有被落實。**  
  `world-events.ts::boundary()` 依序嘗試 `l.show`、`l.start`；但 `applyWorldEvents()` 對 boundary 只改 `world.set`，沒有保存或執行 `e.at`。  
  **推論：**若 show 衝突、start 合法，事件表記在 start，renderer 卻從 show 就使用新座位，間距保證失效。應移除不可實現的 fallback，或真正實作定時換位，並加入此案例測試。

- **P1：能力座位白名單被擴張。**  
  `fromJob()` 把所有 `line.seats` 聯集回 `caps.seats`，導致宣告的限定座位不能有效限制候選。現有五世界未填 `seats`，不代表契約正確。保留宣告白名單；既有 pinned 狀態與新增合法候選分開處理。

- **P1：最終 treatment 沒有重新驗證事件時窗。**  
  `freeJob()` 在 first job 上排程，改 set／page 後重建 job，直接附上舊事件表；engine 只以 line ID 核准 Q4，重新推導交接。應驗證最終 show、seam、kind、prepare／clear 與核准計畫一致，不能以「實鋪刀數相同」替代。

- **換光契約尚未完整統一。**  
  `composerTreatment()` 仍有 `i > 0` 的節流條件；`lightsOf()` 只觀察首 layer 的 paper／dark；`lightOf()` 對兩個 paged seat 免記換光。這不足以證明幾何大面積明暗交換、跨句與復原皆滿足 0.55 秒。接管世界須補最終全域檢查。

- **hold／Q4：部分重疊保留已修對，但 warning 不等於消除衝突。**  
  完整吸收才合併、部分重疊保留整個 hold window，比 Phase 1 正確。已接管世界若仍有衝突，須在上游重選／取消合法候選；既有 40 世界可先記錄，不應被包裝成契約已通過。

- **目前未見 seam clock、`t0`、seed 或 Q4 拆算的新明確錯誤。**  
  `LINK_PREPARE` 仍是 0.25，layer `t0` 保持 seam；Q4 與換座共用一次事件，seed 選擇是純函式。不過 `countCuts()` 的 50 ms 時間去重只是近似，後續應以共同 action ID 表達同一交接，避免吞掉不同事件。

若要先合併基礎設施，可在修正契約問題後保留明確的實驗性開關；不能把目前預設接管五世界的結果標為 Q1 完成。