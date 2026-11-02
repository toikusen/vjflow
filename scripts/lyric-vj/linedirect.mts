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

const ctxFor = (d?: Direction): Ctx => {
  const tension = (c: Cue) => { const k = partsIn.indexOf(partOf(c.id)); return d?.parts?.[k]?.tension ?? partOf(c.id)?.energy ?? 0.5; };
  return { song, calm, partWhat: (id) => partOf(id)?.what ?? '', levelOf: (c) => levelOf(tension(c), charsPerSec(c), calm), screenGrounds: screenGroundsOf(paid) };
};
const lang = base.design.language as keyof typeof LANGUAGES;
const script = (base.design.colorScript ?? [])[1] ?? (base.design.colorScript ?? [])[0] ?? {};
const prompt = directorPrompt(song, ctxFor(), { language: String(lang ?? ''), languageWhat: String((LANGUAGES[lang] as { name?: string } | undefined)?.name ?? ''), concept: base.concept ?? '', backbone: paid.backbone ?? '', change: paid.vision?.change ?? '', palette: `墨 ${script.shadow}、紙 ${script.highlight}、強調 ${script.accent}`, parts: partsIn, lessons: lessonsBlock(readLessons(a.lessons), 'typeplan'), props: a.props });
writeFileSync(join(out, 'prompt.txt'), prompt);

const spent = () => (existsSync(a.costs!) ? readFileSync(a.costs!, 'utf8').split('\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).usd ?? 0), 0) : 0);
const kept = join(out, 'direction.json');
const ask = async (): Promise<Direction> => {
  const schema = directionSchema();
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
  const usd = usdOf(msg.usage.input_tokens, msg.usage.output_tokens);
  appendFileSync(a.costs!, `${JSON.stringify({ at: new Date().toISOString(), song: song.title, out, model: a.model, estimateUSD: +estimate.toFixed(4), input: msg.usage.input_tokens, output: msg.usage.output_tokens, usd: +usd.toFixed(4), sec: Math.round((Date.now() - started) / 1000), stop: msg.stop_reason })}\n`);
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
const { plan, shots, decisions, fallbacks } = directedPlan(song, direction, ctxFor(direction), paid, paidShots, partsIn, felt, rejected);
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
writeFileSync(join(out, 'base.json'), JSON.stringify(directorBase(base, plan as never, shots)));
writeFileSync(join(out, 'decisions.json'), JSON.stringify({ reading: direction?.reading, techniques: direction?.techniques, tune: direction?.tune, decisions, fallbacks }, null, 1));
writeFileSync(join(out, 'fallbacks.log'), fallbacks.map((f) => `${f.cue} ${f.field} ${f.said}: ${f.reason}`).join('\n') + '\n');
const held = decisions.filter((x) => x['cut'] === 'hold').length;
console.log(`linedirect: ${shots.length} shots, ${decisions.length} lines (${held} held, ${decisions.length - held} split), ${fallbacks.length} fallbacks, ${clock.length} paid cuts on the clock; spent so far $${spent().toFixed(3)}`);
