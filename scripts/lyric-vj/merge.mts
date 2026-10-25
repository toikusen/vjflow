// The segments made one by one (songrun.sh) joined back into the whole song's treatment: within each segment's time
// its look sections (code layer and all) and its lyric layouts replace the whole song's. A segment that stopped at
// its preview contributes that preview; a repeated chorus (reuse.json) takes an earlier segment's picture, shifted to its time.
// npx tsx scripts/lyric-vj/merge.mts <full treatment.json> <segments dir> <out dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [fullFile, segRoot, out] = process.argv.slice(2);
const t = JSON.parse(readFileSync(fullFile, 'utf8'));
type Section = { start: number; layers: unknown[]; sigRemoved?: unknown };
const report: string[] = [];
let assets: Record<string, unknown> = {};
const made = (dir: string) => {
  const done = existsSync(join(dir, 'codelayer.json'));
  // a segment stopped at its spend cap left no preview: its last judged version (the states check's render) stands in
  return { done, file: done ? join(dir, 'treatment.json') : existsSync(join(dir, 'treatment.preview.json')) ? join(dir, 'treatment.preview.json') : join(dir, 'codelayer', 'treatment_states.json') };
};
const span = (shots: { start: number; end: number }[]) => [Math.min(...shots.map((x) => x.start)), Math.max(...shots.map((x) => x.end))];
for (const d of readdirSync(segRoot).filter((x) => /^seg\d+$/.test(x)).sort()) {
  let dir = join(segRoot, d);
  const reuse = existsSync(join(dir, 'reuse.json')) ? (JSON.parse(readFileSync(join(dir, 'reuse.json'), 'utf8')).from as string) : undefined;
  // a reused picture keeps its own drawing, moved to this segment's window; the lyric layouts follow by shot order
  const here = reuse ? JSON.parse(readFileSync(join(dir, 'treatment.json'), 'utf8')).shots : undefined;
  if (reuse) dir = join(segRoot, reuse);
  const { done, file } = made(dir);
  if (!existsSync(file)) {
    report.push(`${d}: 沒有成品，沿用原本的畫面`);
    continue;
  }
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const shift = here ? span(here)[0] - span(s.shots)[0] : 0;
  if (here) {
    s.graphics.sections = s.graphics.sections.map((x: Section) => ({ ...x, start: x.start + shift, layers: x.layers.map((l) => ((l as { kind: string }).kind === 'code' ? { ...(l as object), shift } : l)) }));
    s.shots = here.map((sh: object, i: number) => ({ ...sh, template: s.shots[i]?.template, params: s.shots[i]?.params }));
  }
  if (!s.graphics.sections.some((x: { layers: { kind: string }[] }) => x.layers.some((l) => l.kind === 'code'))) {
    report.push(`${d}: 沒有專屬畫面，沿用原本的畫面`);
    continue;
  }
  const [W0, W1] = span(s.shots);
  // the whole song's sections cut at the segment's edges, then each part inside takes the segment's section there
  const secs: Section[] = t.graphics.sections;
  for (const edge of [W0, W1]) {
    const k = secs.findIndex((x, i) => x.start < edge - 0.01 && (secs[i + 1]?.start ?? Infinity) > edge + 0.01);
    if (k >= 0) secs.splice(k + 1, 0, { ...structuredClone(secs[k]), start: +edge.toFixed(3) });
  }
  const own: Section[] = s.graphics.sections;
  t.graphics.sections = secs.map((x) => {
    if (x.start < W0 - 0.01 || x.start >= W1 - 0.01) return x;
    const from = [...own].reverse().find((y) => y.start <= x.start + 0.01) ?? own[0];
    const { sigRemoved, ...rest } = structuredClone(from);
    return { ...rest, start: x.start };
  });
  for (const sh of s.shots) {
    const k = t.shots.findIndex((x: { id: string }) => x.id === sh.id);
    if (k >= 0) t.shots[k] = { ...t.shots[k], template: sh.template, params: sh.params };
  }
  const pics = join(dir, 'assets.merged.json');
  if (existsSync(pics)) assets = { ...assets, ...JSON.parse(readFileSync(pics, 'utf8')) };
  report.push(`${d}: ${W0.toFixed(1)}–${W1.toFixed(1)}s ${reuse ? `沿用 ${reuse}，` : ''}${done ? '通過' : '停在預覽（未通過）'}`);
}
writeFileSync(join(out, 'treatment.json'), JSON.stringify(t));
writeFileSync(join(out, 'assets.json'), JSON.stringify(assets));
writeFileSync(join(out, 'merge.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
