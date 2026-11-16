"""Chroma-keyed clip → transparent PNG frames for a sprite clip: the same key rule as key_sprites.py (green #00B140
keyed, ground shadows with it, rim despilled), one largest figure kept per frame, all frames trimmed to one shared box
(so the sprite does not jitter), written at the asked fps as %05d.png with frames.json (count, fps, box).

uv run --with numpy --with pillow --with scipy python scripts/lyric-vj/key_frames.py clip.mp4 out_dir --in 0.5 --len 1.5 --fps 12 [--height 720]
"""

import argparse
import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage


def key_one(im):
    im = im.astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    green = g - np.maximum(r, b)
    alpha = np.clip(1 - (green - 60) / 40, 0, 1)
    alpha = np.where((r < 80) & (green > 25), 0, alpha)
    # a still narrower than the clip comes back pillarboxed in pure black: that black is no part of the figure
    alpha = np.where(np.maximum(np.maximum(r, g), b) < 16, 0, alpha)
    mask = alpha > 0.5
    rim = mask & ~ndimage.binary_erosion(mask, iterations=3)
    rgb = im.copy()
    rgb[..., 1] = np.where(rim & (green > 0), np.maximum(r, b), g)
    labels, n = ndimage.label(ndimage.binary_closing(mask, iterations=6))
    if n == 0:
        return rgb, alpha * 0, None
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    j = int(np.argmax(sizes)) + 1
    own = ndimage.binary_dilation(labels == j, iterations=2)
    a = alpha * own
    a = np.where((green > 30) & (a < 1), 0, a)
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
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(a.start), "-t", str(a.len), "-i", a.clip, "-vf", f"fps={a.fps},scale=-2:{a.height}", "-q:v", "1", os.path.join(tmp, "%05d.png")], check=True)
    files = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    keyed = []
    box = None
    for f in files:
        rgb, alpha, b = key_one(np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")))
        keyed.append((rgb, alpha))
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        raise SystemExit("nothing keyed: the clip is not on chroma green")
    x0, y0, x1, y1 = box
    for i, (rgb, alpha) in enumerate(keyed, 1):
        rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(os.path.join(a.out, f"{i:05d}.png"))
    # how much of the figure's edge is still greenish after despill, per frame (an edge check for the review)
    spill = []
    for rgb, alpha in keyed:
        edge = (alpha > 0.05) & (alpha < 0.95)
        if edge.sum():
            e = rgb[edge]
            spill.append(float(np.mean((e[:, 1] - np.maximum(e[:, 0], e[:, 2])) > 20)))
    json.dump({"count": len(keyed), "fps": a.fps, "box": [x0, y0, x1, y1], "width": x1 - x0, "height": y1 - y0, "edgeGreenShare": spill}, open(os.path.join(a.out, "frames.json"), "w"), indent=1)
    print(f"{len(keyed)} frames, box {x1 - x0}x{y1 - y0}, edge green share max {max(spill) if spill else 0:.3f}")


if __name__ == "__main__":
    main()
