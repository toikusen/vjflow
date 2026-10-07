#!/usr/bin/env bash
# Test songs from the vjanalytics database: audio of the analysed YouTube lyric video → Demucs vocal stem → song.json.
# Internal testing only; the audio stays under out/db/ (gitignored).
# usage: scripts/lyric-vj/prep-db-song.sh <video_id> [language: ja (default) | zh | en | ko]
set -euo pipefail
id=$1
lang=${2:-ja}
VJA=~/vjanalytics
d=out/db/$id
mkdir -p "$d"
meta=$(python3 -c "import json,sys;v=json.load(open('$VJA/out/results/$id.json'));print(v['source']['artist']+' - '+v['source']['title'])")
url="https://www.youtube.com/watch?v=${id#yt_}"
[ -f "$d/mix.mp3" ] || yt-dlp -q -x --audio-format mp3 --audio-quality 0 -o "$d/mix.%(ext)s" "$url"
if [ ! -f "$d/vocals.wav" ]; then
  "$VJA/.venv/bin/python" -m demucs --two-stems=vocals -n htdemucs -o "$d/demucs" "$d/mix.mp3" > "$d/demucs.log" 2>&1
  mv "$(find "$d/demucs" -name vocals.wav | head -1)" "$d/vocals.wav"
  rm -rf "$d/demucs"
fi
# a second separation (Mel-RoFormer, Kim) for the lyric-timing vote in song.mts
if [ ! -f "$d/vocals_kim.wav" ]; then
  uv run -q --python 3.11 --with "audio-separator[cpu]" audio-separator "$d/mix.mp3" -m vocals_mel_band_roformer.ckpt \
    --output_dir "$d/kim" --output_format WAV --model_file_dir ~/.cache/audio-separator > "$d/kim.log" 2>&1
  mv "$(find "$d/kim" -iname '*(vocals)*.wav' | head -1)" "$d/vocals_kim.wav"
  rm -rf "$d/kim"
fi
# the database's lyric lookup (web text, no timing) is the text Whisper aligns when LRCLIB has nothing synced
python3 -c "import json;open('$d/db-lyrics.txt','w').write('\\n'.join(json.load(open('$VJA/out/lyrics/$id.json')).get('lines') or []))"
npx tsx scripts/lyric-vj/song.mts --audio "$d/mix.mp3" --vocals "$d/vocals.wav" --vocals-alt "$d/vocals_kim.wav" --title "$meta" --lyrics "$d/db-lyrics.txt" --out "$d" --language "$lang"
