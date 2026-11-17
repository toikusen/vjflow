// npx tsx --test scripts/lyric-vj/chroma-screen.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hueChroma, SAFE_HUE, SCREENS, screenFor, screenGap } from './chroma-screen.mts';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';

test('hueChroma reads hue and colourfulness', () => {
  assert.equal(Math.round(hueChroma('#00B140').hue), 142);
  assert.equal(hueChroma('#808080').chroma, 0);
  assert.ok(hueChroma('#B5502F').hue < 20);
});

test('a palette without green keeps the green screen', () => {
  assert.equal(screenFor(['#111111', '#F7F6F1', '#E7B56C']).name, 'green');
  assert.equal(screenFor(['#2C3F8F', '#F5EFE4', '#D9481C']).name, 'green');
});

test('a teal/green palette moves off green (silk-pine, Tokyo Drift)', () => {
  const pine = ['#16333A', '#DFE9E2', '#B5502F', '#3B6B76'];
  const s = screenFor(pine);
  assert.notEqual(s.name, 'green');
  assert.ok(screenGap(s, pine) >= SAFE_HUE);
});

test('a palette with green and blue goes to magenta', () => {
  assert.equal(screenFor(['#1F8A4C', '#2D6A8A', '#F0EDE6']).name, 'magenta');
});

test('greys and near-black inks never push the screen', () => {
  assert.equal(screenFor(['#0B140F', '#E8ECEA', '#7A7A7A']).name, 'green');
});

test('every scheme of every style world gets a screen far from its coloured inks', () => {
  for (const w of STYLE_WORLDS) for (const p of w.palette) {
    const inks = [p.ink, p.ground, p.accent, p.ink2].filter(Boolean) as string[];
    const s = screenFor(inks);
    const best = Math.max(...SCREENS.map((x) => screenGap(x, inks)));
    assert.ok(screenGap(s, inks) >= Math.min(SAFE_HUE, best), `${p.id}: ${s.name} too near an ink`);
  }
});
