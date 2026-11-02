# VJFlow beta — full audit of today's work (2026-10-28)

Read-only audit. Do not edit, commit, build into dist/, run pipelines, call paid APIs, or touch the live server on 127.0.0.1:4320. Do not read or copy testers' data under out/beta (db.json shape may be read from the code, not the file).

Repo: /Users/seitumbp2025/vjflow.worktrees/lyric-editing (branch feat/lyric-editing).
Range: f90c189~1..HEAD (72 commits, ~16k lines). It is deployed to invited testers who pay per job.

What it is: a paid lyric-VJ video platform. A person uploads a song + lyrics (prep $0.5), fixes lyric timing, then makes a version: a concept first ($2.5: the director proposes style, palette, 3 stills), then accept (rest: none 1.5 / img 3.5 / hybrid 13.5), adjust or redo (each 2.5, max 3 attempts), later fix a finished video ($1: remove pictures in a range on img tier, or re-apply timing) or report only (free) or redo. Failed jobs charge 0; one free auto-retry on system failure; fuse at 2× price; platform cost (admin-only) = max(cost, price) for active jobs. Interludes carry no pictures unless the director gives a reason.

Authority, in order: docs/superpowers/specs/2026-10-28-beta-platform-v2-design.md; plans in docs/superpowers/plans/2026-10-28-beta-v2-*.md; design handoff /Users/seitumbp2025/Downloads/design_handoff_vjflow_redesign/README.md.

Already known and accepted (do not report again unless it causes a real defect): adjust/redo require balance ≥ tier total; still labels 「示意 n · m:ss」; speeds 0.5/1/1.5; admin per-style counts are per concept decision; global admin `acting` guard; phone hides the song-page timing warning; timing save unwarned if /beta/jobs read fails.

Look for real defects a paying tester or the admin would hit:
- money: wrong amount charged/refunded/shown, double charge, charge on failure, limit bypass, race between requests
- security: auth/ownership checks on every route, path traversal (refs upload/delete, stills, video, logs), upload size/type, admin data leaking, injection into shell scripts (song names, notes, concept text passed to bash/prompt)
- job lifecycle: restart/orphan recovery, retry, fuse, cancel, concurrent jobs per song, state left inconsistent after a crash
- pipeline scripts (make.sh / prep.sh / concept.sh / fix.sh / *.mts): wrong arguments, unsafe quoting, missing error propagation (`set -e`, pipes), files written in the wrong run folder
- front end: state shown vs server state, actions the server will refuse without saying why, lost input, phone 390 px layout
- tests that assert nothing or test the mock instead of the code

Verify every finding in the code before reporting (file:line, the concrete scenario, why it breaks). Run tests only if useful: `npx ng test --watch=false`, `npx tsx --test scripts/lyric-vj/*.test.mts scripts/lyric-vj/beta/*.test.mts`.

Report: write findings to the report path you were given, as Critical / Important / Minor, each with file:line, scenario, suggested fix, and confidence (confirmed / likely). End with "Checked and fine:" listing areas you verified clean.
