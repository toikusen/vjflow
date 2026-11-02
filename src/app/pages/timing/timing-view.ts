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

/**
 * The `beforeunload` handler: with unsaved changes the browser asks before the page goes (a tab closed, the back
 * button, a tap on the shell's bottom tabs); otherwise it lets it go. The same shape the list page uses for an upload.
 */
export const leaveGuard = (dirty: () => boolean) => (e: { preventDefault(): void }): void => {
  if (dirty()) e.preventDefault();
};

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
 * The status column: the selected line while it is being sung reads 「選取 · 正在聽」; otherwise red is 需要你確認
 * (the check disagrees; a listen and 「我確認沒問題」 clears it), yellow 建議確認, and a clean line says whether a person
 * vouched for it or the check merely found nothing.
 */
export function lineTag(status: LineStatus, o: { listening: boolean; verified: boolean }): LineTag {
  if (o.listening) return { icon: '●', label: '選取 · 正在聽', tone: 'now' };
  if (status === 'red') return { icon: '!', label: '需要你確認', tone: 'bad' };
  if (status === 'yellow') return { icon: '?', label: '建議確認', tone: 'warn' };
  return { icon: '✓', label: o.verified ? '已人工確認' : '系統未發現問題', tone: 'ok' };
}

/** The status column in a local song: no check ran, so a line is estimated, set by the person, or as its file had it. */
export function localTag(status: LineStatus, o: { listening: boolean; verified: boolean }): LineTag {
  const tag = lineTag(status, o);
  if (o.listening) return tag;
  if (status === 'yellow') return { ...tag, label: '估算的' };
  return { ...tag, label: o.verified ? '已對過' : '歌詞檔的時間' };
}

/** A count chip; its tones are the shared status chip's (no 'now'). */
export interface CountChip { icon: string; label: string; tone: 'bad' | 'warn' | 'ok' }

/** The three count chips of the top bar (and the phone's player). */
export function countChips(c: { red: number; yellow: number; ok: number }): CountChip[] {
  return [
    { icon: '!', label: `${c.red} 句需要你確認`, tone: 'bad' },
    { icon: '?', label: `${c.yellow} 句建議確認`, tone: 'warn' },
    { icon: '✓', label: `${c.ok} 句未發現問題`, tone: 'ok' },
  ];
}

/** The chips of a local song: nothing checks it against a vocal stem, so there is no red and no 未發現問題 to report. */
export function localChips(c: { yellow: number; ok: number }): CountChip[] {
  return [
    { icon: '?', label: `${c.yellow} 句是估算的`, tone: 'warn' },
    { icon: '✓', label: `${c.ok} 句有時間`, tone: 'ok' },
  ];
}

/** Why 確認時間軸 is off, shown as text beside it (a tooltip never reaches a phone); empty when it is on. */
export function confirmBlocker(red: number): string {
  return red > 0 ? `還有 ${red} 句需要你確認` : '';
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
  if (red > 0) return confirmBlocker(red);
  if (yellow > 0) return `還有 ${yellow} 句建議確認`;
  return '目前沒有需要確認的句子';
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
  { keys: 'Enter', what: '把選取這句的開始設為現在，並跳到下一句' },
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

/** One channel's loudest sample per 10 ms: what the waveform draws. */
export function peaksOf(samples: Float32Array, rate: number): Float32Array {
  const hop = Math.round(rate / 100);
  const peaks = new Float32Array(Math.floor(samples.length / hop));
  for (let i = 0; i < peaks.length; i++) {
    let m = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) m = Math.max(m, Math.abs(samples[j]));
    peaks[i] = m;
  }
  return peaks;
}

/** What a running job is making, as the read-only banner names it; jobs of other kinds never lock the editor. */
const BUSY_KIND: Partial<Record<string, string>> = { concept: '概念', make: '影片', fix: '修正' };

export interface BusyLock { kind: string; message: string }

/**
 * Whether this song's timing must stay as it is: a concept, video or fix queued or running for it reads the lines
 * the server holds now (server.mts refuses a save then). Null when nothing is in the way.
 */
export function busyLock(jobs: readonly { songId: string; kind: string; status: string }[], songId: string): BusyLock | null {
  const job = jobs.find((j) => j.songId === songId && BUSY_KIND[j.kind] && (j.status === 'queued' || j.status === 'running'));
  if (!job) return null;
  const kind = BUSY_KIND[job.kind]!;
  return { kind, message: `${kind}製作中，完成後才能改時間` };
}

/** The localStorage key that remembers the 「怎麼檢查」 guide was shown once (later visits start it folded). */
export const GUIDE_SEEN_KEY = 'timing-guide-seen';

/** Reads a stored '1' flag; storage that is missing or throws (private mode, blocked site data) reads as unset. */
export function readFlag(read: () => string | null): boolean {
  try {
    return read() === '1';
  } catch {
    return false;
  }
}

/** Stores a flag where storage allows; a refusal is ignored (the page works the same, only without the memory). */
export function writeFlag(write: () => void): void {
  try {
    write();
  } catch {
    // storage unavailable: nothing to remember
  }
}

/**
 * Wraps an async task so a call made while the previous one is still running is skipped (resolves at once): a poll
 * then never has two requests in flight, so an older reply cannot land after a newer one.
 */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  };
}

/**
 * Which rows the list renders. With `onlyProblems` off, every row; on, the red and yellow lines plus the selected one
 * (a line stays on screen while it is being edited). When no red or yellow line is left, nothing: the list then says
 * there is nothing to check. Hidden rows stay in the lines; they are only not drawn.
 */
export function visibleRows(statuses: readonly LineStatus[], selected: number, onlyProblems: boolean): boolean[] {
  if (!onlyProblems) return statuses.map(() => true);
  if (!statuses.some((s) => s !== 'ok')) return statuses.map(() => false);
  return statuses.map((s, i) => s !== 'ok' || i === selected);
}

/** The next line still to check after `from` (red first, then yellow), wrapping around and skipping hidden rows. */
export function nextProblemIndex(statuses: readonly LineStatus[], from: number, shown?: readonly boolean[]): number | undefined {
  const n = statuses.length;
  const order = Array.from({ length: n }, (_, k) => (from + 1 + k) % n).filter((j) => shown?.[j] ?? true);
  return order.find((j) => statuses[j] === 'red') ?? order.find((j) => statuses[j] === 'yellow');
}

/** ↑/↓: the nearest shown row above (-1) or below (+1) `from`; stays on `from` when there is none. */
export function stepRow(shown: readonly boolean[], from: number, dir: 1 | -1): number {
  for (let j = from + dir; j >= 0 && j < shown.length; j += dir) if (shown[j]) return j;
  return from;
}
