# `/debugtopusers`

`/debugtopusers` lists the Discord users who have triggered the most bot
interactions the `discord_bot_usage` schema has recorded, most active
first. It exists so effort spent on the bot's features and reliability can
be weighed against real usage, and so the most active users are known when
planning a change that might affect them.

The `debug` prefix on both the name and the description marks this as
maintainer tooling rather than a regular bot feature. The prefix itself is a
visibility convention; access control is separate, and optional. Where the
deployment sets `DEBUG_COMMAND_ROLE_ID` to a Discord server role id, only
members holding that role can run this command — anyone else gets a private
"you don't have permission to use this command" reply, as does anyone who
runs it in a direct message with the bot, since a direct message carries no
server role to check. Where that variable is unset, the command is open to
everyone who can see it.

## Arguments

Both arguments are optional, and they combine — a kind plus a day count
counts only that kind of interaction inside that window.

- `kind` — a choice of `Command`, `Button click` or `Select menu`. Counts
  only interactions of that kind. Omitted, every kind is combined into one
  total per user.
- `days` — a whole number of days, at least 1. Counts only interactions
  that happened within that many days of now. Omitted, the count is
  all-time.

There is no guild-scoping argument, for the same reason
[`/debuginteractions`](debug-interactions.md) has none: recorded
interactions are not always tied to a guild — a direct message belongs to
none — and a maintainer wants overall usage across everywhere the bot has
been used.

## The reply

One embed, titled `Top bot users`, with up to 20 ranked rows:

```text
1. **alice** — 42 interactions
2. **bob** — 17 interactions
```

Users tied on the same count are ordered by which user the bot first
recorded, so "the top 20" is a stable set rather than an arbitrary slice of
a tie.

Twenty rows is a fixed cap, not an argument — the same reasoning as
`/debuginteractions`' cap, with pagination deliberately left for a later
iteration if it is ever wanted. A hard truncation ending in `…` is applied
as a cheap safety net against Discord's 4096-character embed limit, though
twenty rows of a username (capped at 32 characters) never come close to it
in practice.

When nothing matches — most plausibly a `days` window with no activity in
it — the reply is the plain message `No bot usage recorded for those
filters.` with no embed.

The reply is ephemeral, visible only to whoever ran the command: which
specific users are most active is not public-channel content. See
[`/debuginteractions`](debug-interactions.md#ephemeral-by-design) for why
that applies to every `debug`-prefixed command. This command also appears
in `/debuginteractions`' own listing, so it can be
[retriggered](debug-interactions.md#retriggering-a-listed-interaction) —
and because this command is restricted to the `debug` role, a retrigger's
reply stays ephemeral (visible only to whoever clicked retrigger) and
re-checks the clicking member's role, exactly as described there.

## What is not counted

The count is a total of all recorded interactions per user, with no
breakdown by success or failure, and no distinction between a plain
command invocation and one that used filters. An interaction that matched
no registered handler was never recorded at all, so it cannot appear here.
