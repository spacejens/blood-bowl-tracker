# Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold all packages from the architecture (db, api-contract, api-server, api-client, import), wire the discord-bot to use api-server, and implement the first import tool (import-bbl).

**Architecture:** The discord-bot is the only deployed app; it hosts the NestJS API server directly by importing `ApiServerModule`. The packages layer provides the DB schema (Drizzle), API contract (ts-rest), server-side services, and a typed client for tools. `import-bbl` is a CLI tool that reads BBL export files and uploads data via the api-client.

**Tech Stack:** NestJS 11, Drizzle ORM `1.0.0-rc.4`, postgres.js `^3.4.9`, ts-rest `^3.52.1`, Zod `^3.25.76` (Zod 3 — required by ts-rest), Vitest `^2.0.0`, SWC for NestJS decorator metadata, pnpm workspaces.

## Global Constraints

- All packages: name `@blood-bowl-tracker/<name>`, `"private": true`, `"version": "0.0.1"`
- TypeScript: use `nodenext` module resolution; `emitDecoratorMetadata: true`; `strictNullChecks: true`; `skipLibCheck: true`
- Zod must be `^3.25.76` (Zod 3) — ts-rest 3.x peer-requires `zod: ^3.22.3` and is incompatible with Zod 4
- Drizzle packages: use `rc` tag (`drizzle-orm@rc`, `drizzle-kit@rc` = `1.0.0-rc.4`)
- Drizzle 1.0 `drizzle()` takes an options object: `drizzle({ client, schema })` not `drizzle(client, { schema })`
- Test framework: Vitest `^2.0.0` with `globals: true`; NestJS packages additionally need `unplugin-swc` + `@swc/core` and a `.swcrc` (see `apps/discord-bot` as reference)
- Commit after each completed task
- Update `README.md` packages/tools tables in the final task

## Shared package boilerplate

Every package shares this `tsconfig.json` shape (adjust `outDir` and add/remove `emitDecoratorMetadata` as noted per task):

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "declaration": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strictNullChecks": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": "./"
  },
  "include": ["src"]
}
```

`tsconfig.build.json` (same in all packages):
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

Non-NestJS vitest config (db, api-contract, import, api-client, import-bbl):
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'] },
});
```

NestJS vitest config (api-server) — same as `apps/discord-bot`:
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts'] },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

`test/setup.ts` (NestJS packages only):
```ts
import 'reflect-metadata';
```

`.swcrc` (NestJS packages only — copy from `apps/discord-bot/.swcrc`):
```json
{
  "$schema": "https://json.schemastore.org/swcrc",
  "sourceMaps": true,
  "jsc": {
    "parser": { "syntax": "typescript", "decorators": true, "dynamicImport": true },
    "transform": { "decoratorMetadata": true, "legacyDecorator": true },
    "target": "es2021",
    "keepClassNames": true
  },
  "minify": false
}
```

---

## Task 1: packages/db — Drizzle schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/tsconfig.build.json`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/teams.ts`
- Create: `packages/db/src/schema/players.ts`
- Create: `packages/db/src/schema/matches.ts`
- Create: `packages/db/src/schema/match-events.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/db.ts`
- Create: `packages/db/src/index.ts`
- Test: `packages/db/src/schema/schema.spec.ts`

**Interfaces:**
- Produces: `createDb(url: string): Db`, `Team`, `NewTeam`, `Player`, `NewPlayer`, `Match`, `NewMatch`, `MatchEvent`, `NewMatchEvent`, all schema tables (`teams`, `players`, `matches`, `matchEvents`), and `Db` type — consumed by `packages/api-server`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/db",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "drizzle-orm": "rc",
    "postgres": "^3.4.9"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "drizzle-kit": "rc",
    "typescript": "^5.7.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts**

Use the shared boilerplate from the Global Constraints section above.
`vitest.config.ts`: use the non-NestJS config.

- [ ] **Step 3: Create drizzle.config.ts**

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 4: Write failing schema test**

`packages/db/src/schema/schema.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { teams, players, matches, matchEvents } from './index';

describe('schema', () => {
  it('exports teams table with required columns', () => {
    expect(teams.id).toBeDefined();
    expect(teams.name).toBeDefined();
    expect(teams.race).toBeDefined();
    expect(teams.coach).toBeDefined();
  });

  it('exports players table with required columns', () => {
    expect(players.id).toBeDefined();
    expect(players.name).toBeDefined();
    expect(players.teamId).toBeDefined();
    expect(players.position).toBeDefined();
  });

  it('exports matches table with required columns', () => {
    expect(matches.id).toBeDefined();
    expect(matches.homeTeamId).toBeDefined();
    expect(matches.awayTeamId).toBeDefined();
    expect(matches.playedAt).toBeDefined();
  });

  it('exports matchEvents table with required columns', () => {
    expect(matchEvents.id).toBeDefined();
    expect(matchEvents.matchId).toBeDefined();
    expect(matchEvents.type).toBeDefined();
    expect(matchEvents.teamId).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
cd packages/db && pnpm install && pnpm test
```
Expected: fails with module not found errors.

- [ ] **Step 6: Create schema files**

`packages/db/src/schema/teams.ts`:
```ts
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  race: varchar('race', { length: 100 }).notNull(),
  coach: varchar('coach', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
```

`packages/db/src/schema/players.ts`:
```ts
import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { teams } from './teams';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
  position: varchar('position', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
```

`packages/db/src/schema/matches.ts`:
```ts
import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { teams } from './teams';

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  homeTeamId: integer('home_team_id').references(() => teams.id).notNull(),
  awayTeamId: integer('away_team_id').references(() => teams.id).notNull(),
  playedAt: timestamp('played_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
```

`packages/db/src/schema/match-events.ts`:
```ts
import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { matches } from './matches';
import { teams } from './teams';
import { players } from './players';

export const matchEvents = pgTable('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
  playerId: integer('player_id').references(() => players.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
```

`packages/db/src/schema/index.ts`:
```ts
export * from './teams';
export * from './players';
export * from './matches';
export * from './match-events';
```

- [ ] **Step 7: Create db.ts and index.ts**

`packages/db/src/db.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string) {
  const client = postgres(url);
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;
```

`packages/db/src/index.ts`:
```ts
export * from './schema';
export { createDb } from './db';
export type { Db } from './db';
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd packages/db && pnpm test
```
Expected: 4 tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/db
git commit -m "Add packages/db with Drizzle schema for core Blood Bowl entities"
```

---

## Task 2: packages/api-contract — ts-rest contract

**Files:**
- Create: `packages/api-contract/package.json`
- Create: `packages/api-contract/tsconfig.json`
- Create: `packages/api-contract/tsconfig.build.json`
- Create: `packages/api-contract/vitest.config.ts`
- Create: `packages/api-contract/src/schemas/team.ts`
- Create: `packages/api-contract/src/schemas/match.ts`
- Create: `packages/api-contract/src/schemas/match-event.ts`
- Create: `packages/api-contract/src/contract.ts`
- Create: `packages/api-contract/src/index.ts`
- Test: `packages/api-contract/src/contract.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `contract` (ts-rest router), `TeamSchema`, `CreateTeamSchema`, `MatchSchema`, `CreateMatchSchema`, `MatchEventSchema`, `CreateMatchEventSchema` — consumed by `packages/api-server` and `packages/api-client`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/api-contract",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ts-rest/core": "^3.52.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts**

Use the shared boilerplate. `vitest.config.ts`: use the non-NestJS config.
`tsconfig.json`: `emitDecoratorMetadata` is not needed here (no decorators) — omit it.

- [ ] **Step 3: Write failing contract test**

`packages/api-contract/src/contract.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { contract } from './contract';

describe('contract', () => {
  it('defines teams routes', () => {
    expect(contract.teams.list.method).toBe('GET');
    expect(contract.teams.list.path).toBe('/teams');
    expect(contract.teams.getById.method).toBe('GET');
    expect(contract.teams.getById.path).toBe('/teams/:id');
    expect(contract.teams.create.method).toBe('POST');
    expect(contract.teams.create.path).toBe('/teams');
  });

  it('defines matches routes', () => {
    expect(contract.matches.list.method).toBe('GET');
    expect(contract.matches.getById.method).toBe('GET');
    expect(contract.matches.create.method).toBe('POST');
  });

  it('defines matchEvents routes', () => {
    expect(contract.matchEvents.listByMatch.method).toBe('GET');
    expect(contract.matchEvents.create.method).toBe('POST');
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd packages/api-contract && pnpm install && pnpm test
```
Expected: fails with module not found.

- [ ] **Step 5: Create Zod schemas**

`packages/api-contract/src/schemas/team.ts`:
```ts
import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  race: z.string(),
  coach: z.string(),
  createdAt: z.date(),
});

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  race: z.string().min(1),
  coach: z.string().min(1),
});

export type Team = z.infer<typeof TeamSchema>;
export type CreateTeam = z.infer<typeof CreateTeamSchema>;
```

`packages/api-contract/src/schemas/match.ts`:
```ts
import { z } from 'zod';

export const MatchSchema = z.object({
  id: z.number(),
  homeTeamId: z.number(),
  awayTeamId: z.number(),
  playedAt: z.date(),
  createdAt: z.date(),
});

export const CreateMatchSchema = z.object({
  homeTeamId: z.number(),
  awayTeamId: z.number(),
  playedAt: z.date(),
});

export type Match = z.infer<typeof MatchSchema>;
export type CreateMatch = z.infer<typeof CreateMatchSchema>;
```

`packages/api-contract/src/schemas/match-event.ts`:
```ts
import { z } from 'zod';

export const MatchEventSchema = z.object({
  id: z.number(),
  matchId: z.number(),
  type: z.string(),
  teamId: z.number(),
  playerId: z.number().nullable(),
  createdAt: z.date(),
});

export const CreateMatchEventSchema = z.object({
  matchId: z.number(),
  type: z.string().min(1),
  teamId: z.number(),
  playerId: z.number().optional(),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type CreateMatchEvent = z.infer<typeof CreateMatchEventSchema>;
```

- [ ] **Step 6: Create contract.ts**

`packages/api-contract/src/contract.ts`:
```ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { TeamSchema, CreateTeamSchema } from './schemas/team';
import { MatchSchema, CreateMatchSchema } from './schemas/match';
import { MatchEventSchema, CreateMatchEventSchema } from './schemas/match-event';

const c = initContract();

export const contract = c.router({
  teams: c.router({
    list: {
      method: 'GET',
      path: '/teams',
      responses: { 200: z.array(TeamSchema) },
    },
    getById: {
      method: 'GET',
      path: '/teams/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: TeamSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/teams',
      body: CreateTeamSchema,
      responses: { 201: TeamSchema },
    },
  }),
  matches: c.router({
    list: {
      method: 'GET',
      path: '/matches',
      responses: { 200: z.array(MatchSchema) },
    },
    getById: {
      method: 'GET',
      path: '/matches/:id',
      pathParams: z.object({ id: z.coerce.number() }),
      responses: {
        200: MatchSchema,
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/matches',
      body: CreateMatchSchema,
      responses: { 201: MatchSchema },
    },
  }),
  matchEvents: c.router({
    listByMatch: {
      method: 'GET',
      path: '/matches/:matchId/events',
      pathParams: z.object({ matchId: z.coerce.number() }),
      responses: { 200: z.array(MatchEventSchema) },
    },
    create: {
      method: 'POST',
      path: '/match-events',
      body: CreateMatchEventSchema,
      responses: { 201: MatchEventSchema },
    },
  }),
});
```

`packages/api-contract/src/index.ts`:
```ts
export { contract } from './contract';
export * from './schemas/team';
export * from './schemas/match';
export * from './schemas/match-event';
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd packages/api-contract && pnpm test
```
Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api-contract
git commit -m "Add packages/api-contract with ts-rest contract for teams, matches, and match events"
```

---

## Task 3: packages/import — Import types and result types

**Files:**
- Create: `packages/import/package.json`
- Create: `packages/import/tsconfig.json`
- Create: `packages/import/tsconfig.build.json`
- Create: `packages/import/vitest.config.ts`
- Create: `packages/import/src/types.ts`
- Create: `packages/import/src/index.ts`
- Test: `packages/import/src/types.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ImportResult`, `ImportError` — consumed by `packages/api-server` and `tools/import-bbl`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/import",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts**

Use the shared boilerplate. `vitest.config.ts`: use the non-NestJS config. No `emitDecoratorMetadata` needed.

- [ ] **Step 3: Write failing types test**

`packages/import/src/types.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { makeImportResult, makeImportError } from './types';

describe('makeImportResult', () => {
  it('creates a successful result', () => {
    const result = makeImportResult({ imported: 5, errors: [] });
    expect(result.success).toBe(true);
    expect(result.imported).toBe(5);
    expect(result.errors).toHaveLength(0);
  });

  it('creates a failed result when errors are present', () => {
    const error = makeImportError({ item: { id: 1 }, message: 'Unknown team' });
    const result = makeImportResult({ imported: 0, errors: [error] });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Unknown team');
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd packages/import && pnpm install && pnpm test
```
Expected: fails with module not found.

- [ ] **Step 5: Create types.ts and index.ts**

`packages/import/src/types.ts`:
```ts
export interface ImportError {
  item: unknown;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
}

export function makeImportError(args: { item: unknown; message: string }): ImportError {
  return { item: args.item, message: args.message };
}

export function makeImportResult(args: {
  imported: number;
  errors: ImportError[];
}): ImportResult {
  return {
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  };
}
```

`packages/import/src/index.ts`:
```ts
export * from './types';
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd packages/import && pnpm test
```
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/import
git commit -m "Add packages/import with ImportResult and ImportError types"
```

---

## Task 4: packages/api-server — NestJS services implementing the contract

**Files:**
- Create: `packages/api-server/package.json`
- Create: `packages/api-server/tsconfig.json`
- Create: `packages/api-server/tsconfig.build.json`
- Create: `packages/api-server/vitest.config.ts`
- Create: `packages/api-server/test/setup.ts`
- Create: `packages/api-server/.swcrc`
- Create: `packages/api-server/src/db/db.module.ts`
- Create: `packages/api-server/src/teams/teams.service.ts`
- Create: `packages/api-server/src/teams/teams.controller.ts`
- Create: `packages/api-server/src/teams/teams.module.ts`
- Create: `packages/api-server/src/matches/matches.service.ts`
- Create: `packages/api-server/src/matches/matches.controller.ts`
- Create: `packages/api-server/src/matches/matches.module.ts`
- Create: `packages/api-server/src/match-events/match-events.service.ts`
- Create: `packages/api-server/src/match-events/match-events.controller.ts`
- Create: `packages/api-server/src/match-events/match-events.module.ts`
- Create: `packages/api-server/src/api-server.module.ts`
- Create: `packages/api-server/src/index.ts`
- Test: `packages/api-server/src/teams/teams.service.spec.ts`
- Test: `packages/api-server/src/matches/matches.service.spec.ts`
- Test: `packages/api-server/src/match-events/match-events.service.spec.ts`

**Interfaces:**
- Consumes: `createDb`/`Db`/schema from `@blood-bowl-tracker/db`; `contract` from `@blood-bowl-tracker/api-contract`
- Produces: `ApiServerModule` — consumed by `apps/discord-bot`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/api-server",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage"
  },
  "dependencies": {
    "@blood-bowl-tracker/api-contract": "workspace:*",
    "@blood-bowl-tracker/db": "workspace:*",
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@ts-rest/nest": "^3.52.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.0.1",
    "@swc/core": "^1.15.43",
    "@types/node": "^24.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "typescript": "^5.7.3",
    "unplugin-swc": "^1.5.9",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts, test/setup.ts, .swcrc**

Use the shared boilerplate from Global Constraints: NestJS vitest config (with SWC), NestJS test/setup.ts, and .swcrc.

- [ ] **Step 3: Create db.module.ts with injection token**

`packages/api-server/src/db/db.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { createDb } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

export const DB = Symbol('DB');
export type { Db };

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => createDb(process.env.DATABASE_URL!),
    },
  ],
  exports: [DB],
})
export class DbModule {}
```

- [ ] **Step 4: Write failing TeamsService test**

`packages/api-server/src/teams/teams.service.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { DB } from '../db/db.module';

const fakeTeam = {
  id: 1,
  name: 'Orcland Raiders',
  race: 'Orc',
  coach: 'Coach Grumpf',
  createdAt: new Date('2026-01-01'),
};

describe('TeamsService', () => {
  let service: TeamsService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn() };
    const insertChain = { values: vi.fn() };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };
    selectChain.from.mockResolvedValue([fakeTeam]);
    insertChain.values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeTeam]) }));

    const module = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(TeamsService);
  });

  it('findAll returns a list of teams', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeTeam]);
  });

  it('create inserts and returns the new team', async () => {
    const result = await service.create({ name: 'Orcland Raiders', race: 'Orc', coach: 'Coach Grumpf' });
    expect(result.name).toBe('Orcland Raiders');
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
cd packages/api-server && pnpm install && pnpm test
```
Expected: fails with module not found.

- [ ] **Step 6: Create TeamsService**

`packages/api-server/src/teams/teams.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { teams } from '@blood-bowl-tracker/db';
import type { NewTeam, Team } from '@blood-bowl-tracker/db';
import { DB } from '../db/db.module';
import type { Db } from '../db/db.module';

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Team[]> {
    return this.db.select().from(teams);
  }

  async findById(id: number): Promise<Team | undefined> {
    const result = await this.db.select().from(teams).where(eq(teams.id, id));
    return result[0];
  }

  async create(data: NewTeam): Promise<Team> {
    const result = await this.db.insert(teams).values(data).returning();
    return result[0];
  }
}
```

- [ ] **Step 7: Write failing MatchesService test**

`packages/api-server/src/matches/matches.service.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchesService } from './matches.service';
import { DB } from '../db/db.module';

const fakeMatch = {
  id: 1,
  homeTeamId: 1,
  awayTeamId: 2,
  playedAt: new Date('2026-01-15'),
  createdAt: new Date('2026-01-15'),
};

describe('MatchesService', () => {
  let service: MatchesService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockResolvedValue([fakeMatch]) };
    const insertChain = {
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeMatch]) })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(MatchesService);
  });

  it('findAll returns a list of matches', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeMatch]);
  });

  it('create inserts and returns the new match', async () => {
    const result = await service.create({
      homeTeamId: 1,
      awayTeamId: 2,
      playedAt: new Date('2026-01-15'),
    });
    expect(result.homeTeamId).toBe(1);
  });
});
```

- [ ] **Step 8: Create MatchesService**

`packages/api-server/src/matches/matches.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { matches } from '@blood-bowl-tracker/db';
import type { Match, NewMatch } from '@blood-bowl-tracker/db';
import { DB } from '../db/db.module';
import type { Db } from '../db/db.module';

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Match[]> {
    return this.db.select().from(matches);
  }

  async findById(id: number): Promise<Match | undefined> {
    const result = await this.db.select().from(matches).where(eq(matches.id, id));
    return result[0];
  }

  async create(data: NewMatch): Promise<Match> {
    const result = await this.db.insert(matches).values(data).returning();
    return result[0];
  }
}
```

- [ ] **Step 9: Write failing MatchEventsService test**

`packages/api-server/src/match-events/match-events.service.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchEventsService } from './match-events.service';
import { DB } from '../db/db.module';

const fakeEvent = {
  id: 1,
  matchId: 1,
  type: 'touchdown',
  teamId: 1,
  playerId: 3,
  createdAt: new Date('2026-01-15'),
};

describe('MatchEventsService', () => {
  let service: MatchEventsService;

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([fakeEvent]) })),
    };
    const insertChain = {
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeEvent]) })),
    };
    const mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchEventsService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(MatchEventsService);
  });

  it('findByMatchId returns events for a match', async () => {
    const result = await service.findByMatchId(1);
    expect(result).toEqual([fakeEvent]);
  });

  it('create inserts and returns the new event', async () => {
    const result = await service.create({ matchId: 1, type: 'touchdown', teamId: 1 });
    expect(result.type).toBe('touchdown');
  });
});
```

- [ ] **Step 10: Create MatchEventsService**

`packages/api-server/src/match-events/match-events.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { matchEvents } from '@blood-bowl-tracker/db';
import type { MatchEvent, NewMatchEvent } from '@blood-bowl-tracker/db';
import { DB } from '../db/db.module';
import type { Db } from '../db/db.module';

@Injectable()
export class MatchEventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findByMatchId(matchId: number): Promise<MatchEvent[]> {
    return this.db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
  }

  async create(data: NewMatchEvent): Promise<MatchEvent> {
    const result = await this.db.insert(matchEvents).values(data).returning();
    return result[0];
  }
}
```

- [ ] **Step 11: Run tests to confirm they pass**

```bash
cd packages/api-server && pnpm test
```
Expected: 6 tests pass (2 per service).

- [ ] **Step 12: Create controllers**

`packages/api-server/src/teams/teams.controller.ts`:
```ts
import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @TsRestHandler(contract.teams)
  async handler() {
    return tsRestHandler(contract.teams, {
      list: async () => ({
        status: 200 as const,
        body: await this.teamsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const team = await this.teamsService.findById(id);
        if (!team) return { status: 404 as const, body: { message: 'Team not found' } };
        return { status: 200 as const, body: team };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.teamsService.create(body),
      }),
    });
  }
}
```

`packages/api-server/src/matches/matches.controller.ts`:
```ts
import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchesService } from './matches.service';

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @TsRestHandler(contract.matches)
  async handler() {
    return tsRestHandler(contract.matches, {
      list: async () => ({
        status: 200 as const,
        body: await this.matchesService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const match = await this.matchesService.findById(id);
        if (!match) return { status: 404 as const, body: { message: 'Match not found' } };
        return { status: 200 as const, body: match };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.matchesService.create(body),
      }),
    });
  }
}
```

`packages/api-server/src/match-events/match-events.controller.ts`:
```ts
import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchEventsService } from './match-events.service';

@Controller()
export class MatchEventsController {
  constructor(private readonly matchEventsService: MatchEventsService) {}

  @TsRestHandler(contract.matchEvents)
  async handler() {
    return tsRestHandler(contract.matchEvents, {
      listByMatch: async ({ params: { matchId } }) => ({
        status: 200 as const,
        body: await this.matchEventsService.findByMatchId(matchId),
      }),
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.matchEventsService.create(body),
      }),
    });
  }
}
```

- [ ] **Step 13: Create modules and wire them together**

`packages/api-server/src/teams/teams.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({ controllers: [TeamsController], providers: [TeamsService] })
export class TeamsModule {}
```

`packages/api-server/src/matches/matches.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({ controllers: [MatchesController], providers: [MatchesService] })
export class MatchesModule {}
```

`packages/api-server/src/match-events/match-events.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

@Module({ controllers: [MatchEventsController], providers: [MatchEventsService] })
export class MatchEventsModule {}
```

`packages/api-server/src/api-server.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { TeamsModule } from './teams/teams.module';
import { MatchesModule } from './matches/matches.module';
import { MatchEventsModule } from './match-events/match-events.module';

@Module({
  imports: [DbModule, TeamsModule, MatchesModule, MatchEventsModule],
})
export class ApiServerModule {}
```

`packages/api-server/src/index.ts`:
```ts
export { ApiServerModule } from './api-server.module';
export { TeamsService } from './teams/teams.service';
export { MatchesService } from './matches/matches.service';
export { MatchEventsService } from './match-events/match-events.service';
```

- [ ] **Step 14: Run tests again to confirm everything still passes**

```bash
cd packages/api-server && pnpm test
```
Expected: 6 tests pass.

- [ ] **Step 15: Commit**

```bash
git add packages/api-server
git commit -m "Add packages/api-server with NestJS services and ts-rest controllers for teams, matches, and match events"
```

---

## Task 5: packages/api-client — ts-rest typed client

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/tsconfig.build.json`
- Create: `packages/api-client/vitest.config.ts`
- Create: `packages/api-client/src/client.ts`
- Create: `packages/api-client/src/index.ts`
- Test: `packages/api-client/src/client.spec.ts`

**Interfaces:**
- Consumes: `contract` from `@blood-bowl-tracker/api-contract`
- Produces: `createApiClient(baseUrl: string): ApiClient`, `ApiClient` type — consumed by `tools/import-bbl`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/api-client",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@blood-bowl-tracker/api-contract": "workspace:*",
    "@ts-rest/core": "^3.52.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts**

Use the shared boilerplate. Non-NestJS vitest config.

- [ ] **Step 3: Write failing client test**

`packages/api-client/src/client.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createApiClient } from './client';

describe('createApiClient', () => {
  it('creates a client with teams, matches, and matchEvents', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.teams).toBeDefined();
    expect(client.matches).toBeDefined();
    expect(client.matchEvents).toBeDefined();
  });

  it('teams client has list, getById, and create methods', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.teams.list).toBe('function');
    expect(typeof client.teams.getById).toBe('function');
    expect(typeof client.teams.create).toBe('function');
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd packages/api-client && pnpm install && pnpm test
```
Expected: fails with module not found.

- [ ] **Step 5: Create client.ts and index.ts**

`packages/api-client/src/client.ts`:
```ts
import { initClient } from '@ts-rest/core';
import { contract } from '@blood-bowl-tracker/api-contract';

export function createApiClient(baseUrl: string) {
  return initClient(contract, {
    baseUrl,
    baseHeaders: {},
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

`packages/api-client/src/index.ts`:
```ts
export { createApiClient } from './client';
export type { ApiClient } from './client';
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd packages/api-client && pnpm test
```
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api-client
git commit -m "Add packages/api-client with ts-rest typed client factory"
```

---

## Task 6: Wire apps/discord-bot to use api-server

**Files:**
- Modify: `apps/discord-bot/package.json` — add `@blood-bowl-tracker/api-server`
- Modify: `apps/discord-bot/src/app.module.ts` — import `ApiServerModule`
- Modify: `apps/discord-bot/src/app.controller.spec.ts` — no change needed
- Modify: `README.md` — update Packages section

**Interfaces:**
- Consumes: `ApiServerModule` from `@blood-bowl-tracker/api-server`

- [ ] **Step 1: Add api-server dependency to discord-bot**

In `apps/discord-bot/package.json`, add to `"dependencies"`:
```json
"@blood-bowl-tracker/api-server": "workspace:*"
```

- [ ] **Step 2: Import ApiServerModule in AppModule**

`apps/discord-bot/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiServerModule } from '@blood-bowl-tracker/api-server';

@Module({
  imports: [ApiServerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 3: Install and run tests**

```bash
pnpm install && pnpm test
```
Expected: existing tests in `apps/discord-bot` still pass (1 unit test + 1 e2e test).

- [ ] **Step 4: Update README.md packages table**

In `README.md`, replace `_(none yet)_` under Packages with:

```markdown
- **`packages/api-client`** — ts-rest typed client for calling the api-server over HTTP
- **`packages/api-contract`** — ts-rest route contract shared between api-server and api-client
- **`packages/api-server`** — NestJS services and modules implementing the api-contract; consumed directly by apps
- **`packages/db`** — Drizzle ORM schema and migrations for PostgreSQL
- **`packages/import`** — shared import/ingestion result types used across import tools
```

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot README.md
git commit -m "Wire discord-bot to ApiServerModule and document packages in README"
```

---

## Task 7: tools/import-bbl — BBL import tool

**Files:**
- Create: `tools/import-bbl/package.json`
- Create: `tools/import-bbl/tsconfig.json`
- Create: `tools/import-bbl/tsconfig.build.json`
- Create: `tools/import-bbl/vitest.config.ts`
- Create: `tools/import-bbl/src/bbl-types.ts`
- Create: `tools/import-bbl/src/bbl-parser.ts`
- Create: `tools/import-bbl/src/bbl-importer.ts`
- Create: `tools/import-bbl/src/index.ts`
- Test: `tools/import-bbl/src/bbl-parser.spec.ts`
- Test: `tools/import-bbl/src/bbl-importer.spec.ts`
- Modify: `README.md` — update Tools section

**Context:** BBL (Blood Bowl Legend) is a Windows application coaches use to track their teams and matches. It exports data in a JSON format. The import tool reads a BBL export file and POSTs teams, matches, and match events to the api-server via the api-client.

**Interfaces:**
- Consumes: `createApiClient`/`ApiClient` from `@blood-bowl-tracker/api-client`; `makeImportResult`/`makeImportError` from `@blood-bowl-tracker/import`
- Produces: CLI entrypoint (`node dist/index.js <bbl-export.json> <api-base-url>`)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@blood-bowl-tracker/import-bbl",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@blood-bowl-tracker/api-client": "workspace:*",
    "@blood-bowl-tracker/import": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, tsconfig.build.json, vitest.config.ts**

Use the shared boilerplate. Non-NestJS vitest config.

- [ ] **Step 3: Define BBL types**

`tools/import-bbl/src/bbl-types.ts`:
```ts
export interface BblTeam {
  id: string;
  name: string;
  race: string;
  coachName: string;
}

export interface BblPlayer {
  id: string;
  name: string;
  teamId: string;
  position: string;
}

export interface BblMatchEvent {
  type: string;
  teamId: string;
  playerId?: string;
}

export interface BblMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  playedAt: string;
  events: BblMatchEvent[];
}

export interface BblExport {
  teams: BblTeam[];
  players: BblPlayer[];
  matches: BblMatch[];
}
```

- [ ] **Step 4: Write failing parser test**

`tools/import-bbl/src/bbl-parser.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseBblExport } from './bbl-parser';

const validJson = JSON.stringify({
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachName: 'Gruk' }],
  players: [{ id: 'p1', name: 'Slugger', teamId: 't1', position: 'Blitzer' }],
  matches: [
    {
      id: 'm1',
      homeTeamId: 't1',
      awayTeamId: 't2',
      playedAt: '2026-01-15T14:00:00Z',
      events: [{ type: 'touchdown', teamId: 't1', playerId: 'p1' }],
    },
  ],
});

describe('parseBblExport', () => {
  it('parses valid BBL export JSON', () => {
    const result = parseBblExport(validJson);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].name).toBe('Green Mashers');
    expect(result.players).toHaveLength(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].events).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBblExport('not json')).toThrow();
  });

  it('throws when required fields are missing', () => {
    expect(() => parseBblExport(JSON.stringify({ teams: [] }))).toThrow(
      'BBL export must contain teams, players, and matches arrays',
    );
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
cd tools/import-bbl && pnpm install && pnpm test
```
Expected: fails with module not found.

- [ ] **Step 6: Create bbl-parser.ts**

`tools/import-bbl/src/bbl-parser.ts`:
```ts
import type { BblExport } from './bbl-types';

export function parseBblExport(json: string): BblExport {
  const data: unknown = JSON.parse(json);

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).teams) ||
    !Array.isArray((data as Record<string, unknown>).players) ||
    !Array.isArray((data as Record<string, unknown>).matches)
  ) {
    throw new Error('BBL export must contain teams, players, and matches arrays');
  }

  return data as BblExport;
}
```

- [ ] **Step 7: Write failing importer test**

`tools/import-bbl/src/bbl-importer.spec.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { importBblData } from './bbl-importer';
import type { BblExport } from './bbl-types';

const bblData: BblExport = {
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachName: 'Gruk' }],
  players: [],
  matches: [],
};

describe('importBblData', () => {
  it('creates teams via the api client and returns a result', async () => {
    const createdTeam = {
      id: 1,
      name: 'Green Mashers',
      race: 'Orc',
      coach: 'Gruk',
      createdAt: new Date(),
    };
    const mockClient = {
      teams: {
        create: vi.fn().mockResolvedValue({ status: 201, body: createdTeam }),
      },
      matches: {
        create: vi.fn().mockResolvedValue({ status: 201, body: {} }),
      },
      matchEvents: {
        create: vi.fn().mockResolvedValue({ status: 201, body: {} }),
      },
    };

    const result = await importBblData(bblData, mockClient as never);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(mockClient.teams.create).toHaveBeenCalledWith({
      body: { name: 'Green Mashers', race: 'Orc', coach: 'Gruk' },
    });
  });

  it('records an error when team creation fails', async () => {
    const mockClient = {
      teams: {
        create: vi.fn().mockResolvedValue({ status: 500, body: {} }),
      },
      matches: { create: vi.fn() },
      matchEvents: { create: vi.fn() },
    };

    const result = await importBblData(bblData, mockClient as never);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Green Mashers');
  });
});
```

- [ ] **Step 8: Create bbl-importer.ts**

`tools/import-bbl/src/bbl-importer.ts`:
```ts
import { makeImportError, makeImportResult } from '@blood-bowl-tracker/import';
import type { ImportResult } from '@blood-bowl-tracker/import';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { BblExport } from './bbl-types';

export async function importBblData(
  data: BblExport,
  client: ApiClient,
): Promise<ImportResult> {
  let imported = 0;
  const errors = [];

  for (const team of data.teams) {
    const response = await client.teams.create({
      body: { name: team.name, race: team.race, coach: team.coachName },
    });
    if (response.status === 201) {
      imported++;
    } else {
      errors.push(makeImportError({ item: team, message: `Failed to import team "${team.name}"` }));
    }
  }

  return makeImportResult({ imported, errors });
}
```

- [ ] **Step 9: Create CLI entry point**

`tools/import-bbl/src/index.ts`:
```ts
import { readFileSync } from 'node:fs';
import { createApiClient } from '@blood-bowl-tracker/api-client';
import { parseBblExport } from './bbl-parser';
import { importBblData } from './bbl-importer';

const [, , filePath, baseUrl] = process.argv;

if (!filePath || !baseUrl) {
  console.error('Usage: import-bbl <bbl-export.json> <api-base-url>');
  process.exit(1);
}

const json = readFileSync(filePath, 'utf-8');
const data = parseBblExport(json);
const client = createApiClient(baseUrl);

importBblData(data, client).then((result) => {
  if (result.success) {
    console.log(`Imported ${result.imported} records successfully.`);
  } else {
    console.error(`Import completed with ${result.errors.length} errors:`);
    result.errors.forEach((e) => console.error(`  - ${e.message}`));
    process.exit(1);
  }
});
```

- [ ] **Step 10: Run all tests to confirm they pass**

```bash
cd tools/import-bbl && pnpm test
```
Expected: 5 tests pass.

- [ ] **Step 11: Update README.md tools table**

In `README.md`, replace `_(none yet)_` under Tools with:

```markdown
- **`tools/import-bbl`** — CLI tool for importing data from BBL (Blood Bowl Legend) exports into the tracker via the api-client
```

- [ ] **Step 12: Run full workspace test suite**

```bash
cd /path/to/repo/root && pnpm install && pnpm test
```
Expected: all tests pass across all workspaces.

- [ ] **Step 13: Commit**

```bash
git add tools/import-bbl README.md
git commit -m "Add tools/import-bbl: CLI tool for importing BBL export files"
```

---

## Out of scope: Docker

Dockerization (`Dockerfile` per app, root `compose.yaml` with PostgreSQL) is described in `docs/architecture.md` but deferred from this plan. A database is not required to run the unit test suite, and the Discord bot can be run locally with `pnpm run start:dev` against a manually provisioned PostgreSQL instance. Docker setup is a separate plan once the application layer is working end-to-end.
