// Race tests for lock.mts with real processes: npx tsx scripts/lyric-vj/lock.test.mts
// (a child: npx tsx scripts/lyric-vj/lock.test.mts child <lock> <startAtMs> <holdMs>)
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lockFile } from './lock.mts';

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {
  const [file, startAt, hold] = process.argv.slice(3).map((x, i) => (i ? Number(x) : x)) as [string, number, number];
  while (Date.now() < startAt); // all children try in the same millisecond
  try {
    lockFile(file, (pid) => `busy ${pid}`);
    // while held, the lock names this process
    const named = Number(readFileSync(file, 'utf8')) === process.pid;
    process.stdout.write(named ? 'got' : 'got-but-not-named');
    setTimeout(() => process.exit(0), hold);
  } catch (e) {
    process.stdout.write(String((e as Error).message).startsWith('busy') ? 'busy' : `error ${(e as Error).message}`);
    process.exit(0);
  }
} else if (process.argv[2] === 'reader') {
  // reads the lock until the deadline; reports any read of an empty lock
  const [file, until] = [process.argv[3], Number(process.argv[4])];
  let empty = 0;
  while (Date.now() < until) {
    try {
      if (readFileSync(file, 'utf8') === '') empty++;
    } catch {
      // not there right now
    }
  }
  process.stdout.write(String(empty));
} else {
  const run = (args: string[]) =>
    new Promise<string>((resolve) => {
      const p = spawn('npx', ['tsx', self, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out.trim()));
    });
  const race = async (file: string, n = 8) => {
    const startAt = Date.now() + 4000; // after every child has started tsx
    const reader = run(['reader', file, String(startAt + 1500)]);
    const results = await Promise.all(Array.from({ length: n }, () => run(['child', file, String(startAt), '1500'])));
    return { results, emptyReads: Number(await reader) };
  };
  const deadPid = () => spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;

  test('eight processes taking a free lock at once: exactly one gets it, nobody reads it empty', async () => {
    for (let round = 0; round < 3; round++) {
      const dir = mkdtempSync(join(tmpdir(), 'lock-'));
      const file = join(dir, 'x.lock');
      const { results, emptyReads } = await race(file);
      assert.deepEqual(results.filter((r) => r === 'got').length, 1, results.join(','));
      assert.ok(results.every((r) => r === 'got' || r === 'busy'), results.join(','));
      assert.equal(emptyReads, 0);
      assert.equal(existsSync(file), false, 'released on exit');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('eight processes taking over a dead process’s lock at once: exactly one gets it', async () => {
    for (let round = 0; round < 3; round++) {
      const dir = mkdtempSync(join(tmpdir(), 'lock-'));
      const file = join(dir, 'x.lock');
      writeFileSync(file, deadPid());
      const { results, emptyReads } = await race(file);
      assert.deepEqual(results.filter((r) => r === 'got').length, 1, results.join(','));
      assert.ok(results.every((r) => r === 'got' || r === 'busy'), results.join(','));
      assert.equal(emptyReads, 0);
      assert.equal(existsSync(`${file}.takeover`), false, 'the takeover guard is not left behind');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an old holder’s release never removes a lock that now names someone else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    const file = join(dir, 'x.lock');
    const release = lockFile(file, () => 'busy');
    writeFileSync(file, String(process.ppid)); // the lock was taken over by another (live) process
    release();
    assert.equal(readFileSync(file, 'utf8'), String(process.ppid));
    rmSync(dir, { recursive: true, force: true });
  });

  test('a live holder blocks, with its pid in the message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    const file = join(dir, 'x.lock');
    writeFileSync(file, String(process.ppid));
    assert.throws(() => lockFile(file, (pid) => `busy ${pid}`), new RegExp(`busy ${process.ppid}`));
    rmSync(dir, { recursive: true, force: true });
  });
}
