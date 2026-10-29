// npx tsx --test scripts/lyric-vj/horizon.test.mts
// horizon.mts --apply with strips already drawn (no model is called): the plan takes the strips, written atomically.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

test('horizon --apply replaces the plan by rename and leaves no temporary', () => {
  const t = mkdtempSync(join(tmpdir(), 'horizon-'));
  const out = join(t, 'horizon'), plan = join(t, 'plan');
  mkdirSync(out); mkdirSync(plan);
  const strips = ['a', 'b'].map((id) => ({ id, shows: id, file: join(out, `hz_${id}.png`) }));
  for (const s of strips) writeFileSync(s.file, 'png');
  writeFileSync(join(out, 'horizon.json'), JSON.stringify({ strips }));
  writeFileSync(join(t, 'song.json'), JSON.stringify({ title: 'T', cues: [] }));
  writeFileSync(join(t, 'treatment.json'), JSON.stringify({ concept: 'c' }));
  const planFile = join(plan, 'treatment.json');
  writeFileSync(planFile, JSON.stringify({ graphics: { sections: [{ start: 0, layers: [{ kind: 'skyline' }] }, { start: 5, layers: [{ kind: 'skyline' }] }] } }));
  const before = statSync(planFile).ino;
  // a HOME without key files: nothing to call, and the strips exist, so no model is reached
  const r = spawnSync(join(here, '../../node_modules/.bin/tsx'), [join(here, 'horizon.mts'), '--song', join(t, 'song.json'), '--treatment', join(t, 'treatment.json'), '--out', out, '--apply', plan], { encoding: 'utf8', env: { ...process.env, HOME: t, GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '' } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const written = JSON.parse(readFileSync(planFile, 'utf8'));
  assert.deepEqual(written.graphics.sections.map((s: { layers: { art: string[] }[] }) => s.layers[0].art), [['hz:a', 'hz:b'], ['hz:b', 'hz:a']]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(plan, 'assets.json'), 'utf8'))), ['hz:a', 'hz:b']);
  assert.notEqual(statSync(planFile).ino, before, 'a new file took the old one\'s place (rename), not a write into it');
  assert.ok(!existsSync(`${planFile}.tmp`) && !existsSync(join(plan, 'assets.json.tmp')));
});
