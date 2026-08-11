# ai-helpers

`tools/ai-helpers` is a NestJS CLI application providing worktree-aware
helpers the Claude Code skills in `.claude/skills/` call instead of
hand-rolling the equivalent shell. Worktree isolation is one reason for this:
a worktree-isolated session refuses to run shell commands complex enough that
it cannot verify they stay inside the worktree — see `develop-feature/SKILL.md`'s
"Worktree isolation and shell commands" section for what that means in
practice. But the pattern is also useful on its own merits, independent of
that constraint: packaging multi-step logic (a poll loop, a directory sync,
a stray-work check) behind one tested command is more repeatable and
reliable than re-deriving the equivalent shell inline every time a skill
needs it.

## Subcommands

| Subcommand | Purpose |
|---|---|
| `resolve-main-root` | Locate the main checkout from a worktree |
| `check-main-stray` | Find uncommitted files and unpushed commits left in the main checkout |
| `sync-gitignored` | Copy/symlink missing gitignored dev config into a worktree |
| `check-drift` | Find gitignored config that differs between a worktree and the main checkout |
| `write-file` | Write a file at a repo-relative path, reading its content from stdin — used to save specs and plans through the `docs/plans` symlink, which the Claude Code Write tool refuses to write through |
| `wait-for-pr-review` | Poll `gh` internally for a submitted PR review until one appears or a timeout elapses, printing one JSON result — a single command a worktree-isolated session can run, unlike the inline multi-line poll loop it replaces |

## Running it

```bash
pnpm build
node tools/ai-helpers/dist/main.js <subcommand>
```

Run from the repo root; every subcommand prints JSON on stdout.

### `wait-for-pr-review` usage

```
node tools/ai-helpers/dist/main.js wait-for-pr-review <pr-number> <developer-login> <since-epoch-seconds> [--timeout-ms=600000] [--interval-ms=30000]
```

- `<pr-number>` — the PR to poll.
- `<developer-login>` — the PR author's own login, excluded as a reviewer.
- `<since-epoch-seconds>` — only reviews submitted after this instant qualify.
- `--timeout-ms` (default 600000, 10 minutes) / `--interval-ms` (default 30000, 30 seconds) — optional overrides; `--interval-ms` has a 1000ms minimum.

Prints `{"found": true, "review": {...}}` once a qualifying review appears, or `{"found": false, "timedOut": true}` once the timeout elapses.

## Development

```bash
pnpm --filter @blood-bowl-tracker/ai-helpers run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/ai-helpers run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/ai-helpers run verify      # build + lint + typecheck + format + test
```
