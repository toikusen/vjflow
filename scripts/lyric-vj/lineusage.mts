// Where each composer technique B33–B72 plays in a planned song: the table a batch's report quotes.
// npx tsx scripts/lyric-vj/lineusage.mts <plan.json> [<plan.json>…] --names a,b > usage.md
import { readFileSync } from 'node:fs';

type Line = { cue: string; enter: string; exit: string; idle: string; inkState?: string; breath?: number; icon?: string; oval?: boolean; relay?: boolean; textCam?: { kind?: string }; handoff?: { kind: string } };
type Cut = { fx: string; transition: string };
type Shot = { lyric: { template: string }; lines: Line[]; cuts: Cut[] };

const line = (f: (l: Line, t: string) => boolean) => (shots: Shot[]) => shots.flatMap((s) => s.lines.filter((l) => f(l, s.lyric.template))).length;
const cut = (f: (c: Cut) => boolean) => (shots: Shot[]) => shots.flatMap((s) => s.cuts.filter(f)).length;
const out = (k: string) => line((l) => l.exit === k);
const fx = (k: string) => cut((c) => c.fx === k);
const hand = (k: string) => line((l) => l.handoff?.kind === k);
const ROWS: [string, string, 'lines' | 'cuts', (s: Shot[]) => number][] = [
  ['B33', 'band-out', 'lines', out('band-out')], ['B34', 'slat-close', 'lines', out('slat-close')], ['B35', 'line-fold', 'lines', out('line-fold')], ['B36', 'tile-scatter', 'lines', out('tile-scatter')],
  ['B37', 'echo-travel', 'lines', out('echo-travel')], ['B38', 'radial-leave', 'lines', out('radial-leave')], ['B39', 'glyph-shed', 'lines', out('glyph-shed')], ['B40', 'wave-dissolve', 'lines', out('wave-dissolve')],
  ['B41', 'pore-out', 'lines', out('pore-out')], ['B42', 'focus-out', 'lines', out('focus-out')], ['B43', 'turn-box', 'lines', line((_, t) => t === 'turn-box')], ['B44', 'frame-feed', 'lines', line((_, t) => t === 'frame-feed')],
  ['B45', 'lean-settle', 'lines', line((l) => l.textCam?.kind === 'lean-settle')], ['B46', 'lightbox-entry', 'lines', line((_, t) => t === 'lightbox-entry')], ['B47', 'rail-leave', 'lines', out('rail-leave')], ['B48', 'gravity-pass', 'lines', out('gravity-pass')],
  ['B49', 'balance-line', 'lines', line((_, t) => t === 'balance-line')], ['B50', 'dot-display', 'lines', line((_, t) => t === 'dot-display')], ['B51', 'block + side-light', 'lines', line((l) => l.inkState === 'block')], ['B52', 'edge outline', 'lines', line((l) => l.inkState === 'edge')],
  ['B53', 'reflection-rest', 'lines', line((l) => l.idle === 'reflection-rest')], ['B54', 'breath line', 'lines', line((l) => !!l.breath)], ['B55', 'soft-rings', 'cuts', fx('soft-rings')], ['B56', 'theme icon', 'lines', line((l) => !!l.icon)],
  ['B57', 'frame-lights', 'lines', line((l) => l.idle === 'frame-lights')], ['B58', 'oval ring', 'lines', line((l) => !!l.oval)], ['B59', 'paper-drift', 'cuts', fx('paper-drift')], ['B60', 'fold-mark', 'cuts', fx('fold-mark')],
  ['B61', 'margin-doodle', 'cuts', fx('margin-doodle')], ['B62', 'woven-lines', 'cuts', fx('woven-lines')], ['B63', 'aperture', 'lines', hand('aperture')], ['B64', 'paper-edge', 'cuts', fx('paper-edge')],
  ['B65', 'herringbone', 'cuts', fx('herringbone')], ['B66', 'horizon-light', 'cuts', fx('horizon-light')], ['B67', 'signal', 'lines', hand('signal')], ['B68', 'surface-crack', 'cuts', fx('surface-crack')],
  ['B69', 'palette pass', 'cuts', cut((c) => c.transition === 'lyric-palette')], ['B70', 'accent relay', 'lines', line((l) => !!l.relay)], ['B71', 'scale-steps', 'lines', line((l) => l.enter === 'scale-steps')], ['B72', 'node-fold', 'lines', out('node-fold')],
];
const NOTE: Record<string, string> = { B70: 'NOT DONE: planned, but the frames of the line show one colour, so no relay was seen; not in the gallery', B71: 'one line of five songs plays it (choroin c077); its steps were checked by unit test and one gallery frame', B67: 'small pale grain beside the words; meaning only: no line about a signal dropping', B68: 'a few short forked cracks; the backlog shard move dropped', B69: 'paper tint sheet, no words on the frame during it: the backlog 經中性色 was overridden by the user rule against grey flashes', B72: 'small ink points, only after the glyphs have gone', B37: 'NOT DONE: copies pile into a grey block; gallery only, never offered by the composer', B61: 'NOT DONE: removed, the shape had no reason next to the type', B62: 'NOT DONE: removed, a plain lattice with no reason', B49: 'meaning only: no line of the five songs weighs one thing against another', B56: 'meaning only: no thing named on three lines', B60: 'meaning only: needs the song to have a sign' };
const args = process.argv.slice(2);
const at = args.indexOf('--names');
const names = args[at + 1].split(',');
const plans = args.slice(0, at).map((p) => JSON.parse(readFileSync(p, 'utf8')).shots as Shot[]);
console.log(`| Item | Technique | Unit | ${names.map((n, i) => `${n} (${plans[i].flatMap((s) => s.lines).length} lines, ${plans[i].flatMap((s) => s.cuts).length} cuts)`).join(' | ')} | Status |`);
console.log(`|---|---|---|${names.map(() => '---').join('|')}|---|`);
for (const [id, name, unit, count] of ROWS) console.log(`| ${id} | ${name} | ${unit} | ${plans.map(count).join(' | ')} | ${NOTE[id] ?? 'done'} |`);
console.log(`| B21 | counterweight | lines | ${names.map(() => 0).join(' | ')} | NOT DONE: bare solid fails the finish bar; stays out of RECIPES |`);
