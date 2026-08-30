# On this date

The on-this-date insight answers what happened on one calendar month and day
across every year of recorded play.

## Date semantics

The date is a plain month/day pair with no year, resolved against real
calendar dates only. There is no nearest-date behaviour and no folding onto a
neighbouring date. February 29 is its own date, matching only actual February
29 [matches](../glossary.md#match), which can exist only in a leap year, so a
non-leap year contributes nothing on that date — it is deliberately never
merged with February 28 or March 1.

The filter compares the calendar fields of a match's played-at timestamp
directly, which is what gives that leap-year behaviour for free: there is no
leap-year special case anywhere in the code. See
`packages/game-data/src/insights/on-this-date.service.ts`.

Both "today" (the `/onthisdate` command's default, and the date the
scheduled random-insights job always uses) and the match date filter are
evaluated in UTC, so the two sides can never disagree about what day it is
regardless of the bot process's or the database session's local timezone
configuration.

## What it reports

Everything below is narrowed by the same scope (league, era, competition, or
match category):

- **Matches played** — the count of distinct matches played on the date.
- **Event counts** — the same counter block a player's
  [deepdive](../glossary.md#deepdive) shows, scoped to the date instead of a
  player; see [Match event counts](match-event-counts.md). MVP awards are
  deliberately excluded: an MVP is a per-player honour, and totalling it over
  a date measures how many matches were played rather than anything about the
  date.
- **Players who died on the date** — ordered richest in
  [Star Player Points (SPP)](../glossary.md#star-player-points-spp) first,
  each shown with whoever killed them at whatever precision the data
  supports, and with the specific match's own year and era — the recurring
  month/day this insight is about can span many different years and eras, so
  each entry names exactly which one that particular death happened in. The
  era is left out when the request is already scoped to a single era, since
  repeating it on every row would be redundant.

## Rules and decisions

- **Confirmed deaths only, for the Famous deaths list.** A killing blow the
  victim survived never appears there, even though the deepdive's own kills
  list reports such attempts.
- **The event-count breakdown's own "killed" sub-count covers a broader
  population than the Famous deaths list.** Like the player deepdive's own
  counters, the casualties and fouls groups' `killed` counts include
  prevented/avoided deaths and unpaired death-severity actions alongside
  confirmed deaths, while the Famous deaths list names only players whose
  death was actually confirmed. The embed can therefore legitimately show,
  for example, "Casualties inflicted: 8 (3 killed)" above a Famous deaths
  list naming only 1 player — that is not a bug, it is two different counts
  answering two different questions.
- **One death per player.** A player dies at most once, which is why
  resolving who killed a player is unambiguous; this insight reuses the
  existing per-player killer resolution unchanged.
- **Ties at the cutoff follow the same convention as every other top list**:
  the remainder is reported exactly where it can still be counted, and
  approximately where the fetch window was saturated.
- **Scope applies to all three numbers together, never to only some of
  them.** A partially-scoped reply would read as one date's story while
  actually mixing two populations.
- **A missing SPP total ranks as zero**, not ahead of everyone else, when
  ordering the players who died on the date.

## Date toplist drill-down buttons

The `date.toplist.matches.ascending` and `date.toplist.matches.descending`
[`/insights`](../discord-bot/slash-commands/insights.md) facts rank calendar
dates by match count, and give each listed date a button that opens this
insight for that date.

Those buttons are the only drill-down buttons that carry a scope. Every other
one encodes just an entity id, but a date is not an entity: the same February
29 means something different under one league than under another, so a button
that dropped the toplist's scope would answer a different question from the one
the reader was looking at. The scope travels in the button's own customId,
after the date: `02-29`, `02-29:league:5`, `02-29:era:12`,
`02-29:competition:7`, or `02-29:matchCategory:normal`. At most one scope
segment is ever present, because the four scope options are mutually exclusive
to begin with.

The segment names are spelled out rather than compressed into codes, so an
engineer reading a raw Discord interaction payload or a log line can tell what
a customId means without cross-referencing a codec. Both directions of that
encoding live in one service
(`apps/discord-bot/src/shared/date-button-id.service.ts`), which is what keeps
them from drifting apart.

Resolving the scope happens when the button is clicked, not when the toplist is
posted, so a league, era or competition deleted in between replies with the
same not-found message the equivalent `/insights` option gives.
