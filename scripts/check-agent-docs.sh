#!/usr/bin/env bash
# Checks the agent-doc layout described in AGENTS.md: AGENTS.md is the rule home, CLAUDE.md imports
# it, GEMINI.md links to it, and generated Beads text that contradicts the shared-server setup
# (Dolt push/pull, local DB, extra Beads blocks) has not come back via `bd setup` or `bd doctor --fix`.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
err() { echo "check-agent-docs: $*" >&2; fail=1; }

[[ -f AGENTS.md ]] || err "AGENTS.md is missing"
[[ "$(grep -m1 -v -e '^#' -e '^$' CLAUDE.md 2>/dev/null || true)" == "@AGENTS.md" ]] \
  || err "CLAUDE.md must import AGENTS.md (first non-heading line: @AGENTS.md)"
grep -q -F '<!-- bd-doctor-divergence: ok -->' CLAUDE.md 2>/dev/null \
  || err "CLAUDE.md lost the bd-doctor-divergence marker (bd doctor will suggest undoing the layout)"
[[ -L GEMINI.md && "$(readlink GEMINI.md)" == "AGENTS.md" ]] \
  || err "GEMINI.md must be a symlink to AGENTS.md"
[[ -f .beads/PRIME.md ]] || err ".beads/PRIME.md is missing (bd prime would teach Dolt push/pull)"
[[ ! -e .cursor/rules/beads.mdc ]] \
  || err ".cursor/rules/beads.mdc is back (was \`bd setup cursor\` run?); delete it"

for f in AGENTS.md CLAUDE.md; do
  if grep -q 'BEGIN BEADS INTEGRATION' "$f"; then
    err "$f has a generated 'BEGIN BEADS INTEGRATION' block (was \`bd setup claude\` run?)"
  fi
done

# Agent-facing text must never contain the Dolt sync commands, even inside bd-owned blocks.
for f in AGENTS.md CLAUDE.md .beads/PRIME.md .beads/README.md; do
  if [[ -f $f ]] && grep -n -E 'bd dolt (push|pull)' "$f"; then
    err "$f mentions bd dolt push/pull (this repo has no Dolt sync)"
  fi
done

if git ls-files --error-unmatch .claude/settings.local.json >/dev/null 2>&1; then
  err ".claude/settings.local.json is tracked; run: git rm --cached .claude/settings.local.json"
fi
if [[ -n "$(git ls-files '.beads/*.jsonl')" ]]; then
  err "a .beads/*.jsonl export is tracked; the shared server is the source of truth"
fi
if grep -q -E '^[[:space:]]*remote:' .beads/config.yaml 2>/dev/null; then
  err ".beads/config.yaml sets sync.remote; remove it (bd config unset sync.remote)"
fi

if (( fail )); then exit 1; fi
echo "check-agent-docs: ok"
