// Studio backend (dev): runs the lyric-VJ pipeline steps for one song from the /studio page — direct + assets +
// preview, redo the design alone (optionally in another language), full render, the transparent lyric layer, LRC.
// Each song works in <song dir>/studio/; one run per song at a time; output streams into an in-memory log.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { phraseBoundaries } from '../../src/app/lyric-vj/phrases';
import { toLrc, type SongTimeline } from '../../src/app/lyric-vj/timeline';

export type StudioStep = 'make' | 'design' | 'render' | 'layer' | 'lrc';

export interface StudioRun {
  step: StudioStep;
  startedAt: string;
  endedAt?: string;
  ok?: boolean;
  log: string[];
}

const runs = new Map<string, StudioRun>();
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The studio folder of a song (song.json's folder + /studio). */
export const studioDir = (songFile: string) => join(dirname(songFile), 'studio');

/** What the page shows for a song: the run, the design, previews, the pre-render check, outputs. */
export function studioState(songFile: string, outRoot: string) {
  const dir = studioDir(songFile);
  const rel = (f: string) => relative(outRoot, f);
  const read = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined);
  const t = read(join(dir, 'treatment.json'));
  const director = read(join(dir, 'director.json'));
  const costs = read(join(dir, 'assets', 'costs.json')) as { usd: number }[] | undefined;
  const list = (d: string, ext: RegExp) => (existsSync(d) ? readdirSync(d).filter((f) => ext.test(f)).sort().map((f) => rel(join(d, f))) : []);
  return {
    run: runs.get(songFile) ?? null,
    design: t && {
      language: t.design?.language ?? null, font: t.design?.font ?? null, concept: t.concept ?? '',
      motif: t.motif ? `${t.motif.kind}${t.motif.variant ? `/${t.motif.variant}` : ''}` : null,
    },
    costUSD: +(((director?.costUSD as number) ?? 0) + (costs ?? []).reduce((s, x) => s + x.usd, 0)).toFixed(2),
    previews: list(join(dir, 'preview'), /^still_.*\.png$/),
    check: read(join(dir, 'preview', 'check.json')) ?? null,
    outputs: list(dir, /\.(mp4|mov|lrc)$/),
  };
}

/** Starts a step for a song; refuses when one is already running for it. */
export function startStep(songFile: string, step: StudioStep, opts: { language?: string }): string | undefined {
  if (runs.get(songFile) && !runs.get(songFile)!.endedAt) return '這首歌已經有步驟在執行';
  const song: SongTimeline = JSON.parse(readFileSync(songFile, 'utf8'));
  if (!song.timingConfirmedAt && step !== 'lrc') return '請先在時間編輯器確認歌詞時間';
  const dir = studioDir(songFile);
  mkdirSync(dir, { recursive: true });
  const run: StudioRun = { step, startedAt: new Date().toISOString(), log: [] };
  runs.set(songFile, run);
  if (step === 'lrc') {
    writeFileSync(join(dir, 'lyrics.lrc'), toLrc(song, (text) => [...phraseBoundaries(text)].sort((a, b) => a - b).filter((b) => b < [...text].length)));
    Object.assign(run, { endedAt: new Date().toISOString(), ok: true });
    return undefined;
  }
  const end = song.duration.toFixed(2);
  const lang = opts.language && /^[a-z0-9-]+$/.test(opts.language) ? opts.language : undefined;
  const preview = `npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${q(join(dir, 'assets', 'assets.json'))} --start 0 --end ${end} --stills ${(song.duration * 0.18).toFixed(2)},${(song.duration * 0.45).toFixed(2)},${(song.duration * 0.8).toFixed(2)} --out ${q(join(dir, 'preview'))}`;
  const render = (layer?: string) => `npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${q(join(dir, 'assets', 'assets.json'))} --start 0 --end ${end} --out ${q(dir)}${layer ? ` --layer ${layer}` : ''} && rm -rf ${q(join(dir, 'render'))} ${q(join(dir, 'segments'))}`;
  const cmd = {
    make: [
      `mkdir -p ${q(dir)}`,
      `npx tsx scripts/lyric-vj/direct.mts --song ${q(songFile)} --start 0 --end ${end} --out ${q(dir)} --style-id emotional --tier still --history out/design-history.json${lang ? ` --language ${lang}` : ''}`,
      `npx tsx scripts/lyric-vj/assets.mts --treatment ${q(join(dir, 'treatment.json'))} --out ${q(join(dir, 'assets'))} --style-id emotional --tier still`,
      preview,
    ],
    design: [
      `npx tsx scripts/lyric-vj/direct.mts --song ${q(songFile)} --start 0 --end ${end} --out ${q(dir)} --design-only ${q(join(dir, 'shots.json'))} --history out/design-history.json${lang ? ` --design-language ${lang}` : ''}`,
      preview,
    ],
    render: [render()],
    layer: [render('text')],
  }[step];
  // a login shell: the image service keys live in the user's shell profile
  const child = spawn('zsh', ['-ic', cmd.join(' && ')], { cwd: process.cwd() });
  const push = (b: Buffer) => {
    for (const line of b.toString().split(/\r|\n/)) if (line.trim()) run.log.push(line);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('close', (code) => Object.assign(run, { endedAt: new Date().toISOString(), ok: code === 0 }));
  return undefined;
}
