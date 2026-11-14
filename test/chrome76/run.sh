#!/usr/bin/env bash
# npm run test:chrome76: build the Chromium 76 image, start the app and the (resource-limited)
# browser container, run the suite, report the browser's peak memory, clean up.
#
# Env:
#   CHROME76_CPU_THROTTLE   CDP CPU throttling rate for the page, 1 = off (default). The container
#                           already has 2 cores; this approximates the Celeron's 1.4 GHz clock.
#                           On a Mac, amd64 emulation is already slower than the Chromebox: leave
#                           it off. CI (native amd64) sets 3, see the workflow's chrome76 job.
#   CHROME76_SCENARIOS      comma list of scenario names (default: all, see run.mjs)
#   CHROME76_SKIP_BUILD=1   reuse the existing image
#   CHROME76_KEEP_COLIMA=1  if this run had to start Colima, leave it running afterwards
# Screenshots, results.json and peak-memory.txt land in test-results/chrome76/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f test/chrome76/docker-compose.yml)
OUT=test-results/chrome76
BROWSER=chrome76-browser

if [ ! -d node_modules/exifr ] || [ ! -d www/node_modules/jquery ]; then
  echo "Run first: npm install && npm install --prefix www (the app container mounts them)" >&2
  exit 2
fi

# Docker on a Mac may run through Colima, kept stopped to save host resources. If Docker isn't
# reachable and Colima is installed, start it for this run and stop it again on exit (only if we
# started it; CHROME76_KEEP_COLIMA=1 leaves it running). Starting Colima also restarts containers
# with a restart policy; stopping it stops them again.
started_colima=""
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    echo "Docker isn't running; starting Colima for this run..." >&2
    colima start >&2
    started_colima=1
  else
    echo "Docker isn't reachable; start Docker and retry." >&2
    exit 2
  fi
fi
stop_colima() {
  if [ -n "$started_colima" ] && [ "${CHROME76_KEEP_COLIMA:-}" != "1" ]; then
    echo "Stopping Colima (started by this run)..." >&2
    colima stop >&2 || true
  fi
}
trap stop_colima EXIT

# The browser container is limited to 2 CPUs / 2 GiB (docker-compose.yml) and the app container
# runs beside it. A Docker VM smaller than that (Colima defaults to 2 CPUs / 2 GiB) cannot honour
# the limits, so the numbers would not mean much. Warn, don't fail.
read -r vm_cpus vm_mem < <(docker info --format '{{.NCPU}} {{.MemTotal}}')
if [ "$vm_cpus" -lt 4 ] || [ "$vm_mem" -lt $((5 * 1024 * 1024 * 1024)) ]; then
  echo "WARNING: the Docker VM has $vm_cpus CPUs and $((vm_mem / 1024 / 1024)) MiB; the browser limits (2 CPUs," >&2
  echo "         2 GiB) plus the app server need about 4 CPUs and 5 GiB, so they cannot be met" >&2
  echo "         and memory results are optimistic. Recommended: colima start --cpu 4 --memory 6" >&2
fi

rm -rf "$OUT"
mkdir -p "$OUT"

sampler_pid=""
cleanup() {
  if [ -n "$sampler_pid" ]; then
    kill "$sampler_pid" 2>/dev/null || true
    wait "$sampler_pid" 2>/dev/null || true
  fi
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  stop_colima
}
trap cleanup EXIT

if [ "${CHROME76_SKIP_BUILD:-}" != "1" ]; then
  "${COMPOSE[@]}" build browser
fi
"${COMPOSE[@]}" up -d --wait app

# Peak memory of the browser container as `docker stats` shows it (sampled every 2 s).
: > "$OUT/.stats"
(
  while true; do
    docker stats --no-stream --format '{{.MemUsage}}' "$BROWSER" 2>/dev/null >> "$OUT/.stats" || true
    sleep 2
  done
) &
sampler_pid=$!

status=0
docker rm -f "$BROWSER" >/dev/null 2>&1 || true  # stale container from an interrupted run
"${COMPOSE[@]}" run --rm --name "$BROWSER" browser || status=$?

kill "$sampler_pid" 2>/dev/null || true
wait "$sampler_pid" 2>/dev/null || true
sampler_pid=""
peak=$(awk '{
  v = $1; n = v + 0
  if (v ~ /GiB$/) n *= 1024; else if (v ~ /KiB$/) n /= 1024; else if (v ~ /[0-9]B$/) n /= 1048576
  if (n > max) max = n
} END { printf "%d", max }' "$OUT/.stats")
rm -f "$OUT/.stats"
echo "Browser container peak memory (docker stats, limit 2048 MiB): ${peak} MiB" | tee "$OUT/peak-memory.txt"
echo "Screenshots and results.json: $OUT/"
exit "$status"
