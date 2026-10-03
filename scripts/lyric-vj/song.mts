// Song preparation: audio analysis (the app's own analyzer), lyric timing with a vocal-stem check, instrumental offset.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/song.mts --audio mix.mp3 [--instrumental inst.mp3] --vocals vocals.wav \
//   [--lrc lyrics.lrc] --title "artist - title" --out out/indigo
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeAudio } from '../../src/app/audio/audio-analyzer.service';
import { parseLyrics } from '../../src/app/lyrics/lyric-parser.service';
import { LyricSearchService } from '../../src/app/lyrics/lyric-search.service';
import { alignLyrics, cleanLyricLine, combineTimings, ForcedLine } from '../../src/app/lyric-vj/align';
import { checkLines, ISSUE_LABEL } from '../../src/app/lyric-vj/timing-qa';
import { alignOffset, checkTiming, downbeats, phraseStarts, SongTimeline, TimelineCue, vocalActivity } from '../../src/app/lyric-vj/timeline';
import { decode } from './media.mts';

const { values: a } = parseArgs({
  options: {
    audio: { type: 'string' }, instrumental: { type: 'string' }, vocals: { type: 'string' },
    lrc: { type: 'string' }, title: { type: 'string' }, out: { type: 'string' },
    lyrics: { type: 'string' }, language: { type: 'string', default: 'ja' }, // plain lyrics (one line per line) for Whisper alignment
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
const toCues = (text: string, source: TimelineCue['timingSource']) =>
  parseLyrics(text, analysis.duration).cues.map((c, i) => ({ id: `c${String(i + 1).padStart(3, '0')}`, ...c, timingSource: source, confidence: 'verified' as const }));
if (a.lrc) {
  cues = toCues(readFileSync(a.lrc, 'utf8'), 'lrc');
  check = checkTiming(cues, active);
} else {
  const hit = await new LyricSearchService().find(a.title ?? basename(a.audio), analysis.duration);
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
    // two independent aligners: forced alignment of the known text leads, transcribe-and-match backs it up
    const asrFile = join(a.out, 'asr.json');
    if (!existsSync(asrFile)) {
      execFileSync('uv', ['run', '-q', '--with', 'mlx-whisper', 'python', 'scripts/lyric-vj/asr.py', a.vocals, txt, asrFile, '--language', a.language!], { stdio: 'inherit' });
    }
    const forceFile = join(a.out, 'force.json');
    if (!existsSync(forceFile)) {
      execFileSync('uv', ['run', '-q', '--with', 'stable-ts', 'python', 'scripts/lyric-vj/force_align.py', a.vocals, txt, forceFile, '--language', a.language!], { stdio: ['ignore', 'inherit', 'ignore'] });
    }
    const heard = alignLyrics(lines, JSON.parse(readFileSync(asrFile, 'utf8')).words, analysis.duration);
    const forced: ForcedLine[] = JSON.parse(readFileSync(forceFile, 'utf8')).lines.map((l: { start: number; end: number; words: { p: number }[] }) => ({
      start: l.start, end: l.end, conf: l.words.reduce((s, w) => s + w.p, 0) / Math.max(1, l.words.length),
    }));
    cues = combineTimings(lines, forced, heard, active);
    check = checkTiming(cues, active);
    console.log(`歌詞時間：${cues.filter((c) => !c.review).length}/${cues.length} 句自動通過，${cues.filter((c) => c.review).length} 句需要在時間校正頁確認`);
  }
}

let instrumentalOffsetSec: number | undefined;
if (a.instrumental) instrumentalOffsetSec = +alignOffset(mix, decode(a.instrumental, SR), SR).toFixed(4);

const song: SongTimeline = {
  title: a.title ?? basename(a.audio),
  duration: analysis.duration,
  tempo: analysis.tempo,
  beats: analysis.beats,
  downbeats: downbeats(analysis),
  sections: analysis.sections,
  energy,
  energyFps: ENERGY_FPS,
  cues,
  audio: { mix: a.audio, instrumental: a.instrumental, instrumentalOffsetSec },
  timingCheck: check,
};
writeFileSync(join(a.out, 'song.json'), JSON.stringify(song, null, 1));
console.log(JSON.stringify({
  duration: +song.duration.toFixed(2), tempo: +song.tempo.toFixed(1), beats: song.beats.length, sections: song.sections.length,
  cues: cues.length, timingSource: cues[0]?.timingSource, timingCheck: check, instrumentalOffsetSec,
}, null, 1));
