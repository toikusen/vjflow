// The paid line director, opt-in: the song's paid design (language, palette, world, parts) goes in, a plan with each
// line's own stack and reasons comes out, in the shape typeplan.mts --plan reads. No flag anywhere else turns this on.
// npx tsx scripts/lyric-vj/linedirect.mts --song song.json --base <run>/base/treatment.json --paid <run>/noimg --out <dir>
// then: npx tsx scripts/lyric-vj/typeplan.mts --song song.json --treatment <dir>/base.json --backdrops <dir>/base.json --plan <dir>/plan.json --out <dir>/final
// A reply is kept in <dir>/direction.json: a rerun reuses it and spends nothing, unless --fresh.
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES } from '../../src/app/lyric-vj/languages';
import { feltTempo } from '../../src/app/lyric-vj/timeline';
import { charsPerSec, Cue, levelOf } from './lineplan-core.mts';
import { Ctx, directedPlan, Direction, directionSchema, directorBase, directorPrompt, PaidPlan, paidClock, screenGroundsOf, SongIn, usdOf } from './linedirect-core.mts';
import { lessonsBlock, readLessons } from './lesson-rules.mts';
import { overusedForms, recordMoments } from '../../src/app/lyric-vj/signature-moments';
import { buildMoments } from './moments.mts';
import { sungTimesOf } from './sung-times.mts';
import { planWordSync } from './wordsync.mts';
import { overusedWorlds, PlanWorld, planWorldOf, recordWorld, WORLD_PICK_SCHEMA, worldBase, worldCandidates, worldPickPrompt, worldPoolOf } from './paid-world.mts';
import { worldById } from '../../src/app/lyric-vj/style-worlds';

const { values: a } = parseArgs({ options: {
  song: { type: 'string' }, base: { type: 'string' }, paid: { type: 'string' }, out: { type: 'string' },
  model: { type: 'string', default: 'claude-opus-5-5' },
  // the whole run's money, the ledger it is kept in: a call that would pass it is not made
  budget: { type: 'string', default: '5' }, costs: { type: 'string', default: 'out/research/linedirect/costs.jsonl' },
  // spend again even though a reply is kept
  fresh: { type: 'boolean', default: false },
  // estimate only: the prompt is written, nothing is spent
  dry: { type: 'boolean', default: false },
  // a render's metrics.json: lines it floored or could not fit go back to the composer, for no new call
  metrics: { type: 'string' },
  lessons: { type: 'string' },
  // the picture tier: some lines stand to one side so its props have the other
  props: { type: 'boolean', default: false },
  // signature moments: the director picks up to three lines for a drawn moment (checked, then written for the renderer)
  moments: { type: 'boolean', default: false },
  history: { type: 'string', default: 'out/design-history.json' },
  // the paid tiers on a style world (paid-world.mts): a world id, the buyer's style (its language), or auto, where the
  // director picks one from all the worlds with a reason; kept in <out>/world.json so a rerun spends nothing
  world: { type: 'string' },
} });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
mkdirSync(out, { recursive: true });
mkdirSync(dirname(a.costs!), { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8')) as SongIn;
const base = JSON.parse(readFileSync(a.base!, 'utf8'));
const paid = JSON.parse(readFileSync(join(a.paid!, 'typeplan.json'), 'utf8')) as PaidPlan & { vision?: { change?: string } };
const felt = feltTempo(song as never).beats;
const cues = song.cues;
const sungSec = cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
const perSec = cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sungSec);
const calm = perSec < 3;
const paidShots = base.shots as { id: string; start: number; end: number }[];
const sectionAt = (x: number) => song.sections?.find((s) => x >= s.start && x < s.end);
const clock = paidClock(paid, paidShots, felt);
// each paid part from its first sung line; a part nobody sings in is the world's, not a line's
const partsIn = (paid.parts ?? []).flatMap((p) => {
  const start = paidShots.find((s) => s.id === p.from)?.start ?? 0;
  const first = cues.find((c) => c.start >= start - 0.02);
  return first ? [{ id: p.from, cue: first.id, start, what: String(p['what'] ?? ''), energy: sectionAt(first.start)?.energy ?? 0.5 }] : [];
});
const partOf = (id: string) => { const i = cues.findIndex((c) => c.id === id); return [...partsIn].filter((p) => cues.findIndex((c) => c.id === p.cue) <= i).at(-1) ?? partsIn[0]; };

const lang = base.design.language as keyof typeof LANGUAGES;
const script = (base.design.colorScript ?? [])[1] ?? (base.design.colorScript ?? [])[0] ?? {};
const history = (existsSync(a.history!) ? JSON.parse(readFileSync(a.history!, 'utf8')) : []) as { song: string; moments?: string[]; world?: string }[];
const spent = () => (existsSync(a.costs!) ? readFileSync(a.costs!, 'utf8').split('\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).usd ?? 0), 0) : 0);
const ledger = (what: string, estimate: number, usage: { input_tokens: number; output_tokens: number }, started: number, stop: string | null) => {
  const usd = usdOf(usage.input_tokens, usage.output_tokens);
  appendFileSync(a.costs!, `${JSON.stringify({ at: new Date().toISOString(), song: song.title, out, model: a.model, what, estimateUSD: +estimate.toFixed(4), input: usage.input_tokens, output: usage.output_tokens, usd: +usd.toFixed(4), sec: Math.round((Date.now() - started) / 1000), stop })}\n`);
  return usd;
};

// the world: the buyer's style when one world has it, else the director's pick among the candidates (one small call)
const pickWorld = async (): Promise<PlanWorld> => {
  const keptWorld = join(out, 'world.json');
  if (existsSync(keptWorld)) return JSON.parse(readFileSync(keptWorld, 'utf8')) as PlanWorld;
  const candidates = worldCandidates(a.world);
  const byBuyer = candidates.length < worldCandidates().length;
  const named = worldById(a.world!);
  let pw: PlanWorld;
  if (named) pw = planWorldOf(named, song, calm, '買家選的風格', 'buyer');
  else if (candidates.length === 1) pw = planWorldOf(candidates[0], song, calm, '買家選的風格', 'buyer');
  else {
    const prompt = worldPickPrompt(song, candidates, overusedWorlds(history, song.title), base.concept ?? '', calm);
    writeFileSync(join(out, 'world-prompt.txt'), prompt);
    if (a.dry) { console.log(`world: the director would pick from ${candidates.length} worlds (~$0.03)`); return planWorldOf(candidates[0], song, calm, '', 'director'); }
    const started = Date.now();
    const msg = await new Anthropic({ maxRetries: 4 }).messages.create({ model: a.model!, max_tokens: 2000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'low', format: { type: 'json_schema', schema: WORLD_PICK_SCHEMA } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    const usd = ledger('world', 0.03, msg.usage, started, msg.stop_reason);
    const text = msg.content.find((b) => b.type === 'text');
    const got = JSON.parse(text && text.type === 'text' ? text.text : '{}') as { world?: string; why?: string };
    const w = candidates.find((x) => x.id === got.world) ?? candidates[0];
    pw = planWorldOf(w, song, calm, got.why ?? '', byBuyer ? 'buyer' : 'director');
    console.log(`world: $${usd.toFixed(3)} → ${w.id}${w.id !== got.world ? ` (said ${got.world})` : ''}: ${pw.why}`);
  }
  writeFileSync(keptWorld, JSON.stringify(pw, null, 1));
  return pw;
};
const pw = a.world ? await pickWorld() : undefined;
const world = pw ? worldById(pw.id)! : undefined;
const pool = pw ? worldPoolOf(pw) : undefined;
if (pw) console.log(`world: ${pw.id} scheme ${pw.scheme} (${pw.by}) ${pw.why}`);

const ctxFor = (d?: Direction): Ctx => {
  const tension = (c: Cue) => { const k = partsIn.indexOf(partOf(c.id)); return d?.parts?.[k]?.tension ?? partOf(c.id)?.energy ?? 0.5; };
  return { song, calm, partWhat: (id) => partOf(id)?.what ?? '', levelOf: (c) => levelOf(tension(c), charsPerSec(c), calm), screenGrounds: screenGroundsOf(paid), world: pool };
};
const palette = pw ? `墨 ${pw.palette.ink}、底 ${pw.palette.paper}、強調 ${pw.palette.accent}` : `墨 ${script.shadow}、紙 ${script.highlight}、強調 ${script.accent}`;
const prompt = directorPrompt(song, ctxFor(), { language: String(lang ?? ''), languageWhat: String((LANGUAGES[lang] as { name?: string } | undefined)?.name ?? ''), concept: base.concept ?? '', backbone: paid.backbone ?? '', change: paid.vision?.change ?? '', palette, parts: partsIn, lessons: lessonsBlock(readLessons(a.lessons), 'typeplan'), props: a.props, moments: a.moments ? { overused: overusedForms(history, song.title) } : undefined, wordSync: true, world: world && pool ? { w: world, pool } : undefined });
writeFileSync(join(out, 'prompt.txt'), prompt);

const kept = join(out, 'direction.json');
const ask = async (): Promise<Direction> => {
  const schema = directionSchema(a.moments, true);
  const budget = Number(a.budget);
  const client = new Anthropic({ maxRetries: 4 });
  const counted = (await client.messages.countTokens({ model: a.model!, messages: [{ role: 'user', content: prompt }], output_config: { format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageCountTokensParams)).input_tokens;
  // a tenth over what was counted: the first three calls billed up to 16 % more than a count without the schema
  const inTok = Math.ceil(counted * 1.1);
  // about 350 tokens a line in the first runs' replies; thinking comes on top, so the ceiling below is what really binds
  const guessOut = 900 + cues.length * 380;
  const estimate = usdOf(inTok, guessOut);
  const room = budget - spent();
  console.log(`estimate: ${inTok} in, ~${guessOut} out, $${estimate.toFixed(3)}; spent $${spent().toFixed(3)} of $${budget}`);
  if (a.dry) process.exit(0);
  if (estimate > room) throw new Error(`stopping: the next call (~$${estimate.toFixed(2)}) would pass the budget, $${room.toFixed(2)} left`);
  // the most this call can cost is what is left
  const maxOut = Math.min(64000, Math.floor((room * 1e6 - inTok * 4) / 20));
  const started = Date.now();
  const msg = await client.messages.stream({ model: a.model!, max_tokens: maxOut, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'medium', format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  const usd = ledger('direction', estimate, msg.usage, started, msg.stop_reason);
  console.log(`direction: $${usd.toFixed(3)} (in ${msg.usage.input_tokens}, out ${msg.usage.output_tokens}), stop ${msg.stop_reason}`);
  const text = msg.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('the director returned no text');
  writeFileSync(`${kept}.raw`, text.text);
  const d = JSON.parse(text.text) as Direction;
  writeFileSync(kept, JSON.stringify(d, null, 1));
  return d;
};
const direction: Direction | undefined = existsSync(kept) && !a.fresh ? (JSON.parse(readFileSync(kept, 'utf8')) as Direction) : await ask();

// a render's verdict on lines the plan could not foresee: type under the floor, a line not read in time
const rejected = new Set<string>();
if (a.metrics) {
  const m = JSON.parse(readFileSync(a.metrics, 'utf8')) as { cues: { id: string; ok: boolean; floored?: boolean }[] };
  for (const c of m.cues) if (c.floored || !c.ok) rejected.add(c.id);
  console.log(`metrics: ${rejected.size} lines back to the composer (${[...rejected].join(' ')})`);
}
const { plan, shots, decisions, fallbacks } = directedPlan(song, direction, ctxFor(direction), paid, paidShots, partsIn, felt, rejected, pw);
// the moments through their guards: the kept ones go with the plan (typeplan --plan puts them on the treatment), the
// dropped ones are fallbacks like any other; the song's forms go into the design history for the next songs' directors
if (a.moments) {
  const asks = direction?.moments ?? [];
  const { kept, dropped } = buildMoments(song as never, a.song!, asks);
  for (const d of dropped) fallbacks.push({ cue: d.ask.cues.join('+'), field: 'moment', said: `${d.ask.form}/${d.ask.variant} 「${d.ask.word}」`, reason: d.reason });
  writeFileSync(join(out, 'signature.json'), JSON.stringify({ moments: kept, dropped }, null, 1));
  Object.assign(plan, { signature: kept });
  writeFileSync(a.history!, JSON.stringify(recordMoments(history, song.title, kept), null, 1));
  console.log(`moments: ${kept.length} kept (${kept.map((k) => `${k.form}/${k.variant} ${k.cues.join('+')} 「${k.word}」`).join('; ')}), ${dropped.length} dropped${direction && !direction.moments ? ' (the kept reply has none: rerun with --fresh to ask)' : ''}`);
}
// word sync: the lines the director chose land their characters as sung, on the server's times, where the guards let
// them (word-sync.ts); a refused line stays on line timing and is a fallback like any other. Every paid run asks
const syncAsks = direction?.wordSync ?? [];
const sync = planWordSync(plan as never, song.cues, syncAsks, sungTimesOf(song as never, a.song!));
for (const d of sync.dropped) fallbacks.push({ cue: d.ask.cue, field: 'wordSync', said: d.ask.why, reason: d.reason });
for (const k of sync.kept) Object.assign(decisions.find((x) => x['cue'] === k.cue) ?? {}, { wordSync: { why: k.why, source: k.source } });
console.log(`word sync: ${sync.kept.length} lines (${sync.kept.map((k) => `${k.cue} ${k.source} 「${k.why}」`).join('; ')}), ${sync.dropped.length} refused${direction && !direction.wordSync ? ' (the kept reply has none: rerun with --fresh to ask)' : ''}`);
// the song's world goes into the design history: the next songs' directors are told which worlds the last ones took
if (pw) {
  const now = (existsSync(a.history!) ? JSON.parse(readFileSync(a.history!, 'utf8')) : []) as { song: string; world?: string }[];
  writeFileSync(a.history!, JSON.stringify(recordWorld(now, song.title, pw.id), null, 1));
}
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
writeFileSync(join(out, 'base.json'), JSON.stringify(pw ? worldBase(base, plan as never, shots, pw) : directorBase(base, plan as never, shots)));
writeFileSync(join(out, 'decisions.json'), JSON.stringify({ reading: direction?.reading, world: pw, techniques: direction?.techniques, tune: direction?.tune, wordSync: { kept: sync.kept.map(({ times: _t, ...k }) => k), dropped: sync.dropped }, decisions, fallbacks }, null, 1));
writeFileSync(join(out, 'fallbacks.log'), fallbacks.map((f) => `${f.cue} ${f.field} ${f.said}: ${f.reason}`).join('\n') + '\n');
const held = decisions.filter((x) => x['cut'] === 'hold').length;
console.log(`linedirect: ${shots.length} shots, ${decisions.length} lines (${held} held, ${decisions.length - held} split), ${fallbacks.length} fallbacks, ${clock.length} paid cuts on the clock; spent so far $${spent().toFixed(3)}`);
