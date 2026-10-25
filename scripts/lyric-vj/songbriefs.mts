// From the song plan (songplan.mts): each segment's window, trimmed treatment and the notes its director reads — the
// song's story, the shared people, the events before and after it, its own event and the standing rules.
// npx tsx scripts/lyric-vj/songbriefs.mts <plan dir> <full treatment.json> <song.json> <assets dir>
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [dir, full, songFile, assets] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { story: string; characters: { id: string; who: string; poses: { id: string }[] }[]; segments: { first: string; last: string; event: string; reuse?: number }[] };
const t = JSON.parse(readFileSync(full, 'utf8'));
const shot = (id: string) => t.shots.find((s: { id: string }) => s.id === id);
const lines: string[] = [];
plan.segments.forEach((s, k) => {
  const W0 = shot(s.first).start, W1 = shot(s.last).end;
  const seg = join(dir, `seg${String(k + 1).padStart(2, '0')}`);
  mkdirSync(seg, { recursive: true });
  execFileSync('npx', ['tsx', 'scripts/lyric-vj/trim.mts', full, join(seg, 'treatment.json'), String(W0), String(W1), songFile]);
  // a repeated chorus takes an earlier segment's picture at merge (merge.mts): nothing to make
  if (s.reuse) return writeFileSync(join(seg, 'reuse.json'), JSON.stringify({ from: `seg${String(s.reuse).padStart(2, '0')}` }));
  cpSync(assets, join(seg, 'assets'), { recursive: true });
  writeFileSync(join(seg, 'feedback.txt'), `這是整首歌的第 ${k + 1}/${plan.segments.length} 段（${W0.toFixed(1)}–${W1.toFixed(1)} 秒），只做這一段。
整首的故事：${plan.story}
整首共用的人物（已經畫好在素材庫，用 f.img('<id>')）：${plan.characters.map((c) => `${c.id}（${c.who}；姿勢：${c.poses.map((p) => p.id).join('、')}）`).join('；')}。要新的狀態圖時，描述成同一個人。
${k ? `上一段演的是：${plan.segments[k - 1].event}\n` : ''}這一段只演一個事件：${s.event}
${k < plan.segments.length - 1 ? `下一段會演：${plan.segments[k + 1].event}\n` : ''}- 觀眾不看說明也要看得懂這個事件；人物一看就認得出是誰。
- 不要沒有理由一直移動的物件、不要隨拍跳動的圓點、不要配角事件。
- 歌詞不能被人物或物件擋住，字不要切過人物；淺底上不要用白字。
`);
  lines.push(`${seg} ${W0} ${W1}`);
});
writeFileSync(join(dir, 'segments.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
