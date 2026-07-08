# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `README.md` for a description of what this project is and how the repository is structured.

## Workflow

After making any change requested by the user, create a git commit with a message explaining what was changed and why.

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

## Adding a new workspace package

1. Create the folder under `apps/`, `packages/`, or `tools/` with its own `package.json`.
2. Name it `@blood-bowl-tracker/<name>` and set `"private": true`.
3. Run `pnpm install` from the root to link it into the workspace.
4. Update `README.md` to list the new package.
