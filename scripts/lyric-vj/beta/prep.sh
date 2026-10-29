#!/usr/bin/env bash
# An uploaded song made ready for the timing editor: the upload as mix.mp3, the vocal stems, the person's own lyrics
# aligned (never a lyric site's: they are the authority), suspected typos flagged.
# usage: scripts/lyric-vj/beta/prep.sh <song dir> <language> "<artist - title>"
# The song dir holds upload.* and lyrics.txt (written by the beta server).
set -euo pipefail
d=$1; lang=$2; title=$3
cd "$(dirname "$0")/../../.."
echo '##PHASE 讀取音檔'
[ -f "$d/mix.mp3" ] || ffmpeg -v error -y -i "$(ls "$d"/upload.* | head -1)" -vn -codec:a libmp3lame -q:a 0 "$d/mix.mp3"
echo '##PHASE 分離人聲'
bash scripts/lyric-vj/stems.sh "$d"
echo '##PHASE 對齊歌詞時間'
# the title is the person's own text: joined to its option with =, since parseArgs reads a separate value that starts
# with - as another option and fails (an artist or title such as "-ERROR")
npx tsx scripts/lyric-vj/song.mts --audio "$d/mix.mp3" --vocals "$d/vocals.wav" --vocals-alt "$d/vocals_kim.wav" --title="$title" --lyrics "$d/lyrics.txt" --no-lrclib --out "$d" --language "$lang"
echo '##PHASE 檢查錯字'
npx tsx scripts/lyric-vj/proofread.mts --song "$d/song.json" 2>&1 | tee "$d/proofread.log" || echo "proofread skipped"
cost=$(grep -oE '\$[0-9.]+' "$d/proofread.log" | tail -1 | tr -d '$' || true)
[ -n "$cost" ] && awk -v c="$cost" 'BEGIN{exit !(c>0)}' && echo "##COST $cost proofread"
true
