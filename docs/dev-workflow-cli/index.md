# dev-workflow-cli

`tools/dev-workflow-cli` is a NestJS CLI application providing worktree-aware
helpers the Claude Code skills in `.claude/skills/` call instead of
hand-rolling the equivalent shell. Worktree isolation is one reason for this:
a worktree-isolated session refuses to run shell commands complex enough that
it cannot verify they stay inside the worktree — see
[implement/SKILL.md's "Worktree isolation and shell commands" section](../../.claude/skills/implement/SKILL.md#worktree-isolation-and-shell-commands)
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
| `check-coderabbit-activity` | Answer whether CodeRabbit has ever posted any comment or review on a PR, so a skill can tell a silently-ignored PR from one it has already engaged with |
| `capture-coderabbit-comment` | Record every distinct body CodeRabbit's comments on a PR go through while a review pass runs, with a layout report per body, so skill rules about its rolling comment can be checked against real data |
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
node tools/dev-workflow-cli/dist/main.js wait-for-pr-review <pr-number> <developer-login> <since-epoch-seconds> [--timeout-ms=1200000] [--interval-ms=30000] [--exclude-review-id=<id>] [--exclude-comment-id=<id>] [--exclude-comment-update-failure-id=<id>] [--trigger-after=<epoch-seconds>] [--trigger-merge-main]
```

- `<pr-number>` — the PR to poll.
- `<developer-login>` — the PR author's own login, excluded as a reviewer.
- `<since-epoch-seconds>` — only reviews, rate-limit comments, or comment-update-failure comments submitted at or after this instant qualify, and only completion comments (see below) whose own timestamp is at or after this instant (inclusive in every case — `<since-epoch-seconds>` has only second precision, so a strict "after" would miss a distinct match in the same second).
- `--timeout-ms` (default 1200000, 20 minutes) / `--interval-ms` (default 30000, 30 seconds) — optional overrides; `--interval-ms` has a 1000ms minimum.
- `--exclude-review-id` — excludes one review by its `id`, regardless of its `submittedAt`. Needed alongside the inclusive threshold above: pass the previously-found review's own `id` here (e.g. across implement's Phase 6 iterations) so that same review isn't matched again forever just because the threshold is inclusive.
- `--exclude-comment-id` — the same exclusion, but for a CodeRabbit rate-limit comment's `id` instead of a review's, for the same reason.
- `--exclude-comment-update-failure-id` — the same exclusion, but for a CodeRabbit comment-update-failure comment's `id` instead of a review's or rate-limit comment's, for the same reason.
- `--trigger-after` — once the clock crosses this epoch, the first poll at or after it posts a `@coderabbitai review` comment on the PR, then polling continues to the deadline as normal. Used to nudge CodeRabbit into reviewing again once its rate limit is expected to have cleared.
- `--trigger-merge-main` — only valid together with `--trigger-after` (rejected on its own). It changes what happens at the trigger instant: instead of posting the comment, the command runs `git fetch origin` (so both `main` and the branch's own remote ref are current) and `git merge origin/main --no-edit` in its working directory (so it must be run from the worktree of the PR's branch: the PR number does not select a branch, and run anywhere else it would merge into and push whatever branch is checked out there) and, when the merge created a new commit, runs `git push`. The push is what asks CodeRabbit for a review, so no comment is posted, the branch stays current with `main`, and the PR conversation gets no extra noise.
  - **Nothing new to merge** (already up to date): falls back to the `@coderabbitai review` comment, unless the branch holds a local commit its upstream lacks (a merge whose push failed on an earlier attempt). That commit is pushed instead, and the push is the trigger.
  - **The merge conflicts:** before aborting, the command checks for `MERGE_HEAD` (with the abort's own 10-second timeout), which only a merge stopped on conflicts leaves behind. It then attempts `git merge --abort`, posts **no** `@coderabbitai review` comment, and ends the wait at once with the `mergeConflict` outcome (see below) instead of polling to its deadline. A review of a head that is behind `main` would only defer the conflict, so resolving it is left to the caller: `implement` merges, resolves, verifies and pushes, and the push asks for the review.
  - **Any other git step fails** (a network error, a rejected push, a merge that fails without leaving conflicts, a spent time budget): once the merge has started, first checks for `MERGE_HEAD` (to tell a conflict apart) and then attempts `git merge --abort` (best effort, a failed check or abort is ignored) so no half-merged tree is left behind. The check and the abort each have their own 10-second timeout, outside the wait's deadline, so together they can run up to 20 seconds past it, plus the time to terminate a git process that does not exit on its own; an operator enforcing a hard deadline on the process should allow for that. A failure before that point, such as a failed fetch, runs no abort because there is nothing to undo. Either way it falls back to the comment and reports the failure in the `retrigger` field (see below). A failed trigger never fails the wait.
  - **A merge is already in progress** in the working directory: left untouched (no abort), reported as a failure, and the comment is posted.
  - The whole attempt shares the time budget the wait was given: each git step gets only the time left, and no step starts once it is spent.
  - If only the push failed, the merge commit stays local (the abort has nothing left to undo). The next attempt pushes it, as above, or it goes out with the branch's next push.
  - Only for a branch that may take a merge of `main`: `finish-renovate-pr` does not pass this flag, since `main` must not be merged into Renovate's branch.
  - It runs no `pnpm verify`: `main` is already verified, and the pushed merge is covered by CI and the next review.
  - Except after a merge conflict, the wait itself is unchanged: it keeps polling to its deadline, and if CodeRabbit answers with a fresh rate-limit comment the result is `rateLimited` as usual.

A poll also triggers on its own, with no `--trigger-after` needed, the first time it finds a CodeRabbit comment saying the repository does not receive automatic reviews (a low-star-count gate CodeRabbit applies repo-wide). That comment never surfaces as its own JSON outcome — it just posts the same `@coderabbitai review` trigger once and keeps polling for the review that follows. That trigger always posts the comment, even with `--trigger-merge-main`: the star gate is not a rate-limit wait, so the flag applies only to the `--trigger-after` retrigger. The flag therefore assumes the repository gets automatic reviews on push: a later wait starts after the star-gate comment, cannot see it, and does not know to comment, so callers working in a star-gated repository should omit `--trigger-merge-main`.

Prints one of five JSON outcomes:

- `{"found": true, "review": {...}}` — a qualifying review was found. This shape is also used when CodeRabbit finishes a pass with nothing actionable and reports that only by editing its rolling walkthrough comment in place, rather than submitting a formal review — the service synthesizes a review-shaped result from that comment so callers need no separate case for it. The "no actionable comments" verdict is accepted from either the status block at the top of that comment or its `recent_review` section, and the `recent_review` section must name the PR's current head commit.
  - That synthesized review carries `id`, `submittedAt`, `author` and `commit.oid`.
  - `commit.oid` is the head commit its `recent_review` section was validated against: the PR's `headRefOid` as read in the same poll, which the section had to contain.
  - It mirrors the `commit.oid` a formal review carries, so a caller can compare either kind with the PR's current head the same way.
- `{"found": false, "timedOut": true}` — the timeout elapsed with nothing found.
- `{"found": false, "rateLimited": true, "rateLimitComment": {...}, "availableAtEpochSeconds": <number>}` — a CodeRabbit rate-limit warning comment was found instead of a review, so the wait returned early rather than running out its remaining time.
  - `availableAtEpochSeconds` is a best-effort epoch parsed from the comment's own stated wait time, plus a fixed 60-second buffer.
  - The buffer is there because CodeRabbit's own window can slip past the time it announced, so retrying exactly on time risks a wasted poll and a state-check race at the boundary.
  - The `availableAtEpochSeconds` key is omitted from the printed JSON entirely (not `null`) when no duration could be parsed:

    ```json
    {"found": false, "rateLimited": true, "rateLimitComment": {...}}
    ```

- `{"found": false, "commentUpdateFailed": true, "commentUpdateFailedComment": {...}}` — a CodeRabbit "couldn't update its existing comment" failure notice was found instead of a review, so the wait returned early rather than running out its remaining time. Unlike the rate-limit outcome above, there is no `availableAtEpochSeconds` equivalent here — CodeRabbit's text for this failure states no wait duration, so the caller falls back to an immediate retry (see implement's Phase 6 step b3).
- `{"found": false, "mergeConflict": true, "retrigger": {"method": "none", "mergeFailure": "<one line>"}}` — only with `--trigger-merge-main`: the retrigger's merge of `origin/main` conflicted. The command attempted to abort the merge, but the abort is best effort and may have failed, so the caller checks whether a merge is still in progress before resolving the conflict. No review comment was posted, and the wait returned at once, ahead of any rate-limit or comment-update-failure notice seen in the same poll. Nothing has asked for a review: the caller resolves the conflict and pushes (see implement's Phase 6 step 5 (b2)).

**Retrigger report.** When `--trigger-merge-main` was passed and the `--trigger-after` trigger fired, whichever outcome above is printed also carries a `retrigger` field saying how the review was requested:

- `{"method": "merge-push"}` — a push asked for the review and no comment was posted. Either the merge created a commit that was pushed, or the merge changed nothing but the branch held a local commit its upstream lacked (a merge whose push failed on an earlier attempt), and that commit was pushed. Only the first creates a new merge commit.
- `{"method": "comment"}` — the merge brought in nothing new, so the comment was posted instead.
- `{"method": "comment", "mergeFailure": "<one-line reason>"}` — a git step failed (aborting a started merge was attempted, best effort), or the wait's deadline had already passed so no merge was started, and the comment was posted instead.
- `{"method": "none"}`, with a `mergeFailure` when one applies — nothing asked for a review. Either the fallback comment itself could not be posted (`gh pr comment` exited nonzero or failed to run), and the wait keeps polling regardless; or, alongside `"mergeConflict": true`, the merge conflicted, no comment was posted by design, and the wait already ended.

The field is omitted when the flag was not passed, when the trigger instant was never reached, and when the star-gate comment caused the trigger.

**Detection precedence.** When more than one of the above could match at once, they are ranked like this:

- **A formal review this service trusts outright wins**, and nothing else is even queried — one carrying real body content, or one of two malformed shapes trusted as-is because they cannot be verified or excluded: a non-object candidate, or one missing a string id.
- **Every other match is checked against CodeRabbit's rolling walkthrough comment before it is reported**, because a rate-limit notice edited into that comment, and a completion notice verified against the PR's current head commit, are both fresher evidence than a formally-valid-but-empty review or a standalone CodeRabbit comment.
  - So a rolling-comment match — a rate-limit edit first, then a completion — outranks:
    - an empty-bodied review that only carries genuine (non-reply) inline comments
    - a rate-limit comment
    - a comment-update-failure comment
    - the star-gate comment
  - When the rolling comment matches nothing, those four keep their own ordering among themselves, in that order.
- **A retrigger still fires once due.** A caller-requested retrigger (`--trigger-after`) — or the wait's own star-gate-triggered retrigger — fires even when a stale rate-limit or comment-update-failure comment is found at the same time; it is not skipped just because that poll's early return is about to happen.
- **A rate-limit block found inside the rolling comment is exclusively owned by the rolling-comment check** — the standalone rate-limit comment match never reports it — so a `rateLimitComment.id` for that case is always the composite `<id>@<fingerprint>` form, never a raw comment id.

**False-positive safeguards.**

- Matching ignores failure phrases quoted inside Markdown code spans.
- The top-level detectors (the standalone rate-limit, comment-update-failure, and star-gate checks) never match CodeRabbit's own rolling walkthrough comment — its prose (a summary, a changes table) can incidentally contain a failure phrase, which would otherwise abort the wait on a false positive before any real review or genuine failure notice exists.
- This exclusion is deliberately scoped to those top-level checks only: the dedicated rolling-comment detector still intentionally matches the bounded rate-limit-edit and completion sections inside that same comment — see "Detection precedence" above.

### Review lock usage

```bash
node tools/dev-workflow-cli/dist/main.js acquire-review-lock <holder-id> [--timeout-ms=<ms>] [--interval-ms=<ms>]
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

- `acquire-review-lock` appends the holder id to the queue if it is not already queued or holding, then polls (every `--interval-ms`, default 30 seconds) until that id is at the front of the queue **and** the lock is free.
  - Free means either `holder` is `null`, or the current holder's `heartbeatAt` is more than 100 minutes old, which reclaims a lock left behind by a killed or crashed session.
  - `acquire-review-lock` prints `{"acquired": true, "waitedMs": <n>}`.
  - With no `--timeout-ms` it waits indefinitely, which is the intended use: waiting quietly is cheaper than competing for the review quota.
  - With `--timeout-ms` it prints `{"acquired": false, "timedOut": true}` on expiry and leaves the caller's ticket in the queue.
  - Every other queued session's own ticket is subject to the same 100-minute staleness reclaim on each poll, so a killed session waiting (not just holding) cannot permanently block everyone behind it in the queue.
- `heartbeat-review-lock` prints `{"ok": true}` after refreshing `heartbeatAt`. If the caller is not the current holder — someone else holds it, or it was reclaimed as stale — it changes nothing and prints `{"ok": false, "reason": "not the current holder"}`. A caller that sees this must re-acquire before doing anything that would trigger another review.
- `release-review-lock` clears `holder` when the caller holds it, or removes the caller's queue ticket when it is only waiting, printing `{"released": true}` either way. A caller present in neither place gets `{"released": false}` — a stale double-release, not an error.

Corrupted or unparseable state is treated as the empty state rather than failing: losing lock bookkeeping costs some extra rate-limit contention, which is exactly the thing this reduces rather than guarantees, and is far better than deadlocking an unattended overnight run.

Every mutation is serialized across processes by a sibling `state.json.lock` file created with the exclusive `wx` flag, and written by writing a temp file and renaming it over the target, so a reader never sees a half-written file. That mutex guards one read-plus-write only, so a `.lock` left behind by a crash mid-mutation is cleared by its own age (seconds), independently of the review lock's 100-minute heartbeat.

### `check-dependency-dashboard` usage

```bash
gh issue view <N> --json number,title,author | node tools/dev-workflow-cli/dist/main.js check-dependency-dashboard
```

Reads JSON on stdin, either a single issue object (as `gh issue view` prints) or an array of them (as `gh issue list` prints). Each item needs a `title` and an `author.login`; any other fields — `number`, `url`, `state` — pass through to the output with their values unchanged (key order may differ), so a caller can carry identifying data through the check without a second lookup.

Prints the same shape back (object in, object out; array in, array out) with `isDependencyDashboard` added to each item. It is `true` only when the title is exactly `Dependency Dashboard` **and** the author's login is exactly `app/renovate` — Renovate's standing status issue, which it rewrites itself and which is never a piece of work to pick up. Both conditions are required, so a coincidentally-titled human-authored issue does not match, and detection survives Renovate recreating the issue under a new number.

Malformed JSON, or an item missing `title`/`author.login`, is an error (exit 1) rather than a `false` — callers use this as a safety gate and must fail closed.

### `check-coderabbit-activity` usage

```bash
node tools/dev-workflow-cli/dist/main.js check-coderabbit-activity <pr-number>
```

Prints `{"hasActivity": true}` when CodeRabbit has posted at least one comment or review on the PR at any point in its history, and `{"hasActivity": false}` when it has never posted either.

The login match is a case-insensitive substring test (`test("coderabbit"; "i")`) against every comment author and every review author — the same rule `wait-for-pr-review` already applies, rather than pinning one exact spelling of the bot's account name. A `null` author (a deleted/ghost account) is coalesced to an empty string before matching, so it reads as "no match" rather than erroring.

This is a read-only historical check over the PR's whole lifetime: it is not scoped to a watermark or a time window, and it does not distinguish a real review from a rate-limit notice or any other CodeRabbit comment. That is deliberate — any CodeRabbit-authored activity at all means the automatic-review path has engaged with the PR at least once, which is the only question this answers.

Its caller is `finish-renovate-pr`, which runs it once before its review loop.

- CodeRabbit does not reliably auto-review PRs opened by bot accounts such as Renovate.
- A `false` here tells the skill to pass `--trigger-after` on the loop's first `wait-for-pr-review` call so a `@coderabbitai review` comment is posted immediately instead of waiting out a 20-minute timeout for a review that would never arrive.

Skills operating on developer-authored PRs deliberately do **not** use this — nudging unconditionally there would pre-empt CodeRabbit's normal automatic review and spend rate-limit budget for nothing.

A failing `gh` lookup, or output that is neither `true` nor `false`, is an error (exit 1) rather than a `false` — callers decide how to handle it (see `finish-renovate-pr`'s Phase 4 Integration step 5, which warns and continues with no trigger).

### `capture-coderabbit-comment` usage

```bash
node tools/dev-workflow-cli/dist/main.js capture-coderabbit-comment <pr-number> [--timeout-ms=1800000] [--interval-ms=10000] [--settle-ms=30000]
```

A diagnostic tool, not part of any skill's normal flow. Flags must come after the PR number. It polls the PR's top-level comments every `--interval-ms` (default 10 seconds, minimum 1000) and keeps each distinct body of every CodeRabbit-authored comment once, in the order first seen. The login match is the same case-insensitive `coderabbit` test the other subcommands use.

CodeRabbit may remove the "currently processing new changes" banner in one edit and write the verdict in a later one, so the capture does not stop at the first banner-free poll. Once a poll finds no CodeRabbit comment showing the banner after an earlier poll did, it keeps polling for `--settle-ms` (default 30 seconds, a positive integer) and then stops with `leftInProgress: true`. If the banner reappears during that window, the window restarts. `--timeout-ms` (default 30 minutes) bounds everything, and a timeout during the settle window, including a poll that reaches the deadline just as it completes the window, still reports `leftInProgress: true` with `timedOut: true`. The timeout is approximate: the deadline is checked after each poll, so the run can overshoot it by up to one `--interval-ms` plus that call's own 60-second limit and the two seconds the process runner waits after `SIGTERM` before escalating to `SIGKILL`. A failed `gh` call (a non-zero exit, or a process that could not be run or was killed), or output that cannot be parsed, is counted in `failedPolls` and skipped, so a `gh` that can never run only shows up as `failedPolls` climbing until the timeout. A repeated flag takes its last value.

The result has `sawInProgress`, `leftInProgress`, `timedOut`, `failedPolls` and `observations`. Each observation holds `commentId`, `updatedAt`, `observedAt`, the full `body`, and a `layout`:

- `statusBlock` / `recentReviewSection`: whether the paired `recent_review_status` and `recent_review` markers are present.
- `processingBanner`: whether the banner phrase appears in prose after code blocks and spans are masked out, which matches the code masking in `handle-pr-reviews`. It does not include that skill's stale-section guard (a `recent_review` section present without a completion verdict); evaluate the guard from `recentReviewSection` together with `statusBlockVerdict` and `sectionVerdict`. `processingBannerUnmasked` reports the phrase anywhere, code included.
- `order`: the landmarks present, by position in the body.
- `bannerInsideStatusBlock`, `statusBlockVerdict`, `sectionVerdict`: whether the banner sits inside the status block, and whether a "no actionable comments" verdict sits in each span.

Start it right after a push that triggers a review, and send its output into gitignored `docs/plans/`, never into a committed path:

```bash
node tools/dev-workflow-cli/dist/main.js capture-coderabbit-comment <pr-number> | node tools/fs-utils-cli/dist/main.js write-file docs/plans/<name>.json
```

The JSON prints only when the capture ends. Polling can miss a body that lasts less than one interval.

## Development

```bash
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/dev-workflow-cli run verify      # build + lint + typecheck + format + test
```
