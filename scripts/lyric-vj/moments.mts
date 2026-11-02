// Signature moments from asks (the line director's, or a hand-written spec for a test): each ask through the guards
// (signature-moments.ts) with the song's sung times, the kept ones written for the renderer. With --treatment the
// treatment is copied beside them with the moments on it, so a clip can be rendered from it straight away.
// npx tsx scripts/lyric-vj/moments.mts --song out/db/<id>/song.json --asks asks.json --treatment <dir>/treatment.json --out <dir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { checkMoments, Dropped, MomentAsk, SignatureMoment } from '../../src/app/lyric-vj/signature-moments';
import { SongForTimes, sungTimesOf } from './sung-times.mts';

export interface MomentsSong extends SongForTimes { title: string }

/** The asks through the guards on this song's sung times: what the renderer draws, and what was dropped and why. */
export function buildMoments(song: MomentsSong, songFile: string, asks: MomentAsk[], apart?: number): { kept: SignatureMoment[]; dropped: Dropped[]; sources: Record<string, string> } {
  const times = sungTimesOf(song, songFile);
  const sources: Record<string, string> = {};
  for (const [id, t] of times) sources[id] = t.source;
  const { kept, dropped } = checkMoments(asks, song.cues, (id) => times.get(id), undefined, apart);
  return { kept, dropped, sources };
}

/**
 * The treatment with the moments on it. A moment is its lines' whole treatment: the small tier and the screen hit
 * planned for them come off (a hairline ran through the kicking line, a tiling repeated under the nunchaku).
 */
export function withMoments<T extends { cues: { cueId: string; fine?: unknown; hit?: unknown }[] }>(tr: T, kept: SignatureMoment[]): T & { signature: SignatureMoment[] } {
  const ids = new Set(kept.flatMap((k) => [...k.cues, ...(k.repeat ? [k.repeat] : [])]));
  return { ...tr, cues: tr.cues.map((c) => (ids.has(c.cueId) ? { ...c, fine: undefined, hit: undefined } : c)), signature: kept };
}

const isMain = process.argv[1]?.endsWith('moments.mts');
if (isMain) {
  // --apart: seconds between moments (a hand-written test may set it low; the director's run keeps the rule)
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, asks: { type: 'string' }, treatment: { type: 'string' }, out: { type: 'string' }, apart: { type: 'string' } } });
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as MomentsSong;
  const asks = JSON.parse(existsSync(a.asks!) ? readFileSync(a.asks!, 'utf8') : a.asks!) as MomentAsk[];
  const { kept, dropped, sources } = buildMoments(song, a.song!, asks, a.apart === undefined ? undefined : Number(a.apart));
  mkdirSync(a.out!, { recursive: true });
  writeFileSync(join(a.out!, 'signature.json'), JSON.stringify({ moments: kept, dropped, sungSources: Object.fromEntries(kept.flatMap((k) => Object.keys(k.sung).map((id) => [id, sources[id]]))) }, null, 1));
  for (const k of kept) console.log(`kept ${k.form}/${k.variant} ${k.cues.join('+')}${k.repeat ? `+${k.repeat}` : ''} 「${k.word}」 at ${k.at.toFixed(2)} (${Object.entries(k.sungSource).map(([id, s]) => `${id}:${s}`).join(' ')})`);
  for (const d of dropped) console.log(`dropped ${d.ask.form}/${d.ask.variant} ${d.ask.cues.join('+')} 「${d.ask.word}」: ${d.reason}`);
  if (a.treatment) {
    const tr = JSON.parse(readFileSync(a.treatment, 'utf8'));
    writeFileSync(join(a.out!, 'treatment.json'), JSON.stringify(withMoments(tr, kept)));
    const assets = join(dirname(a.treatment), 'assets.json');
    if (existsSync(assets)) copyFileSync(assets, join(a.out!, 'assets.json'));
  }
}
