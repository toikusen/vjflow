"""Moves each line's start onto the sung notes: the line's morae (Japanese is sung about one mora per note) are matched
in order to the vocal's note/consonant onsets near the aligner's character times by dynamic programming, and the line
starts at its first mora's onset. A research post-process for lyric timing.

uv run --with pykakasi python scripts/lyric-vj/mora_snap.py song.json onsets.json out.json [--window 0.6]
"""

import argparse
import json
import re

import pykakasi

kks = pykakasi.kakasi()
SMALL = set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ")
HELD = set("ーっッ〜～")


def morae(text):
    """Per visible character: how many morae start on it (0 for a small kana, punctuation, spaces)."""
    out = []
    for item in kks.convert(text):
        orig, hira = item["orig"], item["hira"]
        n = sum(1 for ch in hira if ch not in SMALL and ch not in HELD and re.match(r"[ぁ-ゖ]", ch))
        latin = re.findall(r"[A-Za-z]+", orig)
        if latin:
            n = sum(max(1, len(re.findall(r"[aeiouy]+", w.lower()))) for w in latin)
        chars = list(orig)
        if not chars:
            continue
        # spread the item's morae over its characters (a kanji word's reading)
        per = [0] * len(chars)
        voiced = [i for i, c in enumerate(chars) if not re.match(r"[\s\W_]", c) and c not in SMALL and c not in HELD]
        for k in range(n):
            if voiced:
                per[voiced[min(len(voiced) - 1, k * len(voiced) // max(1, n))]] += 1
        out += per
    return out


def snap(cue, onsets, window):
    text = cue["text"]
    starts = cue.get("charStarts")
    per = morae(text)
    if not starts or len(starts) != len(per):
        return cue["start"], None
    # predicted time of each mora (a char with k morae spreads them to the next char's start)
    pred = []
    for i, k in enumerate(per):
        nxt = starts[i + 1] if i + 1 < len(starts) else cue["end"]
        for j in range(k):
            pred.append(starts[i] + (nxt - starts[i]) * j / max(1, k))
    if len(pred) < 2:
        return cue["start"], None
    cand = [t for t in onsets if pred[0] - window <= t <= pred[-1] + 0.3]
    if not cand:
        return cue["start"], None
    # DP: morae in order onto onsets in order; a mora may go without an onset (legato), an onset may be skipped
    INF = 1e9
    M, N = len(pred), len(cand)
    MISS, SKIP = 0.25, 0.04
    dp = [[INF] * (N + 1) for _ in range(M + 1)]
    back = [[None] * (N + 1) for _ in range(M + 1)]
    for j in range(N + 1):
        dp[0][j] = j * SKIP
    for i in range(1, M + 1):
        dp[i][0] = dp[i - 1][0] + MISS
        back[i][0] = "miss"
        for j in range(1, N + 1):
            opts = [
                (dp[i - 1][j - 1] + abs(cand[j - 1] - pred[i - 1]), "match"),
                (dp[i - 1][j] + MISS, "miss"),
                (dp[i][j - 1] + SKIP, "skip"),
            ]
            dp[i][j], back[i][j] = min(opts)
    # trailing onsets after the last mora are free
    j = min(range(N + 1), key=lambda x: dp[M][x])
    i = M
    first = None
    while i > 0:
        b = back[i][j]
        if b == "match":
            if i == 1:
                first = cand[j - 1]
            i, j = i - 1, j - 1
        elif b == "miss":
            i -= 1
        else:
            j -= 1
    return (first if first is not None else cue["start"]), first


def main():
    p = argparse.ArgumentParser()
    p.add_argument("song")
    p.add_argument("onsets")
    p.add_argument("out")
    p.add_argument("--window", type=float, default=0.6)
    p.add_argument("--source", default="both", choices=["notes", "spectral", "both"])
    a = p.parse_args()
    song = json.load(open(a.song, encoding="utf-8"))
    o = json.load(open(a.onsets))
    onsets = sorted(([x[0] for x in o["notes"]] if a.source != "spectral" else []) + (o["onsets"] if a.source != "notes" else []))
    moved = 0
    for c in song["cues"]:
        s, hit = snap(c, onsets, a.window)
        if hit is not None and abs(s - c["start"]) > 0.02:
            shift = s - c["start"]
            c["start"] = s
            if c.get("charStarts"):
                c["charStarts"] = [x + shift for x in c["charStarts"]]
            moved += 1
    json.dump(song, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"moved {moved}/{len(song['cues'])} lines")


if __name__ == "__main__":
    main()
