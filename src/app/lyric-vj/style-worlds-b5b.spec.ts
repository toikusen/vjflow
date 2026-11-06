import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS } from './free-styles';
import { B5B_WORLDS } from './style-worlds-b5b';
import { STYLE_WORLDS } from './style-worlds';
import { worldHoles } from './style-world';
import { blockOf, clearOf, SET_SPECS } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { CLAY_DARK, isB5bSurface, stickerTilt } from './render/world-glyph-b5b';

const measure = (s: string) => [...s].length * 100;
const [scrap, wc, mc, clay] = B5B_WORLDS;

describe('style batch 5: scrapbook, watercolor, midcentury, claymation', () => {
  it('are registered and held until passed', () => {
    expect(B5B_WORLDS.map((w) => w.id)).toEqual(['scrapbook', 'watercolor', 'midcentury', 'claymation']);
    for (const w of B5B_WORLDS) {
      expect(STYLE_WORLDS.find((x) => x.id === w.id)).toBe(w);
      expect(FREE_STYLES.some((s) => s.id === w.id)).toBe(true);
      expect(HELD_WORLDS.has(w.id), w.id).toBe(true);
    }
  });
  it('have every part they name', () => {
    for (const w of B5B_WORLDS) {
      expect(worldHoles(w), w.id).toEqual([]);
      for (const p of w.pieces) { expect(WORLD_PIECES[p], p).toBeTruthy(); expect(w.pieceWords?.[p], p).toBeInstanceOf(RegExp); }
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) { expect(WORLD_GROUNDS[g], g).toBeTruthy(); expect(g.startsWith(`${w.id}/`), g).toBe(true); }
      for (const t of w.transitions.own) expect(WORLD_INS[t], t).toBeTruthy();
      for (const l of w.layouts.lines) {
        expect(SET_SPECS[l.set], l.set).toBeTruthy();
        expect(WORLD_GROUNDS[l.ground!], l.ground).toBeTruthy();
        for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
        for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
        expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
        // strokes never merge
        expect(SET_SPECS[l.set].lead, l.set).toBeGreaterThanOrEqual(1);
        expect(SET_SPECS[l.set].track, l.set).toBeGreaterThanOrEqual(-0.01);
      }
      expect(isB5bSurface(w.material.surface ?? ''), w.id).toBe(true);
    }
  });
  it('read in every scheme', () => {
    for (const w of B5B_WORLDS) for (const s of w.palette) {
      expect(contrast(s.ink, w.standsOnPlate ? s.plate : s.ground), `${w.id} ${s.id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.plateInk, s.plate) >= 4.5 || contrast(s.ink, s.plate) >= 4.5, `${w.id} ${s.id} plate`).toBe(true);
    }
    // a sticker's red key letters on its white backing; a reserved white letter on its wash; cream type on midcentury's teal
    // bar and black bar; clay's dark tail on its second strip, and every frame-filling clay on its light slab
    for (const s of scrap.palette) expect(contrast(s.accent, s.plate), s.id).toBeGreaterThanOrEqual(4.5);
    for (const s of wc.palette) { expect(contrast(s.plate, s.plateInk), s.id).toBeGreaterThanOrEqual(4.5); expect(contrast(s.plate, s.ink2), s.id).toBeGreaterThanOrEqual(4.5); expect(contrast(s.ink2, s.ground), s.id).toBeGreaterThanOrEqual(4.5); }
    for (const s of mc.palette) { expect(contrast(s.faint, s.ink2), s.id).toBeGreaterThanOrEqual(4.5); expect(contrast(s.faint, s.ink), s.id).toBeGreaterThanOrEqual(4.5); expect(contrast(s.ink, s.plate), s.id).toBeGreaterThanOrEqual(4.5); }
    for (const s of clay.palette) { expect(contrast(s.ink2, s.faint), s.id).toBeGreaterThanOrEqual(4.5); for (const k of CLAY_DARK) expect(contrast(k, s.plate), `${s.id} ${k}`).toBeGreaterThanOrEqual(4.5); }
  });
  it('keep the planes and every line whole in the frame, however long', () => {
    for (const w of B5B_WORLDS) for (const l of w.layouts.lines) {
      for (const text of ['仁者無敵', '快使用雙截棍 哼哼哈兮', 'あの星あかりを 海の広さを見ていた']) {
        const spec = SET_SPECS[l.set];
        if (l.max && [...text.replace(/\s/g, '')].length > l.max) continue;
        const b = blockOf(text, spec, measure);
        expect(Math.abs(b.cx) + b.w / 2, `${l.set} ${text}`).toBeLessThanOrEqual(960);
        expect(Math.abs(b.cy) + b.h / 2, `${l.set} ${text}`).toBeLessThanOrEqual(540);
      }
    }
  });
  it('climbs midcentury\'s planes a character at a time, the steps counted in its height', () => {
    const b = blockOf('飛簷走壁', SET_SPECS['midcentury/planes'], measure);
    expect(b.h).toBeCloseTo(b.size * (1.1 + 3 * 0.56), 0);
  });
  it('cuts a sticker\'s small lean into it, the same every time', () => {
    for (let i = 0; i < 40; i++) { const t = stickerTilt(i * 37); expect(Math.abs(t.r)).toBeLessThanOrEqual(0.061); expect(Math.abs(t.dy)).toBeLessThanOrEqual(0.04); expect(stickerTilt(i * 37)).toEqual(t); }
  });
  it('lays the sticker backing as the carrier the words are read on', () => {
    for (const id of ['scrapbook/card', 'scrapbook/dots', 'scrapbook/spread', 'scrapbook/index']) {
      const u = SET_SPECS[id].under!;
      expect(u.at(-1), id).toEqual({ kind: 'scrap-back', tone: 'plate', carrier: true });
      expect(SET_SPECS[id].on, id).toEqual(['plate']);
    }
  });
  it('declare their large graphics so calls keep off them', () => {
    for (const w of B5B_WORLDS) for (const l of w.layouts.lines) expect(clearOf(l.set).length, l.set).toBeGreaterThan(0);
  });
  it('keep midcentury apart from citypop: no waves, cut shapes, its own face and lettering', () => {
    const city = STYLE_WORLDS.find((w) => w.id === 'citypop')!;
    expect(mc.refuses).toContain('波浪');
    expect(mc.type.tc.family).not.toBe(city.type.tc.family);
    expect(mc.type.category).not.toBe(city.type.category);
    expect(mc.layouts.lines.some((l) => /wave|sea|pool/.test(l.set))).toBe(false);
  });
  it('keep scrapbook apart from xerox: colour papers and one sticker alphabet', () => {
    const xerox = STYLE_WORLDS.find((w) => w.id === 'xerox')!;
    expect(scrap.type.tc.family).not.toBe(xerox.type.tc.family);
    expect(scrap.material.surface).not.toBe(xerox.material.surface);
    expect(scrap.refuses).toContain('碳粉影印');
  });
});
