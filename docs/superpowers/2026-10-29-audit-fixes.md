# Audit fixes (2026-10-29)

Sources (read the item there for scenario and suggested fix):
- C = docs/superpowers/2026-10-28-audit-codex.md (numbered 1–15)
- FB = docs/superpowers/2026-10-28-audit-fable-backend.md (section A verdicts, section B new findings)
- FF = docs/superpowers/2026-10-28-audit-fable-frontend.md (section A verdicts, section B new findings)

Where Fable's verdict narrows a Codex finding, Fable's verdict wins.

## Rulings (controller)
- C12 「聯絡管理者」: no new messaging channel. A failed job already appears in the admin 需要協助 list, so replace the claim with the truth: the button is removed and the failure card says 「這次失敗已記錄，管理者會在後台看到」. Cost if wrong: one copy line.
- C11 lost report draft: keep the draft in sessionStorage per job id (restored on return, cleared on successful submit). Opening a new tab hides the flow back.
- C10 several pending concepts: render one concept card per pending concept (newest first), each with its own tier header.
- C2 fuse: a job whose fuse tripped ends failed and charges 0, even if the process exited 0.
- C8 hybrid style: pass the accepted concept's style/feeling/refs to keyframes and cutout the same way make.sh passes them to earlier steps; no paid run to verify — the implementer proves it with argument-capturing stub tests.
- MAX_CONCEPTS off-by-one (FB minor, 推論): leave as is (3 attempts including the first, as the UI says 「最多 3 次」).

## Batch 1 — server safety and money (scripts/lyric-vj/beta, render/typeplan where named)
C1 (Range → 416, never write headers twice), FB-B3 (stream error handler), C2, C4 (render to a temp file + atomic rename; resume checks a success marker), C3 + FB-B1 (a picture fix counts only layers that were really drawn — judge from the built img layer, not typeplan cuts), C9 server side (retry chain to its root), FB-B2 (`--title=` form for dash-leading titles; same for every user string passed as an option value), C6 (re-read and re-check after the body is read), FB minors: saveBody abort/fd leak, re-upload after a failed prep uses the new file, horizon --apply atomic write, admin limit validation (finite, ≥ 0, non-empty), orphan pid loss if noted as cheap.

## Batch 2 — director inputs (scripts/lyric-vj/*.mts, beta/*.sh)
C5 (redo = new direction: previous concept only as "avoid repeating", never the adjust keep-rules), C7 (the allowed style set comes from the run-time style list with tiers, not the hard-coded PROVEN_LANGUAGES), C8.

## Batch 3 — front end (src/app/pages/beta, timing)
C9 client side, C10, C11, C12, C13, C14 (admin.ts uses platformSpentUsd), C15, FF-B1 (failed audio upload: size/type pre-check, a retry upload entry on the song page), FF-B2 (phone timing editor can save a draft; beforeunload when dirty), FF-B3, FF minors B4–B10.

## Housekeeping
Remove the tracked .superpowers/sdd/2026-10-28-beta-v2-p3-concept-gate/task-2-report.md from git (keep the file locally).
