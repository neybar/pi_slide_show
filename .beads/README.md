# .beads

This repo tracks work with [Beads](https://github.com/gastownhall/beads) (`bd`) against a shared
Dolt sql-server, not a database in this directory, and issues are not synced through git.

- Setup and rules: the "Beads in this repo" section of [AGENTS.md](../AGENTS.md).
- Session-start text for agents: [PRIME.md](PRIME.md) (overrides `bd prime`'s default).
- Host, port, user and database are in `metadata.json`; TLS is the env var
  `BEADS_DOLT_SERVER_TLS=1`. `config.yaml` must not set `sync.remote`. No secrets live here.
