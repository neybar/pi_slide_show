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
CONTAINER=slideshow-node       # container_name in deploy/synology/compose.yaml
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


if (( copy )); then
  echo "deploy: copying compose.yaml to $DEPLOY_HOST:$DEPLOY_DIR (the folder must already exist;"
  echo "        create it in File Station or over ssh first, mkdir may need the DSM GUI)."
  # Plain ssh, not scp: modern scp speaks SFTP, which DSM leaves off unless enabled
  # ("subsystem request failed on channel 0").
  echo "+ ssh -o BatchMode=yes $DEPLOY_HOST \"cat > '$DEPLOY_DIR/compose.yaml'\" < deploy/synology/compose.yaml"
  if (( dry )); then echo "deploy: dry run, nothing executed."; exit 0; fi
  ssh -o BatchMode=yes "$DEPLOY_HOST" "cat > '$DEPLOY_DIR/compose.yaml'" < deploy/synology/compose.yaml
  echo "deploy: copied."
  exit 0
fi

# The NAS sudo password is read over `ssh -t`, which needs a terminal on stdin. Claude Code's `!`
# and other non-interactive runners have none: fail fast instead of letting sudo fail remotely.
if (( ! dry )) && [[ ! -t 0 ]]; then
  echo "deploy: run this from a terminal: the NAS sudo password prompt needs one (or use --dry-run)." >&2
  exit 2
fi

# a. Did CI publish an image with master's code?
# Ask GitHub's API (gh), not `git fetch`: no SSH to github.com, so no 1Password key prompt
# that can hide behind other windows and look like a hang.
# The Docker workflow skips commits that don't change the image (docs, deploy files; its
# paths-ignore), so the newest image can be older than master's head. That is fine when the
# commits after it touch none of the image's inputs (IMAGE_INPUTS, from the Dockerfile).
IMAGE_INPUTS='^(Dockerfile|\.dockerignore|package(-lock)?\.json|server\.mjs|lib/|www/)'
echo "deploy: asking GitHub for master's head..."
sha=$(gh api repos/neybar/pi_slide_show/commits/master --jq .sha)
echo "deploy: origin/master is $sha"
want=$sha   # the revision the running image should carry
ci_cmd=(gh run list --workflow Docker --branch master --limit 1 --json headSha,conclusion,status
        --jq '.[0] | "\(.headSha) \(.status) \(.conclusion)"')
echo "+ gh run list --workflow Docker --branch master --limit 1 (expects completed success)"
if (( ! dry )); then
  ci=$("${ci_cmd[@]}" || true)
  read -r img_sha ci_status ci_concl <<<"$ci"
  problem=
  if [[ "$ci_status $ci_concl" != "completed success" ]]; then
    problem="latest master Docker run is not a success: ${ci:-unknown}"
  elif [[ $img_sha != "$sha" ]]; then
    # Files changed between the image's commit and master (the compare API lists up to 300)
    # (on an API error gh prints the error JSON to stdout: test the exit status, not the text)
    if ! changed=$(gh api "repos/neybar/pi_slide_show/compare/$img_sha...$sha" --jq '.files[].filename'); then
      problem="could not compare the last Docker build ($img_sha) with master"
    elif grep -qE "$IMAGE_INPUTS" <<<"$changed"; then
      problem="master has image changes after the last Docker build ($img_sha)"
    else
      echo "deploy: newest image is from ${img_sha:0:7}; later commits don't change the image"
      want=$img_sha
    fi
  fi
  if [[ -n $problem ]]; then
    echo "deploy: WARNING: $problem" >&2
    read -r -p "Deploy anyway? [y/N] " ans
    [[ $ans == [yY]* ]] || { echo "deploy: aborted."; exit 1; }
  fi
fi

# b + d. One ssh session (one sudo prompt): pull, restart, then inspect the running container.
# Only the validated DEPLOY_DIR and constants are interpolated into the remote command.
# Compose project name: reuse the one on the running container (Container Manager names the project
# itself when it's created in the GUI; the folder name would be a different project, and `up` would
# then collide with the fixed container_name). Fall back to the folder name for a first deploy.
remote="cd '$DEPLOY_DIR' && { P=\$(sudo $DOCKER inspect $CONTAINER"
remote+=" --format '{{index .Config.Labels \"com.docker.compose.project\"}}' 2>/dev/null) || P=; }"
remote+=" && { [ \"\$P\" != '<no value>' ] || P=; } && P=\${P:-$(basename "$DEPLOY_DIR")}"
remote+=" && echo \"deploy: compose project \$P\""
remote+=" && sudo $DOCKER compose -p \"\$P\" pull && sudo $DOCKER compose -p \"\$P\" up -d"
remote+=" && sudo $DOCKER inspect $CONTAINER"
remote+=" --format 'DEPLOYED {{.Image}} {{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
echo "deploy: pulling and restarting on $DEPLOY_HOST (enter the NAS sudo password if asked)"
echo "+ ssh -t $DEPLOY_HOST \"$remote\""
echo "+ poll $HEALTH_URL until 200 (timeout ${HEALTH_TIMEOUT}s)"
if (( dry )); then echo "deploy: dry run, nothing executed."; exit 0; fi

log=$(mktemp); trap 'rm -f "$log"' EXIT
ssh -t "$DEPLOY_HOST" "$remote" | tee "$log"   # pipefail: a failed pull/up aborts here
# Not anchored at ^: over `ssh -t`, compose's progress UI leaves terminal escape codes (cursor
# show/hide) at the start of the line. Match only the expected tokens.
out=$(tr -d '\r' <"$log" | grep -oE 'DEPLOYED sha256:[0-9a-f]+ [0-9a-f]*' | tail -n 1 || true)

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
if [[ ${rev:-} == "$want" ]]; then
  echo "deploy: OK, running image has master's code (built from ${want:0:7})"
else
  echo "deploy: WARNING: running revision is not ${want:0:7} (CI may not have built it yet)" >&2
fi
