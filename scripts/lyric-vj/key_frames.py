"""Chroma-keyed clip → transparent PNG frames for a sprite clip: the same key rule as key_sprites.py (the palette's
screen keyed, key_screen.py; on green its ground shadows with it), one largest figure kept per frame, all frames trimmed to one shared box
(so the sprite does not jitter), written at the asked fps as %05d.png with frames.json (count, fps, box).

uv run --with numpy --with pillow --with scipy python scripts/lyric-vj/key_frames.py clip.mp4 out_dir --in 0.5 --len 1.5 --fps 12 [--height 720] [--screen green]
"""

import argparse
import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

from key_screen import SCREENS, despill, screen_alpha, screen_excess


def key_one(im, screen="green"):
    im = im.astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    alpha, lean = screen_alpha(r, g, b, screen)
    # a still narrower than the clip comes back pillarboxed in pure black: that black is no part of the figure — only
    # black reaching the frame's side edge is a pillar (every black inside went too: 大雪 S03's black sweater was a
    # hole, the background showing through his chest, 2026-11-17)
    black, nb = ndimage.label(np.maximum(np.maximum(r, g), b) < 16)
    if nb:
        edge = np.setdiff1d(np.union1d(black[:, 0], black[:, -1]), [0])
        alpha = np.where(np.isin(black, edge), 0, alpha)
    mask = alpha > 0.5
    # despill everywhere inside the figure, not only its rim: a wheel's spokes kept the screen between them (the
    # screen is chosen far from the palette's inks, chroma-screen.mts, so no ink of the print leans toward it)
    rgb = despill(im, mask, lean, screen)
    if screen == "green":
        # cyan streaks the video model paints between spinning spokes: no ink of a two-ink print is cyan, so a green-
        # and-blue pixel that is not the print's own blue (blue well over green) goes grey at its red's level — not its
        # green alone lowered, which turned a cool-white breath's rim pink (大雪 S03, 2026-11-17)
        r2, g2, b2 = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        cyan = mask & (g2 > r2 + 40) & (g2 > b2 - 20)
        grey = np.maximum(r2, (r2 + np.minimum(g2, b2)) // 2)
        rgb[..., 1] = np.where(cyan, grey, g2)
        rgb[..., 2] = np.where(cyan, np.minimum(b2, grey), b2)
    labels, n = ndimage.label(ndimage.binary_closing(mask, iterations=6))
    if n == 0:
        return rgb, alpha * 0, None
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    j = int(np.argmax(sizes)) + 1
    own = ndimage.binary_dilation(labels == j, iterations=2)
    a = alpha * own
    a = np.where((lean > 30) & (a < 1), 0, a)
    ys, xs = np.where(a > 0.05)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None
    return rgb, a, box


def main():
    p = argparse.ArgumentParser()
    p.add_argument("clip")
    p.add_argument("out")
    p.add_argument("--in", dest="start", type=float, default=0.5)
    p.add_argument("--len", type=float, default=1.5)
    p.add_argument("--fps", type=int, default=12)
    p.add_argument("--height", type=int, default=720, help="frame height the clip is scaled to before keying")
    p.add_argument("--screen", choices=SCREENS, default="green", help="the keying screen the clip was made on")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(a.start), "-t", str(a.len), "-i", a.clip, "-vf", f"fps={a.fps},scale=-2:{a.height}", "-q:v", "1", os.path.join(tmp, "%05d.png")], check=True)
    files = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    keyed = []
    box = None
    for f in files:
        rgb, alpha, b = key_one(np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")), a.screen)
        keyed.append((rgb, alpha))
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        raise SystemExit(f"nothing keyed: the clip is not on the {a.screen} screen")
    x0, y0, x1, y1 = box
    for i, (rgb, alpha) in enumerate(keyed, 1):
        rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(os.path.join(a.out, f"{i:05d}.png"))
    # how much of the figure's edge still leans toward the screen after despill, per frame (an edge check for the review)
    spill = []
    for rgb, alpha in keyed:
        edge = (alpha > 0.05) & (alpha < 0.95)
        if edge.sum():
            e = rgb[edge]
            spill.append(float(np.mean(screen_excess(e[:, 0], e[:, 1], e[:, 2], a.screen) > 20)))
    json.dump({"count": len(keyed), "fps": a.fps, "box": [x0, y0, x1, y1], "width": x1 - x0, "height": y1 - y0, "edgeGreenShare": spill}, open(os.path.join(a.out, "frames.json"), "w"), indent=1)
    print(f"{len(keyed)} frames, box {x1 - x0}x{y1 - y0}, edge green share max {max(spill) if spill else 0:.3f}")


if __name__ == "__main__":
    main()
