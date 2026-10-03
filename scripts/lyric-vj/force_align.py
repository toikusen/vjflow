"""Forced alignment of known lyric lines to a vocal stem (stable-ts on Whisper): line start/end times.

uv run --with stable-ts python scripts/lyric-vj/force_align.py vocals.wav lyrics.txt out.json [--language ja]
Unlike transcribe-then-match, every line gets a time from the audio; low word probabilities flag doubtful lines.
"""

import argparse
import json

import stable_whisper

MODEL = "large-v3-turbo"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("vocals")
    p.add_argument("lyrics")
    p.add_argument("out")
    p.add_argument("--language", default="ja")
    a = p.parse_args()
    lines = [l.strip() for l in open(a.lyrics, encoding="utf-8") if l.strip()]
    model = stable_whisper.load_model(MODEL, device="cpu")
    # one segment per lyric line, kept as given
    r = model.align(a.vocals, "\n".join(lines), language=a.language, original_split=True)
    out = []
    for seg in r.segments:
        words = [{"text": w.word, "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability or 0, 3)} for w in seg.words]
        out.append({"text": seg.text.strip(), "start": round(seg.start, 3), "end": round(seg.end, 3), "words": words})
    json.dump({"model": MODEL, "lines": out}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(out)} segments for {len(lines)} lines")


if __name__ == "__main__":
    main()
