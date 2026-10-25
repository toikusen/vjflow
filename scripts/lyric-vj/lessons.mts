// The experience base: what people said about a finished song, turned into rules for every later song.
// Input is the review page's database exported to <cutout>/feedback.json (Claude reads it with ArtifactData), e.g.
//   { "feedback": { "shot-12": { verdict, tags, note }, "overall": { good, fix, bad } }, "review": { "paint-17": { verdict: "redo", note } } }
// Output:
//   out/knowledge/lessons.md   — general rules (story, people, layout, lyrics, rhythm, style), merged, each with its songs
//   out/qa-set/<song>/          — pictures people marked wrong, labelled, with whether the checker had passed them
//
// npx tsx scripts/lyric-vj/lessons.mts --song out/db/<id>/song.json --keyframes out/research/<kf> --cutout out/research/<cut>
import Anthropic from '@anthropic-ai/sdk';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { QaEntry, Spec } from './cutout.mts';
import { Board, frameTimes } from './keyframes.mts';

export const LESSONS = 'out/knowledge/lessons.md';

type Mark = { verdict?: string; tags?: string[]; note?: string; good?: string; fix?: string; bad?: string };

/**
 * The pictures to keep in the error set: every one a person sent back, with what the checker had said of it (a pass
 * there is a miss — the number the second checker, if any, has to bring down).
 */
export function errorSet(review: Record<string, Mark>, qa: Record<string, QaEntry>) {
  return Object.entries(review).flatMap(([key, m]) => {
    if (m.verdict !== 'redo') return [];
    const [kind, ...rest] = key.split('-');
    const e = qa[`${kind}:${rest.join('-')}`];
    return e ? [{ key, file: e.file, note: m.note ?? '', checker: e.status, missed: e.status === 'pass' }] : [];
  });
}

/** The experience base as text for a planner prompt (empty when there is none yet). */
export const lessonsText = () => (existsSync(LESSONS) ? readFileSync(LESSONS, 'utf8') : '');

async function main() {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, keyframes: { type: 'string' }, cutout: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
  for (const line of readFileSync(join(homedir(), '.config/vjflow/anthropic.env'), 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
  const cut = a.cutout!, kf = a.keyframes!;
  const song = JSON.parse(readFileSync(a.song!, 'utf8'));
  const fb = JSON.parse(readFileSync(join(cut, 'feedback.json'), 'utf8')) as { feedback?: Record<string, Mark>; review?: Record<string, Mark> };
  const qa = existsSync(join(cut, 'qa.json')) ? (JSON.parse(readFileSync(join(cut, 'qa.json'), 'utf8')) as Record<string, QaEntry>) : {};
  const board = JSON.parse(readFileSync(join(kf, 'board.json'), 'utf8')) as Board;
  const spec = JSON.parse(readFileSync(join(cut, 'spec.json'), 'utf8')) as Spec;

  // the error set
  const errs = errorSet(fb.review ?? {}, qa);
  const dir = join('out/qa-set', basename(cut));
  mkdirSync(dir, { recursive: true });
  for (const e of errs) if (existsSync(e.file)) copyFileSync(e.file, join(dir, `${e.key}.jpg`));
  writeFileSync(join(dir, 'labels.json'), JSON.stringify(errs.map((e) => ({ ...e, file: `${e.key}.jpg` })), null, 1));
  const missed = errs.filter((e) => e.missed).length;
  console.log(`error set: ${errs.length} pictures sent back, ${missed} the checker had passed → ${dir}`);

  // the lessons: each marked shot with what it was, then the whole
  const timed = frameTimes(board, song.cues, 0, 1e4);
  const shots = Object.entries(fb.feedback ?? {}).filter(([k]) => k.startsWith('shot-')).map(([k, m]) => {
    const n = Number(k.slice(5)), f = timed[n - 1], s = spec.shots.find((x) => x.frame === n);
    return { n, lyric: song.cues.find((c: { id: string }) => c.id === f?.cue)?.text ?? '（間奏）', shot: s ? { subject: s.subject, mode: s.mode, shape: s.layout.shape, people: s.actors.length } : undefined, ...m };
  }).filter((x) => x.verdict || x.note || x.tags?.length);
  const prompt = `你在整理一個「歌曲故事 VJ」產品的經驗庫。下面是使用者對〈${song.title}〉成品的回饋（每格的評價、問題類型、原因，整首的好與不好，以及出貨前被要求重畫的圖）。
請把它們整理成之後做「每一首歌」都適用的規則：一條一句、具體可執行（說清楚該怎麼做或不要做什麼），不要寫只對這首歌成立的細節；好的地方也要寫成「要保留的做法」。
已經有的經驗庫如下，新規則若和舊的一樣就合併（在那條後面加上這首歌名），矛盾時以這次的回饋為準並註明。輸出完整的新經驗庫（Markdown），分成這些段落：## 故事與分鏡、## 人物、## 版面與畫面、## 歌詞與排字、## 節奏與動態、## 畫風；每條結尾用（歌名）標出來源。
現有經驗庫：
${lessonsText() || '（還沒有）'}
這首的回饋：
${JSON.stringify({ overall: fb.feedback?.overall ?? {}, shots, redo: errs.map((e) => ({ picture: e.key, why: e.note, checker: e.checker })) })}`;
  const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 16000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'high' } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
  if (!text.includes('## ')) throw new Error('lessons: the answer has no sections, not kept');
  mkdirSync('out/knowledge', { recursive: true });
  writeFileSync(LESSONS, text + '\n');
  console.log(`lessons: ${text.split('\n').filter((l) => l.startsWith('- ')).length} rules → ${LESSONS} ($${((msg.usage.input_tokens * 5 + msg.usage.output_tokens * 25) / 1e6).toFixed(2)})`);
}

if (process.argv[1]?.endsWith('lessons.mts')) await main();
