# Task 2 report
- concept-summary.mts (summarize, stillTimes, writeSummary, --times/--write CLI) + 3 tests (RED: module missing; GREEN after impl; palette expectation in my fixture corrected to unique-in-order).
- concept.sh written verbatim to the brief's phases; brief.txt from inputs.concept + labelled note; --style @brief only when non-empty; --refs when refs/ non-empty; --language from inputs.style; --candidates from VJ_CANDIDATES when set; --previous from runs/<inputs.from>/base/treatment.json when it exists.
- Verified with a stubbed npx in a temp dir (no paid calls): all flags and phase order as expected.
- server.mts: concept branch of command.
- Tests: 66/66 pass in scripts/lyric-vj/beta.
Concern: inputs.json field names assumed `concept`, `style` (language id), `note`, `from` (per controller rulings); `refs` read from <run>/refs dir, not inputs.refs.

## Fix round 1
1. Stills render into stills.tmp then swap; skipped only when stills/ exists.
2. stillTimes dedupes (next later shot for a duplicate time), fewer shots give fewer times, empty shots throws '沒有鏡頭，無法選示意畫面'; 3 new tests (RED 3 fail, GREEN).
3. Missing inputs.json exits 2; corrupt JSON aborts (rc=1, checked with stub npx).
4. `from` accepted only when it matches ^[A-Za-z0-9_-]+$, else ignored with a stderr line.
Backend suite 69/69 pass. concept.sh replaced via .new + mv + bash -n.
