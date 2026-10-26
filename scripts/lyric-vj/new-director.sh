#!/usr/bin/env bash
# The new director's full run for one prepared song: old director -> props -> type plans without and with props ->
# render both. Each step is skipped when its output exists, so a broken run resumes.
# usage: scripts/lyric-vj/new-director.sh <song.json> <out dir>
set -uo pipefail
S=$1; d=$2; export VJ_UNCONFIRMED=1
cd "$(dirname "$0")/../.."
mkdir -p "$d/base" "$d/noimg" "$d/img"
end=$(python3 -c "import json,sys;print('%.2f'%json.load(open(sys.argv[1]))['duration'])" "$S")
log() { echo "$(date +%H:%M:%S) $*" >> "$d/run.log"; }
[ -f "$d/base/treatment.json" ] || { log direct; npx tsx scripts/lyric-vj/direct.mts --song "$S" --start 0 --end "$end" --out "$d/base" --style-id emotional --tier still --history out/design-history.json > "$d/direct.log" 2>&1 || { log "direct failed"; exit 1; }; }
[ -f "$d/props/library/library.json" ] || { log props; npx tsx scripts/lyric-vj/props.mts --song "$S" --treatment "$d/base/treatment.json" --out "$d/props" > "$d/props.log" 2>&1 || { log "props failed"; exit 1; }; }
log plan
[ -f "$d/noimg/typeplan.json" ] || npx tsx scripts/lyric-vj/typeplan.mts --song "$S" --treatment "$d/base/treatment.json" --backdrops "$d/base/treatment.json" --out "$d/noimg" > "$d/noimg.log" 2>&1 &
[ -f "$d/img/typeplan.json" ] || npx tsx scripts/lyric-vj/typeplan.mts --song "$S" --treatment "$d/base/treatment.json" --backdrops "$d/base/treatment.json" --sprites "$d/props/library" --out "$d/img" > "$d/img.log" 2>&1 &
wait
for n in noimg img; do
  [ -f "$d/$n/treatment.json" ] || { log "plan $n failed"; continue; }
  log "render $n"
  ls "$d/$n/video/"lyric-vj_vocal_0-*.mp4 >/dev/null 2>&1 || npx tsx scripts/lyric-vj/render.mts --song "$S" --treatment "$d/$n/treatment.json" --assets "$d/$n/assets.json" --start 0 --end "$end" --fps 30 --workers 2 --out "$d/$n/video" > "$d/$n/full.log" 2>&1
  rm -rf "${d:?}/$n/video/render" "${d:?}/$n/video/segments"
done
log done
