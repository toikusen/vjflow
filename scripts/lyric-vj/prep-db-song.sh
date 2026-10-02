#!/usr/bin/env bash
# Test songs from the vjanalytics database: audio of the analysed YouTube lyric video → Demucs vocal stem → song.json.
# Internal testing only; the audio stays under out/db/ (gitignored).
# usage: scripts/lyric-vj/prep-db-song.sh <video_id>
set -euo pipefail
id=$1
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
# the database's lyric lookup (web text, no timing) is the text Whisper aligns when LRCLIB has nothing synced
python3 -c "import json;open('$d/db-lyrics.txt','w').write('\\n'.join(json.load(open('$VJA/out/lyrics/$id.json')).get('lines') or []))"
npx tsx scripts/lyric-vj/song.mts --audio "$d/mix.mp3" --vocals "$d/vocals.wav" --title "$meta" --lyrics "$d/db-lyrics.txt" --out "$d"
