import { TimingIssue } from '../../lyric-vj/timing-qa';

// Pure view helpers for the timing page (2c/2e): copy and formatting only, no editing logic.

export type LineStatus = 'red' | 'yellow' | 'ok';
export type TagTone = 'ok' | 'warn' | 'bad' | 'now';
export interface LineTag { icon: string; label: string; tone: TagTone }

/** The player's big readout: minutes:seconds and the hundredths apart (`0:27` + `.82`); always the same width. */
type TimedLine = { start: number; end: number; text: string; singer?: string };
/** Whether a save would change the timing as the beta server keys it (each line's start, end, text and singer; timingKey in server.mts). */
export const timingChanged = (before: readonly TimedLine[], after: readonly TimedLine[]): boolean =>
  before.length !== after.length || after.some((c, i) => c.start !== before[i].start || c.end !== before[i].end || c.text !== before[i].text || (c.singer ?? null) !== (before[i].singer ?? null));

/** A beta tester's song page, where the editor goes back to and where a confirmed timing sends them. */
export const songPageHref = (songId: string): string => `/my/song?id=${encodeURIComponent(songId)}`;

export function clock(t: number): { main: string; frac: string } {
  const s = Math.max(0, t);
  const whole = Math.floor(s);
  return { main: `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`, frac: `.${String(Math.floor((s - whole) * 100)).padStart(2, '0')}` };
}

/** `3:52` for a song length or a line's place in the song. */
export function clockShort(t: number): string {
  return clock(t).main;
}

/** Seconds with three decimals, as the table and the steppers show them (never a thousands separator). */
export function sec(t: number): string {
  return t.toFixed(3);
}

/** `01`, `02`, … the row numbers. */
export function rowNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/**
 * The status column: the selected line while it is being sung reads 「選中 · 正在聽」; otherwise red is 必須修正,
 * yellow 建議確認, and a confirmed line says whether a person vouched for it.
 */
export function lineTag(status: LineStatus, o: { listening: boolean; verified: boolean }): LineTag {
  if (o.listening) return { icon: '●', label: '選中 · 正在聽', tone: 'now' };
  if (status === 'red') return { icon: '!', label: '必須修正', tone: 'bad' };
  if (status === 'yellow') return { icon: '?', label: '建議確認', tone: 'warn' };
  return { icon: '✓', label: o.verified ? '已人工確認' : '已確認', tone: 'ok' };
}

export interface Hint {
  /** Text before the time; `value` is shown in Mono after it, then `after`. */
  before: string;
  value?: number;
  after: string;
  /** The button that applies `value` (absent when there is nothing to apply). */
  take?: string;
  /** The button that keeps the line as it is (marks it checked). */
  keep: string;
}

const diff = (a: number, b: number) => String(+Math.abs(a - b).toFixed(2));

/**
 * The line under a row that needs a look: what the checker heard and how far it is from the lyric sheet, with a
 * one-click fix; the aligner's alternative when the two disagreed; otherwise only the reason.
 */
export function hint(cue: { start: number; altStart?: number }, check: { issues: TimingIssue[]; suggestedStart?: number } | undefined, status: LineStatus, reason: string): Hint | null {
  if (status === 'ok') return null;
  const keep = status === 'red' ? '我確認沒問題' : '保留現在的';
  const s = check?.suggestedStart;
  if (s !== undefined) return { before: '系統聽到的開始時間是 ', value: s, after: `，和歌詞排版差 ${diff(s, cue.start)} 秒`, take: `改成 ${s.toFixed(2)}`, keep };
  if (cue.altStart !== undefined) return { before: '另一個對齊結果的開始時間是 ', value: cue.altStart, after: `，差 ${diff(cue.altStart, cue.start)} 秒`, take: `試 ${cue.altStart.toFixed(2)}`, keep };
  return { before: reason, after: '', keep };
}

/** The bottom line of the left column: what is still to check, worst first. */
export function remaining(red: number, yellow: number): string {
  if (red > 0) return `還有 ${red} 句必須修正`;
  if (yellow > 0) return `還有 ${yellow} 句建議確認`;
  return '每一句都確認好了';
}

/** Under the big time: which line is playing and how long the song is. */
export function playingLabel(index: number, playing: boolean, duration: number): string {
  const where = index < 0 ? '還沒開始' : `${playing ? '正在聽' : '停在'}第 ${index + 1} 句`;
  return `${where} · ${clockShort(duration)}`;
}

export interface Shortcut { keys: string; what: string }

/** Every keyboard shortcut of the editor, for the 更多 menu. */
export const SHORTCUTS: Shortcut[] = [
  { keys: 'Space', what: '播放／暫停' },
  { keys: 'Enter', what: '把選中這句的開始設為現在，並跳到下一句' },
  { keys: 'N', what: '跳到下一個待確認' },
  { keys: '← →', what: '微調開始 0.05 秒' },
  { keys: 'Shift ← →', what: '微調結束 0.05 秒' },
  { keys: 'Alt ← →', what: '微調時臨時反轉「後面一起移」' },
  { keys: '↑ ↓', what: '選上一句／下一句' },
  { keys: 'Q W', what: '聽開始前／後半秒' },
  { keys: 'E D', what: '聽結束前／後半秒' },
  { keys: 'L', what: '循環這一句' },
  { keys: '[ ]', what: '放慢／加快' },
  { keys: '⌘ Z', what: '復原（⌘ Shift Z 或 ⌘ Y 重做）' },
  { keys: '拖曳波形', what: '移動句子邊界：拉長會推開相連的句子，縮短只動這一句' },
  { keys: 'Shift 拖曳', what: '吸附到拍點、人聲起音或其他句子的邊界' },
  { keys: 'Alt 拖曳', what: '臨時切換「後面一起移」' },
  { keys: '滾輪', what: '放大縮小波形；左右滑或 Shift＋滾輪前後移動' },
];
