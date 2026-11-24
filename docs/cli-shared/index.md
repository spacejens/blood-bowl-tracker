# cli-shared

`packages/cli-shared` is a library package with the plumbing six of the repo's
CLI tools share. It has no CLI entry point of its own.

## What it owns

- **`runCli`** — the subcommand-dispatcher driver these six CLIs'
  entrypoints run on: [dev-workflow-cli](../dev-workflow-cli/index.md),
  [production-ops-cli](../production-ops-cli/index.md),
  [import-manual-planner-cli](../import-manual-planner-cli/index.md),
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
- **Read-only production queries** — `RunProductionQueryService`, in
  `ProductionQueryModule`: one query from the caller, run against
  production's `DATABASE_URL` in a read-only transaction with a statement
  timeout and a process deadline, psql meta-commands refused, optionally
  tuples-only. `production-ops-cli`'s `run-production-query` and
  `import-manual-planner-cli`'s `generate-incomplete-player-fills` both use
  it.
- **Discord REST** — `DiscordRestService`, in `DiscordRestModule`: the
  discord.js `REST` client, built once per process with the production bot
  token, returning Discord's responses verbatim and never printing the
  token. `production-ops-cli`'s Discord fetches and
  `import-manual-planner-cli`'s `read-tp-feed-history` both use it.
- **Symlink-safe file writes** — `WriteFileService`, which writes a file at a
  repo-relative path and refuses any path or symlink that would land outside
  the worktree or the main checkout. `fs-utils-cli`'s `write-file` and
  `import-manual-planner-cli`'s `generate-incomplete-player-fills` both use it.

`tools/workflow-lint` uses only `runCli`; the other five use the rest as
they need it. `CliSharedModule` provides the common services;
`ChildProcessModule`, `ProductionQueryModule` and `DiscordRestModule` are
separate, so only the CLIs that need them import them.

## Rules

- **Consumed by tools, depends on no tool.** The CLI tools above depend on it,
  keeping the `tools/* → packages/*` direction intact. It depends on no other
  workspace package, and must never depend on anything under `tools/`.
- **Client-side only.** It is used by tools, never by `apps/discord-bot` or
  the server-side packages.

## Development

```bash
pnpm --filter @blood-bowl-tracker/cli-shared run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/cli-shared run verify  # build + lint + typecheck + format + test
```
