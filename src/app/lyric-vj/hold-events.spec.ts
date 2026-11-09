import { describe, expect, it } from 'vitest';
import { beatOfLine, growFits, HoldLine, HoldPlan, HoldSkip, holdLineOf, HOLD_AFTER_ENTER, HOLD_BEFORE_END, HOLD_BEFORE_NEXT, HOLD_SEC, holdEndBy, LINE_INK_SEC, swapSpan } from './lineplan-core';
import { LEAD, showTime } from './render/show-time';
import { CARRIERS, carrierRoom, groundsUnder, inkChecks, PANEL_OBJECTS, settleInk, swapReads } from './render/hold-room';
import { freeJob, keepLight, lightOf } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { SET_SPECS } from './render/world-sets';
import { beatProgress, WORLD_BEATS } from './render/world-beats';
import { STYLE_WORLDS } from './style-worlds';
import { HOLD_KINDS, sharedOf } from './world-shared';
import type { SongTimeline } from './timeline';

const halfBeats = Array.from({ length: 400 }, (_, i) => i * 0.5);
const cue = (start: number, end: number, text = '我再也不在你身邊') => ({ id: 'c1', start, end, text, charStarts: [...text].map((_, k) => start + ((end - start) * 0.9 * k) / [...text].length) });
const all = { 'ink-swap': 1, 'carrier-settle': 1, 'plate-spread': 1, 'panel-open': 1, 'line-grow': 1 };
const open: HoldLine = { enterSec: 0.2 };
const event = (x: HoldPlan | HoldSkip) => { if ('skip' in x) throw new Error(`skipped: ${x.skip}`); return x; };

/** A song of back-to-back lines on a quick beat, loud: many cuts within lines, some near the next line. */
const busySong = (n = 30, len = 2.2) => {
  const texts = ['快使用雙截棍 哼哼哈兮', '習武之人切記 仁者無敵', '是誰在練太極 風生水起', '如果我有輕功 飛簷走壁'];
  const cues = Array.from({ length: n }, (_, i) => { const start = 2 + i * (len + 0.05); const text = texts[i % 4]; return { id: `c${i + 1}`, start, end: start + len, text, charStarts: [...text].map((_, k) => start + (len * 0.9 * k) / [...text].length) }; });
  const end = 2 + n * (len + 0.05) + 2;
  return { title: 'busy', duration: end, tempo: 150, beats: Array.from({ length: Math.ceil(end / 0.2) }, (_, i) => i * 0.2), downbeats: [], sections: [{ start: 0, end, type: 'chorus', energy: 0.95 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
};

describe('hold events (Q2, 2026-11-09)', () => {
  it('skips a line under 0.6 s and says why', () => {
    expect(beatOfLine(cue(10, 10.5), ['ink-run'], halfBeats, [], '', 0, open, all)).toEqual({ skip: 'under 0.6 s' });
  });
  it('gives a short line a quick change that stays, inside its safe window', () => {
    for (const len of [0.9, 1.2, 1.45]) {
      const c = cue(10, 10 + len);
      const b = event(beatOfLine(c, ['ink-run'], Array.from({ length: 400 }, (_, i) => i * 0.1), [], '', 3, open, all));
      expect(b.stays).toBe(true);
      expect(b.sec).toBeGreaterThanOrEqual(HOLD_SEC.short[0]);
      expect(b.sec).toBeLessThanOrEqual(HOLD_SEC.short[1]);
      expect(b.at).toBeGreaterThanOrEqual(c.start + open.enterSec + HOLD_AFTER_ENTER - 1e-9);
      expect(b.at + b.sec).toBeLessThanOrEqual(c.end - HOLD_BEFORE_END + 1e-9);
    }
  });
  it('gives a medium line a 0.22–0.4 s change; a line with no room after its entrance gets none, with the reason', () => {
    const b = event(beatOfLine(cue(10, 12.2), ['ink-run'], halfBeats, [], '', 0, open, all));
    expect(b.sec).toBeGreaterThanOrEqual(HOLD_SEC.medium[0]);
    expect(b.sec).toBeLessThanOrEqual(HOLD_SEC.medium[1]);
    expect(beatOfLine(cue(10, 10.7), ['ink-run'], halfBeats, [], '', 0, { enterSec: 0.5 }, all)).toMatchObject({ skip: 'no room after the entrance' });
  });
  it('lands on a beat, else on a sung word break, else not at all', () => {
    const c = cue(10, 11.4);
    const onBeat = event(beatOfLine(c, [], [10.65], [], '', 0, open, all));
    expect(onBeat.at).toBe(10.65);
    const onBreak = event(beatOfLine(c, [], [], [], '', 0, open, all));
    expect(c.charStarts).toContain(onBreak.at);
    expect(beatOfLine({ ...c, charStarts: undefined }, [], [], [], '', 0, open, all)).toMatchObject({ skip: 'no beat or word break in the window' });
  });
  it('keeps one action a moment: clear of a change of set and of a world camera, and a block never grows before one', () => {
    const c = cue(10, 12.8);
    for (let roll = 0; roll < 7; roll++) {
      const b = event(beatOfLine(c, [], halfBeats, [{ at: 11.5 }], '', roll, { enterSec: 0.2, camEnd: 10.9 }, all));
      expect(Math.abs(b.at - 11.5)).toBeGreaterThanOrEqual(0.35);
      expect(b.at).toBeGreaterThanOrEqual(10.9);
      if (b.kind === 'line-grow') expect(b.at).toBeGreaterThan(11.5);
      // the shot's own cut is kept clear of too
      const c2 = event(beatOfLine(c, [], halfBeats, [], '', roll, { enterSec: 0.2, cutsAt: [11.5] }, all));
      expect(c2.at > 11.5 + 0.15 - 1e-9 || c2.at + c2.sec < 11.5 - 0.075 + 1e-9).toBe(true);
      expect(c2.kind).not.toBe('line-grow');
    }
    // a blown-up line never grows (its key word already fills the frame)
    for (let roll = 0; roll < 7; roll++) expect(event(beatOfLine(c, [], halfBeats, [], '', roll, { enterSec: 0.2, blown: true }, { 'line-grow': 1, 'ink-swap': 1 })).kind).toBe('ink-swap');
    // nowhere left but next to the change of set: no event, and the reason
    expect(beatOfLine(cue(10, 11.2), [], [10.5], [{ at: 10.6 }], '', 0, open, all)).toMatchObject({ skip: 'every beat in the window is near a cut or a change of set' });
  });
  it('never repeats the kind of the line before when another fits, and never draws a kind its world weighs 0', () => {
    const c = cue(10, 12.4);
    for (let roll = 0; roll < 7; roll++) {
      expect(event(beatOfLine(c, [], halfBeats, [], 'ink-swap', roll, open, { 'ink-swap': 1, 'line-grow': 1 })).kind).toBe('line-grow');
      expect(event(beatOfLine(c, [], halfBeats, [], '', roll, open, { 'ink-swap': 1, 'line-grow': 0 })).kind).toBe('ink-swap');
    }
    const receipt = sharedOf(STYLE_WORLDS.find((w) => w.id === 'document')!);
    expect(receipt.holds['line-grow']).toBe(0);
  });
  it('moves only what the set already draws: no carrier event without a carrier, nor on a page-fixed set; no growth past a drawn carrier', () => {
    const c = cue(10, 12.4);
    const kinds = (line: HoldLine) => new Set(Array.from({ length: 14 }, (_, roll) => beatOfLine(c, [], halfBeats, [], '', roll, line, all)).map((x) => ('kind' in x ? x.kind : x.skip)));
    expect([...kinds(open)].some((k) => k === 'carrier-settle' || k === 'panel-open' || k === 'plate-spread')).toBe(false);
    const fixedPane = kinds({ enterSec: 0.2, settle: true, open: true, fixed: true, standsOn: true });
    expect(fixedPane.has('carrier-settle') || fixedPane.has('panel-open') || fixedPane.has('line-grow')).toBe(false);
    const pane = kinds({ enterSec: 0.2, settle: true, open: true, standsOn: true });
    expect(pane.has('line-grow')).toBe(false);
    expect(pane.has('carrier-settle') || pane.has('panel-open')).toBe(true);
    // a fixed page whose card is drawn to the words and never handed their cells: the words stand on it, so they never grow
    const card = Object.entries(SET_SPECS).find(([, s]) => s.fixed && s.on && !s.shear && !s.object)!;
    expect(holdLineOf(card[1], 0.3).standsOn).toBe(true);
    // a page handed the words' cells draws its balloon round them as they are
    const cells = Object.entries(SET_SPECS).find(([, s]) => s.fixed && s.on && s.shear && !s.object)!;
    expect(holdLineOf(cells[1], 0.3).standsOn).toBe(false);
  });
  it('plans a carrier event only on what the renderer moves: no event on an object that is no carrier', () => {
    const block = { cx: 0, cy: 0, w: 600, h: 160 };
    for (const o of ['cartouche', 'ink-stroke', 'fold-kite', 'noshi', 'shikishi', 'cameo']) {
      const spec = { ...SET_SPECS['terminal/window-title'], object: o as never };
      expect(carrierRoom('carrier-settle', spec, block), o).toBeUndefined();
      expect(carrierRoom('panel-open', spec, block), o).toBeUndefined();
      const line = holdLineOf(spec, 0.3, cue(10, 12.4, '我再也不在你身邊'));
      expect(line.settle || line.open, o).toBe(false);
    }
    // a real carrier with room moves; every panel is a carrier
    expect(carrierRoom('carrier-settle', SET_SPECS['terminal/window-title'], block)).toBeDefined();
    for (const o of PANEL_OBJECTS) expect(CARRIERS.has(o), o).toBe(true);
  });
  it('swaps a phrase only where both inks read at 4.5:1', () => {
    expect(swapReads('#111111', '#c0392b', '#f5f0e6')).toBe(true);
    expect(swapReads('#111111', '#e8b0a0', '#f5f0e6')).toBe(false);
    expect(swapReads('#111111', '#111111', '#f5f0e6')).toBe(false);
  });
  it('takes no pulse and back as a short or medium line\'s hold event, and spreads copies only on a long line', () => {
    for (const len of [1.2, 2.4]) for (let roll = 0; roll < 7; roll++) {
      const b = beatOfLine(cue(10, 10 + len), ['beat-punch', 'crack', 'light-sweep', 'ink-run'], halfBeats, [], '', roll, { enterSec: 0.2, stress: 'extrude', keyLast: true }, all);
      if ('kind' in b) expect(WORLD_BEATS[b.kind].stays, b.kind).toBe(true);
      if ('kind' in b) expect(b.kind).not.toBe('plate-spread');
    }
    const long = new Set(Array.from({ length: 14 }, (_, roll) => beatOfLine(cue(10, 14), [], halfBeats, [], '', roll, { enterSec: 0.2, stress: 'extrude', keyLast: true }, { 'plate-spread': 1 })).map((x) => ('kind' in x ? x.kind : x.skip)));
    expect(long.has('plate-spread')).toBe(true);
  });
  it('grows a block only where the frame and its page leave room for the least step', () => {
    // a bleed set already at the frame's width has none for a long line; a short line in the middle of the frame has
    expect(growFits('他們兒子我習慣 從小就耳濡目染', SET_SPECS['silk/edge-bleed'])).toBe(false);
    expect(growFits('三年後', SET_SPECS['terminal/banner'])).toBe(true);
    expect(holdLineOf(SET_SPECS['silk/edge-bleed'], 0.3, cue(10, 12, '他們兒子我習慣 從小就耳濡目染')).noGrow).toBe(true);
  });
  it('swaps the ink of whole words, 35–60 % of the line; a single very long word has no phrase to swap', () => {
    const text = '我再也不在你身邊';
    const sp = swapSpan(text)!;
    const share = (sp.to - sp.from) / [...text].length;
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.6);
    expect(swapSpan('Supercalifragilisticexpialidocious')).toBeUndefined();
    // the long word's line still gets an event of another kind, or a reason
    const long = { ...cue(10, 12.4, 'Supercalifragilisticexpialidocious') };
    for (let roll = 0; roll < 7; roll++) {
      const b = beatOfLine(long, [], halfBeats, [], '', roll, open, all);
      expect('kind' in b ? b.kind : 'skip').not.toBe('ink-swap');
    }
  });
  it('settles the whole line into a second ink when no other family fits: every character, plain or not, once', () => {
    const c = cue(10, 12.2);
    const b = event(beatOfLine(c, [], halfBeats, [], '', 0, { enterSec: 0.2, inkSettle: true, plain: true, standsOn: true }, all));
    expect(b.kind).toBe('line-ink-settle');
    expect(b.span).toBeUndefined();
    expect(b.sec).toBeGreaterThanOrEqual(LINE_INK_SEC.medium[0]);
    expect(b.sec).toBeLessThanOrEqual(LINE_INK_SEC.medium[1]);
    // the same ink step for every character, wherever it stands and whatever phrase it is in
    const at = (u: number, span: number) => WORLD_BEATS['line-ink-settle'].glyph!({ q: 0.5, i: 0, n: 5, u, v: 0, seed: 1, age: 2, sung: 1, span }).key;
    expect(at(0, 0)).toBe(at(1, 1));
    expect(WORLD_BEATS['line-ink-settle'].glyph!({ q: 1, i: 3, n: 5, u: 0.7, v: 0, seed: 1, age: 2, sung: 1, span: 0 })).toEqual({ key: 1 });
    // another family that fits comes first
    expect(event(beatOfLine(c, [], halfBeats, [], '', 0, { enterSec: 0.2, inkSettle: true }, all)).kind).not.toBe('line-ink-settle');
  });
  it('skips the whole-line ink when the scheme has no second ink that reads on the ground, and says the palette is why', () => {
    expect(settleInk('#1a1a1a', ['#222222', '#d8d0c0'], ['#f2eee4'])).toBeUndefined();
    expect(settleInk('#1a1a1a', ['#222222', '#a8321e'], ['#f2eee4'])).toBe('#a8321e');
    // a second ink that reads on the palette's ground but not on what is really under the words is no ink
    expect(settleInk('#1a1a1a', ['#a8321e'], ['#f2eee4', '#7a2a20'])).toBeUndefined();
    const b = beatOfLine(cue(10, 12.2), [], halfBeats, [], '', 0, { enterSec: 0.2, inkSettle: false, plain: true, standsOn: true }, all);
    expect('skip' in b && b.why).toEqual(['span', 'palette', 'carrier', 'grow']);
    expect('skip' in b && b.safe).toBe(true);
  });
  it('times a one-second line: entrance done by 0.3 s, the change on the safe beat, settled by 0.6 s and kept', () => {
    const c = cue(20, 21);
    const b = event(beatOfLine(c, [], [20.45, 20.9], [], '', 0, { enterSec: 0.2, inkSettle: true, plain: true, standsOn: true }, all));
    expect(b.kind).toBe('line-ink-settle');
    expect(b.at).toBe(20.45);
    expect(b.at + b.sec).toBeLessThanOrEqual(20.63 + 1e-9);
    expect(beatProgress(b.at, b.sec, 20.95, false, b.stays)).toBe(1);
  });
  it('holds no crack or misregistered plate as a hold event, on a line of any length', () => {
    for (const len of [1.2, 2.4, 4]) for (let roll = 0; roll < 7; roll++) {
      const b = beatOfLine(cue(10, 10 + len), ['crack', 'plate-slip'], halfBeats, [], '', roll, open, {});
      expect('kind' in b ? b.kind : b.skip).not.toMatch(/^(crack|plate-slip)$/);
    }
  });
  it('ends every event 0.1 s before the next line shows (the renderer\'s own show time) or its handoff starts; the last line only by its own end', () => {
    // this line's voice ends at 11.0 s: the next one (sung at 12.05) shows 0.3 s after it at the earliest, its lead before at the latest
    const c = { ...cue(10, 12), charTimed: true, charStarts: [10, 10.4, 10.8, 11.0] };
    const next = { id: 'c2', start: 12.05, end: 14, text: '下一句' };
    const shows = showTime(next, 'cut', LEAD, 11.0);
    expect(holdEndBy(c, next)).toBeCloseTo(shows - HOLD_BEFORE_NEXT, 6);
    // the next line's show binds before the line's own end does
    expect(holdEndBy(c, next)!).toBeLessThan(c.end - HOLD_BEFORE_END);
    expect(holdEndBy(c, next, 11.6)).toBeCloseTo(11.5, 6);
    expect(holdEndBy(c)).toBeUndefined();
    const beats = Array.from({ length: 400 }, (_, i) => i * 0.05);
    const by = holdEndBy(c, next)!;
    let latest = 0;
    for (let roll = 0; roll < 7; roll++) {
      const b = beatOfLine(c, [], beats, [], '', roll, { enterSec: 0.2, inkSettle: true, endBy: by }, all);
      if ('kind' in b) { expect(b.at + b.sec).toBeLessThanOrEqual(by + 1e-9); latest = Math.max(latest, b.at + b.sec); }
      // without the next line the same event may run on to the line's own bound
      const free = beatOfLine(c, [], beats, [], '', roll, { enterSec: 0.2, inkSettle: true }, all);
      if ('kind' in free) expect(free.at + free.sec).toBeLessThanOrEqual(c.end - HOLD_BEFORE_END + 1e-9);
    }
    expect(latest).toBeGreaterThan(0);
    // nothing fits before the handoff: no event, and the line is not delayed for one
    expect(beatOfLine(c, [], [10.5], [], '', 0, { enterSec: 0.2, inkSettle: true, endBy: 10.45 }, all)).toMatchObject({ skip: 'no room after the entrance' });
  });
  it('keeps a new ink only where it was read: never before a cut or a change of set, nor in a set after the first', () => {
    const c = cue(10, 12.8);
    for (let roll = 0; roll < 7; roll++) for (const line of [{ enterSec: 0.2, inkSettle: true, plain: true, standsOn: true }, { enterSec: 0.2, standsOn: true }] as HoldLine[]) {
      const cut = beatOfLine(c, [], halfBeats, [], '', roll, { ...line, cutsAt: [12.3] }, all);
      if ('kind' in cut && (cut.kind === 'ink-swap' || cut.kind === 'line-ink-settle')) expect(cut.at).toBeGreaterThan(12.3);
      const set = beatOfLine(c, [], halfBeats, [{ at: 11.0 }], '', roll, line, all);
      expect('kind' in set && (set.kind === 'ink-swap' || set.kind === 'line-ink-settle')).toBe(false);
      const pulse = beatOfLine(cue(10, 14), ['ink-run', 'light-sweep'], halfBeats, [{ at: 11.6 }], '', roll, { enterSec: 0.2 }, {});
      if ('kind' in pulse) expect(pulse.at + pulse.sec).toBeLessThanOrEqual(11.6 + 1e-9);
    }
  });
  it('runs a key over the words only where the key reads at 4.5:1 on every ground under them, plan and renderer alike', () => {
    const slots = { ground: '#f2e6cf', ink: '#1b3439', ink2: '#3b6b76', accent: '#c4472f', plate: '#c4472f', plateInk: '#f2e6cf', faint: '#e8dcc4' };
    const spec = SET_SPECS['silk/top-slab'];
    // the page may lay its red plate under the words: a red key does not read there
    const x = inkChecks(spec, slots as never, slots.ink);
    expect(groundsUnder(spec, slots as never)).toContain(slots.plate);
    expect(x.keyOk).toBe(false);
    for (let roll = 0; roll < 7; roll++) {
      const b = beatOfLine(cue(10, 14), ['ink-run', 'light-sweep'], halfBeats, [], '', roll, { enterSec: 0.2, keyOk: false }, {});
      expect('kind' in b ? b.kind : 'none').not.toMatch(/ink-run|light-sweep/);
    }
    // what the renderer sees under the words is checked too
    expect(inkChecks(spec, { ...slots, plate: '#f2e6cf' } as never, slots.ink, { under: ['#c4472f'] }).keyOk).toBe(false);
  });
  it('holds a settled event to the end of the line, and runs a pulse only in its time', () => {
    expect(beatProgress(1, 0.3, 5, false, true)).toBe(1);
    expect(beatProgress(1, 0.3, 5, false)).toBeUndefined();
    expect(beatProgress(1, 0.3, 0.9, false, true)).toBeUndefined();
    for (const k of HOLD_KINDS) expect(WORLD_BEATS[k].stays, k).toBe(true);
    // most of a settling change lands in its first frames (a frame-to-frame change the eye and the meter catch)
    expect(WORLD_BEATS['line-grow'].block!(1 / 9).sx! - 1).toBeGreaterThan(0.4 * 0.12);
  });
  it('plans events with no meaning data, recording a reason on every world line without one', () => {
    let planned = 0;
    for (const id of ['silk', 'terminal', 'screentone', 'blueprint']) {
      const { treatment } = freeJob(busySong(16), { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0 });
      const lines = treatment.cues.map((c) => (c as { world?: { beat?: unknown; beatSkip?: string } }).world).filter((w) => !!w);
      expect(lines.length, id).toBeGreaterThan(0);
      for (const w of lines) expect(!!w!.beat || !!w!.beatSkip, id).toBe(true);
      planned += lines.filter((w) => w!.beat).length;
    }
    expect(planned).toBeGreaterThan(0);
  });
  it('keeps two changes of the frame\'s light 0.55 s apart across lines, and never drops a cut for it', () => {
    for (const id of ['silk', 'terminal', 'spy', 'riso']) {
      const { treatment } = freeJob(busySong(), { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0 });
      const secs = treatment.graphics!.sections as { start: number; layers: { paper: string; ink: string; dark?: boolean }[] }[];
      const changes = secs.filter((s, i) => i > 0 && lightOf(s.layers[0]) !== lightOf(secs[i - 1].layers[0])).map((s) => s.start);
      for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1], `${id} ${changes[i - 1]}→${changes[i]}`).toBeGreaterThanOrEqual(0.55 - 1e-6);
    }
  });
  it('lets the cut before a new line keep its light rather than go', () => {
    const a = { kind: 'kinetic', fx: 'wall', paper: '#111111', ink: '#eeeeee', accent: '#ff0000', words: [] } as never;
    const b = { kind: 'kinetic', fx: 'motes', paper: '#111111', ink: '#eeeeee', accent: '#ff0000', dark: true, words: [] } as never;
    keepLight(b, a);
    expect(lightOf(b)).toBe(lightOf(a));
    expect((b as { fx: string }).fx).toBe('motes');
  });
});
