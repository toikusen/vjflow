// The page of a cut-out shot (cutout.mts inlines this file into each shot's code layer): paper with the song's
// texture, the picture inside one window shape, the window's own trim, and a horizon line the figures stand on.
// Shapes are the window / split / frame forms common across the reference videos (out/knowledge: 開窗遮罩、形狀遮罩
// 視窗、框景視窗、分格分屏、媒介模板 — 26–59 videos each), drawn from parameters so every song picks its own set.
/* eslint-disable */
function drawPage(ctx, W, H, L, look, bg, z, cam, ground, seed) {
  const ink = look.ink || '#1B1F4A', accent = look.accent || ink, paper = L.paper || look.paper || '#F2EDE3';
  const rnd = (i) => { const x = Math.sin((seed + 1) * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };
  const cover = (x0, y0, bw, bh, k, ox) => {
    if (!bg) return;
    const r = Math.max(bw / bg.width, bh / bg.height) * k, dw = bg.width * r, dh = bg.height * r;
    ctx.drawImage(bg, x0 + (bw - dw) / 2 + (ox || 0) * (dw - bw) / 2, y0 + (bh - dh) / 2, dw, dh);
  };
  if (L.shape === 'full') { ctx.save(); cam(0.6); cover(0, 0, W, H, 1); ctx.restore(); return; }

  // paper and its texture
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.fillStyle = ink; ctx.strokeStyle = ink;
  const tex = look.texture || 'dots';
  if (tex === 'dots') { ctx.globalAlpha = 0.07; for (let y = 6; y < H; y += 12) for (let x = (y / 12 % 2) * 6; x < W; x += 12) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.283); ctx.fill(); } }
  if (tex === 'grain') { ctx.globalAlpha = 0.06; for (let i = 0; i < 4000; i++) ctx.fillRect(rnd(i) * W, rnd(i + 9e3) * H, 2, 2); }
  if (tex === 'lines') { ctx.globalAlpha = 0.16; ctx.lineWidth = 2; for (let y = 60; y < H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, H); ctx.stroke(); }
  if (tex === 'grid') { ctx.globalAlpha = 0.1; ctx.lineWidth = 1.5; for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
  ctx.restore();

  ctx.save(); cam(1);
  const shape = L.shape, sh = L.size * H, cx = (L.x + 1) / 2 * W, cy = L.y * H;
  const wide = { band: W * 1.2, doubleband: W * 1.2, rect: sh * 1.5, rounded: sh * 1.5, polaroid: sh * 0.95, filmstrip: W * 1.2, window: sh * 1.25, ticket: sh * 1.6, phone: sh * 0.52, ellipse: sh * 1.6, arch: sh * 0.78, split: W, panels: sh * 1.9, torn: sh * 1.5, brush: sh * 1.6, cloud: sh * 1.4, wavy: sh * 1.5 }[shape] || sh;
  const bw = wide, x0 = shape === 'split' ? 0 : cx - bw / 2, y0 = shape === 'split' ? 0 : cy - sh / 2;
  const tilt = (L.tilt || 0) * Math.PI / 180;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt); ctx.translate(-cx, -cy);

  // the window outline as a path (several sub-paths for panels / double bands)
  const path = () => {
    ctx.beginPath();
    const r = sh / 2;
    switch (shape) {
      case 'circle': ctx.arc(cx, cy, r, 0, 6.283); break;
      case 'ellipse': ctx.ellipse(cx, cy, bw / 2, r, 0, 0, 6.283); break;
      case 'rounded': case 'phone': { const k = shape === 'phone' ? bw * 0.16 : sh * 0.12; ctx.roundRect(x0, y0, bw, sh, k); break; }
      case 'arch': ctx.moveTo(x0, y0 + sh); ctx.lineTo(x0, y0 + bw / 2); ctx.arc(cx, y0 + bw / 2, bw / 2, Math.PI, 0); ctx.lineTo(x0 + bw, y0 + sh); ctx.closePath(); break;
      case 'diamond': ctx.moveTo(cx, y0); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, y0 + sh); ctx.lineTo(cx - r, cy); ctx.closePath(); break;
      case 'hexagon': for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(t), cy + r * Math.sin(t)); } ctx.closePath(); break;
      case 'flower': for (let i = 0; i <= 120; i++) { const t = i / 120 * 6.283, rr = r * (0.82 + 0.18 * Math.cos(5 * t)); ctx[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(t - Math.PI / 2), cy + rr * Math.sin(t - Math.PI / 2)); } ctx.closePath(); break;
      case 'keyhole': ctx.arc(cx, cy - r * 0.35, r * 0.55, Math.PI * 0.72, Math.PI * 2.28); ctx.lineTo(cx + r * 0.42, y0 + sh); ctx.lineTo(cx - r * 0.42, y0 + sh); ctx.closePath(); break;
      case 'cloud': { const n = 11; for (let i = 0; i <= n; i++) { const t = i / n * 6.283; const px = cx + bw / 2 * 0.86 * Math.cos(t), py = cy + r * 0.8 * Math.sin(t); ctx.moveTo(px + r * 0.3, py); ctx.arc(px, py, r * (0.26 + 0.08 * rnd(i)), 0, 6.283); } ctx.moveTo(cx + bw * 0.43, cy); ctx.ellipse(cx, cy, bw * 0.43, r * 0.8, 0, 0, 6.283); break; }
      case 'wavy': { const amp = sh * 0.025; ctx.moveTo(x0, y0); for (let x = 0; x <= bw; x += 12) ctx.lineTo(x0 + x, y0 + amp * Math.sin(x / 40)); for (let y = 0; y <= sh; y += 12) ctx.lineTo(x0 + bw + amp * Math.sin(y / 40), y0 + y); for (let x = bw; x >= 0; x -= 12) ctx.lineTo(x0 + x, y0 + sh + amp * Math.sin(x / 40 + 2)); for (let y = sh; y >= 0; y -= 12) ctx.lineTo(x0 + amp * Math.sin(y / 40 + 1), y0 + y); ctx.closePath(); break; }
      case 'torn': case 'brush': { const j = shape === 'torn' ? sh * 0.03 : sh * 0.05, st = shape === 'torn' ? 14 : 22; let i = 0; ctx.moveTo(x0, y0); for (let x = 0; x <= bw; x += st) ctx.lineTo(x0 + x, y0 + (rnd(i++) - 0.5) * j); for (let y = 0; y <= sh; y += st) ctx.lineTo(x0 + bw + (rnd(i++) - 0.5) * j, y0 + y); for (let x = bw; x >= 0; x -= st) ctx.lineTo(x0 + x, y0 + sh + (rnd(i++) - 0.5) * j); for (let y = sh; y >= 0; y -= st) ctx.lineTo(x0 + (rnd(i++) - 0.5) * j, y0 + y); ctx.closePath(); break; }
      case 'ticket': { const n = sh * 0.11; ctx.moveTo(x0, y0); ctx.lineTo(x0 + bw, y0); ctx.lineTo(x0 + bw, cy - n); ctx.arc(x0 + bw, cy, n, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(x0 + bw, y0 + sh); ctx.lineTo(x0, y0 + sh); ctx.lineTo(x0, cy + n); ctx.arc(x0, cy, n, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); break; }
      case 'split': { const s = (L.x + 1) / 2, d = 0.09; if (s < 0.5) { ctx.moveTo(0, 0); ctx.lineTo(W * (s + d), 0); ctx.lineTo(W * (s - d), H); ctx.lineTo(0, H); } else { ctx.moveTo(W, 0); ctx.lineTo(W * (s - d), 0); ctx.lineTo(W * (s + d) - W * 0.18, H); ctx.lineTo(W, H); } ctx.closePath(); break; }
      case 'doubleband': ctx.rect(-W * 0.1, y0, W * 1.2, sh * 0.46); ctx.rect(-W * 0.1, y0 + sh * 0.54, W * 1.2, sh * 0.46); break;
      case 'band': case 'filmstrip': ctx.rect(-W * 0.1, y0, W * 1.2, sh); break;
      case 'panels': { const n = 3, g = sh * 0.05, pw = (bw - g * (n - 1)) / n; for (let i = 0; i < n; i++) ctx.rect(x0 + i * (pw + g), y0 + (i % 2) * sh * 0.06, pw, sh * 0.94); break; }
      default: ctx.rect(x0, y0, bw, sh);
    }
  };

  // a misregistered print shadow under the window
  if (look.shadow) { ctx.save(); ctx.translate(sh * 0.025, sh * 0.03); path(); ctx.fillStyle = accent; ctx.globalAlpha = 0.85; ctx.fill(); ctx.restore(); }
  if (shape === 'polaroid') { ctx.save(); ctx.fillStyle = '#FBFAF6'; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 18; ctx.fillRect(x0 - sh * 0.06, y0 - sh * 0.06, bw + sh * 0.12, sh * 1.26); ctx.restore(); }

  // the picture: panels each show their own slice of it; everything else one clip
  const inner = 1 + (z - 1) * 0.6;
  if (shape === 'panels') {
    const n = 3, g = sh * 0.05, pw = (bw - g * (n - 1)) / n;
    for (let i = 0; i < n; i++) { ctx.save(); ctx.beginPath(); ctx.rect(x0 + i * (pw + g), y0 + (i % 2) * sh * 0.06, pw, sh * 0.94); ctx.clip(); cover(x0 + i * (pw + g), y0, pw, sh, inner * 1.1, [-0.6, 0, 0.6][i]); ctx.restore(); }
  } else {
    ctx.save(); path(); ctx.clip();
    const box = shape === 'split' ? [0, 0, W, H] : (shape === 'band' || shape === 'doubleband' || shape === 'filmstrip') ? [-W * 0.1, y0, W * 1.2, sh] : [x0, y0, bw, sh];
    cover(box[0], box[1], box[2], box[3], inner);
    ctx.restore();
  }

  // the window's trim
  ctx.save(); ctx.strokeStyle = ink; ctx.fillStyle = ink;
  const line = look.border == null ? 0 : look.border;
  if (line > 0 && !['band', 'doubleband', 'split', 'torn'].includes(shape)) { ctx.lineWidth = line; if (shape === 'panels') { const n = 3, g = sh * 0.05, pw = (bw - g * (n - 1)) / n; for (let i = 0; i < n; i++) ctx.strokeRect(x0 + i * (pw + g), y0 + (i % 2) * sh * 0.06, pw, sh * 0.94); } else { path(); ctx.stroke(); } }
  if (shape === 'torn') { ctx.globalAlpha = 0.9; ctx.strokeStyle = paper; ctx.lineWidth = sh * 0.02; path(); ctx.stroke(); }
  if (shape === 'filmstrip') { for (const yy of [y0 - sh * 0.1, y0 + sh]) { ctx.fillRect(-W * 0.1, yy, W * 1.2, sh * 0.1); ctx.save(); ctx.fillStyle = paper; for (let x = -W * 0.1 + 20; x < W * 1.1; x += 56) ctx.fillRect(x, yy + sh * 0.025, 26, sh * 0.05); ctx.restore(); } }
  if (shape === 'window') { ctx.lineWidth = Math.max(8, sh * 0.025); ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + sh); ctx.moveTo(x0, cy); ctx.lineTo(x0 + bw, cy); ctx.stroke(); ctx.lineWidth = Math.max(10, sh * 0.03); ctx.strokeRect(x0, y0, bw, sh); }
  if (shape === 'phone') { ctx.lineWidth = Math.max(10, sh * 0.028); path(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(cx - bw * 0.16, y0 + sh * 0.02, bw * 0.32, sh * 0.035, sh * 0.02); ctx.fill(); }
  if (shape === 'ticket') { ctx.setLineDash([10, 10]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + bw * 0.78, y0 + 10); ctx.lineTo(x0 + bw * 0.78, y0 + sh - 10); ctx.stroke(); ctx.setLineDash([]); }
  if (look.tape) { ctx.fillStyle = look.tape; ctx.globalAlpha = 0.7; for (const [tx, ty, tr] of [[x0 + bw * 0.08, y0, -0.5], [x0 + bw * 0.92, y0 + sh, -0.5]]) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(tr); ctx.fillRect(-sh * 0.12, -sh * 0.03, sh * 0.24, sh * 0.06); ctx.restore(); } }
  ctx.restore();
  ctx.restore();

  if (ground > 0 && ground < 1 && shape !== 'split') { ctx.globalAlpha = 0.55; ctx.fillStyle = ink; ctx.fillRect(-W * 0.1, ground * H - 2, W * 1.2, 3); ctx.globalAlpha = 1; }
  ctx.restore();
}
