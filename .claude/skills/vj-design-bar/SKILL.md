---
name: vj-design-bar
description: Use before designing, implementing or reviewing any lyric-VJ style world, handoff, motion or finish change — "新世界", "風格", "設計稿", "critic", "判決", "驗收", "美感", "好不好看". Loads the 12 acceptance rules, pulls the relevant owner verdict cards, and runs an anonymous Codex critic on strips/clips.
---

# vj-design-bar

Contract: `docs/design-bar/README.md` (12 rules + card principles). Cards: `docs/design-bar/cards/`.

## Before generating or changing a world

1. `npx tsx scripts/lyric-vj/verdicts.mts pack --world <id>` (add `--rule N` when the task is about one rule). Paste the pack into the implementer's brief together with the image paths it lists.
2. The brief must make the implementer write one line first: 「沿用 <card id> 的關係；避開 <card id> 的失敗」.
3. Run through the 12 rules. A confirmed hard fault (carrier broken, rule 8; unreadable, rules 4/6/10) is a return, not a score; unclear evidence goes to the owner. The critic catches errors, it is not the taste judge: never reject a direction only because it is unusual; keep one reasonable-but-risky direction alive.
4. A whole-clip accept is not an accept of every aspect; anchor only on the `aspects` a card names.

## Critic (fresh context, never the author)

Inputs only: anonymous strips or clips (no world name in file names shown), 1–2 genre references, the pack, the approved contract if one exists. No author notes, no expected answer.

```
codex exec --sandbox read-only -i <strip.png> [-i ...] -o <scratch>/critic-<slug>.md "$(cat brief.md)" </dev/null
```

brief.md = pack + this block (verbatim):

```
任務：先描述可見證據，再與接受／拒絕錨點比較；不得只說「缺少質感」。
輸出：通過／退回／交業主；具體位置或時間碼；最接近的歷史卡 id；前三項修正；不確定處。
成對比較時：A／B／平手／皆不合格；交換左右再比較，若改判則標示不穩定。
```

Codex `-o` must point inside the repo or scratchpad; always `</dev/null`.

## After the owner speaks

Write a card the same day: copy `cards/_template.md` to `cards/YYYY-MM-DD-<slug>.md`, quote the owner verbatim, set `scope: global` only for cross-world baselines, link before/after with `pair`, then `npx tsx scripts/lyric-vj/verdicts.mts check`.
