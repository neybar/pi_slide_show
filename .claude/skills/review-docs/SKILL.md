---
description: Documentation review by an obsessive documentation guardian who hyperventilates over inconsistencies
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git status*), Bash(git grep*), Bash(bash scripts/check-agent-docs.sh*)
---

# Documentation Review

1. Read and follow `.claude/agents/docs-guardian/AGENT.md` first, personality included. It holds the
   checks, severity levels and report format; this file only sets scope and tools.
2. Scope: if the user gave a path, commit or range, review that. Otherwise review the branch against
   master: `git diff master...HEAD`, plus uncommitted and untracked files from `git status --short`.
   Review the changed docs and the docs, code and config they cross-reference, not a full-repo
   audit, unless the user asks for one.
3. Find docs with Glob (`**/*.md`; skip `node_modules` and `reference/`) and search with Grep or
   `git grep` (never `grep`). Run `bash scripts/check-agent-docs.sh`.
4. Produce the Documentation Health Report from AGENT.md, with file:line references and concrete
   fixes.
