# `/deepdive player` embed format

The full embed format for a `/deepdive` player target: what the description
contains, in what order, and which drill-down buttons the embed carries. See
[`/deepdive` embed formats](deepdive-embeds.md) for every other target, and
[`/deepdive`](deepdive.md) for the command's arguments and its not-found and
timeout behavior. Like that page, this one describes what the embed says and
why rather than its literal text. The skill markers are the exception, since
the embed carries no legend for them.

## Header lines

The
player name as the title, then its team, era, race and position lines
(every player always has all four — a player
belongs to exactly one team-era, and therefore to exactly one era). The era
line names the era and its date range, with an ongoing era marked as still
running.

## Status

Then a status line, for every player.

For a player whose death is recorded in match events, it names whoever was
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

Every other player's line shows the status their source reports, in plain
words:

- `Status: Active`, or `Status: Active until the end of the era` once the
  player's era has ended.
- `Status: Temporarily retired`, or
  `Status: Temporarily retired until the end of the era` once the player's
  era has ended.
- `Status: Retired`, whatever the era.
- `Status: Killed`, for a player stored as dead with no fatal match event
  to name a killer from.
- `Status: Unknown`, when no source has reported a status.

An era has ended once its end date is before today (read in UTC). An era
ending today still counts as running, and an ongoing era (no end date) never
counts as ended. This is worked out each time the
deepdive is shown, never stored.

A death recorded in match events always wins over the stored status. A
player killed in match events whose stored status is set and is not dead
points at an import bug. A killed player with no stored status is not a
conflict and is not reported. The deepdive still shows the killed line in
every case, and the bot logs a conflict as an error. It also posts a bug
report naming the player's id, name and stored status to the
[TP feed debug channel](../tp-feed.md#configuration), when one is
configured. Each conflict (player and stored status) is reported once per
bot run. A failed post never affects the deepdive reply.

## Characteristics

Then a blank
line, and a characteristics line carrying the player's own current values
written using the
format of whichever [rules set](../../glossary.md#rules-set) applies to
their era — a bare number, or a number with a trailing plus for a target a
die roll has to meet — with the same Passing-omission and dash-for-zero
rules as the
[position deepdive's stat line](deepdive-embeds.md#characteristics-stat-lines). Each value that has moved away
from the [position](../../glossary.md#position)'s own recorded baseline
under that rules set is marked as increased or decreased;
the comparison is on the raw stored numbers, so a not-yet-curated zero
is still marked as decreased. Nothing is marked when the position has
no recorded baseline under the resolved rules set — the values are shown
unmarked rather than guessing — and the whole line is omitted when no rules
set can be resolved for the player's era at all.

## Lasting injuries

Then, on the next line, the player's currently outstanding lasting injuries:
a miss-next-game note, a niggling-injury count, and one `-N` entry per
outstanding characteristic reduction, in MA/ST/AG/PA/AV
order, all on one comma-separated line. This is live state, not a career
tally — the event counts further down already cover what the player has ever
suffered. The line is omitted entirely for a player carrying no active lasting
injury, which is the overwhelmingly common case; unlike the characteristics
line above it, whose omission means the values could not be written correctly,
this one's absence simply means there is nothing to report. The two lines are
independent: an injury still shows when no rules set resolves for the era and
the stat line is therefore absent.

## Skills

Then up to two skill lines: the starting skills the player's
[position](../../glossary.md#position) granted, alphabetically, and the skills
the player has gained since, in the order they were gained (a skill with no
recorded order goes last). A group with no skills has no line at all, and
both are omitted when no rules set resolves for the player's era. A skill
whose rules need a roll or a named target shows that value in brackets after
its name.

A skill can carry markers before its name, always in this order:

- `⚄`: a gained skill that was rolled for rather than chosen.
- `⚄?`: a gained skill whose source does not say whether it was rolled or
  chosen. BBL does not say, and the import settles it only where the SPP BBL
  reports as spent allows (see
  [unspent SPP](../../game-concepts/players/index.md#unspent-spp)). Shown
  only when the player's era prices advancements by kind (BB2020, DB2021,
  BB2025), where a rolled skill costs less than a chosen one, so an unmarked
  skill would read as chosen. Never shown in a fixed-threshold era (CRP,
  CRP+, BB2016), where every advancement costs the same; never on a free
  extra or a starting skill; and not when the era's pricing model cannot be
  worked out or the lookup fails or times out.
- `✚`: a [free extra](../../glossary.md#free-extra-skill), a gained skill that
  cost no SPP.
- `★`: a star player's own exclusive skill, on starting and gained skills
  alike.
- `♦`: an elite gained skill.

The embed has no legend for the markers.

## Keywords

Last of this group of condition lines — after the characteristics,
characteristic advancements, lasting injuries and skill lines — one
unprefixed line naming the player's position's BB2025-style
keywords under the one [rules set](../../glossary.md#rules-set) their era
resolves to: `Keywords: Goblin, Undead`. A player has no keywords of their
own — these are the [position](../../glossary.md#position)'s, the same
relationship this embed already has to the position's characteristic
baseline. The rules set is not named on this line, unlike the position and
star player deepdives' own keywords sections: the characteristics line above
has already established which rules set applies to this player, and
repeating it here would be noise. The line is omitted entirely when that
rules set records no keywords for the position, and also when no rules set
resolves for the player's era at all — there is then nothing to scope the
keywords to, the same reason the characteristics line itself is omitted in
that case.

## Trophies

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

## Per-match-event counters

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

## Star player points

Then — only when the player has a computed star player point total, with no
line at all otherwise — a blank line, an optional `SPP adjustment:` line,
shown only when a nonzero manual adjustment has been applied (the total
already includes it; the line is just calling that out), the player's
`Total SPP:` line, and an `Unspent SPP:` line for every player status alike,
worked out as [unspent SPP](../../game-concepts/players/index.md#unspent-spp)
describes:

- One figure when the spend is exact, otherwise the least and most it could
  be, joined by an en dash (`5–11`). A negative figure is shown as is.
- A note in brackets: `covers another advancement`,
  `may cover another advancement`, `not enough for another advancement`, or
  `no further advancements available`. Nothing to spend (`0` or less) gets no
  note.
- When the stored unspent figure lies outside the calculated range, the line
  shows both, as `9 stored, 4–7 calculated` (the calculated part is a single
  number when the spend is exact), and a further note says the recorded
  advancement history may be incomplete or misrecorded. A stored figure
  inside the range shows as that one number.
- `unknown`, with the reason in plain words, when it cannot be worked out or
  the lookup timed out or failed (`lookup unavailable`). Neither replaces the
  rest of the embed.
- Advancements missing from the recorded history make a _yes_ generous.

The bot's toplists of players by SPP deliberately leave unspent SPP out.

## Kills list

Then — only when the player has a recorded kill event, including a
prevented or unresolved death attempt, with the whole section omitted
otherwise rather than a placeholder line — a blank line, a kills
heading, and one line per kill, newest match first. One line is shown per kill
event, so a victim killed more than once by this player appears once per kill.

### Naming the victim

- A kill whose victim is a specific indexed player names that player with their position, team, race and coach.
- A kill where only the victim's side is known names the team, with its race and coach.
- A kill where a multi-team match leaves the side ambiguous names the candidate teams, "or"-joined.
- A kill with nothing attributable at all reads as an anonymous opponent in mysterious circumstances.
- The list also includes a death attempt with no recorded outcome at all; its victim's team is resolved the same way an event with an ambiguous or unattributed killer team already is resolved elsewhere in this document.

### Prevented deaths and fouls

- A death this player caused but that was prevented carries a note saying the death was saved by an apothecary or by regeneration — the team is known and the victim player is never named, in the normal case.
- A defensive fallback (not expected from any known importer behaviour) can instead render a prevented kill through the generic resolution logic like any other unresolvable kill, when the recorded team can't be matched or the save reason is missing.
- Any kill line notes when the fatal (or prevented) event was a foul, the same note the status line uses — including the prevented row.

### Truncation and the kill count

- The list is capped, and when it is truncated the embed says exactly how many kills are not shown, computed from the player's true kill count.
- The same note can also appear even when the kill count itself was not capped: long team, player, race or coach names can exhaust the embed's description-length budget before all of the fetched rows fit, in which case the rows that do not fit are dropped the same way and the note reports them too.
- Either way the note's count is always exact — it is computed from the player's true kill total, not from how many rows happened to be fetched or rendered — regardless of which of the two overflow reasons caused rows to be dropped.
- The player's true kill count always equals the kill sub-counts of the casualty and foul lines added together, exactly — not merely typically.

## Button ordering

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
