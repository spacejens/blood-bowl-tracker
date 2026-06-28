# blood-bowl-tracker

A set of tools for tracking Blood Bowl games, teams, and players.

## Repository structure

This is a pnpm monorepo with three top-level workspace folders:

| Folder | Purpose |
|--------|---------|
| `apps/` | Runnable applications deployed or distributed to end users |
| `packages/` | Shared library packages consumed by apps (not standalone) |
| `tools/` | Developer tooling and scripts not shipped as part of any app |

### Applications

- **`apps/discord-bot`** — NestJS-based Discord bot for interacting with the tracker

### Packages

_(none yet)_

### Tools

_(none yet)_

## Getting started

```bash
pnpm install          # install all workspace dependencies
pnpm build            # build all workspaces
pnpm test             # run tests across all workspaces
```

To work within a specific workspace:

```bash
cd apps/discord-bot
pnpm run start:dev    # dev server with watch mode
pnpm run test         # unit tests
pnpm run test:e2e     # e2e tests
```
