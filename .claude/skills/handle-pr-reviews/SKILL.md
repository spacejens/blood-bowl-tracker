---
name: handle-pr-reviews
description: Use when processing review feedback on an open pull request in the blood-bowl-tracker project — finds unhandled review comments (inline threads and top-level PR comments), fixes or rejects each with verification, pushes the results, and replies to every comment tagged as posted by Claude
---

# handle-pr-reviews

Finds unhandled review feedback on a pull request, resolves each item with a verified fix commit or a documented rejection, pushes the results together, and replies to every item — clearly tagged so Claude's comments are never mistaken for the developer's own. This matters most during self-review through GitHub's UI, where both review comments and replies are posted through the same authenticated `gh` account.

## Invocation

```
/handle-pr-reviews
/handle-pr-reviews <N>
```

With no argument, the target PR is resolved from the current git branch. With a PR number `<N>`, that PR is used instead.

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

1. Resolve the target PR and repository:
   ```bash
   OWNER=$(gh repo view --json owner --jq '.owner.login')
   REPO=$(gh repo view --json name --jq '.name')
   ```
   - No argument: `gh pr view --json number,headRefName`
   - `<N>` given: `gh pr view <N> --json number,headRefName`

   If this fails (no PR found for the current branch, or `<N>` doesn't exist), report the error and **stop**. Otherwise record the PR number as `PR` and its branch as `HEAD_REF`.
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

If both scans find nothing unhandled, report "No unhandled review comments found." and **stop** — skip the remaining phases.

Otherwise, list every unhandled item for the developer (surface, file/line if applicable, author, short excerpt) before continuing to Phase 2.

---

### Phase 2: Triage each unhandled item

Process items in the order discovered. For each item:

1. Read its full context — for an inline thread, every comment in the thread in order; for a top-level comment, the comment itself.
2. Classify it:
   - **(a) Needs a code change** — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`: write the failing test, implement the fix, run `pnpm verify` from the repo root, then commit. **One commit per addressed item** — never bundle unrelated items into one commit just because they're being handled in the same run. A single commit may address more than one item only when they share the same fix (e.g. the same rationale applied to two near-identical locations, like a parallel edit in two modes of the same skill). The commit message references the item(s) addressed.
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

Before pushing, run the **pre-push main-checkout check**: verify nothing was accidentally left in the **main checkout** (the repo's primary working tree, distinct from this worktree) — the usual cause is a subagent dropping its `cd <worktree>` prefix and editing/committing against `main`.

- Locate the main checkout root:
  ```bash
  MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
  ```
  If `MAIN_ROOT` equals the current worktree root (`git rev-parse --show-toplevel`), work is happening in place — **skip this check**.
- Inspect the main checkout's checked-out branch for stray work:
  ```bash
  git -C "$MAIN_ROOT" status --porcelain
  git -C "$MAIN_ROOT" log --oneline @{u}..HEAD 2>/dev/null
  ```
- For each stray item, decide whether it is **already part of this worktree's work**:
  - **Uncommitted edit on main** — the same content is already committed on the worktree branch (restoring the file on main would lose nothing). Compare the main checkout's working-tree content for the affected paths against the worktree branch's committed content.
  - **Committed on main** — the commit's patch is already present on the worktree branch (cherry-pick-equivalent — `git cherry` / patch-id match, or the identical diff already committed here).
- Act on each item:
  - **Already in the worktree** → safe to clean up on main automatically: `git -C "$MAIN_ROOT" restore <paths>` (or `git -C "$MAIN_ROOT" checkout -- <paths>`) for uncommitted edits, and reset the redundant stray commits. Report what was cleaned.
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

After pushing, **REQUIRED SUB-SKILL:** Use the `deploy-local` skill to offer the developer a local look at the change. `deploy-local` asks up front whether to deploy the stack, run the BBL import, or both — selecting neither is valid and means no action is taken. Do not ask the developer separately before invoking it.

After that, **offer a SchemaSpy diagram when migrations changed** — a quiet convenience, not a required gate. Run it only when both checks below produce output, and skip silently (no prompt, no mention) otherwise. First, check whether `packages/db/migrations/` changed on this branch versus its merge-base with `main`:
```bash
git diff --name-only "$(git merge-base origin/main HEAD)" HEAD -- packages/db/migrations/
```
Then check whether the stack is actually running now — a direct state check rather than trusting `deploy-local`'s own (conversational, not structured) action selection:
```bash
docker ps --filter "name=^postgres$" --filter "status=running" --format '{{.Names}}'
```
If **both** commands print output (migrations changed AND the `postgres` container is running), offer via `AskUserQuestion`: "Generate a SchemaSpy diagram of the updated schema?" with two genuine options — "Yes, generate it" and "No, skip it". Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically. If the developer chooses yes, run `pnpm run db:diagram` from the repo root and report the output path (`docs/schemaspy-output/index.html`). If either command printed nothing, skip this entirely.

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

Reply content:
- Fixed items reference the commit's short SHA and summarize the change.
- Rejected items state the technical reasoning plainly — no performative agreement, no thanks (see `superpowers:receiving-code-review`).
- Answered items just answer the question.

---

### Phase 6: Summary

Report to the developer: counts of items fixed / rejected / answered / left unhandled (the ambiguous item, plus anything after it in discovery order that triage never reached), whether anything was pushed, and the PR URL.

**Skill ends** — human review of the pushed changes and replies happens outside this workflow. Once the developer confirms the PR has merged, use the `wrap-up` skill to verify the merge and clean up local state.
