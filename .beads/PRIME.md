# Beads Workflow Context

> Replaces `bd prime`'s default text for this repo (`bd prime --export` shows the default).
> Repo rules, including "Beads in this repo", are in AGENTS.md and win over anything here.

## This repo's Beads setup

- Issues live on a **shared Dolt sql-server** (`dolt.thelances.net:3307`, database `pi_slide_show`,
  user `beads`, TLS). Every write is on the server as soon as the command returns.
- There is **no sync step**: never push or pull with `bd dolt`, never run `bd init` or `bd import`,
  and never commit a JSONL export.
- If the server is unreachable, do the work without Beads and list in your handoff what to file,
  claim or close. Never create a local database.

## Session close

1. `bd close <id1> <id2> ...` for finished issues; `bd create` follow-ups.
2. `npm test` when code changed (`npm run test:e2e` for frontend changes); docs and agent-config-only
   changes need only `bash scripts/check-agent-docs.sh` and the docs review (see AGENTS.md Workflow).
3. `git status`.
4. Hand off: changes, validation, issue status. Commit finished work, push the feature
   branch and open a PR for the user to review and merge; never merge it yourself.

## Core rules

- Use `bd` for all task tracking (`bd create`, `bd ready`, `bd close`), not TodoWrite, TaskCreate
  or markdown TODO lists.
- Create or claim an issue before writing code: `bd update <id> --claim`. Never work an issue
  someone else claimed.
- Persistent knowledge: `bd remember "insight"`; search with `bd memories <keyword>`.

## Commands

### Finding work
- `bd ready` - issues with no blockers
- `bd list --status=open` / `bd list --status=in_progress`
- `bd show <id>` - details and dependencies
- `bd search <query>`

### Creating and updating
- `bd create --title="..." --description="why and what" --type=task|bug|feature|epic|chore --priority=2`
  - Priority is 0-4 (0 = critical, 2 = medium, 4 = backlog), not "high"/"low"
- `bd create ... --parent=<id>` - child of an epic or task
- `bd update <id> --claim` / `bd unclaim <id>`
- `bd update <id> --title/--description/--notes/--design` - edit fields inline
- `bd update <id> --if-assignee=<expected> --assignee=<new>` - atomic reassign; on mismatch it
  exits non-zero and writes nothing, so never retry blindly
- `bd close <id> [--reason="..."] [--suggest-next]`
- Never use `bd edit`: it opens $EDITOR and blocks.

### Dependencies
- `bd dep add <issue> <depends-on>`
- `bd blocked`

### Health
- `bd stats`, `bd stale`, `bd orphans`, `bd lint`, `bd preflight`
- `bd doctor` is read-only and safe; never run its fix mode (it would undo this repo's agent-doc layout).
- `bd human <id>` - flag for a human decision
