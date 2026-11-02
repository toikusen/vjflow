// npx tsx scripts/lyric-vj/lineplan.test.mts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balancedRows, chunks, cutPieces, setWordSafe } from '../../src/app/lyric-vj/phrases';
import { REST_FLOOR } from '../../src/app/lyric-vj/render/reading-window';
import { contactShadow, cornerRoom, edgesByRoom, fibres, finePlace, hushOf, insetOutline, isFlood, maskedByLine, mixHex, ovalFit, ovalOf, passTint, patchClear, rayStart, scrapsOutside, shortCracks, mottle, Pt, roughEdge, tornLine } from '../../src/app/lyric-vj/render/material';
import { apertureAt, nodePhase, nodeSize, relayAt, lampsLit, lampSpans, ovalStroke, balancePoint, balanceTilt, boxAngle, boxTurn, breathLine, crumbPose, displayLevel, feedLeft, heldTail, divePose, ECHO_WAYS, echoPose, feedShift, focusShare, foldPhase, gravityPose, isLineExit, leanAngle, poreField, railAhead, railPose, railShare, LINE_EXIT_KINDS, LINE_EXIT_SEC, pushFocus, radialShift, slatClose, stripShare, strokeLeft, tilePose, tilesOf, waveShift, waveThin } from '../../src/app/lyric-vj/render/line-exit';
import { isLineGround, LINE_GROUNDS } from '../../src/app/lyric-vj/render/line-grounds';
import { KINETIC_FX } from '../../src/app/lyric-vj/render/kinetic';
import { fitRows, fourPieces, loneScale, openOnTwo, rowTargets } from '../../src/app/lyric-vj/render/build-rows';
import { hitAt } from '../../src/app/lyric-vj/render/screen-hit';
import { TEXT_CAM_KINDS, textCamAt } from '../../src/app/lyric-vj/render/text-cam';
import { ARRIVAL_SEC, ARRIVALS, cornerPose, stepScale, curvePoint, doorPhase, doorSeam, isArrival, markShare, seatPhase, waveEdge, waveRise } from '../../src/app/lyric-vj/render/arrival';
import { bandEdges, bandOffset, slatEdges, slatTurn } from '../../src/app/lyric-vj/render/band-clip';
import { isTrack, rigAt, rigBack, rigProgress, RIG_KINDS, stopPose, TRACK_KINDS } from '../../src/app/lyric-vj/render/camera-rig';
import { bandBox, cardBox, carrierPad, frameBox, hangBox, hangPad, paperPose, roundedBox, tagBox } from '../../src/app/lyric-vj/render/carrier-shape';
import { bandTilt, CARRIER_SEC, cardPose, cardTilt, crossWindow, developShare, feedShare, feedStops, foldCuts, foldPanels, foldPlace, hangPose, liftPhase, slipWidths, tailSwing, tileFace, tileRows, tileTurn } from '../../src/app/lyric-vj/render/carrier-moves';
import { dotPitch, exteriorOf, grainStep, litShare, pressDepth, softDepth, stateFor } from '../../src/app/lyric-vj/render/glyph-state';
import { relayBetween, relayPoint, relaySpan, relayStrip } from '../../src/app/lyric-vj/render/handoff-anchor';
import { bandSpan, CHAIN_EDGES, chainTurn, handoffProgress, handoffTimes, HANDOFF_KINDS, HANDOFF_TRANSITION, inPose, openingAt, outPose, pageEdge, pageSquash, passKeeps, seamClear } from '../../src/app/lyric-vj/render/lyric-handoff';
import { gateMotion, lineBeats, lineWindow, readingSec } from '../../src/app/lyric-vj/render/reading-window';
import { boundaryAt, halfPlaneOf, seatBoundary, sideOf } from '../../src/app/lyric-vj/render/shared-mask';
import { ENTER_KINDS, EXIT_KINDS, IDLE_KINDS, LINE_ENTERS, LINE_EXITS, LINE_IDLES } from '../../src/app/lyric-vj/treatment';
import { TRANSITION_KINDS } from '../../src/app/lyric-vj/render/transition';
import { TEMPLATES as HELP_TEMPLATES } from './typehelp.mts';
import { forceOf } from './linegallery.mts';
import { LINE_MOTION } from '../../src/app/lyric-vj/render/motion-transition';
import { cellBars, cellRow, cornerOf, counterweight, crossingOf, pageColumns, phraseSpans, ellipsePoints, spoken, twoParts, upright } from '../../src/app/lyric-vj/render/line-space';
import { noteBox } from '../../src/app/lyric-vj/render/carrier-shape';
import { TEMPLATES as ALL_TEMPLATES } from '../../src/app/lyric-vj/templates';
import { BACKGROUNDS, composePlan, composerBase, composeTransitions, exitFor, fineFor, GROUND_HELP, PALETTES, themeIcon, Cue, fallbackParts, fitsCalm, handoffFor, keyOf, levelOf, nextFx, pairFor, parallel, pickRecipe, planHandoffs, planPairs, QUIET_BACKGROUNDS, RECIPES, rigFor, shotsOf, targetOf } from './lineplan-core.mts';

const cue = (i: number, text: string, len = 3): Cue => ({ id: `c${i}`, start: 5 + i * 4, end: 5 + i * 4 + len, text });
const cues = ['第一句歌詞很短', '第二句也不太長', '第一句歌詞很短', '第四句是另外一句', '第五句再換一句', '第六句還是不同'].map((t, i) => cue(i, t));
const song = { title: 't', duration: 40, tempo: 120, beats: Array.from({ length: 80 }, (_, i) => i / 2), cues };
const meaning = { palette: 'tea', ground: 'flat', reading: 'r', parts: [{ from: 'c0', tension: 0.5, fx: ['split', 'dots', 'flow'], what: 'a' }], keys: [] };
const { plan, shots } = composePlan(song, meaning, false);
const lines = plan.shots.flatMap((s) => (s.lines as { cue: string; enter: string }[]).map((l) => ({ ...l, tpl: s.lyric.template })));

assert.equal(lines.length, cues.length, 'every sung line is planned');
assert.equal(shots[0].cue, undefined, 'the intro is a shot of its own');
for (let i = 1; i < lines.length; i++) if (lines[i].cue !== 'c2') assert.notEqual(lines[i].tpl, lines[i - 1].tpl, 'a new line takes a new layout');
assert.equal(lines[2].tpl, lines[0].tpl, 'a repeated line returns with its recipe');
assert.equal(lines[2].enter, lines[0].enter);
assert.ok(plan.shots.every((s) => s.cuts.length > 0), 'every shot has a background');
assert.ok(plan.shots.flatMap((s) => s.cuts).every((c) => c.cam), 'every cut has a camera');

assert.equal(levelOf(0.9, 2, true), 1, 'a calm song stays out of the loud set');
assert.equal(levelOf(0.1, 8, false), 1, 'a dense line is never quiet');
assert.equal(keyOf('快使用雙截棍 哼哼哈兮', '雙截棍'), '雙截棍');
assert.equal(keyOf('快使用雙截棍 哼哼哈兮', '不在歌詞裡'), '快使用雙截棍', 'a phrase not sung is ignored');
const r = pickRecipe(cue(0, '長'.repeat(40)), 1, [], 1);
assert.ok((r.max ?? Infinity) >= 40 || r.template === 'stair', 'a long line never takes a layout too short for it');
assert.equal(shotsOf([cue(0, 'a', 1), cue(5, 'b', 1)], 27).filter((s) => !s.cue).length, 2, 'a long unsung stretch gets its own shot');
assert.equal(fallbackParts(cues, [], false).length, 1, 'no sections still gives one part');
assert.ok(RECIPES.every((x) => x.sides.length), 'every recipe has a side');
const used = new Map<string, number>();
const picks = Array.from({ length: 12 }, (_, k) => nextFx(['a', 'b'], ['c', 'd', 'e'], used, 3, k, ''));
assert.ok([...used.values()].every((n) => n <= 3), 'no move past its cap while the pool has room');
assert.ok(picks.includes('c'), 'past the cap the pool takes over');
for (const kind of TEXT_CAM_KINDS) {
  const [a, b] = [textCamAt({ kind, amount: 1.5 }, 0), textCamAt({ kind, amount: 1.5 }, 1)];
  assert.notDeepEqual(a, b, `${kind} moves`);
  assert.ok(Math.max(a.scale, b.scale) <= 1 && Math.abs(b.x) <= 40 && Math.abs(b.y) <= 30, `${kind} stays near the rest pose`);
}
assert.equal(textCamAt({ kind: 'push' }, 1).scale, 1, 'a push ends at the fitted size');
assert.equal(textCamAt({ kind: 'pull' }, 0).scale, 1, 'a pull starts at it');
assert.deepEqual(hitAt([{ at: 1, hit: 'zoom' }], 0.9), { zoom: 0, tile: 0 }, 'no hit before the line');
assert.equal(hitAt([{ at: 1, hit: 'zoom' }], 1).zoom, 1, 'a hit starts at full strength');
assert.ok(hitAt([{ at: 1, hit: 'zoom' }], 1.1).zoom < 1, 'the rush falls away');
assert.equal(hitAt([{ at: 1, hit: 'tile' }], 1.2).tile, 0, 'the tiled frame lasts two frames');
const loud = composePlan(song, { ...meaning, parts: [{ from: 'c0', tension: 0.9, fx: ['rays', 'split', 'crack'], what: 'a' }] }, false).plan;
assert.ok(loud.shots.flatMap((p) => p.lines as { hit?: string }[]).some((l) => l.hit), 'a loud part lands with a hit');
assert.ok(plan.shots.flatMap((p) => p.lines as { hit?: string }[]).every((l) => !l.hit), 'a middling part has none');
assert.ok(RECIPES.filter((r) => ['rip', 'snapin'].includes(r.enter)).every((r) => r.level > 0), 'the fast entrances stay out of quiet lines');
const calmPlan = composePlan(song, { ...meaning, parts: [{ from: 'c0', tension: 0.9, fx: ['boxes', 'split', 'flow'], what: 'a' }] }, true).plan;
assert.ok(calmPlan.shots.flatMap((p) => p.cuts).every((c) => BACKGROUNDS[0].includes(c.fx)), 'a calm song stays on the quiet backgrounds');
const sizes = fitRows([1200, 2600, 900], 1, 0.56);
assert.equal(Math.max(...sizes), sizes[1], 'the key phrase is the largest');
assert.ok(sizes.every((x, i) => (x / 200) * [1200, 2600, 900][i] <= 1920 * 0.84 + 1), 'every row fits the frame width');
assert.ok(sizes.reduce((a, x) => a + x * 1.16, 0) <= 1080 * 0.8 + 1, 'the block fits the frame height');
const [one, all] = [rowTargets([200, 100], 1), rowTargets([200, 100], 2)];
assert.equal(one[0], 0, 'one row sits centred');
assert.ok(all[0] > 0 && all[1] < 0, 'a new row pushes the block up and lands under it');
assert.equal(fourPieces(['一二', '三四', '五六', '七八', '九十'].map((text, i) => ({ text, from: i * 2 }))).length, 4, 'at most four rows');
assert.ok(composePlan(song, meaning, false).plan.shots.some((s) => s.lyric.template === 'build-cut'), 'lines are built in phrases');

// B01 reading window
assert.equal(lineWindow(0, 4, 2, 0.5, 0.5)?.readFrom, 0.5, 'reading starts when the entrance ends');
assert.equal(lineWindow(0, 3, 2.2, 0.5, 0.5), undefined, 'no window when the motion would eat the reading');
assert.deepEqual(gateMotion({ enter: 0.4, exit: 0.3, extra: 0.3 }, 3, 2), { enter: 0.4, exit: 0.3, extra: 0.3 }, 'room for all of it');
assert.equal(gateMotion({ enter: 0.4, exit: 0.3, extra: 0.3 }, 2.8, 2).extra, 0, 'decoration goes first');
assert.deepEqual(gateMotion({ enter: 0.4, exit: 0.3, extra: 0.3 }, 2.5, 2), { enter: 0.4, exit: 0, extra: 0 }, 'then the exit');
assert.deepEqual(gateMotion({ enter: 0.4, exit: 0.3, extra: 0.3 }, 2.2, 2), { enter: 0, exit: 0, extra: 0 }, 'then the entrance, reading never');
const quickRun = ['一二三', '四五六', '七八九', '十一二', '慢下來的這一句。'].map((t, i) => ({ id: `q${i}`, start: i * 2, end: i * 2 + 1.8, text: t }));
const paced = lineBeats([...quickRun, { id: 'z', start: 16, end: 18, text: '下一句' }], 30);
assert.ok(paced.slice(0, 4).every((b) => b.quick && !b.payoff), 'quick lines stay quick');
assert.ok(paced[4].payoff && (paced[4].linger ?? 0) > 1.2, 'the line a quick run lands on holds long');
assert.ok(lineBeats(cues, 40).every((b) => !b.payoff), 'no run, no payoff');
assert.equal(pickRecipe(cue(0, '算了我決定'), 1, [], 1, () => true, 0).enter === 'band-in', false, 'a device a line cannot afford stays out');

// B02 carrier
for (const seed of [0, 1, 2, 7, 13, 58]) {
  const tag = tagBox(900, 260, seed);
  const xs = tag.outline.map((p) => p[0]), ys = tag.outline.map((p) => p[1]);
  assert.ok(Math.max(...xs) <= 450 && Math.min(...xs) >= -450 && Math.max(...ys) <= 130 && Math.min(...ys) >= -130, 'the outline stays in its box');
  const area = tag.outline.reduce((a, p, i) => { const q = tag.outline[(i + 1) % tag.outline.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  assert.ok(area > 0.8 * 900 * 260, 'a corner is cut, not the middle');
  const pad = carrierPad(100, tag.side);
  assert.ok((tag.side > 0 ? pad.right : pad.left) > (tag.side > 0 ? pad.left : pad.right), 'the cut corner gets the wider margin, so type never touches it');
}
const paperTimes = { show: 1, landSec: 0.3, exitAt: 3, exitDur: 0.3, exit: 'rise' };
assert.deepEqual(paperPose(1.3, paperTimes, 1), { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 }, 'at rest the moment reading starts');
assert.deepEqual(paperPose(3, paperTimes, 1), paperPose(2, paperTimes, 1), 'nothing moves while it is read');
assert.equal(paperPose(0.9, paperTimes, 1).alpha, 0, 'nothing before it shows');
assert.deepEqual(paperPose(1.1, paperTimes, 1), paperPose(1.1, paperTimes, 1), 'a pure function of time');

// B03 bands
for (const w of [[3, 4, 2], [1], [9, 1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2]]) {
  const e = bandEdges(w);
  assert.equal(e[0], 0);
  assert.equal(e.at(-1), 1, 'the strips cover the line whole');
  assert.ok(e.length - 1 <= 5, 'only a few strips');
  assert.ok(e.slice(1).every((x, i) => x - e[i] >= 0.119), 'no thin slice');
}
assert.deepEqual(bandEdges([1, 1]), [0, 0.5, 1], 'widths follow the phrases');
assert.ok([0, 1, 2, 3].every((i) => bandOffset(i, 4, 1) === 0 && bandOffset(i, 4, 2) === 0), 'every strip is home at the end, so the glyph is whole');
assert.ok(bandOffset(0, 3, 0) > 0 && bandOffset(1, 3, 0) < 0, 'strips come from alternate sides');

// B04 camera
const rig = { kind: 'arc' as const, from: 10, to: 10.6, dir: 1, target: [120, 0] as [number, number] };
for (const kind of RIG_KINDS) {
  const r = { ...rig, kind };
  assert.deepEqual(rigAt(r, 10.6), { x: 0, y: 0, scale: 1, rot: 0, lay: 0 }, `${kind} is at rest when reading can start`);
  assert.deepEqual(rigAt(r, 30), rigAt(r, 10.6), `${kind} stays at rest`);
  assert.notDeepEqual(rigAt(r, 10), rigAt(r, 10.6), `${kind} moves`);
  assert.ok(rigAt(r, 10.2).scale <= 1, `${kind} never larger than the fitted size`);
  assert.ok(rigBack(r, 10.2).scale >= 1, `the backdrop stays over the frame's edge in ${kind}`);
  assert.ok(Math.abs(rigBack(r, 10.2).x) <= Math.abs(rigAt(r, 10.2).x), 'the backdrop is further away');
}
assert.equal(rigProgress(rig, 9), 0);
assert.equal(rigProgress(rig, 11), 1);
const turned = rigAt({ ...rig, dir: 1 }, 10.59);
assert.ok(Math.abs(turned.x) < 12 && Math.abs(turned.y) < 4, 'it arrives without a jump');
assert.ok(Math.abs(targetOf('一二三四五六七八', '七八')[0]) > 200 && targetOf('一二三四五六七八', '七八')[0] > 0, 'the camera turns about the key word, not the frame');
assert.equal(rigFor(cue(0, '走'), { spare: 0.1 } as never, '走', 'arc', 1), undefined, 'no camera on a line with no time for it');

// B05 / B08 handoffs
const [oldL, newL] = [{ start: 10, end: 12, text: '第一句' }, { start: 12.1, end: 14.5, text: '第二句' }];
for (const kind of HANDOFF_KINDS) {
  const w = handoffTimes(kind, oldL, 9.75, 0.3, newL, 15)!;
  assert.ok(w && w.to > w.from, `${kind} fits between two lines with room`);
  assert.ok(w.from >= 9.75 + 0.3 + readingSec(oldL.text, oldL.start, oldL.end) - 1e-6 && w.from >= oldL.end - 0.13, `${kind} waits for the line before`);
  assert.ok(15 - w.to >= readingSec(newL.text, newL.start, newL.end), `${kind} leaves the next line its reading`);
  const h = { kind, ...w, dir: 1 };
  assert.deepEqual(inPose(h, w.to), { x: 0, y: 0 }, 'the new line is home when reading starts');
  const still = outPose(h, w.from, 700, -1);
  assert.ok(Math.abs(still.x) + Math.abs(still.y) === 0, 'nothing moves yet');
  assert.equal(handoffProgress(h, w.from), 0);
  assert.equal(handoffProgress(h, w.to), 1);
}
assert.equal(handoffTimes('push', { start: 10, end: 13, text: '很長很長很長很長很長很長的一句歌詞' }, 9.8, 0.4, { start: 13, end: 14, text: '下一句也是很長很長很長的歌詞' }, 14), undefined, 'cancelled when time is short');
assert.equal(seamClear(800, 1200, 1920), 740, 'the seam sits in the line\'s margin, nearest the middle');
assert.equal(seamClear(100, 1800, 1920), undefined, 'a line that fills the frame leaves no seam');
const door = { kind: 'door' as const, from: 1, to: 1.3, dir: 1 };
assert.deepEqual(openingAt(door, 1, 600), [600, 600], 'closed before it starts');
assert.deepEqual(openingAt(door, 1.3, 600), [0, 1080], 'wide open when reading starts');
assert.equal(outPose({ kind: 'push', from: 0, to: 1, dir: 1 }, 1, 0, 0).x, -1920, 'a push takes the old line off the frame');
const path = relayBetween([0, 0], [1, 0], [500, -200], [1, 0]);
assert.deepEqual(relayPoint(path, 0), [0, 0]);
assert.ok(Math.hypot(relayPoint(path, 1)[0] - 500, relayPoint(path, 1)[1] + 200) < 1e-9, 'the relay ends on the anchor');
const speed = (u: number) => Math.hypot(relayPoint(path, u + 0.002)[0] - relayPoint(path, u)[0], relayPoint(path, u + 0.002)[1] - relayPoint(path, u)[1]);
assert.ok([...Array(19).keys()].every((i) => Math.abs(speed(0.05 * (i + 1)) - speed(0.05 * i)) < speed(0.5) * 0.25), 'no jump in speed along the way');
assert.ok(relayPoint(path, 0.02)[1] > -3 && Math.abs(relayPoint(path, 0.002)[1]) < 0.5, 'it leaves along the anchor\'s own direction');
assert.deepEqual(relaySpan(0), [0, 0]);
assert.deepEqual(relaySpan(1), [1, 1], 'nothing of it is left when reading starts');
assert.equal(relayStrip(path, 0, 0.5, 10, 8).length, 9 * 4, 'a ribbon, not a stroke');
assert.equal(handoffFor(cue(0, '看見'), cue(1, '所以我走'), false, false, 0), 'relay', 'a consequence is relayed');
assert.equal(handoffFor(cue(0, '你怎麼了？'), cue(1, '沒有'), false, true, 0), 'relay', 'a question is relayed, even in a calm song');
assert.equal(handoffFor(cue(0, '看見'), cue(1, '但我走'), false, true, 0), undefined, 'a calm song does not throw the frame about');
assert.ok(['split', 'door'].includes(handoffFor(cue(0, '看見'), cue(1, '但我走'), false, false, 1)!), 'a turn opens the frame');
assert.equal(handoffFor(cue(0, '看見'), cue(1, '風在吹'), false, false, 1), undefined, 'no reason, no handoff');
const everyFour = Array.from({ length: 24 }, (_, i) => ({ ...cue(i, '所以我走了'), start: i * 5, end: i * 5 + 4.4 }));
const hs = planHandoffs(everyFour, lineBeats(everyFour, 130), new Set(), false, 1);
assert.ok(hs.size >= 1 && hs.size <= Math.ceil(24 * 0.07) + 1, 'rare even where every line asks for one');

// B06 shared mask
const edge = seatBoundary({ x0: -600, x1: 600, y: 0 }, 2);
assert.ok(Math.abs(edge.x) > 40, 'off centre');
assert.ok(Math.abs(Math.cos(edge.angle)) > 0.1, 'off square');
const halfp = halfPlaneOf(edge);
assert.ok(Math.abs(sideOf(halfp, edge.x, edge.y)) < 1e-9, 'the boundary lies on its own plane');
assert.ok(sideOf(halfp, edge.x + 300, 0) * sideOf(halfp, edge.x - 300, 0) < 0, 'it divides the block');
const maskTimes = { show: 1, landSec: 0.4, exitAt: 3, exitDur: 0.3 };
assert.deepEqual(boundaryAt(edge, 1.4, maskTimes, 2000), edge, 'at rest when reading starts');
assert.deepEqual(boundaryAt(edge, 3, maskTimes, 2000), edge, 'still at the end of it');
assert.notDeepEqual(boundaryAt(edge, 1.1, maskTimes, 2000), edge, 'it swings in');
assert.notDeepEqual(boundaryAt(edge, 3.2, maskTimes, 2000), edge, 'and away');

// B07 surface
assert.ok(dotPitch(200, 0.6) < dotPitch(200, 0.2), 'finer dots on a dense character');
assert.equal(stateFor('outline', 200, 0.6), 'solid', 'a heavy outline on 愛 at black weight would close it: solid instead');
assert.equal(stateFor('outline', 200, 0.3), 'outline');
assert.equal(stateFor('dots', 90, 0.3), 'solid', 'too small for a dot screen');
assert.equal(stateFor('dots', 200, 0.6), 'dots');
assert.equal(litShare(0, 8), 0);
assert.equal(litShare(0.5, 8), 0.5);
assert.equal(litShare(0.51, 8), 0.5, 'whole rows at a time');
assert.equal(litShare(1, 8), 1, 'every row lit when reading starts');

// B09 hanging card
const hung = { show: 1, landSec: 0.6, exitAt: 3, exitDur: 0.3, exit: 'fade' };
assert.deepEqual(hangPose(1.6, hung, 1), { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 }, 'still the moment reading starts');
assert.deepEqual(hangPose(3, hung, 1), hangPose(1.6, hung, 1), 'and all the way through it');
assert.ok(hangPose(1.05, hung, 1).y > 300, 'it falls in from above');
assert.ok([1.3, 1.4, 1.5].some((t) => hangPose(t, hung, 1).rot < 0) && [1.3, 1.4, 1.5].some((t) => hangPose(t, hung, 1).rot > 0), 'it swings both ways');
assert.ok(Math.abs(hangPose(1.59, hung, 1).rot) < 0.01, 'damped to nothing, no jerk into the rest');
assert.ok(Array.from({ length: 58 }, (_, i) => Math.abs(hangPose(1 + i / 100 + 0.26, hung, -1).rot)).every((r) => r <= 0.13), 'a small swing');
assert.equal(tailSwing(5, 1.6, 1), 0, 'the loose end comes to rest too');
for (const seed of [0, 1, 5, 8, 13]) {
  const b = hangBox(800, 300, seed, 120);
  assert.equal(b.holes?.length, 2, 'two holes');
  assert.notEqual(b.holes![0][0] + b.holes![1][0], 0, 'off centre');
  const pad = hangPad(120, b.side);
  assert.ok(b.holes!.every(([, y]) => y - (b.holeR ?? 0) > 150 - pad.top), 'the holes stay in the margin above the words');
  assert.ok(b.pivot[1] > 150, 'the hanging point is above the paper');
}

// B10 paper feed
assert.equal(feedShare(0, [0.4, 1]), 0);
assert.equal(feedShare(1, [0.4, 1]), 1, 'out whole when reading starts');
assert.ok(Math.abs(feedShare(0.45, [0.4, 1]) - 0.4) < 1e-9, 'it stops at a phrase');
assert.ok([...Array(100).keys()].every((i) => feedShare((i + 1) / 100, [0.3, 0.6, 1]) >= feedShare(i / 100, [0.3, 0.6, 1])), 'paper only comes out, never back');
assert.deepEqual(feedStops([0.3, 0.6]), [0.3, 0.6, 1]);
assert.equal(feedStops([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]).length, 4, 'a few stops, however many words');
assert.deepEqual(feedStops([]), [1], 'one phrase unrolls in one go');

// B11 fold
const cuts = foldCuts([-300, -100, 50, 240, 400], -500, 500, 3);
assert.ok(cuts.length >= 3 && cuts.length <= 5, 'a few panels');
assert.ok(cuts.slice(1, -1).every((c) => [-300, -100, 50, 240, 400].includes(c)), 'a fold only ever falls between characters');
const sizes2 = cuts.slice(1).map((c, i) => c - cuts[i]);
assert.ok(new Set(sizes2).size > 1, 'the panels are not all alike');
assert.deepEqual(foldCuts([], -100, 100, 1), [-100, 100], 'nowhere to fold, no fold');
const flat = foldPanels(cuts, 1);
assert.ok(flat.every((p) => p.shade === 0 && Math.abs(p.to - p.from - (p.flat[1] - p.flat[0])) < 1e-9), 'flat at the end');
assert.deepEqual(foldPlace(123, flat), { at: 123, scale: 1 }, 'every character where it will be read');
const shut = foldPanels(cuts, 0);
assert.ok(shut.at(-1)!.to - shut[0].from < 200, 'folded up small');
assert.ok(shut[0].from === cuts[0] && shut.every((p, i) => !i || Math.abs(p.from - shut[i - 1].to) < 1e-9), 'the panels stay hinged');
assert.ok(foldPlace(-400, shut).scale < 0.2 && foldPlace(-400, shut).scale > 0, 'characters narrow with their panel');

// B12 print
const set = { show: 1, landSec: 0.5, exitAt: 3, exitDur: 0.3, exit: 'fade' };
assert.equal(cardPose(1.5, set, 1, 0.02).rot, 0.02, 'lands on its resting tilt');
assert.deepEqual([cardPose(1.5, set, 1, 0.02).x, cardPose(1.5, set, 1, 0.02).y], [0, 0]);
assert.deepEqual(cardPose(3, set, 1, 0.02), cardPose(1.5, set, 1, 0.02), 'nothing moves while it is read');
assert.equal(cardPose(1.25, set, 1, 0.02, 0.5).y, 0, 'a print that develops lands first');
assert.ok([0, 1, 2, 3, 7, 9].every((s) => Math.abs(cardTilt(s)) <= 0.03), 'a tilt strokes stay sharp at');
assert.equal(developShare(1, 1), 1, 'all of it is clear when reading starts');
assert.equal(developShare(0.9, 0), 0, 'nothing shows at first');
assert.ok(developShare(0.1, 0.5) > developShare(0.9, 0.5), 'it clears from one corner');
for (const seed of [1, 2, 9]) assert.ok(cardBox(700, 300, seed).outline.every(([x, y]) => Math.abs(x) <= 350 && Math.abs(y) <= 150), 'the trim only ever cuts in, so the type margin holds');

// B13 index
for (const seed of [0, 1, 7, 12]) {
  const sl = slipWidths(2000, seed);
  assert.ok(Math.abs(sl.reduce((a, x) => a + x, 0) - 2000) < 1e-6, 'the row spans its width');
  assert.ok(sl.slice(1).some((x, i) => Math.abs(x - sl[i]) > 8), 'uneven slips');
}
assert.deepEqual(liftPhase(1), { rise: 1, open: 1 }, 'whole card, at its place, when reading starts');
assert.ok(liftPhase(0.5).rise === 1 && liftPhase(0.3).open === 0, 'it rises, then it opens');

// B14 band
for (const seed of [0, 1, 2, 3, 5, 8]) {
  const b = bandBox(900, 200, seed);
  assert.ok(Math.abs(bandTilt(seed)) >= 0.04 && Math.abs(bandTilt(seed)) <= 0.08, 'a slant, not a lean: the line stays level enough to read');
  const far = b.side > 0 ? Math.max(...b.outline.map((p) => p[0])) : Math.min(...b.outline.map((p) => p[0]));
  assert.ok(Math.abs(far) > 2000, 'one end runs off the frame');
}
assert.deepEqual(crossWindow(1), [0, 0], 'the crossing band is gone when reading starts');
assert.deepEqual(crossWindow(0), [0, 0]);
assert.ok(crossWindow(0.5)[1] > crossWindow(0.5)[0], 'it is there on the way');

// B15 tiles
const placed = tileRows([500, 700, 600, 300], 20, 1300);
assert.deepEqual(placed.map((p) => p.row), [0, 0, 1, 1], 'tiles wrap in order');
assert.equal(placed[1].x, 520);
assert.ok(placed.every((p, i) => p.x + [500, 700, 600, 300][i] <= 1300), 'inside the width');
assert.deepEqual(tileFace(1), { sx: 1, face: true }, 'face on and flat when reading starts');
assert.equal(tileFace(0).face, false);
assert.ok(tileFace(0.5).sx < 0.1, 'edge-on half way');
assert.ok(tileTurn(0, 4, 0.3) > tileTurn(3, 4, 0.3), 'each after the one before');
assert.equal(tileTurn(3, 4, 1), 1, 'all home at the end');
assert.equal(roundedBox(300, 120, 20).length, 24, 'a soft corner each');

// B16 soft
assert.ok(softDepth(200, 0.6) < softDepth(200, 0.3), 'a dense character gets a shallower side');
assert.ok(softDepth(200, 0.6) / 200 <= 0.02, 'shallow enough to leave 愛 its counters');
assert.equal(stateFor('soft', 60, 0.3), 'solid', 'too small to have a body');
assert.equal(stateFor('soft', 180, 0.6), 'soft');

// spread-page, band-pass, panel-chain
assert.ok(['page', 'band', 'chain'].every((k) => HANDOFF_TRANSITION[k as 'page'] && HANDOFF_TRANSITION[k as 'page']! in LINE_MOTION), 'each draws on the backdrop');
assert.equal(pageEdge(1, 0, 800), 1120, 'the page starts at the frame edge');
assert.ok(Math.abs(pageEdge(1, 0.5, 800)) < 1e-9, 'edge-on over the seam');
assert.ok(Math.abs(pageEdge(1, 1, 800) + 800) < 1e-9, 'and lands on the other side');
assert.ok(pageSquash(0.5) <= 0.001 && pageSquash(0) === 1, 'the line narrows away with its page');
const hb = { kind: 'band' as const, from: 1, to: 1.4, dir: 1 };
for (const dir of [1, -1]) {
  const b0 = bandSpan(dir, 0);
  const corners = [[-960, -540], [960, -540], [-960, 540], [960, 540]].map(([x, y]) => x * b0.ux + y * b0.uy);
  assert.ok(corners.every((v) => v > b0.lead), 'the band starts off the frame');
  const b1 = bandSpan(dir, 1);
  assert.ok(corners.every((v) => v < b1.trail), 'and ends off the other side');
}
for (const h of [hb, { ...hb, kind: 'chain' as const }, { ...hb, kind: 'page' as const }]) {
  assert.ok(passKeeps(h, 0.9, 800).going.d > 1000, `${h.kind}: the old line is whole until it starts`);
  assert.ok(passKeeps(h, 0.9, 800).coming.d < -1000, 'and nothing of the new one shows');
  assert.ok(passKeeps(h, 1.4, 800).coming.d > 1000, 'the new line is whole when reading starts');
  assert.deepEqual(passKeeps(h, 1.2, 800), passKeeps(h, 1.2, 800), 'a pure function of time');
}
assert.equal(CHAIN_EDGES.length, 6, 'a few panels');
assert.ok(new Set(CHAIN_EDGES.slice(1).map((e, i) => +(e - CHAIN_EDGES[i]).toFixed(2))).size > 1, 'uneven');
assert.equal(chainTurn(4, 1), 1, 'the last panel lands at the end');
assert.equal(chainTurn(4, 0.3), 0, 'it waits for the ones before');
assert.equal(handoffFor(cue(0, '走吧'), cue(1, '翻開那一頁'), false, true, 0), 'page', 'a page turns even in a calm song');
assert.equal(handoffFor(cue(0, '走吧'), cue(1, '大家一起唱'), false, false, 0), 'band', 'a call goes across on a band');
assert.equal(handoffFor(cue(0, '一張 兩張 三張'), cue(1, '四張 五張 六張'), false, false, 0), 'chain', 'a list runs on as a chain');

// every device is reachable from the composer when its words and time are there
const asked: Record<string, string> = { 'lights-soft': '歡迎來到舞台', 'steps-plain': '我要走下去', 'steps-hit': '我要走下去', 'lights-plain': '歡迎來到舞台', 'lights-hit': '歡迎來到舞台', 'balance-soft': '你比我 重要一點', 'balance-plain': '你比我 重要一點', 'dot-soft': '夜晚的街', 'dot-plain': '夜晚的街', 'block-plain': '為人耿直不屈', 'block-hit': '為人耿直不屈', 'edge-soft': '黑夜裡的燈', 'edge-plain': '黑夜裡的燈', 'mirror-soft': '橋下的身影', 'mirror-plain': '橋下的身影', 'box-soft': '你的另一面', 'box-plain': '你的另一面', 'strip-soft': '那年的畫面', 'strip-plain': '那年的畫面', 'dive-soft': '收到你的訊息', 'dive-plain': '收到你的訊息', 'tag-soft': '我是你的名字', 'tag-plain': '我是你的名字', 'tag-hit': '我是你的名字', 'band-short': '算了我決定', 'band-hit': '算了我決定', 'matrix-rows': '霓虹燈下的夜', 'matrix-hit': '霓虹燈下的夜', 'outline-hold': '霓虹燈下', 'split-pair': '你和我的距離', 'split-hit': '你和我的距離' , 'hang-soft': '我還在等你回來', 'hang-plain': '我還在等你回來', 'feed-soft': '我寫下這封信給你', 'feed-plain': '我寫下這封信給你', 'fold-soft': '翻開那些往事', 'fold-plain': '翻開那些往事', 'card-soft': '那些回憶還在', 'card-plain': '那些回憶還在', 'index-soft': '十七歲那一天', 'index-plain': '十七歲那一天', 'band-stick': '大家一起來吧', 'band-cross': '大家一起來吧', 'panels-plain': '一張 兩張 三張牌', 'panels-hit': '一張 兩張 三張牌', 'soft-quiet': '輕輕的甜', 'soft-mid': '輕輕的甜', 'page-soft': '我唱給你聽 在每一個沒有星星的晚上', 'page-plain': '我唱給你聽 在每一個沒有星星的晚上', 'page-hit': '我唱給你聽 在每一個沒有星星的晚上', 'corner-soft': '我在路口 遇見你了', 'corner-plain': '我在路口 遇見你了', 'corner-hit': '我在路口 遇見你了', 'cross-soft': '我想念你 你想念我', 'cross-plain': '我想念你 你想念我', 'cross-hit': '我想念你 你想念我', 'note-soft': '有些話說不出口', 'note-plain': '有些話說不出口', 'grid-soft': '從頭學寫字', 'grid-plain': '從頭學寫字', 'route-plain': '一路追 一路跑 不停下來', 'route-hit': '一路追 一路跑 不停下來', 'curve-soft': '風吹過來', 'curve-plain': '風吹過來', 'open-plain': '故事開始了', 'open-hit': '故事開始了', 'mark-plain': '一杯咖啡 一支香菸', 'mark-hit': '一杯咖啡 一支香菸', 'wave-soft': '眼淚慢慢湧上來', 'wave-plain': '眼淚慢慢湧上來', 'throw-plain': '你突然闖進來', 'throw-card': '你突然闖進來', 'throw-hit': '你突然闖進來', 'seat-plain': '這就是答案', 'seat-hit': '這就是答案', 'slat-plain': '我終於看清了你', 'slat-hit': '我終於看清了你', 'grain-plain': '收到你的訊息', 'grain-hit': '收到你的訊息' };
for (const r of RECIPES.filter((x) => x.fit)) {
  const got = pickRecipe(cue(0, asked[r.id]), r.level, [], 1, (x) => x.fit === r.fit && x.level === r.level);
  assert.equal(got.fit, r.fit, `${r.id} is picked when its words are there`);
  assert.notEqual(pickRecipe(cue(0, '山頭上的那片雲朵'), r.level, [], 1).fit, r.fit, `${r.id} stays out when they are not`);
}
assert.ok(!RECIPES.filter((x) => x.fit && x.level === 1).some((x) => pickRecipe(cue(0, asked[x.id]), 1, [], 1, () => true, 0.1).id === x.id), 'nor when the line has no time for it');

// paid paths stay as they are
for (const k of ['band-in', 'matrix-light', ...Object.keys(CARRIER_SEC), ...ARRIVALS, 'soft-float', 'cell-land', 'reply-land']) assert.ok(!(ENTER_KINDS as string[]).includes(k) && (LINE_ENTERS as string[]).includes(k), `${k} is the composer's only`);
for (const k of ['ink-state', 'tether-settle']) assert.ok(!(IDLE_KINDS as string[]).includes(k) && (LINE_IDLES as string[]).includes(k), `${k} is the composer's only`);
assert.ok(!(EXIT_KINDS as string[]).includes('fold-close') && (LINE_EXITS as string[]).includes('fold-close'), 'fold-close is the composer\'s only');
assert.ok(EXIT_KINDS.every((k) => !(LINE_EXITS as string[]).includes(k)));
for (const k of ['lyric-carrier', 'contrast-split', 'paper-feed', 'memory-card', 'index-pull', 'lyric-band', 'phrase-panels', 'editorial', 'corner-anchor', 'cross-anchor', 'note-panel', 'phrase-grid', 'counterweight', 'panel-route', 'reply-thread']) {
  assert.ok(!(k in HELP_TEMPLATES), `${k} is not offered to the director`);
  assert.ok(k in ALL_TEMPLATES, `${k} is registered`);
}
assert.ok(!(TRANSITION_KINDS as string[]).some((k) => k.startsWith('lyric-')), 'handoffs are not offered to the director');
assert.ok(RECIPES.filter((r) => r.fit).every((r) => r.spare && (r.min !== undefined || r.max !== undefined)), 'every device states its time and length limits');
assert.ok(['band-short', 'matrix-rows', 'outline-hold'].every((id) => !fitsCalm(RECIPES.find((r) => r.id === id)!)), 'the mechanical devices stay out of calm songs');
assert.ok(RECIPES.filter((r) => r.fit && r.level === 0).every((r) => r.state === 'soft' || r.state === 'edge' || r.idle === 'reflection-rest' || ['curve-arrive', 'wave-reveal'].includes(r.enter) || ['balance-line', 'dot-display', 'turn-box', 'frame-feed', 'lightbox-entry', 'lyric-carrier', 'paper-feed', 'memory-card', 'index-pull', 'note-panel', 'editorial', 'corner-anchor', 'cross-anchor', 'phrase-grid', 'counterweight'].includes(r.template)), 'only paper, soft type and still pages go on a quiet line');

// a device only where the words ask for it
const fitted = composePlan(song, meaning, false).plan.shots.flatMap((s) => s.lines as { idle: string; inkState?: string; handoff?: unknown }[]);
assert.ok(fitted.every((l) => !l.inkState && !l.handoff), 'plain lines carry no device');
assert.ok(plan.shots.every((s) => !['lyric-carrier', 'contrast-split'].includes(s.lyric.template)), 'no reason, no carrier or split');
const decide = Array.from({ length: 24 }, (_, i) => ({ ...cue(i, `${i % 2 ? '算了我決定放手' : '你和我的距離很遠'}${'甲乙丙丁戊己庚辛壬癸'[i % 10]}${i}`), start: i * 5, end: i * 5 + 4.6 }));
const device = composePlan({ ...song, cues: decide, duration: 130 }, meaning, false).plan.shots.flatMap((s) => s.lines.length ? [s.lyric.template] : []);
assert.ok(device.includes('contrast-split'), 'a line of two sides can take the split');
assert.ok(device.filter((t) => t === 'contrast-split').length <= 3, 'and it stays rare');
// the gallery
const f = forceOf(['tag-plain', 'hand:push', 'cam:arc'], decide, 0, 100);
assert.equal(f.assigned.length, 3, 'each name lands on a line');
assert.equal(f.hands.size, 1);
const forced = composePlan({ ...song, cues: decide, duration: 130 }, meaning, false, f).plan;
assert.ok(forced.shots.some((s) => s.lyric.template === 'lyric-carrier'), 'a forced recipe is used whatever the words');
assert.ok(forced.shots.flatMap((s) => s.lines as { handoff?: { kind: string } }[]).some((l) => l.handoff?.kind === 'push'), 'a forced handoff is placed when both lines can afford it');
assert.ok(forced.shots.flatMap((s) => s.cuts as { transition: string }[]).some((c) => c.transition === 'lyric-push'), 'its backdrop moves with it');
const shifted = composePlan({ ...song, cues: decide, duration: 130 }, meaning, false, f);
const hand = shifted.plan.shots.flatMap((s) => s.lines as { cue: string; handoff?: { from: number } }[]).find((l) => l.handoff)!;
assert.equal(shifted.shots.find((s) => s.cue === hand.cue)!.start, hand.handoff!.from, 'the picture changes when the handoff starts');
// carriers stay rare, however well the words suit them
const letters = Array.from({ length: 40 }, (_, i) => ({ ...cue(i, `我寫下這封信給你第${'甲乙丙丁戊己庚辛壬癸'[i % 10]}${i}回`), start: i * 5, end: i * 5 + 4.4 }));
const carried = composePlan({ ...song, cues: letters, duration: 210 }, meaning, false).plan.shots.flatMap((s) => (s.lines.length ? [s.lyric.template] : []));
const onPaper = carried.map((t) => ['lyric-carrier', 'paper-feed', 'memory-card', 'index-pull', 'lyric-band', 'phrase-panels'].includes(t));
assert.ok(onPaper.some(Boolean), 'a line about a letter can go on paper');
assert.ok(onPaper.filter(Boolean).length <= Math.ceil(40 * 0.12), 'and only some of them');
assert.ok(onPaper.every((x, i) => !x || !onPaper.slice(Math.max(0, i - 2), i).some(Boolean)), 'never two close together');
const inWorld = { ...cue(0, '他走在路上看天空'), start: 5, end: 9.4 };
const memoryPart = pickRecipe(inWorld, 1, [], 1, (x) => x.fit !== undefined, Infinity, '回憶帶著褪色的溫柔');
assert.equal(memoryPart.template, 'memory-card', 'a part about remembering lets a plain line take the print');

// a built line's opening
const opening = (text: string, pieces: { text: string; from: number }[]) => openOnTwo(pieces, text)[0].text;
assert.equal(opening('就 算了吧', [{ text: '就', from: 0 }, { text: '算了吧', from: 2 }]), '就 算了吧', 'a line never opens on one character alone');
assert.equal(opening('就算了 吧走吧', [{ text: '就', from: 0 }, { text: '算了', from: 1 }, { text: '吧走吧', from: 4 }]), '就算了', 'it takes in the next phrase and stops there');
assert.equal(opening('愛', [{ text: '愛', from: 0 }]), '愛', 'unless that is the whole line');
assert.equal(opening('我們 走吧', [{ text: '我們', from: 0 }, { text: '走吧', from: 3 }]), '我們', 'a phrase of two stays as it is');
assert.equal(opening('「愛 了吧', [{ text: '「愛', from: 0 }, { text: '了吧', from: 3 }]), '「愛 了吧', 'a bracket is not a second character');
assert.ok(loneScale(120, 240) >= 2.8, 'a short row alone is set large');
assert.ok(120 * loneScale(120, 240) <= 340 && 240 * loneScale(120, 240) <= 1920 * 0.84, 'and stays inside the frame');
assert.equal(loneScale(340, 1600), 1, 'a row already at full size is left alone');

// where a line divides
assert.deepEqual(twoParts('一個馬步向前 一記左鉤拳')?.head, '一個馬步向前', 'the singer\'s own space first');
assert.equal(twoParts('我'), undefined, 'one character has no sides');
assert.equal(spoken('(幹什麼? 幹什麼?) 呼吸吐納心自在'), '呼吸吐納心自在', 'a bracketed call is not the line');
assert.ok(phraseSpans('一二三 四五六 七八九 十一二').length <= 3, 'a capped number of phrases');
assert.deepEqual(phraseSpans('甲乙丙 丁戊己'), [[0, 3], [4, 7]]);
const longFirst = phraseSpans('甲 乙丙丁戊');
assert.ok(longFirst.every(([a, b]) => b - a >= 2), 'no lone character in a phrase');
const page = pageColumns(1000, 300, 500, 140, true, -1);
assert.ok(page.first.y > page.second.y, 'the page keeps the sung order, top to bottom');
assert.notEqual(page.first.x, page.second.x, 'main and aside do not share an edge');
assert.ok(page.second.x + 500 <= 1920 * 0.42 + 1, 'the aside stays in the margins');
const mirrored = pageColumns(1000, 300, 500, 140, true, 1);
assert.ok(Math.abs(mirrored.first.x + 1000 + page.first.x) < 1, 'the other side is the same page mirrored');

// corners and crossings
const crossed = crossingOf('我想念你 你想念我')!;
assert.equal([...crossed.head][crossed.i], [...crossed.tail][crossed.j], 'they cross on a character both hold');
assert.equal(crossingOf('一個馬步 一記左鉤拳'), undefined, 'a shared grammar word is no meeting');
assert.equal(crossingOf('I love you 甲 love 乙'), undefined, 'nor is Latin set this way');
assert.equal(crossingOf('甲乙丙丁 戊己庚辛'), undefined, 'two phrases with nothing in common do not cross');
assert.equal(cornerOf('我在路口 遇見你了')?.across, 'head');
assert.ok(cornerOf('我在路 轉過一個小小的彎')?.across === 'tail', 'the longer phrase goes across');
assert.equal(cornerOf('就在這裡 ーー！'), undefined, 'a column takes only what can stand upright');
assert.ok(upright('愛情') && !upright('A愛') && !upright('あーあ'));

// a solid weighed against a block
for (const side of [-1, 1]) for (const [w, h] of [[900, 300], [600, 500], [1000, 620], [300, 200]]) {
  const { blockX, shape } = counterweight(w, h, side);
  assert.ok(Math.abs(blockX) + w / 2 <= 1920 / 2 - 90, 'the block stays in its margin');
  assert.ok(Math.abs(shape.x) + shape.a <= 1920 / 2 - 90, 'the solid stays in its margin');
  const gap = side < 0 ? shape.x - shape.a - (blockX + w / 2) : blockX - w / 2 - (shape.x + shape.a);
  assert.ok(gap >= 119 || shape.a <= 1920 * 0.07, `the solid clears the words (${gap})`);
  assert.ok(shape.a > shape.b, 'flat, not a sun');
  assert.ok(Math.sign(shape.x) === -side, 'on the other side of the frame');
}
assert.deepEqual(ellipsePoints({ x: 0, y: 0, a: 300, b: 180 }), ellipsePoints({ x: 0, y: 0, a: 300, b: 180 }), 'the same every time');

// manuscript cells
assert.equal(cellRow([3, 2], 100).length, 5);
const cells = cellRow([2, 2], 100);
assert.ok(cells[2] - cells[1] > cells[1] - cells[0], 'the gutter between phrases is wider than a cell step');
assert.ok(Math.abs(cells[0] + cells[3]) < 1e-6, 'the row is centred');
const bars = cellBars(0, 0, 100, 3);
assert.ok(bars.every(([x0, y0, x1, y1]) => !(Math.abs(x0) >= 50 && Math.abs(y0) >= 50) && !(Math.abs(x1) >= 50 && Math.abs(y1) >= 50)), 'no bar reaches a corner: the square never closes');

// the note
const note = noteBox(800, 300, 3, 100);
assert.ok(note.outline.length === 5, 'one folded corner');
assert.ok(Math.abs(noteBox(800, 300, 2, 100).pivot[0] + note.pivot[0]) < 1e-6, 'on either side');

// the tracking cameras
const track = (kind: 'phrase-track' | 'panel-track') => ({ kind, from: 10, to: 11, dir: 1, target: [0, 0] as [number, number], points: [[-300, 0], [300, 0]] as [number, number][], box: [-700, -120, 700, 120] as [number, number, number, number] });
for (const kind of TRACK_KINDS) {
  const r = track(kind);
  assert.ok(isTrack(kind));
  assert.deepEqual(rigAt(r, 11), { x: 0, y: 0, scale: 1, rot: 0, lay: 0 }, `${kind} is at rest when reading can start`);
  assert.deepEqual(rigAt(r, 40), rigAt(r, 11));
  assert.deepEqual(rigAt(r, 10.3), rigAt(r, 10.3), 'a pure function of time');
  assert.notDeepEqual(rigAt(r, 10.05), rigAt(r, 10.45), `${kind} calls at both stops`);
  assert.deepEqual(rigAt({ ...r, points: undefined }, 10.2), { x: 0, y: 0, scale: 1, rot: 0, lay: 0 }, 'no stops, no move');
  assert.ok(rigBack(r, 10.2).scale >= 1, 'the backdrop stays over the frame\'s edge');
}
for (let t = 10; t <= 11; t += 0.02) {
  const p = rigAt(track('phrase-track'), t);
  assert.ok(p.scale <= 1, 'a phrase track is never larger than the fitted line');
  assert.ok(p.x + p.scale * -700 >= -912.01 && p.x + p.scale * 700 <= 912.01, 'the whole line keeps its margins all the way');
}
assert.ok(stopPose('panel-track', [0, 200]).y < 0 && stopPose('panel-track', [0, 200]).scale > 1, 'a route goes in close on its panel');
assert.equal(stopPose('phrase-track', [900, 0], [-1200, -100, 1200, 100]).x, 0, 'a line with no room to spare is not pushed off its margin');
const phraseRig = rigFor(cue(0, '慢慢靠近 一步一步'), { spare: 2 } as never, '靠近', 'phrase-track', 1)!;
assert.ok(phraseRig.to > cue(0, '').start && phraseRig.to - phraseRig.from < 1.2, 'it moves first and leaves the rest of the line to reading');
assert.equal(rigFor(cue(0, '慢慢靠近 一步一步'), { spare: 0.8 } as never, '靠近', 'phrase-track', 1), undefined, 'no time, no track');
assert.equal(rigFor(cue(0, '靠近'), { spare: 5 } as never, '靠近', 'phrase-track', 1), undefined, 'one phrase has nowhere to go');

// lines that share a shot
assert.equal(pairFor(cue(0, '你現在過得還好嗎'), cue(1, '我過得一天比一天好'), false), 'reply', 'a question and its answer');
assert.equal(pairFor(cue(0, '你還好嗎'), cue(1, '我還好'), false), 'chat', 'a word or two each way is an exchange');
assert.equal(pairFor(cue(0, '你看到我的訊息了嗎'), cue(1, '我不想回覆'), false), 'chat', 'messages go in a thread');
assert.equal(pairFor(cue(0, '你看到我的訊息了嗎'), cue(1, '我不想回覆'), true), 'reply', 'a calm song keeps away from the thread');
assert.equal(pairFor({ ...cue(0, '風吹過來的那個夜晚'), singer: 'a' }, { ...cue(1, '雨落下去的這個清晨'), singer: 'b' }, false), 'reply', 'two singers answer one another');
assert.ok(parallel('一個馬步向前', '一記左鉤拳') && !parallel('快使用雙截棍', '快使用雙截棍'), 'a list is not one line sung twice');
assert.equal(pairFor(cue(0, '風吹過來'), cue(1, '雨落下去'), false), undefined, 'no relation, no shared shot');
const askSong = Array.from({ length: 30 }, (_, i) => ({ ...cue(i, i % 2 ? `我聽見第${i}個世界的風聲` : `你現在還好嗎第${i}次呢嗎`), start: i * 5, end: i * 5 + 4.4 }));
const none = new Map();
const beatsAsk = new Map(askSong.map((c) => [c.id, { spare: 2 } as never]));
const askPairs = planPairs(askSong, beatsAsk, none, false);
assert.ok(askPairs.size >= 1 && askPairs.size <= Math.ceil(30 * 0.06), 'pairs stay rare');
const quickFirst = [{ ...cue(0, '一句很快很快就要唱完的話'), start: 10, end: 11.5 }, { ...cue(1, '一再重演 一根我不抽'), start: 11.6, end: 13.1 }, { ...cue(2, '一放好多年 它一直在'), start: 13.2, end: 17 }];
assert.ok(!planPairs(quickFirst.slice(1).length ? [{ ...quickFirst[0], text: '風吹過很快就要唱完的話' }, ...quickFirst.slice(1)] : [], new Map(quickFirst.map((c) => [c.id, { spare: 2 } as never])), none, false).has('c1'), 'a line set together with the one before it leads no pair');
const firsts = [...askPairs.keys()].map((id) => askSong.findIndex((c) => c.id === id));
assert.ok(firsts.every((x, i) => !i || x - firsts[i - 1] >= 5), 'and apart');
const handNext = new Map([[askSong[1].id, {} as never]]);
assert.ok(!planPairs(askSong, beatsAsk, handNext, false).has(askSong[0].id), 'never across a handoff');
const askPlan = composePlan({ ...song, cues: askSong, duration: 160 }, meaning, false);
const shared = askPlan.plan.shots.find((s) => s.lines.length > 1)!;
assert.equal(shared.lyric.template, 'couplet', 'the question and answer share one couplet shot');
assert.equal((shared.lines[1] as { enter: string }).enter, 'reply-land', 'the answer lands as the answer');
assert.equal(askPlan.plan.shots.flatMap((s) => s.lines).length, askSong.length, 'every sung line is still planned');
assert.equal(new Set(askPlan.plan.shots.flatMap((s) => (s.lines as { cue: string }[]).map((l) => l.cue))).size, askSong.length, 'each once');
assert.equal(askPlan.shots.filter((x) => x.cue).length, askPlan.plan.shots.filter((x) => x.lines.length).length, 'a pair is one shot');

// whole-song caps hold through repeated choruses
const chorus = ['我在路口 不知道', '我在路口 遇見你了', '我想念你 你想念我', '有些話說不出口', '從頭學寫字', '我唱給你聽 在每一個沒有星星的晚上'];
const repeated = Array.from({ length: 60 }, (_, i) => ({ ...cue(i, chorus[i % 6]), start: i * 5, end: i * 5 + 4.4 }));
const repeatedPlan = composePlan({ ...song, cues: repeated, duration: 310 }, meaning, false).plan;
const tally = repeatedPlan.shots.flatMap((s) => s.lines.length ? [s.lyric.template] : []);
const space = tally.filter((t) => ['editorial', 'corner-anchor', 'cross-anchor', 'phrase-grid', 'counterweight', 'panel-route'].includes(t)).length;
assert.ok(space >= 2 && space <= 6, `repeated choruses do not push the layouts past their share (${space})`);
const fitLines = tally.filter((t) => !['stair', 'quote', 'vertical', 'ribbon', 'orbit', 'punch', 'build-cut', 'couplet', 'stack', 'scatter', 'beat-cut', 'handwrite'].includes(t)).length;
assert.ok(fitLines <= Math.ceil(60 * 0.26), `nor the song past its whole cap (${fitLines})`);
// a layout with a shape of its own takes a quiet background
for (const l of [0, 1, 2] as const) assert.ok(QUIET_BACKGROUNDS[l].every((f) => BACKGROUNDS[l].includes(f)), 'the quiet moves are that level\'s own');
assert.ok(![...QUIET_BACKGROUNDS[0], ...QUIET_BACKGROUNDS[1], ...QUIET_BACKGROUNDS[2]].some((f) => ['spiral', 'boxes', 'rays', 'glitch', 'beatbg', 'invert'].includes(f)), 'and none of the busy ones');
const busyParts = { ...meaning, parts: [{ from: 'c0', tension: 0.5, fx: ['synth', 'dots', 'synth'], what: 'x' }] };
const ownShape = Array.from({ length: 30 }, (_, i) => ({ ...cue(i, `${'甲乙丙丁戊己庚辛壬癸'[i % 10]}山頭上的雲第${i}回`), start: i * 5, end: i * 5 + 4.4 }));
const force = { recipes: new Map([[ownShape[3].id, 'cross-plain'], [ownShape[9].id, 'page-plain'], [ownShape[15].id, 'note-plain'], [ownShape[21].id, 'corner-hit']]) };
const ownPlan = composePlan({ ...song, cues: ownShape, duration: 160 }, busyParts, false, force).plan;
const backOf = (id: string) => ownPlan.shots.find((s) => (s.lines as { cue: string }[])[0]?.cue === id)!.cuts as { fx: string }[];
for (const id of force.recipes.keys()) assert.equal(backOf(id).length, 1, 'one move for the whole line');
for (const id of force.recipes.keys()) assert.ok(backOf(id).every((c) => !['synth', 'dots'].includes(c.fx)), `${id}: the part's busy moves stay off a layout of its own`);
assert.ok(ownPlan.shots.some((s) => (s.cuts as { fx: string }[]).some((c) => c.fx === 'synth')), 'an ordinary line keeps them');

// the whole-line entrances: at rest exactly at k = 1, the same every time, and only where they fit
assert.equal(new Set(RECIPES.filter((r) => isArrival(r.enter)).map((r) => r.enter)).size, ARRIVALS.length, 'every entrance has a recipe');
for (const k of [1, 1.4]) {
  for (const kind of ['s', 'spiral'] as const) assert.deepEqual(curvePoint(k, 1, kind), { x: 0, y: 0, rot: 0 }, 'on its line when reading starts');
  assert.deepEqual({ ...cornerPose(k, 1, 3), pivot: 0 }, { rot: 0, dx: 0, dy: 0, scale: 1, pivot: 0 }, 'square when reading starts');
  assert.equal(waveEdge(300, k, 5, 30), 0);
  assert.equal(waveRise(k), 0);
  assert.deepEqual(doorPhase(k), { cover: 1, left: 1, right: 1 });
  assert.ok(seatPhase(k).solid === 1 && seatPhase(k).rings.every((r) => r.alpha === 0 && r.scale === 1), 'no outline left');
  assert.equal(slatTurn(1, 4, k, true), 0);
  assert.equal(grainStep(1, k), 2, 'the characters themselves');
  assert.equal(markShare(2, 3, k), 1);
}
assert.deepEqual(curvePoint(0.3, 1, 's'), curvePoint(0.3, 1, 's'), 'a pure function of time');
for (let q = 0; q <= 1; q += 0.05) for (const kind of ['s', 'spiral'] as const) assert.ok(Math.abs(curvePoint(q, 1, kind).rot) <= 0.41, 'a limited turn');
const whorl = Array.from({ length: 21 }, (_, i) => Math.atan2(curvePoint(i / 20, 1, 'spiral').y, curvePoint(i / 20, 1, 'spiral').x));
const swept = whorl.slice(1).reduce((a, x, i) => a + Math.abs(Math.atan2(Math.sin(x - whorl[i]), Math.cos(x - whorl[i]))), 0);
assert.ok(swept < Math.PI * 2, `an open curve, less than one turn (${swept.toFixed(2)})`);
for (let s = 0; s < 8; s++) {
  assert.ok(Math.abs(cornerPose(0, 1, s).rot - Math.PI / 4) > 0.15, 'not the stock 45 degrees');
  assert.ok(Math.abs(doorSeam([0.5], s) - 0.5) >= 0.06, 'doors never meet in the middle');
}
assert.equal(doorSeam([0.4, 0.7], 1), 0.4, 'they meet on a phrase break');
assert.ok(markShare(0, 3, 0.3) > markShare(1, 3, 0.3) && markShare(1, 3, 0.3) > markShare(2, 3, 0.3), 'phrase by phrase');
assert.ok(slatEdges([1, 1]).length >= 4, 'at least three slats');
assert.ok(slatEdges([3, 2, 4, 2, 2, 3, 1]).length <= 6, 'only a few wide ones');
const slatEven = slatEdges([1]);
assert.ok(new Set(slatEven.slice(1).map((e, i) => +(e - slatEven[i]).toFixed(3))).size > 1, 'of unequal width');
assert.ok(slatTurn(0, 3, 0, true) < Math.PI / 2 - 0.2, 'a short turn, never quite edge-on');
assert.ok(grainStep(0, 0.5) > grainStep(1, 0.2), 'the screen clears across the line');
const f4 = seatPhase(0.2);
assert.ok(Math.abs(f4.rings[0].scale - f4.rings[1].scale) > 0.05, 'the two outlines at unequal distances');
const stepped = RECIPES.find((r) => r.id === 'mark-plain')!.fit!;
assert.ok(stepped.test('一杯咖啡 一支香菸') && !stepped.test('我們走到這裡') && !stepped.test('一 我們走到了這裡的盡頭'), 'phrases in step, or nothing to mark');

// rare, and a chorus does not carry them past it
const chorus4 = ['風吹過來 吹過海', '故事開始了', '一杯咖啡 一支香菸', '眼淚慢慢湧上來', '你突然闖進來', '這就是答案', '我終於看清了你', '收到你的訊息'];
const refrain = Array.from({ length: 64 }, (_, i) => ({ ...cue(i, chorus4[i % 8]), start: i * 5, end: i * 5 + 4.4 }));
const refrainLines = composePlan({ ...song, cues: refrain, duration: 330 }, meaning, false).plan.shots.flatMap((s) => s.lines as { enter: string }[]);
const entered = refrainLines.filter((l) => isArrival(l.enter));
assert.ok(entered.length >= 3 && entered.length <= Math.ceil(64 * 0.1), `arrivals stay rare (${entered.length})`);
for (const e of ARRIVALS) assert.ok(entered.filter((l) => l.enter === e).length <= Math.ceil(64 * 0.04), `${e} under its own cap`);
const places = refrainLines.flatMap((l, i) => (isArrival(l.enter) ? [i] : []));
assert.ok(places.slice(0, 3).every((x, i) => !i || x - places[i - 1] >= 3), 'and apart the first time round');
// a bare solid beside the words says nothing: the layout stays registered, the composer does not reach for it
assert.ok(!RECIPES.some((r) => r.template === 'counterweight'), 'no counterweight until it can carry a reason');
assert.ok(plan.shots.flatMap((s) => s.cuts as { yields?: boolean }[]).every((c) => c.yields), 'a composed cut is printed on the song\'s sheet');
// each song its own reach, never its own timing
assert.notDeepEqual(curvePoint(0.3, 1, 's', 0.8, 0.7), curvePoint(0.3, 1, 's', 1.2, 1.3), 'the path is the song\'s own');
assert.notDeepEqual(cornerPose(0.2, 1, 3, 0.8).rot, cornerPose(0.2, 1, 3, 1.25).rot);
assert.notEqual(seatPhase(0.3, 0.75).rings[0].scale, seatPhase(0.3, 1.3).rings[0].scale);
assert.notEqual(slatTurn(0, 3, 0.1, true, 1.05), slatTurn(0, 3, 0.1, true, 1.3));
assert.ok(slatEdges([1, 1], 4).length === 5, 'as many slats as the song asks');
for (const r of [0.75, 1.3]) {
  assert.deepEqual(curvePoint(1, 1, 'spiral', r, r), { x: 0, y: 0, rot: 0 }, 'at rest at the same moment whatever the reach');
  assert.equal(cornerPose(1, 1, 3, r).rot, 0);
  assert.equal(seatPhase(1, r).rings[0].alpha, 0);
  assert.equal(slatTurn(0, 3, 1, true, r), 0);
  assert.equal(waveEdge(10, 1, 3, 30, r), 0);
}
assert.ok(!Object.values(BACKGROUNDS).flat().some((f) => ['pattern', 'brush'].includes(f)), 'frame-wide stripes and heavy rings stay out from under the words');
const striped = composePlan(song, { ...meaning, parts: [{ from: 'c0', tension: 0.5, fx: ['pattern', 'brush', 'pattern'], what: 'a' }] }, false).plan;
assert.ok(striped.shots.flatMap((s) => s.cuts as { fx: string }[]).every((c) => !['pattern', 'brush'].includes(c.fx)), 'even when a part asks for them');
const arrivalShot = composePlan({ ...song, cues: [{ ...cue(0, '山頭上的雲朵'), start: 5, end: 9 }, { ...cue(1, '聽見模糊的歌'), start: 12, end: 16 }, { ...cue(2, '山頭上的小路'), start: 19, end: 23 }] }, meaning, false).plan.shots.find((s) => (s.lines as { enter: string }[]).some((l) => isArrival(l.enter)))!;
assert.equal((arrivalShot.cuts as { transition: string; flash: string }[])[0].transition, '', 'nothing lands on top of a line\'s own entrance');
console.log('lineplan ok');

// the finish: one sheet, hand-cut edges, one light, three sizes, no halo
{
  const square: Pt[] = [[-100, -60], [100, -60], [100, 60], [-100, 60]];
  const rough = roughEdge(square, 7, 3);
  assert.ok(square.every((p) => rough.some((q) => q[0] === p[0] && q[1] === p[1])), 'a hand-cut edge keeps every corner exactly');
  assert.ok(rough.length > square.length && rough.every(([x, y]) => Math.abs(x) <= 103 && Math.abs(y) <= 63), 'and only wanders by its amount');
  assert.deepEqual(roughEdge(square, 7, 3), rough, 'the same cut every time');
  assert.deepEqual(insetOutline(square, 10), [[-90, -50], [90, -50], [90, 50], [-90, 50]], 'a partner line runs a fixed way inside the edge');
  assert.deepEqual(insetOutline([...square].reverse(), 10).reverse(), [[-90, -50], [90, -50], [90, 50], [-90, 50]], 'whichever way the outline runs');
  const vals = Array.from({ length: 400 }, (_, i) => mottle((i % 20) / 20, Math.floor(i / 20) / 20, 3));
  assert.ok(vals.every((v) => v >= -1 && v <= 1) && Math.max(...vals) - Math.min(...vals) > 0.3, 'the sheet has tone in it');
  assert.ok(Math.abs(mottle(0, 0.3, 3) - mottle(1, 0.3, 3)) < 1e-9, 'and tiles without a seam');
  assert.equal(fibres(3, 50, 100, 100).filter((f) => f.light).length, 25, 'as many light fibres as dark');
  assert.ok(contactShadow(20).dy > 0 && contactShadow(20).dx > 0 && contactShadow(20).blur > contactShadow(8).blur, 'one light for the song, softer the higher the paper');
  assert.ok(tornLine(40, 2, 10).every((v) => Math.abs(v) <= 10), 'a tear stays within its amount');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080', 'mixing two inks');
  const rect = { x0: 200, y0: 300, x1: 1700, y1: 620 };
  assert.equal(edgesByRoom(rect, 1920, 1080)[0], 'bottom', 'a piece stands on the roomiest edge');
  assert.ok(cornerRoom(rect, 0, 1080, 1920, 1080) > 400, 'a corner knows how clear it is');
  const under = finePlace(rect, 120, 1920, 1080, 0.8, 1)!;
  assert.ok(under.across && under.rule[1] > rect.y1 && under.at[1] > under.rule[1], 'the small tier hugs the block from below');
  const tall = finePlace({ x0: 800, y0: 40, x1: 1000, y1: 1040 }, 120, 1920, 1080, 0.8, 1)!;
  assert.ok(!tall.across && tall.rule[0] > 1000, 'a block filling the height takes its side');
  assert.equal(finePlace({ x0: 10, y0: 10, x1: 1910, y1: 1070 }, 120, 1920, 1080), undefined, 'and a block with no margin has none');
  for (const fx of ['dots', 'synth', 'rain', 'rays', 'flow']) assert.ok(hushOf(fx) > 0, `${fx} is printed back under a line`);
  assert.equal(hushOf('deckle'), 0, 'a ground that keeps off the words needs nothing');
  assert.ok(LINE_GROUNDS.every(isLineGround) && !LINE_GROUNDS.some((g) => KINETIC_FX.includes(g)), 'the composer\'s grounds stay off the director\'s list');
  assert.ok(Object.values(BACKGROUNDS).flat().every((f) => isLineGround(f) || KINETIC_FX.includes(f)), 'every background is one the renderer has');
  assert.ok(!Object.values(BACKGROUNDS).flat().some((f) => ['split', 'bolt', 'crack', 'beams', 'spiral', 'stamp', 'film', 'bokeh', 'beatbg', 'invert', 'glitch'].includes(f)), 'nothing that strokes through or flashes under a line');
  assert.ok(Object.keys(GROUND_HELP).length === LINE_GROUNDS.length, 'the reading is told what each one is');
  // never made-up detail: the title, the part's name or words the line sings
  const line = { id: 'x', start: 10, end: 13, text: '慢慢走到天亮 我還在' };
  const tiers = Array.from({ length: 12 }, (_, i) => fineFor(line, '天亮', i, 5, '雙截棍', undefined));
  assert.ok(tiers.some((t) => !t), 'not every line has one');
  assert.ok(tiers.flatMap((t) => (t ? [t] : [])).every((t) => (t.kind === 'key' ? line.text.includes(t.text) : t.kind === 'title' ? t.text === '雙截棍' : t.kind === 'rule' && t.text === '')), 'its words are real');
  assert.equal(fineFor(line, '天亮', 3, 5, '雙截棍', '副歌')?.text, '副歌', 'a new part names itself');
  assert.equal(fineFor({ ...line, text: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十', end: 11 }, '一二', 0, 5, 't', undefined), undefined, 'a line sung too fast has nothing beside it');
  assert.notEqual(fineFor(line, '慢慢走到天亮我還在', 2, 5, 't', undefined)?.kind, 'key', 'a phrase that is the whole line is not set again');
  // what the base treatment was made for stays behind
  const base = { language: 'spy-titles', concept: 'x', moments: [{ kind: 'drop', at: 10 }], arc: [{ start: 0, level: 1 }], motif: {}, styleAnchor: { palette: {} }, shots: [{ id: 's', camera: 'push' }], design: { font: 'f', language: 'spy-titles', signature: { layout: 'linear' }, techniques: ['echo', 'title-hook'], peak: 'vacuum', grain: 0.1 } };
  const clean = composerBase(base, { shots: [{ shot: 'L1', lines: [{ cue: 'c' }] }] }, [{ id: 'L1', start: 0, end: 1 }], { ink: '#000000', paper: '#ffffff', accent: '#ff0000' });
  assert.ok(clean.design.composer && clean.design.signature === undefined && clean.design.language === undefined && clean.language === undefined, 'no signature rail or language comes with the base');
  assert.deepEqual([clean.moments, clean.arc, clean.design.techniques, clean.motif], [[], [], [], undefined], 'nor another song\'s moments, peaks or motif');
}
{
  // backgrounds: a real spread on the two kinds of song, no diagonal split under the words
  const count = (calmSong: boolean) => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, start: 5 + i * 3, end: 7.5 + i * 3, text: `第${i}句慢慢走到天亮` }));
    const song = { title: calmSong ? '靜歌' : '快歌', duration: 130, tempo: 110, beats: Array.from({ length: 260 }, (_, i) => i * 0.5), cues: lines };
    const parts = [{ from: 'c0', tension: calmSong ? 0.3 : 0.6, fx: ['split', 'smoke'], what: '' }, { from: 'c20', tension: calmSong ? 0.4 : 0.9, fx: ['rays', 'bolt'], what: '' }];
    const { plan } = composePlan(song, { palette: 'tea', ground: 'grain', reading: '', parts, keys: [] }, calmSong);
    const n = new Map<string, number>();
    const cuts = plan.shots.flatMap((s) => s.cuts as { fx: string }[]);
    cuts.forEach((c) => n.set(c.fx, (n.get(c.fx) ?? 0) + 1));
    return { share: Math.max(...n.values()) / cuts.length, kinds: n.size, split: n.get('split') ?? 0, cuts: cuts.map((c) => c.fx) };
  };
  for (const r of [count(false), count(true)]) {
    assert.ok(r.share <= 0.25 && r.kinds >= 6, `no background takes the song (${r.share.toFixed(2)} of ${r.kinds})`);
    assert.equal(r.split, 0, 'the diagonal split is gone from under the lines');
    r.cuts.forEach((f, i) => assert.ok(!r.cuts.slice(Math.max(0, i - 3), i).includes(f), 'and no background comes straight back'));
  }
}
console.log('finish ok');

// batch 5: every exit is the line at rest at q = 0, gone at q = 1, the same on every sampling
{
  assert.deepEqual([...LINE_EXIT_KINDS].sort(), ['band-out', 'box-turn', 'display-off', 'echo-travel', 'focus-out', 'frame-advance', 'glyph-shed', 'gravity-pass', 'line-fold', 'node-fold', 'pore-out', 'radial-leave', 'rail-leave', 'slat-close', 'tile-scatter', 'wave-dissolve']);
  for (const k of LINE_EXIT_KINDS) {
    assert.ok((LINE_EXITS as string[]).includes(k) && !(EXIT_KINDS as string[]).includes(k), `${k} is the composer's only`);
    assert.ok(LINE_EXIT_SEC[k] >= 0.4 && LINE_EXIT_SEC[k] <= 0.7 && isLineExit(k), `${k} is long enough to see and short enough to afford`);
  }
  assert.ok(!isLineExit('fade') && !isLineExit('collapse'), 'old exits keep their meaning');
  // B33
  for (const i of [0, 1, 2, 3]) {
    assert.equal(stripShare(i, 4, 0), 0, 'a strip is home as the exit starts');
    assert.equal(stripShare(i, 4, 1), 1, 'and gone at its end');
  }
  assert.ok(stripShare(0, 4, 0.4) > stripShare(1, 4, 0.4), 'the outer strips lead');
  // B34
  assert.deepEqual([slatClose(300, 100, 0, 1).x + 0, slatClose(300, 100, 0, 1).c], [0, 1], 'a slat is whole at the start');
  assert.equal(slatClose(300, 100, 1, 1).c, 0, 'and closed at the end');
  for (const q of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const [inner, outer] = [slatClose(150, 100, q, 0.2), slatClose(250, 100, q, 0.7)];
    const edge = 200;
    assert.ok(100 + (edge - 100) * inner.c <= 100 + (edge - 100) * outer.c + 1e-9, 'slats open gaps, they never lie over each other');
    assert.ok(Math.abs(150 + inner.x - (100 + 50 * inner.c)) < 1e-9, 'each closes on the focus');
  }
  // B35
  assert.deepEqual(foldPhase(0), { flat: 0, shrink: 0 });
  assert.deepEqual(foldPhase(1), { flat: 1, shrink: 1 });
  assert.equal(foldPhase(0.4).shrink, 0, 'it presses first, then the stroke runs out');
  const [a0, a1] = strokeLeft(100, 500, 1, 1);
  assert.equal(a1 - a0, 0, 'nothing of the stroke is left');
  assert.deepEqual(strokeLeft(100, 500, -1, 0), [100, 500], 'the whole phrase length to begin with');
  // B36
  for (const [w, h] of [[900, 220], [1200, 480], [420, 300]]) {
    const tiles = tilesOf(w, h, 17);
    assert.ok(tiles.length >= 2 && tiles.length <= 12, 'a few large pieces');
    const area = tiles.reduce((a, t) => a + (t.x1 - t.x0) * (t.y1 - t.y0), 0);
    assert.ok(Math.abs(area - w * h) < 1, 'that cover the paper whole');
    assert.deepEqual(tilesOf(w, h, 17), tiles, 'and are cut the same every time');
    assert.ok(new Set(tiles.map((t) => Math.round(t.x1 - t.x0))).size > 1, 'unevenly');
  }
  const at0 = tilePose(1, 4, 0, 200, 0, 40, 30, 1200, 9);
  assert.deepEqual([at0.x, at0.y, at0.rot, at0.alpha].map((x) => x + 0), [0, 0, 0, 1], 'a tile is in place until the exit starts');
  assert.equal(tilePose(1, 4, 1, 200, 0, 40, 30, 1200, 9).alpha, 0, 'and gone at its end');
  // B37
  for (const way of ECHO_WAYS) {
    assert.equal(echoPose(way, 0, 0).alpha, 0, `${way}: no copy shows at the exit's start`);
    assert.equal(echoPose(way, 1, 1).alpha, 0, `${way}: none is left at its end`);
    assert.ok(echoPose(way, 1, 0.5).alpha < 0.62, 'a copy is always fainter than the line');
  }
  // B38
  const r0 = radialShift(300, 40, 100, 0, 0);
  assert.deepEqual([r0.dx, r0.dy, r0.scale, r0.alpha].map((x) => x + 0), [0, 0, 1, 1], 'the push starts from rest');
  assert.equal(radialShift(300, 40, 100, 0, 1).alpha, 0);
  assert.ok(radialShift(300, 40, 100, 0, 0.5, 1).dx > radialShift(300, 40, 100, 0, 0.5, 0.3).dx, 'the backdrop shares the curve at less reach');
  for (const q of [0.2, 0.5, 0.8, 0.95]) {
    // two characters touching at rest, 200 apart and 200 wide, from a focus anywhere
    const [a, b] = [radialShift(300, 40, 120, 60, q), radialShift(500, 40, 120, 60, q)];
    const gap = 500 + b.dx - (300 + a.dx);
    assert.ok(gap + 1e-9 >= 200 * a.scale, 'characters that do not touch at rest never touch while pushed');
    assert.equal(a.scale, b.scale, 'one enlargement for the whole line');
  }
  assert.notDeepEqual(pushFocus(0, 0, 800, 200, 5), [0, 0], 'off the block\'s middle');
  // B39
  const c0 = crumbPose(0.5, 1, 0, 0, 7, 200);
  assert.deepEqual([c0.x, c0.y, c0.rot, c0.alpha, c0.scale].map((x) => x + 0), [0, 0, 0, 1, 1], 'a crumb starts where it is, so the character is whole');
  assert.equal(crumbPose(0.5, 1, 0, 1, 7, 200).alpha, 0);
  assert.ok(crumbPose(0.1, 1, 0, 0.5, 7, 200).y < crumbPose(0.9, 1, 0, 0.5, 7, 200).y, 'what was let go first has fallen further');
  // B40
  assert.equal(waveShift(100, 0, 150, 40) + 0, 0, 'the wave grows from nothing');
  assert.ok(Math.abs(waveShift(100, 0.5, 150, 40)) <= 40, 'within its amplitude');
  assert.deepEqual(waveThin(0), { keep: 1, alpha: 1 }, 'whole at the start');
  assert.equal(waveThin(1).alpha, 0);
  assert.ok(waveThin(0.7).keep < 0.5, 'thinning to lines');
  // the composer: the words ask, the reading pays, the song's shares hold
  assert.equal(exitFor('回音一直響', 'stair', 'wipe', 2, false, new Map(), 2), undefined, 'echo-travel is not offered: its copies still lie over one another (B37 not done)');
  const used = new Map<string, number>();
  assert.equal(exitFor('不要再等了', 'stair', 'wipe', 1.2, false, used, 2), 'band-out');
  assert.equal(exitFor('今天天氣很好', 'stair', 'wipe', 1.2, false, used, 2), undefined, 'without a level, a line that does not ask keeps its own');
  assert.ok(exitFor('今天天氣很好', 'stair', 'wipe', 1.2, false, used, 2, undefined, 1, 4), 'with the time it takes one that suits its level');
  assert.equal(exitFor('不要再等了', 'stair', 'wipe', 1.2, false, used, 2, 'band-out'), undefined, 'never the same way twice running, even if asked');
  assert.equal(exitFor('今天天氣很好', 'stair', 'wipe', 0.2, false, used, 2, undefined, 1, 4), undefined, 'a fast line stays as it is');
  assert.equal(exitFor('不要再等了', 'stair', 'wipe', 0.3, false, used, 2), undefined, 'no time, no exit');
  assert.equal(exitFor('不要再等了', 'stair', 'wipe', 1.2, true, used, 2), undefined, 'a calm song does not cut itself up');
  assert.equal(exitFor('我們就此解散', 'lyric-carrier', 'cut', 1.2, false, used, 2), 'tile-scatter', 'paper comes apart');
  assert.equal(exitFor('不要再等了', 'lyric-carrier', 'cut', 1.2, false, used, 2), undefined, 'only paper does, on a carrier');
  assert.equal(exitFor('不要再等了', 'stair', 'wipe', 1.2, false, new Map([['band-out', 2]]), 2), undefined, 'each kind keeps its share');
  assert.equal(exitFor('不要再等了', 'reply-thread', 'cut', 1.2, false, used, 2), undefined, 'and only on layouts it works on');
}
// batch 6
{
  for (const k of ['pore-out', 'focus-out', 'rail-leave', 'gravity-pass', 'box-turn', 'frame-advance']) {
    assert.ok((LINE_EXITS as string[]).includes(k) && !(EXIT_KINDS as string[]).includes(k), `${k} is the composer's only`);
  }
  for (const k of ['box-turn', 'frame-advance', 'frame-dive']) assert.ok((LINE_ENTERS as string[]).includes(k) && !(ENTER_KINDS as string[]).includes(k), `${k} is the composer's only`);
  // B41
  const field = Array.from({ length: 400 }, (_, i) => poreField((i % 20) / 20, Math.floor(i / 20) / 20, 7, () => 0));
  assert.ok(field.every((f) => f >= 0 && f <= 1) && Math.min(...field) < 0.1 && Math.max(...field) > 0.4, 'pores eat from several places, all of it by the end');
  assert.deepEqual(poreField(0.3, 0.4, 7, () => 0), poreField(0.3, 0.4, 7, () => 0));
  assert.notEqual(poreField(0.3, 0.4, 7, () => 0), poreField(0.3, 0.4, 8, () => 0));
  // B42
  assert.equal(focusShare(0, 3, 0), 0);
  assert.equal(focusShare(2, 3, 1), 1);
  assert.ok(focusShare(0, 3, 0.4) > focusShare(2, 3, 0.4), 'the focus walks along the line');
  // B43
  assert.equal(boxAngle(1, 0, 1.2), 0, 'square for all of the reading');
  assert.equal(boxAngle(0, 0, 1.2), 1.2, 'side-on before it');
  assert.equal(boxAngle(1, 1, 1.2), -1.2, 'and on round after it');
  assert.deepEqual(boxTurn(0), { face: 1, side: 0 });
  // B44
  assert.equal(feedShift(1, 0), 0, 'locked at rest');
  assert.equal(feedShift(0, 0), -1, 'from a frame below');
  assert.equal(feedShift(1, 1), 1, 'on to the frame above');
  const strip = frameBox(600, 300, 3, 4);
  assert.ok(strip.outline.length > 6 && strip.outline.every(([x]) => Math.abs(x) <= 300), 'notches on one side, inside the frame');
  assert.ok(strip.outline.filter(([x]) => x === 300 - 15 || x === -300 + 15).length === 8, 'and only that side');
  // B45
  const leaned = (e: number) => textCamAt({ kind: 'lean-settle', dir: 1, amount: 0.5 }, e).rot;
  assert.equal(leaned(0.3), leaned(0.7), 'one fixed angle through the reading');
  assert.ok(Math.abs(leaned(0)) > Math.abs(leaned(0.3)) && Math.abs(leaned(1)) > Math.abs(leaned(0.3)), 'the sway is outside it');
  assert.ok(leanAngle(30) < leanAngle(8) && leanAngle(4) <= 0.03, 'a long block leans less, never past the fit');
  // B46
  assert.deepEqual(Object.values(divePose(1, 5)).map((x) => x + 0), [1, 0, 0, 0, 1], 'whole, in place and clear at rest');
  assert.equal(divePose(0, 5).scale, 0.26, 'from a small box');
  assert.equal(divePose(0, 5).noise, 1, 'grainy until it comes up');
  // B47
  const rail = (q: number) => railPose(q, [0, -100], [700, 300], -180);
  assert.deepEqual([rail(0).x, rail(0).y, rail(0).rot, rail(0).scale].map((x) => x + 0), [0, 0, 0, 1], 'from where the card was read');
  assert.equal(rail(1).alpha, 0);
  assert.ok(rail(0.95).scale < 0.3 && Math.abs(rail(1).x - 700) < 1e-9, 'small, at the point off to the side');
  // B48
  const g0 = gravityPose(0, 1);
  assert.deepEqual([g0.rot, g0.x, g0.y, g0.follow].map((x) => x + 0), [0, 0, 0, 0], 'still until the exit starts');
  assert.ok(gravityPose(0.2, 1).rot > 0 && gravityPose(0.2, 1).y === 0, 'it tips over its edge before it falls');
  assert.ok(gravityPose(1, 1).y < -1100 && gravityPose(1, 1).follow === 1, 'out of the frame, the camera after it');
}
// batch 7
{
  for (const k of ['balance-seat', 'display-feed', 'edge-light']) assert.ok((LINE_ENTERS as string[]).includes(k) && !(ENTER_KINDS as string[]).includes(k), `${k} is the composer's only`);
  for (const k of ['balance-rest', 'side-light', 'reflection-rest', 'breath-rule']) assert.ok((LINE_IDLES as string[]).includes(k) && !(IDLE_KINDS as string[]).includes(k), `${k} is the composer's only`);
  assert.ok((LINE_EXITS as string[]).includes('display-off') && !(EXIT_KINDS as string[]).includes('display-off'));
  // rays stop on an oval that holds the words, each on a length of its own
  const words = { x0: 300, y0: 400, x1: 1500, y1: 640 };
  const oval = ovalOf(words);
  for (const [x, y] of [[300, 400], [1500, 400], [300, 640], [1500, 640]]) assert.ok(((x - oval.cx) / oval.a) ** 2 + ((y - oval.cy) / oval.b) ** 2 < 1, 'the block is inside the oval');
  const starts = Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2; return { a, r: rayStart(oval, a, i, 3) }; });
  assert.ok(starts.every(({ a, r }) => ((r * Math.cos(a)) / oval.a) ** 2 + ((r * Math.sin(a)) / oval.b) ** 2 >= 1), 'no ray starts inside it');
  assert.ok(new Set(starts.map((x) => Math.round(x.r - rayStart(oval, x.a, 1, 3)))).size > 10, 'and no two stop alike');
  assert.ok(!maskedByLine('rays') && maskedByLine('rain'), 'rays are no longer cut by a box');
  // B49
  assert.equal(balanceTilt(1, 1), 0, 'level for all of the reading');
  assert.ok(balanceTilt(0, 1) > 0 && balanceTilt(0, -1) < 0, 'down on the heavier side first');
  assert.ok(balanceTilt(0.3, 1) < 0, 'and through level before it settles');
  assert.ok(balancePoint(-400, 300, 400, 100) < 0, 'the point sits nearer the wider phrase');
  // B50
  assert.equal(feedLeft(1), 0, 'the display stands still for reading');
  assert.equal(feedLeft(0), 1);
  assert.deepEqual([0, 0.3, 0.6, 0.9, 1].map(displayLevel), [1, 0.55, 0.25, 0.1, 0], 'it goes out in steps');
  // B51
  assert.ok(pressDepth(200, 0.6) < pressDepth(200, 0.4), 'a dense character gets less thickness');
  assert.equal(stateFor('block', 60, 0.3), 'solid', 'small type has no room for it');
  assert.equal(stateFor('block', 200, 0.3), 'block');
  // B52
  assert.equal(stateFor('edge', 200, 0.3), 'edge');
  assert.equal(stateFor('edge', 200, 0.7), 'solid', 'a dense line keeps its counters');
  assert.ok(ARRIVAL_SEC['edge-light'] < 0.7, 'the sweep is over before reading');
  // B54
  assert.ok(Math.abs(heldTail('一杯茶', 12, [10, 10.4, 10.8], true) - 1.2) < 1e-9, 'a held note is measured');
  assert.equal(heldTail('一杯茶啊', 12), 1.1, 'a marked vowel with no times counts');
  assert.equal(heldTail('一杯茶', 12), 0, 'nothing is invented');
  assert.equal(breathLine(0, 8, 3, 2) + 0, 0, 'it starts on the line');
  assert.ok(Math.abs(breathLine(0.999, 8, 3, 2)) < 0.3, 'and dies at its tip');
  // B56
  assert.equal(themeIcon(['花開了', '一朵花', '花落了', '今天下雨'])?.symbol, 'flower', 'the thing the song keeps naming');
  assert.equal(themeIcon(['花開了', '今天下雨', '想你']), undefined, 'one mention is no theme');
  assert.equal(themeIcon(['快使用雙截棍', '三年後的大雪', '我再也不在你身邊']), undefined, 'and nothing fits most songs');
  // follow-up: the seam lies ahead of the card, never across it
  assert.ok(railAhead(0.5, 0.2) > railShare(0.5) && railAhead(1, 0.2) === 1, 'it starts past the card');
  // follow-up: a rail is not offered on paper, which hides it
  assert.notEqual(exitFor('我要遠行了', 'lyric-carrier', 'cut', 2, false, new Map(), 2), 'rail-leave');
}
// batch 8 and its corrections
{
  // B52: a counter is not outside, whatever the glyph; a ring around a hole leaves the hole alone
  const size = 9;
  const ring = [...'.........',...'.#######.',...'.#.....#.',...'.#.###.#.',...'.#.#.#.#.',...'.#.###.#.',...'.#.....#.',...'.#######.',...'.........'].map((c) => (c === '#' ? 255 : 0));
  const out = exteriorOf((i) => ring[i], size, size);
  assert.equal(out[0], 1, 'the corner is outside');
  assert.equal(out[size * 2 + 2], 0, 'the gap inside the ring is not');
  assert.equal(out[size * 4 + 4], 0, 'nor the hole in the middle');
  // B49: only real weighing
  const weighs = (t: string) => RECIPES.find((r) => r.id === 'balance-plain')!.fit!.test(t);
  assert.ok(weighs('你比我 重要一點') && weighs('是你呢 還是我') , 'a comparison is a weighing');
  for (const t of ['如果我有輕功 飛簷走壁', '一再重演 一根我不抽的菸']) assert.ok(!weighs(t), `${t}: the character alone proves nothing`);
  // B57
  const lamps = lampSpans(24, 5);
  assert.ok(lamps.every(([a, b], i) => b > a && (i === 0 || a > lamps[i - 1][1])) && lamps.at(-1)![1] < 1, 'lamps in order, gaps between, inside the way round');
  assert.ok(new Set(lamps.map(([a, b]) => Math.round((b - a) * 1000))).size > 12, 'long and short');
  assert.equal(lampsLit(24, 0), 0);
  assert.equal(lampsLit(24, 1), 24, 'all on and held from the end of the entrance');
  assert.ok((LINE_IDLES as string[]).includes('frame-lights') && !(IDLE_KINDS as string[]).includes('frame-lights'));
  // B58
  const pts = Array.from({ length: 80 }, (_, i) => ovalStroke(i / 79, 7));
  assert.ok(pts.every((p) => Math.hypot(p.x, p.y) >= 0.97), 'the ring stays outside the oval that holds the block');
  assert.ok(Math.hypot(pts[0].x - pts[79].x, pts[0].y - pts[79].y) > 0.1, 'and its ends do not meet');
  const squeezed = ovalFit({ x0: -700, y0: -90, x1: 600, y1: 90 }, 960, 540)!;
  assert.ok(squeezed.cx - squeezed.a * 1.14 >= -960, 'a wide block gets a ring squeezed into the frame, not none');
  for (const [x, y] of [[-700, -90], [600, 90], [-700, 90], [600, -90]]) assert.ok(((x - squeezed.cx) / squeezed.a) ** 2 + ((y - squeezed.cy) / squeezed.b) ** 2 <= 1, 'and it still holds the block');
  assert.equal(ovalFit({ x0: -950, y0: -300, x1: 950, y1: 300 }, 960, 540), undefined, 'a block that fills the frame has no ring');
  // B59
  const zone = { x0: 300, y0: 380, x1: 1620, y1: 700 };
  for (const b of scrapsOutside(15, 4, zone, 1920, 1080)) assert.ok(b.y + b.r * 1.6 < zone.y0 || b.y - b.r * 1.6 > zone.y1 || b.x + b.r * 1.6 < zone.x0 || b.x - b.r * 1.6 > zone.x1, 'no scrap reaches the words');
  assert.equal(scrapsOutside(15, 4, { x0: 20, y0: 30, x1: 1900, y1: 1050 }, 1920, 1080).length, 0, 'a block that fills the frame has none');
  // B60: a song with no sign of its own presses nothing; one that has, at most twice
  const sealed = (lines: string[]) => composePlan({ title: 't', duration: 200, tempo: 110, beats: Array.from({ length: 400 }, (_, i) => i * 0.5), cues: lines.map((text, i) => ({ id: `c${i}`, start: 5 + i * 5, end: 8 + i * 5, text })) }, { palette: 'tea', ground: 'grain', reading: '', parts: [{ from: 'c0', tension: 0.5, fx: ['crease'], what: '' }], keys: [] }, false).plan.shots.flatMap((s) => s.cuts as { fx: string }[]).filter((c) => c.fx === 'fold-mark').length;
  assert.equal(sealed(['我們的約定', '遵守約定', '這個約定', '今天的風']), 0);
  assert.ok(sealed(['花開了', '一朵花', '花落了', '我們的約定', '遵守約定', '這個約定', '再一次約定']) <= 2);
  // B63
  assert.ok(apertureAt(0, [100, 200], [900, 500], 2400).rx > 2000, 'open past the frame');
  assert.ok(apertureAt(0.5, [100, 200], [900, 500], 2400).rx < 1, 'shut in the middle');
  assert.deepEqual([apertureAt(0.3, [100, 200], [900, 500], 2400).cx, apertureAt(0.7, [100, 200], [900, 500], 2400).cx], [100, 900], 'off-centre on each line in turn');
  assert.equal(passKeeps({ kind: 'aperture', from: 1, to: 2, dir: 1 }, 1.2, 0).coming.d, -1e5, 'the next line waits behind the shut iris');
  assert.equal(passKeeps({ kind: 'aperture', from: 1, to: 2, dir: 1 }, 1.8, 0).going.d, -1e5, 'and the old one is gone by then');
  assert.equal(HANDOFF_TRANSITION.aperture, 'lyric-aperture');
  // B61 and B62 did not make it: they stay out
  for (const f of ['margin-doodle', 'woven-lines']) assert.ok(!isLineGround(f) && !Object.values(BACKGROUNDS).flat().includes(f), `${f} is not offered`);
}
// batch 9
{
  // a tall tag's cut stays in the corner's margin, and a drawn exit runs with no trail of copies behind it
  const tall = tagBox(1400, 420, 3, 1.34, 1, 180);
  assert.ok(Math.max(...tall.outline.map(([x, y]) => (Math.abs(y) === 210 ? 700 - Math.abs(x) : 0))) <= 180.01, 'the cut never reaches the type');
  const trailed = composePlan({ title: 'x', duration: 60, tempo: 110, beats: Array.from({ length: 120 }, (_, i) => i * 0.5), cues: [{ id: 'c0', start: 2, end: 5, text: '不要再等了' }, { id: 'c1', start: 9, end: 12, text: '今天的風' }] }, { palette: 'tea', ground: 'grain', reading: '', parts: [{ from: 'c0', tension: 0.6, fx: ['crease'], what: '' }], keys: [] }, false, { recipes: new Map([['c0', 'stair-dash']]), exits: new Map([['c0', 'band-out']]) }).plan.shots.flatMap((s) => s.lines as { cue: string; trail: boolean }[]);
  assert.equal(trailed.find((l) => l.cue === 'c0')!.trail, false);
  assert.ok((LINE_ENTERS as string[]).includes('scale-steps') && !(ENTER_KINDS as string[]).includes('scale-steps'));
  assert.ok((LINE_EXITS as string[]).includes('node-fold') && !(EXIT_KINDS as string[]).includes('node-fold'));
  // B71
  assert.equal(stepScale(1, 3), 1, 'its fitted size for all of the reading');
  const sizes = Array.from({ length: 50 }, (_, i) => stepScale(i / 50, 3));
  assert.ok(sizes.every((x, i) => x <= 1 && x >= (sizes[i - 1] ?? 0)), 'never past it, never back');
  assert.equal(new Set(sizes).size, 3, 'in hard steps');
  // B72
  assert.deepEqual(Object.values(nodePhase(0)).map((x) => x + 0), [0, 0, 0], 'the line is whole as the exit starts');
  assert.equal(nodePhase(1).fade, 1, 'and gone at its end');
  assert.ok(nodeSize(2, 0, 3, 200) !== nodeSize(2, 1, 3, 200) && nodeSize(6, 0, 3, 200) > nodeSize(2, 0, 3, 200) - 20, 'each phrase its own point');
  // B70
  assert.equal(relayAt(1, 5), 5, 'the accent is on the key word as reading starts');
  assert.equal(relayAt(0, 5), 0, 'from the start of the line');
  // structural reach
  const parts = [{ from: 'c0', tension: 0.5, fx: ['crease'], what: '' }, { from: 'c6', tension: 0.7, fx: ['crease'], what: '' }, { from: 'c9', tension: 0.6, fx: ['crease'], what: '' }, { from: 'c12', tension: 0.3, fx: ['crease'], what: '' }];
  const lines = Array.from({ length: 18 }, (_, i) => ({ id: `c${i}`, start: 5 + i * 6, end: 8 + i * 6, text: `山頭上的雲第${i}回` }));
  const bare = { title: 't', duration: 130, tempo: 110, beats: Array.from({ length: 260 }, (_, i) => i * 0.5), cues: lines, sections: [{ start: 0, end: 40, type: 'verse' }, { start: 40, end: 76, type: 'chorus' }, { start: 76, end: 130, type: 'verse' }] };
  const planned = composePlan(bare, { palette: 'tea', ground: 'grain', reading: '', parts, keys: [] }, false).plan.shots;
  const all = planned.flatMap((s) => (s.lines as { cue: string; oval?: boolean; handoff?: { kind: string } }[]).map((l) => ({ ...l, t: (s.lyric as { template: string }).template })));
  assert.ok(all.some((l) => l.handoff?.kind === 'aperture'), 'a part changing with time on both sides takes the iris');
  assert.ok(all.filter((l) => l.oval).length >= 1 && all.filter((l) => l.oval).length <= 4, 'at most one ring a part');
  assert.ok(planned.some((s) => (s.lines as { idle: string }[]).some((l) => l.idle === 'frame-lights')), 'a chorus lead goes up in lights');
  const night = planned.flatMap((s) => s.cuts as { dark: boolean; transition: string }[]);
  assert.ok(night.some((c) => c.dark) && night.filter((c) => c.transition === 'lyric-palette').length >= 1, 'the part the song falls into is printed the other way round');
  // B66, B68 and B65 are not offered without their words, or stay at the margins
  assert.ok(!Object.values(BACKGROUNDS).flat().some((f) => ['horizon-light', 'surface-crack'].includes(f)), 'a sun and a crack only come with their words');
  assert.ok(isLineGround('herringbone') && isLineGround('horizon-light') && isLineGround('surface-crack'));
  assert.equal(HANDOFF_TRANSITION.signal, 'lyric-signal');
  assert.equal(handoffFor(cue(0, '看見'), cue(1, '電話斷線了'), false, true, 0), 'signal', 'a signal dropping changes hands through the grain');
}
// the last four corrections
{
  // B69: never neutral, and no words on the frame through the whole pass
  for (const p of Object.values(PALETTES)) {
    const t = passTint(p.paper, p.ink, p.accent);
    const ch = [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16));
    assert.ok(Math.max(...ch) - Math.min(...ch) >= 16, `${t} is a tint, not a grey`);
  }
  const pass = { kind: 'palette' as const, from: 10, to: 10.34, dir: 1 };
  for (let f = 1; f < 10; f++) {
    const k = passKeeps(pass, 10 + f / 30, 0);
    assert.ok(k.going.d < -1e4 && k.coming.d < -1e4, 'no line is shown at any frame of the pass, so none stands on it');
  }
  assert.ok(passKeeps(pass, 10, 0).going.d > 1e4 && passKeeps(pass, 10.34, 0).coming.d > 1e4, 'the lines are whole either side of it');
  assert.ok(handoffTimes('palette', { start: 2, end: 5, text: '一二三四五' }, 1.8, 0.3, { start: 5, end: 8, text: '一二三四五' }, 12), 'it fits lines sung back to back');
  // B72
  for (const q of [0, 0.2, 0.4, 0.55, 0.6, 0.61, 0.7, 0.9]) { const p = nodePhase(q); assert.ok(p.dot === 0 || p.gather >= 1, 'no point until the glyphs have gone'); }
  assert.ok(nodeSize(6, 1, 3, 240) <= 13, 'a point, not a blob');
  // B67
  const words = { x0: 100, y0: 300, x1: 700, y1: 800 };
  const patch = patchClear(words, 320, 200, 1920, 1080)!;
  assert.ok(patch.x0 >= words.x1 || patch.x1 <= words.x0 || patch.y0 >= words.y1 || patch.y1 <= words.y0, 'the grain stays off the words');
  assert.equal(patchClear({ x0: 20, y0: 20, x1: 1900, y1: 1060 }, 320, 200, 1920, 1080), undefined, 'and is left out when they fill the frame');
  // B68
  const blocked = (x: number, y: number) => x > 500 && x < 1500 && y > 300 && y < 800;
  const cracks = shortCracks(4, 9, 0, 0, 1920, 1080, blocked);
  assert.ok(cracks.length >= 3 && cracks.length <= 8, 'a few');
  for (const p of cracks) {
    assert.ok(p.length <= 5 && p.every(([x, y]) => !blocked(x, y)), 'short, and off the words');
    assert.ok(p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0) < 260, 'never a road across the frame');
  }
}
// words are never broken, on five real songs
{
  const kata = /^[\u30a0-\u30ff]$/, latin = /^[A-Za-z0-9]$/, han = /^\p{Script=Han}$/u;
  const midWord = (text: string, at: number) => {
    // the singer's own spaces are always legal stops
    const spaced = [...text];
    let seen = 0;
    for (let i = 0; i < spaced.length && seen <= at; i++) {
      if (/\s/.test(spaced[i])) { if (seen === at) return false; } else seen++;
    }
    const cs = spaced.filter((c) => !/\s/.test(c));
    const [a, b] = [cs[at - 1], cs[at]];
    const ja = /[\u3040-\u30ff]/.test(text);
    return (kata.test(a) && kata.test(b)) || (latin.test(a) && latin.test(b)) || (ja && han.test(a) && (han.test(b) || /^[\u3041-\u309f]$/.test(b)));
  };
  const cuts = (text: string, parts: string[]) => {
    const cs = [...text.replace(/\s/g, '')];
    let at = 0;
    return parts.slice(0, -1).flatMap((p) => { at += [...p.replace(/\s/g, '')].length; return at > 0 && at < cs.length ? [at] : []; });
  };
  const songs = ['yt_w_fCuUR3lEs', 'yt_5i50aTB7JFo', 'yt_b3GCfyNKeLs', 'yt_hCCskTJwvuc', 'yt_iwYXfOhcsYI'].map((id) => JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8')));
  assert.ok(songs.every((s) => s.cues.length > 10));
  for (const song of songs) {
    const parts = fallbackParts(song.cues, song.sections ?? [], false);
    const { plan } = composePlan(song, { palette: 'tea', ground: 'grain', reading: '', parts, keys: [] }, false);
    const byId = new Map<string, Cue>(song.cues.map((c: Cue) => [c.id, c]));
    setWordSafe(true);
    for (const l of plan.shots.flatMap((s) => s.lines as { cue: string; emphasis: string }[])) {
      const text = byId.get(l.cue)!.text;
      const bare = text.replace(/\s/g, '');
      const compact = l.emphasis.replace(/\s/g, '');
      const start = bare.indexOf(compact);
      assert.ok(start >= 0, `${l.cue}: the big word is in the line`);
      for (const at of [[...bare.slice(0, start)].length, [...bare.slice(0, start)].length + [...compact].length]) if (at > 0 && at < [...bare].length) assert.ok(!midWord(text, at), `${text}: big word "${l.emphasis}" ends mid-word`);
      for (const rows of [chunks(text, 2), chunks(text, 3), balancedRows(text, 2), balancedRows(text, 3), cutPieces(text.trim()).map((p) => p.text)]) for (const at of cuts(text, rows)) assert.ok(!midWord(text, at), `${text}: ${rows.join(' / ')}`);
    }
    setWordSafe(false);
  }
  assert.deepEqual(['チートで全部ラクをしたい'].flatMap((t) => { setWordSafe(true); const r = balancedRows(t, 2); setWordSafe(false); return r; }), ['チートで全部', 'ラクをしたい'], 'a katakana word stays whole');
  assert.ok(!['いじゃん', 'さいじゃん'].includes(keyOf('会いたいけどさ…雨はめんどくさいじゃん')), 'a big word is a whole word');
  assert.ok(RECIPES.filter((r) => r.template === 'orbit').every((r) => (r.max ?? 99) <= 10), 'an arc carries only a short line');
  assert.equal(REST_FLOOR, 52);
  assert.ok(RECIPES.every((r) => r.enter !== 'karaoke'), 'no row waits pale: it reads as a line left behind');
  // lines sung too fast to read apart share a shot, so no layout is chosen for half a line
  const quick = composePlan({ title: 'q', duration: 30, tempo: 110, beats: Array.from({ length: 60 }, (_, i) => i * 0.5), cues: [{ id: 'c0', start: 2, end: 2.3, text: 'ドドドド！' }, { id: 'c1', start: 2.4, end: 4.2, text: '神様お願いだからください才能' }, { id: 'c2', start: 12, end: 15, text: '普通の一行' }] }, { palette: 'tea', ground: 'grain', reading: '', parts: [{ from: 'c0', tension: 0.5, fx: ['crease'], what: '' }], keys: [] }, false).plan.shots;
  assert.equal(quick.find((s) => (s.lines as { cue: string }[]).some((l) => l.cue === 'c0'))!.lines.length, 2);
  // no transition that greys or bares the frame
  for (const lv of [0, 1, 2]) for (const t of ['slideover', 'parallax', 'cardflip', 'stack', 'cube']) assert.ok(!composeTransitions(lv as 0).includes(t), `${t} stays out`);
}
// the three finish corrections
{
  assert.ok(isFlood('#E94F37') && !isFlood('#E8EDF1') && !isFlood('#EFE6D5') && !isFlood('#1B1B1E'), 'only a strong ground is a flood');
  for (const fx of ['rain', 'flow', 'synth', 'dots', 'motes']) assert.ok(maskedByLine(fx), `${fx} stops at the words`);
  assert.ok(!maskedByLine('deckle'), 'a ground that keeps off them has no need');
}
console.log('exits ok');

// one-click reroll: a number gives another version, the same one every time; no number is the song's own plan
{
  const { composePlan: compose, rerollPalette, PALETTES: pals, fallbackParts: parts } = await import('../../src/app/lyric-vj/lineplan-core');
  const lines = ['我走過那條路', '風吹過你的臉', '天亮了我還在等', '夜裡的光慢慢熄滅', '我們說好不回頭', '你的名字還在這裡', '再見了那年的夏天', '雨下得好大好大', '從此不再想起你', '心裡的話沒有說完'];
  const cues = lines.flatMap((text, i) => [{ id: `c${i * 2 + 1}`, start: 10 + i * 8, end: 13.5 + i * 8, text }, { id: `c${i * 2 + 2}`, start: 14 + i * 8, end: 17.5 + i * 8, text: `${text}啊` }]);
  const song = { title: 'reroll test', duration: 100, tempo: 120, beats: Array.from({ length: 200 }, (_, i) => i / 2), cues, sections: [{ start: 0, end: 100, type: 'verse', energy: 0.5 }] };
  const meaning = { palette: 'tea', ground: 'grain', reading: '', parts: parts(cues, song.sections, false), keys: [] };
  const plan = (reroll?: number) => compose(song, meaning, false, { reroll }).plan;
  assert.deepEqual(plan(), compose(song, meaning, false).plan, 'no reroll is the plan as ever');
  assert.deepEqual(plan(3), plan(3), 'a reroll is deterministic');
  const shape = (p: ReturnType<typeof plan>) => p.shots.flatMap((s) => (s.lines as { enter: string; exit: string }[]).map((l) => `${s.lyric.template}/${l.enter}/${l.exit}`));
  const [a, b] = [shape(plan(1)), shape(plan(2))];
  assert.ok(a.filter((x, i) => x !== b[i]).length >= a.length * 0.3, 'two rerolls differ on many lines');
  const fx = (p: ReturnType<typeof plan>) => new Set(p.shots.flatMap((s) => s.cuts.map((c) => c.fx)));
  assert.notDeepEqual(fx(plan(1)), fx(plan(2)), 'two rerolls stand on different grounds');
  assert.equal(rerollPalette('t', 'tea', false), 'tea', 'no reroll keeps the song palette');
  const seen = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => rerollPalette('t', 'tea', false, n));
  assert.equal(new Set(seen).size, Object.keys(pals).length, 'each press takes the next palette');
  assert.ok([1, 2, 3, 4, 5, 6].every((n) => rerollPalette('t', 'frost', true, n) !== 'lacquer' && rerollPalette('t', 'frost', true, n) !== 'sugar'), 'a calm song keeps to the quiet palettes');
  assert.deepEqual(rerollPalette('t', 'tea', false, 2, ['tea', 'moss']), rerollPalette('t', 'tea', false, 4, ['tea', 'moss']), 'a style pool wraps round');
}
