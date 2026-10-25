// npx tsx scripts/lyric-vj/storyplan.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recentStages, Screenplay, spread, toStage } from './storyplan.mts';

const cues = [{ id: 'c1', start: 10, end: 14, text: 'a' }, { id: 'c2', start: 20, end: 24, text: 'b' }];
const sp = (over: Partial<Screenplay>): Screenplay => ({
  logline: '', people: '', want: '', symbol: { what: '', means: '' }, beats: [],
  place: { surface: 'ground', what: '', light: '', lightX: 0.3, lightColor: '#ffcc88', lightLevel: 1 },
  things: [], script: [], shots: [], missing: [], ...over,
});

test('a screenplay becomes a stage: unknown sprites and actions dropped, indices remapped, cues timed', () => {
  const { stage } = toStage(sp({
    things: [{ sprite: 'ghost', stands: '', x: 0.5, z: 0.5, size: 0.3 }, { sprite: 'cup', stands: '', x: 2, z: 0.5, size: 0.9 }],
    script: [{ cue: 'c1', beat: 2, action: 'fall', things: [1], toX: 0, toZ: 0, level: 0, look: '' }, { cue: 'c2', beat: 0, action: 'explode', things: [1], toX: 0, toZ: 0, level: 0, look: '' }, { cue: 'c2', beat: 0, action: 'light', things: [], toX: 0, toZ: 0, level: 0, look: '' }],
    shots: [{ cue: 'c2', frame: 'close', focus: 1, why: '' }],
  }), cues, 0.5, new Set(['cup']), { ink: '#111', paper: '#eee', accent: '#c00' });
  assert.deepEqual(stage.things, [{ sprite: 'cup', x: 0.94, z: 0.5, size: 0.36 }]);
  assert.deepEqual(stage.script.map((c) => [c.at, c.action, c.things]), [[11, 'fall', [0]], [20, 'light', []]]);
  assert.deepEqual(stage.shots, [{ at: 20, frame: 'close', focus: 0 }]);
});

test('an action under a line filling the frame is dropped and named; the light still changes there', () => {
  const { stage, hidden } = toStage(sp({
    things: [{ sprite: 'cup', stands: '', x: 0.5, z: 0.5, size: 0.3 }],
    script: [{ cue: 'c2', beat: 0, action: 'out', things: [0], toX: 0, toZ: 0, level: 0, look: '' }, { cue: 'c2', beat: 0, action: 'light', things: [], toX: 0, toZ: 0, level: 0.2, look: '' }],
  }), cues, 0.5, new Set(['cup']), { ink: '#111', paper: '#eee', accent: '#c00' }, [[18, 30]]);
  assert.deepEqual(hidden, ['20.0 s out']);
  assert.deepEqual(stage.script.map((c) => c.action), ['light']);
});

test('the writer is shown the last six other songs\' stages', () => {
  const h = Array.from({ length: 8 }, (_, i) => ({ song: `s${i}`, surface: 'table', place: '', light: '', symbol: '' }));
  assert.deepEqual(recentStages([...h, { song: 'me', surface: '', place: '', light: '', symbol: '' }], 'me').map((x) => x.song), ['s2', 's3', 's4', 's5', 's6', 's7']);
});

test('things standing on top of each other are moved apart', () => {
  const out = spread([{ x: 0.5, z: 0.5 }, { x: 0.52, z: 0.55 }, { x: 0.9, z: 0.1 }]);
  assert.ok(Math.abs(out[1].x - out[0].x) >= 0.14);
  assert.equal(out[2].x, 0.9);
});
