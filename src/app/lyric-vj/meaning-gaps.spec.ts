// Stale readings and the Q3 / Q5 wiring fed by hand-written readings: a stored meaning.json written before the prompt
// asked for `moments` (or `keys`) is used as stored and reported, never re-asked ($0); the policies' candidates come
// only from the reading's own keys and moments, here fixtures, not the cache on disk.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { meaningGaps, type Meaning } from './lineplan-core';

describe('meaningGaps', () => {
  it('names each field the reading was never asked for', () => {
    expect(meaningGaps({ palette: 'tea', parts: [], keys: [] })).toEqual(['moments']);
    expect(meaningGaps({ palette: 'tea', parts: [], moments: [] })).toEqual(['keys']);
    expect(meaningGaps({ palette: 'tea', parts: [] })).toEqual(['keys', 'moments']);
  });

  it('treats an empty list as an answer and no reading as no gap', () => {
    expect(meaningGaps({ palette: 'tea', parts: [], keys: [], moments: [] })).toEqual([]);
    expect(meaningGaps(undefined)).toEqual([]);
    expect(meaningGaps(null)).toEqual([]);
  });
});

const DB = 'out/db/yt_5i50aTB7JFo/song.json';
const BASE = 'out/research/instant/plans/snow/meaning.json';
const haveOut = existsSync(DB) && existsSync(BASE);

describe.skipIf(!haveOut)('freeJob with fixture readings (三年後的大雪)', () => {
  const song = () => JSON.parse(readFileSync(DB, 'utf8'));
  // (only palette, ground, reading and parts come from the cache; keys and moments are written here)
  const base = (): Omit<Meaning, 'keys' | 'moments'> => {
    const { palette, ground, reading, parts } = JSON.parse(readFileSync(BASE, 'utf8')) as Meaning;
    return { palette, ground, reading, parts };
  };
  const KEYS: Meaning['keys'] = [
    { cue: 'c002', phrase: '我再也不在你身邊', why: 'fixture' },
    { cue: 'c013', phrase: '手沒牽好', why: 'fixture' },
    { cue: 'c020', phrase: '才想起', why: 'fixture' },
  ];
  const MOMENTS: NonNullable<Meaning['moments']> = [
    { cues: ['c009'], form: 'shape', variant: 'fall', word: '凋落的楓葉', evidenceCueId: 'c009', why: 'fixture: memory as a falling maple leaf' },
    { cues: ['c042', 'c043'], form: 'echo', variant: 'ghost', word: '三年後', evidenceCueId: 'c043', why: 'fixture: two lines sing the same words' },
  ];
  const style = (id: string) => FREE_STYLES.find((s) => s.id === id)!;
  const on = { scaleContrast: true, meaningMoments: true, worldEvents: true, meaningRef: 'fixture.json' } as const;

  it('draws a stale reading exactly as one that judged no moment, and reports the gap', () => {
    const stale = { ...base(), keys: KEYS } as Meaning;
    const none = { ...stale, moments: [] };
    for (const id of ['riso', 'notebook']) {
      for (const o of [{}, on]) {
        const a = freeJob(song(), { style: style(id), seed: 0, meaning: stale, ...o });
        const b = freeJob(song(), { style: style(id), seed: 0, meaning: none, ...o });
        expect(JSON.stringify(a.job)).toBe(JSON.stringify(b.job));
        expect(a.meaningGaps).toEqual(['moments']);
        expect(b.meaningGaps).toBeUndefined();
      }
    }
    const f = freeJob(song(), { style: style('riso'), seed: 0, meaning: stale, ...on });
    expect(f.policy!.moments!.reason).toBe('noMeaningCandidate');
  });

  it('takes a reading with no keys field without throwing, as one with no key', () => {
    const noKeys = { ...base(), moments: MOMENTS } as unknown as Meaning;
    const a = freeJob(song(), { style: style('riso'), seed: 0, meaning: noKeys, ...on });
    const b = freeJob(song(), { style: style('riso'), seed: 0, meaning: { ...noKeys, keys: [] }, ...on });
    expect(JSON.stringify(a.job)).toBe(JSON.stringify(b.job));
    expect(a.meaningGaps).toEqual(['keys']);
  });

  it('feeds the scale policy only the reading\'s own keys', () => {
    const seats = (keys: Meaning['keys']) => freeJob(song(), { style: style('riso'), seed: 0, meaning: { ...base(), keys, moments: [] }, ...on }).policy!.scale!.ranked.flat();
    const keyed = seats(KEYS).filter((s) => s.scale.source === 'meaning');
    expect(keyed.length).toBeGreaterThan(0);
    for (const s of keyed) expect(KEYS.some((k) => k.cue === s.lineId)).toBe(true);
    expect(seats([]).some((s) => s.scale.source === 'meaning')).toBe(false);
  });

  it('ranks the reading\'s own moments, every approved one traceable to its fixture candidate, at most two', () => {
    const meaning = { ...base(), keys: KEYS, moments: MOMENTS } as Meaning;
    let realized = 0;
    for (const id of ['riso', 'notebook', 'silk', 'screentone']) {
      const f = freeJob(song(), { style: style(id), seed: 0, meaning, ...on });
      const plan = f.policy!.moments!;
      expect(plan.candidates.map((c) => c.meaningRef)).toEqual(['fixture.json#moments[0]', 'fixture.json#moments[1]']);
      const approved = f.policy!.decisions.filter((d) => d.source === 'Q5' && d.approved);
      expect(approved.length).toBeLessThanOrEqual(2);
      for (const d of approved) expect(['c009', 'c043']).toContain(d.lineId);
      const t = f.treatment as { signature?: { meaningRef?: string }[]; miniMoments?: { meaningRef: string }[] };
      const drawn = [...(t.signature ?? []).map((x) => x.meaningRef!), ...(t.miniMoments ?? []).map((x) => x.meaningRef)];
      for (const ref of drawn) expect(ref).toMatch(/^fixture\.json#moments\[[01]\]$/);
      realized += drawn.length + (f.treatment.cues as { world?: { moment?: unknown } }[]).filter((c) => c.world?.moment).length;
    }
    expect(realized).toBeGreaterThan(0);
  });
});
