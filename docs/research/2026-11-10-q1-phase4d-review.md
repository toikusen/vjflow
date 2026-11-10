# Phase 4D round 2 — adversarial review (58aa1a0..48985d9)

Reviewer: fresh-context code review, 2026-11-10. Everything was executed in a clean detached worktree at 48985d9, not the
live worktree. While this review ran, the live worktree had uncommitted scrapbook edits to world-b5b-sets.ts,
world-sets.ts, world-b5b-scrap.ts and carrier-fit.spec.ts. Early plan dumps run against those edits were thrown out and
redone at 48985d9. No branch edits.

## Overall: FAIL (claim 6 by instruction; also the baseline masks future regressions)

The containment fix itself holds up under every attack tried. Two things fail:

- the scrapbook cross regression (claim 6);
- the baseline file. It records the broken "before" counts, so midcentury could slide back to 53 overflow moments and
  194 rule-cross moments without the gate failing.

## Per claim

### 1. Band containment, declarative, composer reseats — PASS

- **Code:**
  - `render/carrier-fit.ts:69-87` bandFit: ink = part box + `under` reach + 0.35 em inset inside the band, and ≥ 12 px
    from the band lines.
  - `render/world-sets.ts:310-333` blockOf: shrinks each missing part by 0.97 down to the floor
    (`TYPE_FLOOR.lo` 84, `:307`), then sets `bandMiss`.
  - `render/world-b5b-sets.ts:27-44` MC_BARS / bands; `:93` SET_BANDS.
  - Composer: `lineplan-core.ts:388-402` (pickRecipe), `:966-970` (bandMeasure / bandMissed), `:1037` (seatsFor),
    `:1452-1454` (named / lead / repeat).
- **Plan dump (executed):** 3 band worlds × 5 songs × seeds 0–2 × {off, on, joint}, every line's set, repose sets and the
  scheduler's `seatAfter`, measured on the job's real face with `setWordSafe(true)`.
  - Result: **0 lines on a band set with bandMiss** (midcentury 459/459/464 banded lines, claymation 193, scrapbook 466).
  - Sleeve type in use: 84–104 px.
- **Reseats:** 48985d9 vs cb5bad1 changed 323 line sets, all in the 13 hash rows below. The main moves are
  sleeve→cut (49), sleeve→dusk (44), scrapbook index→dots (27) and claymation strips→night/slab.
- **Composer measure vs render measure:** checked on 1881 (face × text × band set) combinations from the real-advance
  fixture. bandMeasure was never looser than the real measure (0 cases where the plan fits and the render misses).
- **Residual risks (not failures):**
  - The renderer ignores `bandMiss` (`world-layout.ts:294` draws the block anyway). Safety rests on the composer's wide
    measure.
  - `hold-room.ts:48` growRoom keeps a grown line inside the band box but ignores the 0.35 em inset and the
    misregistration reach. No band set gets a line-grow beat today (beat tally: midcentury only plate-spread, which
    needs a blown-up word; blow is off for `keepRows` sets, `world-layout.ts:281`).

### 2. strokeClear, 12 px keep-out, drawn segments reported — PASS (with note)

- **Code:**
  - `carrier-fit.ts:111-122` (evenodd clip of words ± 12 px).
  - `world-b5b-mc.ts` bar(): words = e.rect + 8 px (REG_REACH), and declareBands subtracts the keep box.
- **Note:** the page bitmap is cached with e.rect quantised to 24 px (`world-b3-shared.ts:147-151` still). The clipped
  gap can therefore be computed for a rect up to about 23 px off the current one. Harmless today, because bandFit already
  holds the ink ≥ 12 px from the full, unclipped lines. strokeClear is belt-and-braces.
- **Doc / 說明 wording:** both say "套版線在字旁斷開" at 6.88 s. In the v8 frame the key line simply stands more than
  12 px away and is never cut. Cosmetic.

### 3. Gate rules carrier-overflow / rule-crosses-text; before→after — PASS for the numbers, FAIL for the baseline

- **Code:** `reading-rules.ts:46-54` (thresholds 3 px and 2 px at 480 × 270), `:85-132` declaredRules,
  `gate-page.mts:33-47`.
- **Reproduced at 48985d9:**
  - Off, 5 songs: midcentury overflow 0, rule-cross 0, plate 150; popart 0/0, low 1; scrapbook overflow 0, cross 158 →
    regression vs 141.
  - On (popart + midcentury): fails 0, contract 0, regressions 0, overflow 0, rule-cross 0, camDrops choroin c060.
  - Outputs: `critic-4d-r2/review-gate-off/`, `review-gate-on/`.
  - The "before" numbers 53/194, 18 and 13 are taken from the implementer's `gate-cf-before-r4.log` (58aa1a0); not
    re-run here.
- **Baseline: FAIL.** `scripts/lyric-vj/style-gate-rules.baseline.json` sets midcentury carrier-overflow 53 and
  rule-crosses-text 194, claymation 18, scrapbook 13: the broken state. `regressions()` (`reading-rules.ts:266-272`)
  allows share(before) + 2 %. That gives midcentury about 63/489 overflow and about 204/489 rule-cross moments before
  anything fails. The doc's line "midcentury 是 0, 符合 code review 的條件" does not match the file.
  - Fix: write the after counts (0/0/0/0) for these four entries, or make both rules absolute (any count > 0 fails).
- **Blind spots, by design:**
  - A line standing wholly off its band is skipped (on1 < 0.5·ink → `continue`, `:126`). A synthetic test gave 0 for a
    run entirely past the band.
  - A band the off-frame cannot see is dropped. In the cream-sleeve palette the sleeve's second bar is s.faint = ground
    (#F1E6CC), so its part is never gated.

### 4. Popart wedge tail — PASS

- **Code:** `balloon-tail.ts` (root 110, len ≤ 96, straight sides); `world-b3-popart.ts:236-246` uses it.
  `world-events-phase4d.spec.ts:131-139` checks the tip stays inside the panel.
- **Frames:** `popart-balloon+low-still.png` at full size shows a root of about 110 px and a tip about 50 px off the rim.
  `popart-3.14` and `popart-6.88` show short, wide wedges with one continuous contour.

### 5. frame-check ignores halftone refocus — PASS (thin margin)

- **Code:** `render/frame-check.ts:56-78` (structure-tensor coherence, 0.5 at window 5).
- **Sample:** scored the 28 hand-labelled calibration events (`q1-calib.mts score`) with the old and the new
  frame-check. Agreement was 27/28 both ways. Every event labelled realized stays realized; no real cut was dropped.
- **Margins shrank and SEEN was not re-tuned** (`seat-geometry.ts:193`, outline 0.08):
  - embroidery-fast-95.96 is now seen only through ring 0.085, against the 0.08 threshold;
  - card-fast lost its ground signal;
  - blueprint-fast lost its ring signal;
  - scrapbook ring 0.30 → 0.14.

### 6. Scrapbook cross 140 → 158 — FAIL

Reproduced: 158/489 against baseline 141/489 (+3.5 % > 2 %), and the gate exits 1.

### 7. Medians, Q2, fingerprints, tests — PASS (one count wrong)

- **Medians and Q2:** `phase4d-r2.json` (bc4c636): 13-world median 3.6/3.2 and declared-12 3.6/3.2 on every seed;
  contract 0, unlaid 0. `planall-4d-r2.json`: 164/495 = 33.1 %, 3044/5445 = 55.9 %, 3404/4815 = 70.7 %, lost 0.
  - Both files were measured at bc4c636, before eeca5f2 changed the scrapbook bands. They are not re-measured at HEAD.
    This matters only if scrapbook is in a measured group.
- **Fingerprints:** re-ran `default-hash.mts` at 48985d9 for seeds 0/1/2: `3162917d`/`7ff3305a`/`3306d0dc`, matching
  `hash-4d/r2-seed*.json`.
  - Changed rows are 5 + 4 + 4 = **13, not 15**: snow/midcentury (seed 0 only), choroin/{scrapbook, midcentury,
    claymation}, tenmon/midcentury. All are in the three claimed worlds.
  - These are plan hashes. Sleeve and cut sizes are decided in the renderer's blockOf, so the *rendered* change covers
    every midcentury, claymation and scrapbook band line in every song (for example nun/tsuzuki midcentury: same plan,
    smaller sleeve type). Say so to the owner.
- **Tests and compile:** tsc app/spec pass at 48985d9 and at every commit 58aa1a0..eeca5f2 alone. `ng test`: 141 files,
  1725 tests pass.
- midcentury stays `enabled: false` (`world-shared.ts:432`).

### Frames (critic-4d-r2, half-resolution composites zoomed; no full-size render made)

- midcentury 6.88 after, cut-r: 「雪」 sits about 25 px (half-res) inside the mustard bar. The misregistration stays on
  the bar, and the key line is more than 12 px from the ink.
- midcentury 3.14, sleeve, both sides: cream type of about 100 px sits fully on the black bar. The orange key line is
  about 30 px from the glyph tops, and the type reads clearly.
- midcentury 30.98 (dusk): clean.
- Owner trade-off: sleeve type went from about 150 px to 84–104 px. It is stated in 說明.md.

## Required

1. Write the after counts into the baseline for midcentury, claymation and scrapbook carrier-overflow and
   rule-crosses-text (0), or make both rules absolute.
2. Scrapbook cross 158: fix or rule on it (separate commit).
3. Correct "15 rows" to 13, and say the rendered change reaches every band line.
4. Re-tune or re-confirm SEEN.outline after the coherence change; one labelled cut now passes by 0.005.
5. Optional hardening: have the renderer refuse a `bandMiss` block, and add the inset and reach to growRoom.

---

# Round 3 — adversarial review (fe95ff1..bfcbe85)

Everything was executed in a clean detached worktree at bfcbe85. No branch edits.

## Overall: PASS, with three items for the owner or the next round (none blocks)

## Per claim

### 1. Shrink → wrap → reseat; scrapbook bands; slot fit; calls off bands — PASS

- **Order, from the code** (`render/world-sets.ts`):
  - the line shrinks on its own bands down to the set's `lo` (`:327` `floor = given.lo`, `:345` `kept = shrink(given)`);
  - then it wraps into the set's rows (`:350-352`, `wrap: true`);
  - only then is it marked `bandMiss` (`:354`), and the composer takes another set (`lineplan-core.ts:970` bandMissed).
- **Plan dump** (3 band worlds × 5 songs × seeds 0–2 × off/on/joint, real job face, `setWordSafe`; script
  `scratchpad/q1review4d/r3plan.mts`):
  - **0 false reseats**: no line sits on a non-band set while one of its world's band sets could hold it in the real face
    and the composer's wide measure said "miss".
  - Band lines that now stand under the old 84 px floor: midcentury 37, claymation 14, scrapbook 52 (instances across
    15 song × seed runs). Smallest: 70 for claymation and scrapbook, 83 for midcentury sleeve (snow c022/c040).
- **Wrap wording.** The wrap is by character, with kinsoku for small kana and punctuation (`world-sets.ts:416-424`
  wrapped); it does not break by word. The doc says 「按字切行」, which is accurate; the coordinator's summary "by word"
  is not.
- **Shared-shot pairs:**
  - The composer's world-pair path (`lineplan-core.ts:1429-1435`) puts the line on `W.pairSet` with no `bandMissed`
    check. Only the renderer's blockOf checks it at its slot (`seat-geometry.ts:61` slotSpec carries the slot,
    `world-sets.ts` `placed`).
  - Reconstructing slots by shot order flagged choroin s0 scrapbook c020/c022/c046 and tenmon s1 midcentury c034 as
    misses.
  - I rendered all four at full size (`critic-4d-r3/review-frames/`): every one sits inside its paper or bar. My slot
    reconstruction was wrong, so there is no fault.
  - The gap stays a latent one: a pair line's miss is never seen by the composer, and the renderer still draws a
    `bandMiss` block.

### 2. Absolute rules — PASS

- `reading-rules.ts:274` ABSOLUTE_RULES; `:281` any count > 0 is a regression, with no share and no slack.
- The baseline now records 0 for midcentury, claymation and scrapbook.
- Note: the absolute check runs only through `--baseline`, and only for a world listed in that file
  (`style-gate-reading.mts:133-135`). Every world is listed today.

### 3. Gate under the committed baseline — PASS

| Run | Exit | midcentury | claymation | popart | scrapbook |
|---|---|---|---|---|---|
| Scheduler off (5 songs) | 0 | plate 167 (baseline 167), overflow 0, rule-cross 0, low 0 | all 0 | low 1 (tenmon c016, pre-existing), others 0 | cross 143 (baseline 141, within 2 %), overflow 0 |
| Scheduler on (popart + midcentury) | 0 | plate 165 | — | low 1 | — |

- Both runs: fails 0, contract 0, regressions 0.
- Scheduler on: camDrops are choroin c060 for both worlds.
- Outputs: `critic-4d-r3/review-gate-off/`, `review-gate-on/`.

### 4. midcentury plate 155 → 167 — PASS on substance, process note

- **What the rule measures** (`reading-rules.ts:5-7`, `:189-199`): the median luminance inside the words' box differs by
  more than 32 from a ring outside it, and the inside is flat (spread < 20). In other words, a flat patch under the
  words, darker than what is round them (`plate < 0`). This is the 2026-11-04 underlay/pill finish rule; contrast is
  `low`'s job, and `low` stays 0.
- **Where the moments are.**
  - At 48985d9 there were 150 plate moments: sleeve 64, cut 46, cut-r 40.
  - At bfcbe85 there are 167: sleeve 74, cut 50, cut-r 43. Every one is on the owner-approved bars
    (`style-gate-rules.accepted.json:11-13`).
  - Moment by moment, 43 are new and 26 are gone. The new ones are lines that returned to the sleeve or cut once they
    could shrink to `lo`, plus smaller type on the same bars.
- **Verdict:** more approved bar area, not an unapproved flat or a legibility fault.
- **Process:** the baseline was raised without a browser re-run. I ran it: exit 0 at 167 off and 165 on.

### 5. Medians, Q2, tests, fingerprints — PASS

- `phase4d-r3.json` (fe95ff1): 3.6/3.2 on all three seeds for the 13-world and declared-12 groups; contract 0.
- `planall-4d-r3.json`: 164/495, 3039/5445, 3404/4815 = 33.1/55.8/70.7 %; lost 0.
- tsc app/spec pass; `ng test` 141 files, 1728 tests pass.
- `default-hash.mts` at bfcbe85: `e903b91a`/`b4185398`/`6492bf04`, equal to `hash-4d/r3-*` and `r4-*`.
- Against the original fingerprints exactly 4 rows changed (choroin/claymation, choroin/midcentury, choroin/scrapbook,
  tenmon/midcentury), the same on all three seeds.

### 6. Doc corrections — PASS

The doc now says 13 rows, says the renderer-side change reaches every band line, and says the 6.88 s line is simply more
than 12 px from the key line. It also records the SEEN margin 0.085 vs 0.08.

### 7. Frames — PASS

- `critic-4d-r3/` 3.14, 6.88 and 30.98 (zoomed composites), plus my full-size renders (`critic-4d-r3/review-frames/`):
  - every glyph, and its misregistration, sits inside its bar;
  - the key lines are at least 40 px from the ink;
  - sleeve type at 83–103 px is cream on black and clearly readable;
  - the two-row scrapbook torn-paper lines stay on the paper.

## For the owner or the next round

1. **New floor on band sets.** Band sets now go to the set's `lo` (70 px), below the product-wide `TYPE_FLOOR.lo` 84
   (9120f50, "never set small"). That rule was about short lines left small in an empty frame; here the type is a long
   line on its bar. Readable, but it is a rule change the owner should see.
2. **Pre-existing, not from this range.** A split line's small part is still set below `lo`: choroin s2 c074 on
   midcentury/cut at 56 px, tsuzuki c010 at 65 px. The same numbers come out at 48985d9.
3. **Latent gaps.** The world-pair path skips the composer's band check, and the renderer draws `bandMiss` blocks
   anyway. Neither is seen in these songs.

---

# Rounds 4–5 — adversarial review (4cd7be8..bbdcafb)

Executed in clean detached worktrees at bbdcafb, with bfcbe85 as the "before". No branch edits.

Artefacts:

- `critic-4d-r5-review/gate-off/`, `gate-on/`
- `critic-4d-r5-review/stills/`
- `critic-4d-r5-review/*.jpg` (full-size frames)

## Overall: FAIL on one claim — the ProRes alpha signature line is drawn, but in the wrong ink

Everything else passes.

## Per claim

### Band floor 84 px, shrink → wrap → reseat, pair split — PASS (one pre-existing exception)

- **Code:**
  - `render/world-sets.ts` floor = `max(lo, TYPE_FLOOR.lo)`;
  - `legal()`: no part goes below min(floor, the size the set first laid it at);
  - `lineplan-core.ts` bandMissed now takes the slot;
  - the pair loop deletes any pair whose line misses its slot band.
- **Plan dump** (3 band worlds × 5 songs × seeds 0–2 × off/on/joint, real face):
  - midcentury and claymation minimum 84 px;
  - scrapbook minimum 72 px. This is choroin s2 c074 on scrapbook/index, small part [99, 72]: splitBlock's container
    clamp, which the fit is allowed to keep. The "all band lines ≥ 84" test covers seed 0 only.
- **Frames:** the dump's apparent slot misses (tenmon s0 c034/c035, choroin s0 c046/c047) were rendered at full size. All
  sit inside their bars or paper, so the misses came from my slot reconstruction, not from the layout.

### Gate on six worlds, off and on — PASS (exit 0 both)

Same numbers off and on:

| World | Counts |
|---|---|
| popart | low 1 |
| midcentury | plate 167 |
| scrapbook | cross 118 |
| claymation | 0 |
| chiyogami | cross 34 |
| ukiyoe | low 3 |

- carrier-overflow and rule-crosses-text are 0 everywhere; fails 0, contract 0, regressions 0.
- The baseline file is unchanged in this range. It already held chiyogami cross 34 and ukiyoe low 3.

### grabAt does not alter the mp4 path — PASS

The engine's JPEG grabAt at bfcbe85 and bbdcafb gives byte-identical frames (same sha1) at five moments:

- riso snow c043 at 166.94 and 167.44 (the echo);
- riso c010;
- popart nun c005;
- midcentury nun c008.

### Stills now show the signature line — PASS

`render.mts --stills 167.44` on riso snow:

- **before:** an empty card;
- **after:** 「三年後的今天」 over 「三年後的大雪」, the same as the video frame.

### ProRes / alpha (`--layer text`) shows the signature line — FAIL

- **What changed:** before, the alpha still was blank (10 KB). After, the line is there, but its inks were chosen against
  the transparent canvas.
- **Why:** `signature.ts` compose `clearRect` for text/words jobs, then
  `inksOn(b, groundUnder(x, …))` (`:827`) samples transparent pixels as dark and picks light inks.
- **Result after compositing:** `stills/composite.png` (ffmpeg overlay of `--layer back` + `--layer text`) shows the
  echo's 「三年後的」 in cream on the cream card. Only the pink misregistration edge is visible; the video has it in
  navy.
- **Fix:** have the signature layer pick its inks from the back layer's ground, e.g. render the stage once with lyrics
  hidden into a scratch canvas for `groundUnder`, or reuse the opaque frame's ink choice. Then check the composite with
  the reading gate.
- **Latent:** mini-moment `compose` (`mini-moment.ts:109-111`) also samples `groundUnder` and never clears its canvas.
  On the alpha path, which this range opened to it, it would keep earlier frames. Not exercised: no free job here carries
  `miniMoments`.

### GROUND_FACED is general, and the ink reads — PASS

- **Code:** `hold-room.ts:118-120`; the spec asserts `GROUND_FACED` equals `world-packs.ts:55` `handInked`.
- **Other packs:** every other hand object's face was checked.
  - plate-filled: aizome, crayon, lantern, woodcut, citypop, idol, graffiti, popart;
  - gameshow's fixed white faces equal its schemes' plate `#FFFFFF`;
  - ukiyoe cartouche is plate, or a plate–accent mix close to it;
  - the noshi and kite patterned flaps sit outside the text pad.
  - No object is left reading against the wrong colour.
- **Changed lines:** 314 chiyogami/ukiyoe cues now have `beatInk` true, which adds 135 beats (line-ink-settle 53,
  ink-run 40, roll 22, light-sweep 10, ink-swap 8, plate-spread 2).
  - The lowest contrast of body and beat ink against the drawn ground is 6.07:1; none is below 4.5.
  - My mapping from beat kind to ink is approximate.
- **Ukiyoe:** every ukiyoe change is on shikishi sets (ukiyoe/shikishi 21, corner-card 7). The songs and seeds match the
  doc exactly, so the same fix explains them.

### Fingerprints — PASS

- `default-hash` at bbdcafb: `2b2ed53c`/`b52c5367`/`e37d7c87`.
- Against r6, the changes are only chiyogami (all five songs) and ukiyoe (seed 0 snow, tenmon; seed 1 choroin, snow,
  tsuzuki; seed 2 snow, tenmon, tsuzuki).

### Tests and compile — PASS

tsc app/spec pass; `ng test` 142 files, 1730 tests pass.

### sig-scan 90 moments, 0 blank — UNCHECKED (script not run)

The gate runs above found 0 reading fails, and those runs now include `[signature]` moments.

---

# Round 6 — targeted re-verify (eb1fbdc + doc 0bf3752)

Clean worktree at 0bf3752; bbdcafb was used for the before comparisons. No branch edits. Artefacts are in
`critic-4d-r6-review/`.

## Overall: PASS, with two notes

## Per claim

### 1. Layered inks — PASS (one leftover sampler)

- **Composite check, re-run.** `layer-composite.mts scrapbook snow 167.44,4.3`:
  - echo: composite 5.13 vs opaque 4.64;
  - hold: 9.50 vs 9.54;
  - both ok.
- **The composite frame at the echo** (`composite_167.44.png`) matches the opaque frame. `--layer back` now draws no
  signature lines (`main.ts`: `lyricsOn && job.layer !== 'back'`). mini-moment clears its canvas every frame
  (`mini-moment.ts` `clearRect`).
- **Leftover:** `signature-forms.ts:756-762` (smoke `toneOver`) still reads the compose canvas `k.x`. On a layered output
  that canvas is cleared, so the smoke's tone is picked against transparent pixels. This affects decoration only, not
  type ink.
- Every other `getImageData` reads glyph masks or the engine's own look/probe canvases.
- **Note (pre-existing design, not this commit):** the echo frame reads only 4.64 at p80, and 3.26 median, even in the
  opaque video.

### 2. Container floor — PASS (its effect); the doc's "only brutalist is left" is incomplete

- `world-split.ts:112-114` returns `undefined` when `ss < floor`.
- c074 and the changed y2k/notebook lines are now laid whole:

  | Line | Before (small part) | Now (whole line) |
  |---|---|---|
  | y2k tsuzuki c016 | 75 | 160 |
  | y2k choroin c001 | 52 | 115 |
  | notebook tsuzuki c010 | 72 | 93 |

  Full-size frames show all three in place (`frames6`).
- **Fingerprints, re-run:** `a6c37add`/`e0e5ab9c`/`1fda6e1d`, with exactly the claimed rows changed against r7.
- **All 45 worlds × 5 songs × 3 seeds:** 16 split lines still have a part under 84 px (`split-under84.json`). All existed
  at bbdcafb (49 in the six worlds checked there).

  | World / set | Size |
  |---|---|
  | brutalist/headline | 83 (documented) |
  | xerox/blown-r (choroin c059) | 76 on all parts |
  | screentone/shout (nun c003) | 64 |
  | notebook/dotted | 75–78 |
  | notebook/reporter | 83 |

  Only brutalist is documented; the others come from different paths and are pre-existing.

### 3. sig-scan — PASS

Re-run: 90 moments, 0 blank.

### 4. Gate, six worlds, off and on — PASS (exit 0 both)

- midcentury plate 169 against baseline 167, within 2 %.
- scrapbook cross 114; chiyogami cross 34; ukiyoe low 3; popart low 1.
- overflow and rule-cross 0; fails 0; contract 0.
- tsc pass; `ng test` 142 files, 1731 tests pass.
