---
id: 2026-11-14-ink-halo-4-2-pass
date: 2026-11-14
verdict: accept
scope: global
worlds: []
song: "チョロイン"
timecode: "146-156"
version: "9c727b1 seed 0"
lyric: ""
frame: "1920x1080 30fps mp4 clips, one per halo, a 3-row full-size crop and a 3x still at 153.3 s"
layer: "text"
aspects: []
rules: [6, 10]
evidence: [~/Desktop/vj/output/字色可讀_2026-11-12/v4]
pair: ""
supersedes: ""
blind: false
anchor: false
source: "coordinator relay of the owner's v4 verdict, 2026-11-14"
---

## 業主原話

> 保護區我看不出來，你直接挑一個吧

## 看到什麼

Three versions of the same clips, each with a different clean zone round the words where the noise effects stay off:
none, 4 + 2 px, and 8 + 4 px (dark-glitch 2:26–2:36, popart 1:22–1:32). The owner could not tell the three apart. In
the 3x zoom, 8 + 4 px leaves a slightly cleaner rim round the strokes.

## 適用界線

Every world, every job:
- The halo is on by default at 4 px clean, coming back over the next 2 px (INK_HALO).
- 8 + 4 px stays only as a QA setting; so does `treatment.inkHalo: false`.
- The owner did not choose between the versions. This is the engineering default (Codex ruling 2026-11-13 §2: take the
  smallest halo that passes).
- It can be revisited if a sticker look (貼紙感) or a hole look (挖洞感) shows up later.

## inferred

推論:
- At normal playback the halo is invisible at both sizes, so it costs nothing to the look.
- The cleaner rim seen only in the 3x zoom of 8 + 4 px is why the smaller one was taken.
- No aspect is anchored: the owner judged no visual aspect, so the card is kept as a record (`anchor: false`).
