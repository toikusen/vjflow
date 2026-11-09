# 節奏缺口合併：Q1 3b ＋ Q3／Q5 在 feat/lyric-editing（2026-11-10）

**結論：`feat/lyric-editing` 現在同時有 Q1 phase 3b（世界自己的材質動作、拿掉連續上限、鏡頭當排程器輸入）與 Q3／Q5 phase 2（riso 的尺度對比、意義時刻當排程器候選）。全部預設關閉；預設路徑的 job 與 Q3／Q5 分支基準逐位元組相同（去掉 3b 只做標記的 `unreliableBoundary` 欄位後）。全開後的數字與兩條分支各自最後一次量測一致，唯一的漂移是 riso 快歌 +2 次切換（Q3 的尺度構圖本身）與 Q2 tally 少數幾件（Q3 吸收 line-grow、Q5 時窗）。「Q3／Q5 之後才做鏡頭取消」這一步在 5 首 × 45 世界整首歌上沒有多丟任何鏡頭（開／關都是 2 次，同樣的句子）。**

合併 commit：見 `git log`（`🔀 merge(lyric-vj): feat/q3q5-wiring …`）。依據：`docs/research/2026-11-10-q1-phase3b.md`「與 Q3／Q5 的整合」、`docs/research/2026-11-10-q3q5-phase2.md`「Integration with 3b」。

## 解衝突的順序

| 檔案 | 處理 |
|---|---|
| `free-plan.ts` `freeJob` 事件表 | `holdMoves`、`camDrops`、`policy` 三個選填欄位都保留 |
| `world-events-adapter.ts` `currentEvents` | Q4 handoff → 3b `w.page` → 3b `wipe` → Q3 `w.scale`（只在該句沒有換 set 時）→ 一般換座 → 鏡頭 |
| `world-events-apply.ts` | `PlanLine` 取聯集；寫回改成 3b 先寫（座位、wipe、page、repose、hold 移動、鏡頭取消），Q3 最後只寫 `scale` 與被吸收的 beat（`scaled()`，兩個 return 都經過它） |
| `world-events.ts` 型別 | `WorldEvent` 同時有 `material`／`curve`／`unreliableBoundary`／`holdLevel` 與 `policy`；`WorldEventPlan`／`WorldEventTable` 同時有 `camDrops` 與 `policy` |
| `world-events.ts` `planWorldEvents` 結尾 | Q1 ＋ 3b 材質動作鋪完 → `arbitratePolicies`（Q3 再 Q5）→ 計畫後鏡頭取消（`others` 含 Q3 事件，另加已核准 Q5 時窗 `momentWindows`）→ 回傳 `camDrops` 與 `policy` |
| `arbitratePolicies` Q3 | 新增拒絕：該句的切換是 3b 材質動作（`e.material`）→ `collisionQ1: a world material move (3b) …`（Q3／Q5 文件第 2 點；目前 riso 沒有材質動作，整首量測觸發 0 次） |

`scaleOf()`（Q3 withheld）與 3b `materials[].withheld` 兩種暫停寫法並存，未統一。

新測試 `src/app/lyric-vj/world-events-merge.spec.ts`（3 個）：Q3 遇到 erase-reseat 被拒、Q5 遇到鏡頭讓步而鏡頭不被丟、無候選時沒有 `policy` 欄位。

## 開關（全部預設關閉）

| 開關 | 程式選項 | 環境變數 | 作用 |
|---|---|---|---|
| Q1 排程器接管 | `freeJob(song, { worldEvents: true })` | `VJ_WORLD_EVENTS=1` | 宣告 compositions 的世界（chalkboard、notebook、art-deco、document、blueprint）由排程器排構圖切換，含 3b 材質動作與鏡頭取消；未設時只有 `enabled` 的世界（目前沒有） |
| Q3 尺度對比 | `scaleContrast: true` | `VJ_SCALE=1` | 宣告 `WORLD_SCALE` 且未 withheld 的世界（目前只有 riso）每段至多一個尺度構圖，經排程器核准才畫 |
| Q5 意義時刻 | `meaningMoments: true` | `VJ_MOMENTS=1` | 宣告 `WORLD_MOMENTS` 的世界改用 moment policy 排名＋排程器核准（big／mini），取代今天的副歌重拍門檻 |

量測與閘門照舊：三個環境變數一起設，或腳本自己傳選項（`measure-scale-coverage --phase 2`、`measure-free-moments --phase 2` 自己開 worldEvents／scaleContrast／meaningMoments）。

## 預設指紋（`scripts/lyric-vj/default-hash.mts`，5 首 × 45 世界的 job）

| 參數 | 合併後（原樣） | 去掉 `unreliableBoundary` | Q3／Q5 分支基準 | 合併前 f88eec3（原樣） |
|---|---|---|---|---|
| seed 0 | e59b9a9f… | **e6b89ed6…** | e6b89ed6… | e59b9a9f… |
| seed 1 | 22b7ae26… | **9083b164…** | 9083b164… | — |
| seed 2 | 56ead45e… | **56bfac05…** | 56bfac05… | — |
| `--q1` | 80064273… | 1792a519… | f83d77a2… | 80064273… |
| `--q1 --seed 2` | 89481b18… | c415cce1… | c0de0a87… | 89481b18… |

- 3b 的 `unreliableBoundary`（只標記、不改行為，3b 文件第二輪第 8 點）會改 job hash：seed 0 有 99／225 列只差這個欄位。去掉後三個預設 seed 與 Q3／Q5 基準完全相同。
- `--q1` 本來就會不同：它開的是排程器，而 3b 改了排程器（材質動作、拿掉連續上限、鏡頭取消）。合併後與合併前 3b（f88eec3）逐位元組相同，表示 Q3／Q5 關閉時沒有動到 3b 的排程結果。
- 檔案：`out/research/merge-1110/hash-*.json`、`hash-strip-*.json`。

## 量測（全開：`VJ_WORLD_EVENTS=1 VJ_SCALE=1 VJ_MOMENTS=1`，seed 0）

| 量測 | 3b 最後一次 | Q3／Q5 最後一次 | 合併後只開 Q1 | 合併後全開 | 檔案 |
|---|---|---|---|---|---|
| Q1 45 世界計畫中位 快／慢 | 4.0／3.2 | 3.6／3.2（3b 前） | 4.0／3.2 | 4.0／3.2 | `out/research/merge-1110/wired.json` |
| 快歌排除比例時間詞界 | 3.6（40 件） | — | 3.6（40） | 3.6（41） | 同上 |
| 五個單頁世界 快／慢 | 3.6／4.0 | 3.6／3.6 | 3.6／4.0 | 3.6／4.0 | 同上 `.onePage` |
| Q2 0.6–1.5 秒 | 163/495 = 32.9 % | 32.9 % | 163/495 | 163/495 = 32.9 % | `planall.json` |
| Q2 1.5–3 秒 | 2987/5445 = 54.9 % | 2972/5445 = 54.6 %（開） | 2987 | 2981/5445 = 54.7 % | 同上 |
| Q2 > 3 秒 | 3331/4815 = 69.2 % | 3333/4815 = 69.2 %（開） | 3331 | 3326/4815 = 69.1 % | 同上 |
| Q3 riso seed 0／1／2 畫出（58 段） | — | 2／3／3，edgeFit 2／3／1 | — | 2／3／3，edgeFit 2／3／1，unrealized 0 | `q3.json` |
| Q5 ≥1 時刻的世界 snow／tsuzuki | — | 34／45、23／45 | — | 34／45、23／45（其他三首 0） | `q5.json` |
| 鏡頭取消（整首，5 首 × 45 世界） | — | — | 2 | 2（同樣的句子） | `camdrops.json` |
| 閱讀閘門 riso／notebook／art-deco／chalkboard／document | — | — | — | 2445 個時刻 fails 0、contract 0、rule regressions 0，ruleMoments 16；camDrops 只有 chalkboard choroin diagonal@c060（3b 已知的那一件） | `gate/`、`gate.log` |

- 「合併後只開 Q1」與合併前 3b（f88eec3 在暫存 worktree 重跑）的 `measure-world-events` 每列、`hold-plan-all` tally 完全相同。
- 全開的漂移只有一列：riso 快歌（雙截棍 76–101）切換 12 → 14（4.8 → 5.6／10 s），多出的是 Q3 尺度構圖本身；同列 `unreliableBoundary` 4 → 5、警告 4 → 5（比例時間的作曲者換座多了一件落在窗內，推論，未逐件確認）。五個 3b 世界的數字不變。
- Q2 的 −6／−5：Q3 吸收 riso 的 line-grow、Q5 時窗旁的 hold；方向與 Q3／Q5 分支自己的開／關差異相同（該分支是 −15／+2，基準不同：它沒有 3b 的排程）。
- 閘門指令：`VJ_WORLD_EVENTS=1 VJ_SCALE=1 VJ_MOMENTS=1 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/merge-1110/gate --baseline scripts/lyric-vj/style-gate-rules.baseline.json riso notebook art-deco chalkboard document`（跑在合併提交前的工作樹上，所以 JSON 的 `commit` 欄寫 f88eec3）。
- Q3 因 3b 材質動作被拒：0 次（riso 沒有材質動作）。`final check` 警告：0。

## 暫停中的項目（withheld）與重新開啟條件

| 項目 | 位置 | 條件 |
|---|---|---|
| screentone `scale.edgeFit` | `world-shared.ts WORLD_SCALE.screentone.withheld`，`scaleOf()` 回 undefined | screentone 頁面（`render/world-b5-screentone.ts`）要以放大後的框重排整頁分格（不留空格）；框在安全區內閉合，或只在宣告的邊（top／bottom）出畫且分格一起讓位；同一句只有一個載體 |
| art-deco `poster-panel` | `world-shared.ts` art-deco `materials['poster-panel'].withheld` | 排程器（`lineplan-core.ts pageSeatsFor`）與 renderer（`world-b5-deco.ts panelsOf`）改用同一個真字寬分句結果，並用 `landedEvents` 在真實歌曲上確認每件核准的主副牌都畫出 |

## 待業主決定

1. **卡片（card）的句內「波」**（tsuzuki c011，type-only mini，最高約 0.08 em）：可讀、無碰撞，但幅度很小；若看片段看不出和「波」的關係，依規則改判 `noForm`。片段：Q3／Q5 文件「業主片段」的 `card_改前改後.mp4`。
2. **art-deco 的切換密度**：已接受（不再追問），列在這裡只為了記錄；主副牌仍暫停，art-deco 目前只有句內換位。
3. **黑板擦除與收據撕口的質感**：第二輪評審（`2026-11-10-q1-phase3b-critic-r2.md`）兩組都偏好改後，但擦痕與撕口仍讀起來偏機械（質感問題，不是硬錯）。要不要再修一輪，需要業主看 `~/Desktop/vj/output/構圖切換_2026-11-10/v3/` 決定。

## 驗證

- `npx tsc --noEmit -p tsconfig.app.json`、`-p tsconfig.spec.json`：通過。
- `npx ng test --watch=false`：136 檔／1582 測試全過（合併後未加測試時 135／1579）。
- 沒有渲染影片。
