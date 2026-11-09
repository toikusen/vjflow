// The line composer: a song's whole plan with no director. One cheap reading of the lyrics (or none), then rules.
// npx tsx scripts/lyric-vj/lineplan.mts --song song.json --base base-treatment.json --out <dir> [--no-reading] [--verify-meaning]
// --verify-meaning: a fresh reading's keys and moments are re-judged by three verify calls kept on a 2-of-3 vote
// (meaning-read.mts verifyCandidates) before they are cached; a cache hit is used as stored. Off by default; turning it on
// in production is a later decision (four calls a song, ~$0.01 at 2026-11-10 prices).
// then: npx tsx scripts/lyric-vj/typeplan.mts --song song.json --treatment <dir>/base.json --plan <dir>/plan.json --palette "$(cat <dir>/palette)" --out <dir>/final
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { composePlan, composerBase, Cue, fallbackParts, Meaning, PALETTES } from './lineplan-core.mts';
import { isCalmSong, loadAnthropicEnv, readMeaning, verifyCandidates } from './meaning-read.mts';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' }, 'no-reading': { type: 'boolean', default: false }, 'verify-meaning': { type: 'boolean', default: false } } });
loadAnthropicEnv();
const out = a.out!;
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const cues = song.cues as Cue[];
const calm = isCalmSong(cues);
const read = async (): Promise<{ meaning?: Meaning; usd: number }> => (a['no-reading'] ? { usd: 0 } : readMeaning(song, calm));
/** Only what the song really has survives: known lines, phrases actually sung, moves on offer, parts in order. */
const valid = (m: Meaning | undefined): Meaning | undefined => {
  if (!m || !PALETTES[m.palette]) return undefined;
  const at = (id: string) => cues.findIndex((c) => c.id === id);
  const parts = m.parts.filter((p) => at(p.from) >= 0).sort((x, y) => at(x.from) - at(y.from)).map((p) => ({ ...p, tension: Math.min(1, Math.max(0, p.tension)), fx: p.fx }));
  if (!parts.length) return undefined;
  parts[0].from = cues[0].id;
  return { ...m, parts, keys: m.keys.filter((k) => cues.find((c) => c.id === k.cue)?.text.includes(k.phrase)), moments: (m.moments ?? []).filter((x) => x.cues.every((id) => at(id) >= 0)) };
};
let got: { meaning?: Meaning; usd: number } = { usd: 0 };
const cached = join(out, 'meaning.json');
if (existsSync(cached)) got.meaning = JSON.parse(readFileSync(cached, 'utf8'));
else try { got = await read(); } catch (e) { console.log(`reading failed, rules only: ${e}`); }
if (a['verify-meaning'] && !existsSync(cached) && valid(got.meaning)) {
  try {
    const v = await verifyCandidates(song, valid(got.meaning)!);
    console.log(`verify: kept ${v.meaning.keys.length} keys, ${v.meaning.moments?.length ?? 0} moments; dropped ${v.dropped.map((d) => d.id).join(' ') || 'none'} ($${v.usd.toFixed(4)})`);
    got = { meaning: v.meaning, usd: got.usd + v.usd };
  } catch (e) { console.log(`verify failed, reading kept unverified: ${e}`); }
}
const meaning = valid(got.meaning) ?? { palette: calm ? 'frost' : 'tea', ground: 'grain', reading: '', parts: fallbackParts(cues, song.sections ?? [], calm), keys: [] };
if (!existsSync(cached)) writeFileSync(cached, JSON.stringify(meaning, null, 1));
const { plan, shots } = composePlan(song, meaning, calm);
const base = JSON.parse(readFileSync(a.base!, 'utf8'));
const p = PALETTES[meaning.palette];
const baseOut = composerBase(base, plan, shots, p);
writeFileSync(join(out, 'base.json'), JSON.stringify(baseOut));
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
writeFileSync(join(out, 'palette'), [p.ink, p.paper, p.accent, p.heart].join(','));
console.log(`lineplan: ${shots.length} shots, ${plan.shots.flatMap((s) => s.cuts).length} cuts, palette ${meaning.palette}, parts ${meaning.parts.length}, reading $${got.usd.toFixed(4)}\n${meaning.reading}`);
