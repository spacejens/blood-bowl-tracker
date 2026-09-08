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
every match they have played), a blank line, then a ranked list of their top
five teams by matches played. Ties at the fifth-place cutoff
are all shown, up to ten teams — the same convention `/insights` toplists
use; at most ten teams are fetched for a deepdive, so the toplists'
truncation note never actually appears here. A coach who
exists but has recorded no matches shows a short "hasn't played yet" message
instead of a career span and team list. Every listed team is rendered as a
drill-down button to that team's deepdive, ahead of the era header buttons.

## `team`

The team
name as the title, then its race, its coach, its era list, its career span
(the first and last dates across every match it has played), then — only
when the team has recorded trophies, with the whole section omitted
otherwise rather than a placeholder line — a blank line and one
heading per era, newest era first, each followed by that
era's awards newest-first, one line per award naming the competition and
trophy, plus the winning player and their position for a trophy won by one
of its players — the two kinds are interleaved within an era rather than
split, since both are that era's trophies, and the team, race, coach and
era are left off the rows because the header, the embed's own subject and
the section heading already name them. A blank line separates each era
section from the next. The list is capped, and when it is truncated the
embed says exactly how many awards are not shown, computed from the
team's true award count. Then a blank line, then a ranked list of its top
five players by career
[SPP](../../glossary.md#star-player-points-spp) total — each player's own
stored total, manual adjustments included and exactly as the player deepdive
reports it, ranked across every [era](../../glossary.md#era) the team has
played (a player fielded in more than one era has one record per era, each
ranked separately). Star players are not listed:
each hire of a star is its own player record, so one star would otherwise
take several of the five slots. Ties at the fifth-place cutoff are all
shown, up to ten players (the same convention `/insights` toplists use,
though at most ten players are fetched, so the toplists' truncation note
never actually appears here). Each trophy is rendered as a drill-down button to the trophy,
plus a button to the player for a player award; those come before the
top-players buttons, which in turn come before the race/coach/era header
buttons, so the most specific content keeps button priority. A team that
exists but has recorded no matches shows a short "hasn't played yet" message
in place of the career span, trophies and player list, but still shows its
race and coach.

## `player`

### Header lines

The
player name as the title, then its team, era, race and position lines
(every player always has all four — a player
belongs to exactly one team-era, and therefore to exactly one era).

### Killer status

Then — only for a player who died — a status line naming whoever was
responsible, at the best precision the recorded match event supports: the
specific killer player, with their position, team, race and coach, when the
event indexes one; the killing team alone, with its race and coach, when
only the side is known (the source named a journeyman or mercenary rather
than linking a player row), or when the event recorded no acting side but
the match had exactly one other team; an "or"-joined list of the possible
killing teams when a multi-team match leaves several candidates; and a
"mysterious circumstances" fallback when nothing can be attributed at all.
When the fatal event was recorded as a foul rather than a regular blocking
action, the line notes that, in all four of those forms.
Only a fatal consequence produces this line; a player who has not died
shows no status line at all, rather than a placeholder.

### Characteristics

Then a blank
line, and a characteristics line carrying the player's own current values
written using the
format of whichever [rules set](../../glossary.md#rules-set) applies to
their era — a bare number, or a number with a trailing plus for a target a
die roll has to meet — with the same Passing-omission and dash-for-zero
rules as the position deepdive's stat line below. Each value that has moved away
from the [position](../../glossary.md#position)'s own recorded baseline
under that rules set is marked as increased or decreased;
the comparison is on the raw stored numbers, so a not-yet-curated zero
is still marked as decreased. Nothing is marked when the position has
no recorded baseline under the resolved rules set — the values are shown
unmarked rather than guessing — and the whole line is omitted when no rules
set can be resolved for the player's era at all.

### Trophies

Then —
only when the player has recorded trophies, with the whole section omitted
otherwise rather than a placeholder line — a blank line, a trophies
heading, and that player's own awards newest-competition-first, one line per
award naming the competition and trophy. Neither the team nor the era is
repeated on those rows, and there is no per-era grouping as on the team
deepdive: a player belongs to exactly one team-era for their whole career,
so the header already names both. The list is capped, and when it is
truncated the embed says exactly how many awards are not shown, computed
from the player's true award count.

### Per-match-event counters

Then a blank line, and
one labelled line per non-zero event category the player caused. The
categories are the acting-role tallies — things the player did, never
things done to them: MVP awards, touchdowns scored, completions,
interceptions and deflections as plain lines, followed by
the casualties-inflicted and fouls-committed lines, each carrying a
breakdown of how many were serious injuries and how many were kills. A zero
sub-count is dropped from the breakdown, the
breakdown disappears when both sub-counts are zero, and the whole line
disappears when the total is zero. Fouls carry their own breakdown rather
than folding into the casualty one because Blood Bowl awards no casualty
credit for a foul, so a foul-caused injury is deliberately not counted as a
casualty inflicted. The kill sub-counts (on both lines) and the fouls'
serious-injury sub-count mean "attempted", not just "confirmed": they
fold in an attempt that was saved by an apothecary or by regeneration, and
— for casualties' kill sub-count only — a death attempt with no recorded
outcome at all. The fouls' serious-injury sub-count includes every
foul-caused serious injury, whichever form the injury takes. These per-match-event
tallies are a separate
concept from the competition-level trophies above: the "MVP awards" count is
match MVPs, not an end-of-competition MVP trophy. Zero categories are
omitted; a player with nothing in any category shows a short
nothing-memorable-yet-style message instead of an empty list.

### Star player points

Then — only when the player has a computed star player point total, with no
line at all otherwise — a blank line, an optional adjustment line, shown
only when a nonzero manual adjustment has been applied (the total already
includes it; the line is just calling that out), and the player's total
star player points.

### Kills list

Then — only when the player has killed someone, with the whole section
omitted otherwise rather than a placeholder line — a blank line, a kills
heading, and one line per kill, newest match first. A kill whose victim is a
specific indexed player names that player with their position, team, race
and coach; one where only the victim's side is known names the team, with
its race and coach; one where a multi-team match leaves the side ambiguous
names the candidate teams, "or"-joined; and one with nothing attributable at
all reads as an anonymous opponent in mysterious circumstances. A death this
player caused but that was prevented carries
a note saying the death was saved by an apothecary or by regeneration — the
team is known and the victim player is
never named, in the normal case; a defensive fallback (not expected from any
known importer behaviour) can instead render a prevented kill through the
generic resolution logic like any other unresolvable kill, when the
recorded team can't be matched or the save reason is missing. Any of them
notes when the fatal (or prevented) event was a foul, the same note the status line
uses — including the prevented row. The list also includes a death attempt
with no recorded outcome at all; its victim's team is resolved the same way
an event with an ambiguous or unattributed killer team already is resolved
elsewhere in this document. One line is shown per kill event, so a victim
killed more than once by this player appears once per kill. The list is
capped, and when it is
truncated the embed says exactly how many kills are not shown,
computed from the player's true kill count. The same note can also appear
even when the kill count itself was not capped: long team, player, race or
coach names can exhaust the embed's description-length budget before all of
the fetched rows fit, in which case the rows that do not fit are dropped the
same way and the note reports them too. Either way the note's count is always exact
— it is computed from the player's true kill total, not from how many rows
happened to be fetched or rendered — regardless of which of the two
overflow reasons caused rows to be dropped. The player's true kill count
always equals the kill sub-counts of the casualty and foul lines added
together, exactly — not merely typically.

### Button ordering

Each trophy is
rendered as a drill-down button to the trophy; those come first, then — for
a player who died — a button to the killer (the killer player for a named
killer, the killer team for a team-only killer, or one button per candidate
team when the killer is ambiguous; no button at all in the mysterious-
circumstances case), then one button per listed victim (the victim player
when identified, one button per candidate team when the side is ambiguous,
none in the mysterious-circumstances case), then the team, era, race and
position buttons — which follow the order of the header lines — so the most
specific content keeps button priority. The position button is labelled
with the position and its race rather than the bare position name, because
position names repeat across races — nearly every race has a "Lineman" — so
the name alone would not say which roster the button opens. The position
line stays as text as well as gaining a button: unlike team/era/race, the
button can vanish under the 25-entry cap or when the list of drill-down
targets grows too long for buttons, so the text line is the reader's
guaranteed way to see the position even then. Neither the killer's own
position, race or coach has a button, nor a victim's.

## `star-player`

The
star's name as the title, then one stat line per rules set the star has
recorded characteristics for, oldest rules set first — the same shape and
formatting rules as the position deepdive's stat lines (each value in that
rules set's own recorded format, the Passing characteristic omitted entirely
for a rules set with no Passing characteristic, a stored zero rendering as a
dash). A star with no characteristics
recorded for any rules set shows a short message instead of a stat-line
list. Then a blank line and one line per team that has ever hired them,
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
heading per era, oldest era first, each followed by that
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
renders as a dash instead of the number. A position with no characteristics
recorded for any rules set shows a short message instead of a stat-line
list.

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
era, its competition group, and its duration, with an ongoing competition
marked as still running, a blank line, and
every participating team, one line each with its race and coach. A
competition with no participating teams shows a short "nobody has signed up
yet" message instead of a list. Every participating team and the era are
each rendered as a drill-down button (teams take priority over the era entry
when the combined list is too long for buttons and switches to select
menus), and the embed also offers a drill-up button to the competition's
recurring group, last of all.

## `competition-group`

The group name as the title, then its league, then every trophy the group
awards, one line
per trophy (or a themed message saying so when it
awards none), a blank line, and one heading per era,
oldest era first, each followed by that era's competition instances, oldest
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
one heading per era, newest era first, each followed by
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
