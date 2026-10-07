// Studio backend (dev): runs the lyric-VJ pipeline steps for one song from the /studio page — direct + assets +
// preview, redo the design alone (optionally in another language), redraw the prop library, revise the drawing with the
// user's notes (which also become lessons for later songs), full render, the transparent lyric layer, LRC.
// Each song works in <song dir>/studio/; one run per song at a time; output streams into an in-memory log.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { phraseBoundaries } from '../../src/app/lyric-vj/phrases';
import { toLrc, type SongTimeline } from '../../src/app/lyric-vj/timeline';

export type StudioStep = 'make' | 'design' | 'render' | 'layer' | 'lrc' | 'clip' | 'props' | 'revise' | 'draw';

export interface StudioRun {
  step: StudioStep;
  startedAt: string;
  endedAt?: string;
  ok?: boolean;
  log: string[];
  /** What is running now (for the page) and the step's overall progress 0..1. */
  phase?: string;
  progress?: number;
}

type Phase = 'director' | 'build' | 'props' | 'baseline' | 'code' | 'stills' | 'clip' | 'render';
const PHASE_LABEL: Record<Phase, string> = { director: '導演設計中', build: '生成背景圖與素材庫', props: '生成素材庫', baseline: '整理目前版本當基準', code: '導演繪製專屬圖層', stills: '算預覽畫面', clip: '渲染 30 秒動態預覽', render: '渲染完整影片' };
/** Each step's phases and their share of its progress bar (rough time shares). */
const PLAN: Record<string, [Phase, number][]> = {
  make: [['director', 0.2], ['build', 0.15], ['code', 0.45], ['stills', 0.05], ['clip', 0.15]],
  design: [['director', 0.2], ['props', 0.15], ['code', 0.45], ['stills', 0.05], ['clip', 0.15]],
  props: [['props', 1]],
  revise: [['baseline', 0.05], ['code', 0.75], ['stills', 0.05], ['clip', 0.15]],
  draw: [['code', 0.8], ['stills', 0.05], ['clip', 0.15]],
  render: [['render', 1]],
  layer: [['render', 1]],
  clip: [['clip', 1]],
};
/** Seconds a phase usually takes when it prints nothing countable (its bar fills by time, never past 95 %). */
const TYPICAL: Partial<Record<Phase, number>> = { director: 240, build: 240, props: 240, baseline: 60, code: 1300, stills: 25 };

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
  const drawing = read(join(dir, 'codelayer.json')) as { idea: string; costUSD: number } | undefined;
  const props = read(join(dir, 'props', 'props.json')) as { costUSD: number; sprites: number } | undefined;
  const library = join(dir, 'props', 'library', 'contact.jpg');
  const drawn = !!t?.graphics?.sections?.some((s: { layers: { kind: string }[] }) => s.layers.some((l) => l.kind === 'code'));
  const list = (d: string, ext: RegExp) => (existsSync(d) ? readdirSync(d).filter((f) => ext.test(f)).sort().map((f) => rel(join(d, f))) : []);
  return {
    run: runs.get(songFile) ?? null,
    design: t && {
      language: t.design?.language ?? null, font: t.design?.font ?? null, concept: t.concept ?? '',
      motif: t.motif ? `${t.motif.kind}${t.motif.variant ? `/${t.motif.variant}` : ''}` : null,
      drawing: drawn ? (drawing?.idea ?? null) : null,
    },
    costUSD: +(((director?.costUSD as number) ?? 0) + (costs ?? []).reduce((s, x) => s + x.usd, 0) + (drawn ? (drawing?.costUSD ?? 0) : 0) + (props?.costUSD ?? 0)).toFixed(2),
    props: existsSync(library) ? { contact: rel(library), sprites: props?.sprites ?? null } : null,
    feedback: existsSync(join(dir, 'feedback.txt')) ? readFileSync(join(dir, 'feedback.txt'), 'utf8') : '',
    previews: list(join(dir, 'preview'), /^still_.*\.png$/),
    check: read(join(dir, 'preview', 'check.json')) ?? null,
    outputs: list(dir, /\.(mp4|mov|lrc)$/),
  };
}

/** Starts a step for a song; refuses when one is already running for it. */
export function startStep(songFile: string, step: StudioStep, opts: { language?: string; seconds?: number; feedback?: string; unconfirmed?: boolean }): string | undefined {
  if (runs.get(songFile) && !runs.get(songFile)!.endedAt) return '這首歌已經有步驟在執行';
  const song: SongTimeline = JSON.parse(readFileSync(songFile, 'utf8'));
  if (!song.timingConfirmedAt && step !== 'lrc' && !opts.unconfirmed) return '請先在時間編輯器確認歌詞時間（或勾選「時間還沒確認也先試做」）';
  const dir = studioDir(songFile);
  mkdirSync(dir, { recursive: true });
  const notes = (opts.feedback ?? '').trim();
  if (step === 'revise' && !notes) return '請先寫下要修改的意見';
  if (step === 'revise' && !existsSync(join(dir, 'codelayer.json'))) return '這首歌還沒有專屬圖層，請先產生設計';
  const run: StudioRun = { step, startedAt: new Date().toISOString(), log: [] };
  runs.set(songFile, run);
  if (step === 'lrc') {
    writeFileSync(join(dir, 'lyrics.lrc'), toLrc(song, (text) => [...phraseBoundaries(text)].sort((a, b) => a - b).filter((b) => b < [...text].length)));
    Object.assign(run, { endedAt: new Date().toISOString(), ok: true });
    return undefined;
  }
  if (step === 'revise') {
    // the notes drive this revision and join the lessons every later song's director reads (dated, per song)
    writeFileSync(join(dir, 'feedback.txt'), notes);
    appendFileSync(join('out', 'design-lessons.md'), notes.split('\n').filter((l) => l.trim()).map((l) => `- ${l.replace(/^[-・\s]+/, '')}（${song.title}，${new Date().toISOString().slice(0, 10)}）`).join('\n') + '\n');
  }
  const end = song.duration.toFixed(2);
  // pictures and the prop library in one manifest (codelayer.mts writes it); before the first drawing, pictures only
  const assets = `$( [ -f ${q(join(dir, 'assets.merged.json'))} ] && echo ${q(join(dir, 'assets.merged.json'))} || echo ${q(join(dir, 'assets', 'assets.json'))} )`;
  const lang = opts.language && /^[a-z0-9-]+$/.test(opts.language) ? opts.language : undefined;
  const preview = `npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${assets} --start 0 --end ${end} --stills ${(song.duration * 0.18).toFixed(2)},${(song.duration * 0.45).toFixed(2)},${(song.duration * 0.8).toFixed(2)} --out ${q(join(dir, 'preview'))}`;
  const render = (layer?: string) => `npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${assets} --start 0 --end ${end} --out ${q(dir)}${layer ? ` --layer ${layer}` : ''} && rm -rf ${q(join(dir, 'render'))} ${q(join(dir, 'segments'))}`;
  const mark = (p: Phase) => `echo '##PHASE ${p}'`;
  // the song's own drawing layer; when it fails the song keeps its library look
  const library = join(dir, 'props', 'library');
  const code = (extra = '') => `(npx tsx scripts/lyric-vj/codelayer.mts --song ${q(songFile)} --dir ${q(dir)} --out ${q(dir)} $( [ -f ${q(join(library, 'library.json'))} ] && echo --sprites ${q(library)} )${extra} || echo '專屬圖層失敗，沿用元件庫設計')`;
  // the prop library: a failed one leaves the drawing without sprites (it draws its own shapes)
  const props = `(npx tsx scripts/lyric-vj/props.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --out ${q(join(dir, 'props'))} || echo '素材庫失敗，專屬圖層不用素材')`;
  // the current drawing as the baseline of a revision: its code and stills across the song
  const baseDir = join(dir, 'baseline');
  const baseTimes = Array.from({ length: 12 }, (_, i) => +((song.duration * (i + 0.5)) / 12).toFixed(2));
  const baseline = `rm -rf ${q(baseDir)} && mkdir -p ${q(baseDir)} && cp ${q(join(dir, 'codelayer.json'))} ${q(baseDir)}/ && npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${assets} --start 0 --end ${end} --stills ${baseTimes.join(',')} --out ${q(join(baseDir, 'r'))} > /dev/null && for f in ${q(join(baseDir, 'r'))}/still_*.png; do ffmpeg -v error -y -i "$f" -vf scale=960:-1 -q:v 4 ${q(baseDir)}/$(basename "$f" .png).jpg; done`;
  const cmd = {
    make: [
      `mkdir -p ${q(dir)}`,
      mark('director'),
      `npx tsx scripts/lyric-vj/direct.mts --song ${q(songFile)} --start 0 --end ${end} --out ${q(dir)} --style-id emotional --tier still --history out/design-history.json${lang ? ` --language ${lang}` : ''}`,
      // the pictures and the director's drawing don't depend on each other: both at once (the drawing's test renders
      // go without pictures, which a graphic look rarely shows); a failed drawing never fails the step
      // pictures and props don't depend on each other: both at once; the drawing then acts with the props
      mark('build'),
      `{ ${props} & pp=$!; npx tsx scripts/lyric-vj/assets.mts --treatment ${q(join(dir, 'treatment.json'))} --out ${q(join(dir, 'assets'))} --style-id emotional --tier still; ar=$?; wait $pp; [ $ar -eq 0 ]; }`,
      mark('code'),
      code(),
      mark('stills'),
      preview,
      // the moving preview comes with the design: it is what the user judges before paying for the full render
      mark('clip'),
      clipCmd(),
    ],
    design: [
      mark('director'),
      `npx tsx scripts/lyric-vj/direct.mts --song ${q(songFile)} --start 0 --end ${end} --out ${q(dir)} --design-only ${q(join(dir, 'shots.json'))} --history out/design-history.json${lang ? ` --design-language ${lang}` : ''}`,
      mark('props'),
      props,
      mark('code'),
      code(),
      mark('stills'),
      preview,
      mark('clip'),
      clipCmd(),
    ],
    render: [mark('render'), render()],
    layer: [mark('render'), render('text')],
    clip: [mark('clip'), clipCmd()],
    props: [mark('props'), props],
    // a fresh drawing on the same design and props (after a failed one, or to see another take)
    draw: [mark('code'), code(), mark('stills'), preview, mark('clip'), clipCmd()],
    revise: [mark('baseline'), baseline, mark('code'), code(` --baseline ${q(baseDir)} --feedback ${q(join(dir, 'feedback.txt'))}`), mark('stills'), preview, mark('clip'), clipCmd()],
  }[step];
  function clipCmd() {
    // a 30 s moving preview from 10 s before the first chorus drop (the moment that sells the design); the treatment
    // is read when the command runs, after the director wrote it
    const len = 30;
    return `node -e ${q(`const t=require(${JSON.stringify(join(dir, 'treatment.json'))});const d=(t.moments||[]).find(m=>m.kind==='drop');const from=Math.max(0,Math.min(${song.duration}-${len},(d?d.at:${song.duration * 0.3})-10));console.log(from.toFixed(2)+','+(from+${len}).toFixed(2))`)} > ${q(join(dir, 'clip-range.txt'))} && npx tsx scripts/lyric-vj/render.mts --song ${q(songFile)} --treatment ${q(join(dir, 'treatment.json'))} --assets ${assets} --start 0 --end ${end} --clip $(cat ${q(join(dir, 'clip-range.txt'))}) --out ${q(join(dir, 'clip'))} && mv ${q(join(dir, 'clip'))}/lyric-vj_vocal_*.mp4 ${q(join(dir, `preview_${len}s.mp4`))} && rm -rf ${q(join(dir, 'clip'))}`;
  }
  // a login shell: the image service keys live in the user's shell profile
  const child = spawn('zsh', ['-ic', cmd.join(' && ')], { cwd: process.cwd(), env: { ...process.env, ...(opts.unconfirmed ? { VJ_UNCONFIRMED: '1' } : {}) } });
  const plan = PLAN[step] ?? [];
  let phase: Phase | undefined;
  let phaseAt = Date.now();
  const share = (p: Phase) => plan.find(([x]) => x === p)?.[1] ?? 0;
  const before = (p: Phase) => plan.slice(0, plan.findIndex(([x]) => x === p)).reduce((s, [, w]) => s + w, 0);
  const setInner = (k: number) => phase && (run.progress = +(before(phase) + share(phase) * Math.min(0.99, Math.max(0, k))).toFixed(3));
  const push = (b: Buffer) => {
    for (const line of b.toString().split(/\r|\n/)) {
      if (!line.trim()) continue;
      const m = /^##PHASE (\w+)/.exec(line);
      if (m) {
        phase = m[1] as Phase;
        phaseAt = Date.now();
        run.phase = PHASE_LABEL[phase];
        setInner(0);
        continue;
      }
      run.log.push(line);
      const f = /frame (\d+)\/(\d+)/.exec(line);
      if (f && (phase === 'clip' || phase === 'render')) setInner(Number(f[1]) / Math.max(1, Number(f[2])));
    }
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
  };
  // phases that print nothing countable fill by their usual time
  const tick = setInterval(() => {
    if (run.endedAt) return clearInterval(tick);
    const typical = phase && TYPICAL[phase];
    if (typical) setInner(Math.min(0.95, (Date.now() - phaseAt) / 1000 / typical));
  }, 1000);
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('close', (code) => Object.assign(run, { endedAt: new Date().toISOString(), ok: code === 0, progress: code === 0 ? 1 : run.progress }));
  return undefined;
}
