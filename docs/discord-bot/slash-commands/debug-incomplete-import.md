# `/debugincompleteimport`

`/debugincompleteimport` lists the teams that have at least one player with
incomplete import data, grouped by coach, so the size of the problem is
visible at a glance and the list can double as a task list for correcting
the data.

The `debug` prefix on both the name and the description marks this as
maintainer tooling rather than a regular bot feature. The prefix itself is a
visibility convention; access control is separate, and optional. Where the
deployment sets `DEBUG_COMMAND_DISCORD_ROLE_ID` to a Discord server role id, only
members holding that role can run this command or use its page buttons —
anyone else gets a private "you don't have permission to use this command"
reply, as does anyone who uses it in a direct message with the bot, since a
direct message carries no server role to check. Where that variable is
unset, the command is open to everyone who can see it.

The command takes no arguments and is global: incomplete data is a property
of the recorded data, not of any one guild.

## What counts as incomplete

A player counts as having incomplete import data when any of these holds:

- Their movement, strength, agility or armour is `0`. No rules set allows
  a zero in those characteristics, so a zero is a placeholder left by an
  import that never received the real value.
- Their total star player points, their SPP adjustment or their status is
  missing — no data source populated it.

A team imported only through a roster `/importtp` keeps its new players'
SPP adjustment missing until a match or competition import covers it: only
those settle SPP, once the players' match events are in. A live match or
competition import settles every player it imported, including players seen
only in backfilled match snapshots and teams not in the inscriptions.

Passing is deliberately not checked: a missing or zero passing value is
legitimate for many positions.

Star players are never counted, whatever their data looks like: a player
whose position is a star player position is left out, so a team is only
listed for its regular players.

The criteria are kept as one named list in
`packages/game-data/src/players/incomplete-import-players.service.ts`, so a
newly discovered kind of gap is a one-line addition.

## The reply

One embed, titled `Incomplete import data`. Its first line gives the
totals — incomplete players, affected teams and affected coaches — and the
teams follow, grouped under their coach:

```text
Incomplete players: 5 · Teams: 2 · Coaches: 2

Skarsnik — 3 incomplete
• Orc Raiders (Orc, Season 3) — 3 incomplete

Roze Madder — 2 incomplete
• Dwarf Giants (Dwarf, Season 3) — 2 incomplete
```

A team that played in several eras has one line per era, since each era's
roster is imported separately; the `Teams` total counts it once.

Coaches with the most incomplete players come first, and within a coach the
team lines with the most incomplete players come first, so the biggest
correction jobs are at the top.
Coaches, teams and eras with equal counts are ordered by name ascending
(coach name, then team name, then era name).

When nothing is incomplete, the reply is the plain message
`No players with incomplete import data.` with no embed.

The reply is ephemeral, like every `debug`-prefixed command's — see
[`/debuginteractions`](debug-interactions.md#ephemeral-by-design).

## Pages

The list can be longer than one Discord embed allows, so it is split into
pages, with `Previous` and `Next` buttons under the embed (disabled on the
first and last page) and `Page x/y` in the footer. Pages break between
coaches; only a coach whose own list is too long for one page is split, and
their heading is repeated at the top of the continuation page.

The buttons carry nothing but the page number: each click re-reads the data
and rebuilds the report, so a page always reflects the current data rather
than a snapshot from when the command was run. If the data shrank in the
meantime, a click on a page that no longer exists shows the last page
instead. Each click posts the requested page as a new private reply.

The bot role-checks commands but not buttons, so the page buttons re-check
the `debug` role themselves: a button held from before the role was
configured, or after it was revoked, cannot bypass it.
