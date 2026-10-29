#!/usr/bin/env bash
# The concept gate of one beta song: the director's reading, the text layout without pictures, three stills and a
# summary the person confirms before any video is made. Reads <run>/inputs.json (written by the server):
#   { concept, style?, refs: string[], note?, from? }   from = the run of the concept being adjusted
# Each step is skipped when its output exists, so a retried job resumes. Prints ##PHASE / ##COST lines for the queue.
# usage: scripts/lyric-vj/beta/concept.sh <song dir> <run dir>
set -euo pipefail
d=$1; w=$2
cd "$(dirname "$0")/../../.."
mkdir -p "$w"
[ -f "$w/song.json" ] || cp "$d/song.json" "$w/song.json"
S=$w/song.json
end=$(python3 -c "import json,sys;print('%.2f'%json.load(open(sys.argv[1]))['duration'])" "$S")
# same cost helpers as make.sh: nothing is printed for a missing or zero cost
cost_json() { [ -f "$1" ] && python3 -c "import json,sys;c=json.load(open(sys.argv[1])).get('costUSD') or 0;c>0 and print('##COST %.3f %s' % (c, sys.argv[2]))" "$1" "$2" || true; }
cost_log() { local c; c=$(grep -oE '\$[0-9]+\.[0-9]+' "$1" | tail -1 | tr -d '$' || true); [ -n "$c" ] && awk -v c="$c" 'BEGIN{exit !(c>0)}' && echo "##COST $c $2" || true; }
[ -f "$w/inputs.json" ] || { echo "no inputs.json" >&2; exit 2; }
# one inputs.json field, "" when absent; a corrupt file aborts
field() { python3 -c "import json,sys;v=json.load(open(sys.argv[1])).get(sys.argv[2]);print(v if isinstance(v,str) else '')" "$w/inputs.json" "$1"; }

# the person's words for the director: the concept text (brief.txt, also the style text of the later steps); their
# note on the previous version goes separately as --note, so the director reads a note as an adjustment and `from`
# without one as a redo
brief=$w/brief.txt
concept=$(field concept); note=$(field note); lang=$(field style); from=$(field from)
printf '%s\n' "$concept" > "$brief"
prev=
[ -n "$from" ] && ! [[ $from =~ ^[A-Za-z0-9_-]+$ ]] && { echo "ignoring invalid from: $from" >&2; from=; }
[ -n "$from" ] && [ -f "$d/runs/$from/base/treatment.json" ] && prev=$d/runs/$from/base/treatment.json
# the effective request of this concept (request.txt, what a make of it passes on): the concept text plus every
# adjust note along the chain, oldest first. A redo starts the chain over: the notes were about a direction dropped
request=$w/request.txt
if [ -n "$from" ] && [ -n "$note" ]; then
  { if [ -s "$d/runs/$from/request.txt" ]; then cat "$d/runs/$from/request.txt"; else printf '%s\n' "$concept"; fi; printf '\n使用者對上一版的意見：%s\n' "$note"; } > "$request"
else
  printf '%s\n' "$concept" > "$request"
fi

echo '##PHASE 導演規劃段落與故事'
if [ ! -f "$w/base/treatment.json" ]; then
  args=(--song "$S" --start 0 --end "$end" --out "$w/base" --style-id emotional --tier still --history out/design-history.json)
  [ -n "$(tr -d '[:space:]' < "$brief")" ] && args+=(--style "@$brief")
  [ -d "$w/refs" ] && [ -n "$(ls -A "$w/refs" 2>/dev/null)" ] && args+=(--refs "$w/refs")
  [ -n "$lang" ] && args+=(--language "$lang")
  # the admin's tiers at run time (server jobEnv): a set VJ_PROVEN, even empty, replaces the code's proven list
  [ -n "${VJ_PROVEN+set}" ] && args+=(--proven="$VJ_PROVEN")
  [ -n "${VJ_CANDIDATES:-}" ] && args+=(--candidates "$VJ_CANDIDATES")
  [ -n "$prev" ] && args+=(--previous "$prev")
  [ -n "$note" ] && args+=(--note="$note")
  npx tsx scripts/lyric-vj/direct.mts "${args[@]}" 2>&1 | tee "$w/direct.log" | awk '/^attempt [0-9]+: 0 errors/ { print "##PHASE 導演設計視覺風格"; fflush() } /^attempt [0-9]+: [1-9]/ { print "##PHASE 導演修正故事草稿"; fflush() }'
  cost_json "$w/base/director.json" direct
fi

echo '##PHASE 編排文字動態'
if [ ! -f "$w/noimg/treatment.json" ]; then
  npx tsx scripts/lyric-vj/typeplan.mts --song "$S" --treatment "$w/base/treatment.json" --backdrops "$w/base/treatment.json" --out "$w/noimg" > "$w/noimg.log" 2>&1
  cost_json "$w/noimg/typeplan.json" plan-noimg
fi

# the song's own horizons before the stills: the person then sees the skylines the video will have (make.sh applies the
# same strips, drawn once here and kept in $w/horizon, so this costs nothing twice); a plan without skylines spends nothing
echo '##PHASE 畫背景剪影'
[ -f "$w/noimg/treatment.json" ] && { npx tsx scripts/lyric-vj/horizon.mts --song "$S" --treatment "$w/base/treatment.json" --out "$w/horizon" --apply "$w/noimg" > "$w/horizon-concept.log" 2>&1 && cost_log "$w/horizon-concept.log" horizon || echo "horizon skipped"; }
echo '##PHASE 準備示意畫面'
if [ ! -d "$w/stills" ]; then
  rm -rf "$w/stills.tmp"
  times=$(npx tsx scripts/lyric-vj/beta/concept-summary.mts --times "$w")
  npx tsx scripts/lyric-vj/render.mts --song "$S" --treatment "$w/noimg/treatment.json" --assets "$w/noimg/assets.json" --stills "$times" --out "$w/stills.tmp" > "$w/stills.log" 2>&1
  rm -rf "$w/stills"; mv "$w/stills.tmp" "$w/stills"
fi

echo '##PHASE 整理概念'
npx tsx scripts/lyric-vj/beta/concept-summary.mts --write "$w"

echo '##PHASE 等你確認概念'
exit 0
