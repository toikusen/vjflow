"""Word timestamps of a vocal stem (mlx-whisper, Apple Silicon). Alignment to the known lyrics happens in align.ts.

uv run --with mlx-whisper python scripts/lyric-vj/asr.py vocals.wav lyrics.txt out.json [--language ja]
The lyrics are passed as the initial prompt so Whisper prefers the song's own spelling (kanji vs kana).
"""

import argparse
import json

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("vocals")
    p.add_argument("lyrics")
    p.add_argument("out")
    p.add_argument("--language", default="ja")
    a = p.parse_args()
    lyrics = open(a.lyrics, encoding="utf-8").read()
    r = mlx_whisper.transcribe(
        a.vocals,
        path_or_hf_repo=MODEL,
        language=a.language,
        word_timestamps=True,
        initial_prompt=lyrics[:400],
        condition_on_previous_text=False,  # stops repeated-line hallucination loops on long sustained notes
    )
    words = [
        {"text": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3), "p": round(w.get("probability", 0), 3)}
        for seg in r["segments"]
        for w in seg.get("words", [])
    ]
    json.dump({"model": MODEL, "language": a.language, "words": words}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(words)} words")


if __name__ == "__main__":
    main()
