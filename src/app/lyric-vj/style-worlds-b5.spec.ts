import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS, styleGroups } from './free-styles';
import { B5_WORLDS } from './style-worlds-b5';
import { STYLE_WORLDS } from './style-worlds';
import { worldHoles } from './style-world';
import { blockOf, clearOf, SET_SPECS, shearedSize } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { handOf, HAND, isB5Surface, THREAD_SURFACES } from './render/world-glyph-b5';
import { linesOf } from './render/world-b5-shared';
import { WORLD_SHARED } from './world-shared';

const measure = (s: string) => [...s].length * 100;
const [embroidery, screentone, deco, notebook] = B5_WORLDS;

describe('style batch 5: embroidery, screentone, art-deco, notebook', () => {
  it('are registered, held from the picker until the owner passes them', () => {
    expect(B5_WORLDS.map((w) => w.id)).toEqual(['embroidery', 'screentone', 'art-deco', 'notebook']);
    const offered = styleGroups().flatMap((g) => g.cards.map((c) => c.id));
    for (const w of B5_WORLDS) {
      expect(STYLE_WORLDS.find((x) => x.id === w.id)).toBe(w);
      expect(FREE_STYLES.some((s) => s.id === w.id)).toBe(true);
      expect(HELD_WORLDS.has(w.id), w.id).toBe(true);
      expect(offered).not.toContain(w.id);
      expect(WORLD_SHARED[w.id], w.id).toBeTruthy();
    }
  });
  it('have every part they name', () => {
    for (const w of B5_WORLDS) {
      expect(worldHoles(w), w.id).toEqual([]);
      for (const p of w.pieces) { expect(WORLD_PIECES[p], p).toBeTruthy(); expect(w.pieceWords?.[p], p).toBeInstanceOf(RegExp); }
      for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm]) { expect(WORLD_GROUNDS[g], g).toBeTruthy(); expect(g.startsWith(`${w.id}/`), g).toBe(true); }
      for (const t of w.transitions.own) expect(WORLD_INS[t], t).toBeTruthy();
      for (const l of w.layouts.lines) {
        expect(SET_SPECS[l.set], l.set).toBeTruthy();
        for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
        for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
        expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
        // strokes never merge, and the page is handed the line's cells
        expect(SET_SPECS[l.set].lead, l.set).toBeGreaterThanOrEqual(1);
        expect(SET_SPECS[l.set].track, l.set).toBeGreaterThanOrEqual(-0.01);
        expect(SET_SPECS[l.set].shear, l.set).toBeTruthy();
        expect(SET_SPECS[l.set].keepRows, l.set).toBe(true);
      }
      expect(isB5Surface(w.material.surface ?? ''), w.id).toBe(true);
      // every level has a line a Latin or long lyric can take (a column takes Han and kana only)
      for (const lv of [0, 1, 2] as const) expect(w.layouts.lines.some((l) => l.levels.includes(lv) && !l.column), `${w.id} ${lv}`).toBe(true);
    }
  });
  it('read in every scheme, on what each set stands on', () => {
    for (const w of B5_WORLDS)
      for (const s of w.palette)
        for (const l of w.layouts.lines) {
          const spec = SET_SPECS[l.set];
          const ink = s[spec.ink ?? 'ink'];
          const on = (spec.on ?? [w.standsOnPlate ? 'plate' : 'ground']).map((k) => s[k]);
          for (const g of on) expect(contrast(ink, g), `${w.id} ${s.id} ${l.set}`).toBeGreaterThanOrEqual(4.5);
          if (spec.split?.ink) for (const g of on) expect(contrast(s[spec.split.ink], g), `${w.id} ${s.id} ${l.set} split`).toBeGreaterThanOrEqual(4.5);
        }
  });
  it('keep every line whole in the frame, however long', () => {
    for (const w of B5_WORLDS)
      for (const l of w.layouts.lines)
        for (const text of ['仁者無敵', '快使用雙截棍 哼哼哈兮', 'あの星あかりを 海の広さを見ていた', '什麼刀槍跟棍棒 我都耍的有模有樣']) {
          // (a column set takes two phrases, Han and kana only)
          if (l.column && (/[A-Za-z]/.test(text) || !text.includes(' '))) continue;
          const spec = SET_SPECS[l.set];
          const b = blockOf(text, spec, measure);
          const [bw, bh] = shearedSize(b.w, b.h, spec.shear);
          expect(Math.abs(b.cx) + bw / 2, `${l.set} ${text}`).toBeLessThanOrEqual(960);
          expect(Math.abs(b.cy) + bh / 2, `${l.set} ${text}`).toBeLessThanOrEqual(540);
          expect(b.size, `${l.set} ${text}`).toBeGreaterThanOrEqual(84);
        }
  });
  it('declare their large graphics so calls keep off them', () => {
    for (const id of ['embroidery/hoop', 'embroidery/sampler', 'screentone/shout', 'screentone/balloons', 'art-deco/marquee', 'art-deco/plaque', 'notebook/spiral', 'notebook/reporter']) expect(clearOf(id).length, id).toBeGreaterThan(0);
  });
  it('redraw embroidery in thread, so its face is not counted', () => {
    expect(THREAD_SURFACES).toContain(embroidery.material.surface);
    expect(THREAD_SURFACES).toContain(SET_SPECS['embroidery/sampler'].surface);
  });
  it('keep screentone apart from popart: ink and paper only, its own lettering and family', () => {
    const pop = STYLE_WORLDS.find((w) => w.id === 'popart')!;
    for (const s of screentone.palette) for (const k of ['ink', 'ink2', 'accent', 'plateInk', 'faint'] as const) expect(contrast(s[k], '#111111'), `${s.id} ${k}`).toBeLessThan(1.1);
    for (const s of screentone.palette) expect(contrast(s.ground, '#ffffff'), s.id).toBeLessThan(1.2);
    expect(screentone.family).not.toBe(pop.family);
    expect(screentone.type.category).not.toBe(pop.type.category);
    expect(screentone.transitions.family).not.toBe(pop.transitions.family);
    // its sound effect's rings sit under the letters, never over them
    expect(SET_SPECS['screentone/sfx'].under?.map((u) => u.kind)).toEqual(['sfx-outer', 'sfx-inner']);
  });
  it('keep art-deco apart from gothic-lolita, stained-glass and chiyogami: its own family, lettering and transitions', () => {
    for (const id of ['gothic-lolita', 'stained-glass', 'chiyogami']) {
      const o = STYLE_WORLDS.find((w) => w.id === id)!;
      expect(deco.type.category, id).not.toBe(o.type.category);
      expect(deco.transitions.family, id).not.toBe(o.transitions.family);
      expect(deco.peak.loud, id).not.toBe(o.peak.loud);
    }
    expect(SET_SPECS['art-deco/marquee'].shear![0]).toBeLessThan(1);
  });
  it('turn a notebook hand by a hair and keep its paper turned with it', () => {
    for (let seed = 0; seed < 200; seed++) {
      const j = handOf(seed);
      expect(Math.abs((j.r * 180) / Math.PI)).toBeLessThanOrEqual(HAND.turn + 1e-9);
      expect(Math.abs(j.s - 1)).toBeLessThanOrEqual(HAND.size + 1e-9);
    }
    expect(notebook.layouts.lines.every((l) => SET_SPECS[l.set].under?.[0]?.kind === 'nb-halo')).toBe(true);
  });
  it('groups a line\'s cells into its rows and columns as set', () => {
    const cells = [{ x: 100, y: 100, s: 80 }, { x: 180, y: 102, s: 80 }, { x: 140, y: 220, s: 80 }];
    expect(linesOf(cells, false).map((r) => r.length)).toEqual([2, 1]);
    const cols = [{ x: 900, y: 100, s: 90 }, { x: 900, y: 190, s: 90 }, { x: 700, y: 120, s: 90 }];
    expect(linesOf(cols, true).map((c) => c[0].x)).toEqual([900, 700]);
  });
});
