#!/usr/bin/env bash
# Any song from YouTube (internal testing; audio stays under out/db/, gitignored): audio → Demucs and Mel-RoFormer
# vocal stems → plain lyrics from LRCLIB as the fallback text → song.json (LRCLIB synced lines when they pass the
# vocal check, else the seven-timing vote).
# usage: scripts/lyric-vj/prep-song.sh <youtube id> "<artist - title>" [language: ja (default) | en | ko | zh]
set -euo pipefail
yid=$1; meta=$2; lang=${3:-ja}
d=out/db/yt_$yid
mkdir -p "$d"
[ -f "$d/mix.mp3" ] || yt-dlp -q -x --audio-format mp3 --audio-quality 0 -o "$d/mix.%(ext)s" "https://www.youtube.com/watch?v=$yid"
bash scripts/lyric-vj/stems.sh "$d"
# plain text for the aligners when LRCLIB's synced lines don't pass (closest duration wins)
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$d/mix.mp3")
python3 - "$meta" "$dur" "$d/lyrics-source.txt" <<'PY'
import json, sys, urllib.parse, urllib.request
meta, dur, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
r = json.load(urllib.request.urlopen("https://lrclib.net/api/search?" + urllib.parse.urlencode({"q": meta})))
r = [x for x in r if x.get("plainLyrics")]
if not r: sys.exit("LRCLIB has no lyrics for " + meta)
x = min(r, key=lambda x: abs((x.get("duration") or 0) - dur))
open(out, "w").write(x["plainLyrics"])
print(f"lyrics: {x['artistName']} - {x['trackName']} ({x['duration']} s)")
PY
npx tsx scripts/lyric-vj/song.mts --audio "$d/mix.mp3" --vocals "$d/vocals.wav" --vocals-alt "$d/vocals_kim.wav" --title "$meta" --lyrics "$d/lyrics-source.txt" --out "$d" --language "$lang"
# the lyric site's homophone slips (下得 for 下的), flagged for the timing editor; never applied on their own
npx tsx scripts/lyric-vj/proofread.mts --song "$d/song.json" || echo "proofread skipped (the lines still read as typed)"
