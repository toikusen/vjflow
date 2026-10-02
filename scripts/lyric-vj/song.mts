// Song preparation: audio analysis (the app's own analyzer), lyric timing with a vocal-stem check, instrumental offset.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/song.mts --audio mix.mp3 [--instrumental inst.mp3] --vocals vocals.wav \
//   [--lrc lyrics.lrc] --title "artist - title" --out out/indigo
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeAudio } from '../../src/app/audio/audio-analyzer.service';
import { parseLyrics } from '../../src/app/lyrics/lyric-parser.service';
import { LyricSearchService } from '../../src/app/lyrics/lyric-search.service';
import { alignOffset, checkTiming, downbeats, SongTimeline, TimelineCue, vocalActivity } from '../../src/app/lyric-vj/timeline';
import { decode } from './media.mts';

const { values: a } = parseArgs({
  options: {
    audio: { type: 'string' }, instrumental: { type: 'string' }, vocals: { type: 'string' },
    lrc: { type: 'string' }, title: { type: 'string' }, out: { type: 'string' },
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
  if (!hit?.synced) throw new Error(`LRCLIB 沒有帶時間的歌詞（${hit ? '只有純文字' : '找不到'}）；請提供 --lrc（Whisper 對齊尚未接入 Node 流程）`);
  cues = toCues(hit.text, 'lrclib');
  check = checkTiming(cues, active);
  if (!check.passed) throw new Error(`LRCLIB 時間未通過人聲檢查：${JSON.stringify(check)}；請提供 --lrc`);
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
