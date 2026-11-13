# AGENTS.md

Raspberry Pi photo slideshow. A Node.js server (`server.mjs`, `lib/`) picks random photos from a
library; a browser frontend (`www/`) shows them in an animated two-row grid. Read
[ARCHITECTURE.md](ARCHITECTURE.md) before design changes and
[docs/visual-algorithm.md](docs/visual-algorithm.md) before touching layout or animation.

This file is the shared agent instructions for Claude Code, Codex, Cursor and Gemini. `CLAUDE.md`
imports it and adds Claude-only notes; `GEMINI.md` is a symlink to it; Codex and Cursor read it
natively. Put rules here unless only one tool can act on them. `scripts/check-agent-docs.sh` checks
this layout.

## Workflow

- Work on a feature branch, never on `master`. Commit, push or open a PR only when the user asks.
- Before a commit, fix CRITICAL findings from the reviews that apply: a code review using
  `.claude/agents/nodejs-reviewer/AGENT.md` when JS/server code changed, and a docs-consistency
  review using `.claude/agents/docs-guardian/AGENT.md` when docs or commands changed. Any agent can
  read and follow those files.
- `reference/` is the original Perl implementation. Read it for intent; don't edit or delete it.
- Never commit `.claude/settings.local.json` (per-user; gitignored).

## Commands

```bash
npm install && npm install --prefix www   # both: the browser loads libs from www/node_modules
npm run dev                 # server with auto-reload
npm test                    # vitest: unit + perf
npm run test:e2e            # Playwright/Chromium (once: npx playwright install chromium)
npm run test:smoke          # deployment health check, < 10s
BASE_URL=http://localhost:3000 npm run test:e2e   # use a running server
npm run test:perf:docker    # needs `docker compose up -d --build` (real photos)
LONG_RUNNING_TEST=1 npm run test:e2e -- --grep "Column Stability"   # ~7 min
cd www && npm run build     # compile www/css/main.scss
```

Shell commands must never prompt: `cp -f`, `mv -f`, `rm -f`, `rm -rf`, `cp -rf`,
`ssh`/`scp -o BatchMode=yes`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1 brew ...`.

## Easy to break

- Frontend tunables live in `www/js/config.mjs`, which the browser and the tests both import.
  Change values there, not inline.
- File serving: keep path-traversal and symlink checks, serve from an open handle
  (open → fstat → stream) to avoid TOCTOU, parse YAML with `JSON_SCHEMA`, and keep the URL
  length limit, rate limiter and server timeouts.
- Render album names and filenames with `.text()`, never `.html()`.
- Never show a black screen: preload images before swapping them in.
- Thumbnails come from Synology `@eaDir/SYNOPHOTO_THUMB_<size>.jpg`; fall back to the original.
- Discovery skips iPhoto libraries, `@eaDir`, `#recycle`, hidden dirs, and `.noslideshow` folders.
- `/album/fixture/:year` is test-only and must stay disabled in production.
- Photo-loading perf tests use fixed fixtures (`test/fixtures/albums/`) so runs are comparable
  across eras and machines; only `album-lookup.perf.mjs` uses random albums.

## Beads in this repo

This section wins over every generated Beads text: the Codex block below,
`.agents/skills/beads/SKILL.md`, and `bd prime` (whose text for this repo is `.beads/PRIME.md`).
Issues are **not** in a local Dolt database and are not synced through git: ignore any instruction
about a local Dolt DB, `refs/dolt/data`, or pushing/pulling with `bd dolt`, and never do those.

- **Shared server** `dolt.thelances.net:3307`, database `pi_slide_show`, user `beads`. Clients set
  `BEADS_DOLT_SERVER_TLS=1` (verified TLS); it is not stored in `.beads/metadata.json`. Export it
  in your shell profile so the session-start `bd prime` hook inherits it (without it: "Access denied").
- **Claim** before you start (`bd update <id> --claim`); never work an issue someone else claimed.
- **Identity**: `BEADS_ACTOR=<tool>@<host>` (e.g. `cursor@narsil`) or `--actor <tool>@<host>`.
- **Password** is per user (macOS Keychain or `~/.config/beads/credentials`), never in the repo, a
  committed env file, or a logged command line. Never set `BEADS_DOLT_CREDENTIAL_COMMAND` (bd sends
  its output as the MySQL username).
- **Server unreachable** (e.g. a cloud VM off the LAN/tailnet): never `bd init` or create a local or
  embedded database. Do the work and say in your handoff what to file, claim or close.
- **Never commit `.beads/*.jsonl`** (gitignored). The server is the source of truth.
- **One bd version** on every client. If `bd` offers or requires a schema migration, stop and ask:
  it hits every client at once. Never set or persist `BD_ALLOW_REMOTE_MIGRATE`.
- **Generated files**: `bd setup codex` owns the block between its markers below; never edit inside
  it. Never run `bd setup claude` or `bd setup cursor` except with `--check`: they re-add a Beads
  block to AGENTS.md/CLAUDE.md and `.cursor/rules/beads.mdc`, which this repo removed on purpose
  (Cursor reads AGENTS.md, and its sessionStart hook runs `bd prime`). A "no beads section" note from
  `--check` is expected. Never use `--stealth` (adds a second hook) or `--remove` (deletes the
  `bd prime` hook), and never run `bd doctor --fix`; plain `bd doctor` is read-only.
- Persistent project knowledge goes in `bd remember`, not ad hoc files or tool memory.

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
