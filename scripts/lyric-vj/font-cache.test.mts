// Cold and warm cache tests for font-cache.mts: npx tsx scripts/lyric-vj/font-cache.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fontCache } from './font-cache.mts';

const URL_A = 'https://fonts.gstatic.com/s/zen/a.woff2';
const URL_B = 'https://fonts.gstatic.com/s/zen/b.woff2';
// a slow server: both requests are in flight before either answers
const server = (calls: string[], ok = true) => async (url: string) => {
  calls.push(url);
  await new Promise((r) => setTimeout(r, 30));
  return new Response(ok ? `font:${url}` : 'down', { status: ok ? 200 : 503, headers: { 'content-type': 'font/woff2' } });
};
const noWait = () => Promise.resolve();

test('an empty cache, two pages of one process asking for the same font at once: one download, both get it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'font-cache-'));
  try {
    const calls: string[] = [];
    const get = fontCache(dir, server(calls), noWait);
    const [a, b] = await Promise.all([get(URL_A, 'ua'), get(URL_A, 'ua')]);
    assert.equal(calls.length, 1);
    assert.equal(a?.body.toString(), `font:${URL_A}`);
    assert.equal(b?.body.toString(), `font:${URL_A}`);
    assert.equal(a?.type, 'font/woff2');
    // the entry and its type, no temp files left behind
    assert.equal(readdirSync(dir).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two processes (two caches on one directory) downloading the same font at once both land it whole', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'font-cache-'));
  try {
    const calls: string[] = [];
    const [one, two] = [fontCache(dir, server(calls), noWait), fontCache(dir, server(calls), noWait)];
    const got = await Promise.all([one(URL_A, 'ua'), two(URL_A, 'ua'), one(URL_B, 'ua'), two(URL_B, 'ua')]);
    assert.deepEqual(got.map((f) => f?.body.toString()), [URL_A, URL_A, URL_B, URL_B].map((u) => `font:${u}`));
    assert.equal(readdirSync(dir).length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a warm cache answers without the network; a font neither cached nor reachable is a miss', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'font-cache-'));
  try {
    const calls: string[] = [];
    await fontCache(dir, server(calls), noWait)(URL_A, 'ua');
    const offline: string[] = [];
    const later = fontCache(dir, server(offline, false), noWait);
    assert.equal((await later(URL_A, 'ua'))?.body.toString(), `font:${URL_A}`);
    assert.equal(offline.length, 0);
    assert.equal(await later(URL_B, 'ua'), undefined);
    assert.equal(offline.length, 4); // the first try and three retries
    assert.deepEqual(readdirSync(dir).sort(), readdirSync(dir).filter((f) => !f.includes('.' + process.pid)).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
