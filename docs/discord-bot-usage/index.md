# discord-bot-usage

`packages/discord-bot-usage` records what the Discord bot was asked to do, not
what it knows: each triggered slash command, button click and select-menu
selection, with who triggered it, where (guild and channel), when, its
parameters and whether it succeeded. Recording is best effort: a failure to
store a row is logged and does not affect the reply, so an interaction can be
handled without a stored row. Rows land in the `discord_bot_usage`
schema, history-tracked like every other table (see
[database.md](../database.md#history-tracking)).

## Writing

`apps/discord-bot`'s `UsageRecordingService` is the only writer. It listens on
[discord-client](../discord-client/index.md)'s interaction-handled hook, which
reports each interaction after it has already been replied to,
fire-and-forget, so a recording failure can never affect a user-facing reply.
Concurrent first inserts of the same guild, channel or user are recovered
with `packages/db`'s `isUniqueViolationOn` (see
[db](../db/index.md#driver-facing-helpers)).

## Reading

`apps/discord-bot` reads the data back through `InteractionEventsQueryService`
for its maintainer commands
[`/debuginteractions`](../discord-bot/slash-commands/debug-interactions.md),
[`/debugtopusers`](../discord-bot/slash-commands/debug-top-users.md) and
[`/debugfilterusage`](../discord-bot/slash-commands/debug-filter-usage.md).
Broader reporting on the captured data is still separate work.

## Dependencies

Its workspace dependencies are `packages/db` and `packages/domain-enums`.

## Development

```bash
pnpm --filter @blood-bowl-tracker/discord-bot-usage run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/discord-bot-usage run verify  # build + lint + typecheck + format + test
```
