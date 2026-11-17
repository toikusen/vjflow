import { describe, expect, it } from 'vitest';
import { ENTER_FAMILY_CAP, groundLink, isLinked, leastUsedFamily, LINK_CLEAR, LINK_PREPARE, linkGrounds, moveState, pickWorldMoves, sectionClock } from './world-handoff';
import { familyOf } from './world-motion';
import { LINK_MARGIN, LinkFamilyKind, linkLayout, LinkRect } from './motion-transition';
import { linksOf, WORLD_LINKS } from '../world-shared';

const cue = (start: number, end: number) => ({ start, end });
const world = (id: string, ownMoves = false) => ({ id, ownMoves, enters: ['own-in'], exits: ['own-out'] });
const own = { enter: 'own-in', exit: 'own-out' };
const [W, H] = [1920, 1080];
const box = (x0: number, y0: number, x1: number, y1: number): LinkRect => ({ x0, y0, x1, y1 });
const KINDS: LinkFamilyKind[] = ['relay-x', 'relay-y', 'seat', 'open-top', 'open-left'];
const crosses = (e: { axis: 'x' | 'y'; at: number }, r: LinkRect) => (e.axis === 'x' ? e.at > r.x0 - LINK_MARGIN + 0.5 && e.at < r.x1 + LINK_MARGIN - 0.5 : e.at > r.y0 - LINK_MARGIN + 0.5 && e.at < r.y1 + LINK_MARGIN - 0.5);

describe('linked page moves between lines sung back to back', () => {
  const from = box(300, 400, 1100, 600);
  const to = box(800, 300, 1600, 520);
  const c = { at: 0.4, from, to };
  it("never bring a page edge over the last line's words while they are read, nor over the next line's once they are", () => {
    for (const kind of KINDS) for (const mode of ['both', 'in', 'out'] as const) for (let k = 0; k <= 1.0001; k += 0.02) {
      const { edges } = linkLayout(kind, mode, k, c, W, H);
      for (const e of edges) expect(crosses(e, k < c.at ? from : to), `${kind} ${mode} ${k.toFixed(2)}`).toBe(false);
    }
  });
  it('switch the page under the words together with the words: the last page whole and still before, the next after', () => {
    for (const kind of KINDS) for (const mode of ['both', 'in', 'out'] as const) {
      expect(linkLayout(kind, mode, c.at - 0.01, c, W, H).draws[0], `${kind} ${mode}`).toEqual({ pic: 'a', x: 0, y: 0, sx: 1, sy: 1 });
      expect(linkLayout(kind, mode, c.at, c, W, H).draws[0], `${kind} ${mode}`).toEqual({ pic: 'b', x: 0, y: 0, sx: 1, sy: 1 });
    }
  });
  it('move whole pages only: every draw is a full page placed by its own edge, none faded', () => {
    for (const kind of KINDS) for (let k = 0; k <= 1; k += 0.05) for (const d of linkLayout(kind, 'both', k, c, W, H).draws) {
      expect(Object.keys(d).sort()).toEqual(['pic', 'sx', 'sy', 'x', 'y']);
      expect(d.sx).toBeGreaterThan(0);
      expect(d.sy).toBeGreaterThan(0);
    }
  });
  it('keep a plain cut where words leave no room for a page edge', () => {
    const wide = { at: 0.4, from: box(0, 0, W, H), to: box(0, 0, W, H) };
    // a sliver under a twentieth of the frame is no page move either
    const nearly = { at: 0.4, from: box(0, 0, W - 0.05 * W, H - 0.05 * H), to: box(0.05 * W, 0.05 * H, W, H) };
    for (const kind of KINDS) for (let k = 0; k <= 1; k += 0.1) expect(linkLayout(kind, 'both', k, nearly, W, H).edges, kind).toEqual([]);
    for (const kind of KINDS) for (let k = 0; k <= 1; k += 0.1) expect(linkLayout(kind, 'both', k, wide, W, H).edges).toEqual([]);
  });
  it("lay the move on the next line's section, starting before its words show, and never where the lines share a shot", () => {
    const lines = [
      { id: 'a', show: 7.8, start: 8, shot: 'a', world: { enter: 'own-in', exit: 'edge-relay' } },
      { id: 'b', show: 9.8, start: 10, shot: 'b', world: { enter: 'edge-relay', exit: 'layer-seat' } },
      { id: 'c', show: 11.8, start: 12, shot: 'c', world: { enter: 'own-in', exit: 'own-out' } },
      { id: 'd', show: 13.8, start: 14, shot: 'c', world: { enter: 'edge-relay', exit: 'own-out' } },
    ];
    const sections = [{ start: 7.8 }, { start: 9.8 }, { start: 11.8 }] as { start: number; transition?: { kind: string; dir?: number; seam?: number; dur?: number } }[];
    const laid = linkGrounds(sections, lines);
    expect(sections[1].start).toBeCloseTo(9.8 - LINK_PREPARE);
    expect(sections[1].transition).toMatchObject({ kind: 'link-relay-x', dir: 0, seam: LINK_PREPARE, dur: LINK_PREPARE + LINK_CLEAR });
    expect(sections[2].transition).toMatchObject({ kind: 'link-seat', dir: -1 });
    expect(laid.map((l) => l.id)).toEqual(['b', 'c']);
    expect(groundLink(lines[2], lines[3])).toBeUndefined();
  });
  it("start a linked section's own clock at the switch: its colours, light and page arrival, the section before holding till then", () => {
    const lines = [
      { id: 'a', show: 7.8, start: 8, shot: 'a', world: { enter: 'own-in', exit: 'edge-relay' } },
      { id: 'b', show: 9.8, start: 10, shot: 'b', world: { enter: 'edge-relay', exit: 'own-out' } },
    ];
    const sections = [{ start: 7.8, layers: [{}] }, { start: 9.8, layers: [{}, { t0: 9.9 }] }] as { start: number; layers?: { t0?: number }[]; transition?: { kind: string; seam?: number } }[];
    linkGrounds(sections, lines);
    // drawing starts early (the page comes on beside the last line), everything read off the section starts at the switch
    expect(sections[1].start).toBeCloseTo(9.8 - LINK_PREPARE);
    expect(sectionClock(sections, 9.7)).toBeLessThan(sections[1].start);
    expect(sectionClock(sections, 9.81)).toBeCloseTo(9.81);
    expect(sectionClock(sections, 8.5)).toBeCloseTo(8.5);
    // the page's own arrival is timed from the switch; a layer with its own start keeps it
    expect(sections[1].layers).toEqual([{ t0: 9.8 }, { t0: 9.9 }]);
  });
  it('never fold a page open under words about to be read: a frame-open coming on alone is a plain cut', () => {
    const prev = { id: 'a', show: 0, start: 0, shot: 'a', world: { enter: 'x', exit: 'own-out' } };
    expect(groundLink(prev, { id: 'b', show: 2, start: 2, shot: 'b', world: { enter: 'frame-open.top', exit: 'x' } })).toBeUndefined();
    expect(groundLink({ ...prev, world: { enter: 'x', exit: 'frame-open.top' } }, { id: 'b', show: 2, start: 2, shot: 'b', world: { enter: 'own-in', exit: 'x' } })).toMatchObject({ kind: 'link-open-top', dir: -1 });
  });
});

describe("picking a world line's way in and out", () => {
  const tight = Array.from({ length: 14 }, (_, i) => cue(i * 2, i * 2 + 2));
  it('bring a line on by the family the last went off by', () => {
    const s = moveState();
    const kinds = tight.map((_, i) => pickWorldMoves(s, world('notebook'), own, tight, i, 4));
    const linked = kinds.flatMap((k, i) => (isLinked(k.exit) && familyOf(k.exit) !== 'frame-open' && i + 1 < kinds.length ? [i] : []));
    expect(linked.length).toBeGreaterThan(0);
    for (const i of linked) expect(kinds[i + 1].enter).toBe(kinds[i].exit);
  });
  it("keep the director's own way in and out where the world allows it there, and pick only the rest", () => {
    const lines = Array.from({ length: 6 }, (_, i) => cue(i * 3, i * 3 + 3));
    const said = { enter: 'misregister', exit: 'drum-out' };
    const riso = { id: 'riso', enters: ['drum-feed', 'misregister'], exits: ['drum-out', 'ink-slip'] };
    const s = moveState();
    const kinds = lines.map((_, i) => pickWorldMoves(s, riso, { enter: 'drum-feed', exit: 'drum-out' }, lines, i, 5, said));
    // (the line before handing its page over still wins the way in: the relay belongs to the pair; a way in said on
    // every line is kept only up to its family's share of the song, ENTER_FAMILY_CAP)
    kinds.forEach((k, i) => { if (i < 2 && !(i && isLinked(kinds[i - 1].exit))) expect(k.enter).toBe('misregister'); expect(k.exit).toBe('drum-out'); });
    expect(kinds.filter((k) => k.enter === 'misregister').length).toBeLessThanOrEqual(Math.ceil(ENTER_FAMILY_CAP * lines.length) + 1);
    // a move the world does not have is not taken: the composer picks as before
    const t = moveState();
    for (const k of lines.map((_, i) => pickWorldMoves(t, riso, { enter: 'drum-feed', exit: 'drum-out' }, lines, i, 5, { enter: 'razor', exit: 'slash-drop' }))) { expect(k.enter).not.toBe('razor'); expect(k.exit).not.toBe('slash-drop'); }
    // undirected lines spread over the pool as before
    const u = moveState();
    expect(new Set(lines.map((_, i) => pickWorldMoves(u, riso, { enter: 'drum-feed', exit: 'drum-out' }, lines, i, 5).enter)).size).toBeGreaterThan(1);
  });
  it('keep one entrance family under ENTER_FAMILY_CAP of the lines however often the director names it (v4: 22 of 28 drum-feed)', () => {
    const lines = Array.from({ length: 28 }, (_, i) => cue(i * 4, i * 4 + 3.5));
    const riso = { id: 'riso', enters: ['drum-feed', 'misregister'], exits: ['drum-out', 'ink-slip'] };
    const s = moveState();
    const kinds = lines.map((_, i) => pickWorldMoves(s, riso, { enter: 'drum-feed', exit: 'drum-out' }, lines, i, 5, { enter: 'drum-feed', exit: 'drum-out' }));
    const share = kinds.filter((k) => k.enter === 'drum-feed').length / lines.length;
    expect(share).toBeLessThanOrEqual(ENTER_FAMILY_CAP + 1 / lines.length);
    expect(new Set(kinds.map((k) => k.enter)).size).toBeGreaterThanOrEqual(3);
    // a world with one way in of its own and no shared pool keeps it: the style allows only that
    const one = { id: 'one', ownMoves: true, enters: ['drum-feed'], exits: ['drum-out'] };
    const t = moveState();
    for (const k of lines.map((_, i) => pickWorldMoves(t, one, { enter: 'drum-feed', exit: 'drum-out' }, lines, i, 5, { enter: 'drum-feed', exit: 'drum-out' }))) expect(k.enter).toBe('drum-feed');
  });
  it('offer no linked way in or out on lines too short for a page to come on beside them', () => {
    const short = Array.from({ length: 12 }, (_, i) => cue(i * 0.6, i * 0.6 + 0.6));
    const s = moveState();
    for (const k of short.map((_, i) => pickWorldMoves(s, world('riso'), own, short, i, 1))) { expect(isLinked(k.enter)).toBe(false); expect(isLinked(k.exit)).toBe(false); }
  });
  it('suppress a repeat of the last family and spread the rest, not in a fixed turn', () => {
    const run = (salt: string) => {
      const used = new Map<string, number>();
      let last = '';
      return Array.from({ length: 12 }, (_, i) => { last = leastUsedFamily(['a', 'b', 'c', 'd.x', 'd'], used, last, `${salt}:${i}`); used.set(familyOf(last), (used.get(familyOf(last)) ?? 0) + 1); return familyOf(last); });
    };
    const picks = run('s');
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(new Set(picks).size).toBe(4);
    expect(run('t').join()).not.toBe(picks.join());
  });
  it('take no linked way in after a page folded away to its hinge: frame-open is a way out only', () => {
    const s = moveState();
    const kinds = tight.map((_, i) => pickWorldMoves(s, world('notebook'), own, tight, i, 6));
    expect(kinds.some((k) => familyOf(k.enter) === 'frame-open')).toBe(false);
    kinds.forEach((k, i) => { if (i && familyOf(kinds[i - 1].exit) === 'frame-open') expect(isLinked(k.enter)).toBe(false); });
  });
  it('keep to what a world is made of: no sheets or covers on a block world, nothing linked on a wash or a receipt, own moves kept', () => {
    expect(linksOf('isometric').families).toEqual([]);
    expect(linksOf('neon-stage').families).toEqual([]);
    expect(linksOf('riso').families).toEqual(['edge-relay']);
    expect(linksOf('notebook').families).toEqual(['edge-relay', 'layer-seat', 'frame-open']);
    expect(WORLD_LINKS['document'].families).toEqual([]);
    const s = moveState();
    expect(tight.map((_, i) => pickWorldMoves(s, world('riso'), own, tight, i, 3)).some((k) => /layer-seat|frame-open/.test(k.enter + k.exit))).toBe(false);
    const wash = moveState();
    expect(tight.map((_, i) => pickWorldMoves(wash, world('ink-wash'), own, tight, i, 3)).some((k) => isLinked(k.enter) || isLinked(k.exit))).toBe(false);
    const mine = moveState();
    for (const k of tight.map((_, i) => pickWorldMoves(mine, world('watercolor', true), own, tight, i, 3))) { expect(k.enter).toBe('own-in'); expect(k.exit).toBe('own-out'); }
  });
});
