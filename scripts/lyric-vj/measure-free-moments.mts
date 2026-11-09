// Free signature moments, PLAN-LEVEL ONLY (Q5 phase 1, docs/research/2026-11-09-q5-phase1.md): counted from the policy's
// chosen candidates (moment-policy.ts rankMoments), nothing rendered, nothing wired into the plan, so `realizedMoments`
// here means PLANNED. Per song × world (5 songs with stored readings × 45 OFFERED_STYLES, seed 0):
//   today  — free-plan.ts freeMoments taken apart stage by stage (moment-policy-adapter.ts todayGate): world-independent;
//   policy — rankMoments on the same plan: realizedMoments 0–2, eliminations per floor, the reason when 0.
// No API calls by construction: the script imports only node:fs / node:path / node:util / node:crypto and this repo's
// pure modules; the reading is the meaning.json on disk (its sha256 is written into the report).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-free-moments.mts [--world silk] [--out out/research/q5-1109/moments.json]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { momentCapsOf } from '../../src/app/lyric-vj/moment-caps-draft';
import { MOMENT_FLOORS, rankMoments } from '../../src/app/lyric-vj/moment-policy';
import { momentInputOf, todayGate } from '../../src/app/lyric-vj/moment-policy-adapter';

const SONGS = [
  { song: 'nun', db: 'yt_w_fCuUR3lEs' },
  { song: 'snow', db: 'yt_5i50aTB7JFo' },
  { song: 'tsuzuki', db: 'yt_b3GCfyNKeLs' },
  { song: 'choroin', db: 'yt_hCCskTJwvuc' },
  { song: 'tenmon', db: 'yt_iwYXfOhcsYI' },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, out: { type: 'string' } } });
const seed = Number(a.seed);
const styles = OFFERED_STYLES.filter((s) => !a.world || s.id === a.world);
const sum = (rs: Record<string, number>[]) => rs.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r)) m[k] = (m[k] ?? 0) + v; return m; }, {});

const songs = SONGS.map((s) => {
  const path = `out/research/instant/plans/${s.song}/meaning.json`;
  const text = readFileSync(path, 'utf8');
  const meaning = JSON.parse(text);
  const timeline = JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8'));
  return { ...s, path, sha256: createHash('sha256').update(text).digest('hex'), meaning, timeline, candidates: meaning.moments?.length ?? 0, today: todayGate(timeline, meaning) };
});

const rows = songs.flatMap((s) => styles.map((style) => {
  const free = freeJob(s.timeline, { style, seed, meaning: s.meaning });
  const plan = rankMoments(momentInputOf(free, s.timeline, style.world, s.meaning, s.path));
  const caps = momentCapsOf(style.world);
  return {
    song: s.song, world: style.id, seed,
    caps: { big: caps.big, mini: caps.mini, source: caps.source },
    candidates: plan.candidates.length,
    realizedMoments: plan.chosen.length,
    realizedMeans: 'planned (plan-level, not rendered)',
    eliminated: plan.eliminated,
    ...(plan.reason ? { reason: plan.reason } : {}),
    chosen: plan.chosen.map((c) => ({ id: c.scheduled.id, at: c.at, variant: c.variant, family: c.family, window: c.window, area: c.area, score: c.score, meaningRef: c.meaningRef })),
    notChosen: plan.candidates.filter((c) => c.notChosen).map((c) => ({ meaningRef: c.meaningRef, why: c.notChosen })),
    failed: plan.candidates.filter((c) => c.failed).map((c) => ({ meaningRef: c.meaningRef, ...c.failed })),
  };
}));

const bySong = Object.fromEntries(songs.map((s) => {
  const of = rows.filter((r) => r.song === s.song);
  const reasons = of.reduce<Record<string, number>>((m, r) => (r.realizedMoments ? m : { ...m, [r.reason ?? 'none']: (m[r.reason ?? 'none'] ?? 0) + 1 }), {});
  return [s.song, { meaning: s.path, sha256: s.sha256, candidates: s.candidates, today: s.today, worlds: of.length, worldsWithMoment: of.filter((r) => r.realizedMoments >= 1).length, policyEliminated: sum(of.map((r) => r.eliminated)), zeroReasons: reasons }];
}));
const reach = Object.values(bySong).filter((x) => x.worldsWithMoment >= 36).length;
const report = {
  note: 'plan-level only; realizedMoments = planned by rankMoments, not rendered or wired (phase 1); 0 API calls by construction',
  date: '2026-11-09', seed, floors: MOMENT_FLOORS, apiCalls: 0,
  summary: { rows: rows.length, songsReaching36of45: reach, target: 'at least 3 songs with ≥1 moment on ≥36/45 worlds (Codex §7)', bySong },
  rows,
};
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(report.summary, null, 1));
