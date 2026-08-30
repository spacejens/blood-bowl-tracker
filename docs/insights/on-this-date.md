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
  supports.

## Rules and decisions

- **Confirmed deaths only.** A killing blow the victim survived never appears
  here, even though the deepdive's own kills list reports such attempts.
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
