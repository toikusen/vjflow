// Q1 phase 4, the first five of the eight new worlds (docs/research/2026-11-10-phase4-codex.md §2; -q1-phase4b.md):
// riso, silk, file, card (pictogram) and spy declared from the ruling's table, their same-sheet seats real set specs,
// off by default. The declarations, the seats' geometry, where a switch may fall, and the default path unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { READ_STABLE, seatsDiffer } from './world-events';
import { fromJob, jobFaces, seatIn, shownOf, verifyWorldEvents } from './world-events-adapter';
import { compositionsOf, isPageSeat, linksOf, pageOf, pageSeatsOf, WORLD_COMPOSITIONS } from './world-shared';
import { SAFE_X, SAFE_Y, SET_SPECS } from './render/world-sets';
import { boxesMeet, laidSeat } from './render/seat-geometry';
import { pageSeatsFor } from './lineplan-core';

const NEW = ['riso', 'silk', 'file', 'card', 'spy'];
const TEXTS = ['快使用', '快使用雙截棍 哼哼哈兮', '如果我有輕功 飛簷走壁', '三年後的大雪', 'こんなに綺麗じゃん!', 'あの星あかりを 海の広さを', 'Baby I love you', '他們兒子我習慣從小就耳濡目染什麼刀槍跟棍棒我都耍的有模有樣'];
const FACES = ['Huninn', 'Zen Maru Gothic', 'Chocolate Classical Sans', 'UoqMunThenKhung', 'Chiron GoRound TC', 'LXGW Marker Gothic'];
const worldOf = (id: string) => FREE_STYLES.find((s) => s.id === id)!.world;

describe('phase 4: the first five worlds declared from the ruling', () => {
  it('riso, silk, file, card and spy are declared in the ruling\'s families, all off by default, with the old five', () => {
    expect(Object.keys(WORLD_COMPOSITIONS)).toEqual(['blueprint', 'chalkboard', 'document', 'notebook', 'art-deco', ...NEW]);
    for (const c of Object.values(WORLD_COMPOSITIONS)) expect(c.enabled).toBeFalsy();
    for (const id of NEW) expect(compositionsOf(id)!.enabled, id).toBe(false);
    expect(compositionsOf('riso')!.moves).toEqual({ 'layout-seat': 'paper-seat', 'page-handoff': 'sheet-handoff' });
    expect(compositionsOf('silk')!.moves).toEqual({ 'layout-seat': 'poster-seat', 'page-handoff': 'sheet-handoff' });
    expect(compositionsOf('file')!.moves).toEqual({ 'layout-seat': 'case-seat', 'page-handoff': 'file-handoff' });
    expect(compositionsOf('card')!.moves).toEqual({ 'layout-seat': 'card-seat', 'page-handoff': 'card-handoff' });
    expect(compositionsOf('spy')!.moves).toEqual({ 'layout-seat': 'slash-seat', 'camera-reframe': 'scene-reframe' });
    for (const id of NEW) {
      const c = compositionsOf(id)!;
      // (rule 9: a reseat is a cut, a handoff the world's own linked page move, a reframe the world's camera)
      expect(c.duration['layout-seat'], id).toBe(0);
      expect(c.curve['layout-seat'], id).toBe('cut');
      if (c.kinds.includes('page-handoff')) expect(c.curve['page-handoff'], id).toBe('page-link');
      if (c.kinds.includes('camera-reframe')) expect([c.curve['camera-reframe'], c.allowedAt['camera-reframe']], id).toEqual(['world-camera', ['section']]);
      expect(c.pageSeats, id).toBe(true);
      expect(pageSeatsOf(id).length, id).toBeGreaterThan(0);
      expect(c.pending ?? {}, id).toEqual({});
    }
  });

  it('a page handoff is declared only where the world has a real outline handoff of its own (Q4 linked families)', () => {
    for (const id of Object.keys(WORLD_COMPOSITIONS)) {
      const world = worldOf(id);
      if (compositionsOf(id)!.kinds.includes('page-handoff') && id !== 'document') expect(linksOf(id).families.length > 0 && !world.ownMoves, id).toBe(true);
    }
    // (spy's table names a scene reframe, not a handoff: none declared, none pending)
    expect(compositionsOf('spy')!.kinds).not.toContain('page-handoff');
  });

  it('a switch inside a line is released seat by seat: riso and spy only to their same-sheet seats; silk, file and card never', () => {
    for (const id of ['riso', 'spy']) {
      expect(compositionsOf(id)!.allowedAt['layout-seat'], id).toContain('in-line');
      expect(compositionsOf(id)!.inLineSeats, id).toBe('page');
    }
    for (const id of ['silk', 'file', 'card']) expect(compositionsOf(id)!.allowedAt['layout-seat'], id).toEqual(['section', 'line']);
  });
});

describe('phase 4: the same-sheet seats', () => {
  it('each seat is its sheet\'s own: the same page and carrier as its set, another seat, at no less than its least type', () => {
    for (const id of NEW) {
      const world = worldOf(id);
      for (const x of pageSeatsOf(id)) {
        const main = SET_SPECS[x].samePage!;
        expect(main.startsWith(`${id}/`), x).toBe(true);
        expect(world.layouts.lines.some((l) => l.set === main), x).toBe(true);
        expect(isPageSeat(x)).toBe(true);
        expect(SET_SPECS[x].lo, x).toBeGreaterThanOrEqual(100);
        expect(SET_SPECS[x].split, x).toBeUndefined();
        expect(pageOf(world, x), x).toBe(pageOf(world, main));
        expect(seatIn(world, x, '三年後的大雪').carrierId, x).toBe(seatIn(world, main, '三年後的大雪').carrierId);
        expect(seatsDiffer(seatIn(world, main, '三年後的大雪'), seatIn(world, x, '三年後的大雪')), x).toBe(true);
      }
    }
  });

  it('a seat is offered only where the line keeps its least type, inside the safe area, off its page\'s graphics and the world\'s protected regions', () => {
    let offered = 0;
    for (const id of NEW) {
      const protect = compositionsOf(id)!.protectedRegion ?? [];
      for (const main of [...new Set(pageSeatsOf(id).map((x) => SET_SPECS[x].samePage!))])
        for (const font of [undefined, ...FACES])
          for (const text of TEXTS)
            for (const x of pageSeatsFor(text, main, id, font)) {
              offered++;
              const laid = laidSeat(text, x, { font })!;
              const at = `${x} ${font} ${text}`;
              expect(laid.size, at).toBeGreaterThanOrEqual(SET_SPECS[x].lo);
              expect(laid.boxPx.x0, at).toBeGreaterThanOrEqual(SAFE_X - 0.5);
              expect(laid.boxPx.x1, at).toBeLessThanOrEqual(1920 - SAFE_X + 0.5);
              expect(laid.boxPx.y0, at).toBeGreaterThanOrEqual(SAFE_Y - 0.5);
              expect(laid.boxPx.y1, at).toBeLessThanOrEqual(1080 - SAFE_Y + 0.5);
              for (const p of [...laid.protect, ...protect]) expect(boxesMeet(laid.box, p), at).toBe(false);
            }
    }
    expect(offered).toBeGreaterThan(0);
    // (the longest line takes no seat it would have to shrink under the least type for)
    for (const id of NEW) for (const main of [...new Set(pageSeatsOf(id).map((x) => SET_SPECS[x].samePage!))]) expect(pageSeatsFor(TEXTS.at(-1)!, main, id, 'Huninn'), main).toEqual([]);
  });

  it('a card seat keeps the room the card draws round the words (its furniture above, its foot below); a case seat keeps off the header, tab and footer', () => {
    for (const x of ['card/main+right', 'card/calm+right']) expect(SET_SPECS[x].clear?.length, x).toBeGreaterThan(0);
    for (const x of ['file/case+next', 'file/catalogue+next']) expect(SET_SPECS[x].clear?.length, x).toBeGreaterThan(0);
  });
});

const SONGS = [['out/db/yt_w_fCuUR3lEs/song.json', 'out/research/instant/plans/nun/meaning.json'], ['out/db/yt_5i50aTB7JFo/song.json', 'out/research/instant/plans/snow/meaning.json']];
const onDisk = SONGS.every(([s, m]) => existsSync(s) && existsSync(m));

describe.skipIf(!onDisk)('phase 4 on real songs (雙截棍, 三年後的大雪)', () => {
  const songs = onDisk ? SONGS.map(([s, m]) => [JSON.parse(readFileSync(s, 'utf8')), JSON.parse(readFileSync(m, 'utf8'))]) : [];
  const runs = new Map<string, ReturnType<typeof freeJob>[]>();
  const wired = (id: string) => {
    if (!runs.has(id)) runs.set(id, songs.map(([song, meaning]) => freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0, meaning, worldEvents: true })));
    return runs.get(id)!;
  };

  for (const id of NEW)
    it(`${id}: the same seed the same table; the final draw matches it; every scheduler's own seat on the whitelist`, () => {
      wired(id).forEach((f, k) => {
        const [song, meaning] = songs[k];
        const style = FREE_STYLES.find((s) => s.id === id)!;
        const table = f.treatment.worldEvents!;
        expect(table.source).toBe('declared');
        expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(table));
        expect(JSON.stringify(freeJob(song, { style, seed: 1, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(freeJob(song, { style, seed: 1, meaning, worldEvents: true }).treatment.worldEvents));
        expect(verifyWorldEvents(f.job, style.world, table)).toEqual([]);
        expect(table.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
      });
    });

  for (const id of ['riso', 'spy'])
    it(`${id}: at most one switch inside a line, only at a word break the aligner timed, 0.35 s still either side, only to its set's same-sheet seat`, () => {
      let seen = 0;
      wired(id).forEach((f, k) => {
        const [song] = songs[k];
        const world = worldOf(id);
        const table = f.treatment.worldEvents!;
        const inp = fromJob(f.job, song, world);
        const inLine = table.events.filter((e) => e.scope === 'in-line' && !e.fixed && e.kind !== 'keep');
        seen += inLine.length;
        const byLine = new Map<string, number>();
        for (const e of inLine) {
          const l = inp.lines.find((x) => x.id === e.lineIds[0])!;
          byLine.set(l.id, (byLine.get(l.id) ?? 0) + 1);
          expect(l.words, e.id).toBeDefined();
          expect(l.words!.slice(1).map((w) => w.from), e.id).toContain(e.at);
          expect(e.at - Math.max(l.start, l.settled ?? l.start), e.id).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
          expect(l.end - e.to, e.id).toBeGreaterThanOrEqual(READ_STABLE - 1e-6);
          expect(isPageSeat(e.seatAfter), e.id).toBe(true);
          expect(SET_SPECS[e.seatAfter].samePage, e.id).toBe(e.seatBefore);
          const cue = song.cues.find((c: { id: string }) => c.id === l.id);
          const laid = laidSeat(cue.text, e.seatAfter, { font: jobFaces(f.job)(cue.text) })!;
          expect(laid.size, e.id).toBeGreaterThanOrEqual(SET_SPECS[e.seatAfter].lo);
        }
        for (const [line, n] of byLine) expect(n, line).toBe(1);
        for (const l of inp.lines.filter((x) => !x.words)) expect(inLine.some((e) => e.lineIds.includes(l.id)), l.id).toBe(false);
      });
      expect(seen, id).toBeGreaterThan(0);
    });

  for (const id of ['silk', 'file', 'card'])
    it(`${id}: no switch of the scheduler's own inside a line`, () => {
      for (const f of wired(id)) expect(f.treatment.worldEvents!.events.filter((e) => e.scope === 'in-line' && !e.fixed && e.kind !== 'keep')).toEqual([]);
    });

  it('spy: a reframe falls only where a part of the song starts (the world camera into it), never inside a line or at a plain line change', () => {
    let reframes = 0;
    wired('spy').forEach((f, k) => {
      const [song, meaning] = songs[k];
      // (a part opens on its first shot, as the composer lays the world camera: lineplan-core newPart; a line sharing its
      // shot with the line before belongs to that shot)
      const index = (id: string) => song.cues.findIndex((c: { id: string }) => c.id === id);
      const partOf = (id: string) => (meaning.parts as { from: string }[]).filter((p) => index(p.from) <= index(id)).length;
      const rows = shownOf(f.job).rows;
      const starts = new Set(rows.filter((r, i) => i > 0 && r.shot !== rows[i - 1].shot && partOf(rows.find((x) => x.shot === r.shot)!.id) !== partOf(rows.find((x) => x.shot === rows[i - 1].shot)!.id)).map((r) => r.id));
      const es = f.treatment.worldEvents!.events;
      for (const e of es.filter((x) => x.kind === 'camera-reframe' || x.camera)) {
        reframes++;
        expect(e.scope, e.id).not.toBe('in-line');
        expect(starts.has(e.lineIds.at(-1)!), e.id).toBe(true);
        if (e.kind === 'camera-reframe') expect(e.fixed, e.id).toBe(true);
      }
      // (the scheduler lays no reframe of its own: only the world camera's move into a part, kept or dropped)
      expect(es.filter((x) => x.kind === 'camera-reframe' && !x.fixed)).toEqual([]);
    });
    expect(reframes).toBeGreaterThan(0);
  });

  it('card (pictogram): a seat change the scheduler counts is one where the reading composition really differs; the same card in the same place keeps', () => {
    let counted = 0;
    wired('card').forEach((f, k) => {
      const [song] = songs[k];
      const world = worldOf('card');
      const faces = jobFaces(f.job);
      const text = (id: string) => song.cues.find((c: { id: string }) => c.id === id).text as string;
      const es = f.treatment.worldEvents!.events;
      for (const e of es.filter((x) => x.kind === 'layout-seat' && !x.fixed && x.scope !== 'in-line')) {
        const i = es.indexOf(e);
        const prev = [...es.slice(0, i)].reverse().find((x) => x.lineIds.at(-1) !== e.lineIds.at(-1));
        const [a, b] = [seatIn(world, e.seatBefore, text(prev!.lineIds.at(-1)!), faces), seatIn(world, e.seatAfter, text(e.lineIds.at(-1)!), faces)];
        expect(seatsDiffer(a, b), e.id).toBe(true);
        counted++;
      }
      // (the composer's change of card the laid boxes call the same composition stays a keep, never a counted flip)
      for (const e of es.filter((x) => x.kind === 'keep' && x.seatBefore && x.seatAfter !== x.seatBefore)) {
        const i = es.indexOf(e);
        const prev = [...es.slice(0, i)].reverse().find((x) => x.lineIds.at(-1) !== e.lineIds.at(-1));
        if (!prev) continue;
        expect(seatsDiffer(seatIn(world, e.seatBefore, text(prev.lineIds.at(-1)!), faces), seatIn(world, e.seatAfter, text(e.lineIds.at(-1)!), faces)), e.id).toBe(false);
      }
    });
    expect(counted).toBeGreaterThan(0);
  });

  it('riso: a Q3 scale composition shares its line\'s switch: one event id, never a second cut at the line', () => {
    const style = FREE_STYLES.find((s) => s.id === 'riso')!;
    for (const [song, meaning] of songs) {
      const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true, scaleContrast: true });
      const table = f.treatment.worldEvents!;
      const approved = (table.policy ?? []).filter((d) => d.source === 'Q3' && d.approved);
      for (const d of approved) {
        const own = table.events.filter((e) => e.lineIds.at(-1) === d.lineId && e.kind !== 'keep' && e.scope !== 'in-line' && e.kind !== 'camera-reframe');
        expect(own.length, d.id).toBe(1);
        expect(own[0].id, d.id).toBe(d.eventId);
      }
      expect(verifyWorldEvents(f.job, style.world, table)).toEqual([]);
    }
  });

  it('by default (scheduler off) the five draw exactly as before: no same-sheet seat is offered or drawn', () => {
    for (const id of NEW) {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      for (const [song, meaning] of songs) {
        const plain = freeJob(song, { style, seed: 0, meaning });
        const before = freeJob(song, { style, seed: 0, meaning, worldEvents: false });
        expect(plain.treatment.worldEvents?.source, id).toBe('declared-off');
        const { worldEvents: _w, ...rest } = plain.job.treatment;
        const drawn = JSON.stringify(rest);
        expect(drawn, id).toBe(JSON.stringify(before.job.treatment));
        for (const x of pageSeatsOf(id)) expect(drawn.includes(`"${x}"`), `${id} ${x}`).toBe(false);
      }
    }
  });
});
