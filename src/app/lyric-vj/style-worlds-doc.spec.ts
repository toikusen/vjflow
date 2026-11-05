import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { FREE_STYLES, HELD_WORLDS, styleGroups } from './free-styles';
import { freeJob } from './free-plan';
import { DOCUMENT_WORLD } from './style-worlds-doc';
import { STYLE_WORLDS } from './style-worlds';
import { worldHoles } from './style-world';
import { SET_SPECS } from './render/world-sets';
import { WORLD_ENTERS, WORLD_EXITS, WORLD_HOLDS } from './render/world-motion';
import { WORLD_GROUNDS, WORLD_INS } from './render/world-grounds';
import { DOT_R, HEAD_DOTS, headCells, isDocSurface } from './render/world-glyph-doc';
import { closingLine, lineParts } from './song-parts';
import { SMALL_MAX } from './render/world-doc-sets';
import type { WorldItem } from './render/world-grounds';
import type { SongTimeline } from './timeline';

const w = DOCUMENT_WORLD;

describe('document, the thermal receipt (second boards 2026-11-05)', () => {
  it('is registered and held until the owner passes it', () => {
    expect(STYLE_WORLDS.find((x) => x.id === 'document')).toBe(w);
    expect(FREE_STYLES.some((s) => s.id === 'document')).toBe(true);
    expect(HELD_WORLDS.has('document')).toBe(true);
    expect(styleGroups().flatMap((g) => g.cards.map((c) => c.id))).not.toContain('document');
  });
  it('has every part it names', () => {
    expect(worldHoles(w)).toEqual([]);
    for (const g of [...w.grounds.quiet, ...Object.values(w.grounds.levels).flat(), w.peak.loud, w.peak.calm, ...w.layouts.lines.flatMap((l) => (l.ground ? [l.ground] : []))]) { expect(WORLD_GROUNDS[g], g).toBeTruthy(); expect(g.startsWith('document/'), g).toBe(true); }
    for (const t of w.transitions.own) expect(WORLD_INS[t], t).toBeTruthy();
    for (const l of w.layouts.lines) {
      expect(SET_SPECS[l.set], l.set).toBeTruthy();
      for (const m of l.enters) expect(WORLD_ENTERS[m], m).toBeTruthy();
      for (const m of l.exits) expect(WORLD_EXITS[m], m).toBeTruthy();
      expect(WORLD_HOLDS[l.hold], l.hold).toBeTruthy();
    }
    expect(isDocSurface(w.material.surface ?? '')).toBe(true);
  });
  it('prints across, never in a column, strokes never touching', () => {
    for (const l of w.layouts.lines) {
      const s = SET_SPECS[l.set];
      expect(s.vertical, l.set).toBeFalsy();
      expect(l.column, l.set).toBeFalsy();
      expect(s.lead, l.set).toBeGreaterThanOrEqual(1);
      expect(s.track, l.set).toBeGreaterThanOrEqual(0);
    }
  });
  it('prints red only on the closing line, one ink a line, never past its paper', () => {
    for (const l of w.layouts.lines) {
      const s = SET_SPECS[l.set];
      const red = s.ink === 'accent' || s.key === 'accent' || s.split?.ink === 'accent';
      expect(red, l.set).toBe(l.closing === true);
      expect(l.closing, l.set).toBeDefined();
      expect(s.plain, l.set).toBe(true);
      expect(s.wrap, l.set).toBe(true);
    }
    // a call beside a line keeps to the black: the red is the TOTAL's
    expect(w.callSlot).toBe('plateInk');
  });
  it('sets the line at least 2.5 times the largest small print round it', () => {
    for (const l of w.layouts.lines) expect(SET_SPECS[l.set].lo, l.set).toBeGreaterThanOrEqual(2.5 * SMALL_MAX);
  });
  it('reads in every scheme: black and red on the thermal paper', () => {
    for (const s of w.palette) {
      expect(contrast(s.plateInk, s.plate), s.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.accent, s.plate), s.id).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps the boards' print head: never coarser than 48 cells, dots that fuse", () => {
    expect(HEAD_DOTS).toBeGreaterThanOrEqual(48);
    expect(DOT_R * 2).toBeGreaterThan(1);
    // a stroke fully covered prints every cell; bare paper prints none
    const full = new Uint8ClampedArray(40 * 40 * 4).fill(255);
    expect(headCells(full, 40, 40, 4).on.every((x) => x === 1)).toBe(true);
    expect(headCells(new Uint8ClampedArray(40 * 40 * 4), 40, 40, 4).on.some((x) => x === 1)).toBe(false);
  });
  it('gives the closing line the TOTAL and every other line an item, on a song with no stored sections', () => {
    const song = sample();
    const style = FREE_STYLES.find((s) => s.id === 'document')!;
    const closing = closingLine(song);
    expect(closing).toBe('c12');
    for (const seed of [0, 1, 2]) {
      const { job } = freeJob(song, { style, seed });
      const lines = (job.treatment.cues as { cueId: string; world?: { set: string } }[]).filter((c) => c.world);
      expect(lines.length).toBeGreaterThan(0);
      for (const c of lines) expect(w.layouts.lines.find((l) => l.set === c.world!.set)?.closing, `${seed} ${c.cueId} ${c.world!.set}`).toBe(c.cueId === closing);
    }
  });
  it("hands each line the receipt's real data: start, length, part, its 小計, the song's id, lines, length and tempo", () => {
    const song = sample();
    const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === 'document')!, seed: 0 });
    const items = (job.treatment.graphics!.sections as { layers: { world?: { item?: WorldItem } }[] }[]).flatMap((s) => (s.layers[0].world?.item ? [s.layers[0].world.item] : []));
    expect(items.length).toBeGreaterThan(0);
    const parts = lineParts(song);
    for (const it of items) {
      const c = song.cues[it.no - 1];
      expect(it.at).toBe(c.start);
      expect(it.dur).toBeCloseTo(c.end - c.start, 6);
      expect(it.song).toEqual({ id: expect.stringMatching(/^[0-9A-F]{8}$/), lines: song.cues.length, len: 70, bpm: 100 });
      const p = parts.get(c.id)!;
      expect(it.sub!.sec).toBeCloseTo(p.to - p.from, 1);
      expect(it.first).toBe(it.no === 1 || parts.get(song.cues[it.no - 2].id)!.run !== p.run);
      expect(it.closing).toBe(c.id === 'c12');
      if (it.first && it.no > 1) expect(it.before?.part).toBeTruthy();
    }
  });
});

/** Verse, chorus, verse, chorus: the chorus comes back with its words; no stored sections. */
function sample() {
  const verse = ['走過那一條長長的街', '風吹著我們的頭髮', '你說今晚不要回家', '夜裡的城市很安靜', '我們走在雨裡面', '誰也沒有說話'];
  const chorus = ['一起唱到天亮吧', '光就在前面等我們', '不要停下來'];
  const texts = [...verse.slice(0, 3), ...chorus, ...verse.slice(3), ...chorus];
  const cues = texts.map((text, i) => ({ id: `c${i + 1}`, start: 5 + i * 5, end: 9 + i * 5, text }));
  return { title: 'x', duration: 70, tempo: 100, beats: Array.from({ length: 116 }, (_, i) => i * 0.6), downbeats: [], sections: [], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
}
