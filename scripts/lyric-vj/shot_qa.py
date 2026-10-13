"""Per-shot background check for a code layer: how much of the frame moves over 0.3 s and how much of it is more than
the flat ground colour, how much one flat colour covers, how washed out it is. Rendered with --layer back (no lyrics), stills at each shot's middle and 0.3 s later.

uv run --with numpy --with pillow python scripts/lyric-vj/shot_qa.py <stills dir> <t1,t2,...> out.json
"""

import json
import sys

import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert("RGB").resize((480, 270)), dtype=np.int16)


def main():
    d, times, out = sys.argv[1], [float(x) for x in sys.argv[2].split(",")], sys.argv[3]
    res = []
    for i, t in enumerate(times):
        try:
            a, b = load(f"{d}/still_{t:.2f}.png"), load(f"{d}/still_{t + 0.3:.2f}.png")
        except (OSError, ValueError):  # a still the renderer failed to write (missing or cut short): skip that shot
            continue
        motion = float((np.abs(a - b).max(axis=2) > 12).mean())
        # the ground: the most common colour (quantised); detail = pixels clearly away from it
        q = (a // 16).reshape(-1, 3)
        vals, counts = np.unique(q, axis=0, return_counts=True)
        ground = vals[counts.argmax()] * 16 + 8
        detail = float((np.abs(a - ground).max(axis=2) > 28).mean())
        # one flat colour over much of the frame (a slab), and a washed-out frame (grey haze): low light/dark spread
        # and low saturation
        flat = float(counts.max() / counts.sum())
        f = a.astype(np.float32) / 255
        luma = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]
        sat = float((f.max(axis=2) - f.min(axis=2)).mean())
        res.append({"shot": i, "t": t, "motion": round(motion, 3), "detail": round(detail, 3), "flat": round(flat, 3), "spread": round(float(luma.std()), 3), "sat": round(sat, 3)})
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
