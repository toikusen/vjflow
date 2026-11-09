// Re-asks the lineplan reading (meaning-read.mts: same prompt, claude-haiku-5-5, --effort) for stored test songs and
// writes it NEXT TO the cached meaning.json under a new name, never over it. Each result is validated the way the
// pipeline would use it: validMeaning (keys must be sung phrases, moments on known lines), checkMoments (signature
// moment guards), and the free tier's todayGate (checkMoments + chorus + downbeat + cap).
// checkMoments runs on each ask alone (its spacing and count caps depend on input order), then once on all asks.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/meaning-reread.mts [--song nun] [--suffix haiku-1109] [--effort low|medium] [--force]
//     [--report out/research/meaning-reread-1109/<suffix>.json]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { validMeaning } from '../../src/app/lyric-vj/free-plan';
import { todayGate } from '../../src/app/lyric-vj/moment-policy-adapter';
import { checkMoments, type MomentAsk } from '../../src/app/lyric-vj/signature-moments';
import { Cue } from './lineplan-core.mts';
import { loadAnthropicEnv, READING_MODEL, READING_PRICE, readingRequest, readMeaning } from './meaning-read.mts';

export const TEST_SONGS = [
  { song: 'nun', db: 'yt_w_fCuUR3lEs' },
  { song: 'snow', db: 'yt_5i50aTB7JFo' },
  { song: 'tsuzuki', db: 'yt_b3GCfyNKeLs' },
  { song: 'choroin', db: 'yt_hCCskTJwvuc' },
  { song: 'tenmon', db: 'yt_iwYXfOhcsYI' },
];
/** Refuse a call whose worst case (every prompt character a token, full max_tokens out) could pass this. */
const MAX_USD_PER_CALL = 0.5;

const { values: a } = parseArgs({ options: { song: { type: 'string' }, suffix: { type: 'string', default: 'haiku-1109' }, effort: { type: 'string', default: 'low' }, force: { type: 'boolean', default: false }, report: { type: 'string' } } });
const effort = a.effort as 'low' | 'medium' | 'high';
const reportPath = a.report ?? `out/research/meaning-reread-1109/${a.suffix}.json`;
loadAnthropicEnv();
const songs = TEST_SONGS.filter((s) => !a.song || s.song === a.song);
const rows = [];
for (const s of songs) {
  const cached = `out/research/instant/plans/${s.song}/meaning.json`;
  const target = cached.replace(/meaning\.json$/, `meaning.${a.suffix}.json`);
  if (existsSync(target) && !a.force) { console.log(`${s.song}: ${target} exists, skipped (--force to re-ask)`); continue; }
  const song = JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8'));
  const MAX_TOKENS = 16000;
  const worst = [...readingRequest(song).prompt].length * READING_PRICE.input + MAX_TOKENS * READING_PRICE.output;
  if (worst > MAX_USD_PER_CALL) { console.log(`${s.song}: worst case $${worst.toFixed(3)} > $${MAX_USD_PER_CALL}, stopped`); break; }
  const got = await readMeaning(song, undefined, effort, MAX_TOKENS);
  const valid = validMeaning(got.meaning, song.cues as Cue[]);
  if (!valid) { console.log(`${s.song}: reading invalid (stop ${got.stop}), nothing written`); rows.push({ song: s.song, invalid: true, usage: got.usage, usd: got.usd }); continue; }
  writeFileSync(target, JSON.stringify(valid, null, 1));
  const sungOf = (id: string) => { const c = song.cues.find((x: Cue & { charStarts?: number[] }) => x.id === id); return c?.charStarts?.length ? { times: c.charStarts, source: 'line' } : undefined; };
  const asks = (valid.moments ?? []) as MomentAsk[];
  const checked = checkMoments(asks, song.cues, sungOf);
  const alone = asks.map((ask) => { const r = checkMoments([ask], song.cues, sungOf); return { cues: ask.cues, form: `${ask.form}/${ask.variant}`, word: ask.word, evidenceCueId: ask.evidenceCueId, evidenceIsWordLine: ask.evidenceCueId === ask.cues.at(-1), why: ask.why, pass: r.kept.length === 1, ...(r.kept[0] ? { at: r.kept[0].at } : { reason: r.dropped[0]?.reason }) }; });
  const droppedKeys = (got.meaning?.keys ?? []).filter((k) => !valid.keys.some((v) => v.cue === k.cue && v.phrase === k.phrase));
  const row = {
    song: s.song, db: s.db, title: song.title, model: READING_MODEL, effort, wrote: target, stop: got.stop,
    usage: got.usage, usd: Number(got.usd.toFixed(5)),
    keys: { asked: got.meaning?.keys?.length ?? 0, valid: valid.keys.length, list: valid.keys, dropped: droppedKeys },
    moments: { asked: got.meaning?.moments?.length ?? 0, validLines: asks.length, passAlone: alone.filter((x) => x.pass).length, passTogether: checked.kept.length, alone },
    freeTier: todayGate(song, valid),
    parts: valid.parts.length, palette: valid.palette,
  };
  rows.push(row);
  console.log(`${s.song}: keys ${row.keys.valid}/${row.keys.asked}, moments ${row.moments.passAlone}/${row.moments.asked} pass checkMoments alone (${row.moments.passTogether} together), free kept ${row.freeTier.kept}, ${got.usage.input}+${got.usage.output} tok $${row.usd}`);
}
const report = { date: '2026-11-09', model: READING_MODEL, effort, suffix: a.suffix, totalUsd: Number(rows.reduce((t, r) => t + r.usd, 0).toFixed(5)), rows };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`total $${report.totalUsd}`);
