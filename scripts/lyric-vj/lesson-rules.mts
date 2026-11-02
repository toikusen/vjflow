// The rules the admin wrote from what people said about finished videos (beta: /beta/admin/lessons → <root>/lessons.json),
// as the block the director (direct.mts) and the type planner (typeplan.mts) read. Raw feedback never reaches a prompt:
// only a rule the admin wrote for every song (the beta v2 spec: bad ideas and one song's tricks must not become global).
import { existsSync, readFileSync } from 'node:fs';

export type LessonScope = 'director' | 'typeplan' | 'both';
export interface Lesson { id: string; text: string; scope: LessonScope; createdAt?: string; feedbackId?: string; songId?: string; style?: string; by?: string }

/** The lessons in a file written by the beta server ({ lessons: [...] } or a bare array); [] when missing or unreadable. */
export function readLessons(file?: string): Lesson[] {
  if (!file || !existsSync(file)) return [];
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as Lesson[] | { lessons?: Lesson[] };
    const list = Array.isArray(j) ? j : j.lessons ?? [];
    return list.filter((l) => l && typeof l.text === 'string' && l.text.trim() && ['director', 'typeplan', 'both'].includes(l.scope));
  } catch {
    return [];
  }
}

/**
 * The prompt block for one reader: every rule in its scope (and `both`), newest first; '' when
 * there are none, so a prompt without lessons stays exactly as it was.
 */
export function lessonsBlock(lessons: Lesson[], reader: 'director' | 'typeplan'): string {
  const mine = lessons.filter((l) => l.scope === reader || l.scope === 'both').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  if (!mine.length) return '';
  return `\n\n【使用者回饋整理出的規則（每一首都要遵守）】\n${mine.map((l) => `- ${l.text.trim()}`).join('\n')}`;
}
