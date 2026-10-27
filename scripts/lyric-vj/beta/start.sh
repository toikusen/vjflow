#!/usr/bin/env bash
# Opens the closed beta from this Mac: builds the pages, opens a Cloudflare quick tunnel (a random
# https://….trycloudflare.com address, new on every start), and runs the beta server behind it, kept awake.
# Invite links carry the address, so after a restart people log in again with a fresh link from the admin page.
# ponytail: quick tunnel; a named tunnel on your own domain keeps one address (needs a Cloudflare account).
# usage: scripts/lyric-vj/beta/start.sh          (Ctrl-C stops the server and the tunnel)
set -euo pipefail
cd "$(dirname "$0")/../../.."
npx ng build > /dev/null
log=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4320 > "$log" 2>&1 &
tunnel=$!
trap 'kill $tunnel 2>/dev/null' EXIT
for _ in $(seq 60); do url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true); [ -n "$url" ] && break; sleep 1; done
[ -n "${url:-}" ] || { echo "the tunnel did not start:"; cat "$log"; exit 1; }
echo "beta: $url/my   (admin: $url/my/admin)"
# caffeinate -i: no idle sleep while jobs run (a closed lid still sleeps a laptop on battery)
VJ_BETA_URL=$url caffeinate -i npx tsx scripts/lyric-vj/beta/server.mts
