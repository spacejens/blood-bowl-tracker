# workflow-lint

`tools/workflow-lint` is a NestJS CLI application that fails the build when a
GitHub Actions workflow references a remote action by a tag or branch instead
of a full commit SHA. A tag can be re-pointed by the action's maintainers, or
by anyone who compromises their account, and the deploy and backup workflows
hold production credentials; a SHA cannot change, so the code those workflows
run only changes through a reviewed change in this repo. Renovate keeps the
pins current (see the Renovate notes in
[development-workflow.md](../development-workflow.md#code-hygiene)); this check
makes sure a pin cannot silently regress to a tag.

## What it checks

Every `*.yml` / `*.yaml` file directly under the repo root's
`.github/workflows/` is parsed as YAML, and every `uses:` value GitHub
resolves is checked: step-level (`jobs.<job>.steps[].uses`) and job-level
reusable workflows (`jobs.<job>.uses`). The directory is located from the
package's own location, so the check targets the checkout or worktree it was
built in, whatever the working directory.

| Reference | Result |
| --- | --- |
| Local path (`./.github/actions/setup`, `./.github/workflows/x.yml`) | Pass |
| `owner/repo[/path]@<40 lowercase hex characters>` | Pass |
| `docker://image[:tag]@sha256:<64 lowercase hex characters>` | Pass |
| A tag (`@v7`, `@1.6`), a branch (`@main`), no ref, a short or uppercase SHA, a Docker image without a digest | Fail |

A workflow file that does not parse as YAML also fails, and so does a
directory that contains no workflow files at all (a mis-resolved path must not
pass silently). The check also fails closed on YAML it cannot follow: an alias
to an undefined anchor, a merge key (`<<`) and an alias used as a mapping key
all fail, so list such `uses:` values explicitly.

The pinned form this repo uses keeps the version readable as a trailing
comment, which Renovate keeps in sync with the SHA:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
```

## Running it

It runs as part of `pnpm lint` (and so `pnpm verify` and CI's lint job). To
run it alone from the repo root:

```bash
pnpm run lint:workflows
```

That builds the package and runs `node tools/workflow-lint/dist/main.js check`.
On success it prints a JSON summary (`filesChecked`, `usesChecked`, and an
empty `problems` list) and exits 0. Otherwise it prints one line per problem
on stderr, then a JSON error, and exits 1:

```text
.github/workflows/ci.yml:17: 'actions/checkout@v7' is not pinned to a full 40-character commit SHA
```

Nothing is auto-fixable, so `pnpm lint:fix` does not run it. To pin an
action, resolve the tag's commit with
`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.type+" "+.object.sha'`
(dereference it once more via `git/tags/<sha>` if the type is `tag`).

## Development

```bash
pnpm --filter @blood-bowl-tracker/workflow-lint run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/workflow-lint run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/workflow-lint run verify      # build + lint + typecheck + format + test
```
