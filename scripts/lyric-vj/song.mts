// Song preparation: audio analysis (the app's own analyzer), lyric timing with a vocal-stem check, instrumental offset.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/song.mts --audio mix.mp3 [--instrumental inst.mp3] --vocals vocals.wav \
//   [--vocals-alt vocals_kim.wav] [--lrc lyrics.lrc] --title "artist - title" --out out/indigo
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeAudio } from '../../src/app/audio/audio-analyzer.service';
import { parseLyrics } from '../../src/app/lyrics/lyric-parser.service';
import { LyricSearchService } from '../../src/app/lyrics/lyric-search.service';
import { alignLyrics, alignMainLines, AsrWord, cleanLyricLine, combineTimings, ForcedLine, isShout, voteStarts, withoutAsides } from '../../src/app/lyric-vj/align';
import { checkLines, ISSUE_LABEL } from '../../src/app/lyric-vj/timing-qa';
import { alignOffset, beatStrengths, checkTiming, downbeats, holdToVoice, phraseStarts, snapToVoice, SongTimeline, TimelineCue, vocalActivity, voicedSpans } from '../../src/app/lyric-vj/timeline';
import { decode } from './media.mts';

const { values: a } = parseArgs({
  options: {
    audio: { type: 'string' }, instrumental: { type: 'string' }, vocals: { type: 'string' },
    lrc: { type: 'string' }, title: { type: 'string' }, out: { type: 'string' },
    lyrics: { type: 'string' }, language: { type: 'string', default: 'ja' }, // plain lyrics (one line per line) for Whisper alignment
    'vocals-alt': { type: 'string' }, // a second separation's vocal stem: enables the timing vote
    'no-lrclib': { type: 'boolean' }, // align the given --lyrics even when LRCLIB has synced lyrics (alignment tests)
  },
});
if (!a.audio || !a.vocals || !a.out) throw new Error('需要 --audio、--vocals、--out');
mkdirSync(a.out, { recursive: true });

const SR = 22050;
const mix = decode(a.audio, SR);
const analysis = await analyzeAudio({ sampleRate: SR, length: mix.length, numberOfChannels: 1, getChannelData: () => mix });
const ENERGY_FPS = 10;
const energy = Array.from({ length: Math.ceil(analysis.duration * ENERGY_FPS) }, (_, i) => {
  const f = analysis.frames[Math.min(analysis.frames.length - 1, Math.round(i / ENERGY_FPS / analysis.frameInterval))];
  return +f.energy.toFixed(3);
});

// Lyrics: a given LRC is trusted; LRCLIB synced lyrics must pass the vocal-stem check.
const active = vocalActivity(decode(a.vocals, SR), SR);
let cues: TimelineCue[];
let check;
let voted = false;
const toCues = (text: string, source: TimelineCue['timingSource']) =>
  parseLyrics(text, analysis.duration).cues.map((c, i) => ({ id: `c${String(i + 1).padStart(3, '0')}`, ...c, timingSource: source, confidence: 'verified' as const }));
const py = (pkgs: string[], script: string, args: string[]) =>
  execFileSync('uv', ['run', '-q', ...pkgs.flatMap((x) => ['--with', x]), 'python', `scripts/lyric-vj/${script}`, ...args], { stdio: ['ignore', 'inherit', 'ignore'] });
const idOf = (i: number) => `c${String(i + 1).padStart(3, '0')}`;
const startsById = (cs: { id: string; start: number }[]) => new Map(cs.map((c) => [c.id, c.start]));
const linesById = (file: string, n: number) => {
  const ls: { start: number }[] = JSON.parse(readFileSync(file, 'utf8')).lines;
  return ls.length === n ? new Map(ls.map((l, i) => [idOf(i), l.start])) : undefined;
};

/**
 * Word-by-word reveals need per-character times: forced alignment of the MAIN lines (asides removed, shouts left out —
 * both made the aligner drift and push every following line late), then shouts placed on the voice (cached per stem).
 */
function mainLines(cs: TimelineCue[], vocals: string, tag: string, act: boolean[]): TimelineCue[] {
  const forceFile = join(a.out!, `force_main${tag}.json`);
  const mains = cs.filter((c) => !isShout(c.text));
  if (!existsSync(forceFile)) {
    const txt = join(a.out!, `lyrics_main${tag}.txt`);
    writeFileSync(txt, mains.map((c) => withoutAsides(c.text) || c.text).join('\n'));
    py(['stable-ts'], 'force_align.py', [vocals, txt, forceFile, '--language', a.language!]);
  }
  const lines: { words: AsrWord[]; start: number }[] = JSON.parse(readFileSync(forceFile, 'utf8')).lines;
  if (lines.length === mains.length) return alignMainLines(cs, lines, voicedSpans(act));
  console.log(`逐字時間略過：對齊結果 ${lines.length} 行，主歌詞 ${mains.length} 行`);
  return cs;
}

/** Whisper timing of known lines on one vocal stem: forced alignment, transcribe-and-match backup, then main lines. */
function timeOn(vocals: string, tag: string, lines: string[], txt: string, act: boolean[]) {
  const asrFile = join(a.out!, `asr${tag}.json`);
  if (!existsSync(asrFile)) {
    execFileSync('uv', ['run', '-q', '--with', 'mlx-whisper', 'python', 'scripts/lyric-vj/asr.py', vocals, txt, asrFile, '--language', a.language!], { stdio: 'inherit' });
  }
  const forceFile = join(a.out!, `force${tag}.json`);
  if (!existsSync(forceFile)) py(['stable-ts'], 'force_align.py', [vocals, txt, forceFile, '--language', a.language!]);
  const heard = alignLyrics(lines, JSON.parse(readFileSync(asrFile, 'utf8')).words, analysis.duration);
  const forced: ForcedLine[] = JSON.parse(readFileSync(forceFile, 'utf8')).lines.map((l: { start: number; end: number; words: { p: number }[] }) => ({
    start: l.start, end: l.end, conf: l.words.reduce((s, w) => s + w.p, 0) / Math.max(1, l.words.length),
  }));
  const combined = combineTimings(lines, forced, heard, act);
  if (process.env['DUMP_STAGES']) writeFileSync(join(a.out!, `stage_combined${tag}.json`), JSON.stringify(combined));
  const main = mainLines(combined, vocals, tag, act);
  if (process.env['DUMP_STAGES']) writeFileSync(join(a.out!, `stage_main${tag}.json`), JSON.stringify(main));
  return { raw: linesById(forceFile, lines.length), combined, main };
}

if (a.lrc) {
  cues = toCues(readFileSync(a.lrc, 'utf8'), 'lrc');
  check = checkTiming(cues, active);
} else {
  const hit = a['no-lrclib'] ? undefined : await new LyricSearchService().find(a.title ?? basename(a.audio), analysis.duration);
  const lrclib = hit?.synced ? toCues(hit.text, 'lrclib') : undefined;
  const lrclibCheck = lrclib && checkTiming(lrclib, active);
  if (lrclib && lrclibCheck?.passed) {
    // the overall check passed; single lines can still be off and go to the timing editor
    const lines = checkLines(lrclib, active);
    cues = lrclib.map((c, i) => (lines[i].ok ? c : { ...c, review: lines[i].issues.map((k) => ISSUE_LABEL[k]) }));
    check = lrclibCheck;
  } else {
    // no usable synced lyrics: time the known text with Whisper on the vocal stem
    const text = a.lyrics ? readFileSync(a.lyrics, 'utf8') : hit && !hit.synced ? hit.text : undefined;
    if (!text) throw new Error(`LRCLIB ${lrclib ? '的時間未通過人聲檢查' : '找不到歌詞'}；請提供 --lrc 或 --lyrics（純文字歌詞）`);
    const lines = text.split('\n').map((l) => cleanLyricLine(l.replace(/^\[[^\]]*\]/, ''))).filter(Boolean);
    const txt = join(a.out, 'lyrics.txt');
    writeFileSync(txt, lines.join('\n'));
    const primary = timeOn(a.vocals, '', lines, txt, active);
    cues = primary.main;
    if (a['vocals-alt']) {
      // a second stem (another separation model) timed the same way, plus a second aligner family (MMS, CTC) on it:
      // seven timings vote each line's start (scripts/lyric-vj/align-eval.py measured this against confirmed timings)
      const altVocals = a['vocals-alt'];
      const alt = timeOn(altVocals, '_alt', lines, txt, vocalActivity(decode(altVocals, SR), SR));
      const mmsFile = join(a.out, 'mms_alt.json');
      if (!existsSync(mmsFile)) py(['torch', 'torchaudio', 'pykakasi', 'soundfile'], 'mms_align.py', [altVocals, txt, mmsFile]);
      const timings = [primary.raw, startsById(primary.combined), startsById(primary.main), alt.raw, startsById(alt.combined), startsById(alt.main), linesById(mmsFile, lines.length)];
      cues = voteStarts(primary.main, timings.filter((x): x is Map<string, number> => !!x));
      voted = true;
      console.log(`歌詞時間：${timings.filter(Boolean).length} 組時間投票`);
    }
    check = checkTiming(cues, active);
    console.log(`歌詞時間：${cues.filter((c) => !c.review).length}/${cues.length} 句自動通過，${cues.filter((c) => c.review).length} 句需要在時間校正頁確認`);
  }
}
if (cues[0]?.timingSource !== 'whisper') cues = mainLines(cues, a.vocals, '', active);
// lines the aligner was unsure of snap to where the voice actually enters (a vote already outweighs one stem's voice)
if (!voted) {
  const snapped = snapToVoice(cues, active);
  cues = snapped.cues;
  if (snapped.moved) console.log(`${snapped.moved} 句低信心歌詞對齊到人聲起點`);
}

// a held last note before a gap keeps its caption until the voice stops
{
  const held = holdToVoice(cues, active);
  cues = held.cues;
  if (held.held) console.log(`${held.held} 句延長到尾音結束`);
}

let instrumentalOffsetSec: number | undefined;
if (a.instrumental) instrumentalOffsetSec = +alignOffset(mix, decode(a.instrumental, SR), SR).toFixed(4);

const song: SongTimeline = {
  title: a.title ?? basename(a.audio),
  duration: analysis.duration,
  tempo: analysis.tempo,
  beats: analysis.beats,
  beatStrength: beatStrengths(mix, SR, analysis.beats),
  downbeats: downbeats(analysis),
  sections: analysis.sections,
  energy,
  energyFps: ENERGY_FPS,
  cues,
  audio: { mix: a.audio, instrumental: a.instrumental, instrumentalOffsetSec, vocals: a.vocals },
  timingCheck: check,
};
writeFileSync(join(a.out, 'song.json'), JSON.stringify(song, null, 1));
console.log(JSON.stringify({
  duration: +song.duration.toFixed(2), tempo: +song.tempo.toFixed(1), beats: song.beats.length, sections: song.sections.length,
  cues: cues.length, timingSource: cues[0]?.timingSource, timingCheck: check, instrumentalOffsetSec,
}, null, 1));
