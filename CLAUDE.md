# CLAUDE.md

@AGENTS.md

<!-- bd-doctor-divergence: ok -->

## Claude Code only

Cursor loads this file too: Cursor, skip these bullets. Codex and Gemini don't load it.

- Run the pre-commit reviews from AGENTS.md as `/review-nodejs` and `/review-docs` (only the ones
  that apply).
- Persistent project notes go in Beads (`bd remember`), not Claude Code's auto-memory or a MEMORY.md.
- The SessionStart hook in `.claude/settings.json` runs `bd prime`; rerun it only if Beads context
  is stale.
- Shared hooks and permissions go in `.claude/settings.json`; per-user ones in
  `.claude/settings.local.json`.
