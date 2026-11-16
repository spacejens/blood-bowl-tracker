# cli-shared

`tools/cli-shared` is a library package with the plumbing five of the repo's
CLI tools share. It has no CLI entry point of its own.

## What it owns

- **`runCli`** — the subcommand-dispatcher driver these five CLIs'
  entrypoints run on: [dev-workflow-cli](../dev-workflow-cli/index.md),
  [production-ops-cli](../production-ops-cli/index.md),
  [fs-utils-cli](../fs-utils-cli/index.md),
  [backup-cli](../backup-cli/index.md) and
  [workflow-lint](../workflow-lint/index.md). It runs before any Nest context
  exists, the bootstrap case of `CLAUDE.md`'s "Service vs. loose function"
  (case 3).
- **Git roots** — main-checkout and worktree resolution (`GitRootsService`).
- **Child processes** — running and spawning them (`ChildProcessService`,
  `ProcessRunnerService`).
- **Gitignored file lists** — the canonical gitignored file and directory
  lists.
- **Production secrets** — the dotenv-based reader for
  `apps/discord-bot/.env.production` (`ProductionEnvFileService`).
- **Postgres tooling** — the guarded `psql`/`pg_dump`/`pg_restore` runner
  (`PgClientService`), with connection-string redaction
  (`DatabaseUrlRedactorService`).
- **Symlink-safe file writes** — `WriteFileService`, which writes a file at a
  repo-relative path and refuses any path or symlink that would land outside
  the worktree or the main checkout. `fs-utils-cli`'s `write-file` and
  `production-ops-cli`'s `generate-incomplete-player-fills` both use it.

`tools/workflow-lint` uses only `runCli`; the other four use the rest as
they need it.

## Development

```bash
pnpm --filter @blood-bowl-tracker/cli-shared run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/cli-shared run verify  # build + lint + typecheck + format + test
```
