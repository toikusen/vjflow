// The browser's plan path against the offline scripts: the five test songs through freeJob's treatment must equal what
// typeplan.mts --plan wrote. npx tsx scripts/lyric-vj/free-plan.check.mts out/research/instant/plans
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { composerBase, composePlan, PALETTES } from '../../src/app/lyric-vj/lineplan-core';
import { composerTreatment, isCalm, SIDED } from '../../src/app/lyric-vj/free-plan';
import { SIDED as TYPE_SIDED } from './typehelp.mts';

assert.deepEqual([...SIDED], [...TYPE_SIDED], 'SIDED follows typehelp');
const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const root = process.argv[2];
const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
for (const [name, id] of Object.entries(SONGS)) {
  const dir = join(root, name);
  const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(join(dir, 'meaning.json'), 'utf8'));
  const base = JSON.parse(readFileSync(join(dir, 'base.json'), 'utf8'));
  const offline = JSON.parse(readFileSync(join(dir, 'final/treatment.json'), 'utf8'));
  const t0 = performance.now();
  const { plan } = composePlan(song, meaning, isCalm(song.cues));
  const planMs = performance.now() - t0;
  const p = PALETTES[meaning.palette];
  const t1 = performance.now();
  const got = composerTreatment(song, plan as never, base, p);
  assert.deepEqual(clean(got), clean(offline), `${name}: treatment differs`);
  console.log(`${name}: same treatment as typeplan.mts (plan ${planMs.toFixed(1)} ms, treatment ${(performance.now() - t1).toFixed(1)} ms)`);
}
