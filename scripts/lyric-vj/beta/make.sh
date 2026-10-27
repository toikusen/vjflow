#!/usr/bin/env bash
# One beta song's video in the tier the person chose, from its confirmed song.json:
#   none   = the new director without pictures, img = with props, hybrid = the cut-out story.
# Each step is skipped when its output exists, so a retried job resumes. Prints ##PHASE / ##COST lines for the queue;
# exit 10 = the video is made but a key story shot needs the admin's eye before it is handed over.
# usage: scripts/lyric-vj/beta/make.sh <song dir> <none|img|hybrid>
set -euo pipefail
d=$1; tier=$2
cd "$(dirname "$0")/../../.."
S=$d/song.json; w=$d/make
mkdir -p "$w"
end=$(python3 -c "import json,sys;print('%.2f'%json.load(open(sys.argv[1]))['duration'])" "$S")
# the cost a step wrote into its json (costUSD), or the last $ amount on its log
cost_json() { [ -f "$1" ] && python3 -c "import json,sys;print('##COST %.3f' % (json.load(open(sys.argv[1])).get('costUSD') or 0))" "$1" || true; }
cost_log() { local c; c=$(grep -oE '\$[0-9]+\.[0-9]+' "$1" | tail -1 | tr -d '$' || true); [ -n "$c" ] && echo "##COST $c" || true; }

echo '##PHASE 導演設計'
[ -f "$w/base/treatment.json" ] || { npx tsx scripts/lyric-vj/direct.mts --song "$S" --start 0 --end "$end" --out "$w/base" --style-id emotional --tier still --history out/design-history.json > "$w/direct.log" 2>&1; cost_json "$w/base/director.json"; }

plan() { # <out> [--sprites dir]
  [ -f "$1/treatment.json" ] && return
  npx tsx scripts/lyric-vj/typeplan.mts --song "$S" --treatment "$w/base/treatment.json" --backdrops "$w/base/treatment.json" --out "$@" > "$1.log" 2>&1
  cost_json "$1/typeplan.json"
}

case $tier in
  none)
    echo '##PHASE 編排文字動態'
    plan "$w/noimg"
    tr=$w/noimg ;;
  img)
    echo '##PHASE 畫道具'
    [ -f "$w/props/library/library.json" ] || { npx tsx scripts/lyric-vj/props.mts --song "$S" --treatment "$w/base/treatment.json" --out "$w/props" > "$w/props.log" 2>&1; cost_json "$w/props/props.json"; }
    echo '##PHASE 編排文字動態'
    plan "$w/img" --sprites "$w/props/library"
    tr=$w/img ;;
  hybrid)
    echo '##PHASE 編排文字動態'
    plan "$w/noimg"
    echo '##PHASE 寫故事、畫角色'
    [ -f "$w/kf/treatment.json" ] || { npx tsx scripts/lyric-vj/keyframes.mts --song "$S" --treatment "$w/base/treatment.json" --plan "$w/noimg" --sheets-only --from 0 --to "$end" --out "$w/kf" > "$w/kf.log" 2>&1; cost_log "$w/kf.log"; }
    echo '##PHASE 畫故事畫面'
    [ -f "$w/cut/treatment.json" ] || { npx tsx scripts/lyric-vj/cutout.mts --song "$S" --keyframes "$w/kf" --from 0 --to "$end" --out "$w/cut" > "$w/cut.log" 2>&1; cost_log "$w/cut.log"; }
    tr=$w/cut ;;
  *) echo "unknown tier $tier" >&2; exit 2 ;;
esac

# the song's own horizons in place of the four code skylines (horizon.mts; a plan without skylines spends nothing)
echo '##PHASE 畫背景剪影'
npx tsx scripts/lyric-vj/horizon.mts --song "$S" --treatment "$w/base/treatment.json" --out "$w/horizon" --apply "$tr" > "$w/horizon-$tier.log" 2>&1 && cost_log "$w/horizon-$tier.log" || echo "horizon skipped"
echo '##PHASE 輸出影片'
# render.mts refuses to finish with a black stretch left (blackSpans), so a made file has picture throughout
ls "$tr/video/"lyric-vj_vocal_0-*.mp4 > /dev/null 2>&1 || npx tsx scripts/lyric-vj/render.mts --song "$S" --treatment "$tr/treatment.json" --assets "$tr/assets.json" --start 0 --end "$end" --fps 30 --workers 2 --out "$tr/video" > "$w/render-$tier.log" 2>&1
rm -rf "$tr/video/render" "$tr/video/segments"
cp "$(ls "$tr/video/"lyric-vj_vocal_0-*.mp4 | head -1)" "$d/video-$tier.mp4"
[ "$tier" = hybrid ] && grep -q 'key shot kept' "$w/cut.log" && { echo '##PHASE 等管理者確認一張畫面'; exit 10; }
# a figure hiding much of a lyric holds the video for the admin. Tokyo Drift v2, which the user accepted, peaked at
# 35 % (render.mts logs "lyric covered … hides N%"); the 40 % line is that plus a margin, not a measured taste line
worst=$(grep -oE 'hides [0-9]+%' "$w/render-$tier.log" 2>/dev/null | grep -oE '[0-9]+' | sort -n | tail -1 || true)
[ -n "$worst" ] && [ "$worst" -gt 40 ] && { echo "##PHASE 等管理者確認：有歌詞被遮住 ${worst}%"; exit 10; }
echo '##PHASE 完成'
