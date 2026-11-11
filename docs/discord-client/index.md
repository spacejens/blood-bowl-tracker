# discord-client

`packages/discord-client` is a NestJS module wrapping discord.js: connecting
to Discord, registering slash commands, dispatching slash commands and
message components to their handlers, and posting messages. Its one consumer
is `apps/discord-bot` (see [discord-bot](../discord-bot/index.md)).

## The interaction-handled hook

The package reports every interaction it has handled to registered listeners,
as plain data, after the interaction has already been replied to. It does not
record anything itself: `apps/discord-bot` decides what to do with each event,
and today records it through [discord-bot-usage](../discord-bot-usage/index.md).

## Rules

- **No database or business-logic dependency.** Its workspace dependencies
  are `packages/domain-enums`, for the interaction kind and outcome types
  (constants and types only), and `packages/logging`. Keeping the usage
  wiring in the app is what keeps this transport package free of any database
  dependency.
- **Transport, kept separate.** It holds reusable Discord client lifecycle
  plumbing, deliberately separate from the business logic built on it (see
  [Key decisions](../architecture.md#key-decisions)).

## Development

```bash
pnpm --filter @blood-bowl-tracker/discord-client run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/discord-client run verify  # build + lint + typecheck + format + test
```
