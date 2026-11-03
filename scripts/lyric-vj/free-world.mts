// The free tier on a style world, offline: the treatment freeJob builds in the browser, written for render.mts, so a
// free video on a world can stand beside the paid tiers on the same world (plan step 7). Spends nothing.
// npx tsx scripts/lyric-vj/free-world.mts --song <song.json> --style silk [--reading meaning.json] [--seed 0] --out <dir>
// then: npx tsx scripts/lyric-vj/render.mts --song <song.json> --treatment <dir>/treatment.json --assets <dir>/assets.json ...
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, style: { type: 'string' }, reading: { type: 'string' }, seed: { type: 'string' }, out: { type: 'string' } } });
const style = FREE_STYLES.find((s) => s.id === a.style);
if (!style) throw new Error(`no such style: ${a.style}`);
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const { job, plan, palette, calm, treatment } = freeJob(song, { style, seed: a.seed === undefined ? undefined : Number(a.seed), meaning: a.reading ? JSON.parse(readFileSync(a.reading, 'utf8')) : undefined });
mkdirSync(a.out!, { recursive: true });
// render.mts takes the face from the treatment when no --font is given
writeFileSync(join(a.out!, 'treatment.json'), JSON.stringify({ ...treatment, design: { ...treatment.design, font: job.fonts!.family } }));
writeFileSync(join(a.out!, 'assets.json'), '{}');
writeFileSync(join(a.out!, 'plan.json'), JSON.stringify(plan, null, 1));
console.log(`free-world: ${style.id} scheme ${palette}, font ${job.fonts!.family}, ${plan.shots.length} shots, ${treatment.graphics!.sections.length} cuts${calm ? ', calm' : ''}`);
