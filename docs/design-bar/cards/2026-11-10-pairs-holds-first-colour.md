---
id: 2026-11-10-pairs-holds-first-colour
date: 2026-11-10
verdict: accept
scope: world
worlds: [file, card, spy, art-deco]
song: "雙截棍 / 大雪"
timecode: ""
version: "6d1d57c seed 0 Huninn, scheduler on; holds-first vs joint (VJ_JOINT)"
lyric: ""
frame: "1920x1080 30fps mp4, 4 blind pairs 甲/乙, 55–60 s each"
layer: "text"
aspects: [動態, 節奏]
rules: [10, 11]
evidence: [~/Desktop/vj/output/成對比較_2026-11-10, out/research/q1-1109/pairs-4c-key.json]
pair: ""
supersedes: ""
blind: false
anchor: true
source: "transcript b1656c41-c6be-4018-ab8d-17ab46a436d2.jsonl @ 2026-11-10 (owner reply to 答題.md)"
---

## 業主原話

> 第二組：乙有顏色變換，不錯。但我覺得變換要合理也不是隨便換。
> 第三組：字卡後面的細節一直在變換。乙有顏色變換，不錯，看起來比第二組的自然。
> 第四組：我看不太出來差別，但我覺得看起來都還不錯。
> 第一組：兩個其實都還行，乙好一點。

## 看到什麼

盲測解碼：第二組乙、第三組乙 = holds-first（句子停下來後的落定動作保留）；第一組乙、第四組乙 = joint。業主在 file 與 card 偏好 holds-first 的換墨色；第二組（file，21 個 hold 中 19 個 ink-swap，每句同位置）被說「隨便換」；第三組（card，roll／beat-punch／ink-swap／line-ink-settle 輪替，ink-swap 3 句）被說「自然」。spy 兩版無差；art-deco 略偏 joint（無 line-grow）。

## 適用界線

holds-first 留為預設契約；joint 不取代，維持實驗開關。接受的是「停留後換墨色」這類動作本身；每句同位置、同種的換色不在接受範圍，換色要有理由（規則待 Codex 裁定，見 docs/research/2026-11-10-pairs-codex.md）。

## inferred

推論：業主感受的「自然」來自種類輪替與較低的 ink-swap 比例，不是來自 hold 數量；file 的單一候選（只有 ink-swap）是「隨便換」的來源。
