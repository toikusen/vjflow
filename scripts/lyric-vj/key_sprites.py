"""Green-screen sprite sheet → transparent PNG frames: keys out #00B140 (and its ground shadows), despills the edges,
finds each figure as a blob (sheets don't keep to a grid) and writes them in reading order, trimmed, with frames.json
(size of each; the drawing anchor is the bottom centre, the feet).

uv run --with numpy --with pillow --with scipy python scripts/lyric-vj/key_sprites.py sheet.jpg out_dir [--drop 11,12] [--min 0.01]
"""

import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet")
    p.add_argument("out")
    p.add_argument("--drop", default="", help="1-based frames to leave out")
    p.add_argument("--min", type=float, default=0.01, help="smallest blob, as a share of the sheet area")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    im = np.asarray(Image.open(a.sheet).convert("RGB")).astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    green = g - np.maximum(r, b)
    # fully keyed where clearly green; a soft edge where it fades in
    # the screen (#00B140) is ~110 greener than its red/blue; mint (#8FC9A3) only ~40, so it stays opaque
    alpha = np.clip(1 - (green - 60) / 40, 0, 1)
    # ground shadows the model draws anyway: dark greens (little red, green still leading) go with the screen
    alpha = np.where((r < 80) & (green > 25), 0, alpha)
    mask = alpha > 0.5
    # despill only the rim next to the keyed screen: mint and other greenish colours inside a figure stay as drawn
    rim = mask & ~ndimage.binary_erosion(mask, iterations=3)
    rgb = im.copy()
    rgb[..., 1] = np.where(rim & (green > 0), np.maximum(r, b), g)
    # a figure plus the prop it holds is one blob: close small gaps first
    labels, n = ndimage.label(ndimage.binary_closing(mask, iterations=6))
    boxes = [(s, j) for j, s in enumerate(ndimage.find_objects(labels), 1) if s and (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > a.min * mask.size]
    # reading order: rows by the figure's foot line, then left to right
    h = mask.shape[0]
    boxes.sort(key=lambda b: (round(b[0][0].stop / (h / 4)), b[0][1].start))
    drop = {int(x) for x in a.drop.split(",") if x}
    frames = []
    k = 0
    for i, ((ys, xs), j) in enumerate(boxes, 1):
        if i in drop:
            continue
        # only this figure: specks of other blobs and half-keyed green inside its box are cleared (a green dot rode
        # along on 黄昏サイクル's portrait window)
        own = ndimage.binary_dilation(labels[ys, xs] == j, iterations=2)
        a_crop = alpha[ys, xs] * own
        a_crop = np.where((green[ys, xs] > 30) & (a_crop < 1), 0, a_crop)
        rgba = np.dstack([rgb[ys, xs], (a_crop * 255)]).astype(np.uint8)
        name = f"f{k:02d}.png"
        Image.fromarray(rgba, "RGBA").save(os.path.join(a.out, name))
        frames.append({"file": name, "w": int(xs.stop - xs.start), "h": int(ys.stop - ys.start), "x": int(xs.start), "y": int(ys.start), "sheetIndex": i})
        k += 1
    json.dump({"frames": frames}, open(os.path.join(a.out, "frames.json"), "w"), indent=1)
    print(f"{len(boxes)} figures found, {len(frames)} frames written")


if __name__ == "__main__":
    main()
