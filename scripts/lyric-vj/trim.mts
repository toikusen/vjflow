// One stretch of a whole-song treatment as a treatment of its own: the shots, lines, moments and look sections in
// [start, end), beat pulses only where that stretch hits (look.ts limitPulse); the story layer is left out.
// npx tsx scripts/lyric-vj/trim.mts <treatment.json> <out.json> <start> <end> <song.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { limitPulse } from '../../src/app/lyric-vj/look';

const [src, dst, w0, w1, songFile] = process.argv.slice(2);
const W0 = Number(w0), W1 = Number(w1);
const t = JSON.parse(readFileSync(src, 'utf8'));
const song = JSON.parse(readFileSync(songFile, 'utf8'));
const st = Object.fromEntries(song.cues.map((c: { id: string; start: number }) => [c.id, c.start]));
t.shots = t.shots.filter((s: { start: number; end: number }) => s.start >= W0 - 0.01 && s.end <= W1 + 0.01);
t.cues = t.cues.filter((c: { cueId: string }) => st[c.cueId] >= W0 - 0.01 && st[c.cueId] < W1);
t.moments = (t.moments ?? []).filter((m: { at: number }) => m.at >= W0 && m.at < W1);
const secs = t.graphics.sections;
t.graphics.sections = secs.filter((s: { start: number }, i: number) => (secs[i + 1]?.start ?? 1e9) > W0 && s.start < W1);
delete t.graphics.story;
delete t.graphics.storyProps;
limitPulse(t.graphics, t.moments.filter((m: { kind: string }) => m.kind === 'drop' || m.kind === 'finale').map((m: { at: number }) => m.at), W1);
writeFileSync(dst, JSON.stringify(t));
