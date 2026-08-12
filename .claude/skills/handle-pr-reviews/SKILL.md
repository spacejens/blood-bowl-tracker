---
name: handle-pr-reviews
description: Use when processing review feedback on an open pull request in the blood-bowl-tracker project — finds unhandled review comments (inline threads, top-level PR comments, and findings embedded in a submitted review's body) and failing CI checks, fixes or rejects each with verification, pushes the results, and replies to every comment (or posts a CI-failure summary) tagged as posted by Claude
---

# handle-pr-reviews

Finds unhandled review feedback on a pull request — inline review threads, top-level PR comments, and findings embedded in a submitted review's own body text — resolves each item with a verified fix commit or a documented rejection, pushes the results together, and replies to every item — clearly tagged so Claude's comments are never mistaken for the developer's own. This matters most during self-review through GitHub's UI, where both review comments and replies are posted through the same authenticated `gh` account.

## Invocation

```
/handle-pr-reviews
/handle-pr-reviews <N>
/handle-pr-reviews <N> --skip-deploy-local
```

With no argument, the target PR is resolved from the current git branch. With a PR number `<N>`, that PR is used instead.

`--skip-deploy-local` skips Phase 6 entirely: no `deploy-local` hand-off is offered, whatever this run did. It exists for `develop-feature`'s Phase 6 automated review loop, which dispatches this skill unattended after each push — an interactive `deploy-local` offer there would stall the loop waiting on a developer decision nobody is present to make. Nothing is lost by skipping it: `develop-feature` makes its own `deploy-local` offer once its loop ends. Report the skip and its reason in Phase 7 rather than silently doing nothing, so the summary and the developer both have a clear record of what happened and why. The two invocation forms above never carry this flag, so a developer running this skill standalone is unaffected.

## Comment tag convention

Every comment or reply this skill posts starts with a fixed tag line, verbatim, as its first line. This is how Phase 1 tells Claude's own past comments apart from everyone else's — comment author `login` cannot be used for this, since Claude posts through the developer's own authenticated `gh` account.

Inline thread replies:
```
**Comment by Claude**

<body>
```

Top-level PR comments:
```
**Comment by Claude** (re: <permalink to the comment being addressed>)

<body>
```

## Phases

Work through each phase in order.

---

### Phase 0: Pre-flight

1. Resolve the target PR and repository. Run these as separate commands — a worktree-isolated session can refuse a shell block combining multiple statements (see `develop-feature/SKILL.md`'s "Worktree isolation and shell commands" section) — and, since shell state does not persist between separate command invocations, record each command's printed output rather than relying on a `VAR=$(...)` assignment surviving into later commands:
   ```bash
   gh repo view --json owner --jq '.owner.login'
   ```
   Record the printed value as `OWNER`.
   ```bash
   gh repo view --json name --jq '.name'
   ```
   Record the printed value as `REPO`.
   - No argument: `gh pr view --json number,headRefName`
   - `<N>` given: `gh pr view <N> --json number,headRefName`

   If this fails (no PR found for the current branch, or `<N>` doesn't exist), report the error and **stop**. Otherwise record the PR number as `PR` and its branch as `HEAD_REF`. Every `$OWNER`/`$REPO`/`$PR`/`$HEAD_REF` reference in the commands below stands for these recorded values, substituted in literally — not a live shell variable, since none of these commands run in the same shell session.
2. Verify the current branch matches the PR's branch:
   ```bash
   git branch --show-current
   ```
   If it does not equal `HEAD_REF`, report "Current branch does not match PR #<PR>'s branch `<HEAD_REF>`. Check out the correct branch and retry." and **stop** — never switch branches automatically.
3. Verify the working tree is clean:
   ```bash
   git status --porcelain
   ```
   If this prints anything, report "Working tree is not clean. Commit or stash your changes before running this skill." and **stop**.
4. Record the current commit as this run's baseline, so later phases have an explicit anchor for "before this skill started" instead of relying on memory:
   ```bash
   BASE_SHA=$(git rev-parse HEAD)
   ```

---

### Phase 1: Discover unhandled comments

**Inline review threads** — query the PR's review threads via GraphQL:
```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 100) {
              nodes {
                databaseId
                url
                path
                line
                body
                author { login }
                pullRequestReview { state }
              }
            }
          }
        }
      }
    }
  }' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR"
```
A thread is **unhandled** if `isResolved` is `false`, its last comment's `body` does not start with `**Comment by Claude**`, **and** that last comment does not belong to a review whose `pullRequestReview.state` is `PENDING`. A pending comment belongs to a review the author has started but not yet submitted; such comments are ignored entirely — treated as if they don't exist for discovery — **even when authored by the current user**. This gives the developer a chance to finish editing before the review is submitted, and avoids posting replies against an unsubmitted review (Claude posts through the developer's own authenticated `gh` account, so author login can't distinguish these). Only inline review comments have a pending state; the top-level PR comments below post immediately and have no pending state, so their discovery rule is unchanged.

**Top-level PR comments** — list the PR's conversation comments (PRs share the issue-comments endpoint):
```bash
gh api "repos/$OWNER/$REPO/issues/$PR/comments" --paginate
```
A comment is **unhandled** if its `body` does not start with `**Comment by Claude**`, and no later comment in the list that does start with `**Comment by Claude**` contains this comment's `html_url` as a backlink.

**Review body findings** — a submitted review's own `body` text can carry findings that exist nowhere else. When a reviewer (e.g. CodeRabbit) has a finding it cannot anchor to a line in the diff — such as an "outside diff range" observation — GitHub gives it no inline comment to attach to, so the finding only ever appears in the review body, invisible to both scans above. Fetch every review on the PR:
```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviews(first: 100) {
          nodes {
            id
            url
            state
            body
            author { login }
            submittedAt
          }
        }
      }
    }
  }' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR"
```
Discard any node whose `state` is `PENDING` — an unsubmitted review the author is still editing, excluded for exactly the same reason as the pending inline comments above — and any node whose `body` is empty or whitespace-only. Everything that survives is a candidate, judged below.

Deciding whether a candidate body actually contains findings is a **semantic judgment — read the body and decide; do not pattern-match on section headings or apply a regex.** Most of a review body is not a finding: run configuration, an "Actionable comments posted: N" summary, autofix links, files-skipped notices. Findings the same review also posted inline are already covered by the `reviewThreads` scan above, and must not be counted twice here. There is no reliable mechanical marker for "this section is a genuinely new finding" that generalizes across reviewers or survives a bot rewording its own output, so read each candidate `body` and judge whether it describes concrete findings **not** already surfaced by that review's inline threads or by a top-level comment. A body that is only boilerplate — for example a `COMMENTED` review whose body is just an empty diff-scan summary — is not unhandled: skip it silently, exactly as an empty result from the other scans produces no items.

A review body is not a comment thread, so there is no per-review reply endpoint Claude could have replied into and no `isResolved` flag to read. Reuse the top-level-comment convention instead: a review's findings are **unhandled** unless a top-level PR comment — from the same `issues/$PR/comments` listing fetched above — has a `body` that starts with `**Comment by Claude**` and contains that review's `url` (e.g. `https://github.com/<owner>/<repo>/pull/<pr>#pullrequestreview-<id>`) as a backlink, matching the full URL rather than a prefix of a longer review's URL (`#pullrequestreview-123` is a substring of `#pullrequestreview-1234` and must not match it). This is the identical rule already applied to top-level comments, matched against a review's `url` instead of a comment's `html_url`.

One review body can hold several distinct findings, at different severities and in different files. Bundling them into a single triage item would force one classification and one reply across findings that may deserve different treatment — one fixed, one rejected — so **each distinct finding in an unhandled review body becomes its own discovery item**, at the same granularity the two scans above produce: file and line if the body states them, the description, and the severity if stated. Record on every extracted item which review it came from (that review's `url`); Phase 5 needs this to group findings back together when replying.

**Failing CI checks** — list the check-runs on the PR's current HEAD commit and keep anything that isn't a clean success, excluding the `gatekeeper` rollup. Run these as separate commands, for the same reason as Phase 0 step 1 above:
```bash
gh api "repos/$OWNER/$REPO/pulls/$PR" --jq '.head.sha'
```
Record the printed value as `HEAD_SHA`, the same way as `OWNER`/`REPO` above: substitute it literally into the command below — `$HEAD_SHA` is not a live shell variable, since these two commands do not run in the same shell invocation.
```bash
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" --jq '.check_runs[] | select(.conclusion != null and .conclusion != "success" and .conclusion != "skipped" and .name != "gatekeeper")'
```
Each non-passing check (`lint`, `typecheck`, or `test` — with `conclusion` such as `failure`, `timed_out`, `cancelled`, or `action_required`) becomes one unhandled item. Matching on "not a success" rather than only `"failure"` keeps discovery in sync with what actually turns `gatekeeper` red (its guard fails on `failure` *or* `cancelled`, and other non-success conclusions are just as broken). `gatekeeper` is excluded deliberately — it is only a rollup of the other three, not an independently fixable failure. Check-runs are scoped to the PR's current head commit (fetched from the server rather than assumed from local `HEAD`, since local `HEAD` may not match what was actually pushed), so any non-passing check found this way is inherently unhandled: a new push always produces fresh check-runs, and no prior-attempt tracking is needed (unlike comments). Record each check's `name` and its `id` — for GitHub-Actions-generated check-runs, this `id` **is the Actions job id**, used to fetch the job's log below.

If a relevant check-run for the current HEAD is still `in_progress` or `queued` (not yet concluded), wait and poll briefly rather than treating it as absent — a not-yet-finished check is not the same as a passing one.

If all four scans find nothing unhandled, report "No unhandled review comments or failing CI checks found." and **stop** — skip the remaining phases. The review-body scan counts here like any other: it must have produced zero extracted findings for this early exit to apply.

Otherwise, list every unhandled item for the developer (surface, file/line if applicable, author, short excerpt) before continuing to Phase 2. Findings extracted from review bodies are listed alongside the inline-thread and top-level-comment items, tagged with the surface "review body" so the developer can tell them apart at a glance.

---

### Phase 2: Triage each unhandled item

Process items in the order discovered. For each item:

1. Read its full context — for an inline thread, every comment in the thread in order; for a top-level comment, the comment itself; for a review-body finding, the extracted finding text plus the surrounding review body it came from, for context; for a failing CI check, the failing job's log (fetch it with `gh api "repos/$OWNER/$REPO/actions/jobs/<check_run_id>/logs"`, where `<check_run_id>` is the id recorded during discovery).
2. Classify it:
   - **(a) Needs a code change** — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`: write the failing test, implement the fix, run `pnpm verify` from the repo root, then commit. **One commit per addressed item** — never bundle unrelated items into one commit just because they're being handled in the same run. A single commit may address more than one item only when they share the same fix (e.g. the same rationale applied to two near-identical locations, like a parallel edit in two modes of the same skill). The commit message references the item(s) addressed. A **failing CI check** is always classification (a): fetch its failing log (`gh api "repos/$OWNER/$REPO/actions/jobs/<check_run_id>/logs"`), diagnose the failure with `superpowers:systematic-debugging`, fix it under `superpowers:test-driven-development`, and make one commit per failing check (consistent with the one-commit-per-item rule above). There is no comment thread to answer or suggestion to reject for a CI item.
   - **(b) Is a question** — draft an answer. No code change.
   - **(c) Is a suggestion to reject** — **REQUIRED SUB-SKILL:** Use `superpowers:receiving-code-review` to evaluate it (verify against the actual codebase, check YAGNI, no performative agreement) before drafting the rejection reasoning.
   - **Ambiguous** — if the right classification or fix approach genuinely isn't clear, **stop triaging further items now**: report which item is ambiguous and why, and wait for the developer's direction on it before triaging it or any item not yet reached. Do not skip or guess. Proceed to Phase 3 with whatever items were already triaged before this one — their fixes, rejections, and answers still get verified, pushed, and replied to in the phases below; only the ambiguous item and anything after it in discovery order are left for a future run.
3. Record the outcome (fixed / rejected / answered) and draft the reply text used in Phase 5.

---

### Phase 3: Verify and self-review

Skip this phase if no fix commits were made in Phase 2.

1. Run `pnpm verify` from the repo root.
2. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` over only the new fix commits made in this run (`git diff $BASE_SHA..HEAD`, i.e. since the PR's tip recorded in Phase 0) — not the PR's full branch history.
3. Fix any findings, re-run `pnpm verify`. Repeat until the review is clean and `pnpm verify` passes.

---

### Phase 4: Push

Skip this phase if no commits were made in Phase 2.

**Sync with `main`.** Bring the branch up to date with `main` before pushing (merge, never rebase — see `CLAUDE.md` "Keeping a branch in sync with main"). This runs once here, right before the push — not per-item within Phase 2's loop, and not gated on first checking whether `main` moved (merging an up-to-date `main` is a harmless no-op).
```bash
git fetch origin main
git merge origin/main
```
- **Clean merge** (no conflicts): run `pnpm verify` from the repo root. If it fails, fix the regression the merge introduced, commit, and continue. If it passes, continue directly.
- **Conflict:** attempt an automated resolution — read both sides of each conflicting hunk, resolve, then run `pnpm verify`. If the correct resolution isn't clear from the diffs, or `pnpm verify` doesn't come back clean afterward, **stop**, report the conflicting files, and wait for the developer to resolve manually before continuing.

Before pushing, run the **pre-push main-checkout check**: verify nothing was accidentally left in the **main checkout** (the repo's primary working tree, distinct from this worktree) — the usual cause is a subagent dropping its `cd <worktree>` prefix and editing/committing against `main`. This depends on `tools/ai-helpers` already being built — the "Sync with `main`" step above always runs `pnpm verify` first, which builds it, so no separate build command is needed here.

```bash
node tools/ai-helpers/dist/main.js check-main-stray
```

This prints JSON. If it prints `{"isWorktree": false}`, work is happening in place — **skip this check**. Otherwise it prints:

```json
{
  "isWorktree": true,
  "uncommittedFiles": [{ "status": " M", "path": "path/to/file" }],
  "strayCommits": [{ "sha": "abc1234", "subject": "commit subject" }]
}
```

`status` is the raw 2-character `git status --porcelain` code (e.g. `" M"`, `"??"`, `"A "`) — needed below to tell a restorable edit apart from an untracked file. If both arrays are empty, there is nothing stray — proceed to the push. Run this via the CLI rather than `git -C "$MAIN_ROOT" ...` directly: the harness blocks a worktree-isolated session from running git against another checkout, even read-only, so the inline form this replaces could not actually execute here.

- For each stray item, decide whether it is **already part of this worktree's work**:
  - **Uncommitted edit on main** (an entry in `uncommittedFiles`) — the same content is already committed on the worktree branch (restoring the file on main would lose nothing). Compare the main checkout's working-tree content for the affected paths against the worktree branch's committed content.
  - **Committed on main** (an entry in `strayCommits`) — the commit's patch is already present on the worktree branch (cherry-pick-equivalent — `git cherry` / patch-id match, or the identical diff already committed here).
- Act on each item. Cleanup runs against the main checkout, so first resolve its path:
  ```bash
  node tools/ai-helpers/dist/main.js resolve-main-root
  ```
  and use the printed `mainRoot` value as `<main-root>` below.
  - **Already in the worktree** → safe to clean up on main automatically. For an `uncommittedFiles` entry whose `status` starts with `?` (untracked — `git restore`/`checkout --` is a no-op on these), delete it directly: `rm "<main-root>/<path>"`. For every other status code, use `git -C "<main-root>" restore <paths>` (or `git -C "<main-root>" checkout -- <paths>`); reset the redundant stray commits the same way. Report what was cleaned. If the `git -C "<main-root>" ...` command itself is refused by the harness (worktree isolation), do not silently skip cleanup — print the exact command to the developer and ask them to run it themselves, e.g. by typing `! <command>` in their prompt (which runs it in their own session and returns its output into the conversation).
  - **Provenance unclear** (not found in the worktree) → **never auto-discard**. Surface the paths / commit summaries and ask the developer via `AskUserQuestion` how to proceed — the change may be their own unrelated work.

Then push every new commit together in a single push — a single push sending multiple commits is normal and expected; do not squash or combine Phase 2's separate per-item commits into one before pushing:
```bash
git push
```

After the push succeeds, self-assign the PR so it shows who pushed the fixes:
```bash
gh pr edit "$PR" --add-assignee @me
```
Use `--add-assignee` (not `--assignee`) so any existing assignees are preserved — this covers pushing fixes to someone else's PR, or resuming your own after a gap. If this command fails, print a one-line warning and **continue** — this step is supplementary to the push that already succeeded, so it must not block the rest of the skill (matching the warn-and-continue pattern used for other post-push, best-effort steps here, such as the `deploy-local` offer below).

---

### Phase 5: Reply to items

For every item processed in Phase 2 with an outcome (fixed, rejected, or answered — **not** an item that triggered an ambiguity stop in step 2's Ambiguous branch), post its reply:

- **Inline thread:** reply to the thread's latest comment so it threads correctly in GitHub's UI, using that comment's `databaseId` (the numeric REST id — not the GraphQL node `id`):
  ```bash
  gh api "repos/$OWNER/$REPO/pulls/$PR/comments/<comment's databaseId>/replies" -f body="**Comment by Claude**

  <reply text>"
  ```
- **Top-level comment:** post a new top-level comment with a backlink to the original:
  ```bash
  gh api "repos/$OWNER/$REPO/issues/$PR/comments" -f body="**Comment by Claude** (re: <original comment's html_url>)

  <reply text>"
  ```
- **Review body findings:** post **one** aggregated top-level comment for the whole review, not one per finding — a separate comment per finding would post as many new top-level comments as the review had findings, which reads as spam for what was a single review. Post it only once **every** finding belonging to that review body has an outcome from Phase 2 and, where applicable, has been verified and pushed in Phases 3–4:
  ```bash
  gh api "repos/$OWNER/$REPO/issues/$PR/comments" -f body="**Comment by Claude** (re: <the review's url>)

  <one paragraph per finding, each led by that finding's file/line — or a short quoted phrase if no line applies — so a review with several findings stays legible, followed by the same reply-content rules as any other item>"
  ```
  Use the review's `url` recorded during discovery — the next run's review-body scan looks for exactly that backlink to decide the **entire review** is handled, so this comment must never be posted until every one of that review's findings has an outcome. If Phase 2's Ambiguous stop was triggered on a finding that came from this review body, **do not post the aggregated comment for that review at all this run** — not even for the findings from it that were already triaged before the ambiguous one. Posting a partial reply would still write the review's `url` as a backlink, which the next run's discovery would then read as proof the whole review is handled, permanently hiding the untriaged finding (and anything after it) exactly the way the missed findings on PR #395 first happened. Leave the review without a backlink instead, so the next run's review-body scan rediscovers and re-extracts all of its findings; any fix commits already made this run for that review's other findings remain in the codebase, and the next triage pass will recognize them as already resolved rather than redo the work. This is stricter than the exclusion rule used for a standalone ambiguous inline or top-level item, precisely because those each have their own independent handled state and a review's findings share one.
- **Failing CI check:** there is no comment thread to reply to, so post a new top-level PR comment (no backlink — there is no original comment to reference):
  ```bash
  gh api "repos/$OWNER/$REPO/issues/$PR/comments" -f body="**Comment by Claude**

  <reply text>"
  ```

Reply content:
- Fixed items reference the commit's short SHA and summarize the change.
- Rejected items state the technical reasoning plainly — no performative agreement, no thanks (see `superpowers:receiving-code-review`).
- Answered items just answer the question.
- CI-failure items name the check that failed (`lint`/`typecheck`/`test`), summarize the diagnosis, and reference the fixing commit's short SHA.
- Review-body findings get one paragraph each inside the single aggregated comment, led by that finding's file/line (or a short quoted phrase if no line applies) so multiple findings stay distinguishable, then following the rule above for its own outcome — fixed paragraphs reference the fixing commit's short SHA, rejected paragraphs state the reasoning plainly, answered paragraphs just answer.

---

### Phase 6: Local deploy

Skip this phase if `--skip-deploy-local` was passed on invocation (see "Invocation" above) — then report the skip and its reason in Phase 7.

Skip this phase if no commits were made in Phase 2.

These two skip conditions are independent: either one on its own is reason enough to skip the phase, and neither depends on the other.

**REQUIRED SUB-SKILL:** Use the `deploy-local` skill to offer the developer a local look at the change. `deploy-local` asks up front which of its six actions to perform — deploy the stack, run the manual import before and/or after the other importers, run the BBL import, run the TP import, generate a SchemaSpy diagram — in any combination; selecting none is valid and means no action is taken. Do not ask the developer separately before invoking it.

---

### Phase 7: Summary

Report to the developer: counts of items fixed / rejected / answered / left unhandled (the ambiguous item, plus anything after it in discovery order that triage never reached), whether anything was pushed, and the PR URL. Findings extracted from review bodies are counted in these same tallies alongside inline-thread, top-level-comment and CI items — there is no separate per-surface count.

If Phase 6 was skipped because `--skip-deploy-local` was passed, say so and why — e.g. "Local deploy: skipped (`--skip-deploy-local`) — running under `develop-feature`'s automated review loop." A Phase 6 skipped because no commits were made needs no such line; that is already implied by reporting that nothing was pushed.

**Skill ends** — human review of the pushed changes and replies happens outside this workflow. Once the developer confirms the PR has merged, use the `wrap-up` skill to verify the merge and clean up local state.
