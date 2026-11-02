# Stored beat audit (2026-11-02, read-only)

Scripts and raw numbers: `out/research/beat-audit/` (audit.py, sweep.py, period.mts, true.mts, lift.py, impact.py, bar.py, ioi.py; JSON beside each). Nothing under src, scripts or song.json was changed. No API calls.

## Conclusion

1. The 180 BPM cap is NOT the cause. Replaying `estimatePeriod` (copied from `audio-analyzer.service.ts:158`) on the real flux of all 17 songs reproduces every stored tempo to 0.1 BPM; raising the cap to 260 changes none of them (period.json, `cap260` = `stored`).
2. The cause is the single-lag autocorrelation (`:164-168`) with the 120 BPM log-Gaussian weight (`:161`, `:169`). On the 3:4 songs the raw autocorrelation at 97 and 129 BPM is within 1-3% (e.g. ぷろふぃ〜る 469 vs 480), so the weight tips it to the 129 peak (a 4:3 dotted-eighth relation, 129 = 194 x 2/3 = 97 x 4/3, which is why the numbers look like a cap effect). Without the weight, 5 of the 8 wrong songs already move to ~92-98 (indigo 97.9, てぇてぇ 92.7, 黄昏 94.2, LOVE YOU 99.7, i REVOLUTION 92.4); ぷろふぃ〜る and チョロイン stay at 129 because 129 is a real local peak there. The weight also drags broad peaks toward 120, which explains the 4-5% slow group (世界 128.7 vs ~146-152, 行星 141.1 vs ~147.5, 終わりじゃない 130.8 vs ~137.8).
3. Truth check without labels, three independent ways (all on the audio, not on the detector): (a) comb of onset strength over tempo 55-260: peaks at 97 and 194, nothing at 129 for ぷろふぃ〜る, チョロイン, indigo, 黄昏; (b) onset lift at beats (mean onset under +-30 ms / mean onset; random phase at the same tempo is ~4.4): stored beats 7.0-7.6 on the 3:4 songs, the browser detector's 9.6-11.0; in the right songs both are equal (雙截棍 9.8 / 9.8); (c) チョロイン hi-hat and snare onsets, best phase: 73% lie within 40 ms of a 194 BPM grid (chance 26%) but only 21% on a 129 BPM grid (chance 17%).
4. librosa is not independent here. Our librosa 0.11 (`beat_track`, default start_bpm 120) gives 129.2 for ぷろふぃ〜る, チョロイン, indigo, i.e. it reproduces the stored error (the same 120 prior); the progress doc says librosa sided with the detector on 5 of 6, which I could not reproduce (version or settings differ; unknown). librosa is also wrong-octave on the ballad (Keep Your Fire 161.5, felt tempo already halves the stored 154.6) and on 世界 it agrees with the detector (152).
5. Octave: for the 3:4 group the quarter note is 97 (eighths 194). 194 as "beat" would be possible, but 97 is the metrically sensible pulse; both differ from 129 by the same non-integer ratio.

## 17 songs (20 entries; 世界のつづき and てぇてぇ each appear twice, 行星 = Bestards also in beta)

| song | stored | browser detector | librosa 0.11 | stored/detector | replay, cap 260 | replay, no weight | comb top peak | onset lift stored / detector |
|---|---|---|---|---|---|---|---|---|
| i REVOLUTION | 123.9 | 92.6 | 123.0 | 1.34 | 123.9 | 92.4 | 92.5 | 7.5 / 10.8 |
| 世界のつづき (x2) | 128.7 | 151.0 | 152.0 | 0.85 | 128.7 | 144.3 | 146 (73 x2) | 4.5 / 8.7 |
| てぇてぇ (x2) | 124.4 | 92.8 | 123.0 | 1.34 | 124.4 | 92.7 | 93.0 | 7.6 / 11.0 |
| indigo | 128.7 | 97.0 | 129.2 | 1.33 | 128.7 | 97.9 | 97.0 | 7.0 / 9.4 |
| 三年後的大雪 | 119.3 | 120.1 | 123.0 | 0.99 | 119.3 | 119.3 | 120 | 10.4 / 11.0 |
| ぷろふぃ〜る | 128.7 | 97.0 | 129.2 | 1.33 | 128.7 | 129.3 | 97.0 | 7.2 / 9.7 |
| Keep Your Fire Burning | 154.6 | 79.0 | 161.5 | 1.96 (octave; felt tempo halves it) | 154.6 | 159.4 | 79.0 | 11.3 / 13.0 |
| sweet timer | 100.0 | 98.8 | 99.4 | 1.01 | 100.0 | 99.3 | 99 | 10.6 / 10.7 |
| LOVE YOU KILL YOU | 129.8 | 100.1 | 136.0 | 1.30 | 129.8 | 99.7 | 100 | 5.4 / 9.0 |
| 第六感 | 131.1 | 133.8 | 136.0 | 0.98 | 131.1 | 67.5 | 134 | 6.5 / 8.3 |
| 我愛台妹 | 107.5 | 107.2 | 107.7 | 1.00 | 107.5 | 107.3 | 107 | 13.9 / 13.8 |
| 行星 (Bestards) | 141.1 | 147.5 | 143.6 | 0.96 | 141.1 | 147.8 | 148 | 5.2 / 9.8 |
| プラトニックチョロイン | 128.3 | 97.0 | 129.2 | 1.32 | 128.3 | 129.2 | 97.0 | 7.1 / 10.0 |
| 天文対話 | 128.6 | 128.2 | 129.2 | 1.00 | 128.6 | 76.1 | 96.5 (stored also fine) | 7.3 / 10.7 |
| Tokyo Drift | 127.3 | 127.3 | 129.2 | 1.00 | 127.3 | 127.5 | 127 | 10.7 / 10.7 |
| 雙截棍 | 101.4 | 100.9 | 99.4 | 1.00 | 101.4 | 67.5 | 101 | 9.8 / 9.8 |
| 黄昏サイクル | 126.8 | 95.1 | 95.7 | 1.33 | 126.8 | 94.2 | 95.0 | 7.4 / 9.6 |
| 空蝉 (Ringwanderung) | 92.4 | 91.4 | 92.3 | 1.01 | 92.4 | 91.9 | 91.5 | 12.2 / 11.0 |
| beta: 終わりじゃない | 130.8 | 137.8 | not run | 0.95 | - | - | - | 5.1 / 10.0 |

Counts: 3:4 wrong (7 songs, 8 entries): i REVOLUTION, てぇてぇ, indigo, ぷろふぃ〜る, チョロイン, 黄昏サイクル, LOVE YOU KILL YOU. Slow 4-15% group: 世界のつづき, 行星, 終わりじゃない. Right: the rest. Disabling the weight is not a fix by itself (第六感 and 雙截棍 and 天文対話 would flip to the half octave 67-76).

## How much it matters

Stored beats vs the detector's beats (period 600-650 ms on the 3:4 songs): median distance 148-164 ms, 90th percentile ~300 ms (more than half a beat), only 23-25% within 70 ms, which is what a random phase gives. In a right song (雙截棍): median 13 ms, 99% within 70 ms. Against the true 8th grid the stored beats are also at chance (47-49% vs 45%).

Existing treatments (impact.py; shot boundaries and moments vs stored beats / true beats):
- チョロイン (bench2): stored tempo 128.3 vs 97. Stored beats median 153 ms off the true beat. Shot boundaries are not beat-locked in the first place (31% within 70 ms of a stored beat, chance level). The 8 moments (drop/build): median 91 ms from a stored beat, 237 ms from a true beat, 0 of 8 within 70 ms of a true beat.
- ぷろふぃ〜る (db designA, old director): the director snapped shot starts to stored beats (70% within 70 ms, median 0), so 70% of them are median 169 ms from a true beat (26% within 70 ms). Moments: 286 ms median from true.
- てぇてぇ (db studio): shot boundaries median 236 ms from true beat (14% within 70 ms; period 647 ms); moments 276 ms.
- 世界のつづき (bench2): tempo off by 15%; moments median 177 ms from stored beats, 19 ms from the detector's beats (4 of 6 within 70 ms of true, 0 of 6 of stored).
- 終わりじゃない (beta, all runs): stored beats median 104 ms from true, 35% within 70 ms; shot boundaries 43% (same as true); moments 102 ms stored vs 168 ms true.
- Controls (雙截棍, 天文対話, 我愛台妹): stored and true agree within a few ms to 10 ms; no change.

Reading: what is beat-locked in a paid result is the stored beat grid used by `cutTimes` (cuts inside a shot), the beat pulse and stomps in the renderer, `onBeat` snapping in codelayer (+-0.25 s), the director prompt (tempo, beats per cue, downbeats), boardplan event offsets (60 / tempo) and, in older runs, shot start snapping. On 3:4 songs these are off the true beat by about a quarter to half a beat, with no relation to the pulse that a viewer taps. Shot boundaries of the newer treatments follow the lyrics, so they stay where they are.

## What would change in out/beta

- `songs/HHU4qTVniRvH` (終わりじゃない, tempo 130.8 -> about 137.8, +5.4%): every run built against the old song.json: runs `KJLHryENfDxD`, `uCCfR224F4Qi` (jobs 527N.., FkAy.., p4pj.., zZ9k make, V69Z fix), `0UrnJy5gL1e1` (img make gKVl), `9Fh9H9BoxbHq` (fix). Cuts, pulse and beat events inside shots move by up to a few hundred ms; the story, shots and cue treatment do not depend on beat indices (treatment cues carry emphasis by character, not by beat).
- `songs/nzRB1zNgEnRS` (行星, 141.1 -> about 147.5, +4.5%): job `DLHaa0M3Tbqt` (paid img make, $3.62); its run folder is not on disk, so nothing to rebuild locally.
- Not in beta, but in out/db and bench2: 7 songs with the 3:4 error and 世界のつづき, 行星 with the slow error. Songs unaffected: 雙截棍, 我愛台妹, 天文対話, Tokyo Drift, sweet timer, 大雪, 空蝉, 第六感.

## Smallest fix (text only, not applied)

In `estimatePeriod` score each lag as the autocorrelation at lag + lag x 2 + lag x 4 (the 1, 2, 4 multiple sum `beat-detect.ts` already uses and the audit shows lands 2x chance on every wrong song), keep the same 70-180 BPM search range and the same parabolic refinement, and shrink the 120 BPM weight (sigma 0.9 -> about 1.5 octaves, or drop it once the multiple sum is in). Raising the 180 cap does nothing. Even simpler: have `analyzeAudio` take `tempo` and the period from `detectBeats` in `beat-detect.ts` (only the repo's own Fft is shared). Keep `feltTempo` as is: it halves by lyric density and is independent of this (Keep Your Fire).
Guard: add a unit test with a synthetic click train at 97 BPM with eighth-note off-beats at 3:4, plus keep the 雙截棍 / 我愛台妹 / sweet timer tempos within 1 BPM as regression.

Effort: a fix changes `song.json` `tempo`, `beats`, `downbeats`, `beatStrength` and `sections` (sections use beats), so it must be re-derived by re-running only the audio analysis step of `song.mts` (no Whisper, no API), or by a small script that rewrites those fields in place (keep a `song.before-beatfix.json`). The paid director does NOT need to be re-run: its output is shots/cues by seconds and characters. Required: rebuild `typeplan` (and `linedirect` for the free-type/line path) and re-render videos you want improved; `fix-apply` already reads felt beats from song.json. A director re-run is only worth it for runs made with the old beat-snapping director (designA/designV in out/db) and, for new runs, it picks up the new tempo and beats-per-cue figures automatically. Existing results change: cut and pulse timings move (3:4 songs by 150-300 ms, slow group by 5-15% of tempo drift), so a paid delivered video would differ if rebuilt; leave delivered videos alone unless the user asks.

## Limits of this audit

No human labels. "True" = agreement of three audio-only measures plus the repo's own detector; the 97 vs 194 choice for the quarter note rests on the usual 4/4 reading. librosa 0.11 was run with defaults. The "cut times" in a rendered paid video were not extracted (cuts are built at render time from song.json beats); the distances above use the same beat grid, so they are the position error of beat-snapped items, not measurements on mp4 frames.

## Fix applied (2026-11-02, new analyses only)

`estimatePeriod` (`src/app/audio/audio-analyzer.service.ts`, now exported) scores each lag as `ac(lag) + 0.25 * ac(lag/2)` (length-normalised) and the 120 BPM log-Gaussian sigma is 2.5 octaves (was 0.9). The audit's proposed `lag + 2 lag + 4 lag` sum was replayed first and did NOT fix it: indigo, ぷろふぃ〜る, チョロイン and 黄昏 stay at 126-129, and 第六感 and 行星 break (108, 100). The half-lag term (the 194 BPM eighth grid the comb shows) is what moves them to 97. Replay of the real function on the 17 songs' flux (stored / new / comb truth, all within 4%): i REVOLUTION 123.9 / 92.9 / 92.5; 世界 128.7 / 140.9 / 146; てぇてぇ 124.4 / 93.2 / 93; indigo 128.7 / 97.9 / 97; 大雪 119.3 / 119.6 / 120; ぷろふぃ〜る 128.7 / 98.3 / 97; Keep Your Fire 154.6 / 79.9 / 79 (octave now equals the comb and what `feltTempo` produced); sweet timer 100.0 / 99.3 / 99; LOVE YOU 129.8 / 99.9 / 100; 第六感 131.1 / 132.5 / 134; 台妹 107.5 / 107.8 / 107; 行星 141.1 / 146.3 / 148; チョロイン 128.3 / 97.9 / 97; 天文対話 128.6 / 129.0 / 128.6; Tokyo Drift 127.3 / 128.2 / 127; 雙截棍 101.4 / 100.7 / 101; 黄昏 126.8 / 94.7 / 95; 空蝉 92.4 / 92.3 / 91.5. Caveat: the weights were chosen on these same 17 songs (no held-out set); neighbours (half-lag weight 0.15-0.35, sigma 1.5-3.5) lose one song each, mostly 天文対話 at 0.35 and ぷろふぃ〜る at 1.5. Stored song.json files are untouched; only new analyses use this. The running 4320 server and `dist` keep the old analyzer until dist is rebuilt (and the server restarted for any server-side change).
