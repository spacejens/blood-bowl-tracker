# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Blood Bowl Tracker — a tool for tracking Blood Bowl games/teams/players.

## Technology Stack

NestJS 11 (Node.js/TypeScript). Uses Express as the HTTP adapter. Tests use Jest with `ts-jest`.

## Commands

```bash
npm run start:dev    # dev server with watch mode
npm run build        # compile to dist/
npm run start:prod   # run compiled output
npm run test         # unit tests (*.spec.ts in src/)
npm run test:e2e     # e2e tests (test/*.e2e-spec.ts)
npm run test:cov     # unit tests with coverage
npm run lint         # ESLint with auto-fix
```

Run a single test file: `npx jest src/path/to/file.spec.ts`

## Architecture

NestJS uses a module system — each feature area gets its own module (`@Module`), grouping controllers, services, and providers. Start new features by generating with the CLI:

```bash
npx nest generate module <name>
npx nest generate controller <name>
npx nest generate service <name>
```

Entry point is `src/main.ts`. The root module is `src/app.module.ts`; import feature modules there.
