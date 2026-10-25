// What the 534 analysed lyric VJs did, as concrete examples for a director short of ideas: the techniques whose
// description is nearest the song (its lyrics, its language), each with the video and the second it is seen at.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface Technique { category: string; name: string; how: string; when?: string; why?: string; at_sec?: number }
interface VideoRecord { techniques?: Technique[]; design_score?: number; standout?: string; _video?: { artist: string; title: string; url: string } }

export const DB_DIR = join(homedir(), 'vjanalytics', 'out_tech');

const bigrams = (s: string) => {
  const t = s.replace(/\s+/g, '');
  return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
};
const mmss = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The `n` techniques nearest the query (bigram overlap with name, how and when, a little weight for well-made videos),
 * at most one per video so the list is many designers' ideas, not one video's.
 */
export function techniqueRefs(query: string, n = 24, dir = DB_DIR): string[] {
  if (!existsSync(dir)) return [];
  const q = bigrams(query);
  const rows: { score: number; video: string; line: string }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as VideoRecord;
    const v = r._video;
    if (!v) continue;
    for (const t of r.techniques ?? []) {
      let hit = 0;
      for (const b of bigrams(`${t.name}${t.how}${t.when ?? ''}`)) if (q.has(b)) hit++;
      if (!hit) continue;
      const url = `${v.url}${t.at_sec ? `&t=${Math.floor(t.at_sec)}s` : ''}`;
      rows.push({ score: hit * (1 + (r.design_score ?? 5) / 20), video: v.url, line: `${v.artist}「${v.title}」${mmss(t.at_sec)}（${url}）：${t.name}——${t.how}${t.when ? `（用在：${t.when}）` : ''}` });
    }
  }
  const seen = new Set<string>();
  return rows
    .sort((a, b) => b.score - a.score)
    .filter((r) => !seen.has(r.video) && seen.add(r.video))
    .slice(0, n)
    .map((r) => r.line);
}
