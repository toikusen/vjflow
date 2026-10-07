"""Note onsets of a vocal stem: where a sung note starts (a voiced run begins, or the pitch steps to a new note), plus
spectral onsets (consonants). Japanese is sung about one mora per note, so lyric characters start on these.

uv run --with librosa python scripts/lyric-vj/vocal_onsets.py vocals.wav out.json
"""

import json
import sys

import librosa
import numpy as np

SR = 16000
HOP = 160  # 10 ms


def main() -> None:
    y, _ = librosa.load(sys.argv[1], sr=SR, mono=True)
    f0, voiced, _ = librosa.pyin(y, fmin=80, fmax=1000, sr=SR, frame_length=1024, hop_length=HOP)
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=HOP)[0]
    t = librosa.frames_to_time(np.arange(len(f0)), sr=SR, hop_length=HOP)
    midi = librosa.hz_to_midi(np.where(voiced, f0, np.nan))
    notes = []
    run = 0
    for i in range(1, len(t)):
        if not voiced[i]:
            run = 0
            continue
        run += 1
        if run == 1 and (i < 3 or not voiced[i - 3 : i].any()):
            notes.append((t[i], "voice"))
        elif i >= 6 and voiced[i - 6 : i].all():
            # a step to a new pitch held for 60 ms
            before = np.nanmedian(midi[i - 6 : i - 1])
            after = midi[i : i + 6]
            if len(after) == 6 and np.all(np.abs(after - before) > 0.8) and np.nanstd(after) < 0.5:
                if not notes or t[i] - notes[-1][0] > 0.08:
                    notes.append((t[i], "pitch"))
    on = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, backtrack=True, units="time")
    loud = np.percentile(rms, 30)
    spectral = [float(x) for x in on if rms[min(len(rms) - 1, int(x * SR / HOP) + 3)] > loud]
    json.dump({"notes": [[round(float(a), 3), k] for a, k in notes], "onsets": [round(x, 3) for x in spectral]}, open(sys.argv[2], "w"))
    print(f"{len(notes)} note starts, {len(spectral)} spectral onsets")


if __name__ == "__main__":
    main()
