// The rest of the carriers: a press strip feeding paper out, a photo print set down, an index slip pulled from its row,
// a band stuck across the frame and a line dealt out as tiles. All stand on buildCarrier; every move is in carrier-moves.ts.
import * as THREE from 'three';
import { cutPieces } from './beat-cut';
import { fourPieces } from './build-rows';
import { bandBox, bandPad, cardBox, evenPad, leaving, plainBox, Pt, roundedBox } from './carrier-shape';
import { bandTilt, cardPose, cardTilt, crossWindow, developShare, feedShare, feedStops, liftPhase, slipWidths, tileFace, tileRows, tileTurn } from './carrier-moves';
import { advanceOf, clamp01, easeInCubic, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { buildCarrier, landOf, motionOf, outlineMesh, placeOf, poseSheet, rectMesh, seedOf, shadowMesh, stockOf } from './lyric-carrier';
import { insetOutline, mixHex } from './material';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, readable, songVary, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const REST = { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 };
const mix = (a: string, b: string, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);

/** The paper fed out past a press strip, phrase by phrase, in reading order: the strip travels, the words stay where they will be read. */
export const paperFeed: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => evenPad(s), shape: plainBox, stock: 'pale', rules: (z, rowH, n) => Array.from({ length: n + 1 }, (_, i) => [z.x0 - 30, z.y1 - i * rowH, z.x1 + 30, z.y1 - i * rowH] as [number, number, number, number]) });
    const group = new THREE.Group();
    group.add(c.sheet);
    const place = placeOf(rt, c.box.w, c.box.h);
    const land = landOf(rt, 'paper-feed');
    const motion = motionOf(rt, land);
    const down = c.rows > 1;
    const length = down ? c.box.h : c.box.w;
    const ends = (cutPieces(rt.cue.text.trim()) as { text: string; from: number }[]).map((p) => p.from).filter((f) => f > 0).map((f) => {
      const g = c.glyphs.find((x) => (x.src ?? 0) >= f);
      return g ? (down ? (c.box.h / 2 - g.mesh.position.y) / c.box.h : (g.mesh.position.x - g.advance / 2 + c.box.w / 2) / c.box.w) : 1;
    });
    const stops = feedStops(down ? [...new Set(c.glyphs.map((g) => +((c.box.h / 2 - g.mesh.position.y - c.size * 0.56) / c.box.h).toFixed(3)))] : ends);
    // the strip overhangs on one side only, so it never reads as a roller's symmetrical rod
    const [thick, over] = [Math.max(16, c.size * songVary(rt, 'feed.thick', 0.15, 0.24)), c.size * songVary(rt, 'feed.over', 0.22, 0.46)];
    const flip = seed % 2 ? 1 : -1;
    const strip = down ? rectMesh(-c.box.w / 2 - (flip < 0 ? over : 8), -thick / 2, c.box.w / 2 + (flip > 0 ? over : 8), thick / 2, mix(rt.palette.accent, rt.palette.text, 0.25), 'weave') : rectMesh(-thick / 2, -c.box.h / 2 - (flip < 0 ? over : 8), thick / 2, c.box.h / 2 + (flip > 0 ? over : 8), mix(rt.palette.accent, rt.palette.text, 0.25), 'weave');
    strip.renderOrder = -4;
    c.adopt(strip);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const p = leaving(REST, t, motion, c.box.side);
        const out = feedShare((t - rt.showFrom) / land, stops);
        poseSheet(c, place.x, place.y, p);
        const edge = length * out;
        if (down) {
          strip.position.set(0, c.box.h / 2 - edge - thick / 2, 0);
          if (out < 1) c.window(c.box.h / 2 - edge, c.box.h / 2 + 2, 'y');
        } else {
          strip.position.set(-c.box.w / 2 + edge + thick / 2, 0, 0);
          if (out < 1) c.window(-c.box.w / 2 - 2, -c.box.w / 2 + edge);
        }
        if (out >= 1) c.unmask();
        c.fade(t < rt.showFrom ? 0 : p.alpha);
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** A print set down on another: an uneven trim, one small corner piece pressing it down, its words clearing from one corner. */
export const memoryCard: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => ({ ...evenPad(s), bottom: s * 0.62 }), shape: cardBox, stock: 'pale', height: 0.62, lift: 18 });
    const group = new THREE.Group();
    // the print under it: the same paper, older, and its own shadow
    const under = outlineMesh(c.box.outline, mixHex(c.face, stockOf(rt, 'ink').face, 0.26), 'fibre');
    under.renderOrder = -8;
    const underShade = shadowMesh(c.box.outline, 12);
    underShade.renderOrder = -9;
    const holder = new THREE.Group();
    holder.userData['decor'] = true;
    holder.add(underShade, under);
    group.add(holder, c.sheet);
    const tilt = cardTilt(seed) * songVary(rt, 'card.tilt', 0.8, 1.6);
    const dir = c.box.side;
    const place = placeOf(rt, c.box.w, c.box.h, 0.62);
    const develops = rt.style.enter === 'card-develop';
    const land = landOf(rt, develops ? 'card-develop' : 'card-land');
    const motion = motionOf(rt, land);
    const share = develops ? 0.5 : 1;
    const [w, h] = [c.box.w / 2, c.box.h / 2];
    const corner = Math.min(c.box.w, c.box.h) * 0.2;
    const piece = outlineMesh(dir > 0 ? [[w - corner, h + 5], [w + 5, h + 5], [w + 5, h - corner]] : [[-w + corner, h + 5], [-w - 5, h - corner], [-w - 5, h + 5]], readable(rt.palette.accent, rt.palette.background, 3), 'fibre');
    piece.renderOrder = -3;
    c.adopt(piece);
    // a veil of the ground over the print that thins away: developing, on a face that is already paper
    const fog = outlineMesh(c.outline, rt.palette.background);
    fog.renderOrder = -4;
    c.adopt(fog, 0);
    const opac0 = fog;
    const opac = c.glyphs.map((g) => g.mesh.material.opacity);
    // the corner the print clears from is the one away from the piece
    const where = c.glyphs.map((g) => clamp01((dir > 0 ? c.box.w / 2 - g.mesh.position.x : g.mesh.position.x + c.box.w / 2) / c.box.w));
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const p = cardPose(t, motion, dir, tilt, share);
        poseSheet(c, place.x, place.y, p);
        holder.position.set(place.x - dir * c.size * 0.16 + p.x * 0.7, place.y - c.size * 0.12 + p.y * 0.7, 0);
        holder.rotation.z = -tilt * 3 + p.rot * 0.7;
        c.fade(p.alpha);
        under.material.opacity = underShade.material.opacity = p.alpha;
        piece.visible = (t - rt.showFrom) / land >= share * 0.95;
        opac0.material.opacity = 0;
        if (!develops) return;
        const k = (t - rt.showFrom - land * share) / (land * (1 - share));
        opac0.material.opacity = p.alpha * 0.62 * (1 - clamp01(k));
        c.glyphs.forEach((g, i) => (g.mesh.material.opacity = opac[i] * p.alpha * developShare(where[i], k)));
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

const ROW_H = 150;
/** One slip drawn from a row of uneven index slips along the foot of the frame, opening into the card the line is read on. */
export const indexPull: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: (s) => evenPad(s), shape: plainBox, stock: 'pale', height: 0.56 });
    const group = new THREE.Group();
    const land = landOf(rt, 'index-lift');
    const motion = motionOf(rt, land);
    const slips = slipWidths(W + 160, seed + Math.round(songVary(rt, 'index.spread', 0, 40)));
    const pick = 1 + (seed % Math.max(1, slips.length - 2));
    const row = new THREE.Group();
    row.userData['decor'] = true;
    const floor = -H / 2 + ROW_H;
    const tints = [mixHex(rt.palette.text, rt.palette.background, 0.66), mixHex(rt.palette.text, rt.palette.background, 0.78)];
    let at = -W / 2 - 80;
    const meshes = slips.flatMap((w, i) => {
      const x0 = at;
      at += w;
      if (i === pick) return [];
      const lift = hash(i, seed) * songVary(rt, 'index.lift', 16, 40);
      const m = rectMesh(x0 + 4, -H / 2 - 40, x0 + w - 4, floor + lift, tints[i % 2], 'fibre', { line: { path: [[x0 + 16, floor + lift - 12], [x0 + w - 16, floor + lift - 12]], color: rt.palette.text, alpha: 0.3 } });
      m.renderOrder = -4;
      const shade = shadowMesh([[x0 + 4, -H / 2 - 40], [x0 + w - 4, -H / 2 - 40], [x0 + w - 4, floor + lift], [x0 + 4, floor + lift]], 7);
      shade.renderOrder = -5;
      row.add(shade, m);
      return [m, shade];
    });
    const pickX = -W / 2 - 80 + slips.slice(0, pick).reduce((a, x) => a + x, 0) + slips[pick] / 2;
    const restY = ROW_H / 2 + 20;
    const startY = floor - c.box.h / 2 + 34;
    group.add(row, c.sheet);
    const key = [...rt.cue.text.trim()].flatMap((ch, i) => (emphasisOf(rt, i) ? [ch] : [])).join('');
    if (key && [...key].length <= 6 && [...key].length < [...rt.cue.text.trim().replace(/\s/g, '')].length) {
      // the tab names the card with the line's own key words, never a made-up date or number
      const style: GlyphStyle = { family: rt.fonts.display, weight: 700, size: Math.max(38, c.size * 0.26) };
      const width = [...key].reduce((a, ch) => a + advanceOf(ch, style), 0);
      const tabW = width + style.size;
      const tx = (seed % 2 ? 1 : -1) * Math.max(0, c.box.w / 2 - tabW / 2 - c.size * 0.3);
      const tab = rectMesh(tx - tabW / 2, c.box.h / 2 - 2, tx + tabW / 2, c.box.h / 2 + style.size * 1.28, c.face, 'fibre');
      tab.renderOrder = -5;
      tab.userData['decor'] = true;
      c.adopt(tab);
      const gs = makeGlyphs(key, style, color(c.words, 1));
      placeRow(gs, 0, 0);
      gs.forEach((g) => {
        g.mesh.position.set(tx + g.x, c.box.h / 2 + style.size * 0.64, 0);
        g.mesh.userData['noVeil'] = true;
        g.mesh.userData['decor'] = true;
        c.adopt(g.mesh as unknown as Parameters<typeof c.adopt>[0]);
      });
    }
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = (t - rt.showFrom) / land;
        const { rise, open } = liftPhase(k);
        const p = leaving(REST, t, motion, c.box.side);
        poseSheet(c, pickX + (0 - pickX) * rise + p.x, startY + (restY - startY) * rise + p.y, { ...REST, rot: p.rot, scale: p.scale });
        const half = (slips[pick] / 2 + (c.box.w / 2 - slips[pick] / 2) * open);
        if (open >= 1) c.unmask();
        else c.window(-half, half);
        const a = t < rt.showFrom ? 0 : p.alpha;
        c.fade(a);
        const rowIn = clamp01(k * 3.5);
        row.position.y = -(1 - rowIn) * ROW_H * 1.6;
        meshes.forEach((m) => (m.material.opacity = a));
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** A long band stuck on at a slant from the frame's edge; `cross` runs a second, plain one across it first, behind the words, gone before reading. */
export const lyricBand: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const seed = seedOf(rt);
    const c = buildCarrier(rt, seed, { pad: bandPad, shape: bandBox, bleeds: true, height: 0.5, stock: songVary(rt, 'band.stock', 0, 1) > 0.5 ? 'ink' : 'tinted', lift: 14 });
    const group = new THREE.Group();
    const tilt = bandTilt(seed) * songVary(rt, 'band.tilt', 0.7, 1.5);
    const land = landOf(rt, 'band-stick');
    const motion = motionOf(rt, land);
    const place = placeOf(rt, c.box.w, c.box.h, 0.5);
    const dir = c.box.side;
    const crossing = !!rt.params['cross'] && rt.style.enter === 'band-stick';
    const span = 2400;
    const thick = c.box.h * songVary(rt, 'band.cross', 0.62, 0.92);
    const cross = crossing ? rectMesh(-span / 2, -thick / 2, span / 2, thick / 2, mixHex(rt.palette.accent, rt.palette.background, 0.25), 'fibre') : undefined;
    const planes = [new THREE.Plane(), new THREE.Plane()];
    if (cross) {
      cross.rotation.z = -tilt * 5;
      cross.position.set(place.x, place.y, 0);
      cross.renderOrder = -7;
      cross.material.clippingPlanes = planes;
      const aside = new THREE.Group();
      aside.userData['decor'] = true;
      aside.add(cross);
      group.add(aside);
    }
    group.add(c.sheet);
    const [a, b] = [new THREE.Vector3(), new THREE.Vector3()];
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = (t - rt.showFrom) / land;
        const p = leaving({ ...REST, rot: tilt }, t, motion, dir);
        c.sheet.position.set(place.x + p.x, place.y + p.y, 0);
        c.sheet.rotation.z = p.rot;
        c.fade(t < rt.showFrom ? 0 : p.alpha);
        const e = clamp01(k) ** 0.6;
        if (k >= 1) c.unmask();
        else if (dir > 0) c.window(c.box.w / 2 - (c.box.w + 2400) * e - 40, 4000);
        else c.window(-4000, -c.box.w / 2 + (c.box.w + 2400) * e + 40);
        if (!cross) return;
        const [lo, hi] = crossWindow(k);
        cross.visible = hi > lo;
        if (!cross.visible) return;
        cross.updateWorldMatrix(true, false);
        const s = -dir;
        cross.localToWorld(a.set(s * (lo - 0.5) * span, 0, 0));
        cross.localToWorld(b.set(s * (hi - 0.5) * span, 0, 0));
        const n = b.clone().sub(a).normalize();
        planes[0].setFromNormalAndCoplanarPoint(n, a);
        planes[1].setFromNormalAndCoplanarPoint(n.clone().negate(), b);
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};

/** The line dealt out as a few uneven tiles, one phrase a tile, each turning over to its face just after the one before. */
export const phrasePanels: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text.trim();
    const seed = seedOf(rt);
    const family = rt.fonts.display;
    const pieces = fourPieces(cutPieces(text));
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const widths = pieces.map((p) => [...p.text].reduce((w, ch) => w + advanceOf(ch, probe), 0) || 1);
    const padX = 0.32;
    const gapU = 0.16;
    const maxW = W * 0.82;
    // the largest type at which the tiles, wrapped, stay inside the frame
    const fitted = [230, 210, 190, 170, 150, 134, 120, 106, 94].find((s) => {
      const ws = widths.map((w) => (w * s) / 200 + padX * 2 * s);
      if (Math.max(...ws) > maxW) return false;
      const rows = tileRows(ws, gapU * s, maxW);
      return (rows[rows.length - 1].row + 1) * s * 1.6 <= H * 0.72;
    }) ?? 84;
    const size = fitted;
    const tileH = size * 1.42;
    const tw = widths.map((w) => (w * size) / 200 + padX * 2 * size);
    const spots = tileRows(tw, gapU * size, maxW);
    const rowCount = spots[spots.length - 1].row + 1;
    const rowW = Array.from({ length: rowCount }, (_, r) => spots.flatMap((s, i) => (s.row === r ? [s.x + tw[i]] : [])).reduce((a, x) => Math.max(a, x), 0));
    const { face, words, key } = stockOf(rt, songVary(rt, 'panels.stock', 0, 1) > 0.5 ? 'ink' : 'pale');
    const back = mixHex(rt.palette.accent, rt.palette.text, 0.3);
    const group = new THREE.Group();
    const partial = [...text].some((ch, i) => !/\s/.test(ch) && !emphasisOf(rt, i));
    const r = size * songVary(rt, 'panels.round', 0.08, 0.2);
    const land = landOf(rt, 'panel-flip');
    const tiles = pieces.map((p, i) => {
      const tile = new THREE.Group();
      const spot = spots[i];
      // each row shifted its own way, so the tiles do not line up into a grid
      const shift = rowCount > 1 ? (spot.row % 2 ? 1 : -1) * (seed % 3) * size * songVary(rt, 'panels.shift', 0.08, 0.2) : 0;
      tile.position.set(spot.x + tw[i] / 2 - rowW[spot.row] / 2 + shift, ((rowCount - 1) / 2 - spot.row) * (tileH + gapU * size), 0);
      const box = roundedBox(tw[i], tileH, r) as Pt[];
      const inner = { line: { path: insetOutline(box, size * 0.07), color: words, alpha: 0.3 } };
      const paper = outlineMesh(box, face, 'fibre', [], 0, inner);
      paper.renderOrder = -5;
      const blank = outlineMesh(box, back, 'fibre', [], 0, { line: { path: insetOutline(box, size * 0.07), color: rt.palette.background, alpha: 0.3 } });
      blank.renderOrder = -5;
      const shade = shadowMesh(box, Math.max(9, size * 0.07));
      shade.renderOrder = -6;
      const cast = new THREE.Group();
      cast.userData['decor'] = true;
      cast.add(shade);
      const gs: Glyph[] = makeGlyphs(p.text, { family, weight: 900, size }, color(words, 1));
      placeRow(gs, 0, 0);
      tagSource(gs, text, p.from);
      tile.add(cast, paper, blank);
      gs.forEach((g) => {
        g.mesh.position.set(g.x, 0, 0);
        if (partial && g.src !== undefined && emphasisOf(rt, g.src)) g.mesh.material.color.copy(color(key, 1));
        g.mesh.userData['noVeil'] = true;
        tile.add(g.mesh);
      });
      group.add(tile);
      return { tile, paper, blank, shade, gs };
    });
    const motion = motionOf(rt, land);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = (t - rt.showFrom) / land;
        const p = leaving(REST, t, motion, seed % 2 ? 1 : -1);
        group.position.set(p.x, p.y, 0);
        group.scale.setScalar(p.scale);
        tiles.forEach((s, i) => {
          const q = tileTurn(i, tiles.length, k);
          const f = tileFace(q);
          s.tile.scale.x = f.sx;
          s.tile.visible = t >= rt.showFrom;
          s.blank.visible = !f.face;
          s.paper.visible = f.face;
          const a = t < rt.showFrom ? 0 : p.alpha;
          s.paper.material.opacity = s.blank.material.opacity = s.shade.material.opacity = a;
          s.gs.forEach((g) => {
            g.mesh.visible = f.face;
            g.mesh.material.opacity = a;
          });
        });
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};
