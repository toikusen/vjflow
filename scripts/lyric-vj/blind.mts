// A viewer who knows nothing about the design: shown stills in order, asked what happens (no intent given), so what
// the frames say can be compared with what the design meant.
// npx tsx scripts/lyric-vj/blind.mts <out.json> <still.png>...
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const [outFile, ...stills] = process.argv.slice(2);
const images = stills.map((p) => {
  const jpg = p.replace(/\.png$/, '.blind.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', p, '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
  return readFileSync(jpg).toString('base64');
});
const client = new Anthropic();
const msg = await client.messages.create({
  model: 'claude-opus-5-5', max_tokens: 4000,
  system: '你是第一次看這支 MV 的觀眾。你沒有任何說明，只看畫面。',
  messages: [{ role: 'user', content: [
    { type: 'text', text: `這是一支歌詞 MV 裡連續 ${images.length} 個時間點的畫面（依時間順序）。請回答：\n1. 每張畫面你看到什麼。\n2. 這幾張連起來，你覺得發生了什麼事？\n3. 最後一張出現的東西或人，讓你想到什麼？它和前面的畫面有什麼關係？你是靠畫面裡哪些線索判斷的？\n4. 有沒有哪裡看不懂、或可能被誤解？` },
    ...images.flatMap((data, i) => [{ type: 'text' as const, text: `畫面 ${i + 1}：` }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } }]),
  ] }],
});
const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
writeFileSync(outFile, JSON.stringify({ stills, text, usage: msg.usage }, null, 1));
console.log(text);
