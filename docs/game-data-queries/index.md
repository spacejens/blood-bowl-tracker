# game-data-queries

`packages/game-data-queries` holds the read-only statistics, toplists,
deepdive counts and lookups that only `apps/discord-bot` uses. Everything
that writes game data, and every read an importer or the RPC API also needs,
stays in `packages/game-data`.

## Why it exists

`packages/api-server` and `packages/import-tp-live` load `packages/game-data`
to persist imported data. If every `game-data` entity service also carried
the bot's reporting queries, the importers would ship code they never call,
and a change to a Discord insight would land in the same class as ingestion
logic. Keeping the bot-only reads here gives each side its own reason to
change.

## Rules

- A read lives here only when `apps/discord-bot` is its only caller. A read
  that an importer, the API or `game-data` itself also uses stays in
  `packages/game-data`, and the bot calls it there.
- The dependency points one way: this package imports `packages/game-data`
  (for `FactScope`, the match scope filter, the match event type groups and
  SPP totals); `packages/game-data` never imports this package.
- Only `apps/discord-bot` depends on this package.
- Its workspace dependencies are [game-data](../game-data/index.md) (one-way:
  game-data never imports it), `packages/db`, `packages/domain-enums` and
  `packages/api-contract`.

## Layout

Per entity, a `<Entity>QueriesService` holds that entity's bot-only reads,
for example `CoachesQueriesService` beside `game-data`'s `CoachesService`.
Statistics that grew into their own services keep their own names, such as
`TeamsStatisticsService`, `TeamAverageStatisticsService`,
`PlayerDeathService` and `OnThisDateService`. `src/shared/` holds the read
helpers only these queries use, such as `MatchEventCountsService` and
`LikePatternService`.

## Testing

Unit specs follow the repo-wide service testing rules in `CLAUDE.md`.
`pnpm run test` also runs a real-Postgres suite (`test/*.e2e-spec.ts`), so a
running Docker daemon is required; see [game-data's Testing section](../game-data/index.md#testing).
