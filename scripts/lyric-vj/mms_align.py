"""Forced alignment with Meta's MMS aligner (torchaudio MMS_FA, CTC) on romanised lyrics: a second aligner family,
independent of Whisper. Lines are read as kana (pykakasi) and romanised; output matches force_align.py.

uv run --with torch --with torchaudio --with pykakasi --with soundfile python scripts/lyric-vj/mms_align.py vocals.wav lyrics.txt out.json
"""

import json
import re
import sys

import pykakasi
import soundfile as sf
import torch
import torchaudio

kks = pykakasi.kakasi()


def romaji(line):
    words = []
    for item in kks.convert(line):
        r = re.sub(r"[^a-z]", "", (item["hepburn"] or "").lower())
        if r:
            words.append(r)
    return words


def main():
    vocals, lyrics, out = sys.argv[1:4]
    lines = [l.strip() for l in open(lyrics, encoding="utf-8") if l.strip()]
    wav, sr = sf.read(vocals, dtype="float32", always_2d=True)
    wav = torch.from_numpy(wav.mean(axis=1))[None]
    bundle = torchaudio.pipelines.MMS_FA
    wav = torchaudio.functional.resample(wav, sr, bundle.sample_rate)
    model = bundle.get_model(with_star=False)
    with torch.inference_mode():
        # in 30 s windows (the model's attention is quadratic), stitched along time
        step = bundle.sample_rate * 30
        ems = [model(wav[:, i : i + step])[0] for i in range(0, wav.shape[1], step)]
        emission = torch.cat(ems, dim=1)
    words, owner = [], []
    for k, l in enumerate(lines):
        w = romaji(l) or ["a"]
        words += w
        owner += [k] * len(w)
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()
    spans = aligner(emission[0], tokenizer(words))
    ratio = wav.shape[1] / emission.shape[1] / bundle.sample_rate
    res = []
    for k, l in enumerate(lines):
        idx = [i for i, o in enumerate(owner) if o == k]
        ws = [{"text": words[i], "start": round(spans[i][0].start * ratio, 3), "end": round(spans[i][-1].end * ratio, 3), "p": round(float(sum(s.score for s in spans[i]) / len(spans[i])), 3)} for i in idx]
        res.append({"text": l, "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
    json.dump({"model": "MMS_FA", "lines": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(res)} lines")


if __name__ == "__main__":
    main()
