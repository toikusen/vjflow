// Q1 phase 3b (docs/research/2026-11-10-q1-phase3b.md): the worlds' own material moves (chalkboard erase-reseat,
// document feed-advance / tear-next, art-deco poster-panel), the pacing without a run cap, camera moves as scheduler
// inputs, and the composer's proportional-time reposes labelled. Scheduler rules on made-up lines first, then the real
// songs as the free path draws them.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { ACTION_GAP, countCuts, LIGHT_GAP, MOOD_PACE, planWorldEvents, READ_STABLE, reseatRate, SEAM_GAP, STREAK_FLOOR, type SeatCandidate, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';
import { fromJob, shownOf, sungAt, verifyWorldEvents } from './world-events-adapter';
import { compositionsOf, WORLD_COMPOSITIONS, type MaterialMove } from './world-shared';
import { WORLD_EXITS } from './render/world-motion';
import { panelsOf } from './render/world-b5-deco';
import { frameChange, stableTimes } from './render/frame-check';

const LEFT: SeatCandidate = { id: 'w/left', box: { x0: 0.05, y0: 0.3, x1: 0.45, y1: 0.6 } };
const CENTRE: SeatCandidate = { id: 'w/centre', box: { x0: 0.3, y0: 0.35, x1: 0.7, y1: 0.65 } };
const RIGHT: SeatCandidate = { id: 'w/right', box: { x0: 0.55, y0: 0.3, x1: 0.95, y1: 0.6 } };
const MARQUEE: SeatCandidate = { id: 'w/marquee', box: { x0: 0.2, y0: 0.25, x1: 0.8, y1: 0.6 }, carrierId: 'ground:w/marquee', paged: true, page: 'w/marquee' };
const PANELS: SeatCandidate = { ...MARQUEE, id: 'w/marquee+panels', carrierId: 'ground:w/marquee:panels' };
const ERASE: MaterialMove = WORLD_COMPOSITIONS['chalkboard'].materials!['erase-reseat'];
const TEAR: MaterialMove = WORLD_COMPOSITIONS['document'].materials!['tear-next'];
const FEED: MaterialMove = WORLD_COMPOSITIONS['document'].materials!['feed-advance'];
const PANEL: MaterialMove = WORLD_COMPOSITIONS['art-deco'].materials!['poster-panel'];
const caps = (kinds: WorldCompositionCaps['kinds'], o: Partial<WorldCompositionCaps> = {}): WorldCompositionCaps => ({ worldId: 'w', kinds, seats: [], carrierRole: 'page', ...o });
const line = (id: string, start: number, end: number, seats: SeatCandidate[], o: Partial<WorldEventLine> = {}): WorldEventLine => ({ id, show: start - 0.2, start, end, seats, seat: seats[0].id, ...o });
const words = (start: number, end: number, n: number) => Array.from({ length: n }, (_, k) => ({ text: `p${k}`, from: +(start + ((end - start) * k) / n).toFixed(3), to: +(start + ((end - start) * (k + 1)) / n).toFixed(3) }));
const input = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.9 }], caps: caps(['layout-seat']), seed: 0, ...o });
const cuts = (es: WorldEvent[]) => es.filter((e) => e.kind !== 'keep');
function expectClocks(es: WorldEvent[]) {
  const c = cuts(es);
  for (const [i, a] of c.entries())
    for (const b of c.slice(i + 1)) {
      expect(Math.abs(a.at - b.at), `${a.id} / ${b.id} seams`).toBeGreaterThanOrEqual(SEAM_GAP - 1e-6);
      expect(a.from < b.from ? b.from - a.to : a.from - b.to, `${a.id} / ${b.id} actions`).toBeGreaterThanOrEqual(ACTION_GAP - 1e-6);
      if (a.changesLight && b.changesLight) expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(LIGHT_GAP - 1e-6);
    }
}

describe('phase 3b: material moves in the scheduler', () => {
  const chalk = caps(['layout-seat'], { materials: { 'erase-reseat': ERASE } });

  it('chalkboard erase-reseat: only onto a region that meets the one just sung, wiped after it is sung and read still, ending before the new line shows', () => {
    // a gap after the first line: the next one's own seat meets it, so the old words are wiped first
    const lines = [line('a', 1, 3, [LEFT]), line('b', 5, 7, [CENTRE, LEFT])];
    const plan = planWorldEvents(input(lines, { caps: chalk }));
    const e = plan.events.find((x) => x.material === 'erase-reseat')!;
    expect(e).toBeDefined();
    expect([e.kind, e.at, e.seatBefore, e.seatAfter, e.curve]).toEqual(['layout-seat', 4.8, 'w/left', 'w/centre', 'chalk-erase']);
    // its time and curve are the declaration's; never over the line being sung, over before the new one shows
    expect(+(e.to - e.from).toFixed(3)).toBe(ERASE.sec);
    expect(e.from).toBeGreaterThanOrEqual(3 + ERASE.clearOfSung - 1e-6);
    expect(e.to).toBeLessThanOrEqual(4.8 - 0.02 + 1e-6);
    expect(e.lineIds).toEqual(['a', 'b']);
    // its way out is the board's own eraser pass, the move it was declared to draw
    expect(WORLD_EXITS[ERASE.draws]?.sec).toBe(ERASE.sec);
    // counted once
    expect(countCuts(plan.events, [0, 8]).cuts).toBe(1);
  });

  it('chalkboard erase-reseat: no room after the last syllable is a plain cut, a free region is a plain cut, never a wipe while sung', () => {
    const tight = planWorldEvents(input([line('a', 1, 3, [LEFT]), line('b', 3.3, 5, [CENTRE, LEFT])], { caps: chalk }));
    expect(tight.events.some((x) => x.material)).toBe(false);
    expect(tight.events.find((x) => x.lineIds.at(-1) === 'b' && x.kind !== 'keep')?.from).toBe(3.1);
    expect(tight.rejected.some((r) => /erase-reseat: a sung until 3, no 0.42s/.test(r.reason))).toBe(true);
    const free = planWorldEvents(input([line('a', 1, 3, [LEFT]), line('b', 5, 7, [RIGHT, LEFT])], { caps: chalk }));
    expect(free.events.some((x) => x.material)).toBe(false);
    // the action keeps off its protected region (the tray): old words standing on it are not wiped over
    const LOW: SeatCandidate = { id: 'w/low', box: { x0: 0.05, y0: 0.7, x1: 0.45, y1: 0.95 } };
    const OVER: SeatCandidate = { id: 'w/over', box: { x0: 0.1, y0: 0.6, x1: 0.5, y1: 0.9 } };
    const fenced = planWorldEvents(input([line('a', 1, 3, [LOW]), line('b', 5, 7, [OVER, LOW])], { caps: chalk }));
    expect(fenced.events.some((x) => x.material)).toBe(false);
    expect(fenced.rejected.some((r) => /protected region/.test(r.reason))).toBe(true);
  });

  it('document tear-next and feed-advance: the seat stays, the page changes once the line before is sung, never on a shared shot or a short line', () => {
    const doc = caps(['page-handoff'], { materials: { 'tear-next': TEAR, 'feed-advance': FEED } });
    const FEEDSEAT: SeatCandidate = { id: 'w/feed', box: { x0: 0.26, y0: 0.6, x1: 0.74, y1: 0.83 }, carrierId: 'ground:w/feed', paged: true, page: 'w/feed' };
    const ls = [0, 1, 2, 3, 4, 5].map((k) => line(`l${k}`, k * 3, k * 3 + 2.6, [FEEDSEAT]));
    const plan = planWorldEvents(input(ls, { caps: doc, sections: [{ start: 0, energy: 0.9 }, { start: 8.9, energy: 0.95 }] }));
    const moves = plan.events.filter((e) => e.material);
    expect(moves.length).toBeGreaterThan(0);
    for (const e of moves) {
      const m = e.material === 'tear-next' ? TEAR : FEED;
      expect([e.kind, e.seatBefore, e.seatAfter, e.curve]).toEqual(['page-handoff', 'w/feed', 'w/feed', m.curve]);
      expect(+(e.to - e.from).toFixed(3)).toBe(m.sec);
      const prev = ls[ls.findIndex((l) => l.id === e.lineIds.at(-1)) - 1];
      expect(e.from).toBeGreaterThanOrEqual(prev.end);
      expect(e.changesLight).toBe(!!m.changesLight);
    }
    // a tear only at a part's start (the receipt's own part change), a feed inside it
    expect(moves.filter((e) => e.material === 'tear-next').every((e) => e.scope === 'section')).toBe(true);
    expectClocks(plan.events);
    // still sung when the next shows: none; a line sharing its shot, or too short to read past the slip: none
    const sung = planWorldEvents(input(ls.map((l) => ({ ...l, end: l.end + 0.5 })), { caps: doc }));
    expect(sung.events.some((e) => e.material)).toBe(false);
    const shared = planWorldEvents(input(ls.map((l) => ({ ...l, sharesShot: true })), { caps: doc }));
    expect(shared.events.some((e) => e.material)).toBe(false);
    const short = planWorldEvents(input(ls.map((l) => ({ ...l, end: l.start + 1.2 })), { caps: doc }));
    expect(short.events.some((e) => e.material)).toBe(false);
  });

  it('art-deco poster-panel: inside a line at a sung word, on the same page, another carrier, the declared time, read still either side; never off the page or into a protected region', () => {
    const deco = caps(['layout-seat', 'carrier-swap'], { allowedAt: { 'carrier-swap': ['in-line'] }, materials: { 'poster-panel': PANEL } });
    const l = line('a', 1, 5, [MARQUEE, PANELS], { words: words(1, 5, 4), settled: 1.4 });
    const plan = planWorldEvents(input([l], { caps: deco }));
    const e = plan.events.find((x) => x.kind === 'carrier-swap')!;
    expect([e.scope, e.seatBefore, e.seatAfter, e.material, e.curve, e.changesLight]).toEqual(['in-line', 'w/marquee', 'w/marquee+panels', 'poster-panel', 'panel-slide', false]);
    expect(+(e.to - e.from).toFixed(3)).toBe(PANEL.sec);
    expect(l.words!.some((w) => w.from === e.at)).toBe(true);
    expect(e.at - 1.4).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
    expect(5 - e.to).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
    // the carrier relation really changes: same page, another carrier
    expect(PANELS.page).toBe(MARQUEE.page);
    expect(PANELS.carrierId).not.toBe(MARQUEE.carrierId);
    // another page is never a carrier swap inside a line; a panel seat in a protected region is never taken
    const other = planWorldEvents(input([line('a', 1, 5, [MARQUEE, { ...PANELS, page: 'w/arch' }], { words: words(1, 5, 4) })], { caps: deco }));
    expect(other.events.some((x) => x.kind === 'carrier-swap')).toBe(false);
    const fenced = planWorldEvents(input([l], { caps: { ...deco, materials: { 'poster-panel': { ...PANEL, protectedRegion: [{ x0: 0, y0: 0.5, x1: 1, y1: 1 }] } } } }));
    expect(fenced.events.some((x) => x.kind === 'carrier-swap')).toBe(false);
    // no sung word: no swap (none faked by time)
    expect(planWorldEvents(input([{ ...l, words: undefined }], { caps: deco })).events.some((x) => x.kind === 'carrier-swap')).toBe(false);
  });
});

describe('phase 3b: pacing without a run cap (step 5)', () => {
  it('the composer’s changes of set stand however many came before (no run cap); keep is still normal where nothing changes', () => {
    const seats = [LEFT, RIGHT, CENTRE];
    const ls = Array.from({ length: 8 }, (_, k) => ({ ...line(`l${k}`, k * 2.5, k * 2.5 + 2.4, seats), seat: seats[k % 3].id }));
    const plan = planWorldEvents(input(ls));
    // every line after the first changes, as the composer set them: none kept by a count
    expect(cuts(plan.events).length).toBe(7);
    expect(plan.events.some((e) => / in a row/.test(e.reason))).toBe(false);
    expectClocks(plan.events);
    const same = Array.from({ length: 8 }, (_, k) => line(`l${k}`, k * 2.5, k * 2.5 + 2.4, seats));
    const q = planWorldEvents(input(same, { sections: [{ start: 0, energy: 0.05 }, { start: 30, energy: 0.9 }] }));
    expect(q.events.filter((e) => e.kind === 'keep').length).toBeGreaterThan(3);
  });

  it('a run of switches eases the scheduler’s own optional rate (a preference, never zero), quiet parts rarer than peaks', () => {
    for (const m of ['quiet', 'build', 'peak'] as const) {
      expect(reseatRate(m, 0)).toBe(MOOD_PACE[m].reseat);
      expect(reseatRate(m, 1)).toBe(MOOD_PACE[m].reseat);
      expect(reseatRate(m, 3)).toBeLessThan(MOOD_PACE[m].reseat);
      expect(reseatRate(m, 50)).toBeCloseTo(MOOD_PACE[m].reseat * STREAK_FLOOR, 6);
    }
    expect(MOOD_PACE.quiet.reseat).toBeLessThan(MOOD_PACE.build.reseat);
    expect(MOOD_PACE.build.reseat).toBeLessThan(MOOD_PACE.peak.reseat);
    expect('run' in MOOD_PACE.peak).toBe(false);
  });
});

describe('phase 3b: camera moves are scheduler inputs (leftover 1)', () => {
  it('a camera that collides with a composed seat is dropped for a scheduled world (camDrops), kept and reported for a world without capability', () => {
    const ls = [line('a', 0, 2, [LEFT]), line('b', 2.2, 2.5, [LEFT]), { ...line('c', 2.6, 4.5, [RIGHT]), pinned: 'test' }];
    const cams = [{ lineId: 'b', at: 2.0, sec: 0.5, kind: 'push-through' }];
    const on = planWorldEvents(input(ls, { cams }));
    expect(on.camDrops?.map((c) => c.lineId)).toEqual(['b']);
    expect(on.events.some((e) => e.kind === 'camera-reframe' || e.camera)).toBe(false);
    expect(on.warnings.some((w) => /world camera/.test(w.reason))).toBe(false);
    const off = planWorldEvents(input(ls, { cams, caps: caps([]) }));
    expect(off.camDrops).toBeUndefined();
  });

  it('a camera a forced own seat collides with is dropped after the plan, and its warning goes with it', () => {
    // c's seat before (b's) is not one of c's: c takes its own seat at its show, 0.3 s after the camera into b starts
    const ls = [line('a', 0, 2, [LEFT]), line('b', 2.2, 2.7, [LEFT]), line('c', 2.8, 4.5, [RIGHT])];
    const plan = planWorldEvents(input(ls, { cams: [{ lineId: 'b', at: 2.0, sec: 0.5, kind: 'diagonal' }] }));
    expect(plan.camDrops?.[0]).toMatchObject({ lineId: 'b', kind: 'diagonal' });
    expect(plan.warnings).toEqual([]);
  });
});

describe('phase 3b: the composer’s proportional-time reposes are labelled (leftover 2)', () => {
  it('a given switch at no sung word is unreliableBoundary; one at a sung word is not', () => {
    const w = words(1, 4, 3);
    expect(sungAt(w, 2.05)).toBe(true);
    expect(sungAt(w, 2.5)).toBe(false);
    expect(sungAt(undefined, 2)).toBe(false);
    const ls = [line('a', 1, 4, [LEFT, RIGHT], { words: w, given: [{ at: 2, seat: 'w/right', reason: 'repose' }] }), line('b', 5, 8, [LEFT, RIGHT], { given: [{ at: 6.3, seat: 'w/left', reason: 'repose', unreliable: true }] })];
    const plan = planWorldEvents(input(ls, { caps: caps([]) }));
    const given = plan.events.filter((e) => e.scope === 'in-line');
    expect(given.map((e) => !!e.unreliableBoundary)).toEqual([false, true]);
  });
});

describe('phase 3b: panels as the deco page draws them', () => {
  const env = (now: number, from: number, sec: number) => {
    // a marquee line: the main row over the gold phrase, cells in frame px from the face's centre
    const cells: [number, number, number][] = [...[-300, -150, 0, 150, 300].map((x): [number, number, number] => [x, -80, 120]), ...[-200, -100, 0, 100, 200].map((x): [number, number, number] => [x, 180, 80])];
    const face = { cx: 960, cy: 400, w: 800, h: 400, shear: [0.75, 0, 0, 1] as [number, number, number, number], size: 120, rows: 2, cells, parts: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1], panels: { from, sec } };
    return { now, rect: { x0: 600, y0: 250, x1: 1320, y1: 650, face } } as never;
  };
  it('the one plaque parts into the main plaque and the phrase panel; every word stands on one of them throughout; the slide eases out without passing its place', () => {
    const inside = (r: { x0: number; y0: number; x1: number; y1: number }, y0: number, y1: number) => r.y0 <= y0 && r.y1 >= y1;
    let last = -Infinity;
    for (const q of [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5]) {
      const p = panelsOf(env(10 + q * 0.4, 10, 0.4))!;
      // main words 260..380 px (cy 400 - (-80) ... y down), phrase words 540..620
      expect(inside(p.main, 260, 380)).toBe(true);
      expect(inside(p.panel, 540, 620)).toBe(true);
      expect(p.main.y1).toBeLessThanOrEqual(p.panel.y0 + 1e-6);
      expect(p.panel.y0).toBeGreaterThanOrEqual(last - 1e-6);
      last = p.panel.y0;
    }
    const end = panelsOf(env(20, 10, 0.4))!;
    expect(end.panel.x1 - end.panel.x0).toBeLessThan(end.main.x1 - end.main.x0);
    // no panels on a face that does not ask for them
    expect(panelsOf({ now: 0, rect: { x0: 0, y0: 0, x1: 1, y1: 1 } } as never)).toBeUndefined();
  });
});

describe('phase 3b: the frame check reads a carrier changing round still words', () => {
  it('stable frames fall outside each kind’s action, and a ring of changed edges round unmoved words is seen', () => {
    const cues = [{ id: 'a', from: 1, to: 4.5 }, { id: 'b', from: 5.2, to: 8 }];
    for (const e of [{ at: 5, from: 4.56, to: 4.98, scope: 'line', lineIds: ['a', 'b'] }, { at: 5, from: 5, to: 5.25, scope: 'line', lineIds: ['a', 'b'] }, { at: 6, from: 6, to: 6.4, scope: 'in-line', lineIds: ['b'] }]) {
      const t = stableTimes(e, cues)!;
      expect(t.before).toBeLessThan(e.from);
      expect(t.after).toBeGreaterThan(e.to);
    }
    const [w, h] = [80, 45];
    const blank = () => Array.from({ length: w * h }, () => 0);
    const frame = (box: number) => {
      const on = blank(), off = blank(), bare = blank();
      for (let y = 18; y < 24; y++) for (let x = 30; x < 50; x++) on[y * w + x] = 255;
      // a plaque outline round the words, at a height that changes
      for (let x = 20; x < 60; x++) { off[box * w + x] = 200; on[box * w + x] = 200; }
      return { on, off, bare };
    };
    const c = frameChange(frame(26), frame(30), true, undefined, w, h);
    expect(c.shift).toBe(0);
    expect(c.outline).toBeGreaterThan(0);
    expect(frameChange(frame(26), frame(26), true, undefined, w, h).outline).toBe(0);
  });
});

const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', taimei: 'yt_ZQ8mn5fS5_M' };
const have = Object.values(SONGS).every((db) => existsSync(`out/db/${db}/song.json`)) && existsSync('out/research/instant/plans/nun/meaning.json');
const load = (k: string) => ({ song: JSON.parse(readFileSync(`out/db/${SONGS[k]}/song.json`, 'utf8')), meaning: existsSync(`out/research/instant/plans/${k}/meaning.json`) ? JSON.parse(readFileSync(`out/research/instant/plans/${k}/meaning.json`, 'utf8')) : undefined });

describe.skipIf(!have)('phase 3b on real songs', () => {
  const style = (id: string) => FREE_STYLES.find((s) => s.id === id)!;
  const run = (id: string, k: string, worldEvents?: boolean) => { const { song, meaning } = load(k); return freeJob(song, { style: style(id), seed: 0, meaning, ...(worldEvents === undefined ? {} : { worldEvents }) }); };

  it('each new kind is planned, drawn as planned (verifyWorldEvents), the same seed the same table', () => {
    const cases: [string, string, string][] = [['chalkboard', 'nun', 'erase-reseat'], ['document', 'nun', 'feed-advance'], ['document', 'nun', 'tear-next'], ['art-deco', 'taimei', 'poster-panel']];
    for (const [id, k, m] of cases) {
      const f = run(id, k, true);
      const table = f.treatment.worldEvents!;
      expect(table.events.some((e) => e.material === m), `${id} ${k} ${m}`).toBe(true);
      expect(verifyWorldEvents(f.job, style(id).world, table), `${id} ${k}`).toEqual([]);
      expect(table.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
      expect(JSON.stringify(run(id, k, true).treatment.worldEvents)).toBe(JSON.stringify(table));
      // the world's own moves keep every clock among the scheduler's own switches
      expectClocks(table.events.filter((e) => !e.fixed));
    }
  });

  it('chalkboard: the erased line carries the wipe and the eraser exit; its wipe starts after it is sung and read still; tampered earlier it is reported', () => {
    const f = run('chalkboard', 'nun', true);
    const e = f.treatment.worldEvents!.events.find((x) => x.material === 'erase-reseat')!;
    const cues = f.treatment.cues as { cueId: string; world?: { wipe?: { from: number; sec: number }; exit?: string } }[];
    const old = cues.find((c) => c.cueId === e.lineIds[0])!;
    expect(old.world!.wipe).toMatchObject({ from: e.from, sec: ERASE.sec });
    expect(old.world!.exit).toBe(ERASE.draws);
    const { rows } = shownOf(f.job);
    expect(e.from).toBeGreaterThanOrEqual(rows.find((r) => r.id === e.lineIds[0])!.cue.end + ERASE.clearOfSung - 1e-6);
    expect(e.to).toBeLessThan(rows.find((r) => r.id === e.lineIds[1])!.show);
    const job = structuredClone(f.job);
    (job.treatment.cues as typeof cues).find((c) => c.cueId === e.lineIds[0])!.world!.wipe!.from = e.from - 1;
    expect(verifyWorldEvents(job, style('chalkboard').world, f.treatment.worldEvents!).length).toBeGreaterThan(0);
  });

  it('document: the receipt item opens a segment at the approved time and the receipt keeps no linked handoff, camera still', () => {
    const f = run('document', 'nun', true);
    const events = f.treatment.worldEvents!.events.filter((e) => e.material);
    const layers = ((f.treatment as { graphics?: { sections: { layers: { world?: { item?: { no: number; opens?: { draws: string; at: number; sec: number } } } }[] }[] } }).graphics?.sections ?? []).flatMap((s) => s.layers.map((l) => l.world?.item).filter(Boolean));
    for (const e of events.filter((x) => x.scope === 'line')) {
      const it = layers.find((x) => x!.opens && Math.abs(x!.opens.at - e.at) < 1e-6);
      if (!it) continue;
      expect(it.opens!.draws).toBe(WORLD_COMPOSITIONS['document'].materials![e.material!].draws);
    }
    expect(shownOf(f.job).handoffs).toEqual([]);
    expect(compositionsOf('document')!.kinds).not.toContain('camera-reframe');
  });

  it('art-deco: the poster-panel is the line’s repose onto its marquee’s panels, at a sung word, the words on the same page', () => {
    const f = run('art-deco', 'taimei', true);
    const e = f.treatment.worldEvents!.events.find((x) => x.material === 'poster-panel')!;
    const cue = (f.treatment.cues as { cueId: string; world?: { set: string; repose?: { at: number; set: string; sec?: number; move?: string }[] } }[]).find((c) => c.cueId === e.lineIds[0])!;
    expect(cue.world!.repose).toContainEqual({ at: e.at, set: e.seatAfter, sec: PANEL.sec, move: 'poster-panel' });
    expect(e.seatAfter).toBe(`${cue.world!.set}+panels`);
    const inp = fromJob(f.job, load('taimei').song, style('art-deco').world);
    expect(sungAt(inp.lines.find((l) => l.id === e.lineIds[0])!.words, e.at)).toBe(true);
  });

  it('blueprint choroin c060: the camera that ran into c061’s composed seat is dropped, the gate sees no overlap', () => {
    if (!existsSync('out/db/yt_hCCskTJwvuc/song.json')) return;
    const song = JSON.parse(readFileSync('out/db/yt_hCCskTJwvuc/song.json', 'utf8'));
    const meaning = JSON.parse(readFileSync('out/research/instant/plans/choroin/meaning.json', 'utf8'));
    for (const id of ['blueprint', 'chalkboard']) {
      const f = freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: true });
      const t = f.treatment.worldEvents!;
      expect(t.camDrops?.some((c) => c.lineId === 'c060'), id).toBe(true);
      expect(t.warnings.filter((w) => /world camera .* into c060/.test(w.reason + w.inputs.join(' ')))).toEqual([]);
      expect((f.treatment.cues as { cueId: string; world?: { cam?: unknown } }[]).find((c) => c.cueId === 'c060')!.world!.cam).toBeUndefined();
      // drawn back in, the final check reports it
      const job = structuredClone(f.job);
      (job.treatment.cues as { cueId: string; world?: { cam?: unknown } }[]).find((c) => c.cueId === 'c060')!.world!.cam = { kind: t.camDrops!.find((c) => c.lineId === 'c060')!.kind, at: t.camDrops!.find((c) => c.lineId === 'c060')!.at, dir: 1 };
      expect(verifyWorldEvents(job, style(id).world, t).some((w) => /world camera/.test(w.reason))).toBe(true);
    }
  });

  it('by default (scheduler off) chalkboard, document and art-deco draw exactly as before: no wipe, no page move, no panels; undeclared worlds’ proportional reposes are labelled', () => {
    for (const id of ['chalkboard', 'document', 'art-deco']) {
      for (const k of ['nun', 'taimei']) {
        const plain = run(id, k);
        const before = run(id, k, false);
        const { worldEvents: _w, ...rest } = plain.job.treatment;
        expect(JSON.stringify(rest)).toBe(JSON.stringify(before.job.treatment));
        expect(JSON.stringify(rest)).not.toMatch(/"wipe"|"opens"|\+panels|"page":\{"move"/);
        expect(plain.treatment.worldEvents!.events.some((e) => e.material)).toBe(false);
      }
    }
    const silk = run('silk', 'nun');
    const given = silk.treatment.worldEvents!.events.filter((e) => e.scope === 'in-line' && e.fixed);
    for (const e of given) {
      const inp = fromJob(silk.job, load('nun').song, style('silk').world, { off: true });
      expect(!!e.unreliableBoundary).toBe(!sungAt(inp.lines.find((l) => l.id === e.lineIds[0])!.words, e.at));
    }
  });
});
