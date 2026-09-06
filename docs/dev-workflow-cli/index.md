# dev-workflow-cli

`tools/dev-workflow-cli` is a NestJS CLI application providing worktree-aware
helpers the Claude Code skills in `.claude/skills/` call instead of
hand-rolling the equivalent shell. Worktree isolation is one reason for this:
a worktree-isolated session refuses to run shell commands complex enough that
it cannot verify they stay inside the worktree — see
[develop-feature/SKILL.md's "Worktree isolation and shell commands" section](../../.claude/skills/develop-feature/SKILL.md#worktree-isolation-and-shell-commands)
for what that means in practice. But the pattern is also useful on its own merits, independent of
that constraint: packaging multi-step logic (a poll loop, a stray-work check,
a review-comment post) behind one tested command is more repeatable and
reliable than re-deriving the equivalent shell inline every time a skill
needs it.

## Subcommands

| Subcommand | Purpose |
| --- | --- |
| `resolve-main-root` | Locate the main checkout from a worktree |
| `check-main-stray` | Find uncommitted files and unpushed commits left in the main checkout |
| `check-drift` | Find gitignored config that differs between a worktree and the main checkout |
| `check-dependency-dashboard` | Answer whether gh-shaped issue JSON on stdin is Renovate's standing Dependency Dashboard issue, so skills refuse to treat it as work |
| `wait-for-pr-review` | Poll `gh` internally for a submitted PR review until one appears or a timeout elapses, printing one JSON result — one command a worktree-isolated session can run, rather than a multi-line shell poll loop inline |
| `post-review-questions` | Post drafted review questions as PR comments (inline or top-level) from JSON on stdin |
| `acquire-review-lock` | Take the machine-wide review lock, waiting in a FIFO queue until it is free — serializes review-triggering activity across parallel sessions in different worktrees |
| `heartbeat-review-lock` | Refresh the lock this session holds so another session does not reclaim it as stale |
| `release-review-lock` | Hand the lock to the next queued session, or drop this session's queue ticket |

## Running it

```bash
pnpm build
node tools/dev-workflow-cli/dist/main.js <subcommand>
```

Run from the repo root. On success, every subcommand prints JSON on stdout; failures print a JSON error on stderr and exit with status 1.

### `wait-for-pr-review` usage

```bash
node tools/dev-workflow-cli/dist/main.js wait-for-pr-review <pr-number> <developer-login> <since-epoch-seconds> [--timeout-ms=1200000] [--interval-ms=30000] [--exclude-review-id=<id>] [--exclude-comment-id=<id>] [--exclude-comment-update-failure-id=<id>] [--trigger-after=<epoch-seconds>]
```

- `<pr-number>` — the PR to poll.
- `<developer-login>` — the PR author's own login, excluded as a reviewer.
- `<since-epoch-seconds>` — only reviews, rate-limit comments, or comment-update-failure comments submitted at or after this instant qualify, and only completion comments (see below) whose own timestamp is at or after this instant (inclusive in every case — `<since-epoch-seconds>` has only second precision, so a strict "after" would miss a distinct match in the same second).
- `--timeout-ms` (default 1200000, 20 minutes) / `--interval-ms` (default 30000, 30 seconds) — optional overrides; `--interval-ms` has a 1000ms minimum.
- `--exclude-review-id` — excludes one review by its `id`, regardless of its `submittedAt`. Needed alongside the inclusive threshold above: pass the previously-found review's own `id` here (e.g. across develop-feature's Phase 6 iterations) so that same review isn't matched again forever just because the threshold is inclusive.
- `--exclude-comment-id` — the same exclusion, but for a CodeRabbit rate-limit comment's `id` instead of a review's, for the same reason.
- `--exclude-comment-update-failure-id` — the same exclusion, but for a CodeRabbit comment-update-failure comment's `id` instead of a review's or rate-limit comment's, for the same reason.
- `--trigger-after` — once the clock crosses this epoch, the first poll at or after it posts a `@coderabbitai review` comment on the PR, then polling continues to the deadline as normal. Used to nudge CodeRabbit into reviewing again once its rate limit is expected to have cleared.

A poll also triggers on its own, with no `--trigger-after` needed, the first time it finds a CodeRabbit comment saying the repository does not receive automatic reviews (a low-star-count gate CodeRabbit applies repo-wide). That comment never surfaces as its own JSON outcome — it just posts the same `@coderabbitai review` trigger once and keeps polling for the review that follows.

Prints one of four JSON outcomes:

- `{"found": true, "review": {...}}` — a qualifying review was found. This shape is also used when CodeRabbit finishes a pass with nothing actionable and reports that only by editing its rolling walkthrough comment in place, rather than submitting a formal review — the service synthesizes a review-shaped result from that comment so callers need no separate case for it.
- `{"found": false, "timedOut": true}` — the timeout elapsed with nothing found.
- `{"found": false, "rateLimited": true, "rateLimitComment": {...}, "availableAtEpochSeconds": <number>}` — a CodeRabbit rate-limit warning comment was found instead of a review, so the wait returned early rather than running out its remaining time. `availableAtEpochSeconds` is a best-effort epoch parsed from the comment's own stated wait time, plus a fixed 60-second buffer (CodeRabbit's own window can slip past the time it announced, so retrying exactly on time risks a wasted poll and a state-check race at the boundary). The key is omitted from the printed JSON entirely (not `null`) when no duration could be parsed:

  ```json
  {"found": false, "rateLimited": true, "rateLimitComment": {...}}
  ```

- `{"found": false, "commentUpdateFailed": true, "commentUpdateFailedComment": {...}}` — a CodeRabbit "couldn't update its existing comment" failure notice was found instead of a review, so the wait returned early rather than running out its remaining time. Unlike the rate-limit outcome above, there is no `availableAtEpochSeconds` equivalent here — CodeRabbit's text for this failure states no wait duration, so the caller falls back to an immediate retry (see develop-feature's Phase 6 step b3).

**Detection precedence.** When more than one of the above could match at once, a formal review this service trusts outright wins and nothing else is even queried — one carrying real body content, or one of two malformed shapes trusted as-is because they cannot be verified or excluded: a non-object candidate, or one missing a string id. Every other match is checked against CodeRabbit's rolling walkthrough comment before it is reported, because a rate-limit notice edited into that comment, and a completion notice verified against the PR's current head commit, are both fresher evidence than a formally-valid-but-empty review or a standalone CodeRabbit comment. So a rolling-comment match — a rate-limit edit first, then a completion — outranks an empty-bodied review that only carries genuine (non-reply) inline comments, a rate-limit comment, a comment-update-failure comment, and the star-gate comment; when the rolling comment matches nothing, those four keep their own ordering among themselves, in that order. A caller-requested retrigger (`--trigger-after`) — or the wait's own star-gate-triggered retrigger — still fires once due even when a stale rate-limit or comment-update-failure comment is found at the same time — it is not skipped just because that poll's early return is about to happen. A rate-limit block found inside the rolling comment is exclusively owned by the rolling-comment check — the standalone rate-limit comment match never reports it — so a `rateLimitComment.id` for that case is always the composite `<id>@<fingerprint>` form, never a raw comment id.

**False-positive safeguards.** Matching ignores failure phrases quoted inside Markdown code spans. The top-level detectors (the standalone rate-limit, comment-update-failure, and star-gate checks) never match CodeRabbit's own rolling walkthrough comment — its prose (a summary, a changes table) can incidentally contain a failure phrase, which would otherwise abort the wait on a false positive before any real review or genuine failure notice exists. This exclusion is deliberately scoped to those top-level checks only: the dedicated rolling-comment detector still intentionally matches the bounded rate-limit-edit and completion sections inside that same comment — see "Detection precedence" above.

### Review lock usage

```bash
node tools/dev-workflow-cli/dist/main.js acquire-review-lock <holder-id> [--timeout-ms=<ms>] [--interval-ms=30000]
node tools/dev-workflow-cli/dist/main.js heartbeat-review-lock <holder-id>
node tools/dev-workflow-cli/dist/main.js release-review-lock <holder-id>
```

These three subcommands share one lock: a JSON file at `.claude/review-lock/state.json` in the repository's **main checkout** (resolved the same way `resolve-main-root` resolves it), so every worktree on the machine coordinates through the same file. It is gitignored, and both the directory and an initial empty state are created lazily on first use.

`<holder-id>` identifies the session. Callers pass the current worktree's branch name (`git branch --show-current`).

The file holds one current `holder` (or `null` when free) and a FIFO `queue`:

```json
{
  "holder": {
    "id": "worktree-issue-757-serialize-review-loop",
    "acquiredAt": "2026-09-06T03:00:00.000Z",
    "heartbeatAt": "2026-09-06T03:04:30.000Z"
  },
  "queue": [{ "id": "worktree-issue-758-foo", "enqueuedAt": "2026-09-06T03:01:00.000Z" }]
}
```

- `acquire-review-lock` appends the holder id to the queue if it is not already queued or holding, then polls (every `--interval-ms`, default 30 seconds) until that id is at the front of the queue **and** the lock is free — either `holder` is `null`, or the current holder's `heartbeatAt` is more than 15 minutes old, which reclaims a lock left behind by a killed or crashed session. It prints `{"acquired": true, "waitedMs": <n>}`. With no `--timeout-ms` it waits indefinitely, which is the intended use: waiting quietly is cheaper than competing for the review quota. With `--timeout-ms` it prints `{"acquired": false, "timedOut": true}` on expiry and leaves the caller's ticket in the queue.
- `heartbeat-review-lock` prints `{"ok": true}` after refreshing `heartbeatAt`. If the caller is not the current holder — someone else holds it, or it was reclaimed as stale — it changes nothing and prints `{"ok": false, "reason": "not the current holder"}`. A caller that sees this must re-acquire before doing anything that would trigger another review.
- `release-review-lock` clears `holder` when the caller holds it, or removes the caller's queue ticket when it is only waiting, printing `{"released": true}` either way. A caller present in neither place gets `{"released": false}` — a stale double-release, not an error.

Corrupted or unparseable state is treated as the empty state rather than failing: losing lock bookkeeping costs some extra rate-limit contention, which is exactly the thing this reduces rather than guarantees, and is far better than deadlocking an unattended overnight run.

Every mutation is serialized across processes by a sibling `state.json.lock` file created with the exclusive `wx` flag, and written by writing a temp file and renaming it over the target, so a reader never sees a half-written file. That mutex guards one read-plus-write only, so a `.lock` left behind by a crash mid-mutation is cleared by its own age (seconds), independently of the review lock's 15-minute heartbeat.

### `check-dependency-dashboard` usage

```bash
gh issue view <N> --json number,title,author | node tools/dev-workflow-cli/dist/main.js check-dependency-dashboard
```

Reads JSON on stdin, either a single issue object (as `gh issue view` prints) or an array of them (as `gh issue list` prints). Each item needs a `title` and an `author.login`; any other fields — `number`, `url`, `state` — pass through to the output with their values unchanged (key order may differ), so a caller can carry identifying data through the check without a second lookup.

Prints the same shape back (object in, object out; array in, array out) with `isDependencyDashboard` added to each item. It is `true` only when the title is exactly `Dependency Dashboard` **and** the author's login is exactly `app/renovate` — Renovate's standing status issue, which it rewrites itself and which is never a piece of work to pick up. Both conditions are required, so a coincidentally-titled human-authored issue does not match, and detection survives Renovate recreating the issue under a new number.

Malformed JSON, or an item missing `title`/`author.login`, is an error (exit 1) rather than a `false` — callers use this as a safety gate and must fail closed.

## Development

```bash
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run verify      # build + lint + typecheck + format + test
```
