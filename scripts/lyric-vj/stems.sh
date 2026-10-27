#!/usr/bin/env bash
# The two vocal stems the aligners vote with: Demucs (vocals.wav) and Mel-RoFormer (vocals_kim.wav), from <dir>/mix.mp3.
# Each is skipped when it exists. usage: scripts/lyric-vj/stems.sh <song dir>
set -euo pipefail
d=$1
VJA=~/vjanalytics
if [ ! -f "$d/vocals.wav" ]; then
  "$VJA/.venv/bin/python" -m demucs --two-stems=vocals -n htdemucs -o "$d/demucs" "$d/mix.mp3" > "$d/demucs.log" 2>&1
  mv "$(find "$d/demucs" -name vocals.wav | head -1)" "$d/vocals.wav"
  rm -rf "$d/demucs"
fi
if [ ! -f "$d/vocals_kim.wav" ]; then
  uv run -q --python 3.11 --with "audio-separator[cpu]" audio-separator "$d/mix.mp3" -m vocals_mel_band_roformer.ckpt \
    --output_dir "$d/kim" --output_format WAV --model_file_dir ~/.cache/audio-separator > "$d/kim.log" 2>&1
  mv "$(find "$d/kim" -iname '*(vocals)*.wav' | head -1)" "$d/vocals_kim.wav"
  rm -rf "$d/kim"
fi
