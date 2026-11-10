// A sung line keeps its set from its first sung character to its end on every path, the default product included (owner
// 2026-11-10, docs/design-bar/cards/2026-11-10-no-inline-line-move.md, 2026-11-10-motivated-colour-pass.md): the composer's
// turn inside a long line keeps its cut (a ground behind still words), never its change of set.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import type { SongTimeline } from './timeline';
import { turnTakes } from './render/turn-rule';
import { turnChecks } from './world-events-adapter';
import { pageOf } from './world-shared';

type Line = { cueId: string; world?: { set: string; repose?: unknown[] } };
type Turn = { at?: number; repose?: boolean };
const turnsOf = (plan: unknown) => (plan as { shots: { cuts: Turn[] }[] }).shots.flatMap((s) => s.cuts.filter((x) => x.repose));

/** Long, fast lines a repose world used to move to a second set halfway through. */
function longLines(): SongTimeline {
  const text = '總在喧囂人群裡面找擁抱';
  const n = [...text].length;
  const cues = Array.from({ length: 14 }, (_, i) => ({ id: `c${i + 1}`, start: 3 + i * 4.5, end: 3 + i * 4.5 + 4.2, text, charStarts: Array.from({ length: n }, (_, k) => 3 + i * 4.5 + (4 * k) / n), charTimed: true }));
  const end = 3 + 14 * 4.5 + 2;
  return { title: 'long', duration: end, tempo: 128, beats: Array.from({ length: Math.ceil(end / 0.469) }, (_, i) => +(i * 0.469).toFixed(3)), downbeats: [], sections: [{ start: 0, end, type: 'chorus', energy: 0.8 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
}

describe('no change of set inside a sung line (default path)', () => {
  it('a line the composer would turn mid-line is laid as one set; the turn stays a ground cut', () => {
    const song = longLines();
    for (const id of ['spy', 'chalkboard', 'silk']) {
      const style = FREE_STYLES.find((s) => s.id === id)!;
      expect(style.world.pace.repose, id).toBe(true);
      const { treatment, plan } = freeJob(song, { style, seed: 0 });
      const lines = treatment.cues as unknown as Line[];
      expect(lines.filter((l) => l.world).length, id).toBeGreaterThan(0);
      expect(lines.filter((l) => l.world?.repose?.length), id).toEqual([]);
      // the turn the composer found inside a line is still there, as a cut only
      const turns = turnsOf(plan);
      expect(turns.length, id).toBeGreaterThan(0);
      for (const t of turns) expect(song.cues.some((c) => t.at! > c.start && t.at! < c.end), `${id} turn ${t.at} inside a line`).toBe(true);
    }
  });

  it('spy 大雪 (where the owner saw it) has no line changing set while sung, seeds 0-2', () => {
    const db = 'out/db/yt_5i50aTB7JFo/song.json';
    if (!existsSync(db)) return;
    const song = JSON.parse(readFileSync(db, 'utf8')) as SongTimeline;
    const meaning = existsSync('out/research/instant/plans/snow/meaning.json') ? JSON.parse(readFileSync('out/research/instant/plans/snow/meaning.json', 'utf8')) : undefined;
    const style = FREE_STYLES.find((s) => s.id === 'spy')!;
    for (const seed of [0, 1, 2]) {
      const f = freeJob(song, { style, seed, meaning, font: 'Huninn' });
      expect((f.job.treatment.cues as unknown as Line[]).filter((l) => l.world?.repose?.length), `seed ${seed}`).toEqual([]);
      const events = (f.treatment as { worldEvents?: { events: { kind: string; scope: string }[] } }).worldEvents?.events ?? [];
      expect(events.filter((e) => e.scope === 'in-line'), `seed ${seed}`).toEqual([]);
    }
  });

  it('card/pair stands on its page: a turn off it is refused by the rule, laid by no composer, and named by the final check', () => {
    const card = FREE_STYLES.find((s) => s.id === 'card')!;
    const slots = card.world.palette[0];
    const pages = new Set(card.world.layouts.lines.flatMap((l) => (l.ground ? [l.ground] : [])));
    const print = { ink: slots.ink, paper: slots.ground };
    expect(pageOf(card.world, 'card/pair')).toBe('card/pair');
    expect(turnTakes({ set: 'card/pair', page: 'card/pair', pages, fx: 'card/table', slots, ink: slots.ink, before: print, after: print })).toMatch(/stands on its page/);
    expect(turnTakes({ set: 'card/main', pages, fx: 'card/fan', slots, ink: slots.ink, before: print, after: print })).toMatch(/another set's page/);
    expect(turnTakes({ set: 'card/main', pages, fx: 'card/table', slots, ink: slots.ink, before: print, after: print })).toBeUndefined();
    // words standing on the ground directly (spy/low-slash has no carrier) read worse on a darker print after the turn;
    // words on their own carrier (card/main's plate) do not depend on it
    const flat = { ...slots, plate: '#ffffff', ground: '#ffffff' };
    expect(turnTakes({ set: 'spy/low-slash', pages, fx: 'spy/x', slots: flat, ink: '#222222', before: { ink: '#222222', paper: '#ffffff' }, after: { ink: '#222222', paper: '#555555' } })).toMatch(/worse/);
    expect(turnTakes({ set: 'card/main', pages, fx: 'card/table', slots, ink: slots.plateInk, before: print, after: { ink: slots.ink, paper: '#555555' } })).toBeUndefined();
    // the composer lays no turn under a card/pair line (tsuzuki, where the review found c011's second row lost on cream)
    const db = 'out/db/yt_b3GCfyNKeLs/song.json';
    if (!existsSync(db)) return;
    const song = JSON.parse(readFileSync(db, 'utf8')) as SongTimeline;
    const meaning = existsSync('out/research/instant/plans/tsuzuki/meaning.json') ? JSON.parse(readFileSync('out/research/instant/plans/tsuzuki/meaning.json', 'utf8')) : undefined;
    const { job, plan } = freeJob(song, { style: card, seed: 0, meaning });
    const turns = turnsOf(plan).map((t) => t.at!);
    const lines = job.treatment.cues as unknown as Line[];
    for (const l of lines.filter((x) => x.world?.set === 'card/pair')) {
      const c = song.cues.find((x) => x.id === l.cueId)!;
      expect(turns.filter((t) => t > c.start && t < c.end), l.cueId).toEqual([]);
    }
    expect(turnChecks(job, card.world, turns)).toEqual([]);
    // planted: the card/pair line's ground turned to the table halfway through is named
    const paired = lines.find((x) => x.world?.set === 'card/pair' && x.cueId === 'c011');
    expect(paired, 'c011 is still laid on card/pair').toBeTruthy();
    if (!paired) return;
    const c = song.cues.find((x) => x.id === paired.cueId)!;
    const at = +((c.start + c.end) / 2).toFixed(3);
    const tampered = structuredClone(job);
    const sections = (tampered.treatment as unknown as { graphics: { sections: { start: number; layers: { kind: string; fx?: string }[] }[] } }).graphics.sections;
    const under = [...sections].reverse().find((x) => x.start <= c.start)!;
    sections.push({ ...structuredClone(under), start: at, layers: under.layers.map((l) => (l.kind === 'kinetic' ? { ...l, fx: 'card/table' } : l)) });
    sections.sort((x, y) => x.start - y.start);
    expect(turnChecks(tampered, card.world, [at]).map((w) => w.reason).join(' ')).toMatch(/final check: turn: the set stands on its page card\/pair/);
  });
});
