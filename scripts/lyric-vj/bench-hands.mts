// Measures the hand checkers against people's labels (label-page.mts). The labels page database is exported first
// (ArtifactData list with out_dir → <dir>/labels/<id>.json); items.json maps each label id to its picture.
// Each checker reads every labelled picture twice: misses (wrong hands it passed), false rejects (good hands it
// failed), the two runs disagreeing, and the cost — the numbers that decide which checker the pipeline keeps.
//
// npx tsx scripts/lyric-vj/bench-hands.mts --labels <export dir>/labels --items <label page>/items.json
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { geminiHands, handCheck, type Verdict } from './cutout.mts';

/** Misses, false rejects and disagreement of one checker's two runs against the labels (unsure labels left out). */
export function score(rows: { truth: 'ok' | 'bad'; runs: Verdict[] }[]) {
  const bad = rows.filter((r) => r.truth === 'bad'), ok = rows.filter((r) => r.truth === 'ok');
  const failed = (r: { runs: Verdict[] }) => r.runs[0] === 'fail';
  return {
    bad: bad.length, ok: ok.length,
    missed: bad.filter((r) => !failed(r)).length,
    falseReject: ok.filter(failed).length,
    disagree: rows.filter((r) => new Set(r.runs).size > 1).length,
  };
}

async function main() {
  const { values: a } = parseArgs({ options: { labels: { type: 'string' }, items: { type: 'string' }, 'opus-sample': { type: 'string', default: '50' } } });
  for (const line of readFileSync(join(homedir(), '.config/vjflow/anthropic.env'), 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
  const items = JSON.parse(readFileSync(a.items!, 'utf8')) as Record<string, string>;
  const labelled = readdirSync(a.labels!).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const d = JSON.parse(readFileSync(join(a.labels!, f), 'utf8'));
    const body = d.data ?? d;
    const id = f.replace(/\.json$/, '');
    return body.hands === 'ok' || body.hands === 'bad' ? [{ id, file: items[id], truth: body.hands as 'ok' | 'bad' }] : [];
  }).filter((x) => x.file);
  console.log(`${labelled.length} labelled pictures (${labelled.filter((x) => x.truth === 'bad').length} with wrong hands)`);
  let opusUsd = 0;
  const twice = async <T,>(f: () => Promise<T>) => [await f(), await f()];
  // the Opus reading costs about five cents a picture: it reads every wrong hand and a sample of the good ones
  const n = Number(a['opus-sample']);
  const sampled = new Set([...labelled.filter((x) => x.truth === 'bad'), ...labelled.filter((x) => x.truth === 'ok').sort((p, q) => (p.id < q.id ? -1 : 1)).filter((_, i, all) => i % Math.max(1, Math.floor(all.length / n)) === 0).slice(0, n)].map((x) => x.id));
  const runs = await Promise.all(labelled.map(async (x) => {
    const [g, o] = await Promise.all([twice(() => geminiHands(x.file)), sampled.has(x.id) ? twice(() => handCheck(x.file)) : Promise.resolve([])]);
    opusUsd += o.reduce((s, r) => s + r.usd, 0);
    const both = o.length ? g.map((r, i) => (r.status === 'fail' || o[i].status === 'fail' ? 'fail' : r.status === 'uncertain' || o[i].status === 'uncertain' ? 'uncertain' : 'pass') as Verdict) : [];
    return { ...x, gemini: g.map((r) => r.status), opus: o.map((r) => r.status), both };
  }));
  console.log('gemini ', JSON.stringify(score(runs.map((r) => ({ truth: r.truth, runs: r.gemini })))), '(all pictures)');
  const sub = runs.filter((r) => r.opus.length);
  for (const k of ['gemini', 'opus', 'both'] as const) console.log(k.padEnd(7), JSON.stringify(score(sub.map((r) => ({ truth: r.truth, runs: r[k] })))), '(Opus sample)');
  console.log(`opus hand reads: $${(opusUsd / 2 / Math.max(1, sub.length)).toFixed(3)} a picture (gemini a fraction of a cent)`);
  for (const r of runs.filter((r) => r.truth === 'bad' && r.gemini[0] !== 'fail')) console.log('gemini missed', r.id);
}

if (process.argv[1]?.endsWith('bench-hands.mts')) await main();
