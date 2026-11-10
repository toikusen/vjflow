---
id: 2026-11-10-no-inline-line-move
date: 2026-11-10
verdict: reject
scope: world
worlds: [art-deco]
song: "大雪"
timecode: "120–122 s (clip 30–32 s)"
version: "6d1d57c seed 0, scheduler on (both holds-first and joint)"
lyric: "總在喧囂人群裡面找擁抱"
frame: "1920x1080 30fps mp4, 第1組_乙 31.9 s → 32.1 s"
layer: "text"
aspects: [構圖, 動態]
rules: [10]
evidence: [~/Desktop/vj/output/成對比較_2026-11-10/第1組_乙.mp4, ~/Desktop/vj/output/成對比較_2026-11-10/第1組_甲.mp4]
pair: ""
supersedes: "2026-11-10-art-deco-slow-inline-density"
blind: false
anchor: true
source: "transcript b1656c41-c6be-4018-ab8d-17ab46a436d2.jsonl @ 2026-11-10 (owner reply to 答題.md)"
---

## 業主原話

> 兩個都有的問題是，同一句還沒唱完字幕突然從下面變到上面，例如乙 30–32 秒

## 看到什麼

art-deco 句內 `layout-seat`（marquee-low → marquee-low+second，reason「word break on a beat」）：整句在唱到一半時從畫面下方的大牌匾切到軸線上方的副版心，位置與大小（約 0.7×）都變。holds-first 與 joint 兩版都有（119.98 s／121.98 s）。

## 適用界線

業主看的是 art-deco；判的是「正在唱的句子換座、縮放」這個動作。字不動、只有載體分版的 `carrier-swap`（poster-panel）不在此卡範圍。覆蓋 2026-11-10-art-deco-slow-inline-density 的「適用界線」：該卡接受的密度，來源正是這個動作，故不再成立；art-deco 供給上限回到一句一動作。

## inferred

推論：依「每個修正都是通則」（lyric-vj-fixes-must-generalize），所有世界的 `layout-seat` 都移除 `in-line`（blueprint、chalkboard、notebook、art-deco 與預設表）；這是 Claude 的推廣，不是業主明說的跨世界底線。

推論：業主先前說「密度可以」看的是改前改後並排，沒有指認動作；盲看單支時才察覺句內跳動。靜態並排不能替動態放行。
