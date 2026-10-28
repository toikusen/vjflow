// How the type planner treats the stretches nobody sings: backdrop (no figures, props or illustrations) unless the
// director wrote a story reason for pictures there (direct.mts → treatment.interludes). Pure helpers for typeplan.mts.
import type { UnsungWindow } from '../../src/app/lyric-vj/structure';
import type { Interlude } from '../../src/app/lyric-vj/treatment';
import { MIN_REASON } from './brief.mts';

const KIND_NAME: Record<UnsungWindow['kind'], string> = { intro: '前奏', interlude: '間奏', outro: '尾奏' };
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const span = (x: { start: number; end: number }) => `${x.start.toFixed(1)}–${x.end.toFixed(1)} 秒`;

export interface WindowMode extends UnsungWindow { mode: Interlude['mode']; reason: string }

/**
 * Each unsung window with the director's decision: the interludes entry overlapping it most. A window with no entry,
 * or a pictures entry whose reason is under MIN_REASON characters, counts as backdrop.
 */
export function windowModes(windows: UnsungWindow[], interludes: Interlude[] = []): WindowMode[] {
  return windows.map((w) => {
    const x = interludes.map((e) => ({ e, o: overlap(e, w) })).filter((h) => h.o > 0).sort((a, b) => b.o - a.o)[0]?.e;
    const reason = typeof x?.reason === 'string' ? x.reason.trim() : '';
    const pictures = x?.mode === 'pictures' && [...reason].length >= MIN_REASON;
    return { ...w, mode: pictures ? 'pictures' : 'backdrop', reason: pictures ? reason : '' };
  });
}

/**
 * Drops the sprite from every cut whose [at, end) lies entirely inside a backdrop window; a cut touching sung time
 * or a pictures window keeps it. Returns new cut objects and how many sprites were removed.
 */
export function stripUnsungSprites<C extends { at: number; end: number; sprite?: string }>(cuts: C[], windows: UnsungWindow[], interludes?: Interlude[]): { cuts: C[]; removed: number } {
  const backdrop = windowModes(windows, interludes).filter((w) => w.mode === 'backdrop');
  let removed = 0;
  const out = cuts.map((c) => {
    if (!c.sprite || !backdrop.some((w) => c.at >= w.start && c.end <= w.end)) return c;
    removed++;
    const { sprite: _, ...rest } = c;
    return rest as C;
  });
  return { cuts: out, removed };
}

/**
 * The planner's rule for unsung stretches: no readable words, carried by backdrop changes, graphics and rhythm,
 * no figures, props or illustrations; a pictures window is named with the director's reason quoted.
 */
export function unsungRule(windows: UnsungWindow[], interludes?: Interlude[]): string {
  const base = '沒人唱的地方（前奏、間奏、尾奏）不要出現看得清楚的詞，用背景換段、圖形和節奏撐，不放人物、道具或插圖。';
  const modes = windowModes(windows, interludes);
  const quiet = modes.filter((w) => w.mode === 'backdrop');
  const pictures = modes.filter((w) => w.mode === 'pictures');
  const list = quiet.length ? `這首歌沒人唱的段落：${quiet.map((w) => `${span(w)}（${KIND_NAME[w.kind]}）`).join('、')}，這些時間裡的刀 sprite 留空字串，keep 的道具也不要只落在這些時間裡。` : '';
  const allowed = pictures.length ? `只有美術指導寫了理由的段落可以放人物或道具，畫面要照著理由走：${pictures.map((w) => `${span(w)}（${KIND_NAME[w.kind]}），理由：「${w.reason}」`).join('；')}。` : '';
  return base + list + allowed;
}

/**
 * When cut i of a shot really ends: at the first later cut that lands (at least `gap` after it and before the shot's
 * last 0.05 s, as buildCuts decides), else at the shot's end. `times` are the shot's cut times in order.
 */
export function landedEnd(times: number[], i: number, gap: number, shotEnd: number): number {
  return times.slice(i + 1).find((x) => x >= times[i] + gap && x < shotEnd - 0.05) ?? shotEnd;
}
