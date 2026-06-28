# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `README.md` for a description of what this project is and how the repository is structured.

## Workflow

After making any change requested by the user, create a git commit with a message explaining what was changed and why.

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
pnpm test             # run unit tests across all workspaces
```

Run from inside a specific workspace (e.g. `apps/discord-bot`) for targeted work:

```bash
pnpm run start:dev    # dev server with watch mode
pnpm run start:prod   # run compiled output
pnpm run test         # unit tests (*.spec.ts in src/)
pnpm run test:e2e     # e2e tests (test/*.e2e-spec.ts)
pnpm run test:cov     # unit tests with coverage report
pnpm run lint         # ESLint with auto-fix
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
