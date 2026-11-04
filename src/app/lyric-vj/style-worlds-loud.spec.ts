import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, styleGroups } from './free-styles';
import { LOUD_WORLDS } from './style-worlds-loud';
import { STYLE_WORLDS } from './style-worlds';
import { partsOf, worldHoles } from './style-world';
import { SET_SPECS } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { isLoudSurface } from './render/world-glyph-loud';
import { handObjects } from './render/world-packs';

describe('style batch 3, the loud worlds', () => {
  it('are eight, registered and offered', () => {
    expect(LOUD_WORLDS.map((w) => w.id)).toEqual(['popart', 'gameshow', 'idol-live', 'y2k', 'psychedelic', 'graffiti', 'brutalist', 'citypop']);
    for (const w of LOUD_WORLDS) expect(STYLE_WORLDS.find((x) => x.id === w.id)).toBe(w);
    const offered = styleGroups().flatMap((g) => g.cards.map((c) => c.id));
    for (const w of LOUD_WORLDS) expect(offered, w.id).toContain(w.id);
    expect(FREE_STYLES.filter((s) => LOUD_WORLDS.some((w) => w.id === s.id)).length).toBe(8);
  });
  it('have every part they name', () => {
    for (const w of LOUD_WORLDS) {
      expect(worldHoles(w), w.id).toEqual([]);
      expect(w.pieces.length, w.id).toBeGreaterThanOrEqual(3);
      for (const p of w.pieces) { expect(WORLD_PIECES[p], `${w.id} ${p}`).toBeTruthy(); expect(w.pieceWords?.[p], `${w.id} ${p}`).toBeInstanceOf(RegExp); }
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) { expect(WORLD_GROUNDS[g], `${w.id} ${g}`).toBeTruthy(); expect(g.startsWith(`${w.id}/`), g).toBe(true); }
      for (const t of w.transitions.own) expect(WORLD_INS[t], `${w.id} ${t}`).toBeTruthy();
      for (const l of w.layouts.lines) {
        const spec = SET_SPECS[l.set];
        expect(spec, l.set).toBeTruthy();
        if (spec.object) expect(handObjects[spec.object as keyof typeof handObjects], `${l.set} ${spec.object}`).toBeTruthy();
        for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
        for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
        expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
      }
      expect(isLoudSurface(w.material.surface ?? ''), w.id).toBe(true);
      expect(new Set(w.palette.map((s) => s.band)).size, w.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('keep every part to one world, batch 3 against everything before it', () => {
    const owner = new Map<string, string>();
    for (const w of STYLE_WORLDS.filter((x) => x.family !== 'print' || LOUD_WORLDS.includes(x))) for (const p of partsOf(w)) { expect(owner.get(p), `${p} in ${owner.get(p)} and ${w.id}`).toBeUndefined(); owner.set(p, w.id); }
  });
  it('never let a stroke touch its neighbour: leading at least 1, tracking never under -0.01', () => {
    for (const w of LOUD_WORLDS) for (const l of w.layouts.lines) { const s = SET_SPECS[l.set]; expect(s.lead, l.set).toBeGreaterThanOrEqual(1); expect(s.track, l.set).toBeGreaterThanOrEqual(-0.01); }
  });
  it('read in every scheme, on the ground and on the plate', () => {
    for (const w of LOUD_WORLDS) for (const s of w.palette) {
      expect(contrast(s.ink, s.ground), `${w.id} ${s.id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.plateInk, s.plate) >= 4.5 || contrast(s.ink, s.plate) >= 4.5, `${w.id} ${s.id} plate`).toBe(true);
    }
    // the words on a sprayed patch keep the scheme's ink: the patch must read against it
    for (const s of LOUD_WORLDS.find((w) => w.id === 'graffiti')!.palette) expect(contrast(s.ink, s.plate), s.id).toBeGreaterThanOrEqual(4.5);
  });
  it('keep the near neighbours apart: gameshow is flat and light, idol-live is dark light; popart is plates, y2k is gloss', () => {
    const by = (id: string) => LOUD_WORLDS.find((w) => w.id === id)!;
    expect(by('gameshow').family).not.toBe(by('idol-live').family);
    expect(by('gameshow').groundBand.band).not.toBe(by('idol-live').groundBand.band);
    expect(by('gameshow').material.surface).not.toBe(by('idol-live').material.surface);
    expect(by('popart').material.surface).not.toBe(by('y2k').material.surface);
    expect(by('popart').family).not.toBe(by('y2k').family);
    expect(by('popart').type.tc.family).not.toBe(by('y2k').type.tc.family);
  });
});
