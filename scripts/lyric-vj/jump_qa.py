"""Sudden jumps in a code layer's background: frame pairs 1/30 s apart (rendered --layer back) whose difference is
large. Run around the moments a lyric line appears (where a drawing that makes room by snapping would jump).

uv run --with numpy --with pillow python scripts/lyric-vj/jump_qa.py <stills dir> <t1,t2,...> out.json   (pairs t, t+1/30)
"""

import json
import sys

import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert("L").resize((192, 108)), dtype=np.int16)


def main():
    d, times, out = sys.argv[1], [float(x) for x in sys.argv[2].split(",")], sys.argv[3]
    res = []
    for t in times:
        a, b = load(f"{d}/still_{t:.2f}.png"), load(f"{d}/still_{t + 0.03:.2f}.png")
        res.append({"t": t, "diff": round(float(np.abs(a - b).mean()), 2)})
    json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
