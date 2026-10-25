// What the motion references we learn from added since we last looked: Motion Prompt (MIT, one spec per effect) and
// the kittenjam motion library (a curated list; its names and prompts belong to their authors, so we learn the move
// and redraw it, never copy its code). Prints the new entries and records them as seen; learning one is still a
// session's work (a move, its knobs, its help line, a test, then origins.mts for its row).
//
// npx tsx scripts/lyric-vj/refs-watch.mts [--seen out/knowledge/refs-seen.json] [--dry]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { seen: { type: 'string', default: 'out/knowledge/refs-seen.json' }, dry: { type: 'boolean', default: false } } });

type Entry = { id: string; name: string; what: string };
type Seen = Record<string, string[]>;

/** Motion Prompt's effects: one api/v1/en/e/NNN.txt each, its name on line 3 and "What happens" below. */
export function motionPromptEntries(dir: string): Entry[] {
  const e = join(dir, 'api/v1/en/e');
  return readdirSync(e)
    .filter((f) => /^\d+\.txt$/.test(f))
    .map((f) => {
      const lines = readFileSync(join(e, f), 'utf8').split('\n');
      const what = lines.find((l) => l.startsWith('// What happens:'))?.replace('// What happens:', '').trim() ?? '';
      return { id: f.replace('.txt', ''), name: (lines[2] ?? '').replace(/^\/\/\s*/, ''), what };
    });
}

/** kittenjam's effects: one JSON object per line of data.js's ITEMS. */
export function kittenjamEntries(js: string): Entry[] {
  return [...js.matchAll(/^\{"id".*\}(?=,?\s*$)/gm)].map((m) => {
    const x = JSON.parse(m[0]) as { id: number; zh: string; en: string; desc: string; comp: string };
    return { id: String(x.id), name: `${x.zh} / ${x.en} [${x.comp}]`, what: x.desc };
  });
}

/** The entries not seen before (all of them the first time a source is watched). */
export const fresh = (all: Entry[], seen: string[] = []) => all.filter((x) => !seen.includes(x.id));

if (process.argv[1]?.endsWith('refs-watch.mts')) {
  const seen: Seen = existsSync(a.seen!) ? JSON.parse(readFileSync(a.seen!, 'utf8')) : {};
  const tmp = mkdtempSync(join(tmpdir(), 'refs-'));
  const sources: [string, () => Entry[]][] = [
    ['motion-prompt', () => {
      execFileSync('git', ['clone', '-q', '--depth', '1', 'https://github.com/showheyohtaki/motion-prompt', join(tmp, 'mp')]);
      return motionPromptEntries(join(tmp, 'mp'));
    }],
    ['kittenjam', () => kittenjamEntries(execFileSync('curl', ['-fsSL', 'https://kittenjam-motion-library.vercel.app/data.js'], { encoding: 'utf8', maxBuffer: 1 << 26 }))],
  ];
  try {
    for (const [name, load] of sources) {
      let all: Entry[];
      try {
        all = load();
      } catch (err) {
        console.log(`## ${name}: could not fetch (${(err as Error).message.split('\n')[0]})`);
        continue;
      }
      const add = fresh(all, seen[name]);
      console.log(`## ${name}: ${all.length} entries, ${add.length} new${seen[name] ? '' : ' (first look: all of them)'}`);
      for (const x of add) console.log(`- #${x.id} ${x.name} — ${x.what}`);
      seen[name] = all.map((x) => x.id);
    }
    if (!a.dry) writeFileSync(a.seen!, JSON.stringify(seen, null, 1));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
