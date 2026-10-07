"""Scores a lyric timing against a reference (a timing confirmed in the timing editor, or human-synced LRC lines).

python3 scripts/lyric-vj/align-eval.py <reference song.json | .lrc> <candidate song.json> [...more candidates]
Line starts only (what a user corrects): count off by more than 0.3 s, median and mean absolute error, and the error
after removing a constant offset (an LRC's syncer tends to lead or lag the voice by a fixed amount).
"""

import json
import re
import statistics
import sys


def starts(path):
    if path.endswith(".lrc"):
        out = []
        for line in open(path, encoding="utf-8"):
            m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)", line)
            if m and m.group(3).strip():
                out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
        return out
    return [(c["start"], c["text"]) for c in json.load(open(path, encoding="utf-8"))["cues"]]


def score(ref, cand):
    if len(ref) != len(cand):
        return {"error": f"{len(cand)} lines vs {len(ref)}"}
    d = [c[0] - r[0] for r, c in zip(ref, cand)]
    e = [abs(x) for x in d]
    off = statistics.median(d)
    e2 = [abs(x - off) for x in d]
    return {
        "off>0.3": sum(x > 0.3 for x in e),
        "off>0.5": sum(x > 0.5 for x in e),
        "median": round(statistics.median(e), 3),
        "mean": round(statistics.mean(e), 3),
        "bias": round(off, 3),
        "off>0.3 (bias removed)": sum(x > 0.3 for x in e2),
        "worst": sorted(((round(x, 2), i + 1) for i, x in enumerate(d)), key=lambda t: -abs(t[0]))[:5],
    }


if __name__ == "__main__":
    ref = starts(sys.argv[1])
    for c in sys.argv[2:]:
        print(c, json.dumps(score(ref, starts(c)), ensure_ascii=False))
