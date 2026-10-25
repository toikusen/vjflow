// Acceptance of a passage's events by a viewer who never saw the plan: for each event, a frame just before it and one
// after it; the viewer says what changed, what the photos show and whether the lyric reads, then a judge holds that
// description against what the storyboard said a viewer would see. Each check is reported on its own (no total score).
//
// npx tsx scripts/lyric-vj/accept.mts --video <clip.mp4> --start <clip start s> --plan <boardplan.json> --out <file.json>
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

type Ev = { at: number; kind: string; look: string };
export type Verdict = { event: Ev; seen: string; photos: string; lyric: 'clear' | 'partly' | 'unclear'; match: boolean; why: string };

/** The moments an event is judged on: just before it and once it has played out, kept inside the clip. */
export function framesFor(at: number, start: number, end: number): [number, number] {
  return [Math.max(start, at - 0.3), Math.min(end - 0.05, at + 1.1)];
}

/** n moments spread evenly through a stage, ends included. */
export function stageFrames(from: number, to: number, n = 6): number[] {
  return Array.from({ length: n }, (_, i) => +(from + ((to - from) * i) / (n - 1)).toFixed(2));
}

/** One line a person can read per check, failed ones marked. */
export const report = (v: Verdict[]) => v.map((x) => `${x.match ? '✓' : '✗'} ${x.event.at.toFixed(1)} s ${x.event.kind}｜看到：${x.seen}｜照片：${x.photos}｜歌詞：${x.lyric}${x.match ? '' : `｜不符：${x.why}`}`);

if (process.argv[1]?.endsWith('accept.mts')) {
  // --stages: a JSON list of { from, to, look }: each stage is seen as a run of frames, then the whole progression is judged
  const { values: a } = parseArgs({ options: { video: { type: 'string' }, start: { type: 'string' }, plan: { type: 'string' }, stages: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-sonnet-5-5' } } });
  const envFile = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const start = Number(a.start);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.video!]).toString());
  const events = a.plan ? (JSON.parse(readFileSync(a.plan, 'utf8')).board.events as Ev[]) : [];
  const dir = `${a.out!.replace(/\.json$/, '')}_frames`;
  mkdirSync(dir, { recursive: true });
  const frame = (t: number) => {
    const f = join(dir, `f_${t.toFixed(2)}.jpg`);
    if (!existsSync(f)) execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(t - start), '-i', a.video!, '-frames:v', '1', '-vf', 'scale=960:-1', '-q:v', '4', f]);
    return readFileSync(f).toString('base64');
  };
  const client = new Anthropic({ maxRetries: 8 });
  let usd = 0;
  const ask = async (content: Anthropic.Messages.ContentBlockParam[], schema: object) => {
    const msg = await client.messages.create({ model: a.model!, max_tokens: 2000, messages: [{ role: 'user', content }], output_config: { format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    usd += (msg.usage.input_tokens * 3 + msg.usage.output_tokens * 15) / 1e6;
    return JSON.parse((msg.content.find((b) => b.type === 'text') as { text: string }).text);
  };
  if (a.stages) {
    const stages = JSON.parse(readFileSync(a.stages, 'utf8')) as { from: number; to: number; look: string }[];
    const img = (t: number) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: frame(t) } });
    const seen: { stage: (typeof stages)[number]; what: string; lyric: string }[] = [];
    for (const st of stages) {
      // the viewer is told nothing of the plan
      const r = await ask([...stageFrames(st.from, st.to).map(img), { type: 'text', text: '這是一支歌詞 MV 裡一段連續的畫面，依時間順序。用繁體中文回答：what：這段裡畫面上的東西發生了什麼（具體，寫出變化的先後）；lyric：歌詞讀起來有沒有力、清不清楚（一句）。' }],
        { type: 'object', additionalProperties: false, required: ['what', 'lyric'], properties: { what: { type: 'string' }, lyric: { type: 'string' } } });
      seen.push({ stage: st, ...r });
    }
    const judge = await ask([{ type: 'text', text: `這段 MV 想讓觀眾感受到的變化，依序是：\n${stages.map((x, i) => `${i + 1}. ${x.look}`).join('\n')}\n沒看過企劃的觀眾依序描述：\n${seen.map((x, i) => `${i + 1}. ${x.what}（歌詞：${x.lyric}）`).join('\n')}\n每一段，觀眾有沒有看到那個主要變化（細節可以不同）？整體的「前→中→後」有沒有被感受到？` }],
      { type: 'object', additionalProperties: false, required: ['stages', 'whole', 'why'], properties: { stages: { type: 'array', items: { type: 'boolean' } }, whole: { type: 'boolean' }, why: { type: 'string' } } });
    writeFileSync(a.out!, JSON.stringify({ seen, judge, costUSD: +usd.toFixed(3) }, null, 1));
    seen.forEach((x, i) => console.log(`${judge.stages[i] ? '✓' : '✗'} ${x.stage.from}–${x.stage.to} s｜要：${x.stage.look}｜看到：${x.what}｜歌詞：${x.lyric}`));
    console.log(`${judge.whole ? '✓' : '✗'} 整體：${judge.why}\naccept: $${usd.toFixed(3)}`);
    process.exit(0);
  }
  const verdicts: Verdict[] = [];
  for (const e of events) {
    const [t0, t1] = framesFor(e.at, start, start + dur);
    const img = (t: number) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: frame(t) } });
    // the viewer is told nothing of the plan
    const seen = await ask([img(t0), img(t1), { type: 'text', text: '這是一支歌詞 MV 裡相隔約一秒的兩張畫面（前、後）。用繁體中文回答：seen：從第一張到第二張，畫面上的東西發生了什麼變化（具體寫哪個東西怎麼了；沒有變化就說沒有）；photos：畫面裡的照片或卡片上看得出是什麼（看不出就說看不出）；lyric：第二張的歌詞字讀起來 clear、partly 或 unclear。' }],
      { type: 'object', additionalProperties: false, required: ['seen', 'photos', 'lyric'], properties: { seen: { type: 'string' }, photos: { type: 'string' }, lyric: { type: 'string', enum: ['clear', 'partly', 'unclear'] } } });
    const judge = await ask([{ type: 'text', text: `分鏡說觀眾應該看到：「${e.look}」\n沒看過分鏡的觀眾實際描述：「${seen.seen}」\n觀眾有沒有看到分鏡要的那個變化（主要的事件有就算，細節可以不同）？match 填 true/false，why 一句說差在哪。` }],
      { type: 'object', additionalProperties: false, required: ['match', 'why'], properties: { match: { type: 'boolean' }, why: { type: 'string' } } });
    verdicts.push({ event: e, ...seen, ...judge });
  }
  writeFileSync(a.out!, JSON.stringify({ verdicts, costUSD: +usd.toFixed(3) }, null, 1));
  console.log(report(verdicts).join('\n'));
  console.log(`accept: ${verdicts.filter((x) => x.match).length}/${verdicts.length} events seen, $${usd.toFixed(3)}`);
}
