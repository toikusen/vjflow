// Verdict cards (docs/design-bar/cards): list, validate, and build a context pack for a brief.
//   npx tsx scripts/lyric-vj/verdicts.mts list [--world id] [--rule N]
//   npx tsx scripts/lyric-vj/verdicts.mts check
//   npx tsx scripts/lyric-vj/verdicts.mts pack --world id [--rule N] [--blind]   (2 accept, 2 reject, 1 boundary)
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Verdict = 'accept' | 'reject' | 'boundary';
export type Card = {
  id: string; date: string; verdict: Verdict; scope: 'global' | 'world' | 'song'; worlds: string[]; song: string;
  timecode: string; version: string; lyric: string; frame: string; layer: string; aspects: string[]; rules: number[];
  evidence: string[]; pair: string; supersedes: string; blind: boolean; anchor: boolean; source: string; body: string;
  /** false when the quote block is the 「（無原話…）」 placeholder: such a card is context, never an anchor */
  quoted: boolean;
};

export const CARDS_DIR = 'docs/design-bar/cards';
const VERDICTS = new Set(['accept', 'reject', 'boundary']);
/** Global reject cards on these rules ride along in every pack: carrier broken (8), unreadable (4/6/10). */
const HARD_RULES = new Set([4, 6, 8, 10]);

// ponytail: flat YAML only (scalars, [a, b] lists, booleans) — the template has no nesting; add a yaml dep if it ever does
const scalar = (v: string): unknown => {
  const s = v.replace(/\s+#.*$/, '').trim();
  if (s.startsWith('[')) return s.slice(1, s.lastIndexOf(']')).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (s === 'true' || s === 'false') return s === 'true';
  return s.replace(/^["']|["']$/g, '');
};

/** Parses one card file; throws with the file name when the frontmatter is malformed. */
export function parseCard(text: string, name: string): Card {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${name}: missing frontmatter`);
  const o: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) o[kv[1]] = scalar(kv[2]);
  }
  const body = m[2].trim();
  const quote = /## 業主原話\s*\n\s*>\s*([^\n]*)/.exec(body)?.[1] ?? '';
  const c = {
    worlds: [], aspects: [], evidence: [], anchor: true, ...o, rules: ((o.rules as string[]) ?? []).map(Number), body,
    quoted: quote.length > 0 && !/^[（(]無原話/.test(quote),
  } as Card;
  const problems = [
    c.id !== name && `id "${c.id}" ≠ file name`,
    !/^\d{4}-\d{2}-\d{2}$/.test(c.date) && 'bad date',
    !VERDICTS.has(c.verdict) && `bad verdict "${c.verdict}"`,
    !['global', 'world', 'song'].includes(c.scope) && `bad scope "${c.scope}"`,
    c.scope === 'song' && !c.song && 'scope song needs song',
    c.scope === 'world' && !c.worlds?.length && 'scope world needs worlds',
    c.rules.some((r) => !(r >= 1 && r <= 12)) && 'rules must be 1..12',
    !/## 業主原話\s*\n\s*>/.test(c.body) && 'missing 業主原話 quote',
  ].filter(Boolean);
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
  return c;
}

export function loadCards(dir = CARDS_DIR): Card[] {
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort()
    .map((f) => parseCard(readFileSync(join(dir, f), 'utf8'), f.slice(0, -3)));
}

/**
 * Cards that apply to a world (its own plus global), live (not superseded, not blind), ranked:
 * matches the asked rule → names the world → newest. Blind cards are removed first so a held-out
 * card cannot change what is retrieved through its `supersedes`.
 */
export function relevant(cards: Card[], world?: string, rule?: number, song?: string): Card[] {
  const live = cards.filter((c) => !c.blind);
  const dead = new Set(live.map((c) => c.supersedes).filter(Boolean));
  const own = (c: Card) => Number(!!world && c.worlds.includes(world));
  const hit = (c: Card) => Number(!!rule && c.rules.includes(rule));
  return live.filter((c) => !dead.has(c.id))
    .filter((c) => c.scope === 'global' || (c.scope === 'world' && (!world || c.worlds.includes(world))) || (c.scope === 'song' && !!song && c.song === song))
    .sort((a, b) => hit(b) - hit(a) || own(b) - own(a) || b.date.localeCompare(a.date));
}

/**
 * Anchor pack: every global hard-fault reject, then ~2 accept + 2 reject + 1 boundary from the rest,
 * each with its `pair` partner. Only cards with a verbatim owner quote may anchor.
 */
export function pick(cards: Card[]): Card[] {
  const anchors = cards.filter((c) => c.quoted && c.anchor);
  const hard = anchors.filter((c) => c.scope === 'global' && c.verdict === 'reject' && c.rules.some((r) => HARD_RULES.has(r)));
  const rest = anchors.filter((c) => !hard.includes(c));
  const take = (v: Verdict, n: number) => rest.filter((c) => c.verdict === v).slice(0, n);
  const out = [...hard, ...take('accept', 2), ...take('reject', 2), ...take('boundary', 1)];
  for (const c of [...out]) {
    const p = c.pair && cards.find((x) => x.id === c.pair);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export const render = (c: Card): string => {
  const head = `### ${c.id} — ${c.verdict} (${c.scope}${c.worlds.length ? ': ' + c.worlds.join(', ') : ''}${c.rules.length ? '; rules ' + c.rules.join(',') : ''})`;
  const meta = [
    c.song && `song: ${c.song}`, c.timecode && `timecode: ${c.timecode}`, c.lyric && `lyric: ${c.lyric}`,
    c.layer && `layer: ${c.layer}`, c.aspects.length && `aspects: ${c.aspects.join(' ')}`, c.frame && `frame: ${c.frame}`,
    c.version && `version: ${c.version}`, c.pair && `pair: ${c.pair}`, c.source && `source: ${c.source}`,
    c.evidence.length && `evidence: ${c.evidence.map((e) => e.replace(/^~/, homedir())).join(' ')}`, !c.quoted && 'NOTE: no verbatim quote — context only, not an anchor',
  ].filter(Boolean);
  return [head, ...meta, '', c.body, ''].join('\n');
};

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

if (process.argv[1]?.endsWith('verdicts.mts')) {
  const cmd = process.argv[2];
  const cards = loadCards();
  const world = arg('--world');
  const rule = arg('--rule') ? Number(arg('--rule')) : undefined;
  const song = arg('--song');
  if (cmd === 'check') console.log(`${cards.length} cards ok (${cards.filter((c) => !c.quoted).length} without verbatim quote, ${cards.filter((c) => c.blind).length} blind)`);
  else if (cmd === 'list') for (const c of relevant(cards, world, rule, song)) console.log(`${c.id}\t${c.verdict}\t${c.scope}\t${c.worlds.join(',')}\trules ${c.rules.join(',')}`);
  else if (cmd === 'pack') {
    const got = pick(relevant(cards, world, rule, song));
    console.log(got.map(render).join('\n'));
    const isHard = (c: Card) => c.scope === 'global' && c.verdict === 'reject' && c.rules.some((r) => HARD_RULES.has(r));
    const want = { accept: 2, reject: 2, boundary: 1 } as const;
    const short = (Object.keys(want) as Verdict[]).map((v) => [v, got.filter((c) => c.verdict === v && !isHard(c)).length] as const).filter(([v, n]) => n < want[v]);
    if (short.length) console.log(`不足: ${short.map(([v, n]) => `${v} ${n}/${want[v]}`).join(', ')} — 相關卡不夠，不要硬湊`);
  }
  else console.log('usage: verdicts.mts list|check|pack [--world id] [--rule N]');
}
