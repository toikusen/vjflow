// Layouts that give a line a reading space of its own shape: a page with a main column and an aside, a turned corner, two
// phrases crossing on a word, a note, manuscript cells, a block weighed against one solid, a route through panels.
// Every one of them finishes its moves before reading starts. The sums are in line-space.ts.
import * as THREE from 'three';
import { balancedRows } from '../phrases';
import { fitRows, rowTargets } from './build-rows';
import { evenPad, frameBox, noteBox, noteFold, paperPose, Pt } from './carrier-shape';
import { balancePoint, balanceTilt, boxAngle, boxTurn, displayLevel, divePose, feedLeft, feedShift } from './line-exit';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, hash, makeGlyphs, placeRow, sizeCap } from './glyphs';
import { tint } from './layouts';
import { cellBars, cellRow, cornerOf, counterweight, crossingOf, ellipsePoints, panelOutline, pageColumns, phraseSpans, twoParts } from './line-space';
import { buildCarrier, landOf, motionOf, outlineMesh, placeOf, poseSheet, rectMesh, seedOf, shadowMesh, stockOf, tileScatter } from './lyric-carrier';
import { insetOutline, mixHex } from './material';
import { grainOf } from './text-fx';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, readable, settledAt, songVary, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const STEP = 0.02;

const widthOf = (s: string, st: GlyphStyle) => [...s].reduce((a, c) => a + advanceOf(c, st), 0);
const rt2 = (rt: CueRuntime, delay: number): CueRuntime => ({ ...rt, showFrom: rt.showFrom + delay * rt.pace });

/** Sets glyphs where they stand this frame: their own place plus the line's entrance and exit. */
function moveGlyphs(gs: Glyph[], rt: CueRuntime, t: number, n = gs.length) {
  gs.forEach((g) => {
    const m = glyphMotion(rt, g, n, t, STEP);
    g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
    g.mesh.scale.setScalar(m.scale);
    g.mesh.rotation.z = m.rot;
    g.mesh.material.opacity = m.opacity;
  });
}

const addAll = (group: THREE.Group, gs: Glyph[]) => gs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));

/** Rows set left aligned from (x, top), y falling; the block's size. */
function leftRows(rows: string[], st: GlyphStyle, tone: THREE.Color, x: number, top: number, leading = 1.14) {
  const made = rows.map((r, k) => {
    const gs = makeGlyphs(r, st, tone);
    placeRow(gs, 0, 0);
    const left = Math.min(...gs.map((g) => g.x - g.advance / 2));
    gs.forEach((g) => {
      g.x += x - left;
      g.y += top - st.size * leading * (k + 0.5);
    });
    return gs;
  });
  return made.flat();
}

const rowsFor = (text: string, st: GlyphStyle, width: number) => {
  for (let n = 1; n < 4; n++) {
    const rows = balancedRows(text, n).filter(Boolean);
    if (Math.max(...rows.map((r) => widthOf(r, st))) <= width) return rows;
  }
  return balancedRows(text, 3).filter(Boolean);
};

const blockW = (rows: string[], st: GlyphStyle) => Math.max(...rows.map((r) => widthOf(r, st)));

/** A main column and a smaller aside at their own widths, in the order they are sung; the break is the line's own. */
export const editorial: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const parts = twoParts(text) ?? { at: [...text].length, head: text.trim(), tail: '' };
    const key = [...text].findIndex((_, i) => emphasisOf(rt, i));
    const firstIsMain = !parts.tail || (key >= 0 ? key < parts.at : [...parts.head].length >= [...parts.tail].length);
    const [main, aside] = firstIsMain ? [parts.head, parts.tail] : [parts.tail, parts.head];
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const mainRows = [...main].length > 7 ? balancedRows(main, 2).filter(Boolean) : [main];
    const size = Math.round(Math.min(236 * sizeCap, (W * 0.66 * 200) / blockW(mainRows, probe)));
    const mainSt: GlyphStyle = { family, weight: 900, size };
    // an aside is still lyric: never under a size that reads on video
    const asideSt: GlyphStyle = { family, weight: 700, size: Math.round(Math.max(76, Math.min(112, size * songVary(rt, 'page.aside', 0.4, 0.52)))) };
    const asideRows = aside ? rowsFor(aside, asideSt, W * 0.36) : [];
    const [mainW, mainH] = [blockW(mainRows, mainSt), mainRows.length * size * 1.14];
    const [asideW, asideH] = aside ? [blockW(asideRows, asideSt), asideRows.length * asideSt.size * 1.22] : [0, 0];
    const side = rt.params['side'] === 'right' ? 1 : -1;
    const at = firstIsMain ? pageColumns(mainW, mainH, asideW, asideH, true, side) : pageColumns(asideW, asideH, mainW, mainH, false, side);
    const [mainAt, asideAt] = firstIsMain ? [at.first, at.second] : [at.second, at.first];
    const ink = color(rt.palette.text, 1);
    const big = leftRows(mainRows, mainSt, ink, mainAt.x, mainAt.y);
    const small = aside ? leftRows(asideRows, asideSt, ink, asideAt.x, asideAt.y, 1.22) : [];
    tagSource(big, text, firstIsMain ? 0 : parts.at);
    tagSource(small, text, firstIsMain ? parts.at : 0);
    const group = new THREE.Group();
    addAll(group, big);
    addAll(group, small);
    tint(rt, [...big, ...small]);
    const rule = rectMesh(-2, -asideH / 2, 2, asideH / 2, color(readable(rt.palette.accent, rt.palette.background, 3), 1));
    rule.position.set(side > 0 ? asideAt.x + asideW + 26 : asideAt.x - 26, asideAt.y - asideH / 2, 0);
    rule.visible = !!aside;
    rule.userData['decor'] = true;
    group.add(rule);
    const [first, second] = firstIsMain ? [big, small] : [small, big];
    const late = rt2(rt, 0.2);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        moveGlyphs(first, rt, t);
        moveGlyphs(second, late, t);
        rule.material.opacity = (second.length ? second : first)[0]?.mesh.material.opacity ?? 0;
      },
      readable: () => [Math.max(settledAt(rt, first.length, STEP), settledAt(late, second.length || 1, STEP)), rt.exitAt],
    };
  },
};

/** Two phrases turning one corner, across and then down or down and then across, both inside the frame's inset. */
export const cornerAnchor: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const parts = cornerOf(text) ?? { ...(twoParts(text) ?? { at: 1, head: text.slice(0, 1), tail: text.slice(1) }), across: 'head' as const };
    const acrossFirst = parts.across === 'head';
    const [a, d] = acrossFirst ? [[...parts.head], [...parts.tail]] : [[...parts.tail], [...parts.head]];
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const aw = widthOf(a.join(''), probe) / 200;
    const size = Math.round(Math.min(190 * sizeCap, (W * 0.8) / (aw + 0.2), (H * 0.8) / ((d.length + 1) * 1.08)));
    const st: GlyphStyle = { family, weight: 900, size, even: true, kanaScale: 1 };
    const across = makeGlyphs(a.join(''), st, color(rt.palette.text, 1));
    placeRow(across, 0, 0);
    const width = aw * size;
    const down = makeGlyphs(d.join(''), st, color(rt.palette.text, 1));
    const height = d.length * size * 1.08;
    const lead = songVary(rt, 'corner.lead', 1.08, 1.22);
    const [totalW, totalH] = [width, height + size * lead];
    const seat = (acrossFirst: boolean) => {
      // the row and the column meet at the end one reads into: top right when the row comes first, bottom left when the column does
      const [left, top] = [-totalW / 2, totalH / 2];
      const rowY = acrossFirst ? top - size / 2 : top - totalH + size / 2;
      across.forEach((g) => {
        g.x += left + width / 2;
        g.y += rowY;
      });
      const colX = acrossFirst ? across.at(-1)!.x : across[0].x;
      down.forEach((g, i) => {
        g.x = colX;
        g.y = acrossFirst ? top - size * lead - size * 1.08 * (i + 0.5) : top - size * 1.08 * (i + 0.5);
      });
    };
    seat(acrossFirst);
    const [firstGs, secondGs] = acrossFirst ? [across, down] : [down, across];
    const key = tagSource(firstGs, text);
    tagSource(secondGs, text, key);
    const group = new THREE.Group();
    addAll(group, firstGs);
    addAll(group, secondGs);
    tint(rt, [...firstGs, ...secondGs]);
    const late = rt2(rt, 0.22);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        moveGlyphs(firstGs, rt, t);
        moveGlyphs(secondGs, late, t);
      },
      readable: () => [settledAt(late, secondGs.length, STEP), rt.exitAt],
    };
  },
};

/** Two phrases crossing on a word they share: that word is set once, with air round it, and read in both directions. */
export const crossAnchor: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const c = crossingOf(text);
    if (!c) return cornerAnchor.cue(rt);
    const [h, v] = [[...c.head], [...c.tail]];
    const AIR = songVary(rt, 'cross.air', 0.15, 0.3);
    const size = Math.round(Math.min(186 * sizeCap, (W * 0.8) / ((h.length + AIR * 2) * 1.04), (H * 0.8) / ((v.length + AIR * 2) * 1.04)));
    const st: GlyphStyle = { family, weight: 900, size, even: true, kanaScale: 1 };
    const cell = size * 1.04;
    const ink = color(rt.palette.text, 1);
    const across = makeGlyphs(c.head, st, ink);
    const away = (i: number, at: number) => (i - at) * cell + Math.sign(i - at) * AIR * cell;
    across.forEach((g, i) => {
      g.x = away(i, c.i);
      g.y = 0;
    });
    const column = v.flatMap((ch, j) => (j === c.j ? [] : makeGlyphs(ch, st, ink).map((g) => ({ g, j }))));
    column.forEach(({ g, j }) => {
      g.x = 0;
      g.y = -away(j, c.j);
    });
    const down = column.map((x) => x.g);
    const all = [...across, ...down];
    const [x0, x1] = [Math.min(...all.map((g) => g.x)), Math.max(...all.map((g) => g.x))];
    const [y0, y1] = [Math.min(...all.map((g) => g.y)), Math.max(...all.map((g) => g.y))];
    all.forEach((g) => {
      g.x -= (x0 + x1) / 2;
      g.y -= (y0 + y1) / 2;
    });
    tagSource(across, text);
    const tailAt = c.at + [...text].slice(c.at).findIndex((x) => !/\s/.test(x));
    column.forEach(({ g, j }) => (g.src = tailAt + j));
    const group = new THREE.Group();
    addAll(group, across);
    addAll(group, down);
    tint(rt, all);
    across[c.i].mesh.material.color.copy(color(readable(rt.palette.accent, rt.palette.background, 7), 1));
    const late = rt2(rt, 0.22);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        moveGlyphs(across, rt, t);
        moveGlyphs(down, late, t);
      },
      readable: () => [settledAt(late, down.length, STEP), rt.exitAt],
    };
  },
};

/** A loose page with one folded corner and a tab along its top edge, held to the words by a single margin rule. */
export const notePanel: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => ({ ...evenPad(s), left: s * 0.86, top: s * 0.46 }), shape: (w, h, s, size) => noteBox(w, h, s, size, songVary(rt, 'note.fold', 0.8, 1.3)), stock: 'pale', height: 0.66, above: 0.3, rules: (z, rowH, n) => Array.from({ length: n + 1 }, (_, i) => [z.x0 - 60, z.y1 - i * rowH, z.x1 + 60, z.y1 - i * rowH] as [number, number, number, number]) });
    const group = new THREE.Group();
    group.add(c.sheet);
    const place = placeOf(rt, c.box.w, c.box.h, 0.5);
    const land = rt.rushed ? 0.02 : 0.34 * rt.pace;
    const motion = motionOf(rt, land);
    const accent = readable(rt.palette.accent, c.face, 3);
    const [bw, bh] = [c.box.w / 2, c.box.h / 2];
    const margin = rectMesh(c.zone.x0 - c.size * 0.3 - 1, -bh, c.zone.x0 - c.size * 0.3 + 1, bh - 2, accent);
    margin.renderOrder = -4;
    c.adopt(margin);
    const tabW = Math.min(c.box.w * songVary(rt, 'note.tab', 0.16, 0.3), 260);
    const tabX = -c.box.side * (bw - tabW * 0.8);
    const tab = rectMesh(tabX - tabW / 2, bh - 2, tabX + tabW / 2, bh + Math.max(22, c.size * 0.24), accent, 'fibre');
    tab.renderOrder = -6;
    tab.userData['decor'] = true;
    c.adopt(tab);
    const f = noteFold(c.size) * songVary(rt, 'note.fold', 0.8, 1.3);
    const [px, py] = c.box.pivot;
    const flapAt = [[px, py], [px + c.box.side * f, py], [px, py + f]] as Pt[];
    const flap = outlineMesh(flapAt, mixHex(c.face, rt.palette.text, 0.16), 'fibre');
    const flapShade = shadowMesh(flapAt, 7);
    flapShade.renderOrder = -4;
    flapShade.userData['decor'] = true;
    c.adopt(flapShade);
    flap.renderOrder = -3;
    c.adopt(flap);
    const scatter = tileScatter(c, rt);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const p = paperPose(t, motion, c.box.side);
        poseSheet(c, place.x, place.y, p);
        c.fade(p.alpha);
        scatter(t);
        for (const m of [flap, flapShade, margin, tab]) m.visible = t <= rt.exitAt || rt.style.exit !== 'tile-scatter';
        if (p.open >= 1) c.unmask();
        else if (c.box.side > 0) c.window(bw - c.box.w * p.open, 1e5);
        else c.window(-1e5, -bw + c.box.w * p.open);
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** A mesh of many flat bars, drawn as one. */
function barsMesh(bars: [number, number, number, number][], tint_: THREE.Color) {
  const pos = new Float32Array(bars.length * 18);
  bars.forEach(([x0, y0, x1, y1], i) => pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], i * 18));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: tint_, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  m.renderOrder = -2;
  m.userData['decor'] = true;
  return m;
}

/** Whole characters set down phrase by phrase into squares that never close, a wide gutter between phrases. */
export const phraseGrid: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const cs = [...text];
    const spans = phraseSpans(text, 4);
    const cellsOf = ([a, b]: [number, number]) => cs.slice(a, b).flatMap((c, i) => (/\s/.test(c) ? [] : [{ ch: c, src: a + i }]));
    const phrases = spans.map(cellsOf);
    // a short line in one row; else a row a phrase, set from one left edge like a written page
    const total = phrases.reduce((a, p) => a + p.length, 0);
    const rows = total <= 6 || phrases.length < 2 ? [phrases] : phrases.map((p) => [p]);
    const across = Math.max(...rows.map((r) => r.reduce((a, p) => a + p.length, 0) + (r.length - 1) * 0.55));
    const cell = Math.round(Math.min(210 * sizeCap, (W * 0.82) / across, (H * 0.74) / rows.length));
    const st: GlyphStyle = { family, weight: 900, size: Math.round(cell * 0.72), even: true, kanaScale: 1 };
    const group = new THREE.Group();
    const bars: [number, number, number, number][] = [];
    const barW = songVary(rt, 'grid.bar', 2.4, 5);
    const groups: { gs: Glyph[]; rt: CueRuntime }[] = [];
    rows.forEach((row, k) => {
      const count = row.reduce((a, p) => a + p.length, 0);
      const inset = (((across - count) * cell) / 2) * (rows.length > 1 ? -1 : 0);
      const xs = cellRow(row.map((p) => p.length), cell).map((x) => x + inset);
      const y = ((rows.length - 1) / 2 - k) * cell * 1.1;
      let at = 0;
      row.forEach((p) => {
        const gs = p.flatMap(({ ch, src }) => {
          const x = xs[at++];
          bars.push(...cellBars(x, y, cell, barW));
          const [g] = makeGlyphs(ch, st, color(rt.palette.text, 1));
          g.x = x;
          g.y = y;
          g.src = src;
          return [g];
        });
        groups.push({ gs, rt: rt2(rt, groups.length * 0.14) });
      });
    });
    const lines = barsMesh(bars, new THREE.Color(rt.palette.text).lerp(new THREE.Color(rt.palette.background), 0.2));
    group.add(lines);
    const all = groups.flatMap((x) => x.gs);
    addAll(group, all);
    tint(rt, all);
    const last = groups.at(-1)!;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        groups.forEach((x) => {
          const m0 = x.gs.length;
          x.gs.forEach((g, i) => (g.index = i));
          moveGlyphs(x.gs, x.rt, t, m0);
        });
        const out = clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        lines.material.opacity = (t < rt.showFrom ? 0 : clamp01((t - rt.showFrom) / 0.12)) * (1 - out);
      },
      readable: () => [settledAt(last.rt, last.gs.length, STEP), rt.exitAt],
    };
  },
};

/** The line's block set off to one side and one flat tilted solid on the other, sized by the block: the two arrive together and hold level. */
export const counterweightLayout: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const st0: GlyphStyle = { family, weight: 900, size: 200 };
    const rows = [...text.trim()].length > 6 ? balancedRows(text, [...text.trim()].length > 13 ? 3 : 2).filter(Boolean) : [text.trim()];
    const size = Math.round(Math.min(230 * sizeCap, (W * 0.52 * 200) / blockW(rows, st0), (H * 0.74) / (rows.length * 1.16)));
    const st: GlyphStyle = { family, weight: 900, size };
    const side = rt.params['side'] === 'right' ? 1 : -1;
    const [bw, bh] = [blockW(rows, st), rows.length * size * 1.16];
    const { blockX, shape } = counterweight(bw, bh, side);
    const gs = leftRows(rows, st, color(rt.palette.text, 1), blockX - bw / 2, bh / 2, 1.16);
    tagSource(gs, text);
    const group = new THREE.Group();
    addAll(group, gs);
    tint(rt, gs);
    const seed = Math.floor(hash(rt.cue.start, 43) * 1000);
    const solid = outlineMesh(ellipsePoints(shape), color(readable(rt.palette.accent, rt.palette.background, 2.4), 1));
    solid.userData['decor'] = true;
    solid.userData['noVeil'] = true;
    solid.renderOrder = -4;
    const holder = new THREE.Group();
    holder.userData['decor'] = true;
    solid.rotation.z = (seed % 2 ? 1 : -1) * 0.22;
    holder.add(solid);
    group.add(holder);
    const land = rt.rushed ? 0.02 : 0.42 * rt.pace;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        moveGlyphs(gs, rt, t);
        const e = easeOutCubic((t - rt.showFrom) / land);
        const out = clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        holder.position.set(shape.x - side * 340 * (1 - e) - side * 200 * out * out, shape.y, 0);
        solid.material.opacity = (t < rt.showFrom ? 0 : clamp01(e * 3)) * (1 - out);
      },
      readable: () => [Math.max(settledAt(rt, gs.length, STEP), rt.showFrom + land), rt.exitAt],
    };
  },
};

/** The line's phrases in a few bowed panels of their own widths: the camera calls at each in turn (a panel-track rig), then rests on the whole page. */
export const panelRoute: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const spans = phraseSpans(text, 3);
    const cs = [...text];
    const words = spans.map(([a, b]) => cs.slice(a, b).join('').trim());
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const widths = words.map((w) => widthOf(w, probe) || 1);
    const keyRow = Math.max(0, spans.findIndex(([a, b]) => cs.slice(a, b).some((_, i) => emphasisOf(rt, a + i))));
    const sizes = fitRows(widths, keyRow, 0.72).map((s) => Math.round(s * 0.86));
    const ys = rowTargets(sizes, words.length).map((y) => y * 1.14);
    const ink = rt.palette.text;
    const onInk = readable(rt.palette.background, ink, 7);
    const group = new THREE.Group();
    const seed = Math.floor(hash(rt.cue.start, 47) * 1000);
    const panels = new THREE.Group();
    panels.userData['decor'] = true;
    group.add(panels);
    const all = words.flatMap((w, k) => {
      const gs = makeGlyphs(w, { family, weight: 900, size: sizes[k] }, color(onInk, 1));
      placeRow(gs, 0, 0);
      const width = gs.reduce((a, g) => a + g.advance, 0);
      const half = sizes[k] * 0.68;
      // no two panels the same width or set the same way
      const off = ((seed + k) % 3 - 1) * W * songVary(rt, 'route.step', 0.018, 0.045);
      const [x0, x1] = [Math.max(-W * 0.46, off - width / 2 - sizes[k] * 0.6), Math.min(W * 0.46, off + width / 2 + sizes[k] * 0.6)];
      const tone = k === keyRow ? new THREE.Color(ink).lerp(new THREE.Color(rt.palette.accent), 0.72) : new THREE.Color(ink);
      const shape = panelOutline(x0, x1, ys[k] - half, ys[k] + half, k === words.length - 1 ? 0 : songVary(rt, 'route.bow', 10, 24)) as Pt[];
      const m = outlineMesh(shape, tone, 'fibre', [], 0, { line: { path: insetOutline(shape, 11), color: rt.palette.background, alpha: 0.3 } });
      m.renderOrder = -5;
      const shade = shadowMesh(shape, 12);
      shade.renderOrder = -6;
      panels.add(shade, m);
      const pick = readable(onInk, `#${tone.getHexString()}`, 4.5);
      gs.forEach((g) => {
        g.x += off;
        g.y += ys[k];
        g.mesh.material.color.copy(color(pick, 1));
        g.mesh.userData['noVeil'] = true;
      });
      tagSource(gs, text, spans[k][0]);
      return gs;
    });
    addAll(group, all);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        moveGlyphs(all, rt, t);
        const a = all[0]?.mesh.material.opacity ?? 0;
        panels.children.forEach((m) => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = a));
      },
      readable: () => [settledAt(rt, all.length, STEP), rt.exitAt],
    };
  },
};

const REST = { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 };

/** A flat, long paper box: the line is on its front, and it turns to face the reader, square for all of the reading. Its end is deeper than it is wide. */
export const turnBox: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => evenPad(s), shape: (w, h) => ({ w, h, outline: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], pivot: [0, 0], side: seed % 2 ? 1 : -1 }), lift: 16, height: 0.6 });
    const group = new THREE.Group();
    group.add(c.sheet);
    const depth = c.box.h * songVary(rt, 'box.depth', 0.5, 1.05);
    // the same sheet round the fold, in shade: the face's own map, so its fibres and grain carry on
    const end = rectMesh(0, -c.box.h / 2, depth, c.box.h / 2, 0xffffff);
    end.material.map = c.paper.material.map;
    end.material.color.setRGB(0.66, 0.62, 0.64);
    end.material.needsUpdate = true;
    const crease = rectMesh(-0.8, -c.box.h / 2, 0.8, c.box.h / 2, mixHex(c.face, '#ffffff', 0.5));
    crease.renderOrder = -3;
    // the end comes round from behind the box: cropped, never squeezed, so its fibres stay the paper's size
    const endX = Array.from(end.geometry.getAttribute('position').array).filter((_, i) => i % 3 === 0);
    end.renderOrder = -4;
    end.userData['decor'] = true;
    const holder = new THREE.Group();
    holder.userData['decor'] = true;
    holder.add(end, crease);
    group.add(holder);
    const place = placeOf(rt, c.box.w, c.box.h);
    const land = landOf(rt, 'box-turn');
    const from = songVary(rt, 'box.turn', 1.02, 1.3) * (seed % 2 ? 1 : -1);
    const turning = rt.style.enter === 'box-turn';
    const out = rt.style.exit === 'box-turn';
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = turning ? (t - rt.showFrom) / land : 1;
        const q = out ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
        const angle = boxAngle(k, q, from);
        const b = boxTurn(angle);
        poseSheet(c, place.x, place.y, REST);
        c.sheet.scale.x = Math.max(0.001, b.face);
        // the box's end shows on the side it is turned from
        const dir = angle > 0 ? 1 : -1;
        holder.visible = angle !== 0;
        holder.position.set(place.x + (dir * c.box.w * b.face) / 2, place.y, 0);
        holder.scale.x = dir;
        const pos = end.geometry.getAttribute('position') as THREE.BufferAttribute;
        const uv = end.geometry.getAttribute('uv') as THREE.BufferAttribute;
        endX.forEach((x, i) => {
          const at = Math.min(x, depth * b.side);
          pos.setX(i, at);
          uv.setX(i, at);
        });
        pos.needsUpdate = uv.needsUpdate = true;
        const fading = t > rt.exitAt && !out ? 1 - clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 1;
        const a = (t < rt.showFrom ? 0 : fading) * (out && q >= 1 ? 0 : 1);
        c.fade(a);
        end.material.opacity = crease.material.opacity = a;
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** One frame of a contact print: the strip runs on to it and locks, with the blank frames above and below showing. */
export const frameFeed: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const notches = Math.round(songVary(rt, 'strip.notches', 3, 6));
    const c = buildCarrier(rt, seed, { pad: (s) => ({ ...evenPad(s), left: s * 0.7, right: s * 0.7 }), shape: (w, h, s) => frameBox(w, h, s, notches), stock: 'ink', height: 0.5, lift: 12 });
    const group = new THREE.Group();
    const strip = new THREE.Group();
    strip.add(c.sheet);
    group.add(strip);
    const gap = songVary(rt, 'strip.gap', 14, 26);
    const tone = mixHex(rt.palette.text, rt.palette.background, 0.14);
    const blanks = [1, -1].map((d) => {
      const m = outlineMesh(c.outline, tone, 'fibre');
      m.position.y = d * (c.box.h + gap);
      m.renderOrder = -5;
      const hold = new THREE.Group();
      hold.userData['decor'] = true;
      hold.add(m);
      strip.add(hold);
      return m;
    });
    const land = landOf(rt, 'frame-advance');
    const out = rt.style.exit === 'frame-advance';
    const x = rt.params['side'] === 'center' ? 0 : placeOf(rt, c.box.w, c.box.h).x;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = rt.style.enter === 'frame-advance' ? (t - rt.showFrom) / land : 1;
        const q = out ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
        strip.position.set(x, feedShift(k, q) * H * 1.15, 0);
        poseSheet(c, 0, 0, REST);
        const fading = t > rt.exitAt && !out ? 1 - clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 1;
        const a = t < rt.showFrom ? 0 : fading;
        c.fade(a);
        blanks.forEach((m) => (m.material.opacity = a));
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

const specks = new Map<string, THREE.CanvasTexture>();
/** Paper grain as loose specks in one ink, to clear off the glass. */
function speckMap(tone: string) {
  const hit = specks.get(tone);
  if (hit) return hit;
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
  const g = cv.getContext('2d')!;
  g.fillStyle = tone;
  for (let i = 0; i < 2600; i++) g.fillRect(hash(i, 3) * 512, hash(i, 5) * 512, 1 + 3 * hash(i, 7), 1 + 2 * hash(i, 9));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  specks.set(tone, t);
  return t;
}

/** A frosted lightbox the camera pushes up to: its grain clears as it comes, and the line is read on the glass. */
export const lightboxEntry: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => ({ ...evenPad(s), top: s * 0.5, bottom: s * 0.5, left: s * 0.7, right: s * 0.7 }), shape: (w, h) => ({ w, h, outline: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], pivot: [0, 0], side: 1 }), stock: 'pale', height: 0.62, lift: 22 });
    const group = new THREE.Group();
    group.add(c.sheet);
    // one speck map repeated at its own size on the glass: the grain stays one size on screen while the box comes up
    const grain = speckMap(stockOf(rt, 'ink').face).clone();
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.needsUpdate = true;
    const noise = new THREE.Mesh(new THREE.PlaneGeometry(c.box.w, c.box.h), new THREE.MeshBasicMaterial({ map: grain, transparent: true, depthTest: false, depthWrite: false }));
    noise.userData['noVeil'] = true;
    noise.userData['decor'] = true;
    noise.renderOrder = -4;
    const veil = new THREE.Group();
    veil.userData['decor'] = true;
    veil.add(noise);
    c.sheet.add(veil);
    const land = landOf(rt, 'frame-dive');
    const place = placeOf(rt, c.box.w, c.box.h);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const p = divePose(rt.style.enter === 'frame-dive' ? (t - rt.showFrom) / land : 1, seed);
        const left = rt.style.exit === 'tile-scatter' ? 1 : 1 - clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        poseSheet(c, place.x + p.x, place.y + p.y, { ...REST, scale: p.scale });
        const a = t < rt.showFrom ? 0 : p.alpha * left;
        c.fade(a);
        noise.material.opacity = a * p.noise;
        grain.repeat.set((c.box.w * p.scale) / 512, (c.box.h * p.scale) / 512);
        noise.visible = p.noise > 0;
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** Two phrases on one soft arc, on a support set off-centre where their widths balance: it tips, swings and comes level before reading. */
export const balanceLine: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const family = rt.fonts.display;
    const p = twoParts(text) ?? { at: Math.ceil([...text].length / 2), head: [...text].slice(0, Math.ceil([...text].length / 2)).join('').trim(), tail: [...text].slice(Math.ceil([...text].length / 2)).join('').trim() };
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const [wa, wb] = [widthOf(p.head, probe) / 200, widthOf(p.tail, probe) / 200];
    const space = songVary(rt, 'balance.gap', 0.6, 1);
    const size = Math.round(Math.min(190 * sizeCap, (W * 0.8) / (wa + wb + space)));
    const st: GlyphStyle = { family, weight: 900, size };
    const [head, tail] = [makeGlyphs(p.head, st, color(rt.palette.text, 1)), makeGlyphs(p.tail, st, color(rt.palette.text, 1))];
    placeRow(head, 0, 0);
    placeRow(tail, 0, 0);
    const [ax, bx] = [-((wa + wb + space) * size) / 2 + (wa * size) / 2, ((wa + wb + space) * size) / 2 - (wb * size) / 2];
    const beamY = -size * 0.62;
    head.forEach((g) => { g.x += ax; });
    tail.forEach((g) => { g.x += bx; });
    tagSource(head, text, 0);
    tagSource(tail, text, p.at);
    const all = [...head, ...tail];
    const beam = new THREE.Group();
    addAll(beam, all);
    tint(rt, all);
    const seed = seedOf(rt);
    const half = (W * 0.8) / 2 + 20;
    const pivot = balancePoint(ax, wa, bx, wb);
    const bow = songVary(rt, 'balance.bow', 16, 34);
    const thick = Math.max(10, size * 0.07);
    const arc = (y: number) => Array.from({ length: 25 }, (_, i) => { const x = -half + (i * half) / 12; return [x, y - bow * (1 - (x / half) ** 2)] as Pt; });
    const outline = [...arc(beamY - thick), ...arc(beamY).reverse()];
    const bar = outlineMesh(outline, mixHex(rt.palette.text, rt.palette.background, 0.08), 'fibre');
    bar.renderOrder = -4;
    const barShade = shadowMesh(outline, 9);
    barShade.renderOrder = -5;
    const under = new THREE.Group();
    under.userData['decor'] = true;
    under.add(barShade, bar);
    beam.add(under);
    const hold = new THREE.Group();
    hold.position.set(pivot, beamY - bow, 0);
    beam.position.set(-pivot, -(beamY - bow), 0);
    hold.add(beam);
    // what it rests on: a small card folded into a wedge, one face to the light, on a short ruled ground
    const [sw, sh] = [size * songVary(rt, 'balance.foot', 0.15, 0.22), size * 0.36];
    const lean = (seed % 2 ? 1 : -1) * sw * 0.28;
    const apex: Pt = [0, 0];
    const lit = outlineMesh([apex, [-sw, -sh], [lean, -sh]], mixHex(rt.palette.text, rt.palette.background, 0.34), 'fibre');
    const dim = outlineMesh([apex, [lean, -sh], [sw, -sh]], mixHex(rt.palette.text, rt.palette.background, 0.08), 'fibre');
    const foot = shadowMesh([apex, [-sw, -sh], [sw, -sh]], 7);
    lit.renderOrder = dim.renderOrder = -6;
    foot.renderOrder = -7;
    const line = rectMesh(-sw * 2.4, -sh - 1, sw * 2.8, -sh + 0.6, mixHex(rt.palette.background, rt.palette.text, 0.6));
    line.renderOrder = -6;
    const stand = new THREE.Group();
    stand.userData['decor'] = true;
    stand.position.set(pivot, beamY - bow - thick + 2, 0);
    stand.add(foot, lit, dim, line);
    const group = new THREE.Group();
    group.add(stand, hold);
    const land = landOf(rt, 'balance-seat');
    const heavy = wa >= wb ? 1 : -1;
    const reach = songVary(rt, 'balance.reach', 0.8, 1.25);
    const parts = [bar, barShade, foot, lit, dim, line];
    return {
      group,
      update(t: number, _fx: FrameFx) {
        hold.rotation.z = rt.style.enter === 'balance-seat' ? balanceTilt((t - rt.showFrom) / land, heavy, reach) : 0;
        const a = t < rt.showFrom ? 0 : 1 - clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        all.forEach((g) => {
          g.mesh.position.set(g.x, g.y, 0);
          g.mesh.material.opacity = a;
        });
        parts.forEach((m) => (m.material.opacity = a));
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

const panelDots = new Map<string, THREE.CanvasTexture>();
/** A display's unlit points, one tile. */
function panelMap(tone: string) {
  const hit = panelDots.get(tone);
  if (hit) return hit;
  const cv = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
  const g = cv.getContext('2d')!;
  g.fillStyle = tone;
  g.beginPath();
  g.arc(16, 16, 5.5, 0, Math.PI * 2);
  g.fill();
  // an unlit point has soaked along the paper too
  g.strokeStyle = tone;
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 2.27;
    g.beginPath();
    g.moveTo(16, 16);
    g.lineTo(16 + Math.cos(a) * (9 + (i % 3) * 2.4), 16 + Math.sin(a) * (9 + (i % 3) * 2.4));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  panelDots.set(tone, t);
  return t;
}

/** A dark band with wide-set warm points: the line runs in from the side, stops whole, and the band goes out in steps. */
export const dotDisplay: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => ({ ...evenPad(s), left: s * 0.6, right: s * 0.6 }), shape: (w, h) => ({ w, h, outline: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], pivot: [0, 0], side: 1 }), stock: 'ink', height: 0.5, lift: 14, weight: 600 });
    const group = new THREE.Group();
    group.add(c.sheet);
    const warm = mixHex(c.words, '#FFE3B0', 0.55);
    const pitch = c.size * songVary(rt, 'display.pitch', 0.034, 0.04);
    c.glyphs.forEach((g) => {
      const mesh = g.mesh;
      mesh.material.map = grainOf(mesh.material.map!, mesh.geometry.parameters.width, pitch, true);
      mesh.material.color.set(warm);
      mesh.material.needsUpdate = true;
    });
    const unlit = panelMap(warm).clone();
    unlit.repeat.set(c.box.w / 32, c.box.h / 32);
    unlit.needsUpdate = true;
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(c.box.w - 24, c.box.h - 24), new THREE.MeshBasicMaterial({ map: unlit, transparent: true, depthTest: false, depthWrite: false }));
    grid.renderOrder = -4;
    grid.userData['noVeil'] = true;
    const decor = new THREE.Group();
    decor.userData['decor'] = true;
    decor.add(grid);
    c.sheet.add(decor);
    const place = placeOf(rt, c.box.w, c.box.h);
    const land = landOf(rt, 'display-feed');
    const rest = c.glyphs.map((g) => g.mesh.position.x);
    const travel = c.box.w;
    const planes = [new THREE.Plane(), new THREE.Plane()];
    c.glyphs.forEach((g) => (g.mesh.material.clippingPlanes = planes));
    const [a, b] = [new THREE.Vector3(), new THREE.Vector3()];
    const off = rt.style.exit === 'display-off';
    return {
      group,
      update(t: number, _fx: FrameFx) {
        poseSheet(c, place.x, place.y, REST);
        const q = clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        const left = rt.style.enter === 'display-feed' ? feedLeft((t - rt.showFrom) / land) * travel : 0;
        c.glyphs.forEach((g, i) => (g.mesh.position.x = rest[i] + left));
        c.sheet.updateWorldMatrix(true, false);
        c.sheet.localToWorld(a.set(-c.box.w / 2 + 12, 0, 0));
        c.sheet.localToWorld(b.set(c.box.w / 2 - 12, 0, 0));
        const n = b.clone().sub(a).normalize();
        planes[0].setFromNormalAndCoplanarPoint(n, a);
        planes[1].setFromNormalAndCoplanarPoint(n.clone().negate(), b);
        const shown = t < rt.showFrom ? 0 : 1;
        const words = off ? displayLevel(q) : 1 - q;
        c.fade(shown * (off ? 1 - clamp01((q - 0.7) / 0.3) : 1 - q));
        c.glyphs.forEach((g) => (g.mesh.material.opacity = shown * words));
        grid.material.opacity = shown * 0.1 * (1 - q);
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};
