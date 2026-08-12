# ai-helpers

`tools/ai-helpers` is a NestJS CLI application providing worktree-aware
helpers the Claude Code skills in `.claude/skills/` call instead of
hand-rolling the equivalent shell. Worktree isolation is one reason for this:
a worktree-isolated session refuses to run shell commands complex enough that
it cannot verify they stay inside the worktree — see
[develop-feature/SKILL.md's "Worktree isolation and shell commands" section](../../.claude/skills/develop-feature/SKILL.md#worktree-isolation-and-shell-commands)
for what that means in practice. But the pattern is also useful on its own merits, independent of
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

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1.

### `wait-for-pr-review` usage

```bash
node tools/ai-helpers/dist/main.js wait-for-pr-review <pr-number> <developer-login> <since-epoch-seconds> [--timeout-ms=600000] [--interval-ms=30000] [--exclude-review-id=<id>] [--exclude-comment-id=<id>] [--exclude-comment-update-failure-id=<id>] [--trigger-after=<epoch-seconds>]
```

- `<pr-number>` — the PR to poll.
- `<developer-login>` — the PR author's own login, excluded as a reviewer.
- `<since-epoch-seconds>` — only reviews (or rate-limit comments, or comment-update-failure comments) submitted at or after this instant qualify (inclusive — `<since-epoch-seconds>` has only second precision, so a strict "after" would miss a different review submitted in the same second).
- `--timeout-ms` (default 600000, 10 minutes) / `--interval-ms` (default 30000, 30 seconds) — optional overrides; `--interval-ms` has a 1000ms minimum.
- `--exclude-review-id` — excludes one review by its `id`, regardless of its `submittedAt`. Needed alongside the inclusive threshold above: pass the previously-found review's own `id` here (e.g. across develop-feature's Phase 6 iterations) so that same review isn't matched again forever just because the threshold is inclusive.
- `--exclude-comment-id` — the same exclusion, but for a CodeRabbit rate-limit comment's `id` instead of a review's, for the same reason.
- `--exclude-comment-update-failure-id` — the same exclusion, but for a CodeRabbit comment-update-failure comment's `id` instead of a review's or rate-limit comment's, for the same reason.
- `--trigger-after` — once the clock crosses this epoch, the first poll at or after it posts a `@coderabbitai review` comment on the PR, then polling continues to the deadline as normal. Used to nudge CodeRabbit into reviewing again once its rate limit is expected to have cleared.

Prints one of four JSON outcomes:
- `{"found": true, "review": {...}}` — a qualifying review was found.
- `{"found": false, "timedOut": true}` — the timeout elapsed with nothing found.
- `{"found": false, "rateLimited": true, "rateLimitComment": {...}, "availableAtEpochSeconds": <number>}` — a CodeRabbit rate-limit warning comment was found instead of a review, so the wait returned early rather than running out its remaining time. `availableAtEpochSeconds` is a best-effort epoch parsed from the comment's own stated wait time, and the key is omitted from the printed JSON entirely (not `null`) when no duration could be parsed:
  ```json
  {"found": false, "rateLimited": true, "rateLimitComment": {...}}
  ```
- `{"found": false, "commentUpdateFailed": true, "commentUpdateFailedComment": {...}}` — a CodeRabbit "couldn't update its existing comment" failure notice was found instead of a review, so the wait returned early rather than running out its remaining time. Unlike the rate-limit outcome above, there is no `availableAtEpochSeconds` equivalent here — CodeRabbit's text for this failure states no wait duration, so the caller falls back to an immediate retry.

## Development

```bash
pnpm --filter @blood-bowl-tracker/ai-helpers run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/ai-helpers run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/ai-helpers run verify      # build + lint + typecheck + format + test
```
