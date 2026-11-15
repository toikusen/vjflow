// Plan-level check of the worlds the scheduler takes over by default (popart, midcentury; 2026-11-12): for each of the
// five measured songs × seeds, the default job (now scheduled) and the joint one, the final check's warnings in the
// event table and the verifiers run again on the drawn job (verifyWorldEvents with its pairs B/C checks, lightGapWarnings,
// jointChecks). Every count must be 0; also that the default job is byte for byte worldEvents true.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/enable-check.mts [--seeds 0,1,2] [--out file]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { jobFaces, jointChecks, lightGapWarnings, verifyWorldEvents } from '../../src/app/lyric-vj/world-events-adapter';

const SONGS: [string, string][] = [['nun', 'yt_w_fCuUR3lEs'], ['snow', 'yt_5i50aTB7JFo'], ['tsuzuki', 'yt_b3GCfyNKeLs'], ['choroin', 'yt_hCCskTJwvuc'], ['tenmon', 'yt_iwYXfOhcsYI']];
const { values: a } = parseArgs({ options: { seeds: { type: 'string', default: '0,1,2' }, out: { type: 'string' } } });
const rows: { world: string; song: string; seed: number; path: string; source?: string; sameAsQ1?: boolean; finalCheck: number; verify: number; lightGap: number; joint: number; events: number; holds: number; samples: string[] }[] = [];
for (const [name, db] of SONGS) {
  const song = JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  for (const id of ['popart', 'midcentury']) {
    const style = OFFERED_STYLES.find((s) => s.id === id)!;
    for (const seed of a.seeds!.split(',').map(Number)) {
      const def = freeJob(song, { style, seed, meaning });
      const q1 = freeJob(song, { style, seed, meaning, worldEvents: true });
      for (const [path, f] of [['default', def], ['joint', freeJob(song, { style, seed, meaning, jointHolds: true })]] as const) {
        const t = f.treatment.worldEvents!;
        const fc = t.warnings.filter((w) => w.reason.startsWith('final check'));
        const v = verifyWorldEvents(f.job, style.world, t, jobFaces(f.job));
        const lg = lightGapWarnings(f.job, t);
        const jc = jointChecks(f.job, style.world, t);
        rows.push({ world: id, song: name, seed, path, source: t.source, ...(path === 'default' ? { sameAsQ1: JSON.stringify(def.job) === JSON.stringify(q1.job) } : {}), finalCheck: fc.length, verify: v.length, lightGap: lg.length, joint: jc.length, events: t.events.filter((e) => e.kind !== 'keep').length, holds: (t.holds ?? []).length, samples: [...fc, ...v, ...lg, ...jc].slice(0, 3).map((w) => w.reason.slice(0, 160)) });
      }
    }
  }
}
const sum = (k: 'finalCheck' | 'verify' | 'lightGap' | 'joint') => rows.reduce((s, r) => s + r[k], 0);
const total = { jobs: rows.length, finalCheck: sum('finalCheck'), verify: sum('verify'), lightGap: sum('lightGap'), joint: sum('joint'), notScheduled: rows.filter((r) => r.source !== 'declared').length, defaultNotQ1: rows.filter((r) => r.sameAsQ1 === false).length };
if (a.out) writeFileSync(a.out, JSON.stringify({ total, rows }, null, 1));
console.log(JSON.stringify(total));
process.exitCode = total.finalCheck + total.verify + total.lightGap + total.joint + total.notScheduled + total.defaultNotQ1 ? 1 : 0;
