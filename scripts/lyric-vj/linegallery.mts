// A gallery plan: one named device forced on each line in turn, so an effect can be rendered and inspected on its own.
// Reading gates stay on: a device a line cannot afford is reported, not squeezed in.
// npx tsx scripts/lyric-vj/linegallery.mts --song song.json --base base-treatment.json --out <dir> --names tag-plain,hand:push,cam:arc [--from 48 --to 86] [--meaning meaning.json]
// names: a recipe id from lineplan-core.mts, hand:<push|split|door|relay|page|band|chain>, cam:<arc|ground|phrase-track|panel-track>, pair:<list|reply|chat>; then typeplan.mts --plan and render.mts as for lineplan.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { RigKind } from '../../src/app/lyric-vj/render/camera-rig';
import type { HandoffKind } from '../../src/app/lyric-vj/render/lyric-handoff';
import type { LineExitKind } from '../../src/app/lyric-vj/render/line-exit';
import { composePlan, composerBase, Cue, fallbackParts, Meaning, PairKind, PALETTES, PlanForce, RECIPES } from './lineplan-core.mts';

/** Each name on successive lines inside the window, skipping none; returns what was assigned to which line. */
export function forceOf(names: string[], cues: Cue[], from: number, to: number): PlanForce & { assigned: { cue: string; name: string }[] } {
  const lines = cues.filter((c) => c.start >= from && c.start < to);
  const force = { exits: new Map<string, LineExitKind>(), recipes: new Map<string, string>(), hands: new Map<string, HandoffKind>(), rigs: new Map<string, RigKind>(), pairs: new Map<string, PairKind>(), assigned: [] as { cue: string; name: string }[] };
  let at = 0;
  for (const both of names) {
    // recipe+cam:kind sets a camera on the line that recipe took
    const [named, also] = both.split('+');
    // recipe~exit forces the way out too
    const [name, out] = named.split('~');
    const [kind, value] = name.split(':');
    // a recipe with a length limit waits for a line that fits; a handoff needs a line before it
    const fits = (c: Cue) => { const r = RECIPES.find((x) => x.id === name); const n = [...c.text.replace(/\s/g, '')].length; return !r || (n >= (r.min ?? 0) && n <= (r.max ?? Infinity)); };
    while (at < lines.length && !fits(lines[at])) at++;
    const line = lines[at];
    if (!line) break;
    if (kind === 'pair') force.pairs.set(line.id, value as PairKind);
    else if (kind === 'hand') force.hands.set(line.id, value as HandoffKind);
    else if (kind === 'cam') force.rigs.set(line.id, value as RigKind);
    else if (RECIPES.some((r) => r.id === name)) force.recipes.set(line.id, name);
    else throw new Error(`unknown name ${name}`);
    if (also) force.rigs.set(line.id, also.split(':')[1] as RigKind);
    if (out) force.exits.set(line.id, out as LineExitKind);
    force.assigned.push({ cue: line.id, name: both });
    at += kind === 'hand' || kind === 'pair' ? 2 : 1;
  }
  return force;
}

if (process.argv[1]?.endsWith('linegallery.mts')) {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' }, names: { type: 'string' }, meaning: { type: 'string' }, from: { type: 'string', default: '0' }, to: { type: 'string', default: '100000' } } });
  const out = a.out!;
  mkdirSync(out, { recursive: true });
  const song = JSON.parse(readFileSync(a.song!, 'utf8'));
  const cues = song.cues as Cue[];
  const perSec = cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0));
  const calm = perSec < 3;
  const meaning: Meaning = a.meaning ? JSON.parse(readFileSync(a.meaning, 'utf8')) : { palette: calm ? 'frost' : 'tea', ground: 'grain', reading: '', parts: fallbackParts(cues, song.sections ?? [], calm), keys: [] };
  const force = forceOf(a.names!.split(','), cues, Number(a.from), Number(a.to));
  const { plan, shots } = composePlan(song, meaning, calm, force);
  const base = JSON.parse(readFileSync(a.base!, 'utf8'));
  const p = PALETTES[meaning.palette];
  const baseOut = composerBase(base, plan, shots, p);
  writeFileSync(join(out, 'base.json'), JSON.stringify(baseOut));
  writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
  writeFileSync(join(out, 'palette'), [p.ink, p.paper, p.accent, p.heart].join(','));
  const placed = plan.shots.flatMap((s) => (s.lines as { cue: string; handoff?: unknown; textCam?: { rig?: unknown } }[]).map((l) => ({ l, cut: s })));
  for (const { cue, name } of force.assigned) {
    const c = cues.find((x) => x.id === cue)!;
    const l = placed.find((x) => x.l.cue === cue)?.l;
    const lost = (name.startsWith('hand:') && !l?.handoff) || (name.includes('cam:') && !l?.textCam?.rig);
    console.log(`${c.start.toFixed(2).padStart(7)}  ${cue}  ${name}${lost ? '  NOT PLACED (gate)' : ''}  ${c.text}`);
  }
}
