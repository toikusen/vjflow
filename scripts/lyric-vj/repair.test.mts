// npx tsx --test scripts/lyric-vj/repair.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRepair, Frame, namedOf, parseFrames, parseKept, parseRooms, Pic, psnrOutside, scopedEdits, withSrc } from './repair.mts';

// a drawing in the shape the director writes: a helper per prop, a rock painted under the lighthouse
const SRC = [
  "blob(2400,1000,200);A('boat.small',2000,980,.5);",
  "MUL();blob(3600,1035,280);SO();A('lighthouse.white_red',3600,1045,1,{sh:1});",
  "A('bottle.message',1950,1210,.45,{c:1});",
].join('\n');
const KNOWN = ['boat.small', 'lighthouse.white_red', 'bottle.message', 'seagull.standing'];

test('an edit of a named prop and its rock, near its draw, is applied', () => {
  const r = scopedEdits(SRC, [{ find: "MUL();blob(3600,1035,280);SO();A('lighthouse.white_red',3600,1045,1,{sh:1});", replace: "const LX=f.cam.index===14?3300:3600;MUL();blob(LX,1035,280);SO();A('lighthouse.white_red',LX,1045,1,{sh:1});" }], ['lighthouse.white_red'], KNOWN);
  assert.deepEqual(r.errs, []);
  assert.equal(r.applied, 1);
  assert.match(r.src, /blob\(LX,1035,280\);SO\(\);A\('lighthouse.white_red',LX/);
  // the other props' lines are untouched
  assert.equal(r.src.split('\n')[0], SRC.split('\n')[0]);
  assert.equal(r.src.split('\n')[2], SRC.split('\n')[2]);
});

test('an out-of-scope edit is rejected and leaves the code as it was', () => {
  // another prop's draw rewritten in the same stretch of code
  const other = scopedEdits(SRC, [{ find: "A('boat.small',2000,980,.5);", replace: "A('boat.small',2600,980,.5);" }], ['lighthouse.white_red'], KNOWN);
  assert.equal(other.applied, 0);
  assert.equal(other.src, SRC);
  assert.match(other.errs[0], /boat\.small/);
  // a new prop brought in
  const added = scopedEdits(SRC, [{ find: "SO();A('lighthouse.white_red'", replace: "SO();A('seagull.standing',3500,900,.5);A('lighthouse.white_red'" }], ['lighthouse.white_red'], KNOWN);
  assert.equal(added.applied, 0);
  assert.match(added.errs[0], /seagull\.standing/);
  // an edit far from every named prop (a rewrite of the scene elsewhere in the code)
  const far = `function day(){paintSea();}\nfunction night(){${SRC}}`;
  const away = scopedEdits(far, [{ find: 'paintSea();', replace: 'paintNewScene();' }], ['lighthouse.white_red'], KNOWN);
  assert.equal(away.applied, 0);
  assert.match(away.errs[0], /超出這一輪能改的範圍/);
  // the named prop dropped instead of moved
  const gone = scopedEdits(SRC, [{ find: "A('lighthouse.white_red',3600,1045,1,{sh:1});", replace: '' }], ['lighthouse.white_red'], KNOWN);
  assert.equal(gone.applied, 0);
});

// the shape of 世界のつづき's drawing: a registry of every prop, one helper that draws them all, a scene that calls it
const SCENE = [
  "const DIM={'boat.small':[516,359],'lighthouse.white_red':[376,727]};",
  'function A(id,x,y,s){const d=DIM[id];ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.drawImage(f.img(id),-d[0]/2,-d[1],d[0],d[1]);ctx.restore()}',
  'function night(){',
  "  drawAt(2000,980,'boat.small');",
  "  A('boat.small',2000,980,.5);",
  "  MUL();blob(3600,1035,280);SO();A('lighthouse.white_red',3600,1045,1);",
  '}',
  'function day(){paintSea();}',
].join('\n');
const ONE = ['lighthouse.white_red'];

test('scope: anchors come from the code as it was, so an edit cannot plant an id to reach further', () => {
  // the first edit, in scope, plants the lighthouse's id in a comment; the second reaches for day() through it
  const r = scopedEdits(SCENE, [
    { find: "MUL();blob(3600,1035,280);", replace: "MUL();blob(3600,1035,280);/*'lighthouse.white_red'*/" },
    { find: 'function day(){paintSea();}', replace: "function day(){/*'lighthouse.white_red'*/paintNewScene();}" },
  ], ONE, KNOWN);
  assert.equal(r.applied, 0, r.errs.join('\n'));
  assert.ok(r.errs.some((e) => e.includes('多寫了一次')), r.errs.join('\n'));
  assert.ok(r.errs.some((e) => e.includes('超出這一輪能改的範圍')), r.errs.join('\n'));
  assert.equal(r.src, SCENE);
});

test('scope: the registry naming every prop and the helper drawing them all are not reachable', () => {
  const reg = scopedEdits(SCENE, [{ find: "'lighthouse.white_red':[376,727]", replace: "'lighthouse.white_red':[188,363]" }], ONE, KNOWN);
  assert.equal(reg.applied, 0);
  const helper = scopedEdits(SCENE, [{ find: 'ctx.scale(s,s);ctx.drawImage', replace: 'ctx.scale(s*.5,s*.5);ctx.drawImage' }], ONE, KNOWN);
  assert.equal(helper.applied, 0);
  assert.equal(helper.src, SCENE);
});

test("scope: another prop's whole statement is fenced off, a wrapper passing its id included", () => {
  // a wrapper call naming the boat, its arguments changed
  const wrap = scopedEdits(SCENE, [{ find: "drawAt(2000,980,'boat.small');", replace: "drawAt(2600,980,'boat.small');" }], ONE, KNOWN);
  assert.equal(wrap.applied, 0);
  assert.match(wrap.errs[0], /boat\.small/);
  // a transform slipped in front of the boat's draw, its own text kept verbatim
  const before = scopedEdits(SCENE, [{ find: "A('boat.small',2000,980,.5);", replace: "ctx.translate(600,0);A('boat.small',2000,980,.5);" }], ONE, KNOWN);
  assert.equal(before.applied, 0);
  assert.match(before.errs[0], /boat\.small/);
  // the lighthouse and its rock, in the same block: applied
  const ok = scopedEdits(SCENE, [{ find: "MUL();blob(3600,1035,280);SO();A('lighthouse.white_red',3600,1045,1);", replace: "ctx.save();if(f.cam.index===14){ctx.translate(3600,1045);ctx.scale(.5,.5);ctx.translate(-3600,-1045)}MUL();blob(3600,1035,280);SO();A('lighthouse.white_red',3600,1045,1);ctx.restore();" }], ONE, KNOWN);
  assert.deepEqual(ok.errs, []);
  assert.equal(ok.applied, 1);
});

test('scope: only accepted edits count toward the size cap', () => {
  const big = `${'x'.repeat(3990)}`;
  const r = scopedEdits(SCENE, [
    { find: 'function day(){paintSea();}', replace: `function day(){${big}}` },
    { find: 'MUL();blob(3600,1035,280);', replace: 'MUL();blob(3300,1035,280);' },
  ], ONE, KNOWN);
  assert.equal(r.applied, 1, r.errs.join('\n'));
  assert.match(r.src, /blob\(3300/);
});

test('only the drawing changes in the treatment', () => {
  const t = { graphics: { sections: [{ layers: [{ kind: 'fill' }, { kind: 'code', src: 'a', cuts: [1, 2], shift: 3 }] }, { layers: [{ kind: 'code', src: 'b' }] }] }, shots: [{ id: 's1' }] };
  const u = withSrc(t, 'a', 'c');
  assert.deepEqual(u.graphics.sections[0].layers[1], { kind: 'code', src: 'c', cuts: [1, 2], shift: 3 });
  assert.deepEqual(u.graphics.sections[1].layers[0], { kind: 'code', src: 'b' });
  assert.deepEqual(u.shots, t.shots);
  assert.equal((t.graphics.sections[0].layers[1] as { src: string }).src, 'a');
});

test('the render logs are read at the asked times only, with the kept-clear mark', () => {
  const log = [
    '  frame 30/600 (3s)code layer: lyric kept clear: lighthouse.white_red 12% inside the lyric box, cut out and faded at 84.3 s (shot 14)',
    'code layer: lyric kept clear: bottle.message 100% inside the lyric box, faded at 81.2 s (shot 13)',
    'code layer: track 84.250 14 lighthouse.white_red:897,732,197,360,1.00,b700/1040/1300/1180/3,k;bottle.message:-925,1171,330,328,1.00',
    'code layer: track 140.595 24 seagull.standing:1,2,3,4,1.00',
    'code layer: room 14 {"from":81.32,"to":88.52,"lines":[{"from":81.02,"to":88.48,"x0":84,"y0":300,"x1":1687,"y1":760}],"rooms":[{"x0":0,"y0":800,"x1":1920,"y1":1080}]}',
  ].join('\n');
  assert.deepEqual(parseKept(log).map((k) => [k.id, k.shot, k.t, k.cut]), [['lighthouse.white_red', 14, 84.3, true], ['bottle.message', 13, 81.2, false]]);
  assert.deepEqual(namedOf(parseKept(log), 82, 88).map((n) => [n.id, n.shots]), [['lighthouse.white_red', [14]]]);
  const f = parseFrames(log, [84.25]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].drawn.map((d) => [d.id, d.kept, d.base]), [['lighthouse.white_red', true, { x0: 700, y0: 1040, x1: 1300, y1: 1180 }], ['bottle.message', false, undefined]]);
  assert.equal(f[0].drawn[0].baseN, 3);
  assert.deepEqual(parseRooms(log).get(14)?.rooms, [{ x0: 0, y0: 800, x1: 1920, y1: 1080 }]);
});

// ---- rendered checks, on small synthetic pictures (picture px = frame px / 10)
const W = 192;
const H = 108;
const SEA = [90, 120, 150];
const ROCK = [140, 100, 70];
const TOWER = [230, 230, 230];
const BOAT = [200, 60, 40];
/** A sea with a lighthouse (box in frame px) on a rock, and a boat at bx. */
function picture(lh: { x: number; y: number; w: number; h: number } | undefined, rockAt: { x: number; y: number; w: number } | undefined, bx = 300): Pic {
  const px = new Uint8Array(W * H * 3);
  const put = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = Math.max(0, Math.floor(y0 / 10)); y < Math.min(H, Math.ceil(y1 / 10)); y++)
      for (let x = Math.max(0, Math.floor(x0 / 10)); x < Math.min(W, Math.ceil(x1 / 10)); x++) px.set(c, (y * W + x) * 3);
  };
  put(0, 0, 1920, 1080, SEA);
  if (rockAt) put(rockAt.x - rockAt.w / 2, rockAt.y - 0.15 * rockAt.w, rockAt.x + rockAt.w / 2, rockAt.y + 0.15 * rockAt.w, ROCK);
  if (lh) put(lh.x, lh.y, lh.x + lh.w, lh.y + lh.h, TOWER);
  put(bx, 900, bx + 120, 960, BOAT);
  return { w: W, h: H, px };
}
const LH = { x: 1300, y: 300, w: 200, h: 600 };
type Rock = { x: number; y: number; w: number };
/**
 * What the renderer logs under the lighthouse's foot: the rock (three paints: two washes and an outline) and its shadow
 * when the rock is under it, the shadow alone when it is not.
 */
const rockBox = (r: Rock) => ({ x0: r.x - r.w / 2, y0: r.y - 0.15 * r.w, x1: r.x + r.w / 2, y1: r.y + 0.15 * r.w });
const frame = (t: number, shot: number, lh: typeof LH | undefined, kept: boolean, bx = 300, rock?: Rock): Frame => ({ t, shot, drawn: [...(lh ? [{ id: 'lighthouse.white_red', ...lh, a: 1, kept, ...(rock ? { base: rockBox(rock), baseN: 4 } : { base: { x0: lh.x, y0: lh.y + lh.h - 10, x1: lh.x + lh.w, y1: lh.y + lh.h + 10 }, baseN: 1 }) }] : []), { id: 'boat.small', x: bx, y: 900, w: 120, h: 60, a: 1, kept: false }] });
const named = [{ id: 'lighthouse.white_red', shots: [14], times: [84.3] }];
// the old drawing: shot 13 (untouched) and shot 14, where the tower runs up through the line
const ROCK0 = { x: 1400, y: 900, w: 400 };
const before = (t: number, shot: number) => ({ before: frame(t, shot, LH, shot === 14, 300, ROCK0), a: picture(LH, ROCK0) });

test('a lighthouse moved and shrunk with its rock passes, its draws no longer kept clear', () => {
  const moved = { x: 1500, y: 700, w: 100, h: 300 };
  // (the rock scaled with it: half as wide, round its new foot as it was round the old one)
  const rock = { x: 1550, y: 1000, w: 200 };
  const r = checkRepair([
    { ...before(80, 13), after: frame(80, 13, LH, false, 300, ROCK0), b: picture(LH, ROCK0) },
    { ...before(84.3, 14), after: frame(84.3, 14, moved, false, 300, rock), b: picture(moved, rock) },
    // the same prop kept clear in a shot it was not named for: not this repair's, not counted
    { before: frame(205.3, 35, LH, true, 300, ROCK0), a: picture(LH, ROCK0), after: frame(205.3, 35, LH, true, 300, ROCK0), b: picture(LH, ROCK0) },
  ], named, 0.1);
  assert.deepEqual(r.errs, []);
  assert.equal(r.keptBefore, 1);
  assert.equal(r.kept, 0);
  assert.equal(r.unseen, 0);
});

test('the base must follow its sprite: a lighthouse moved off its rock is rejected', () => {
  const moved = { x: 1500, y: 700, w: 100, h: 300 };
  // only its own shadow under its new foot: the rock stayed behind
  const r = checkRepair([{ ...before(84.3, 14), after: frame(84.3, 14, moved, false), b: picture(moved, ROCK0) }], named, 0.1);
  assert.ok(r.errs.some((e) => e.includes('離開了它站的地方')), r.errs.join('\n'));
  // shrunk on its foot while the rock kept its size: still standing on all of its rock
  const small = { x: 1350, y: 600, w: 100, h: 300 };
  const s = checkRepair([{ ...before(84.3, 14), after: frame(84.3, 14, small, false, 300, ROCK0), b: picture(small, ROCK0) }], named, 0.1);
  assert.deepEqual(s.errs, []);
});

test('a base paint lost at one sample of a shot (a ripple the drawing skips near a line) is not a prop off its base', () => {
  const moved = { x: 1500, y: 700, w: 100, h: 300 };
  const rock = { x: 1550, y: 1000, w: 200 };
  const at = (t: number, withRock: boolean) => ({ before: frame(t, 14, LH, false, 300, ROCK0), a: picture(LH, ROCK0), after: frame(t, 14, moved, false, 300, withRock ? rock : undefined), b: picture(moved, withRock ? rock : undefined) });
  const once = checkRepair([at(84, true), at(84.25, false), ...[84.5, 84.75, 85, 85.25, 85.5, 85.75, 86, 86.25].map((t) => at(t, true))], named, 0.1);
  assert.ok(!once.errs.some((e) => e.includes('離開了它站的地方')), once.errs.join('\n'));
  const often = checkRepair([at(84, false), at(84.25, false), at(84.5, false), ...[84.75, 85, 85.25, 85.5, 85.75, 86, 86.25].map((t) => at(t, true))], named, 0.1);
  assert.ok(often.errs.some((e) => e.includes('離開了它站的地方')), often.errs.join('\n'));
});

test('a repair that changes anything else is rejected', () => {
  // another prop moved
  const boat = checkRepair([{ ...before(84.3, 14), after: frame(84.3, 14, LH, false, 600, ROCK0), b: picture(LH, ROCK0, 600) }], named, 0.1);
  assert.ok(boat.errs.some((e) => e.includes('boat.small')), boat.errs.join('\n'));
  // a shot without a named prop redrawn (a new sea colour)
  const sea = picture(LH, { x: 1400, y: 900, w: 400 });
  for (let i = 0; i < sea.px.length; i += 3) if (sea.px[i] === SEA[0]) sea.px[i] = 40;
  const redrawn = checkRepair([{ ...before(80, 13), after: frame(80, 13, LH, false, 300, ROCK0), b: sea }], named, 0.1);
  assert.ok(redrawn.errs.some((e) => e.includes('畫面卻變了')), redrawn.errs.join('\n'));
  // the named prop taken off the frame, and the named prop gone from its shot
  const off = { x: 1800, y: 700, w: 200, h: 300 };
  const out = checkRepair([{ before: frame(84.3, 14, LH, false, 300, ROCK0), a: picture(LH, ROCK0), after: frame(84.3, 14, off, false, 300, { x: 1900, y: 1000, w: 400 }), b: picture(off, { x: 1900, y: 1000, w: 400 }) }], named, 0.1);
  assert.ok(out.errs.some((e) => e.includes('移出畫面')), out.errs.join('\n'));
  const gone = checkRepair([{ ...before(84.3, 14), after: frame(84.3, 14, undefined, false), b: picture(undefined, { x: 1400, y: 900, w: 400 }) }], named, 0.1);
  assert.ok(gone.errs.some((e) => e.includes('不見了')), gone.errs.join('\n'));
});

test('a prop retiring off the frame while it is faded out or was kept clear there is not taken off the frame', () => {
  const off = { x: 1800, y: 700, w: 200, h: 300 };
  const faded: Frame = { t: 84.3, shot: 14, drawn: [{ id: 'lighthouse.white_red', ...off, a: 0, kept: false, base: rockBox({ x: 1900, y: 1000, w: 400 }), baseN: 4 }, { id: 'boat.small', x: 300, y: 900, w: 120, h: 60, a: 1, kept: false }] };
  // faded to nothing on its way out
  const r = checkRepair([{ before: frame(84.3, 14, LH, false, 300, ROCK0), a: picture(LH, ROCK0), after: faded, b: picture(undefined, { x: 1900, y: 1000, w: 400 }) }], named, 0.1);
  assert.ok(!r.errs.some((e) => e.includes('移出畫面')), r.errs.join('\n'));
  // at a sample where the old drawing had it cut out of the line anyway
  const cut = checkRepair([{ ...before(84.3, 14), after: frame(84.3, 14, off, false, 300, { x: 1900, y: 1000, w: 400 }), b: picture(off, { x: 1900, y: 1000, w: 400 }) }], named, 0.1);
  assert.ok(!cut.errs.some((e) => e.includes('移出畫面')), cut.errs.join('\n'));
  // (shot 13's sample was not kept clear before: leaving the frame there is still a fault)
  const r13 = checkRepair([{ before: frame(80, 14, LH, false, 300, ROCK0), a: picture(LH, ROCK0), after: frame(80, 14, off, false, 300, { x: 1900, y: 1000, w: 400 }), b: picture(off, { x: 1900, y: 1000, w: 400 }) }], named, 0.1);
  assert.ok(r13.errs.some((e) => e.includes('移出畫面')), r13.errs.join('\n'));
});

test('a sample without its pictures fails the repair instead of passing unseen', () => {
  const r = checkRepair([{ ...before(80, 13), after: frame(80, 13, LH, false, 300, ROCK0) }], named, 0.1);
  assert.ok(r.errs.some((e) => e.includes('沒有畫面')), r.errs.join('\n'));
});

test('psnr measures what it says', () => {
  const p = picture(LH, { x: 1400, y: 900, w: 400 });
  assert.equal(psnrOutside(p, p), Infinity);
  const q = picture({ ...LH, x: 1000 }, { x: 1100, y: 900, w: 400 });
  assert.ok(psnrOutside(p, q) < 30);
  // outside both places the pictures are the same
  assert.equal(psnrOutside(p, q, [{ x0: 70, y0: 0, x1: 192, y1: 108 }]), Infinity);
});
