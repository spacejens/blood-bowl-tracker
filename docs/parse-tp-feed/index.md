# parse-tp-feed

`packages/parse-tp-feed` reads the advancement reports TP's Discord
integration posts into the TP feed channel (the `New skill/characteristic`
notifications). The bot's [TP notification feed](../discord-bot/tp-feed.md)
and [production-ops-cli](../production-ops-cli/index.md)'s
`read-tp-feed-history` both use it, so a live notification and one read back
from the channel's history are understood the same way.

## What it owns

`TpFeedAdvancementParserService` turns one advancement embed into:

- the player line: number, name and position, from the first field's name;
- the team name (the embed footer) and the roster link (the embed author's
  url);
- from the first field's value: `selection` (`random` or `chosen`),
  `category` (`primary`, `secondary` or `characteristics`), `gain` (a skill,
  or a characteristic with its delta) and `sppCost` (the number after the
  star);
- the value as TP wrote it (`rawValue`), and with backticks and extra
  whitespace removed (`valueText`).

A real player line, then three real values (a random characteristic, a
chosen skill, a random skill):

```text
`#6` Grimgor Ironhide *(Black Orc)*
Random Characteristics ` +1 AG ` ` ★16 `
Primary ` Block ` ` ★16 `
Random Primary ` Wrestle ` ` ★3 `
```

A missing player line, team name, roster link or value fails the parse, and
the failure names the field. A value whose wording is not understood still
parses, with `gain` set to null. When none of the value's shape matched,
`selection`, `category` and `sppCost` are null too. The bot keeps echoing
such a notification, while `read-tp-feed-history` lists it as unparsed. The
player-line parsing is also exposed on its own, and the bot reuses it for
hire, fire and temporary retirement notifications.

## Structural input, no discord.js

The parser takes `TpFeedEmbedLike`, a structural type with only `author`,
`fields` and `footer`. discord.js's `Embed` and the raw REST JSON a tool
fetches both satisfy it, so this package depends on nothing but
`@nestjs/common`. It is pure, with no I/O and no logging: each caller
reports a failure in its own way.

## Dependency rules

It depends on no other workspace package. It is used by the server-side
`apps/discord-bot` and the client-side `tools/production-ops-cli`, so it is
one of the deliberate two-sided packages at the
[client/server boundary](../architecture.md#clientserver-boundary).

## Development

```bash
pnpm --filter @blood-bowl-tracker/parse-tp-feed run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/parse-tp-feed run verify  # build + lint + typecheck + format + test
```
