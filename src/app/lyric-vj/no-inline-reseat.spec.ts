// A sung line keeps its set from its first sung character to its end on every path, the default product included (owner
// 2026-11-10, docs/design-bar/cards/2026-11-10-no-inline-line-move.md, 2026-11-10-motivated-colour-pass.md): the composer's
// turn inside a long line keeps its cut (a ground behind still words), never its change of set.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import type { SongTimeline } from './timeline';

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
});
