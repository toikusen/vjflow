// What a render actually used, counted from its metrics and the treatment it rendered (not from a plan): each line's
// entrance and exit as played (metrics), the world line's own moves (cue.world enter/exit/hold), hold motions,
// emphasis methods, section transitions and links as drawn (metrics.links), moments. For comparing versions.
// npx tsx scripts/lyric-vj/techniques-used.mts --render <dir with metrics.json> --treatment <treatment.json> [--from 3 --to 63]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { render: { type: 'string' }, treatment: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
const m = JSON.parse(readFileSync(join(a.render!, 'metrics.json'), 'utf8')) as { cues: { id: string; enter?: string; exit?: string; plannedEnter?: string; plannedExit?: string; template?: string }[]; links?: { kind: string; drawn: string }[] };
const t = JSON.parse(readFileSync(a.treatment!, 'utf8')) as { cues: { cueId: string; enter?: string; exit?: string; idle?: string; emphasis?: { method: string }[]; world?: { enter?: string; exit?: string; hold?: string; blow?: unknown; beat?: { kind: string } } }[]; graphics?: { sections: { start: number; transition?: { kind: string }; layers: { kind: string; fx?: string; sprite?: string }[] }[] }; moments?: { kind: string; at: number }[] };
const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
const count = (xs: (string | undefined)[]) => { const c = new Map<string, number>(); for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1); return [...c].sort((p, q) => q[1] - p[1]).map(([k, n]) => `${k}×${n}`).join(' '); };
const ids = new Set(m.cues.map((c) => c.id));
const cues = t.cues.filter((c) => ids.has(c.cueId));
const byId = new Map(m.cues.map((c) => [c.id, c]));
console.log(`lines ${cues.length}`);
console.log(`enter (played):  ${count(m.cues.map((c) => c.enter))}`);
console.log(`enter (world):   ${count(cues.map((c) => c.world?.enter))}`);
console.log(`exit (played):   ${count(m.cues.map((c) => c.exit))}`);
console.log(`exit (world):    ${count(cues.map((c) => c.world?.exit))}`);
console.log(`idle:            ${count(cues.map((c) => c.idle))}   hold (world): ${count(cues.map((c) => c.world?.hold))}`);
console.log(`emphasis:        ${count(cues.flatMap((c) => (c.emphasis ?? []).map((e) => e.method)))}   blow: ${cues.filter((c) => c.world?.blow).length}`);
console.log(`line beats:      ${count(cues.map((c) => c.world?.beat?.kind))}`);
const secs = (t.graphics?.sections ?? []).filter((s) => s.start >= from && s.start < to);
console.log(`sections ${secs.length}; transitions: ${count(secs.map((s) => s.transition?.kind))}; links drawn: ${count((m.links ?? []).map((l) => `${l.kind}/${l.drawn}`))}`);
console.log(`moves (fx):      ${count(secs.flatMap((s) => s.layers.filter((l) => l.kind === 'kinetic').map((l) => l.fx)))}`);
console.log(`sprite cuts:     ${secs.filter((s) => s.layers.some((l) => l.kind === 'kinetic' && l.sprite)).length}`);
console.log(`moments:         ${count((t.moments ?? []).filter((x) => x.at >= from && x.at < to).map((x) => x.kind))}`);
console.log(`templates:       ${count(m.cues.map((c) => c.template))}`);
