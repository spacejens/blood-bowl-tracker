# cli-shared

`packages/cli-shared` is a library package with the plumbing the repo's CLI
tools share. It has no CLI entry point of its own.

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
- **`runApp`** — the single-run driver for the CLIs that take no
  subcommand. It boots a Nest application context with logging off, runs the
  tool's work against it, and closes the context even when that work throws.
  It then hands the outcome to the tool's `onOutcome`, which prints it and
  may return an exit code. A non-zero code ends the process with that code.
  Any failure prints the tool's failure label with the error and exits with
  status 1. `exitOnSuccess` also forces an explicit exit 0, for a tool whose
  open database socket would otherwise keep the process alive.
  [import-bbl](../import-bbl/index.md), [import-tp](../import-tp/index.md)
  and [import-manual](../import-manual/index.md) run on it directly, and the
  four review tools through [review-harness](../review-harness/index.md)'s
  `runReviewCli`. Same bootstrap case as `runCli`.
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
- **Local database guard** — `LocalDatabaseGuardService`, which refuses
  any connection string whose host is not `localhost`, `127.0.0.1` or `::1`
  (a `host` or `hostaddr` query parameter is refused too), and
  `DEFAULT_LOCAL_DATABASE_URL`, the docker-compose database.
  `backup-cli`'s `verify` and `restore` and `import-manual-planner-cli`'s
  `generate-incomplete-player-fills` use both.
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

- **Consumed by tools, depends on no tool.** The CLI tools above depend on
  it, as does [review-harness](../review-harness/index.md) for its
  `runReviewCli`, keeping the `tools/* → packages/*` direction intact. It
  depends on no other workspace package, and must never depend on anything
  under `tools/`.
- **Client-side only.** It is used by tools and the client-side
  review-harness, never by `apps/discord-bot` or the server-side packages.

## Development

```bash
pnpm --filter @blood-bowl-tracker/cli-shared run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/cli-shared run verify  # build + lint + typecheck + format + test
```
