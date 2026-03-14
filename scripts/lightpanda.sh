#!/usr/bin/env bash
# Lightpanda browser lifecycle management (Docker)
# Usage: ./scripts/lightpanda.sh [start|stop|status]

set -euo pipefail

PORT=9222
DOCKER_IMAGE="lightpanda/browser:nightly"
CONTAINER_NAME="lightpanda-cdp"

case "${1:-}" in
  start)
    if docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
      echo "Lightpanda already running"
      exit 0
    fi
    docker run -d --rm --name "$CONTAINER_NAME" -p "$PORT:9222" "$DOCKER_IMAGE"
    echo "Lightpanda started on port $PORT"
    ;;
  stop)
    if docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
      docker stop "$CONTAINER_NAME"
      echo "Lightpanda stopped"
    else
      echo "Lightpanda is not running"
    fi
    ;;
  status)
    if docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
      echo "Lightpanda is running"
    else
      echo "Lightpanda is not running"
    fi
    ;;
  *)
    echo "Usage: $0 [start|stop|status]" >&2
    exit 1
    ;;
esac
