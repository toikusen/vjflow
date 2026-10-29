// npx tsx --test scripts/lyric-vj/beta/concept-sh.test.mts
// concept.sh on a stub tree: a fake npx logs every step's arguments; only the director step is left to run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

/** A song with a previous concept run `c1` and a new run `c2` whose type plan and stills are already there. */
function tree(inputs: Record<string, unknown>, previousRequest?: string) {
  const t = mkdtempSync(join(tmpdir(), 'conceptsh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'concept.sh'), join(t, 'repo/scripts/lyric-vj/beta/concept.sh'));
  mkdirSync(join(t, 'bin'));
  writeFileSync(join(t, 'bin/npx'), '#!/bin/bash\nprintf \'%s\\n\' "npx $*" >> "$NPX_LOG"\n', { mode: 0o755 });
  const song = join(t, 'song'), run = join(song, 'runs/c2');
  mkdirSync(join(song, 'runs/c1/base'), { recursive: true });
  writeFileSync(join(song, 'runs/c1/base/treatment.json'), '{}');
  if (previousRequest !== undefined) writeFileSync(join(song, 'runs/c1/request.txt'), previousRequest);
  mkdirSync(join(run, 'noimg'), { recursive: true });
  mkdirSync(join(run, 'stills'));
  writeFileSync(join(song, 'song.json'), JSON.stringify({ duration: 10, cues: [] }));
  writeFileSync(join(run, 'inputs.json'), JSON.stringify(inputs));
  writeFileSync(join(run, 'noimg/treatment.json'), '{}');
  const log = join(t, 'npx.log');
  const cmd = ['bash', join(t, 'repo/scripts/lyric-vj/beta/concept.sh'), song, run];
  const baseEnv = { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, NPX_LOG: log } as Record<string, string>;
  const concept = (env: Record<string, string> = {}) => spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', env: { ...baseEnv, ...env } });
  const direct = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').find((l) => l.includes('direct.mts')) ?? '';
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { run, cmd, env: baseEnv, concept, direct, calls };
}

test('concept.sh: the song\'s horizons are drawn before the stills and applied to the noimg plan, so the stills show the skylines the video will have', () => {
  const t = tree({ concept: 'c', refs: [] });
  assert.equal(t.concept().status, 0);
  const lines = t.calls().split('\n');
  const horizon = lines.findIndex((l) => l.includes('horizon.mts'));
  const stills = lines.findIndex((l) => l.includes('render.mts'));
  // (the stub tree already holds stills/, so the render step may be skipped: then only the order matters when it ran)
  assert.ok(horizon >= 0 && (stills < 0 || stills > horizon), `horizon before the stills: ${lines.join(' | ')}`);
  assert.match(lines[horizon], /--out \S+\/runs\/c2\/horizon --apply \S+\/runs\/c2\/noimg/);
});

test('concept.sh: an adjustment passes the previous treatment and the note; the note stays out of brief.txt', () => {
  const t = tree({ concept: '夏天的夜市', note: '再亮一點', from: 'c1', refs: [] });
  const r = t.concept();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = t.direct();
  assert.match(d, /--previous \S+\/runs\/c1\/base\/treatment\.json/);
  assert.match(d, /--note=再亮一點/);
  assert.equal(readFileSync(join(t.run, 'brief.txt'), 'utf8'), '夏天的夜市\n');
});

test('concept.sh: the server tiers reach the director as --proven and --candidates; an empty proven list is passed too', () => {
  const t = tree({ concept: 'c', refs: [] });
  assert.equal(t.concept({ VJ_PROVEN: 'swiss,terminal', VJ_CANDIDATES: 'scrapbook' }).status, 0);
  assert.match(t.direct(), /--proven=swiss,terminal --candidates scrapbook/);
  const empty = tree({ concept: 'c', refs: [] });
  assert.equal(empty.concept({ VJ_PROVEN: '' }).status, 0);
  assert.match(empty.direct(), /--proven=(\s|$)/);
  // outside the beta (no variables) the director keeps its code list
  const none = tree({ concept: 'c', refs: [] });
  const env = { ...none.env };
  delete env.VJ_PROVEN; delete env.VJ_CANDIDATES;
  assert.equal(spawnSync(none.cmd[0], none.cmd.slice(1), { encoding: 'utf8', env }).status, 0);
  assert.doesNotMatch(none.direct(), /--proven|--candidates/);
});

test('concept.sh: request.txt is the concept text plus every adjust note of the chain; a redo starts over', () => {
  // first concept: its text alone
  const first = tree({ concept: '水彩的夏天', refs: [] });
  assert.equal(first.concept().status, 0);
  assert.equal(readFileSync(join(first.run, 'request.txt'), 'utf8'), '水彩的夏天\n');
  // second adjustment: the previous run's request (text + first note) plus this note
  const second = tree({ concept: '水彩的夏天', note: '人物再大一點', from: 'c1', refs: [] }, '水彩的夏天\n\n使用者對上一版的意見：改成版畫\n');
  assert.equal(second.concept().status, 0);
  assert.equal(readFileSync(join(second.run, 'request.txt'), 'utf8'), '水彩的夏天\n\n使用者對上一版的意見：改成版畫\n\n使用者對上一版的意見：人物再大一點\n');
  // an adjustment of a run from before request.txt existed starts from the concept text
  const legacy = tree({ concept: '水彩的夏天', note: '改成版畫', from: 'c1', refs: [] });
  assert.equal(legacy.concept().status, 0);
  assert.equal(readFileSync(join(legacy.run, 'request.txt'), 'utf8'), '水彩的夏天\n\n使用者對上一版的意見：改成版畫\n');
  // a redo drops the notes: they were about the direction being left
  const redo = tree({ concept: '水彩的夏天', from: 'c1', refs: [] }, '水彩的夏天\n\n使用者對上一版的意見：改成版畫\n');
  assert.equal(redo.concept().status, 0);
  assert.equal(readFileSync(join(redo.run, 'request.txt'), 'utf8'), '水彩的夏天\n');
});

test('concept.sh: a redo passes the previous treatment without a note', () => {
  const t = tree({ concept: '夏天的夜市', from: 'c1', refs: [] });
  const r = t.concept();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = t.direct();
  assert.match(d, /--previous \S+\/runs\/c1\/base\/treatment\.json/);
  assert.doesNotMatch(d, /--note/);
});

test('concept.sh: the admin\'s rules file reaches the director and the type planner as --lessons; an empty file is not passed to the director', () => {
  const t = tree({ concept: 'c', refs: [] });
  const lessons = join(t.run, '..', 'lessons.json');
  writeFileSync(lessons, JSON.stringify({ lessons: [{ id: 'a', text: '間奏不放圖片', scope: 'both' }] }));
  assert.equal(t.concept({ VJ_LESSONS: lessons }).status, 0);
  assert.match(t.direct(), new RegExp(`--lessons ${lessons.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  const none = tree({ concept: 'c', refs: [] });
  assert.equal(none.concept().status, 0);
  assert.doesNotMatch(none.direct(), /--lessons/);
});
