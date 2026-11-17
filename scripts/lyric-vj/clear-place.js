// Where a cut-out shot's figures stand so the lines read over the shot stay clear (cutout.mts inlines this file into
// each shot's code layer, next to page.js). The drawing knows the real line boxes only when it runs (f.lines, frame px),
// so the placement is made there, once a shot, from the shot's whole motion: the camera push, the beat kick, a pose
// change's wider picture, a prop's walk, fall and flutter. A figure under a line slides along its own ground first,
// then shrinks a little on its foot; it is never lifted. What still finds no room stays where the director put it and
// the renderer's keep-clear (cover.ts) is the last resort.
/* eslint-disable */
function placeClear(S, W, H, lines) {
  const PAD = 24, GAP = 0.03 * W, SCALES = [1, 0.9, 0.8, 0.7], MIN_H = 0.4, STEPS = 10, CLOSE = 0.75, CROP = 0.4, RELATE_GROUND = 0.06, RELATE_SIZE = 0.75;
  const E = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const dur = Math.max(0.001, S.dur);
  // (the lines read while the page is on screen, f.lines: the engine adds those that come up while the next shot's
  // transition still draws it; each sampled over the part of the shot it is read, a lingering one at the shot's last pose)
  const on = (lines || []).filter((r) => r.to - Math.max(0, r.from) > 0.05);
  const res = { actors: S.actors, props: S.props, moved: 0, shrunk: 0, stuck: 0 };
  if (!on.length) return res;
  const times = (r) => { const a = Math.min(dur, Math.max(0, r.from)), b = Math.max(a, Math.min(dur, r.to)); return Array.from({ length: STEPS + 1 }, (_, i) => a + ((b - a) * i) / STEPS); };
  const z0 = S.zoom[0], z1 = S.zoom[1], kick = S.pulse ? 0.022 : 0;
  const fx = S.focus[0], fy = S.focus[1];
  // the shot's camera (cutout.mts shotCode cam(1)) on a drawing-space box: linear in the zoom, so a zoom range maps to the
  // union of its two ends
  const camBox = (b, zz) => {
    const X = (x) => W / 2 + zz * (x - W / 2) - fx * (W / 2) * (zz - 1), Y = (y) => H / 2 + zz * (y - H / 2) + fy * (H / 2) * (zz - 1);
    return { x0: X(b.x0), y0: Y(b.y0), x1: X(b.x1), y1: Y(b.y1) };
  };
  const onFrame = (b, t) => { const zz = z0 + (z1 - z0) * E(t / dur); const a = camBox(b, zz), c = camBox(b, zz * (1 + kick)); return { x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }; };
  const meet = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  // the share of the line boxes the thing reaches into over the shot (its worst sample per line, summed)
  const hit = (boxAt) => on.reduce((sum, r) => {
    const R = { x0: r.x0 - PAD, y0: r.y0 - PAD, x1: r.x1 + PAD, y1: r.y1 + PAD };
    return sum + Math.max(...times(r).map((t) => meet(onFrame(boxAt(t), t), R))) / Math.max(1, (R.x1 - R.x0) * (R.y1 - R.y0));
  }, 0);
  const xs = Array.from({ length: 193 }, (_, i) => -0.96 + i * 0.01);
  // How far a spot sits out of the frame: 0 wholly in it (or no further out than the director had the thing), 1 past
  // the side within what a close figure may bleed (CROP of its width), undefined beyond.
  const frameTier = (own, b, close) => {
    if (b.x0 >= Math.min(own.x0, 0) && b.x1 <= Math.max(own.x1, W)) return 0;
    const crop = close ? CROP * (own.x1 - own.x0) : 0;
    return crop && b.x0 >= Math.min(own.x0, -crop) && b.x1 <= Math.max(own.x1, W + crop) ? 1 : undefined;
  };
  // The best spot clear of the lines, scored rather than nearest (三年後的大雪 151.5 s: the nearest spot left him half off
  // the frame beside a wide free middle): whole and in the frame at full size first, then in the frame a little smaller,
  // then bleeding past the side (close figures only); within that, not standing over another figure, then the nearest.
  const search = (q, own, cx, scales, boxAt, ok, occludes) => {
    const cands = [];
    scales.forEach((s, k) => xs.forEach((x) => {
      if (!ok(x, s)) return;
      const tier = frameTier(own, boxAt(x, s), q.h >= CLOSE);
      if (tier === undefined) return;
      cands.push({ x, s, key: [tier, k, occludes(boxAt(x, s)) ? 1 : 0, Math.abs(x - cx)] });
    }));
    cands.sort((a, b) => { for (let i = 0; i < 4; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]; return 0; });
    return cands.find((c) => hit((t) => boxAt(c.x, c.s, t)) === 0);
  };

  // (the pose showing at t when given: a wide reaching pose that gives way to a slim one before the line comes up is
  // placed by the slim one; without t, the wider of the two, as the figures' spacing)
  const asp = (q, t) => (t === undefined || !q.then ? Math.max(S.aspects[q.sprite] || 0.4, q.then ? S.aspects[q.then] || 0.4 : 0) : S.aspects[t >= q.at * dur ? q.then : q.sprite] || 0.4);
  const actorBox = (q, x, s, t) => { const hh = q.h * s * H, half = (hh * asp(q, t)) / 2 * 1.04, cx = ((x + 1) / 2) * W, foot = q.ground * H; return { x0: cx - half, y0: foot - hh * 1.01, x1: cx + half, y1: foot }; };
  const scalesOf = (q) => SCALES.filter((s) => s === 1 || q.h * s >= Math.min(q.h, MIN_H));
  // Two figures relate when they stand on the same ground at the same depth (the shots' pairs talking, facing each
  // other): they keep their left-right order and their distance. A far figure in the picture behind a close one, or a
  // figure alone, may cross to the other side of a line; the facing (flip) is never changed (a mirrored pose is a new
  // pose the cast sheet may not allow).
  const related = (a, b) => Math.abs(a.ground - b.ground) <= RELATE_GROUND && Math.min(a.h, b.h) / Math.max(a.h, b.h) >= RELATE_SIZE;
  const overlap = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
  // One pass over the figures in a direction (1: left to right); `gentle`, a figure also keeps clear of the related
  // figures not placed yet as the director had them (only the figures under a line move), else it may push them along.
  const pack = (dir, gentle) => {
    const order = S.actors.map((q, i) => i).sort((i, j) => dir * (S.actors[i].x - S.actors[j].x));
    const out = S.actors.slice();
    const placed = new Set();
    let stuck = 0, moved = 0, shrunk = 0, cost = 0;
    for (const i of order) {
      const q = S.actors[i];
      const own = actorBox(q, q.x, 1);
      const rel = S.actors.map((o, j) => j).filter((j) => j !== i && related(q, S.actors[j]) && (placed.has(j) || gentle));
      const ok = (x, s) => { const b = actorBox(q, x, s); return rel.every((j) => { const o = actorBox(out[j], out[j].x, 1); return S.actors[j].x < q.x ? b.x0 >= o.x1 + GAP : b.x1 <= o.x0 - GAP; }); };
      const occludes = (b) => S.actors.some((o, j) => j !== i && !related(q, o) && overlap(b, actorBox(out[j], out[j].x, 1)));
      const keep = ok(q.x, 1) && hit((t) => actorBox(q, q.x, 1, t)) === 0;
      const got = keep ? { x: q.x, s: 1 } : search(q, own, q.x, scalesOf(q), (x, s, t) => actorBox(q, x, s, t), ok, occludes);
      if (!got) stuck++;
      else if (!keep) { moved++; if (got.s < 1) shrunk++; cost += Math.abs(got.x - q.x) + (1 - got.s); }
      out[i] = got && !keep ? Object.assign({}, q, { x: got.x, h: q.h * got.s }) : q;
      placed.add(i);
    }
    return { actors: out, stuck, moved, shrunk, cost };
  };
  let { actors, stuck, moved, shrunk } = pack(1, true);
  // a figure boxed in by its partner: the related figures slide together at full size, as the director spaced them; else
  // the one under the line pushes its partner along (or back), each shrinking a little only where it must; else they
  // slide together a little smaller. Only then is anyone left for the keep-clear
  if (stuck && S.actors.length > 1) {
    const group = (dx, s) => S.actors.map((q) => Object.assign({}, q, { x: q.x + dx, h: q.h * s }));
    const fits = (dx, s) => group(dx, s).every((g, k) => frameTier(actorBox(S.actors[k], S.actors[k].x, 1), actorBox(g, g.x, 1), g.h >= CLOSE) !== undefined && hit((t) => actorBox(g, g.x, 1, t)) === 0);
    const dxs = Array.from({ length: 401 }, (_, k) => -2 + k * 0.01).sort((a, b) => Math.abs(a) - Math.abs(b));
    const slide = (s) => { const dx = dxs.find((d) => fits(d, s)); return dx === undefined ? undefined : { actors: group(dx, s), stuck: 0, moved: S.actors.length, shrunk: s < 1 ? S.actors.length : 0 }; };
    const push = () => [pack(1, false), pack(-1, false)].filter((r) => !r.stuck).sort((a, b) => a.cost - b.cost)[0];
    const shrunkScales = SCALES.filter((s) => s < 1 && S.actors.every((q) => scalesOf(q).includes(s)));
    const got = slide(1) || push() || shrunkScales.map(slide).find(Boolean);
    if (got) ({ actors, stuck, moved, shrunk } = got);
  }
  res.stuck += stuck; res.moved += moved; res.shrunk += shrunk;

  // props: their walk across the shot, a fall from above with its sway and spin, the flutter of cloth; slid on their own
  // height, then shrunk on their centre
  const props = S.props.map((q, i) => {
    const ar = S.aspects[q.sprite] || 1;
    const boxAt = (x, s, t = 0) => {
      const hh = q.h * s * H, ww = hh * ar, k = E(t / Math.min(dur, 4));
      let cx = ((x + 1) / 2) * W + (q.walk || 0) * W * E(t / dur), cy = q.y * H, rx = ww / 2, ry = hh / 2;
      if (q.motion === 'fall') { cy -= (1 - k) * H * 0.55; rx = ry = Math.hypot(ww, hh) / 2; rx += 40 * (1 - k); }
      else if (q.motion === 'flutter' || q.motion === 'hang') { rx *= 1.06; ry *= 1.06; }
      return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
    };
    if (hit((t) => boxAt(q.x, 1, t)) === 0) return q;
    const got = search({ h: 0 }, boxAt(q.x, 1, 0), q.x, SCALES, boxAt, () => true, () => false);
    if (!got) { res.stuck++; return q; }
    res.moved++;
    if (got.s < 1) res.shrunk++;
    return Object.assign({}, q, { x: got.x, h: q.h * got.s });
  });
  return Object.assign(res, { actors, props });
}
