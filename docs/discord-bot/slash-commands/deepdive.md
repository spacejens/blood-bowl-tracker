# `/deepdive`

`/deepdive` is a lookup and drill-down command for a single recorded subject.
Today it supports one target — an era — and is designed to grow further
optional, mutually exclusive targets (players, teams, and so on) in future
work.

## Argument

The command takes one optional string argument, `era`, autocompleted by era
name (each suggestion is labelled `<era> (<league>)`):

- **No argument** — the bot replies with a short usage prompt, because a
  deepdive needs a target. This is framed as "specify a target", not a hard
  validation error, so the command can add targets later without changing this
  contract.
- **`era:<era>`** — the bot replies with an embed for that era: the era name as
  the title, then its league, its start–end dates (an ongoing era shows
  `present`), its rules sets (comma-joined, or "None recorded"), and a
  chronological list of the era's competitions, one line per competition
  formatted `<name> (<type>)`. Competitions are ordered by their earliest
  recorded match; competitions with no played matches yet sort last. An era
  with no competitions shows a short "nothing played yet" message instead of a
  list.
- **An era that matches nothing** — the bot replies with a not-found message.

If the database does not respond in time, the command falls back to a themed
timeout message instead of its normal reply, so it always answers within
Discord's response window.

## Relationship to `/insights`

`/insights`' `eras.list` view lists every era and attaches one button per era.
Pressing a button opens the same era deepdive shown by `/deepdive era:<era>` —
the button and the command share a single resolver, so their output is always
identical. See [`/insights`](insights.md).

See the implementation in `apps/discord-bot/src/slash-commands/deepdive-command.service.ts`
and the resolver in `apps/discord-bot/src/deepdive/facts/era-deepdive.ts`.
