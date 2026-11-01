# `/deepdive` embed formats

The full embed format for each `/deepdive` target: what the description
contains, in what order, and which drill-down buttons the embed carries. See
[`/deepdive`](deepdive.md) for the command's arguments, its per-target
one-line summaries, and its not-found and timeout behavior.

This page describes what each embed says and why, not the literal text it
renders. For exact wording, punctuation, markers and row formats, see the
per-target resolver services listed at the end of
[`/deepdive`](deepdive.md) — one `*-deepdive.service.ts` per target under
`apps/discord-bot/src/deepdive/facts/`.

## `era`

The era name as
the title, then its league, its start–end dates (an ongoing era is marked
as still running), its rules sets (comma-joined, or "None recorded"), and a
chronological list of the era's competitions, one line per competition
naming it and its type. Competitions are ordered by their earliest
recorded match; competitions with no played matches yet sort last. An era
with no competitions shows a short "nothing played yet" message instead of a
list. Every listed competition is rendered as a drill-down button to that
competition's deepdive.

## `coach`

The coach
name as the title, then their career span (the first and last dates across
every match they have played, or a single date when both fall on the same
day; dates are UTC calendar days), a blank line, then a ranked list of their
top five teams by matches played. Ties at the fifth-place cutoff
are all shown, up to ten teams — the same convention `/insights` toplists
use; at most ten teams are fetched for a deepdive, so the toplists'
truncation note never actually appears here. A coach who
exists but has recorded no matches shows a short "hasn't played yet" message
instead of a career span and team list. Every listed team is rendered as a
drill-down button to that team's deepdive, ahead of the era header buttons.

## `team`

The team name as the title, then its race, its coach, its era list, its career span
(the first and last dates across every match it has played, or a single
date when both fall on the same day; dates are UTC calendar days, as for
the coach career span).

A team that exists but has recorded no matches shows a short "hasn't played yet" message
in place of the career span, trophies and player list, but still shows its
race and coach.

### Trophies

Then — only when the team has recorded trophies, with the whole section omitted
otherwise rather than a placeholder line — a blank line and one
heading per era.

- Eras are listed newest first, each heading naming the era and its date range, with an ongoing era marked as still running.
- Each era heading is followed by that era's awards newest-first, one line per award naming the competition and trophy, plus the winning player and their position for a trophy won by one of its players.
- The two kinds are interleaved within an era rather than split, since both are that era's trophies.
- The team, race, coach and era are left off the rows because the header, the embed's own subject and the section heading already name them.
- A blank line separates each era section from the next.
- The list is capped, and when it is truncated the embed says exactly how many awards are not shown, computed from the team's true award count.

### Top players

Then a blank line, then a ranked list of its top five players by career
[SPP](../../glossary.md#star-player-points-spp) total.

- The total is each player's own stored total, manual adjustments included and exactly as the player deepdive reports it.
- Players are ranked across every [era](../../glossary.md#era) the team has played (a player fielded in more than one era has one record per era, each ranked separately).
- Star players are not listed: each hire of a star is its own player record, so one star would otherwise take several of the five slots.
- Ties at the fifth-place cutoff are all shown, up to ten players (the same convention `/insights` toplists use, though at most ten players are fetched, so the toplists' truncation note never actually appears here).

### Buttons

- Each trophy is rendered as a drill-down button to the trophy, plus a button to the player for a player award.
- Those buttons come before the top-players buttons, which in turn come before the race/coach/era header buttons, so the most specific content keeps button priority.

## `player`

The player embed has [its own page](deepdive-embeds-player.md).

## `star-player`

The
star's name as the title, then one stat line per rules set the star has
recorded characteristics for, oldest rules set first — the same shape and
formatting rules as the position deepdive's stat lines (each value in that
rules set's own recorded format, the Passing characteristic omitted entirely
for a rules set with no Passing characteristic, a stored zero rendering as a
dash, then that rules set's starting skills comma-separated after the
characteristics, with the skills left off entirely when none are recorded).
The star's own
exclusive skill under a rules set is marked with a star, which is what
tells it apart from the skills any position can have.
A star with no characteristics
recorded for any rules set shows a short message instead of a stat-line
list.

### Keywords

Right after the stat lines, one line per rules set that has BB2025-style
keywords recorded for this star, naming the rules set and its keywords
comma-separated: `BB2025 keywords: Goblin, Undead`. A rules set with none
recorded contributes no line, and the whole group is left out entirely for a
star with no keywords recorded under any rules set — there is no placeholder
line for "none". A star is stored as a `positions` row, so this reads
identically to the position deepdive's own keywords section below.

Then a blank line and one line per team that has ever hired them,
most-hires-first (ties broken by team name — the query itself supplies this
order, so the description and the buttons can never disagree), with its race
and coach and how many times it hired the star. Each hire is a
separate signing: a team that brings the same star back counts once per hire,
and hires are never split by era. Each listed team is rendered as a
drill-down button to that team. A star that resolves but has never been hired
by anyone is treated as not found — the same not-found reply as a star
matching no name at all — because there is no hire history to show. The
description is truncated if it would otherwise exceed
Discord's embed description limit, mirroring the regular player deepdive's
own safety net.

## `race`

The race
name as the title, then the eras this race has appeared in, or a note when
it is in none, then — only when
the race has (non-star) positions recorded for at least one era, with the
whole section omitted otherwise — a blank line and one
heading per era, oldest era first, each heading naming the era and its date
range, with an ongoing era marked as still running, each followed by that
era's positions as one line per position, name-ascending — the same
heading-then-rows shape the trophy and competition-group deepdives use for
their own per-era lists. A position recurring across several eras appears
once per era it belongs to. Star positions are never listed here: they are
shared across every race that can hire them rather than belonging to this
one race, and are already reachable from their own star-player deepdive.
Then a blank line, then a ranked list of its top five teams by matches
played. Ties at the
fifth-place cutoff are all shown, up to ten teams — the same convention
`/insights` toplists use, though at most ten teams are fetched, so the
toplists' truncation note never actually appears here. The top-teams list is not
era-scoped. A race with no recorded team appearances shows a short "no teams
yet" message in place of the list. Every listed position is rendered as a
drill-down button to that position's deepdive, ahead of the top-teams
buttons.

## `position`

### Characteristics stat lines

The position name as the title,
then its race or races (a position can in principle belong to more than one
race), or a note when none is recorded, then a blank line, and one stat
line per rules set the position has recorded characteristics for, oldest
rules set first. Each value is written using that
rules set's own recorded format — a bare number, or a number with a
trailing plus for a target a die roll has to meet — and a rules set with no
Passing characteristic at all omits that field entirely rather than
showing a placeholder for it; a stored value of zero (not yet curated)
renders as a dash instead of the number. Each stat line then carries that
rules set's starting skills, comma-separated, after the characteristics:
a skill whose rules require a die roll or a named target shows that value
in parentheses after its name, and a star player's own exclusive skill is
marked with a star. A rules set with no starting skills recorded shows no
skills at all — just its characteristics — rather than a placeholder: the
archive cannot tell a position that genuinely has none apart from a rules
set nobody has curated yet, so it claims neither. A
position with no characteristics
recorded for any rules set shows a short message instead of a stat-line
list.

### Keywords

Right after the stat lines, one line per rules set that has BB2025-style
keywords recorded for this position, naming the rules set and its keywords
comma-separated: `BB2025 keywords: Goblin, Undead`. A rules set with none
recorded contributes no line, and the whole group is left out entirely for a
position with no keywords recorded under any rules set — there is no
placeholder line for "none", since the data cannot tell apart "this position
has none" from "this rules set has no keyword concept at all". The
keyword's kind (species, positional, special) is not marked in the line.

### Top players by SPP

Then a blank line, a count of how many players have held the position, then
a ranked list of its top five players by career SPP total, each shown with
their team, era and coach — the player's position is left off, since every listed player
already holds this one, and the race is left off too, since the list is not
scoped to a single race; the [era](../../glossary.md#era) is shown because a
position's roster slot spans many eras, so it is what tells two of its top
players apart. Ties at the fifth-place cutoff are all shown, up to ten
players — the same convention
`/insights` toplists use, though at most ten players are fetched, so the
toplists' truncation note never actually appears here. A position with no
players shows a short message instead of a list.

### Buttons

Every listed race is
rendered as a drill-down button to that race's deepdive, followed by one
button per listed top player.

## `competition`

The competition name as the title, then its type — a season or a cup — its
era, its competition group, and its dates, with an ongoing competition
marked as still running, a blank line, and
every participating team, one line each with its race and coach. The era line
names the era and its date range, with an ongoing era marked as still
running — distinct from the competition's own `Dates:` line above. A
competition with no participating teams shows a short "nobody has signed up
yet" message instead of a list.

Then — only when the competition handed out awards, with the whole section
omitted otherwise rather than a placeholder line — a blank line and a
`Trophies:` heading, followed by one `Trophy: recipient` line per award, team
awards before player awards. A team recipient is shown with its race and
coach; a player recipient with their position, team, race and coach.

Every participating team and the era are each rendered as a drill-down button
(teams take priority over the era entry when the combined list is too long for
buttons and switches to select menus). Each award recipient and each distinct trophy is also a drill-down
button, after the team buttons and before the era button, and the embed also
offers a drill-up button to the competition's recurring group, last of all.

## `competition-group`

The group name as the title, then its league, then every trophy the group
awards, one line
per trophy (or a themed message saying so when it
awards none), a blank line, and one heading per era,
oldest era first, each heading naming the era and its date range, with an
ongoing era marked as still running, each followed by that era's competition instances, oldest
first, one line per competition with its date range (or a themed message
saying so when the group has no instances at
all, in which case no era heading is shown) — a blank line separates each
era section from the next, so a multi-era group doesn't read as one packed
block. Competitions are rendered as
drill-down buttons before trophies (competitions take priority over trophies
when the combined list is too long for buttons and switches to select
menus).

## `league`

The
league name as the title, then every trophy the
league itself awards directly — not through one of its competition groups —
one line per trophy (or a themed message saying so when it
awards none directly), then every competition group the league runs, one line per group (or a themed message
saying so when it has none). Competition groups
are rendered as drill-down buttons before trophies (groups take priority over
trophies when the combined list is too long for buttons and switches to
select menus).

## `trophy`

The
trophy name as the title, then the competition group it is awarded for and,
only when the trophy has one, its description, a blank line, then
one heading per era, newest era first, each heading naming the era and its
date range, with an ongoing era marked as still running, each followed by
that era's awards, newest-first, one line per award naming the competition
and the recipient — a team with its race and coach, or a player with their
position, team, race and coach — the same race/coach and
position/team/race/coach context the
`team.toplist` and `player.toplist` insights append to their own rows (the
era is left off the row, since the section heading already names it). A
blank line separates each era section from the next, so a long-running
trophy doesn't read as one packed block.
The list is capped, and when it is truncated the embed says exactly how many
awards are not shown, computed from the trophy's true award
count. A trophy with no recorded awards shows a short "nobody has got their
hands on this one yet" message instead of a list. Each shown recipient is
rendered as a drill-down button to whoever actually received the trophy —
the team for a team trophy, the player for a player trophy — with no button
for the competition it was awarded at; the embed also offers a drill-up
button, last of all, to the trophy's competition group when it has one, or
to its league directly when it does not — a trophy is scoped to exactly one
or the other, never both.
