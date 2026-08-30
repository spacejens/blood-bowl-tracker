# fs-utils-cli

`tools/fs-utils-cli` is a NestJS CLI application providing the worktree-aware
filesystem helpers the Claude Code skills in `.claude/skills/` call instead
of hand-rolling the equivalent shell. Worktree isolation is one reason for
this: a worktree-isolated session refuses to run shell commands complex
enough that it cannot verify they stay inside the worktree — see
[develop-feature/SKILL.md's "Worktree isolation and shell commands" section](../../.claude/skills/develop-feature/SKILL.md#worktree-isolation-and-shell-commands)
for what that means in practice. But the pattern is also useful on its own merits, independent of
that constraint: packaging multi-step logic (a directory sync, a symlink-safe
file write) behind one tested command is more repeatable and reliable than
re-deriving the equivalent shell inline every time a skill needs it.
`write-file` in particular exists because the Claude Code Write tool refuses
to write through the `docs/plans` symlink.

## Subcommands

| Subcommand | Purpose |
| --- | --- |
| `sync-gitignored` | Copy/symlink missing gitignored dev config into a worktree |
| `write-file` | Write a file at a repo-relative path, reading its content from stdin — used to save specs and plans through the `docs/plans` symlink, which the Claude Code Write tool refuses to write through |

## Running it

```bash
pnpm build
node tools/fs-utils-cli/dist/main.js <subcommand>
```

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1.

## Development

```bash
pnpm --filter @blood-bowl-tracker/fs-utils-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/fs-utils-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/fs-utils-cli run verify      # build + lint + typecheck + format + test
```
