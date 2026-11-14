#!/usr/bin/env bash
# Deploy the latest master image to the Synology NAS. Run from your Mac after merging a PR.
#
#   scripts/deploy.sh [--dry-run] [--copy-compose]
#
# Env: DEPLOY_HOST (default grond; an ssh alias or host), DEPLOY_DIR (default
# /volume1/docker/pi_slide_show; the folder holding compose.yaml on the NAS), DEPLOY_URL (default
# http://192.168.0.6:8531/; polled until it answers 200).
#
# A human runs this, so it prompts on purpose: for the CI-status warning and, over `ssh -t`, for
# the NAS sudo password (once; pull, restart and inspect share one ssh session).
# Agents never run it.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_HOST=${DEPLOY_HOST:-grond}
DEPLOY_DIR=${DEPLOY_DIR:-/volume1/docker/pi_slide_show}
DOCKER=/usr/local/bin/docker   # DSM: not on sudo's PATH
# The slideshow URL (the kiosk's fixed URL; host port 8531 in deploy/synology/compose.yaml).
# Not derived from DEPLOY_HOST: "grond" is an ssh alias, which curl can't resolve.
HEALTH_URL=${DEPLOY_URL:-http://192.168.0.6:8531/}
HEALTH_TIMEOUT=60

dry=0 copy=0
for arg in "$@"; do
  case $arg in
    --dry-run) dry=1 ;;
    --copy-compose) copy=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "deploy: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Host and dir end up inside a remote shell command: allow only plain host/path characters.
[[ $DEPLOY_HOST =~ ^[A-Za-z0-9._@-]+$ ]] || { echo "deploy: bad DEPLOY_HOST: $DEPLOY_HOST" >&2; exit 2; }
[[ $DEPLOY_DIR =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "deploy: bad DEPLOY_DIR: $DEPLOY_DIR" >&2; exit 2; }
[[ $HEALTH_URL =~ ^https?://[A-Za-z0-9._:-]+/?$ ]] || { echo "deploy: bad DEPLOY_URL: $HEALTH_URL" >&2; exit 2; }

show() { printf '+'; printf ' %q' "$@"; printf '\n'; }

if (( copy )); then
  echo "deploy: copying compose.yaml to $DEPLOY_HOST:$DEPLOY_DIR (the folder must already exist;"
  echo "        create it in File Station or over ssh first, mkdir may need the DSM GUI)."
  show scp -o BatchMode=yes deploy/synology/compose.yaml "$DEPLOY_HOST:$DEPLOY_DIR/compose.yaml"
  if (( dry )); then echo "deploy: dry run, nothing executed."; exit 0; fi
  scp -o BatchMode=yes deploy/synology/compose.yaml "$DEPLOY_HOST:$DEPLOY_DIR/compose.yaml"
  exit 0
fi

# a. Did CI publish the image for origin/master?
git fetch -q origin master
sha=$(git rev-parse origin/master)
echo "deploy: origin/master is $sha"
ci_cmd=(gh run list --workflow Docker --branch master --limit 1 --json headSha,conclusion,status
        --jq '.[0] | "\(.headSha) \(.status) \(.conclusion)"')
echo "+ gh run list --workflow Docker --branch master --limit 1 (expects $sha completed success)"
if (( ! dry )); then
  ci=$("${ci_cmd[@]}" || true)
  if [[ $ci != "$sha completed success" ]]; then
    echo "deploy: WARNING: latest master Docker run is not a success for this commit: ${ci:-unknown}" >&2
    read -r -p "Deploy anyway? [y/N] " ans
    [[ $ans == [yY]* ]] || { echo "deploy: aborted."; exit 1; }
  fi
fi

# b + d. One ssh session (one sudo prompt): pull, restart, then inspect the running container.
# Only the validated DEPLOY_DIR and constants are interpolated into the remote command.
remote="cd '$DEPLOY_DIR' && sudo $DOCKER compose pull && sudo $DOCKER compose up -d"
remote+=" && sudo $DOCKER inspect \$(sudo $DOCKER compose ps -q slideshow)"
remote+=" --format 'DEPLOYED {{.Image}} {{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
echo "deploy: pulling and restarting on $DEPLOY_HOST (enter the NAS sudo password if asked)"
echo "+ ssh -t $DEPLOY_HOST \"$remote\""
echo "+ poll $HEALTH_URL until 200 (timeout ${HEALTH_TIMEOUT}s)"
if (( dry )); then echo "deploy: dry run, nothing executed."; exit 0; fi

log=$(mktemp); trap 'rm -f "$log"' EXIT
ssh -t "$DEPLOY_HOST" "$remote" | tee "$log"   # pipefail: a failed pull/up aborts here
out=$(tr -d '\r' <"$log" | grep '^DEPLOYED ' | tail -n 1 || true)

# c. Wait for the server.
echo "deploy: waiting for $HEALTH_URL"
deadline=$((SECONDS + HEALTH_TIMEOUT))
until [[ $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true) == 200 ]]; do
  (( SECONDS < deadline )) || { echo "deploy: FAILED: no 200 from $HEALTH_URL within ${HEALTH_TIMEOUT}s" >&2; exit 1; }
  sleep 2
done
echo "deploy: server is answering 200"

# d. Report what runs.
read -r _ digest rev <<<"$out"
echo "deploy: image    ${digest:-unknown}"
echo "deploy: revision ${rev:-unknown}"
echo "deploy: master   $sha"
if [[ ${rev:-} == "$sha" ]]; then
  echo "deploy: OK, running image matches origin/master"
else
  echo "deploy: WARNING: running revision differs from origin/master (CI may not have built it yet)" >&2
fi
