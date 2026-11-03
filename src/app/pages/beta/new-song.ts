// What the new-song screen decides by itself: which lines of the sheet are sung, the song's name and language, when
// the song is saved, and what the status strip says. Nothing here touches the server.
import { draftLines, HEADING, parseLyrics, placeLines } from '../../lyric-vj/free-lyrics';
import { songFromLines } from '../../lyric-vj/free-song';
import type { SongTimeline } from '../../lyric-vj/timeline';

export type SongLanguage = 'ja' | 'zh' | 'en' | 'ko';

/** A line of the lyric sheet: a sung line, or a heading / section label the video never shows. */
export interface SheetRow { text: string; kind: 'line' | 'heading' | 'section' | 'blank' }

/** `[Verse]`, `[Chorus 2]`, `[ti:…]`: a label alone on its line that is not a time stamp. */
const SECTION = /^\[[^\]\n]*\]$/;
const STAMP = /^\[\s*\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\s*\]$/;

/** The sheet's lines as the person sees them, each marked by what the video does with it (parseLyrics decides the same way). */
export function sheetRows(text: string): SheetRow[] {
  return text.split(/\r\n?|\n/).map((raw): SheetRow => {
    const line = raw.trim();
    if (!line) return { text: raw, kind: 'blank' };
    if (HEADING.test(line)) return { text: raw, kind: 'heading' };
    if (SECTION.test(line) && !STAMP.test(line)) return { text: raw, kind: 'section' };
    return { text: raw, kind: 'line' };
  });
}

/** The tempo a preview with no audio is laid on, and the rest where the sheet starts a new part, beats. */
export const PREVIEW_BPM = 96;
const PREVIEW_BREAK = 4;

/**
 * The lyrics alone as a song to watch before the audio is in: each line held by its length (draftLines), a bar's rest
 * where the sheet starts a new part (a section label or a blank line), at an even tempo. Lyrics with their own stamps
 * keep them. Throws like parseLyrics, and when there is no line.
 */
export function previewSong(lyrics: string, title: string): SongTimeline {
  const { lines } = parseLyrics(lyrics);
  const o = { title: title.trim() || '歌詞預覽', bpm: PREVIEW_BPM };
  const placed = placeLines(lines);
  if (placed) return songFromLines(placed, o);
  const drafted = draftLines(lines, PREVIEW_BPM);
  const breaks = partBreaks(lyrics);
  // the sheet and the parse disagree only on rows the sheet cannot judge alone: then no rests, never misplaced ones
  const rest = breaks.length === drafted.length ? (60 / PREVIEW_BPM) * PREVIEW_BREAK : 0;
  let shift = 0;
  return songFromLines(drafted.map((l, i) => ({ ...l, start: l.start! + (shift += breaks[i] ? rest : 0) })), o);
}

/** For each sung row of the sheet: whether a new part starts at it (a section label or a blank line since the last sung row). */
function partBreaks(text: string): boolean[] {
  const out: boolean[] = [];
  let gap = false;
  for (const r of sheetRows(text)) {
    if (r.kind === 'line') {
      out.push(gap && out.length > 0);
      gap = false;
    } else if (r.kind !== 'heading') gap = true;
  }
  return out;
}

/** A file's name without its extension. */
export const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').trim();

/** The song's name: the first `# 標題` of the lyrics, else the audio file's name; empty with neither. */
export function guessTitle(lyrics: string, fileName: string): string {
  for (const raw of lyrics.split(/\r\n?|\n/)) {
    const m = HEADING.exec(raw.trim());
    if (m) return m[1].trim().slice(0, 120);
  }
  return fileName ? fileTitle(fileName).slice(0, 120) : '';
}

const KANA = /[぀-ヺー-ヿ]/g;
const HANGUL = /[가-힯]/g;
const HAN = /[一-鿿]/g;
const LATIN = /[A-Za-z]/g;

/**
 * The language the lyrics are written in, by their script (the same rule the director's songScript uses): kana makes
 * Japanese, Korean letters Korean, Chinese characters Chinese, anything else English. Empty text answers ''.
 */
export function guessLanguage(text: string): SongLanguage | '' {
  // section labels (`[Verse]`) are not sung, and would read as English
  const sung = sheetRows(text).filter((r) => r.kind !== 'section').map((r) => r.text).join('\n');
  const n = (re: RegExp) => (sung.match(re) ?? []).length;
  const [kana, hangul, han, latin] = [n(KANA), n(HANGUL), n(HAN), n(LATIN)];
  if (!kana && !hangul && !han && !latin) return '';
  if (hangul >= Math.max(kana, han, latin / 3)) return 'ko';
  if (kana > 0 && kana >= han * 0.15) return 'ja';
  if (han >= latin / 3) return 'zh';
  return 'en';
}

/** How long the lyrics rest before the song is saved and its audio sent, ms. */
export const SAVE_REST = 4000;

export interface SaveState { file: boolean; lines: number; title: string; problem: string; saved: boolean }

/** Whether the song can be saved now: audio, sung lines, a name, nothing wrong with the lyrics, and not saved yet. */
export const canSave = (s: SaveState): boolean => s.file && s.lines > 0 && !!s.title.trim() && !s.problem && !s.saved;

/** Where the song stands between the browser and the server, for the strip. */
export interface StripInput {
  /** The upload's progress 0–100 while it runs; null before it starts. */
  uploadPct: number | null;
  /** Why the upload failed, when it did. */
  uploadError: string;
  uploaded: boolean;
  /** The preparation's remaining estimate, whole minutes; the prep estimate when unknown. */
  prepFailed: boolean;
  /** The server's timing is in: the picture runs on it and the export is open. */
  aligned: boolean;
}

export interface StripStep { label: string; state: 'next' | 'now' | 'done' | 'bad' }

/** The three cells of the status strip, in the order they light up: the upload, the save and alignment, the export. */
export function stripSteps(x: StripInput): StripStep[] {
  const upload: StripStep = x.uploadError
    ? { label: `上傳失敗：${x.uploadError}`, state: 'bad' }
    : x.uploaded ? { label: '已上傳', state: 'done' }
      : x.uploadPct === null ? { label: '上傳', state: 'next' }
        : { label: `上傳 ${Math.min(99, Math.max(0, Math.round(x.uploadPct)))}%`, state: 'now' };
  const align: StripStep = !x.uploaded
    ? { label: '對準歌詞時間', state: 'next' }
    : x.prepFailed ? { label: '對準失敗，到歌曲頁重新上傳', state: 'bad' }
      : x.aligned ? { label: '已存到我的歌曲', state: 'done' }
        : { label: '已存到我的歌曲 · 對準歌詞時間中', state: 'now' };
  const out: StripStep = x.aligned ? { label: '時間已對準，可以匯出', state: 'done' } : { label: '可以匯出', state: 'next' };
  return [upload, align, out];
}

/** `m:ss` for the transport and the file line. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Sends a file with `PUT`, reporting progress as the browser sends it (fetch cannot). Resolves with the status and the
 * body; rejects only when the connection broke, so a refusal is read by the caller like a fetch's.
 */
export function putWithProgress(url: string, file: Blob, type: string, onProgress: (pct: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 100); };
    xhr.onload = () => ok({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => fail(new Error('連線中斷，請確認網路後再試'));
    xhr.onabort = () => fail(new Error('上傳中斷'));
    xhr.send(file);
  });
}
