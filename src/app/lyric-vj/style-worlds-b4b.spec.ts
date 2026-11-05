import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS } from './free-styles';
import { B4B_WORLDS } from './style-worlds-b4b';
import { STYLE_WORLDS } from './style-worlds';
import { worldHoles } from './style-world';
import { blockOf, clearOf, SET_SPECS, shearedSize } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { isB4bSurface } from './render/world-glyph-b4b';
import { worldCam } from './render/world-cam';

const measure = (s: string) => [...s].length * 100;

describe('style batch 4: cyanotype, isometric, cel80s', () => {
  it('are registered and held until the owner passes them', () => {
    expect(B4B_WORLDS.map((w) => w.id)).toEqual(['cyanotype', 'isometric', 'cel80s']);
    for (const w of B4B_WORLDS) {
      expect(STYLE_WORLDS.find((x) => x.id === w.id)).toBe(w);
      expect(FREE_STYLES.some((s) => s.id === w.id)).toBe(true);
      expect(HELD_WORLDS.has(w.id), w.id).toBe(true);
    }
  });
  it('have every part they name', () => {
    for (const w of B4B_WORLDS) {
      expect(worldHoles(w), w.id).toEqual([]);
      for (const p of w.pieces) { expect(WORLD_PIECES[p], p).toBeTruthy(); expect(w.pieceWords?.[p], p).toBeInstanceOf(RegExp); }
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) { expect(WORLD_GROUNDS[g], g).toBeTruthy(); expect(g.startsWith(`${w.id}/`), g).toBe(true); }
      for (const t of w.transitions.own) expect(WORLD_INS[t], t).toBeTruthy();
      for (const l of w.layouts.lines) {
        expect(SET_SPECS[l.set], l.set).toBeTruthy();
        for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
        for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
        expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
        // strokes never merge
        expect(SET_SPECS[l.set].lead, l.set).toBeGreaterThanOrEqual(1);
        expect(SET_SPECS[l.set].track, l.set).toBeGreaterThanOrEqual(-0.01);
      }
      expect(isB4bSurface(w.material.surface ?? ''), w.id).toBe(true);
    }
  });
  it('read in every scheme', () => {
    for (const w of B4B_WORLDS) for (const s of w.palette) {
      expect(contrast(s.ink, w.standsOnPlate ? s.plate : s.ground), `${w.id} ${s.id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.plateInk, s.plate) >= 4.5 || contrast(s.ink, s.plate) >= 4.5, `${w.id} ${s.id} plate`).toBe(true);
    }
    // cyanotype's key words (pale blue) and cel80s's yellow phrase still read on their grounds
    for (const s of B4B_WORLDS[0].palette) expect(contrast(s.accent, s.ground), s.id).toBeGreaterThanOrEqual(4.5);
    for (const s of B4B_WORLDS[2].palette) expect(contrast(s.accent, s.ground), s.id).toBeGreaterThanOrEqual(4.5);
  });
  it('keep a sheared wall of words whole in the frame, however long the line', () => {
    for (const id of ['isometric/stairs', 'isometric/terrace', 'isometric/blocks', 'isometric/corner', 'isometric/corner-l', 'cel80s/title', 'cel80s/eyecatch']) {
      for (const text of ['仁者無敵', '快使用雙截棍 哼哼哈兮', 'あの星あかりを 海の広さを見ていた']) {
        const spec = SET_SPECS[id];
        const b = blockOf(text, spec, measure);
        const [w, h] = shearedSize(b.w, b.h, spec.shear);
        expect(Math.abs(b.cx) + w / 2, `${id} ${text}`).toBeLessThanOrEqual(960);
        expect(Math.abs(b.cy) + h / 2, `${id} ${text}`).toBeLessThanOrEqual(540);
      }
    }
  });
  it('keep isometric type big enough to read on its wall', () => {
    for (const id of ['isometric/stairs', 'isometric/terrace', 'isometric/corner', 'isometric/blocks']) expect(blockOf('快使用雙截棍', SET_SPECS[id], measure).size, id).toBeGreaterThanOrEqual(84);
  });
  it('steps a row of blocks down a character at a time', () => {
    const one = blockOf('仁者無敵', SET_SPECS['isometric/blocks'], measure);
    expect(one.h).toBeCloseTo(one.size * (1 + 3 * 0.48), 0);
  });
  it('slides the isometric camera along the grid, never turning, its edge never shown', () => {
    const d = worldCam('iso-slide', 0, 1)!;
    expect(d.r).toBe(0);
    expect(d.dy / d.dx).toBeCloseTo(Math.tan(Math.PI / 6));
    expect(((d.s - 1) * 1920) / 2).toBeGreaterThanOrEqual(Math.abs(d.dx));
    expect(((d.s - 1) * 1080) / 2).toBeGreaterThanOrEqual(Math.abs(d.dy));
  });
  it('declare their large graphics so calls keep off them', () => {
    for (const id of ['cyanotype/fern', 'cyanotype/doily', 'cyanotype/strips', 'isometric/stairs', 'cel80s/title', 'cel80s/ending']) expect(clearOf(id).length, id).toBeGreaterThan(0);
  });
  it('keep cel80s apart from idol-live: dark, leaning, its own lettering', () => {
    const cel = B4B_WORLDS[2];
    const idol = STYLE_WORLDS.find((w) => w.id === 'idol-live')!;
    expect(cel.groundBand.band).toBe('dark');
    expect(cel.family).not.toBe(idol.family);
    expect(SET_SPECS['cel80s/title'].shear![2]).toBeLessThan(0);
    expect(cel.type.category).not.toBe(idol.type.category);
  });
});
