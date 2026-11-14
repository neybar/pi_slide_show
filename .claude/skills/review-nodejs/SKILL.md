---
description: Review Node.js/JavaScript code for security, performance, and best practices
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git status*), Bash(git grep*), Bash(npm test*)
---

# Node.js Code Review

1. Read and follow `.claude/agents/nodejs-reviewer/AGENT.md` first. It holds the checks, severity
   levels and output format; this file only sets scope and tools.
2. Scope: if the user gave a path, commit or range, review that. Otherwise review the branch against
   master: `git diff master...HEAD`, plus uncommitted and untracked files from `git status --short`
   (read untracked files with Read).
3. Read changed files in full with Read, search with Grep or `git grep` (never `grep`), and run
   `npm test` as AGENT.md requires.
4. Report in the AGENT.md format, after verifying each finding against the code.
