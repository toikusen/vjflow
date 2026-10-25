// The check before a whole render: the six stills the plan picked as its visual change (each with what its part changes
// or keeps) and its one test clip, so a direction that does not hold is caught for a plan's price, not a render's.
//
// npx tsx scripts/lyric-vj/preview.mts --song out/db/<id>/song.json --dir <typeplan out> [--no-clip]
// writes <dir>/preview/still_1..6.jpg, clip.mp4 and preview.json (time, note, part of each still)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

type Shot = { id: string; start: number; end: number };
type Cue = { id: string; start: number; end: number; text: string };
type Plan = { parts?: { from: string; shift: string; what: string; warmth?: number; order?: number }[]; previews?: { shot: string; note: string }[]; clip?: { from: string; to: string; why: string } };

/** The moment a still shows of a shot: the middle of its first sung line (its lyric on screen), else its middle. */
export function stillAt(shot: Shot, cues: Cue[]): number {
  const c = cues.find((x) => x.start >= shot.start && x.start < shot.end);
  return +(c ? (c.start + Math.min(c.end, shot.end)) / 2 : (shot.start + shot.end) / 2).toFixed(2);
}

/**
 * How warm a frame is, 0 cold .. 1 warm, from its average colour: red over blue mapped around neutral 0.5 (a frame's
 * mean red 60 levels over its mean blue reads 0.75). ponytail: one number for the whole frame, a cold half and a warm
 * half read neutral
 */
export function warmthOf([r, , b]: [number, number, number]): number {
  return Math.min(1, Math.max(0, 0.5 + (r - b) / 240));
}

/** A planned warmth the frame does not show: off by more than 0.25. */
export const warmthOff = (planned: number | undefined, measured: number) => planned !== undefined && Math.abs(planned - measured) > 0.25;

/** The part a shot falls in: the last one starting at or before it in shot order. */
export function partFor(parts: NonNullable<Plan['parts']>, shots: Shot[], id: string) {
  const at = (x: string) => shots.findIndex((s) => s.id === x);
  return parts.filter((p) => at(p.from) >= 0 && at(p.from) <= at(id)).sort((x, y) => at(y.from) - at(x.from))[0];
}

if (process.argv[1]?.endsWith('preview.mts')) {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, dir: { type: 'string' }, 'no-clip': { type: 'boolean', default: false } } });
  const dir = a.dir!;
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { cues: Cue[]; duration?: number };
  const t = JSON.parse(readFileSync(join(dir, 'treatment.json'), 'utf8')) as { shots: Shot[] };
  const plan = JSON.parse(readFileSync(join(dir, 'typeplan.json'), 'utf8')) as Plan;
  const out = join(dir, 'preview');
  mkdirSync(out, { recursive: true });
  const end = song.duration ?? song.cues.at(-1)!.end + 5;
  const render = (from: number, to: number, tag: string) => {
    const tmp = join(out, `r_${tag}`);
    rmSync(tmp, { recursive: true, force: true });
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--fps', '30', '--workers', '2', '--song', a.song!, '--treatment', join(dir, 'treatment.json'), '--assets', join(dir, 'assets.json'), '--start', '0', '--end', String(end), '--clip', `${from},${to}`, '--out', tmp], { stdio: 'ignore', env: { ...process.env, VJ_UNCONFIRMED: '1' } });
    const f = readdirSync(tmp).find((x) => /^lyric-vj.*\.mp4$/.test(x));
    if (!f) throw new Error(`no video rendered for ${tag} (${from}–${to} s)`);
    return { file: join(tmp, f), tmp };
  };
  const stills = (plan.previews ?? []).slice(0, 6).flatMap((p, i) => {
    const shot = t.shots.find((s) => s.id === p.shot);
    if (!shot) return [];
    const at = stillAt(shot, song.cues);
    const { file, tmp } = render(at, at + 0.5, `s${i + 1}`);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', '0.25', '-i', file, '-frames:v', '1', '-q:v', '3', join(out, `still_${i + 1}.jpg`)]);
    rmSync(tmp, { recursive: true, force: true });
    const part = partFor(plan.parts ?? [], t.shots, p.shot);
    const rgb = [...execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', join(out, `still_${i + 1}.jpg`), '-vf', 'scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])].slice(0, 3) as [number, number, number];
    const warm = +warmthOf(rgb).toFixed(2);
    const off = warmthOff(part?.warmth, warm);
    console.log(`still ${i + 1}: ${at} s warmth planned ${part?.warmth ?? '-'} measured ${warm}${off ? ' ← OFF' : ''} ${p.note}`);
    return [{ n: i + 1, at, note: p.note, shift: part?.shift ?? '', part: part?.what ?? '', warmth: part?.warmth, order: part?.order, measured: warm, off }];
  });
  let clip: { from: number; to: number; why: string } | undefined;
  const c = plan.clip;
  const [s0, s1] = c ? [t.shots.find((s) => s.id === c.from), t.shots.find((s) => s.id === c.to)] : [];
  if (!a['no-clip'] && c && s0 && s1) {
    // 15–25 s whatever shots the plan named
    const from = s0.start, to = Math.min(Math.max(s1.end, from + 15), from + 25);
    const { file, tmp } = render(from, to, 'clip');
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', file, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-b:v', '2100k', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(out, 'clip.mp4')]);
    rmSync(tmp, { recursive: true, force: true });
    clip = { from: +from.toFixed(1), to: +to.toFixed(1), why: c.why };
    console.log(`clip: ${clip.from}–${clip.to} s ${c.why}`);
  }
  writeFileSync(join(out, 'preview.json'), JSON.stringify({ stills, clip, exists: existsSync(join(out, 'clip.mp4')) }, null, 1));
}
