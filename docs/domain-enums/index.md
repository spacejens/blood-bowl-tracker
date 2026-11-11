# domain-enums

`packages/domain-enums` is the single declaration of every Blood Bowl domain
enum's member list — action types, weather types, characteristic formats,
match categories and the rest — as plain `as const` string arrays, together
with each list's value type (`(typeof X)[number]`). Every package imports these
instead of re-declaring them. It also holds the well-known external-system
names: Name, NAF, BBL's `tloeg.bbleague.se` and TP's `tourplay.net`.

## Why it has no dependencies

It deliberately depends on no other workspace package. That lets
`packages/db` build its Drizzle enums and `packages/api-contract` its Zod
schemas from the same source while staying mutually independent of each
other.

## Constants and types only

The package holds constants and types, no interpretation and no business
logic. That is why depending on it never weakens another package's
dependency rule: `packages/discord-client` uses it for its interaction kind
and outcome types without gaining a business-logic dependency, and
`tools/review-match` uses it for match categories without depending on any
importer's interpretation. For the same reason it is one of the packages
allowed on both sides of the
[client/server boundary](../architecture.md#clientserver-boundary).

## Development

```bash
pnpm --filter @blood-bowl-tracker/domain-enums run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/domain-enums run verify  # build + lint + typecheck + format + test
```
