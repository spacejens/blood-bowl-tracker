# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `README.md` for a description of what this project is and how the repository is structured.

## Workflow

After making any change requested by the user, create a git commit with a message explaining what was changed and why.

### Keeping a branch in sync with main

When a feature branch needs to catch up with `main` during development, **merge** `main` into the branch (`git merge origin/main`) — do not rebase. Rebasing rewrites commit SHAs, which invalidates the SHA references already posted in PR review threads (a workflow this repo relies on — see `handle-pr-reviews`) and forces a force-push. If a developer explicitly asks Claude to rebase a branch onto `main` instead of merging, confirm that deviation via `AskUserQuestion` before doing it, calling out that it invalidates existing review-thread SHA references and requires a force-push. This is separate from how PRs land on `main` — those continue to merge via GitHub's merge-commit button, unchanged.

### Worktree discipline

When work is happening inside a git worktree, **every file edit and git commit must land inside that worktree** — never in the main checkout or another worktree. A stray edit or commit in the main checkout dirties it and breaks running multiple `develop-feature` instances in parallel (the whole reason worktrees are used here).

- Every subagent shell command must be prefixed with `cd <worktree-path> &&`. Subagent shell sessions do not reliably persist a working directory across tool calls, and a dropped `cd` silently writes to the wrong checkout (commonly `main` in the primary repo).
- After a subagent reports a commit, verify it landed on the expected branch/worktree with `git log --oneline -1` and `git branch --show-current` (run from the worktree) before trusting the report.

## Developer prompts

When a Claude Code skill needs the developer to make a choice, use `AskUserQuestion` rather than printing plain text and waiting for a reply — it's more obvious the assistant is waiting for input, and keeps interaction consistent across skills.

- The tool always auto-adds a free-text "Other" entry, and this harness always also offers a "Chat about this" affordance automatically. Never add an explicit "Type something" or "Chat about this" option yourself — both are redundant with what's already provided.
- The tool requires at least 2 explicit options per question — that's a floor, not a target: give every question as many genuine, distinct options as there are real paths forward (often exactly 2, sometimes more). Never invent a filler option (e.g. a generic "Needs changes") just to satisfy the minimum.
- If a checkpoint genuinely has only one real path forward and no second option exists, don't force it through `AskUserQuestion` — use a plain conversational prompt instead.

## Technology stack

- **Runtime:** Node.js (managed via nvm; activate with `source ~/.nvm/nvm.sh`)
- **Package manager:** pnpm 11 with workspaces (`pnpm-workspace.yaml`)
- **Apps:** NestJS 11 on Express, TypeScript
- **Testing:** Vitest

## Commands

Run from the repo root to target all workspaces:

```bash
pnpm install          # install all dependencies
pnpm build            # build all workspaces
pnpm test             # run unit tests with coverage across all workspaces (90% threshold enforced)
pnpm lint             # ESLint (no auto-fix)
pnpm lint:fix         # ESLint with auto-fix
pnpm typecheck        # tsc --noEmit across all workspaces
pnpm format           # Prettier check (no write)
pnpm format:fix       # Prettier write
pnpm verify           # build + lint + typecheck + test in one command
```

Run from inside a specific workspace (e.g. `apps/discord-bot`) for targeted work:

```bash
pnpm run start:dev    # dev server with watch mode
pnpm run start:prod   # run compiled output
pnpm run test         # unit tests (*.spec.ts in src/) with coverage (90% threshold enforced)
pnpm run test:e2e     # e2e tests (test/*.e2e-spec.ts)
pnpm run lint         # ESLint (no auto-fix)
pnpm run lint:fix     # ESLint with auto-fix
pnpm run typecheck    # tsc --noEmit
pnpm run format       # Prettier check (no write)
pnpm run format:fix   # Prettier write
pnpm run verify       # build + lint + typecheck + test for this workspace only
```

Run a single test file: `pnpm exec vitest run src/path/to/file.spec.ts`

## NestJS conventions

Each feature area gets its own module (`@Module`) grouping controllers, services, and providers. Scaffold new features with:

```bash
pnpm exec nest generate module <name>
pnpm exec nest generate controller <name>
pnpm exec nest generate service <name>
```

Entry point is `src/main.ts`; the root module is `src/app.module.ts`. Import new feature modules into the root module.

## Service vs. loose function

Prefer a NestJS `@Injectable()` service for all logic in NestJS-enabled
packages/apps. A loose exported function is only appropriate when one of these
four cases applies:

1. **Generic over entity/table type.** The function does I/O but is
   parameterized by a compile-time generic (a raw DB handle, `PgTable`, or
   similar passed explicitly), not a concrete injected provider. NestJS DI
   resolves dependencies by token at module-setup time; it doesn't model "this
   class needs to operate on whichever entity table the caller has in mind right
   now." Forcing these into services means either losing the generic's
   compile-time type safety or multiplying into one boilerplate subclass per
   entity, for no runtime benefit. Reference: `packages/game-data/src/shared/count-all.ts`
   and the other `packages/game-data/src/shared/*.ts` helpers.

2. **Pure assembly wrapped by a factory service.** A function that declaratively
   builds a data structure — not one that performs application logic — and is
   always invoked from a thin `@Injectable()` factory that supplies the real,
   already-injected dependencies once at construction. The factory service is
   what makes this safe: DI still resolves every real dependency; the pure
   function is just the (testable, framework-free) shape of the assembly step.
   Reference: `FactTreeFactoryService`/`buildFactTree` in
   `apps/discord-bot/src/insights/`.

3. **Provider bootstrap function used as a module's `useFactory`.** A function
   that constructs the very instance NestJS DI will then manage and inject
   elsewhere cannot itself depend on injection — that would be circular.
   References: `createDb` (`packages/db/src/db.ts`) and `createApiClient`
   (`packages/api-client/src/client.ts`).

4. **Framework-agnostic package.** `packages/api-contract` and
   `tools/eslint-rules` have no NestJS dependency at all. Adding one solely to
   satisfy this convention would be a real architectural regression.

**Everything else becomes a service — including pure data-transformation
functions with no dependencies of their own** (string escaping, formatting, tree
traversal, object/error construction, etc.). These could stay loose without
correctness problems, but the codebase standardizes on services for consistency:
one predictable place to look for logic, and no per-file judgment call.

A function that takes an already-injected NestJS provider as a parameter and
simply calls it is the clearest violation and must become a service (or a method
folded into an existing service, or a thin injectable wrapper).

## Function parameter limit

Functions and methods take at most 3 parameters — enforced repo-wide by the
custom `local/max-function-params` ESLint rule (in `tools/eslint-rules`). Beyond
three, pass a single named options-object type instead of positional parameters;
this keeps call sites readable and prevents transposing two same-typed arguments.

**Constructors are exempt** — NestJS DI constructors routinely inject 5+
providers, which are typed, compiler-checked, and wired by the framework rather
than hand-ordered by a caller, so the fragility the rule guards against does not
apply. Do not refactor DI constructors into props objects to satisfy the rule.

## Maximum file size

TypeScript files stay under a line ceiling — enforced repo-wide by ESLint's
built-in `max-lines` rule in `eslint.config.ts`. Source `*.ts` files may be at
most **500 lines**; `*.spec.ts` test files at most **1000 lines**. Both counts
exclude blank and comment lines (`skipBlankLines` + `skipComments`), so the
limit reflects actual code, not whitespace or JSDoc. Spec files get a higher
ceiling because unit tests are more verbose and less complex by nature (repeated
setup/assertion patterns per case), and the tests for a piece of code are often
longer than the code itself.

**`apps/discord-bot/src/insights/fact-tree.ts` is exempt** — it is a declarative
data structure (the fact-tree definition), not logic, so its size does not carry
the complexity risk the rule guards against, and splitting it would fragment one
coherent piece of data across files.

When a file grows past its limit, split it rather than suppressing or raising the
limit: extract one or more focused services/modules from a source file, or split
a spec file into multiple files grouped by the functionality under test (sharing
setup via a `*.test-helpers.ts` module, which is exempt from coverage).

## Adding a new workspace package

1. Create the folder under `apps/`, `packages/`, or `tools/` with its own `package.json`.
2. Name it `@blood-bowl-tracker/<name>` and set `"private": true`.
3. Run `pnpm install` from the root to link it into the workspace.
4. Update `README.md` to list the new package.
