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
 * The story writer's rule for frames over unsung stretches (keyframes.mts): a backdrop window shows only the place,
 * light, weather and time passing; a pictures window keeps people and props, named with the director's reason.
 */
export function unsungFrameRule(windows: UnsungWindow[], interludes?: Interlude[]): string {
  const old = '沒有歌詞的時段（前奏、間奏、尾奏）也要有畫面推進：一格最多停 9 秒；那裡的格 cue 寫「@秒數」（例如 @24.5），交代時間推移或停在結果。';
  const modes = windowModes(windows, interludes);
  const quiet = modes.filter((w) => w.mode === 'backdrop');
  const pictures = modes.filter((w) => w.mode === 'pictures');
  if (!modes.length || !quiet.length && !pictures.length) return old;
  if (!quiet.length) return `${old}這些時段美術指導寫了理由，可以放人物或道具，畫面要照著理由走：${pictures.map((w) => `${span(w)}（${KIND_NAME[w.kind]}），理由：「${w.reason}」`).join('；')}。`;
  const back = `沒有歌詞的時段也要有畫面推進：${quiet.map((w) => `${span(w)}（${KIND_NAME[w.kind]}）`).join('、')}只畫地點、光線、天氣和時間的推移，不放人物、道具；一格最多停 9 秒，那裡的格 cue 寫「@秒數」（例如 @24.5）。`;
  if (!pictures.length) return back;
  return `${back}另外${pictures.map((w) => `${span(w)}（${KIND_NAME[w.kind]}）`).join('、')}美術指導寫了理由，可以放人物或道具，一格最多停 9 秒，cue 一樣寫「@秒數」，畫面要照著理由走：${pictures.map((w) => `理由：「${w.reason}」`).join('；')}。`;
}

/**
 * Clears `who` on every story frame whose moment (an '@seconds' cue, or the start of the sung cue it names) lies inside
 * a backdrop window; frames in pictures windows and in sung time keep their people. Returns new frame objects.
 */
export function quietFrames<F extends { cue: string; who: string[] }>(frames: F[], windows: UnsungWindow[], interludes: Interlude[] | undefined, cues: { id: string; start: number }[]): { frames: F[]; cleared: number; clearedFrames: F[] } {
  const backdrop = windowModes(windows, interludes).filter((w) => w.mode === 'backdrop');
  const clearedFrames: F[] = [];
  const out = frames.map((f) => {
    const t = f.cue.startsWith('@') ? Number(f.cue.slice(1)) : cues.find((c) => c.id === f.cue)?.start;
    if (t === undefined || !f.who.length || !backdrop.some((w) => t >= w.start && t < w.end)) return f;
    clearedFrames.push(f);
    return { ...f, who: [] };
  });
  return { frames: out, cleared: clearedFrames.length, clearedFrames };
}

/**
 * When cut i of a shot really ends: at the first later cut that lands (at least `gap` after it and before the shot's
 * last 0.05 s, as buildCuts decides), else at the shot's end. `times` are the shot's cut times in order.
 */
export function landedEnd(times: number[], i: number, gap: number, shotEnd: number): number {
  return times.slice(i + 1).find((x) => x >= times[i] + gap && x < shotEnd - 0.05) ?? shotEnd;
}
