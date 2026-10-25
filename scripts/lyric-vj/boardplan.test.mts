// npx tsx scripts/lyric-vj/boardplan.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBoard, asText, bigWindows, evidenceProps, gateMode, modesFor, toBoard, withoutBoards } from './boardplan.mts';

const cues = [{ id: 'c1', start: 10, end: 14, text: 'a' }, { id: 'c2', start: 20, end: 24, text: 'b' }];

test('a storyboard becomes board pieces and timed events; unknown pictures, cues and actions are dropped', () => {
  const b = toBoard({
    items: [
      { sprite: 'cup', scene: '', text: '', cue: 'c1', why: '' },
      { sprite: 'nope', scene: 'img_temple', text: '', cue: 'c1', why: '' },
      { sprite: '', scene: '', text: '收驚', cue: 'c2', why: '' },
      { sprite: '', scene: '', text: 'x', cue: 'c9', why: '' },
    ],
    events: [
      { kind: 'link', cue: 'c2', beat: 2, items: [0, 1, 2, 7], text: '', look: '' },
      { kind: 'explode', cue: 'c2', beat: 0, items: [0], text: '', look: '' },
    ],
    missing: [],
  }, cues, 0.5, new Set(['cup']), new Set(['img_temple']));
  assert.deepEqual(b.items, [{ sprite: 'cup', at: 10 }, { scene: 'img_temple', at: 10 }, { text: '收驚', at: 20 }]);
  assert.equal(b.events.length, 1);
  assert.deepEqual([b.events[0].at, b.events[0].items], [21, [0, 1, 2]]);
});

test('events under a line filling the frame are dropped and named; the board lands on every cut', () => {
  const big = bigWindows([{ start: 0, end: 15, template: 'stair' }, { start: 15, end: 25, template: 'punch' }]);
  assert.deepEqual(big, [[15, 25]]);
  const b = toBoard({ items: [{ sprite: 'cup', scene: '', text: '', cue: 'c1', why: '' }], events: [{ kind: 'stamp', cue: 'c1', beat: 0, items: [], text: '章', look: '' }, { kind: 'loosen', cue: 'c2', beat: 0, items: [0], text: '', look: '' }], missing: [] }, cues, 0.5, new Set(['cup']), new Set(), big);
  assert.deepEqual(b.events.map((e) => e.kind), ['stamp']);
  assert.deepEqual(b.hidden, ['20.0 s loosen']);
  const t = applyBoard({ graphics: { sections: [{ layers: [{ kind: 'kinetic', ink: '#111', paper: '#eee' }] }, { layers: [{ kind: 'fill' }, { kind: 'kinetic', ink: '#111', paper: '#eee' }] }] } }, b, 0, 30, '#D00');
  assert.ok(t.graphics.sections.every((s) => s.layers.some((l) => l.kind === 'kinetic' && l.board)));
});

test('only props drawn for a sung line may be evidence; mood and culture props stay scenery', () => {
  const lib = [{ id: 'cola.bottle' }, { id: 'squid.grilled_skewer' }, { id: 'goldfish.bag_2' }, { id: 'heels' }];
  const roles = new Map([['cola.bottle', 'lyric'], ['squid.grilled_skewer', 'culture'], ['goldfish.bag', 'mood']]);
  assert.deepEqual(evidenceProps(lib, roles).map((x) => x.id), ['cola.bottle', 'heels']);
});

test('the type-only board prints a word from each piece\'s own line, never one the line lacks', () => {
  const sb = { items: [{ sprite: 'cup', scene: '', text: '', cue: 'c1', why: '' }, { sprite: '', scene: 'x', text: '', cue: 'c2', why: '' }], events: [], missing: [] };
  const lines = [{ id: 'c1', start: 10, end: 14, text: '你是我的可口可樂' }, { id: 'c2', start: 20, end: 24, text: '明天要去廟裡收驚拜拜' }];
  const b = asText({ items: [{ sprite: 'cup', at: 10 }, { scene: 'x', at: 20 }], events: [] }, sb, lines, ['可口可樂', '香水']);
  assert.deepEqual(b.items, [{ at: 10, text: '可口可樂' }, { at: 20, text: '明天要去' }]);
});

test('a world lays its things in the place with its views, and no events', () => {
  const t = applyBoard({ graphics: { sections: [{ layers: [{ kind: 'kinetic', ink: '#111', paper: '#eee' }] }] } }, { items: [{ sprite: 'bridge', at: 1 }], events: [], views: [{ at: 1, zoom: 1, focus: 0 }] }, 0, 30, '#D00', 'world');
  const b = t.graphics.sections[0].layers[0].board as { style: string; layout: string; views: unknown[] };
  const withSticker = applyBoard({ graphics: { sections: [{ layers: [{ kind: 'kinetic', ink: '#111', paper: '#eee', sprite: 'crow' } as never] }] } }, { items: [], events: [] }, 0, 30, '#D00', 'world');
  assert.equal((withSticker.graphics.sections[0].layers[0] as { sprite?: string }).sprite, undefined, 'a world drops the per-cut stickers');
  assert.deepEqual([b.style, b.layout, b.views.length], ['stage', 'scene', 1]);
});

test('a mood song gets a place at most; events need six sung things with pictures', () => {
  assert.deepEqual(modesFor(['mood', 'narrative']), ['none', 'world']);
  assert.deepEqual(modesFor(['attitude', 'narrative']), ['none', 'world', 'events']);
  const pic = (n: number) => Array.from({ length: n }, (_, i) => ({ sprite: `s${i}`, at: i }));
  assert.equal(gateMode('events', [...pic(4), { text: '擁抱', at: 9 }, { text: '再見', at: 9 }]), 'world');
  assert.equal(gateMode('events', pic(6)), 'events');
});

test('a world drops the backdrops\' stock discs; a song with no events keeps no boards', () => {
  const t = applyBoard({ graphics: { sections: [{ layers: [{ kind: 'blob' }, { kind: 'bands' }, { kind: 'kinetic', ink: '#111', paper: '#eee' }] }] } }, { items: [], events: [] }, 0, 30, '#D00', 'world');
  assert.deepEqual(t.graphics.sections[0].layers.map((l) => l.kind), ['bands', 'kinetic']);
  const bare = withoutBoards({ graphics: { sections: [{ layers: [{ kind: 'kinetic', board: {} }] }] } });
  assert.equal(bare.graphics.sections[0].layers[0].board, undefined);
});
