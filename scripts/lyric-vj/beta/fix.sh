#!/usr/bin/env bash
# A fix of a finished video, made as a new version in its own run (the old run stays as it was):
#   picture = the pictures shown in the marked ranges are removed (img tier: the saved type plan is edited and rebuilt
#             with typeplan --plan, no model call); timing = the song's current timing replaces the run's snapshot.
# The source run is copied without its video, stills and logs, then make.sh renders it: every step before the
# horizon finds its output and skips, so only the horizon and the render run. A retried job copies again only when
# the fix was not applied yet (.fix-applied), else it resumes make.sh.
# A picture fix whose ranges hold no picture prints `##NORETRY <reason>` and exits 3 before any render: the job fails
# (charged nothing) and is not retried by itself, since a retry would find the same nothing.
# The hybrid admin hold in make.sh (its grep of cut.log for a kept key shot) does not apply to a fix: the source's key
# shot was already approved, and cut.log is not copied (no *.log is), so the grep finds nothing and the fix is handed over.
# usage: scripts/lyric-vj/beta/fix.sh <song dir> <none|img|hybrid> <new run> <from run> <picture|timing> [<ranges json>]
set -euo pipefail
d=$1; tier=$2; run=$3; from=$4; kind=$5; ranges=${6:-[]}
cd "$(dirname "$0")/../../.."
case $tier in none) td=noimg ;; img) td=img ;; hybrid) td=cut ;; *) echo "unknown tier $tier" >&2; exit 2 ;; esac
case $kind in picture | timing) ;; *) echo "unknown fix $kind" >&2; exit 2 ;; esac
[ "$kind" = picture ] && [ "$tier" != img ] && { echo "a picture fix needs the img tier" >&2; exit 2; }
[ -n "$run" ] && [ "$run" != "$from" ] || { echo "the new run must differ from the source run" >&2; exit 2; }
[ -f "$from/song.json" ] || { echo "no source run at $from" >&2; exit 2; }
# a guard (no run has symlinks today): a link whose target resolves outside the song folder is never copied along
song_real=$(cd "$d" && pwd -P)
while IFS= read -r -d '' l; do
  target=$(python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]))" "$l")
  case $target in "$song_real" | "$song_real"/*) ;; *) echo "refusing to copy: symlink $l points outside the song folder ($target)" >&2; exit 2 ;; esac
done < <(find "$from" -type l -print0)

echo '##PHASE 套用修正'
if [ ! -f "$run/.fix-applied" ]; then
  rm -rf "$run"
  mkdir -p "$run"
  # rsync -a copies symlinks as links (never what they point to); video/ at any depth, so <tier dir>/video goes too
  # a source that is itself a fix carries its own marker and record: they are this fix's to write
  rsync -a --exclude='/video.mp4*' --exclude='video/' --exclude='stills/' --exclude='stills.tmp/' --exclude='*.log' --exclude='/.fix-applied' --exclude='/fix.json' "$from/" "$run/"
  rm -rf "$run/$td/video"
  if [ "$kind" = picture ]; then
    rc=0; npx tsx scripts/lyric-vj/beta/fix-apply.mts --run "$run" --kind picture --ranges "$ranges" || rc=$?
    [ "$rc" = 3 ] && { echo '##NORETRY 標記的範圍裡沒有可以拿掉的圖'; exit 3; }
    [ "$rc" = 0 ] || exit "$rc"
    # the same arguments as make.sh's plan() for img, so the rebuilt assets match the run's props
    npx tsx scripts/lyric-vj/typeplan.mts --song "$run/song.json" --treatment "$run/base/treatment.json" --backdrops "$run/base/treatment.json" --out "$run/img" --sprites "$run/props/library" --plan "$run/img/typeplan.json" > "$run/fix-plan.log" 2>&1
  else
    cp "$d/song.json" "$run/song.json.tmp" && mv "$run/song.json.tmp" "$run/song.json"
    python3 -c "import json,sys,datetime;json.dump({'kind':'timing','ranges':json.loads(sys.argv[2]),'at':datetime.datetime.now(datetime.timezone.utc).isoformat()},open(sys.argv[1],'w'))" "$run/fix.json" "$ranges"
  fi
  touch "$run/.fix-applied"
fi

exec bash scripts/lyric-vj/beta/make.sh "$d" "$tier" "$run"
