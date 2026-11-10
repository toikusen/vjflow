// Q1 phase 4d, rows 6–7 of the eight new worlds (docs/research/2026-11-10-phase4-codex.md §2; -q1-phase4d.md): popart
// and midcentury declared from the ruling's table, their same-page seats real set specs, off by default. The
// declarations, the seats' geometry and carriers, where a switch may fall, what is no cut, and the default path unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { countCuts, seatsDiffer } from './world-events';
import { fromJob, jobFaces, seatIn, verifyWorldEvents } from './world-events-adapter';
import { compositionsOf, isPageSeat, linksOf, pageOf, pageSeatsOf, WORLD_COMPOSITIONS } from './world-shared';
import { SAFE_X, SAFE_Y, SET_SPECS } from './render/world-sets';
import { boxesMeet, laidSeat } from './render/seat-geometry';
import { carrierBox } from './render/hold-room';
import { POP_PANELS, POP_SHADOW, POP_TAIL } from './render/world-p4-seats';
import { wedgeTail } from './render/balloon-tail';
import { bandFit } from './render/carrier-fit';
import { blockOf } from './render/world-sets';
import { layoutMeasure } from './render/layout-measure';
import { pageSeatsFor } from './lineplan-core';
import { setWordSafe } from './phrases';

const NEW = ['popart', 'midcentury'];
const TEXTS = ['快使用', '快使用雙截棍 哼哼哈兮', '如果我有輕功 飛簷走壁', '三年後的大雪', 'こんなに綺麗じゃん!', 'あの星あかりを 海の広さを', 'Baby I love you', '他們兒子我習慣從小就耳濡目染什麼刀槍跟棍棒我都耍的有模有樣'];
const FACES = ['Huninn', 'Noto Sans TC', 'Noto Serif JP', 'Chocolate Classical Sans', 'Shippori Antique B1', 'Zen Maru Gothic'];
const worldOf = (id: string) => FREE_STYLES.find((s) => s.id === id)!.world;
const mains = (id: string) => [...new Set(pageSeatsOf(id).map((x) => SET_SPECS[x].samePage!))];
/** Every seat a line of the test set is offered on a page of the world's, in every face. */
const offered = (id: string) => mains(id).flatMap((main) => [undefined, ...FACES].flatMap((font) => TEXTS.flatMap((text) => pageSeatsFor(text, main, id, font).map((x) => ({ x, main, font, text })))));

describe('phase 4d: popart and midcentury declared from the ruling (rows 6–7)', () => {
  it('both follow the first five in the table\'s order, off by default, in the ruling\'s families and moves', () => {
    expect(Object.keys(WORLD_COMPOSITIONS)).toEqual(['blueprint', 'chalkboard', 'document', 'notebook', 'art-deco', 'riso', 'silk', 'file', 'card', 'spy', ...NEW]);
    for (const id of NEW) expect(compositionsOf(id)!.enabled, id).toBe(false);
    expect(compositionsOf('popart')!.moves).toEqual({ 'layout-seat': 'balloon-seat', 'page-handoff': 'comic-handoff' });
    expect(compositionsOf('midcentury')!.moves).toEqual({ 'layout-seat': 'poster-seat', 'page-handoff': 'sleeve-handoff' });
    expect(compositionsOf('popart')!.carrierRole).toBe('object');
    expect(compositionsOf('midcentury')!.carrierRole).toBe('page');
    for (const id of NEW) {
      const c = compositionsOf(id)!;
      expect(c.kinds, id).toEqual(['layout-seat', 'page-handoff']);
      // (rule 9: a reseat is a cut, a handoff the page's own linked move)
      expect([c.duration['layout-seat'], c.curve['layout-seat'], c.curve['page-handoff']], id).toEqual([0, 'cut', 'page-link']);
      expect(c.pageSeats, id).toBe(true);
      expect(c.pending ?? {}, id).toEqual({});
      expect(c.materials, id).toBeUndefined();
      expect(c.entranceAndInLine, id).toBeUndefined();
    }
  });

  it('a switch falls only at a line or a part, never inside a line (the table lists none)', () => {
    for (const id of NEW) expect(compositionsOf(id)!.allowedAt, id).toEqual({ 'layout-seat': ['section', 'line'], 'page-handoff': ['section', 'line'] });
  });

  it('a page handoff only where the page has a real outline handoff of its own (a Q4 linked family, no own moves)', () => {
    for (const id of NEW) expect(linksOf(id).families.length > 0 && !worldOf(id).ownMoves, id).toBe(true);
  });

  it('each declares its seats (its own sets and their same-page seats) and its protected regions, none, with the page graphics as each seat\'s clear', () => {
    for (const id of NEW) {
      const c = compositionsOf(id)!;
      const own = [...new Set(worldOf(id).layouts.lines.map((l) => l.set))];
      expect([...(c.seats ?? [])].sort(), id).toEqual([...own, ...pageSeatsOf(id)].sort());
      expect(c.protectedRegion, id).toEqual([]);
    }
    expect(pageSeatsOf('popart').sort()).toEqual(['popart/balloon+low', 'popart/balloon-r+low', 'popart/narration+foot', 'popart/narration-r+foot']);
    // (the balloon seats keep off the strip's other panel)
    expect(SET_SPECS['popart/balloon+low'].clear).toEqual([POP_PANELS['popart/balloon'].other]);
    expect(SET_SPECS['popart/balloon-r+low'].clear).toEqual([POP_PANELS['popart/balloon-r'].other]);
  });
});

describe('phase 4d: the same-page seats', () => {
  it('each seat is its page\'s own: the same page and carrier as its set, another seat, at no less than its least type', () => {
    for (const id of NEW) {
      const world = worldOf(id);
      for (const x of pageSeatsOf(id)) {
        const main = SET_SPECS[x].samePage!;
        expect(main.startsWith(`${id}/`), x).toBe(true);
        expect(world.layouts.lines.some((l) => l.set === main), x).toBe(true);
        expect(isPageSeat(x)).toBe(true);
        expect(SET_SPECS[x].lo, x).toBeGreaterThanOrEqual(Math.max(100, SET_SPECS[main].lo));
        expect(SET_SPECS[x].split, x).toBeUndefined();
        expect(pageOf(world, x), x).toBe(pageOf(world, main));
        expect(SET_SPECS[x].object, x).toBe(SET_SPECS[main].object);
        expect(seatIn(world, x, '三年後的大雪').carrierId, x).toBe(seatIn(world, main, '三年後的大雪').carrierId);
        expect(seatsDiffer(seatIn(world, main, '三年後的大雪'), seatIn(world, x, '三年後的大雪')), x).toBe(true);
      }
    }
  });

  it('a seat is offered only where the line keeps its least type, inside the safe area, off its page\'s graphics; never the longest line', () => {
    for (const id of NEW) {
      const all = offered(id);
      expect(all.length, id).toBeGreaterThan(0);
      for (const { x, font, text } of all) {
        const laid = laidSeat(text, x, { font })!;
        const at = `${x} ${font} ${text}`;
        expect(laid.size, at).toBeGreaterThanOrEqual(SET_SPECS[x].lo);
        expect(laid.boxPx.x0, at).toBeGreaterThanOrEqual(SAFE_X - 0.5);
        expect(laid.boxPx.x1, at).toBeLessThanOrEqual(1920 - SAFE_X + 0.5);
        expect(laid.boxPx.y0, at).toBeGreaterThanOrEqual(SAFE_Y - 0.5);
        expect(laid.boxPx.y1, at).toBeLessThanOrEqual(1080 - SAFE_Y + 0.5);
        for (const p of [...laid.protect, ...(compositionsOf(id)!.protectedRegion ?? [])]) expect(boxesMeet(laid.box, p), at).toBe(false);
      }
      for (const main of mains(id)) expect(pageSeatsFor(TEXTS.at(-1)!, main, id, 'Huninn'), main).toEqual([]);
    }
  });

  it('a seat draws nothing its page does not: it differs from its set only in place, size, rows, the carrier\'s size round the words and the page graphics it keeps off', () => {
    // (popart's balloon and caption are drawn round the words: their pad and least size are the carrier's size, not a new part)
    const PLACE = new Set(['at', 'ax', 'ay', 'flush', 'stair', 'tilt', 'share', 'tall', 'hi', 'lo', 'rows', 'clear', 'samePage', 'pad', 'fill']);
    for (const id of NEW)
      for (const x of pageSeatsOf(id)) {
        const [seat, base] = [SET_SPECS[x] as unknown as Record<string, unknown>, SET_SPECS[SET_SPECS[x].samePage!] as unknown as Record<string, unknown>];
        for (const k of new Set([...Object.keys(seat), ...Object.keys(base)]))
          if (!PLACE.has(k) && k !== 'split') expect(JSON.stringify(seat[k]), `${x} ${k}`).toBe(JSON.stringify(base[k]));
      }
  });

  it('popart: a balloon seat\'s whole balloon, keyline and short wide tail stay inside its own panel, the words inside the balloon\'s rim; a caption box and its shadow inside the panel', () => {
    let n = 0;
    for (const { x, main, font, text } of offered('popart')) {
      const spec = SET_SPECS[x];
      const b = laidSeat(text, x, { font })!.boxPx;
      const block = { cx: (b.x0 + b.x1) / 2 - 960, cy: 540 - (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0 };
      const c = carrierBox(spec, block)!;
      const [ox, oy] = [960 + block.cx + c.x, 540 - (block.cy + c.y)];
      const o = { x0: ox - c.ow / 2, y0: oy - c.oh / 2, x1: ox + c.ow / 2, y1: oy + c.oh / 2 };
      const [px0, py0, px1, py1] = POP_PANELS[main].own.map((v, i) => v * (i % 2 ? 1080 : 1920));
      const at = `${x} ${font} ${text}`;
      const line = POP_TAIL.line / 2;
      if (spec.object === 'pop-caption') {
        expect([o.x0 - 3 >= px0, o.y0 - 3 >= py0, o.x1 + POP_SHADOW <= px1, o.y1 + POP_SHADOW <= py1], at).toEqual([true, true, true, true]);
      } else {
        // (world-b3-popart balloon: the ellipse fills the object less 4 px, a 16 px keyline, the tail render/balloon-tail's wedge)
        const [cx, cy, rx, ry] = [ox, oy, c.ow / 2 - 4, c.oh / 2 - 4];
        const dir = spec.object === 'pop-balloon' ? -1 : 1;
        const { tip } = wedgeTail(cx, cy, rx, ry, [cx + dir * (rx * 0.62 + 40), cy + ry + 40]);
        expect([o.x0 - line >= px0, o.y0 - line >= py0, o.x1 + line <= px1, o.y1 + line <= py1, tip[1] + line <= py1, tip[0] - line >= px0, tip[0] + line <= px1], at).toEqual([true, true, true, true, true, true, true]);
        const [ex, ey] = [rx - line, ry - line];
        for (const [qx, qy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) expect(((qx - ox) / ex) ** 2 + ((qy - oy) / ey) ** 2, `${at} corner`).toBeLessThan(1);
      }
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });

  it('midcentury: the words never leave the plane they are read on — seats only on the dusk page (its ground), keeping its inks and what it reads on; none on the fixed cut and sleeve bars or the planes', () => {
    expect(mains('midcentury')).toEqual(['midcentury/dusk']);
    for (const x of pageSeatsOf('midcentury')) {
      const [s, d] = [SET_SPECS[x], SET_SPECS['midcentury/dusk']];
      expect([s.ink, s.on, s.under, s.surface, s.object], x).toEqual([d.ink, d.on, d.under, d.surface, d.object]);
      expect(s.clear, x).toEqual(d.clear);
    }
    for (const { x, font, text } of offered('midcentury')) for (const p of laidSeat(text, x, { font })!.protect) expect(boxesMeet(laidSeat(text, x, { font })!.box, p), `${x} ${font} ${text}`).toBe(false);
  });
});

const SONGS = [['out/db/yt_w_fCuUR3lEs/song.json', 'out/research/instant/plans/nun/meaning.json'], ['out/db/yt_5i50aTB7JFo/song.json', 'out/research/instant/plans/snow/meaning.json']];
const onDisk = SONGS.every(([s, m]) => existsSync(s) && existsSync(m));

describe.skipIf(!onDisk)('phase 4d on real songs (雙截棍, 三年後的大雪)', { timeout: 60000 }, () => {
  const songs = onDisk ? SONGS.map(([s, m]) => [JSON.parse(readFileSync(s, 'utf8')), JSON.parse(readFileSync(m, 'utf8'))]) : [];
  const runs = new Map<string, ReturnType<typeof freeJob>[]>();
  const style = (id: string) => FREE_STYLES.find((s) => s.id === id)!;
  const wired = (id: string, seed = 0, jointHolds = false) => {
    const k = `${id}|${seed}|${jointHolds}`;
    if (!runs.has(k)) runs.set(k, songs.map(([song, meaning]) => freeJob(song, { style: style(id), seed, meaning, worldEvents: true, jointHolds })));
    return runs.get(k)!;
  };
  const own = (fs: ReturnType<typeof freeJob>[]) => fs.flatMap((f) => f.treatment.worldEvents!.events.filter((x) => x.kind === 'layout-seat' && !x.fixed && x.scope !== 'in-line'));

  for (const id of NEW)
    it(`${id}: the same seed the same table; the final draw matches it; no switch of the scheduler's own inside a line; every page handoff the page's own`, () => {
      wired(id).forEach((f, k) => {
        const [song, meaning] = songs[k];
        const table = f.treatment.worldEvents!;
        expect(table.source).toBe('declared');
        expect(JSON.stringify(freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(table));
        expect(JSON.stringify(freeJob(song, { style: style(id), seed: 1, meaning, worldEvents: true }).treatment.worldEvents)).toBe(JSON.stringify(freeJob(song, { style: style(id), seed: 1, meaning, worldEvents: true }).treatment.worldEvents));
        expect(verifyWorldEvents(f.job, style(id).world, table)).toEqual([]);
        expect(table.warnings.filter((w) => w.reason.startsWith('final check'))).toEqual([]);
        expect(table.events.filter((e) => e.scope === 'in-line' && !e.fixed && e.kind !== 'keep')).toEqual([]);
        // (the scheduler lays no handoff of its own: only the page's Q4 linked move, kept)
        expect(table.events.filter((e) => e.kind === 'page-handoff' && !e.fixed)).toEqual([]);
      });
    });

  it('midcentury: the scheduler changes seat across lines on its own (holds-first)', () => {
    expect(own(wired('midcentury')).length).toBeGreaterThan(0);
  });

  it('popart: holds-first pins every line of both songs (a Q2 hold, a blown-up word, a set piece or a shared shot), so the scheduler keeps the composer\'s seats; with Q1 and Q2 arbitrated together it reseats, onto a same-page seat on some seeds', () => {
    songs.forEach(([song], k) => {
      const f = wired('popart')[k];
      const input = fromJob(f.job, song, style('popart').world, { seed: 0 });
      expect(input.lines.filter((l) => !l.pinned).map((l) => l.id), `song ${k}`).toEqual([]);
    });
    expect(own(wired('popart'))).toEqual([]);
    expect(own(wired('popart', 0, true)).length).toBeGreaterThan(0);
    expect([0, 1, 2].flatMap((seed) => own(wired('popart', seed, true))).some((e) => isPageSeat(e.seatAfter))).toBe(true);
  });

  // popart: a screen of dots re-centred round the next line (the strip reads the line's box) and midcentury: a bar of
  // another colour under it (the cut page's second bar for a two-phrase line, the scheme's inks) are no cut: a counted
  // switch is one where the laid reading composition differs; the same seat stays a keep however its page is repainted
  for (const [id, what] of [['popart', 'a dot-pattern change alone'], ['midcentury', 'a colour-plane change alone']] as const)
    it(`${id}: ${what} is no cut — every counted seat change differs on the laid boxes; a line on the same seat is never counted`, () => {
      let counted = 0;
      let kept = 0;
      // (popart reseats only with Q1 and Q2 arbitrated together: holds-first pins every line, above)
      wired(id, 0, id === 'popart').forEach((f, k) => {
        const [song] = songs[k];
        const world = worldOf(id);
        const faces = jobFaces(f.job);
        const text = (lineId: string) => song.cues.find((c: { id: string }) => c.id === lineId).text as string;
        const es = f.treatment.worldEvents!.events;
        for (const e of es.filter((x) => x.kind === 'layout-seat' && !x.fixed && x.scope !== 'in-line')) {
          const i = es.indexOf(e);
          const prev = [...es.slice(0, i)].reverse().find((x) => x.lineIds.at(-1) !== e.lineIds.at(-1));
          if (!prev) continue;
          expect(seatsDiffer(seatIn(world, e.seatBefore, text(prev.lineIds.at(-1)!), faces), seatIn(world, e.seatAfter, text(e.lineIds.at(-1)!), faces)), e.id).toBe(true);
          counted++;
        }
        const same = es.filter((e) => e.kind === 'keep' && e.seatBefore === e.seatAfter);
        kept += same.length;
        expect(countCuts(same, [-1, 1e4]).cuts).toBe(0);
      });
      expect(counted).toBeGreaterThan(0);
      expect(kept).toBeGreaterThan(0);
    });

  it('midcentury: every line the composer or the scheduler lays on the cut, cut-r or sleeve bars stays on its bar, with its padding, clear of the key plate lines (off and on)', () => {
    let n = 0;
    setWordSafe(true);
    songs.forEach(([song, meaning]) => {
      for (const f of [freeJob(song, { style: style('midcentury'), seed: 0, meaning }), wired('midcentury')[songs.findIndex(([s]) => s === song)]]) {
        const face = jobFaces(f.job);
        setWordSafe(true);
        for (const c of f.job.treatment.cues as { cueId: string; world?: { set?: string } }[]) {
          const set = c.world?.set;
          if (!set || !['midcentury/cut', 'midcentury/cut-r', 'midcentury/sleeve'].includes(set)) continue;
          const text = song.cues.find((x: { id: string }) => x.id === c.cueId).text as string;
          const b = blockOf(text.replace(/[\s　]+/g, ' ').trim(), SET_SPECS[set], layoutMeasure(face(text)));
          expect(b.bandMiss, `${set} ${text}`).toBeUndefined();
          expect(bandFit(b, SET_SPECS[set]).ok, `${set} ${text}`).toBe(true);
          n++;
        }
      }
    });
    setWordSafe(false);
    expect(n).toBeGreaterThan(0);
  });

  it('midcentury, claymation, scrapbook on the gate\'s other songs (scheduler off): a line no band of a set can hold never gets that set (choroin\'s 21-character line went to the one-row sleeve when no other set of its level took 21)', () => {
    const more = [['out/db/yt_hCCskTJwvuc/song.json', 'out/research/instant/plans/choroin/meaning.json'], ['out/db/yt_b3GCfyNKeLs/song.json', 'out/research/instant/plans/tsuzuki/meaning.json'], ['out/db/yt_iwYXfOhcsYI/song.json', 'out/research/instant/plans/tenmon/meaning.json']].filter(([a, b]) => existsSync(a) && existsSync(b));
    let n = 0;
    // (the renderer and the composer break lines at word-safe places, render/engine setWordSafe)
    setWordSafe(true);
    for (const [sf, mf] of more) {
      const [song, meaning] = [JSON.parse(readFileSync(sf, 'utf8')), JSON.parse(readFileSync(mf, 'utf8'))];
      for (const id of ['midcentury', 'claymation', 'scrapbook']) {
        const f = freeJob(song, { style: style(id), seed: 0, meaning });
        const face = jobFaces(f.job);
        // (freeJob leaves word-safe breaks off when it is done)
        setWordSafe(true);
        for (const c of f.job.treatment.cues as { cueId: string; world?: { set?: string } }[]) {
          const set = c.world?.set;
          if (!set || !SET_SPECS[set]?.bands) continue;
          const text = (song.cues.find((x: { id: string }) => x.id === c.cueId).text as string).replace(/[\s　]+/g, ' ').trim();
          expect(blockOf(text, SET_SPECS[set], layoutMeasure(face(text))).bandMiss, `${id} ${set} ${text}`).toBeUndefined();
          n++;
        }
      }
    }
    setWordSafe(false);
    expect(n).toBeGreaterThan(0);
  });

  it('by default (scheduler off) both draw exactly as before: no same-page seat is offered or drawn', () => {
    for (const id of NEW)
      for (const [song, meaning] of songs) {
        const plain = freeJob(song, { style: style(id), seed: 0, meaning });
        const before = freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: false });
        expect(plain.treatment.worldEvents?.source, id).toBe('declared-off');
        const { worldEvents: _w, ...rest } = plain.job.treatment;
        const drawn = JSON.stringify(rest);
        expect(drawn, id).toBe(JSON.stringify(before.job.treatment));
        for (const x of pageSeatsOf(id)) expect(drawn.includes(`"${x}"`), `${id} ${x}`).toBe(false);
      }
  });
});
