#!/usr/bin/env bash
# One beta song's video in the tier the person chose, from its confirmed song.json:
#   none   = the new director without pictures, img = with props, hybrid = the cut-out story.
# Each step is skipped when its output exists, so a retried job resumes. Prints ##PHASE / ##COST lines for the queue;
# exit 10 = the video is made but a key story shot needs the admin's eye before it is handed over.
# Everything of one job lives in its run dir: a snapshot of song.json taken at the start, the steps' files, video.mp4.
# Without a run dir (a server still on the old layout) it works in the song dir as before: make/ and video-<tier>.mp4.
# usage: scripts/lyric-vj/beta/make.sh <song dir> <none|img|hybrid> [<run dir>]
set -euo pipefail
d=$1; tier=$2; run=${3:-}
cd "$(dirname "$0")/../../.."
if [ -n "$run" ]; then
  mkdir -p "$run"
  [ -f "$run/song.json" ] || cp "$d/song.json" "$run/song.json"
  S=$run/song.json; w=$run; out=$run/video.mp4
else
  S=$d/song.json; w=$d/make; out=$d/video-$tier.mp4
  mkdir -p "$w"
fi
end=$(python3 -c "import json,sys;print('%.2f'%json.load(open(sys.argv[1]))['duration'])" "$S")
# the cost a step wrote into its json (costUSD), or the last $ amount on its log; the key (2nd argument) makes a step count once.
# Nothing is printed when the cost is missing or zero: a ##COST line locks its key, so a 0 would drop the real cost on a rerun.
cost_json() { [ -f "$1" ] && python3 -c "import json,sys;c=json.load(open(sys.argv[1])).get('costUSD') or 0;c>0 and print('##COST %.3f %s' % (c, sys.argv[2]))" "$1" "$2" || true; }
cost_log() { local c; c=$(grep -oE '\$[0-9]+\.[0-9]+' "$1" | tail -1 | tr -d '$' || true); [ -n "$c" ] && awk -v c="$c" 'BEGIN{exit !(c>0)}' && echo "##COST $c $2" || true; }

echo '##PHASE 導演規劃段落與故事'
# direct.mts logs "attempt N: E errors" after each story draft, then designs the look: those lines become phases
[ -f "$w/base/treatment.json" ] || { npx tsx scripts/lyric-vj/direct.mts --song "$S" --start 0 --end "$end" --out "$w/base" --style-id emotional --tier still --history out/design-history.json 2>&1 | tee "$w/direct.log" | awk '/^attempt [0-9]+: 0 errors/ { print "##PHASE 導演設計視覺風格"; fflush() } /^attempt [0-9]+: [1-9]/ { print "##PHASE 導演修正故事草稿"; fflush() }'; cost_json "$w/base/director.json" direct; }

plan() { # <out> [--sprites dir]
  [ -f "$1/treatment.json" ] && return
  npx tsx scripts/lyric-vj/typeplan.mts --song "$S" --treatment "$w/base/treatment.json" --backdrops "$w/base/treatment.json" --out "$@" > "$1.log" 2>&1
  cost_json "$1/typeplan.json" "plan-$(basename "$1")"
}

case $tier in
  none)
    echo '##PHASE 編排文字動態'
    plan "$w/noimg"
    tr=$w/noimg ;;
  img)
    echo '##PHASE 畫道具'
    [ -f "$w/props/library/library.json" ] || { npx tsx scripts/lyric-vj/props.mts --song "$S" --treatment "$w/base/treatment.json" --out "$w/props" > "$w/props.log" 2>&1; cost_json "$w/props/props.json" props; }
    echo '##PHASE 編排文字動態'
    # an accepted concept's plan (noimg/typeplan.json) is kept: only the props are placed into its cuts (--bind), so the
    # video is the concept the person accepted; a run from before the concept gate plans afresh
    if [ -f "$w/noimg/typeplan.json" ]; then plan "$w/img" --sprites "$w/props/library" --bind "$w/noimg/typeplan.json"; else plan "$w/img" --sprites "$w/props/library"; fi
    tr=$w/img ;;
  hybrid)
    echo '##PHASE 編排文字動態'
    plan "$w/noimg"
    echo '##PHASE 寫故事、畫角色'
    # the accepted concept's effective request (request.txt: its text plus the adjust notes of its chain, written by
    # concept.sh; brief.txt on a run from before) and its first reference image reach the story the way the director
    # got them: keyframes keeps them as the board's userStyle, which cutout then draws in
    kf=() # expanded as ${kf[@]+...}: an empty array is unbound under set -u in bash 3.2
    req=$w/request.txt; [ -f "$req" ] || req=$w/brief.txt
    [ -f "$req" ] && [ -n "$(tr -d '[:space:]' < "$req")" ] && kf+=(--style="$(cat "$req")")
    ref=; for f in "$w"/refs/*; do [ -f "$f" ] && { ref=$f; break; }; done
    [ -n "$ref" ] && kf+=(--style-ref "$ref")
    [ -f "$w/kf/treatment.json" ] || { npx tsx scripts/lyric-vj/keyframes.mts --song "$S" --treatment "$w/base/treatment.json" --plan "$w/noimg" --sheets-only --from 0 --to "$end" --out "$w/kf" ${kf[@]+"${kf[@]}"} > "$w/kf.log" 2>&1; cost_log "$w/kf.log" keyframes; }
    echo '##PHASE 畫故事畫面'
    [ -f "$w/cut/treatment.json" ] || { npx tsx scripts/lyric-vj/cutout.mts --song "$S" --keyframes "$w/kf" --treatment "$w/base/treatment.json" --from 0 --to "$end" --out "$w/cut" > "$w/cut.log" 2>&1; cost_log "$w/cut.log" cutout; }
    tr=$w/cut ;;
  *) echo "unknown tier $tier" >&2; exit 2 ;;
esac

# the song's own horizons in place of the four code skylines (horizon.mts; a plan without skylines spends nothing)
echo '##PHASE 畫背景剪影'
npx tsx scripts/lyric-vj/horizon.mts --song "$S" --treatment "$w/base/treatment.json" --out "$w/horizon" --apply "$tr" > "$w/horizon-$tier.log" 2>&1 && cost_log "$w/horizon-$tier.log" horizon || echo "horizon skipped"
echo '##PHASE 輸出影片'
# render.mts refuses to finish with a black stretch left (blackSpans), so a made file has picture throughout.
# A retry resumes only on a finished render of these very inputs: the manifest (a digest of the song, the treatment as
# horizon left it, the assets, the renderer's sources and its flags, written after the mux) must match, so a video file
# alone (a render killed midway, or one whose mux never ran), a video of an earlier treatment or one of an older renderer
# is rendered again rather than handed over
sig=$({ cat "$S" "$tr/treatment.json" "$tr/assets.json" scripts/lyric-vj/render.mts src/app/lyric-vj/render/*.ts 2>/dev/null || true; echo "fps=30 workers=2"; } | shasum -a 256 | cut -c1-16)
manifest=$tr/video/manifest.txt
{ [ -f "$manifest" ] && [ "$(cat "$manifest")" = "$sig" ] && [ -f "$tr/video/metrics.json" ] && ls "$tr/video/"lyric-vj_vocal_0-*.mp4 > /dev/null 2>&1; } || {
  rm -f "$manifest"
  npx tsx scripts/lyric-vj/render.mts --song "$S" --treatment "$tr/treatment.json" --assets "$tr/assets.json" --start 0 --end "$end" --fps 30 --workers 2 --out "$tr/video" > "$w/render-$tier.log" 2>&1
  printf '%s' "$sig" > "$manifest"
}
rm -rf "$tr/video/render" "$tr/video/segments"
cp "$(ls "$tr/video/"lyric-vj_vocal_0-*.mp4 | head -1)" "$out.tmp" && mv "$out.tmp" "$out"
# the delivery gate (quality.mts): lines too short to read, renderer faults, shots the plan skipped, a file that is not
# a whole 1920×1080 30 fps video with sound — each holds the finished video for the admin (exit 10), never hands it over.
# Every hold reason is collected first (the admin sees the whole list), then one exit. The hybrid tier's cut/ carries
# no plan-check: its plan ran in noimg/
pc=$tr/plan-check.json; [ "$tier" = hybrid ] && pc=$w/noimg/plan-check.json
rc=0; npx tsx scripts/lyric-vj/beta/quality.mts --video "$out" --metrics "$tr/video/metrics.json" --plan-check "$pc" --expected-sec "$end" --fps 30 --report "$w/quality.json" | tee "$w/quality-$tier.log" || rc=$?
# a fault a fresh render may mend (a renderer error, a file that is not a video): the render is thrown away and the job
# fails, which the queue runs once more by itself (resumed up to the render); a second such failure stays failed, unpaid
if [ "$rc" = 20 ]; then echo '##PHASE 成品有渲染錯誤，整段重做'; rm -rf "$tr/video" "$out"; exit 1; fi
[ "$rc" = 0 ] || [ "$rc" = 10 ] || exit "$rc"
hold=()
[ "$rc" = 10 ] && hold+=("$(grep '^quality: ' "$w/quality-$tier.log" | sed 's/^quality: //' | paste -sd '；' -)")
[ "$tier" = hybrid ] && grep -q 'key shot kept' "$w/cut.log" && hold+=('有一張關鍵畫面要看')
# a figure hiding much of a lyric holds the video for the admin. Tokyo Drift v2, which the user accepted, peaked at
# 35 % (render.mts logs "lyric covered … hides N%"); the 40 % line is that plus a margin, not a measured taste line
worst=$(grep -oE 'hides [0-9]+%' "$w/render-$tier.log" 2>/dev/null | grep -oE '[0-9]+' | sort -n | tail -1 || true)
[ -n "$worst" ] && [ "$worst" -gt 40 ] && hold+=("有歌詞被遮住 ${worst}%")
if [ ${#hold[@]} -gt 0 ]; then
  # (the separator in its own variable: bash 3.2 misparses a multibyte character inside ${…:+…})
  sep='；'; reason=; for h in "${hold[@]}"; do reason="${reason:+$reason$sep}$h"; done
  echo "##PHASE 等管理者確認：$reason"; exit 10
fi
echo '##PHASE 完成'
