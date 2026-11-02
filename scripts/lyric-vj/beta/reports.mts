// The reports still to review, as text to read and classify: where each came from and what the person said. Read-only.
// Suggested handling goes in <root>/proposals.json ({ "<report id>": { "summary": "...", "items": [{ "outcome": "code|rule|check|song",
// "text": "...", "scope": "director|typeplan|both" }] } }); the admin page shows it, and only the admin's click applies it.
// usage: npx tsx scripts/lyric-vj/beta/reports.mts [--root out/beta] [--all]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { type Feedback, isPending } from './feedback.mts';

interface View { songs: { id: string; title: string }[]; feedback: Feedback[]; lessons?: { text: string; scope: string }[] }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The reports as markdown, oldest first (`all`: the reviewed ones too), then the rules in force so a proposal does not repeat one. */
export function reportsText(db: View, all = false): string {
  const list = db.feedback.filter((f) => all || isPending(f));
  const title = (id: string) => db.songs.find((s) => s.id === id)?.title ?? id;
  const blocks = list.map((f) => [
    `## ${f.id} · ${title(f.songId)} · ${f.tier ?? '?'} · ${f.style ?? '?'} · ${f.ok ? '沒問題' : '有問題'}`,
    `job ${f.jobId} · ${f.createdAt.slice(0, 10)} · 處理 ${f.action}${f.fixJobId ? ` · 修正 ${f.fixJobId}` : ''}${f.triage ? ` · 已歸類 ${f.triage.outcomes.join(',')}` : ''}`,
    ...f.marks.map((m) => `- ${mmss(m.at)}${m.end !== undefined ? `–${mmss(m.end)}` : ''} ${m.category}${m.note ? `：${m.note}` : ''}`),
    ...(f.suggestion ? [`整體：${f.suggestion}`] : []),
  ].join('\n'));
  const rules = (db.lessons ?? []).map((l) => `- [${l.scope}] ${l.text}`);
  return [`# ${all ? '全部回報' : '待處理回報'} · ${list.length}`, ...blocks, `# 現有規則 · ${rules.length}`, ...rules].join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { root: { type: 'string', default: 'out/beta' }, all: { type: 'boolean', default: false } } });
  console.log(reportsText(JSON.parse(readFileSync(join(values.root!, 'db.json'), 'utf8')) as View, values.all));
}
