# Ink legibility: what shipped, and the backlog (2026-11-16)

Branch feat/q1-world-events, from 74e19e1 to 19737fb.

Rulings followed:
- docs/research/2026-11-13-ink-halo-codex.md;
- docs/research/2026-11-13-ink-table-gate-design.md;
- the owner's verdicts v4–v6 (design cards 2026-11-14-ink-halo-4-2-pass and 2026-11-16-material-reads-on-ground-pass).

## Shipped (default on)

The **gate** reads each glyph by its role:
- An opaque face is read against what borders it within 3 px.
- A see-through face is read pixel by pixel against the frame without the words.
- A declared extrude merges into the reading glyph, under the shape gate.
- A keyline is read against the face and is never read past. Copies, ghosts and shines are interference.
- Another glyph touches only ink to ink.
- A material's parts are declared per material (render/surface-parts). A part not drawn visibly counts as ground.
- Rows record:
  - real enter/exit;
  - opacity and its multipliers;
  - both ends of the worst pair;
  - the effects;
  - what each "other" mesh is.

**Opaque reveal**:
- glyphs step at their fade's middle;
- left and tone are no longer see-through multipliers;
- a squash under half size is not drawn;
- a dimmed lyric still reads.

**Ink halo 4 + 2 px**, per engine from its job:
- grain, scanlines, dither, glitch noise and chroma ghosts stay off round the reading glyphs;
- the picture is read straight there;
- TV snow is cut at its source;
- copies are cut out of the clean zone.

**Glyph pictures** are premultiplied: no dark edge fringe.

**Ink decision (M3)**, one decision for the plan and the renderer:
- The set's world's final effects are applied with the ink and its ground together. Paper fibres act pixel by pixel; a
  tube's glow lifts its wall.
- An ink is judged as its material draws it.
- Its own ink first, then a short hue move, then the world's ink.
- A hold colour that cannot read is dropped.
- One ground list (the job's scheme).
- Decisions are made per engine and by set id.

**Material rule** (world-glyph keepReadable):
- Every face texel reads at 4.5 on every real ground after the final effects, moved the least it takes toward its own
  ink.
- A part texel that cannot read is not drawn.

**Tone table** (M4), sampled inside the carrier or under the glyphs, worst value. Shipped for embroidery,
gothic-lolita and paper-lantern only, each after its sample improved and nothing regressed.

## Not shipped

- The tone entries for dark-glitch, papercut and chiyogami: their samples got worse.
- The glow thinning round a tube's face (unverified).
- The table for the remaining worlds (owner: stop expanding).

## Checks at merge (19737fb, 2026-11-16)

- Sample gate over all 45 worlds × choroin (10 moments a line set), ec77d68 against 19737fb: **no world worse**. Total
  fails 8264 → 5443.
  - Better: embroidery 1193 → 141, papercut 1393 → 446, chiyogami 236 → 12, gothic-lolita 624 → 447,
    claymation 159 → 63, paper-lantern 1188 → 1100, silk-cold 93 → 37, neon-stage 179 → 126, ukiyoe 168 → 120,
    silk 83 → 36, midcentury 404 → 385, ink-wash 14 → 2, spy 45 → 43.
  - The rest are equal. Every world's line is in out/research/ink/halo/final3.log.
- dark-glitch × choroin, all frames: 1023 fails, 2 no-core.
- Full ng test: 160 files, 1851 tests passed.

The steps behind these checks:

- Sample gate over all 45 worlds × choroin (10 moments a line set): ec77d68 against the final commit, with no world
  worse (out/research/ink/halo/final3.log).
- dark-glitch × choroin all frames.
- Full ng test.

## Backlog (sample fails on the final commit, choroin; see final3.log for every world)

- paper-lantern: the silhouette's blurred rim fades toward the lit paper. Real; needs the rim kept crisper.
- notebook, midcentury, brutalist: not looked into yet; the largest counts after paper-lantern.
- gothic-lolita: gilt's pressed edge bridges strokes (shape gate).
- papercut, chiyogami, dark-glitch: no tone entries. The carrier sampling still reaches the page.
- neon-stage, cel80s: ink against the material's own glow; only the tube is declared.
- Hold colour changes onto mid-tone panels (popart c046, riso, graffiti c046).
- Joins in the print worlds (riso, silk, spy): cause not traced.
- spy c035/c041: a black ink on the red plate with paper reads 4.2–4.5; nothing in the world's inks reads there.
- "other" glyph meshes at 0.83 opacity in spy at 186.4 s: not identified.
- dark-glitch: 2 no-core glyphs (c074 ︕ leaving).
