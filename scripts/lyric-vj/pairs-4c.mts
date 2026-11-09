// Owner's blind paired labelling for Q1 phase 4c (Codex 2026-11-10 r3 §5): holds-first (scheduler on, joint off: the
// phase-4b contract) against joint (jointHolds), same song, timecode, seed 0 and font, each side its own treatment.
// Which side is which is drawn at random per pair and written only to the key file (never into the owner's folder).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/pairs-4c.mts --out out/research/q1-1109/pairs-4c --key out/research/q1-1109/pairs-4c-key.json
import { randomInt } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts } from '../../src/app/lyric-vj/world-events';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo' };
/** (world, song, from, to, why): the art-deco segment the owner accepted, two where holds were heavily replaced, one whose gate counts pass only on the 2 % slack. */
const PAIRS: [string, string, number, number, string][] = [
  ['art-deco', 'snow', 90, 150, 'owner-accepted art-deco slow segment (card 2026-11-10-art-deco-slow-inline-density)'],
  ['file', 'nun', 70, 130, 'holds heavily replaced (21 -> 2 in phase 4c)'],
  ['card', 'snow', 60, 120, 'holds heavily replaced (17 -> 7 in phase 4c), switches up'],
  ['spy', 'snow', 135, 190, 'reading gate: spy cross 0 -> 5 under joint, passing only on the 2 % slack (snow c044/c045 175.7–180.1)'],
];
const FONT = 'Huninn';
const { values: a } = parseArgs({ options: { out: { type: 'string' }, key: { type: 'string' } } });
const key: Record<string, unknown> = { commit: execSync('git rev-parse --short HEAD').toString().trim(), font: FONT, seed: 0, note: 'holdsFirst = freeJob worldEvents:true (joint off); joint = worldEvents:true jointHolds:true. Never copied to the owner folder.', pairs: [] as unknown[] };
PAIRS.forEach(([world, name, from, to, why], k) => {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const style = OFFERED_STYLES.find((s) => s.id === world)!;
  const sides = { holdsFirst: freeJob(song, { style, seed: 0, meaning, worldEvents: true, font: FONT }), joint: freeJob(song, { style, seed: 0, meaning, worldEvents: true, jointHolds: true, font: FONT }) };
  const first = randomInt(2) === 0 ? 'holdsFirst' : 'joint';
  const labels = { 甲: first, 乙: first === 'joint' ? 'holdsFirst' : 'joint' } as const;
  const pair = `${k + 1}`;
  for (const [label, side] of Object.entries(labels)) {
    const dir = join(a.out!, `${pair}-${label}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'treatment.json'), JSON.stringify(sides[side].treatment));
  }
  const t = (s: keyof typeof sides) => { const w = sides[s].treatment.worldEvents!; const inClip = (id: string) => { const c = song.cues.find((x: { id: string }) => x.id === id); return c && c.start >= from && c.start < to; }; return { cuts: countCuts(w.events, [from, to]).cuts, holds: (sides[s].job.treatment.cues as { cueId: string; world?: { beat?: unknown } }[]).filter((c) => inClip(c.cueId) && c.world?.beat).length, contract: w.warnings.filter((x) => x.reason.startsWith('final check')).length }; };
  (key['pairs'] as unknown[]).push({ pair, world, song: name, db: IDS[name], window: [from, to], why, labels, counts: { holdsFirst: t('holdsFirst'), joint: t('joint') } });
});
writeFileSync(a.key!, JSON.stringify(key, null, 1));
console.log('pairs', PAIRS.length);
