# 剩餘節奏差距的設計討論（Codex，2026-11-09）

> 由 `codex exec` 依 brief（11-04 對照報告、finish bar、motion-prompt diff）作答；數值為建議門檻，尚未實測。brief 原文附於文末。

**建議順序：Q2 停留事件 → Q1 快歌切換 → Q4 進退場 → Q3 字級對比 → Q5 專屬時刻。** 核心是把「歌詞閱讀」「載體構圖」「整體換光」分開排程，讓畫面能跳變，歌詞仍完整。

已讀指定三份研究文件與相關程式；未修改或寫入任何檔案。以下數值是**建議驗收門檻，尚未實測**；工期屬推論。檔名未標完整路徑者位於 `src/app/lyric-vj/`。

**先修正三個判斷前提**

- `beatOfLine()` 現在直接排除 `< 1.5 s`，事件本身又長達 0.45–1 秒；短句缺事件是排程與時長共同造成。
- `composerTreatment()` 把世界切換視為整體換光；其間隔檢查含 `i > 0`，因此新增設計前，應先測跨句邊界是否也遵守 0.55 秒，不能只檢查句內。
- `readingSec()` 判定「已讀完」不等於「已唱完」。本題要求整個演唱期間可讀，因此遮罩、壓扁、翻背與裁切必須等到 `cue.end` 之後，或只作用於非歌詞載體。

**Q1｜快歌 11 → ≥15：先增加構圖切換，不縮短換光間隔**

15 次／10 秒相當於平均 0.667 秒一次；相較 11.2，25 秒片段約需多 **10 次有效切換**。算術上沒有超過 0.55 秒底線，但不代表每首歌都有足夠的安全時間點。

建議新增 `planWorldEvents()`，以整首時間軸排程，記錄 `at`、`duration`、`scope`、`reason`、`changesLight`。名稱均為建議新增。

| 排名 | 切換家族 | 觸發規則與實作尺度 | 閱讀保護與量測 |
|---|---|---|---|
| 1 | 同字換載體構圖 | 在詞組交界或下一個重音，將既有載體從滿幅換成偏側／雙層構圖；改變約 25–40% 畫面區域 | 字的位置、大小與字下底色不動；比較載體層前後構圖，並實測是否跨過 scene 0.15 |
| 2 | 字外場景重新取景 | 句中有空間容納時，既有場景切到另一個裁框；起始位移可試畫寬 8–12%，保留兩個穩定端點 | 鎖住歌詞與閱讀底板；這是場景層重新取景，不能假裝整體鏡頭一起移動 |
| 3 | 整句安全重新取景 | 在可靠詞界，整句與載體一起跳至另一個安全構圖；每句至多一次，前後各留至少 0.35 秒 | 重用 `camReach()`，檢查所有字框；若幅度被限縮到不可辨識，取消，不用微漂充數 |
| 4 | 子句構圖交接 | 只有明確詞界、充足空間才用；目前詞組保持原位，其他完整詞組調整對齊／間距，讀序不變 | 不拆字、不換字、不把未唱部分藏起來；缺 `charStarts` 的高速句跳過 |
| 5 | 既有道具動作／底景換位 | 道具已因歌意存在，才允許它落定、轉向或移交；底景只換既有構圖 | 小道具通常只能算 hold；達不到 scene 門檻就不能列為切換 |

所有尺度都是試作起點，不是「面積達到就一定被偵測」的保證。`scene` 分數不是變動像素比例。

**排程原則：**

- 所有整體明暗／配色切換共用一條 0.55 秒時間鎖，跨句、跨段都適用；短暫變色後復原，也算第二次換光。
- 幾何換位若造成大面積明暗交換，仍須列為換光；不能僅因名稱是 `carrier-swap` 就豁免。
- 短句可以沿用前一句的紙面與光線，只更新歌詞；把省下的換光機會留給下一個構圖重音。
- 每個時間點只選一個主要動作；Q2 的事件與本題切換共用排程，避免疊加。
- 世界材質提供「怎麼動」；歌意提供特殊裝置「為什麼存在」。沒有語意資料時，只動已存在且承載歌詞的版面，不新造敘事道具。

**修改位置：** `lineplan-core.ts` 的 `compose()`、`reposeOf()`；`free-plan.ts` 的 `composerTreatment()`；`render/world-layout.ts` 的 `WorldLine`、`build()`；`render/world-cam.ts`；`world-shared.ts` 增加各世界允許的構圖事件與幅度。

**15 是否合理？** 保留為快歌代表片段的挑戰目標，不做每首、每世界、每個滑動視窗的硬配額。JIZURA 19.2 沿用舊樣本，文件也記錄白閃、雪花等手法；**推論：其中可能有我們不應追隨的切換，但沒有足夠資料量化占比**。不能直接把差額都歸因於閃光。

舊 `cuts015_per10` 必須原樣保留；另列排除紋理沸騰、重複偵測後的有效事件率。新指標到 15、舊指標未到，應明列舊目標未達，不能換名稱宣稱成功。

**Q2｜短句與中句：把事件改成「落定」，少做來回脈衝**

`beatOfLine()` 應從句長門檻改成「安全事件窗口」。短句用 0.12–0.22 秒完成一次狀態改變，留下結果到句尾；中句用 0.22–0.4 秒。不強迫每個事件復原。

| 家族 | 建議尺度 | 落點 | 限制 |
|---|---|---|---|
| 詞組整批換墨 | 一次改完整詞組，約主句字墨 35–60%；原墨與新墨全程皆 ≥4.5:1 | 有語意重點時對準該詞起音；否則只作既有閱讀進度提示 | 小字句可能永遠不足全畫面 2%，不能單靠它達標 |
| 載體落定 | 外露紙邊、側翼、底層移動，讓約 6–12% 畫面實際改變；字下區域固定 | 短句約 35–55% 處的合適拍點 | 延續已存在的紙張／卡片，不突然生出裝飾色塊 |
| 墨版外擴 | 既有字影或印刷底版在字框外展開，目標 3–6% 實際變動面積 | 強調詞起音或句中重音 | 主字不動；字框加安全邊距內禁止副本侵入，不能用重影糊字 |
| 分格／頁邊開合 | 世界既有框景從一格變兩格或展開邊欄，改變約 10–20% 畫面 | 有對照、承接意義時，落在語意轉折 | 分格線只能在閱讀區外；無語意依據就不用 |
| 完整字塊單次放大 | 整句 1.08–1.15×，放大後停住，不彈回 | 短句第二個有效重音；中句約 45–65% | 只有四周空間與筆畫間距都足夠才用；不保證達到 2% |

短句定義仍是 `<1.5 s`，但應另報 `<0.6 s` 與 `0.6–1.5 s`。極短句若連進場後的安全窗口都沒有，保留一次清楚的到位即可，不硬塞「停留」。

新增事件須在進場結束後至少留 0.1 秒，完成後距唱詞結束至少 0.12 秒；沒有可用拍點可選可靠詞界，兩者皆無就跳過。這些是初始排程值，需影片驗證。

**量測必須分層：**

- 固定 seed、同一時間，渲染事件開／關兩版，以排除慢漂與紋理本來就有的差異。
- 同時要求：事件窗口內有實際幀間峰值 >2%，且開／關差分 >2%；不能只測累積位移。
- 分列 `text`、`carrier`、`ground` 與合成畫面。載體事件通過，不能寫成「文字層通過」。
- 另報字墨換色比例；灰階偵測會漏掉亮度相近的換色。
- 同一事件只計一次，短句不與進場峰值重複計算。

**修改位置：** `lineplan-core.ts` 的 `beatOfLine()`；`render/world-beats.ts` 的 `BeatMove`、`WORLD_BEATS`、`beatProgress()`；`render/world-layout.ts` 的事件套用；`world-shared.ts` 的材質選擇。事件時長需進入計畫，不能只存在固定的 `WORLD_BEATS.sec`。

**Q3｜字級對比：推薦「完整大字貼邊，載體出血」**

在「筆畫絕不裁切」的規則下，真正的字形出血不成立。建議追求它的視覺張力：**大字完整、貼近邊界，承載它的紙面／印刷底版延伸到畫外**。

一般機制 `edgeFitEmphasis`：

- 從有依據的強調詞選 1–4 字，依實際字形邊界求最大安全字級；目標主／次字級比 ≥1.8。
- 主詞與剩餘歌詞一次排好，整個演唱期間保持完整；其他歌詞不得低於世界字級下限。
- 大字可逼近安全邊界，載體可超出畫布；用歌名、真實段落標示或細線構成第三層尺度。
- 長詞放不下就降低倍率或放棄，不能裁字、壓窄筆畫或縮小其他歌詞來硬達標。

**兩種世界口味：**

| 世界 | 表現 |
|---|---|
| riso | 完整巨字印在延伸出畫外的紙面，紙邊有厚度與接觸陰影；錯版只留在主字保護區外，不讓副版穿過字腔 |
| manga screentone | 完整巨字緊貼漫畫格邊，網點頁面與格框出血；其他歌詞留在同一閱讀順序的安靜區域，避免集中線穿字 |

「大字副本在後面、前面另有可讀本」不推薦為預設：兩份文字爭主角，且裁後面副本仍然裁了筆畫。「尚未唱到的字先裁掉」也不符合整句全程可讀。

**修改位置：** `lineplan-core.ts` 的 `blowOf()` 與選句處；`render/world-layout.ts` 的 `blowPose()`、`build()`；`render/world-objects.ts` 的 `paintObject()`；`world-shared.ts`。固定頁面世界須沿用自己的版心，不能為放大拆掉原有載體。

**Q4｜進退場 5 → ≥8：缺的是連動關係，不是效果名稱庫**

指定文件已將 motion-prompt 數量更正為 192；168 是先前時間點。既有轉場數也不等於世界可用家族數：`pagecurl`、`blinds`、`cube` 若作用於閱讀中的整張畫面，多半違反本題規則。

先新增三個能普遍使用的家族，再補語意限定的交接：

| 家族 | 與既有動作的差別 | 安全實作與成本 |
|---|---|---|
| 邊緣接力 `edge-relay` | 上一張載體的外緣直接成為下一張載體外緣，不是兩段獨立滑入滑出 | 只移動字外載體；共用邊緣幾何與短平移，低成本 |
| 分層拆合 `layer-seat` | 面紙、襯紙、厚度依序落位／抽離；對應 #143 | 歌詞固定在最上層，唱完才移除；低至中成本 |
| 外框開合 `frame-open` | 從頁邊揭開場景，不是裁切字的 wipe | 遮罩限制在閱讀保護區外；可借用 #138／#140 的動作概念，中成本 |
| 主詞轉註記 `label-carry` | 唱完的重點縮到邊角，成為下一句的真實註記；對應 #158 | 需有語意承接，且不壓下一句；中成本 |
| 同詞接棒 `shared-word` | 前後句同一詞沿連續軌跡交接；對應 #161／#186 | 同詞還須同指涉；僅文字相同不足以證明語意，成本較高 |

前面三種是補足 5→8 的優先候選，不保證原有五種每段都會出現。選擇器應在**適合該世界且有安全時間的池中**抑制重複，不能按序硬輪播。

進場若會隱藏字，必須在開唱前完成；退場在唱完後開始。連唱無空檔時，歌詞準時換句，動作留在載體層完成。

**修改位置：** `render/world-motion.ts` 的 `WorldMove`、`SHARED_ENTERS`、`SHARED_EXITS` 與 pools；`lineplan-core.ts` 的 `compose()`、`planHandoffs()`；`render/world-layout.ts` 的 `build()`。跨句連動另增共享交接狀態，單純多填一個 `WorldMove` 不夠。

量測分開列登場、退場、交接；左右鏡像與快慢變體只算同一家族。退場新增三種，不能拿來宣稱登場已達八種。

**Q5｜免費專屬時刻：先鬆音樂位置，不鬆語意，再提供縮小版**

目前 `freeMoments()` 是 `checkMoments()` 通過後，再要求副歌與重拍。建議把後兩項從必要條件改為排序偏好：

1. 保留語意、逐字時間、閱讀、呼喊衝突與時刻間距檢查。
2. 首選副歌重拍，其次段落轉折，再其次其他位置的語意核心起音。
3. 效果的語意動作仍落在原本的 `m.at`；可調整預備動作去接拍，不能把意思發生的時間移到別的詞。
4. 大型形式若占用過多畫面，改成 `miniMoment`：在原世界中以局部載體開合、分離或留存表現同一語意，約占 15–30% 畫面、持續 0.35–0.6 秒。
5. 大型與 mini 合計每首仍 ≤2；沒有成立的語意就維持 0。mini 不是把普通 beat 事件換名字。

先只轉換「已過 `checkMoments()`、僅因副歌／重拍被排除」的候選。其他被拒候選若要使用 mini，必須重新驗證，不能繞過呼喊或閱讀保護。

**$0 的必要區分：** `freeMoments()` 本身不呼叫 API，但 `scripts/lyric-vj/lineplan.mts` 在無快取且未指定 `--no-reading` 時會進行讀詞。研究文件的五次讀詞也確實有成本。

因此免費驗收要包含「無 `meaning.json`、無 API 金鑰、網路呼叫數為零」案例。可使用使用者提供或既有的語意資料；沒有資料時，不保證自動產生專屬時刻。若要新歌也保證有語意時刻，須另外建立並驗證本機讀詞能力，不能以關鍵字表替代。

**修改位置：** `free-plan.ts` 的 `freeMoments()`；`signature-moments.ts` 的 `checkMoments()` 與拒絕原因回報；`render/signature.ts` 與 `render/signature-motion.ts`；免費入口明確禁用 `lineplan.mts` 的付費讀詞路徑。

**Q6｜優先順序、工期與可程式驗收**

推論工期以一位熟悉引擎的工程師估算，包含單元測試與代表影片檢查；共用排程／量測先做，約 1–2 工程日。以下不是交付承諾。

| 順序 | 項目 | 增量工期 | 建議可程式驗收 |
|---|---|---:|---|
| 1 | Q2 hold | 2–3 日 | `0.6–1.5 s` 合格短句 ≥60%、`1.5–3 s` 合格中句 ≥80% 有獨立事件；其中 ≥80% 通過合成畫面雙重 >2% 檢查；另報全部句數覆蓋率與 `<0.6 s` 結果 |
| 2 | Q1 切換 | 3–5 日 | 同基準 fast 的 `cuts015_per10` 中位 ≥15；calm 不低於6；全域換光間隔 ≥0.55 秒；新增偵測至少90%可對應真實排程事件，排除紋理沸騰 |
| 3 | Q4 進退場 | 2–4 日 | 有足夠機會的25秒窗口，實際登場與退場家族各自中位 ≥8；短到未呈現的計畫名稱不計，另報交接數 |
| 4 | Q3 尺度 | 2–3 日 | 有合格強調詞的段落 ≥80% 出現 ≥1.8× 字級比；字形裁切0、次要歌詞低於字級下限0；無合格段落另列 |
| 5 | Q5 時刻 | 1–2 日先做 gate；mini另2–3日 | 每首總數≤2；語意來源缺失時輸出0；可容納的「僅音樂位置被拒」候選，在名額內可保留；免費冷啟動API呼叫0 |

「合格」條件須在量測前固定，並輸出所有跳過原因，避免靠縮小分母提高成功率。37 世界以產品啟用清單為準，不能直接計算 `WORLD_SHARED` 的所有 key。

共同驗收至少包含：

- 固定歌曲、片段、配色與 seed 的前後比較；舊11世界保留獨立報表，再列37世界結果。
- 所有演唱幀的主字完整、字間不碰撞、前景不穿閱讀區、有效底色對比 ≥4.5:1。
- 事件邊界逐幀檢查，不能沿用只抽句中／句尾的閱讀閘門。
- 單元測試覆蓋跨句0.55秒鎖、極短句跳過、事件衝突、無語意資料、固定頁面與超長詞。
- 程式檢查之外，保留200%單幀及連續播放審查；語意是否貼切、材質是否像裸色塊，不能由面積與事件數證明。

---

## 附：brief

# Design discussion: closing the remaining rhythm gaps vs JIZURA (2026-11-09)

You are a senior motion/graphic designer and engineer reviewing a lyric-VJ product. Read the files named below in this repo before answering; answer in Traditional Chinese (台灣用語), code identifiers in English. Write your answer to the path given at the end. Do not edit any file in the repo.

## Product in one paragraph
Lyric videos generated per song: 37 "style worlds" (silkscreen, riso, manga screentone, blueprint, thermal receipt, y2k, claymation, ...). Each world draws its own pages, props and type treatment; motion (enter/exit/hold/camera/cuts/beat events) runs on a shared framework in `src/app/lyric-vj/world-shared.ts` and `src/app/lyric-vj/render/world-*.ts`, with a per-line plan from `src/app/lyric-vj/free-plan.ts` / `lineplan`. The commercial reference we are measured against is JIZURA (a competitor's output; we may read their source for reference but never copy code or exact forms).

## Where we stand (read `docs/research/2026-11-04-jizura-comparison.md`, especially 剩下最大的 5 個差距 and 共用修正之後)
After the 11-04 shared fixes:
- fast songs: 11.2 cuts / 10 s at threshold 0.15 vs JIZURA 19.2, target ≥ 15 — NOT met. Blocker noted: short lines + the world rule "two light changes at least 0.55 s apart"; adding cuts on 雙截棍-type rap lines hits that floor.
- calm songs: 6.0 vs 10.8 — median reached the ≥ 6 target only by lowering the split threshold to 2 s.
- hold events: 29/76 long lines show an ink-colour event; only 14/76 exceed 2 % frame change — most short lines get nothing.
- keyword scale: 1 line per section enlarged ≥ 1.6×, but NO true bleed/crop (would cut strokes; legibility is absolute in this product).
- enter/exit variety: 5/5 kinds per 25 s vs their 16/17.
- camera: one push/slice per new section; free signature moments 0 of ≤ 2 allowed (meaning gate too strict for these 5 songs).

A fresh measurement of all 37 worlds is running in parallel today; assume the picture above holds.

## Hard rules you must design within (read `docs/research/2026-10-31-visual-finish-bar.md`)
1. Legibility is absolute: strokes never merge, a line is readable for its whole sung time, nothing crosses a lyric being read, ink ≥ 4.5:1.
2. Moments/devices only when the lyric means it; no keyword triggers; no decoration without a reason; no bare flat primitives.
3. Every fix is a general rule for all songs and worlds (each world may give its own "taste" through world-shared.ts), never a per-song patch.
4. Free tier costs $0 API; paid director may use Haiku-level reads.
5. Owner taste: motion over static, occlusion OK, no grey flashes, text techniques (ink/glitch/slash/emphasis) loved; "AI-looking" or code-primitive-looking graphics rejected.

## Questions — give concrete, buildable answers, with reasons, and name files/functions you would change
Q1. Fast-song cut rate 11 → ≥ 15 per 10 s without violating the 0.55 s light-change floor or legibility. Which kinds of "cuts" register visually yet keep the line readable (sub-line phrase re-layout, carrier swap under the same words, camera reframe, ground-only change, props beat)? Propose a ranked set, the rule for when each fires, and how to measure it. Also say whether 15 is the right target or whether JIZURA's 19 comes partly from things we should not imitate.
Q2. Hold events that register on SHORT lines (< 1.5 s) and on medium lines at > 2 % frame change, without making the line harder to read. Propose 3–5 event families with the scale they need and the moment inside the line they land on.
Q3. Scale contrast: how to get the look of bleed/oversize type without cropping strokes. Options: oversize behind a readable duplicate, partial bleed on glyphs that are not being read yet, world-specific treatments. Recommend one general mechanism + 2 world flavours.
Q4. Enter/exit variety 5 → ≥ 8 per 25 s: which families are missing (compared with the 24 motion transitions and the ~168 motion-prompt motions we catalogued — see `docs/research/2026-11-04-motion-prompt-diff.md`), and which are cheap to add on the shared framework.
Q5. Free signature moments: the gate (chorus downbeat ± half beat, meaning-read, no shout nearby) yielded 0 on 5 songs. Should the gate loosen (how), or should a cheaper "mini moment" exist? Keep "moments by meaning" intact.
Q6. Priorities: order Q1–Q5 by visible payoff per engineering day, and give an acceptance metric for each that a script can check.

Write the answer (≤ 250 lines, markdown, tables welcome) to: /private/tmp/claude-501/-Users-seitumbp2025-vjanalytics/b1656c41-c6be-4018-ab8d-17ab46a436d2/scratchpad/codex-gaps-answer.md
