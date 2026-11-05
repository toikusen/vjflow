import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS, styleGroups } from './free-styles';
import { B4_WORLDS } from './style-worlds-b4';
import { STYLE_WORLDS } from './style-worlds';
import { partsOf, worldHoles } from './style-world';
import { clearOf, SET_SPECS } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { WORLD_PIECES } from './render/world-pieces';
import { isB4Surface } from './render/world-glyph-b4';
import { handObjects } from './render/world-packs';

const by = (id: string) => STYLE_WORLDS.find((w) => w.id === id)!;

describe('style batch 4: phone, blueprint, xerox', () => {
  it('are registered and offered once passed', () => {
    expect(B4_WORLDS.map((w) => w.id)).toEqual(['phone', 'blueprint', 'xerox']);
    for (const w of B4_WORLDS) expect(by(w.id)).toBe(w);
    const offered = styleGroups().flatMap((g) => g.cards.map((c) => c.id));
    for (const w of B4_WORLDS) expect(offered.includes(w.id), w.id).toBe(!HELD_WORLDS.has(w.id));
    // every card would land in a named group of the picker
    for (const w of B4_WORLDS) expect(styleGroups(FREE_STYLES.filter((s) => s.id === w.id)).some((g) => g.cards.length), w.id).toBe(true);
  });
  it('have every part they name', () => {
    for (const w of B4_WORLDS) {
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
      expect(isB4Surface(w.material.surface ?? ''), w.id).toBe(true);
      expect(new Set(w.palette.map((s) => s.band)).size, w.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('keep every part to one world, against every world before them', () => {
    const owner = new Map<string, string>();
    for (const w of STYLE_WORLDS.filter((x) => x.family !== 'print' || B4_WORLDS.includes(x))) for (const p of partsOf(w)) { if (!B4_WORLDS.includes(w) && owner.has(p)) continue; expect(owner.get(p), `${p} in ${owner.get(p)} and ${w.id}`).toBeUndefined(); owner.set(p, w.id); }
  });
  it('never let a stroke touch its neighbour: leading at least 1, tracking never under -0.01', () => {
    for (const w of B4_WORLDS) for (const l of w.layouts.lines) { const s = SET_SPECS[l.set]; expect(s.lead, l.set).toBeGreaterThanOrEqual(1); expect(s.track, l.set).toBeGreaterThanOrEqual(-0.01); }
  });
  it('read in every scheme, on the ground and on the plate', () => {
    for (const w of B4_WORLDS) for (const s of w.palette) {
      expect(contrast(s.ink, w.standsOnPlate ? s.plate : s.ground), `${w.id} ${s.id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.plateInk, s.plate) >= 4.5 || contrast(s.ink, s.plate) >= 4.5, `${w.id} ${s.id} plate`).toBe(true);
    }
  });
  it('keep xerox apart from brutalist and phone apart from y2k (boards 2026-11-05)', () => {
    expect(by('xerox').family).not.toBe(by('brutalist').family);
    expect(by('xerox').material.surface).not.toBe(by('brutalist').material.surface);
    expect(by('xerox').type.category).not.toBe(by('brutalist').type.category);
    expect(by('xerox').refuses).toEqual(expect.arrayContaining(['網格與版心', '頁眉', '紅色帶']));
    // the phone sets no line in a bubble or a window: no set of it carries an object
    for (const l of by('phone').layouts.lines) expect(SET_SPECS[l.set].object, l.set).toBeUndefined();
    expect(by('phone').refuses).toEqual(expect.arrayContaining(['聊天氣泡', '框住歌詞的視窗']));
  });
  it('keep calls off their large graphics, on mirrored pages too', () => {
    const inside = (bs: { x0: number; y0: number; x1: number; y1: number }[], x: number, y: number) => bs.some((b) => b.x0 <= x && x <= b.x1 && b.y0 <= y && y <= b.y1);
    // the keyboard of the compose page, the call's buttons, the part drawing (frame (900, 720): root (-60, -180))
    expect(inside(clearOf('phone/compose'), 0, -400)).toBe(true);
    expect(inside(clearOf('phone/call'), 0, -400)).toBe(true);
    expect(inside(clearOf('blueprint/part'), -60, -180)).toBe(true);
    // the mirrored columns keep their disc on the other side
    expect(inside(clearOf('xerox/columns'), -300, 0)).toBe(true);
    expect(inside(clearOf('xerox/columns-r'), 300, 0)).toBe(true);
    for (const w of B4_WORLDS) for (const l of w.layouts.lines) expect(clearOf(l.set).length, l.set).toBeGreaterThan(0);
  });
});
