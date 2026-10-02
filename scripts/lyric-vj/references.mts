// References from the vjanalytics database (out/results/*.json): the most similar analysed lyric VJs and what they do.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DbEvent { section_id: string | null; text_observed: string | null; layout: string | null; entrance_animation: string | null; exit_animation: string | null; highlight_method: string | null; start_sec: number | null }
interface DbVideo {
  video_id: string;
  source: { artist: string; title: string };
  key_observations: string[];
  global_style: { visual_forms: string[]; palette_description: string | null; typography_style: string | null; recurring_motifs: string[]; overall_progression: string | null };
  sections: { section_id: string; music_section: string | null }[];
  design_patterns: { observed_condition: string | null; observed_action: string | null }[];
  text_events: DbEvent[];
}

const bigrams = (s: string) => {
  const t = s.replace(/\s+/g, '');
  return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
};

export function loadDb(dir: string): DbVideo[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

/** Top-N videos by bigram overlap of style text with the brief + lyrics; returns a compact text for the director. */
export function references(db: DbVideo[], query: string, top = 4): { text: string; ids: string[] } {
  const q = bigrams(query);
  const scored = db
    .map((v) => {
      const g = v.global_style;
      const text = [...g.visual_forms, g.palette_description ?? '', g.typography_style ?? '', ...g.recurring_motifs, g.overall_progression ?? '', ...v.key_observations].join(' ');
      let score = 0;
      for (const b of bigrams(text)) if (q.has(b)) score++;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
  const lines: string[] = [];
  for (const { v } of scored) {
    const g = v.global_style;
    lines.push(`■ ${v.video_id}｜${v.source.artist} - ${v.source.title}`);
    lines.push(`  配色：${g.palette_description}`);
    lines.push(`  字體：${g.typography_style}`);
    for (const p of v.design_patterns.slice(0, 4)) lines.push(`  模式：當「${p.observed_condition}」→「${p.observed_action}」`);
    const kind = new Map(v.sections.map((s) => [s.section_id, (s.music_section ?? '').toLowerCase()]));
    for (const e of v.text_events.filter((e) => kind.get(e.section_id ?? '')?.includes('chorus')).slice(0, 3)) {
      lines.push(`  副歌範例：「${(e.text_observed ?? '').slice(0, 20)}」構圖 ${e.layout}；入場 ${e.entrance_animation}；強調 ${e.highlight_method}`);
    }
  }
  return { text: lines.join('\n'), ids: scored.map((s) => s.v.video_id) };
}
