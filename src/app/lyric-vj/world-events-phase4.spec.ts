// Q1 phase 4, the first five of the eight new worlds (docs/research/2026-11-10-phase4-codex.md §2; -q1-phase4b.md):
// riso, silk, file, card (pictogram) and spy declared from the ruling's table, their same-sheet seats real set specs,
// off by default. The declarations, the seats' geometry, where a switch may fall, and the default path unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { countCuts, planWorldEvents, seatsDiffer, type PolicyCandidate } from './world-events';
import { fromJob, jobFaces, seatIn, shownOf, verifyWorldEvents } from './world-events-adapter';
import { compositionsOf, isPageSeat, linksOf, pageOf, pageSeatsOf, scaleOf, WORLD_COMPOSITIONS } from './world-shared';
import { SAFE_X, SAFE_Y, SET_SPECS } from './render/world-sets';
import { boxesMeet, laidSeat, type FracBox } from './render/seat-geometry';
import { CARRIER_STROKE, scaleLayout, type LineScale } from './render/scale-pose';
import { estimateMeasure } from './scale-policy';
import { CARD_ROOM } from './render/world-p4-seats';
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

  it('no switch inside a line for the five (the table lists none): their seats are taken at a line or a part', () => {
    for (const id of NEW) expect(compositionsOf(id)!.allowedAt['layout-seat'], id).toEqual(['section', 'line']);
  });

  it('each declares its approved seats (its own sets and their same-sheet seats) and its protected regions, real furniture or none', () => {
    for (const id of NEW) {
      const c = compositionsOf(id)!;
      const own = [...new Set(worldOf(id).layouts.lines.map((l) => l.set))];
      expect([...(c.seats ?? [])].sort(), id).toEqual([...own, ...pageSeatsOf(id)].sort());
      expect(Array.isArray(c.protectedRegion), id).toBe(true);
    }
    // (riso, silk, spy: full-frame plates and cut paper under the words, card: furniture drawn round them; file: its tab)
    for (const id of ['riso', 'silk', 'card', 'spy']) expect(compositionsOf(id)!.protectedRegion, id).toEqual([]);
    expect(compositionsOf('file')!.protectedRegion).toEqual([{ x0: 0.719, y0: 0.037, x1: 0.891, y1: 0.12 }]);
    // every seat of the five, any test line in any face, keeps off its world's protected regions (else seatOk would refuse the composer's own)
    for (const id of NEW)
      for (const set of compositionsOf(id)!.seats!)
        for (const font of FACES)
          for (const text of TEXTS.slice(0, -1)) {
            const laid = laidSeat(text, set, { font })!;
            for (const p of compositionsOf(id)!.protectedRegion!) expect(boxesMeet(laid.box, p), `${set} ${font} ${text}`).toBe(false);
          }
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

  it('a card seat leaves the card its room: its furniture above the words and its foot below stay in the frame', () => {
    for (const main of ['card/main', 'card/calm'])
      for (const font of FACES)
        for (const text of TEXTS)
          for (const x of pageSeatsFor(text, main, 'card', font)) {
            const b = laidSeat(text, x, { font })!.boxPx;
            expect(b.y0 - CARD_ROOM.above, `${x} ${text}`).toBeGreaterThanOrEqual(0);
            expect(b.y1 + CARD_ROOM.below, `${x} ${text}`).toBeLessThanOrEqual(1080);
          }
    for (const x of ['file/case+next', 'file/catalogue+next']) expect(SET_SPECS[x].clear?.length, x).toBeGreaterThan(0);
  });

  it('a seat draws nothing its page does not: it differs from its set only in place, size, rows and the page graphics it keeps off (no field, label, small print or bar of its own)', () => {
    const PLACE = new Set(['at', 'ax', 'ay', 'flush', 'stair', 'tilt', 'share', 'tall', 'hi', 'lo', 'rows', 'clear', 'samePage']);
    for (const id of NEW)
      for (const x of pageSeatsOf(id)) {
        const [seat, base] = [SET_SPECS[x] as unknown as Record<string, unknown>, SET_SPECS[SET_SPECS[x].samePage!] as unknown as Record<string, unknown>];
        for (const k of new Set([...Object.keys(seat), ...Object.keys(base)]))
          if (!PLACE.has(k) && k !== 'split') expect(JSON.stringify(seat[k]), `${x} ${k}`).toBe(JSON.stringify(base[k]));
        expect(seat['split'], x).toBeUndefined();
      }
  });

  it('riso: a scale composition\'s second plate (the sheet edge printed off register) never runs inside the words\' ink', () => {
    const plan = (edge: LineScale['edge'], rows: string[], span: { from: number; to: number }): LineScale => ({ eventId: 'scale:t', sectionId: 'S', kind: 'edgeFit', source: 'meaning', ratio: 2.4, targetSize: 300, readingSize: 120, span, edge, rows, carrierRole: scaleOf('riso')!.carrierRole, carrierId: 'paper:riso' });
    let drawn = 0;
    for (const edge of scaleOf('riso')!.edges)
      for (const [text, from, to] of [['我愛你天荒地老', 3, 7], ['快使用雙截棍 哼哼哈兮', 0, 6], ['三年後的大雪', 3, 6]] as const) {
        const d = scaleLayout(text, plan(edge, [[...text].slice(from, to).join('')], { from, to }), 120, { track: 0.02 }, estimateMeasure);
        if (d.kind === 'miss') continue;
        drawn++;
        const c = { x0: d.carrierBox!.x0 * 1920, y0: d.carrierBox!.y0 * 1080, x1: d.carrierBox!.x1 * 1920, y1: d.carrierBox!.y1 * 1080 };
        const q = CARRIER_STROKE.plateOffset;
        const half = CARRIER_STROKE.plate / 2;
        // (the plate's hairline on each side that stays in frame, as world-layout scaleCarrier strokes it)
        const lines = [edge !== 'top' && { x0: c.x0, x1: c.x1, y0: c.y0 + q - half, y1: c.y0 + q + half }, edge !== 'bottom' && { x0: c.x0, x1: c.x1, y0: c.y1 - q - half, y1: c.y1 - q + half }, edge !== 'left' && { x0: c.x0 + q - half, x1: c.x0 + q + half, y0: c.y0, y1: c.y1 }, edge !== 'right' && { x0: c.x1 - q - half, x1: c.x1 - q + half, y0: c.y0, y1: c.y1 }].filter((x): x is FracBox => !!x);
        for (const g of d.glyphs) {
          const em = { x0: g.x - g.size / 2, y0: g.y - g.size / 2, x1: g.x + g.size / 2, y1: g.y + g.size / 2 };
          for (const l of lines) expect(boxesMeet(em, l), `${edge} ${text} glyph ${g.i}`).toBe(false);
        }
      }
    expect(drawn).toBeGreaterThan(0);
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

  for (const id of NEW)
    it(`${id}: no switch of the scheduler's own inside a line`, () => {
      for (const f of wired(id)) expect(f.treatment.worldEvents!.events.filter((e) => e.scope === 'in-line' && !e.fixed && e.kind !== 'keep')).toEqual([]);
    });

  it('the scheduler still changes seat across lines on the five (the in-line rule blocks no boundary): its own reseats, some onto a same-sheet seat', () => {
    let own = 0;
    let onto = 0;
    for (const id of NEW)
      for (const f of wired(id))
        for (const e of f.treatment.worldEvents!.events.filter((x) => x.kind === 'layout-seat' && !x.fixed && x.scope !== 'in-line')) {
          own++;
          if (isPageSeat(e.seatAfter)) onto++;
        }
    expect(own).toBeGreaterThan(0);
    expect(onto).toBeGreaterThan(0);
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

  it('riso: a Q3 scale composition shares its line\'s switch: one event id, never a second cut at the line (an approved candidate on a reseat and on a keep)', () => {
    const style = FREE_STYLES.find((s) => s.id === 'riso')!;
    let shared = 0;
    let replaced = 0;
    songs.forEach(([song], k) => {
      const f = wired('riso')[k];
      const input = fromJob(f.job, song, style.world, { seed: 0 });
      const plain = planWorldEvents(input);
      const free = (id: string) => !input.holds?.some((h) => h.lineId === id) && !input.handoffs?.some((h) => h.lineId === id) && !input.cams?.some((c) => c.lineId === id);
      const at = (e: { lineIds: string[] }) => input.lines.find((l) => l.id === e.lineIds.at(-1))!;
      const reseat = plain.events.find((e) => e.kind === 'layout-seat' && e.scope !== 'in-line' && free(e.lineIds.at(-1)!));
      const keep = plain.events.find((e, n) => e.kind === 'keep' && n > 0 && free(e.lineIds.at(-1)!) && !plain.events.some((x) => x !== e && x.kind !== 'keep' && x.lineIds.at(-1) === e.lineIds.at(-1)));
      const cand = (e: { lineIds: string[] }, n: number): PolicyCandidate => ({ source: 'Q3', id: `scale:${e.lineIds.at(-1)}`, group: `S${n}`, rank: 0, lineId: e.lineIds.at(-1)!, kind: 'layout-seat', at: at(e).show, from: at(e).show, to: at(e).show, seatAfter: `${at(e).seat}+scale:bottom`, reason: 'test: synthetic approved scale composition' });
      const cands = [reseat && cand(reseat, 0), keep && cand(keep, 1)].filter((c): c is PolicyCandidate => !!c);
      const plan = planWorldEvents({ ...input, candidates: cands });
      for (const c of cands) {
        const d = plan.policy!.find((x) => x.lineId === c.lineId)!;
        expect(d.approved, `${c.lineId}: ${d.reason}`).toBe(true);
        const cuts = plan.events.filter((e) => e.lineIds.at(-1) === c.lineId && e.kind !== 'keep' && e.scope !== 'in-line' && e.kind !== 'camera-reframe');
        expect(cuts.map((e) => e.id), c.lineId).toEqual([d.eventId]);
        if (d.shared) shared++;
        else replaced++;
      }
      // (the same count of cuts as without the candidates: the scale composition is no cut of its own where it shares one)
      expect(countCuts(plan.events, [0, 1e4]).cuts - countCuts(plain.events, [0, 1e4]).cuts).toBe(cands.filter((c) => !plain.events.some((e) => e.kind !== 'keep' && e.lineIds.at(-1) === c.lineId)).length);
    });
    expect(shared).toBeGreaterThan(0);
    expect(replaced).toBeGreaterThan(0);
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
