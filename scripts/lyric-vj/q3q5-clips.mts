// The owner's before/after clips of Q3 / Q5 phase 2 (docs/research/2026-11-10-q3q5-phase2.md): for each clip, the treatment
// with the wiring off (today's product: freeJob with no option) and on (scaleContrast and meaningMoments), and the numbers
// the clips' 說明.md quotes: the clip's scale compositions (event, section, text, edge, planned ratio) and moments (meaning
// reference, evidence line, word, family, time). Left = before, right = after. $0: stored meanings only, no render here.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q3q5-clips.mts --out out/research/q3q5-1110/clips.json [--treatments dir]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
// (riso and screentone where an edgeFit lands in the window; card tsuzuki for two minis, a world with no scale composition)
const CLIPS: [string, string, number, number, string][] = [['riso', 'choroin', 45, 105, 'q3'], ['screentone', 'snow', 55, 115, 'q3'], ['card', 'tsuzuki', 125, 185, 'q5']];
const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q3q5-1110/clips.json' }, treatments: { type: 'string' } } });
const out: Record<string, unknown> = { commit: execSync('git rev-parse --short HEAD').toString().trim(), sides: { left: 'before: freeJob with no option (wiring off, today\'s product)', right: 'after: freeJob scaleContrast + meaningMoments (Q3 / Q5 phase 2 wiring on)' } };
for (const [id, name, from, to, what] of CLIPS) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const path = `out/research/instant/plans/${name}/meaning.json`;
  const meaning = JSON.parse(readFileSync(path, 'utf8'));
  const style = OFFERED_STYLES.find((s) => s.id === id)!;
  const before = freeJob(song, { style, seed: 0, meaning });
  const after = freeJob(song, { style, seed: 0, meaning, scaleContrast: true, meaningMoments: true, meaningRef: path });
  const inClip = (t: number) => t >= from && t < to;
  const cue = (cid: string) => song.cues.find((x: { id: string }) => x.id === cid);
  type Line = { cueId: string; world?: { set?: string; blow?: { from: number; to: number }; scale?: { eventId: string; sectionId: string; kind: string; source: string; ratio: number; edge: string; span: { from: number; to: number } } } };
  const scale = (after.treatment.cues as Line[]).filter((c) => c.world?.scale && inClip(cue(c.cueId).start)).map((c) => ({ line: c.cueId, start: cue(c.cueId).start, text: cue(c.cueId).text, ...c.world!.scale!, big: [...cue(c.cueId).text.replace(/[（(][^）)]*[）)]/g, '').trim()].slice(c.world!.scale!.span.from, c.world!.scale!.span.to).join('') }));
  const blown = (before.treatment.cues as Line[]).filter((c) => c.world?.blow && inClip(cue(c.cueId).start)).map((c) => ({ line: c.cueId, start: cue(c.cueId).start, word: [...cue(c.cueId).text].slice(c.world!.blow!.from, c.world!.blow!.to).join('') }));
  const t = after.treatment as { miniMoments?: { id: string; meaningRef: string; evidenceCueId: string; word: string; why: string; family: string; form: string; variant: string; at: number; region: object }[]; signature?: { cues: string[]; form: string; variant: string; word: string; at: number }[] };
  const minis = (t.miniMoments ?? []).filter((m) => inClip(m.at));
  const bigs = (t.signature ?? []).filter((m) => inClip(m.at));
  const tb = before.treatment as { signature?: { cues: string[]; form: string; variant: string; at: number }[] };
  out[`${id}-${name}`] = {
    world: id, song: name, window: [from, to], what,
    before: { blown, signature: (tb.signature ?? []).filter((m) => inClip(m.at)).map((m) => ({ cues: m.cues, form: `${m.form}/${m.variant}`, at: m.at })) },
    after: { scale, mini: minis.map((m) => ({ id: m.id, meaningRef: m.meaningRef, evidenceCueId: m.evidenceCueId, line: cue(m.evidenceCueId).text, word: m.word, form: `${m.form}/${m.variant}`, family: m.family, at: m.at, why: m.why })), big: bigs.map((m) => ({ cues: m.cues, form: `${m.form}/${m.variant}`, word: m.word, at: m.at })) },
    decisions: (after.treatment.worldEvents?.policy ?? []).filter((d) => inClip(d.at)),
  };
  if (a.treatments) for (const [side, f] of [['before', before], ['after', after]] as const) {
    mkdirSync(join(a.treatments, `${id}-${name}-${side}`), { recursive: true });
    writeFileSync(join(a.treatments, `${id}-${name}-${side}`, 'treatment.json'), JSON.stringify(f.treatment));
  }
}
mkdirSync('out/research/q3q5-1110', { recursive: true });
writeFileSync(a.out!, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (k === 'decisions' ? v.length : k === 'why' ? undefined : v)));
