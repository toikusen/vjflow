---
id: YYYY-MM-DD-slug            # = file name without .md
date: YYYY-MM-DD
verdict: accept | reject | boundary
scope: global | world | song  # song = one song/clip only, retrieved only with --song
worlds: [screentone]           # world ids; [] when it is about a song or the whole product
song: ""                       # song id or title as the owner named it; "" if none
timecode: ""                   # "92.9" or "67-92"; "" if whole clip
version: ""                    # commit (not just a branch) + seed when known; what the owner actually saw
lyric: ""                      # the lyric text as laid out, with line breaks as "/"; "" if not about a line
frame: ""                      # frame size / playback size / fps / compression of the evidence, e.g. "1920x1080 30fps mp4 strip"
layer: ""                      # what was judged: text | carrier | page | props | camera | whole
aspects: []                    # which of 類型 構圖 字體 材質 動態 the verdict covers; others count as 未判定
rules: [8]                     # which of the 12 rules it evidences; [] if none fits
evidence: []                   # image/clip/board paths (Desktop or out/research); never copied into git
pair: ""                       # id of the before/after partner card, same world + same lyric only
supersedes: ""                 # id of the card this verdict replaces (owner changed their mind)
blind: false                   # true = held out for critic blind tests
anchor: true                   # false = kept for the record (process rules), never packed
source: ""                     # where the quote was found: transcript/memory/doc path (+ line or date)
---

## 業主原話

> 逐字。沒有原話就寫「（無原話，見 inferred）」。

## 看到什麼

一到三行，只寫畫面上可見的事實與位置／時間碼，不寫原因。

## 適用界線

判決成立的情境與不適用情境；若是前後配對，寫改了什麼。可空。

## inferred

AI 推測的原因，標明推論；可空。
