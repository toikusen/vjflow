// The noLineGrow experiment knob (Codex 2026-11-10 pairs A): off is the default job byte for byte; on takes away only the
// world's line-grow holds, every other part of the job the same (scripts/lyric-vj/deco-grow-pair.mts).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';

const SNOW = 'out/db/yt_5i50aTB7JFo/song.json';
const MEANING = 'out/research/instant/plans/snow/meaning.json';
type Row = { cueId: string; world?: Record<string, unknown> };
const HOLD_KEYS = /^beat/;
/** The job with every hold record taken away: the cues' beat* fields, the event table's holds and its hold warnings. */
const withoutHolds = (job: unknown) => {
  const j = structuredClone(job) as { treatment: { cues: Row[]; worldEvents?: { holds?: unknown[]; warnings?: { inputs: string[] }[] } } };
  for (const c of j.treatment.cues) if (c.world) for (const k of Object.keys(c.world)) if (HOLD_KEYS.test(k)) delete c.world[k];
  if (j.treatment.worldEvents) {
    j.treatment.worldEvents.holds = [];
    j.treatment.worldEvents.warnings = (j.treatment.worldEvents.warnings ?? []).filter((w) => !w.inputs.some((x) => x.startsWith('Q2 ')));
  }
  return JSON.stringify(j);
};
const kindsOf = (job: { treatment: { cues: unknown[] } }) => (job.treatment.cues as Row[]).map((c) => (c.world?.['beat'] as { kind?: string } | undefined)?.kind ?? null);

const HAS_DATA = existsSync(SNOW) && existsSync(MEANING);
describe.skipIf(!HAS_DATA)('noLineGrow knob', () => {
  // (skipIf still runs this body: read only when the uncommitted out/ data is there)
  const song = HAS_DATA ? JSON.parse(readFileSync(SNOW, 'utf8')) : null;
  const meaning = HAS_DATA ? JSON.parse(readFileSync(MEANING, 'utf8')) : null;
  const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;

  it('unset or false: byte for byte the default job, which grows lines', () => {
    const base = freeJob(song, { style, seed: 0, meaning, font: 'Huninn' });
    expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, font: 'Huninn', noLineGrow: false }).job)).toBe(JSON.stringify(base.job));
    expect(kindsOf(base.job)).toContain('line-grow');
  });

  it('true: no line-grow, every other hold where it was, the job without its hold records unchanged', () => {
    const base = freeJob(song, { style, seed: 0, meaning, font: 'Huninn' });
    const off = freeJob(song, { style, seed: 0, meaning, font: 'Huninn', noLineGrow: true });
    const [a, b] = [kindsOf(base.job), kindsOf(off.job)];
    expect(b).not.toContain('line-grow');
    // (a line that did not grow keeps its own hold; a line that grew keeps or takes another kind the world allows)
    a.forEach((k, i) => { if (k !== 'line-grow') expect(b[i], `cue ${i}`).toBe(k); else expect(b[i], `cue ${i}`).not.toBe('line-grow'); });
    expect(withoutHolds(off.job)).toBe(withoutHolds(base.job));
  });

  it('VJ_NO_LINE_GROW=1 is the same as the option; an explicit false wins over it', () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const opt = JSON.stringify(freeJob(song, { style, seed: 0, meaning, font: 'Huninn', noLineGrow: true }).job);
    const base = JSON.stringify(freeJob(song, { style, seed: 0, meaning, font: 'Huninn' }).job);
    const was = env['VJ_NO_LINE_GROW'];
    env['VJ_NO_LINE_GROW'] = '1';
    try {
      expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, font: 'Huninn' }).job)).toBe(opt);
      expect(JSON.stringify(freeJob(song, { style, seed: 0, meaning, font: 'Huninn', noLineGrow: false }).job)).toBe(base);
    } finally {
      if (was === undefined) delete env['VJ_NO_LINE_GROW']; else env['VJ_NO_LINE_GROW'] = was;
    }
  });
});
