// Synthetic timing-audit jobs (timing-audit.mts): saved render jobs with only their cue times changed, for the cases the
// corpus lacks — a duet's overlapping lines, two lines starting together, a rap line sung into the next, LRC lines back to
// back with no character times. Written to out/research/timing-audit/synthetic/.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/timing-audit-synth.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

type Cue = { id: string; start: number; end: number; text: string; charStarts?: number[]; charTimed?: boolean };
const OUT = 'out/research/timing-audit/synthetic';
mkdirSync(OUT, { recursive: true });
const load = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as { cues: Cue[]; window?: { start: number; end: number } } & Record<string, unknown>;
/** A cue moved to start at `at`, its character times moved with it. */
const moved = (c: Cue, at: number): Cue => ({ ...c, start: at, end: c.end + (at - c.start), ...(c.charStarts ? { charStarts: c.charStarts.map((x) => +(x + at - c.start).toFixed(3)) } : {}) });
const write = (name: string, job: unknown) => { writeFileSync(`${OUT}/${name}.json`, JSON.stringify(job)); console.log(`${OUT}/${name}.json`); };

// (only character times and ends move, or a line moves later into the next one's slot: a line moved earlier than its
// shot's picture would wait for it, picture-lead.ts, and the audit would measure the synthetic, not the engine)
/** A cue sung on to `last` (its last character there, the others kept in order before it) and ending at `end`. */
const sungTo = (c: Cue, last: number, end: number): Cue => {
  const cs = c.charStarts ? c.charStarts.map((x, k, all) => (k === all.length - 1 ? last : Math.min(x, last - 0.05 * (all.length - 1 - k)))) : undefined;
  return { ...c, end, ...(cs ? { charStarts: cs.map((x) => +x.toFixed(3)) } : {}) };
};
// duets and same starts are planned afresh (the free path, freeJob: the composer pairs what cannot hand over, planPairs),
// as a new song would be; a saved plan of the same song never saw them
const planned = (db: string, name: string, edit: (cues: Cue[]) => Cue[], style = 'riso') => {
  const song = JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8')) as { cues: Cue[] };
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  return freeJob({ ...song, cues: edit(song.cues.map((c) => ({ ...c }))) } as never, { style: FREE_STYLES.find((x) => x.id === style)!, seed: 0, meaning }).job;
};
// a duet: every third line is still sung 0.6 s into the next (天文対話)
write('duet-overlap', planned('yt_iwYXfOhcsYI', 'tenmon', (cues) => { for (let i = 1; i + 1 < cues.length; i += 3) cues[i] = sungTo(cues[i], +(cues[i + 1].start + 0.55).toFixed(3), +(cues[i + 1].start + 0.6).toFixed(3)); return cues; }));
// two lines starting together: a line moved later onto the next one's start (天文対話)
write('same-start', planned('yt_iwYXfOhcsYI', 'tenmon', (cues) => { for (let i = 2; i + 1 < cues.length; i += 5) cues[i] = moved(cues[i], cues[i + 1].start); return cues.sort((a, b) => a.start - b.start); }));
// rap sung into the next line: each line's last character 0.08 s before the next line's first (雙截棍, its saved plan)
{
  const j = load('out/research/instant/audit/gallery/render/job.json');
  const cues = j.cues.map((c) => ({ ...c }));
  for (let i = 0; i + 1 < cues.length; i++) {
    const next = cues[i + 1].charStarts?.[0] ?? cues[i + 1].start;
    if (next - 0.08 > cues[i].start + 0.3) cues[i] = sungTo(cues[i], +(next - 0.08).toFixed(3), Math.max(cues[i].end, next));
  }
  write('rap-tight', { ...j, cues });
}
// LRC: no character times, each line ending as the next starts (第二把鑰匙)
{
  const j = load('out/research/lineplan/finish10/g/b/render/job.json');
  const cues = j.cues.map((c, i, all) => ({ ...c, end: all[i + 1] ? all[i + 1].start : c.end, charStarts: undefined, charTimed: undefined }));
  write('lrc-back-to-back', { ...j, cues });
}
