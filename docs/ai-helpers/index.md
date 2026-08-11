# ai-helpers

`tools/ai-helpers` is a NestJS CLI application providing worktree-aware
helpers the Claude Code skills in `.claude/skills/` call instead of
hand-rolling the equivalent shell. It exists because a worktree-isolated
session refuses to run shell commands complex enough that it cannot verify
they stay inside the worktree — see `develop-feature/SKILL.md`'s "Worktree
isolation and shell commands" section for what that means in practice. Each
subcommand below packages logic that would otherwise need a multi-statement
shell script into a single command invocation.

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

## Development

```bash
pnpm --filter @blood-bowl-tracker/ai-helpers run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/ai-helpers run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/ai-helpers run verify      # build + lint + typecheck + format + test
```
