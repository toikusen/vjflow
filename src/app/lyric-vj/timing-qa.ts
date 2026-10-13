// Per-line timing check against the vocal stem: a line must appear when the voice comes in and stay until it is sung.
// Used by the pipeline (block a render with unchecked lines) and by the timing editor (red rows, suggested fixes).
import { phraseStarts } from './timeline';

export type TimingIssue = 'early' | 'late' | 'cut' | 'silent';

export interface LineCheck {
  id: string;
  ok: boolean;
  issues: TimingIssue[];
  /** Where singing actually resumes nearest to the line start, if that is the likely fix. */
  suggestedStart?: number;
}

/** Tolerance for a line start against the vocal onset (seconds). */
export const START_TOL = 0.15;
const FPS = 100;

/**
 * - early: no singing in the first 0.3 s after the line appears (text before the voice)
 * - late: singing already started more than START_TOL before the line appears
 * - cut: the voice is still going when the line disappears and the next line is not up yet
 * - silent: no singing anywhere inside the line (wrong place entirely)
 */
export function checkLines(cues: { id: string; start: number; end: number }[], active: boolean[]): LineCheck[] {
  const phrases = phraseStarts(active, FPS);
  const on = (a: number, b: number) => {
    for (let i = Math.max(0, Math.floor(a * FPS)); i < Math.min(active.length, Math.ceil(b * FPS)); i++) if (active[i]) return true;
    return false;
  };
  return cues.map((c, k) => {
    const issues: TimingIssue[] = [];
    const next = cues[k + 1];
    if (!on(c.start, c.end)) issues.push('silent');
    else {
      if (!on(c.start, c.start + 0.3)) issues.push('early');
      // singing in the stretch just before the line, after the previous line ended, belongs to this line
      const prevEnd = k > 0 ? cues[k - 1].end : 0;
      const before = phrases.filter((p) => p < c.start - START_TOL && p >= Math.max(prevEnd, c.start - 1.5));
      if (before.length) issues.push('late');
      const gapAfter = next ? next.start - c.end : Infinity;
      if (gapAfter > 0.4 && on(c.end, c.end + 0.25) && on(c.end - 0.25, c.end)) issues.push('cut');
    }
    let suggestedStart: number | undefined;
    if (issues.includes('early') || issues.includes('late')) {
      const lo = k > 0 ? cues[k - 1].start + 0.2 : 0;
      const cand = phrases.filter((p) => p >= lo && p <= c.start + 2 && (!next || p < next.start));
      if (cand.length) suggestedStart = cand.reduce((b, p) => (Math.abs(p - c.start) < Math.abs(b - c.start) ? p : b));
    }
    return { id: c.id, ok: issues.length === 0, issues, suggestedStart };
  });
}

export const ISSUE_LABEL: Record<TimingIssue, string> = {
  early: '字幕比歌聲早',
  late: '字幕比歌聲晚',
  cut: '還在唱字幕就消失',
  silent: '這段時間沒有歌聲',
};

export interface TimingEdit {
  id: string;
  start: number;
  end: number;
  /** The line's text when the editor changed it, or for a line the editor added. */
  text?: string;
  /** Who sings it ('' = everyone / not set). */
  singer?: string;
}

/**
 * Applies the timing editor's lines to a song. The editor may delete lines (left out), add lines (a new id with its
 * text) and retype a line's text; every line has finite times inside the song, ascending starts and end > start, and
 * an end that runs into the next line is clamped to it. Edited, added and retyped lines become 'verified', and so do
 * `accepted` lines (the user checked them by ear: the vocal check can mistake humming or calls for singing). A retyped
 * line drops its per-character times (they belonged to the old text). With `confirm`, every review flag is cleared and
 * the song is marked confirmed.
 */
export function applyTimingEdit<S extends { duration: number; cues: (TimingEdit & { text?: string; confidence: string; review?: string[]; charStarts?: number[]; charTimed?: boolean; timingSource?: string; singer?: string })[]; timingConfirmedAt?: string; singers?: { name: string; color: string }[] }>(
  song: S,
  edits: TimingEdit[],
  confirm: boolean,
  now = new Date().toISOString(),
  accepted: string[] = [],
  singers?: { name: string; color: string }[],
): S {
  if (!edits.length) throw new Error('至少要有一行歌詞');
  if (singers !== undefined && (!Array.isArray(singers) || singers.length > 12 || singers.some((x) => typeof x?.name !== 'string' || !x.name.trim() || x.name.length > 20 || !/^#[0-9a-f]{6}$/i.test(x.color))))
    throw new Error('演唱者最多 12 位，每位要有名字（20 字內）和 #rrggbb 顏色');
  const names = new Set((singers ?? song.singers ?? []).map((x) => x.name.trim()));
  const byId = new Map(song.cues.map((c) => [c.id, c]));
  const ids = new Set<string>();
  edits.forEach((e, i) => {
    if (typeof e.id !== 'string' || !e.id || ids.has(e.id)) throw new Error(`第 ${i + 1} 行的 id 重複或缺少`);
    ids.add(e.id);
    if (!byId.has(e.id) && !(typeof e.text === 'string' && e.text.trim())) throw new Error(`第 ${i + 1} 行是新增的歌詞，需要文字`);
    if (e.text !== undefined && (typeof e.text !== 'string' || !e.text.trim() || e.text.length > 200)) throw new Error(`第 ${i + 1} 行的文字不能是空的（最多 200 字）`);
    if (![e.start, e.end].every(Number.isFinite) || e.start < 0 || e.end > song.duration + 1 || e.end <= e.start) throw new Error(`第 ${i + 1} 行的時間不合法`);
    if (i > 0 && e.start <= edits[i - 1].start) throw new Error(`第 ${i + 1} 行的開始時間必須晚於上一行`);
    if (e.singer && !names.has(e.singer)) throw new Error(`第 ${i + 1} 行的演唱者「${e.singer}」不在成員名單裡`);
  });
  // who sings: set from the edit when it says, else kept
  const sung = <C extends { singer?: string }>(c: C, e: TimingEdit): C => {
    if (e.singer === undefined) return c;
    const next = { ...c };
    if (e.singer) next.singer = e.singer;
    else delete next.singer;
    return next;
  };
  const cues = edits.map((e, i) => {
    const end = Math.min(e.end, edits[i + 1]?.start ?? e.end);
    const c = byId.get(e.id);
    if (!c) return sung({ id: e.id, start: +e.start.toFixed(3), end: +end.toFixed(3), text: e.text!.trim(), timingSource: 'lrc', confidence: 'verified' } as unknown as S['cues'][number], e);
    const changed = Math.abs(e.start - c.start) > 0.0005 || Math.abs(end - c.end) > 0.0005;
    const retyped = e.text !== undefined && e.text.trim() !== c.text;
    const next = { ...c, start: +e.start.toFixed(3), end: +end.toFixed(3) };
    if (retyped) {
      next.text = e.text!.trim();
      delete next.charStarts;
      delete next.charTimed;
    } else if (c.charStarts) {
      // word-by-word times move with the line and stay inside it
      next.charStarts = c.charStarts.map((t) => +Math.min(end - 0.05, Math.max(e.start, t + e.start - c.start)).toFixed(3));
    }
    const byUser = changed || retyped || accepted.includes(c.id);
    if (byUser) next.confidence = 'verified';
    if (byUser || confirm) delete next.review;
    return sung(next, e);
  });
  return { ...song, cues, ...(singers !== undefined ? { singers: singers.map((x) => ({ name: x.name.trim(), color: x.color.toLowerCase() })) } : {}), ...(confirm ? { timingConfirmedAt: now } : {}) };
}

/** Generation waits until the timing is confirmed in the editor, unless no line needs a check. */
export function timingGate(song: { cues: { review?: string[] }[]; timingConfirmedAt?: string; title: string }): string | null {
  if (song.timingConfirmedAt) return null;
  const n = song.cues.filter((c) => c.review?.length).length;
  return n ? `「${song.title}」還有 ${n} 行歌詞時間需要確認：請先到 /timing 校正並按「確認時間軸」` : null;
}

/**
 * Seconds a line is still up after the voice last sounds between its last sung character and the moment it leaves:
 * a held note or a backing vocal keeps it honest, an instrumental after it does not.
 */
export function silentTail(active: boolean[], lastSung: number, goneAt: number, fps = FPS): number {
  for (let i = Math.min(active.length, Math.ceil(goneAt * fps)) - 1; i >= Math.max(0, Math.floor(lastSung * fps)); i--) if (active[i]) return Math.max(0, goneAt - (i + 1) / fps);
  return Math.max(0, goneAt - lastSung);
}

/**
 * A line's end pulled back to where the voice last sounds in it (plus 0.15 s), when the timing runs on into silence:
 * the line then holds its breathing time after the real end, not after a gap. Never later than the given end, never
 * before 0.3 s after its last character starts.
 */
export function endAtVoice(cue: { end: number; charStarts?: number[]; start: number }, active: boolean[], fps = FPS): number {
  const last = cue.charStarts?.length ? cue.charStarts[cue.charStarts.length - 1] : cue.start;
  const quiet = silentTail(active, last, cue.end, fps);
  if (quiet < 0.2) return cue.end;
  return Math.max(last + 0.3, cue.end - quiet + 0.15);
}
