// The verify pass (meaning-read.mts verifyCandidates) on stored re-reads: every key and moment candidate of
// meaning.<from>.json re-judged once by claude-haiku-5-5; the survivors go to meaning.<to>.json beside it (never meaning.json),
// each candidate's verdict to the report.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/meaning-verify.mts [--song snow] [--from haiku-1109b] [--to haiku-1109c]
//     [--effort medium] [--report out/research/meaning-reread-1109/verify-1109c.json] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { checkMoments, type MomentAsk } from '../../src/app/lyric-vj/signature-moments';
import { Cue, Meaning } from './lineplan-core.mts';
import { loadAnthropicEnv, READING_PRICE, verifyCandidates, verifyRequest } from './meaning-read.mts';

const SONGS = [
  { song: 'nun', db: 'yt_w_fCuUR3lEs' },
  { song: 'snow', db: 'yt_5i50aTB7JFo' },
  { song: 'tsuzuki', db: 'yt_b3GCfyNKeLs' },
  { song: 'choroin', db: 'yt_hCCskTJwvuc' },
  { song: 'tenmon', db: 'yt_iwYXfOhcsYI' },
];
const MAX_USD_PER_CALL = 0.5;
const MAX_TOKENS = 16000;
const { values: a } = parseArgs({ options: { song: { type: 'string' }, from: { type: 'string', default: 'haiku-1109b' }, to: { type: 'string', default: 'haiku-1109c' }, effort: { type: 'string', default: 'medium' }, report: { type: 'string', default: 'out/research/meaning-reread-1109/verify-1109c.json' }, force: { type: 'boolean', default: false } } });
loadAnthropicEnv();
const rows = [];
for (const s of SONGS.filter((x) => !a.song || x.song === a.song)) {
  const dir = `out/research/instant/plans/${s.song}`;
  const target = `${dir}/meaning.${a.to}.json`;
  if (existsSync(target) && !a.force) { console.log(`${s.song}: ${target} exists, skipped`); continue; }
  const song = JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8'));
  const m = JSON.parse(readFileSync(`${dir}/meaning.${a.from}.json`, 'utf8')) as Meaning;
  const worst = [...verifyRequest(song, m).prompt].length * READING_PRICE.input + MAX_TOKENS * READING_PRICE.output;
  if (worst > MAX_USD_PER_CALL) { console.log(`${s.song}: worst case $${worst.toFixed(3)} > $${MAX_USD_PER_CALL}, stopped`); break; }
  const got = await verifyCandidates(song, m, a.effort as 'medium', MAX_TOKENS);
  writeFileSync(target, JSON.stringify(got.meaning, null, 1));
  const sungOf = (id: string) => { const c = song.cues.find((x: Cue) => x.id === id); return c?.charStarts?.length ? { times: c.charStarts, source: 'line' } : undefined; };
  const cand = [
    ...m.keys.map((k, i) => ({ id: `k${i}`, kind: 'key', cue: k.cue, text: k.phrase, why: k.why })),
    ...(m.moments ?? []).map((x, i) => ({ id: `m${i}`, kind: 'moment', cue: x.cues.join('+'), text: `${x.form}/${x.variant} ${x.word}`, why: x.why, passAlone: checkMoments([x as MomentAsk], song.cues, sungOf).kept.length === 1 })),
  ].map((c) => ({ ...c, verdict: got.verdicts.find((v) => v.id === c.id), kept: !got.dropped.some((d) => d.id === c.id), dropWhy: got.dropped.find((d) => d.id === c.id)?.why }));
  const row = { song: s.song, from: `${dir}/meaning.${a.from}.json`, wrote: target, stop: got.stop, usage: got.usage, usd: Number(got.usd.toFixed(5)),
    keys: { before: m.keys.length, after: got.meaning.keys.length }, moments: { before: m.moments?.length ?? 0, after: got.meaning.moments?.length ?? 0 }, candidates: cand };
  rows.push(row);
  console.log(`${s.song}: keys ${row.keys.after}/${row.keys.before}, moments ${row.moments.after}/${row.moments.before}, ${got.usage.input}+${got.usage.output} tok $${row.usd}`);
}
const report = { date: '2026-11-09', effort: a.effort, from: a.from, to: a.to, totalUsd: Number(rows.reduce((t, r) => t + r.usd, 0).toFixed(5)), rows };
mkdirSync(dirname(a.report!), { recursive: true });
writeFileSync(a.report!, JSON.stringify(report, null, 1));
console.log(`total $${report.totalUsd}`);
