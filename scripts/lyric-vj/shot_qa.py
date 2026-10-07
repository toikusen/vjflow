"""Per-shot background check for a code layer: how much of the frame moves over 0.3 s and how much of it is more than
the flat ground colour. Rendered with --layer back (no lyrics), stills at each shot's middle and 0.3 s later.

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
        a, b = load(f"{d}/still_{t:.2f}.png"), load(f"{d}/still_{t + 0.3:.2f}.png")
        motion = float((np.abs(a - b).max(axis=2) > 12).mean())
        # the ground: the most common colour (quantised); detail = pixels clearly away from it
        q = (a // 16).reshape(-1, 3)
        vals, counts = np.unique(q, axis=0, return_counts=True)
        ground = vals[counts.argmax()] * 16 + 8
        detail = float((np.abs(a - ground).max(axis=2) > 28).mean())
        res.append({"shot": i, "t": t, "motion": round(motion, 3), "detail": round(detail, 3)})
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
