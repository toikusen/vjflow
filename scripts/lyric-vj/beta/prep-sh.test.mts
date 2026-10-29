// npx tsx --test scripts/lyric-vj/beta/prep-sh.test.mts
// prep.sh on a stub tree: the stems step is a stub, the fake npx parses song.mts's options as song.mts does.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

/** song.mts's own option set (parseArgs, strict): what the fake npx parses the arguments with. */
const SONG_OPTIONS = '{ audio: { type: "string" }, instrumental: { type: "string" }, vocals: { type: "string" }, lrc: { type: "string" }, title: { type: "string" }, out: { type: "string" }, lyrics: { type: "string" }, language: { type: "string", default: "ja" }, "vocals-alt": { type: "string" }, "no-lrclib": { type: "boolean" } }';

function tree() {
  const t = mkdtempSync(join(tmpdir(), 'prepsh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'prep.sh'), join(t, 'repo/scripts/lyric-vj/beta/prep.sh'));
  writeFileSync(join(t, 'repo/scripts/lyric-vj/stems.sh'), '#!/bin/bash\ntouch "$1/vocals.wav" "$1/vocals_kim.wav"\n', { mode: 0o755 });
  mkdirSync(join(t, 'bin'));
  const parse = `const { parseArgs } = require("node:util"); const { values } = parseArgs({ args: process.argv.slice(1), options: ${SONG_OPTIONS} }); require("node:fs").writeFileSync(process.env.TITLE_OUT, values.title);`;
  writeFileSync(join(t, 'bin/npx'), `#!/bin/bash\nif [[ "$2" == *song.mts ]]; then shift 2; exec node -e ${JSON.stringify(parse)} -- "$@"; fi\nexit 0\n`, { mode: 0o755 });
  const song = join(t, 'song');
  mkdirSync(song);
  writeFileSync(join(song, 'mix.mp3'), 'mp3');
  writeFileSync(join(song, 'lyrics.txt'), 'la\n');
  const titleOut = join(t, 'title.txt');
  const prep = (title: string) => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/prep.sh'), song, 'ja', title], { encoding: 'utf8', env: { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, TITLE_OUT: titleOut } });
  return { prep, title: () => readFileSync(titleOut, 'utf8') };
}

test('prep.sh: an artist or title that starts with - reaches song.mts as the title', () => {
  const t = tree();
  const r = t.prep('-ERROR - 歌');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(t.title(), '-ERROR - 歌');
  assert.equal(t.prep('A - B').status, 0);
  assert.equal(t.title(), 'A - B');
});
