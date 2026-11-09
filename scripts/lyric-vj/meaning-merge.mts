// A new reading cache from an existing meaning.json and a re-read beside it, taking ONLY `keys` and `moments` from the
// re-read (Codex 2026-11-09 §4): reading, palette, ground and parts stay the base's, so Q1/Q2 plans keep their colours
// and sections. The output records where both halves came from; meaning.json itself is never written.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/meaning-merge.mts [--song nun] [--overlay-suffix haiku-1109b]
//     [--out-suffix merged-1109] [--model claude-haiku-5-5] [--effort medium] [--date 2026-11-09]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Meaning } from './lineplan-core.mts';

export interface MergeSource { base: string; overlay: string; model: string; effort: string; date: string }

/** The base reading with the overlay's keys and moments (empty when the overlay has none) and a `source` record. */
export function mergeMeaning(baseText: string, overlay: Meaning, meta: Omit<MergeSource, 'base'>): Meaning & { source: MergeSource } {
  const base = JSON.parse(baseText) as Meaning;
  return {
    ...base,
    keys: overlay.keys ?? [],
    moments: overlay.moments ?? [],
    source: { base: createHash('sha256').update(baseText).digest('hex'), ...meta },
  };
}

if (process.argv[1]?.endsWith('meaning-merge.mts')) {
  const SONGS = ['nun', 'snow', 'tsuzuki', 'choroin', 'tenmon'];
  const { values: a } = parseArgs({ options: {
    song: { type: 'string' }, 'overlay-suffix': { type: 'string', default: 'haiku-1109b' }, 'out-suffix': { type: 'string', default: 'merged-1109' },
    model: { type: 'string', default: 'claude-haiku-5-5' }, effort: { type: 'string', default: 'medium' }, date: { type: 'string', default: '2026-11-09' },
  } });
  for (const song of SONGS.filter((s) => !a.song || s === a.song)) {
    const dir = `out/research/instant/plans/${song}`;
    const overlayPath = `${dir}/meaning.${a['overlay-suffix']}.json`;
    const merged = mergeMeaning(readFileSync(`${dir}/meaning.json`, 'utf8'), JSON.parse(readFileSync(overlayPath, 'utf8')), { overlay: overlayPath, model: a.model!, effort: a.effort!, date: a.date! });
    const out = `${dir}/meaning.${a['out-suffix']}.json`;
    writeFileSync(out, JSON.stringify(merged, null, 1));
    console.log(`${song}: ${out} keys ${merged.keys.length} moments ${merged.moments?.length ?? 0} base ${merged.source.base.slice(0, 12)}`);
  }
}
