// A line the signature layer takes over is drawn by it (phase 4d round 5): the echo's answering line was a blank in the
// reading gate because the gate's frame without the words still carried it (main.ts grabAt now composes the moments only
// with the lyrics shown). Here, on every offered world's plan of 三年後的大雪 (its echo c042 → c043 is planned in each),
// the echo form stamps every character of the answering line in ink while the line is sung and read.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from '../free-plan';
import { OFFERED_STYLES } from '../free-styles';
import { buildMore, type Kit } from './signature-forms';
import { mixHex, partsOf, type Inks } from './signature';
import { ownCues, type SignatureMoment } from '../signature-moments';

const SONG = 'out/db/yt_5i50aTB7JFo/song.json';
const MEANING = 'out/research/instant/plans/snow/meaning.json';
const onDisk = existsSync(SONG) && existsSync(MEANING);
const INKS: Inks = { ink: '#111111', paper: '#f5efe4', accent: '#b3261e', board: '#ffffff', boardInk: '#000000', ghost: '#888888', press: '#7d89a0', core: '#eeeeee' };

describe.skipIf(!onDisk)('a line handed to the signature layer is drawn by it, on every world (三年後的大雪 echo)', { timeout: 120000 }, () => {
  const song = onDisk ? JSON.parse(readFileSync(SONG, 'utf8')) : undefined;
  const meaning = onDisk ? JSON.parse(readFileSync(MEANING, 'utf8')) : undefined;
  it('each offered world: the echo\'s answering line has every character stamped in ink at its sung time, the earlier line surfacing under it', () => {
    let worlds = 0;
    for (const style of OFFERED_STYLES) {
      const f = freeJob(song, { style, seed: 0, meaning });
      const echoes = ((f.treatment as { signature?: SignatureMoment[] }).signature ?? []).filter((m) => m.form === 'echo');
      for (const m of echoes) {
        const stamps: { ch: string; ink: string; alpha: number }[] = [];
        const glyphs: { alpha: number }[] = [];
        const ctx = { globalAlpha: 1, save() {}, restore() {} } as unknown as CanvasRenderingContext2D;
        const cueOf = (id: string) => { const c = song.cues.find((x: { id: string }) => x.id === id); return { id, text: c.text, start: c.start, end: c.end }; };
        const kit = {
          x: ctx, job: f.job, family: 'Huninn', grain: 0, song: 0,
          glyph: () => glyphs.push({ alpha: ctx.globalAlpha }),
          stampIn: (_c: unknown, ch: string, _a: number, _b: number, _s: number, at: number, t: number, ink: string) => { if (t >= at) stamps.push({ ch, ink, alpha: ctx.globalAlpha }); },
          shadowed: (d: () => void) => d(), alive: () => 1, metric: () => ({}),
          exitOf: (id: string) => ({ at: cueOf(id).end + 1, dur: 0.28 }), cueOf, nextStart: (id: string) => cueOf(id).end + 1,
          drawAsides: () => {}, partsOf, inksAt: () => INKS, boardPaper: () => undefined, mixHex, canvas: () => undefined,
        } as unknown as Kit;
        const built = buildMore(kit, m);
        const id = ownCues(m).at(-1)!;
        const cue = cueOf(id);
        built.draw((cue.start + cue.end) / 2 + 0.6, INKS);
        const text = [...partsOf(cue.text, m.sung[id], m.word).main].filter((c) => !/\s/.test(c.ch));
        expect(stamps.filter((s) => s.ink === INKS.ink && s.alpha > 0).length, `${style.id} ${id}`).toBe(text.length);
        expect(glyphs.some((g) => g.alpha > 0), `${style.id} earlier line`).toBe(true);
        worlds++;
      }
    }
    expect(worlds).toBe(OFFERED_STYLES.length);
  });
});
