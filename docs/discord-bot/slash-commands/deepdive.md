# `/deepdive`

`/deepdive` is a lookup and drill-down command for a single recorded subject.
Today it supports eleven targets — an era, a coach, a team, a player, a star
player, a race, a position, a competition, a competition group, a trophy, and
a league — and is designed to grow further optional, mutually exclusive
targets in future work.

Every deepdive embed's headline is the subject's name prefixed with its entity
type's emoji — 🕰️ era, 📋 coach, 🛡️ team, 🎽 player, ⭐ star player, 🧬 race,
🏃 position, 🏟️ competition, 🔁 competition group, 🏛️ league, 🏆 trophy — so
the title
visually matches the button or dropdown entry that opened it. These are the
same emoji the drill-down components carry, read from the single map in
`apps/discord-bot/src/entity-components.service.ts`, so the two can never drift
apart. Where a target's description below says "the `<x>` name as the title",
that title carries this prefix too. The not-found and database-timeout replies
are plain messages with no embed, so they have no headline to prefix.

## Arguments

The command takes eleven optional string arguments, `era`, `coach`, `team`, `player`,
`star-player`, `race`, `position`, `competition`, `competition-group`, `trophy`, and
`league`, each autocompleted by name
(`era` suggestions are labelled `<era> (<league>)`; `coach` and `team` suggestions are labelled
`<name> (#<id>)`; `player` suggestions are labelled `<name> (<team>)`
because player names are not unique across teams; `star-player` suggestions are
a bare name with no parenthetical, because a star has no single team to name in
one; `race` suggestions are a bare name with no parenthetical; `position`
suggestions are a bare name with no parenthetical; `competition`
suggestions are labelled `<competition> (<league>)`; `competition-group`
suggestions are
labelled `<name> (<league>)`; `trophy` suggestions are labelled `<name>
(<competition group>)`, or `<name> (<league>)` for a trophy the league awards
directly; `league` suggestions are a bare name with no parenthetical):

- **No argument** — the bot replies with a short usage prompt, because a
  deepdive needs a target. This is framed as "specify a target", not a hard
  validation error, so the command can add targets later without changing this
  contract.
- **More than one argument** (e.g. both `era` and `coach`) — the bot rejects
  the call with an error message instead of guessing which target was
  intended, since the arguments are mutually exclusive.
- **`era:<era>`** — the bot replies with an embed for that era: the era name as
  the title, then its league, its start–end dates (an ongoing era shows
  `present`), its rules sets (comma-joined, or "None recorded"), and a
  chronological list of the era's competitions, one line per competition
  formatted `<name> (<type>)`. Competitions are ordered by their earliest
  recorded match; competitions with no played matches yet sort last. An era
  with no competitions shows a short "nothing played yet" message instead of a
  list.
- **An era that matches nothing** — the bot replies with a not-found message.
- **`coach:<coach>`** — the bot replies with an embed for that coach: the coach
  name as the title, then their career span (the first and last dates across
  every match they have played), a blank line, and `Top teams by matches
played:` followed by their top five teams by matches played, one line per
  team formatted `<rank>. <team> — <matches>`. Ties at the fifth-place cutoff
  are all shown, up to ten teams — the same convention `/insights` toplists
  use, though at most ten teams are fetched for a deepdive, so the toplists'
  "…and N more tied." truncation note never actually appears here. A coach who
  exists but has recorded no matches shows a short "hasn't played yet" message
  instead of a career span and team list.
- **A coach that matches nothing** — the bot replies with a not-found message.
- **`team:<team>`** — the bot replies with an embed for that team: the team
  name as the title, then its race, its coach, its era list, its career span
  (the first and last dates across every match it has played), then — only
  when the team has recorded trophies, with the whole section omitted
  otherwise rather than a placeholder line — a blank line and one
  `<era> trophies:` heading per era, newest era first, each followed by that
  era's awards newest-first, one line per award formatted
  `<competition> (<trophy>)` for a trophy won by the team itself or
  `<competition> (<trophy>): <player> (<position>)` for a trophy won by one
  of its players — the two kinds are interleaved within an era rather than
  split, since both are that era's trophies, and the team, race, coach and
  era are left off the rows because the header, the embed's own subject and
  the section heading already name them. A blank line separates each era
  section from the next. At most 30 trophies are shown; when there are more,
  the list ends with an exact `…and N more not shown.` note computed from the
  team's true award count. Then a blank line and
  `Top players by match events:` followed by its top five players by total
  match events — every recorded event a player took part in, of any type,
  counted together — one line per player formatted
  `<rank>. <player> — <events>`. Ties at the fifth-place cutoff are all shown,
  up to ten players (the same convention `/insights` toplists use, though at
  most ten players are fetched, so the "…and N more tied." note never actually
  appears here). Each trophy is rendered as a drill-down button to the trophy,
  plus a button to the player for a player award; those come before the
  top-players buttons, which in turn come before the race/coach/era header
  buttons, so the most specific content keeps button priority. A team that
  exists but has recorded no matches shows a short "hasn't played yet" message
  in place of the career span, trophies and player list, but still shows its
  race and coach.
- **A team that matches nothing** — the bot replies with a not-found message.
- **`player:<player>`** — the bot replies with an embed for that player: the
  player name as the title, then `Team: <team>`, `Era: <era>`, `Race: <race>`,
  and `Position: <position>` (every player always has all four — a player
  belongs to exactly one team-era, and therefore to exactly one era), then —
  only for a player who died — a `Status:` line naming whoever was
  responsible, at the best precision the recorded match event supports:
  `Status: Killed by <player> (<position>, <team>, <race>, <coach>)` when the
  killer is a specific indexed player;
  `Status: Killed by <team> (<race>, <coach>)` when only the killing side is
  known (the source named a journeyman or mercenary rather than linking a
  player row), or when the event recorded no acting side but the match had
  exactly one other team;
  `Status: Killed by <team A> (…), <team B> (…), or <team C> (…)` — an
  "or"-joined list, with a plain `X or Y` for exactly two and an Oxford comma
  before the `or` for three or more — when a multi-team match leaves several
  possible killers; and `Status: Killed in mysterious circumstances` as a
  fallback when nothing can be attributed at all.
  When the fatal event was recorded as a foul rather than a regular blocking
  action, the line ends with `(via a foul)` — e.g.
  `Status: Killed by Gouged Eye (Orc, Grimly) (via a foul)` — in all four of
  those forms.
  Only the `death` consequence produces this line; a player who has not died
  shows no `Status:` line at all, rather than a placeholder. Then a
  `Characteristics: MA <move> ST <strength> AG <agility> [PA <passing>]
  AV <armour>` line, the player's own current values written using the
  format of whichever [rules set](../../glossary.md#rules-set) applies to
  their era — a bare number, or a number with a trailing `+` for a target a
  die roll has to meet — with the same `PA`-omission and dash-for-zero rules
  as the position deepdive's stat line below. Each value that has moved away
  from the [position](../../glossary.md#position)'s own recorded baseline
  under that rules set carries a trailing `▲` (increased) or `▼` (decreased);
  the comparison is on the raw stored numbers, so a not-yet-curated zero
  still carries `▼` next to its dash. Nothing is marked when the position has
  no recorded baseline under the resolved rules set — the values are shown
  unmarked rather than guessing — and the whole line is omitted when no rules
  set can be resolved for the player's era at all. Then —
  only when the player has recorded trophies, with the whole section omitted
  otherwise rather than a placeholder line — a blank line, a `Trophies:`
  heading, and that player's own awards newest-competition-first, one line per
  award formatted `<competition> (<trophy>)`. Neither the team nor the era is
  repeated on those rows, and there is no per-era grouping as on the team
  deepdive: a player belongs to exactly one team-era for their whole career,
  so the header already names both. At most 30 trophies are shown; when there
  are more, the list ends with an exact `…and N more not shown.` note computed
  from the player's true award count. Then a blank line, and one line per
  non-zero event category the player caused, formatted `<label>: <count>`. The
  categories are the acting-role tallies — things the player did, never
  things done to them: MVP awards, touchdowns scored, completions,
  interceptions and deflections as plain `<label>: <count>` lines, followed by
  two lines that carry their own severity breakdown,
  `Casualties inflicted: <total> (<N> serious injuries, <N> killed)` and
  `Fouls committed: <total> (<N> serious injuries, <N> killed)`. A zero
  sub-count is dropped from the parenthetical along with its comma, the
  parenthetical disappears when both sub-counts are zero, and the whole line
  disappears when the total is zero. Fouls carry their own breakdown rather
  than folding into the casualty one because Blood Bowl awards no casualty
  credit for a foul, so a foul-caused injury is deliberately not counted as a
  casualty inflicted. The `killed` sub-counts (on both lines) and the fouls
  `seriousInjuries` sub-count mean "attempted", not just "confirmed": they
  fold in an attempt that was saved by an apothecary or by regeneration, and
  — for casualties' `killed` only — a death attempt with no recorded outcome
  at all. The fouls `seriousInjuries` sub-count includes every foul-caused
  serious injury, whichever form the injury takes. These per-match-event
  tallies are a separate
  concept from the competition-level trophies above: the "MVP awards" count is
  match MVPs, not an end-of-competition MVP trophy. Zero categories are
  omitted; a player with nothing in any category shows a short
  nothing-memorable-yet-style message instead of an empty list.
  Then — only when the player has a computed star player point total, with no
  line at all otherwise — a blank line, an optional
  `Star player points adjustment: <+N|-N> (included)` line shown only when a
  nonzero manual adjustment has been applied (the total already includes it;
  the line is just calling that out), and `Total star player points: <total>`.
  Then — only when the player has killed someone, with the whole section
  omitted otherwise rather than a placeholder line — a blank line, a `Kills:`
  heading, and one line per kill, newest match first. A kill whose victim is a
  specific indexed player reads
  `<player> (<position>, <team>, <race>, <coach>)`; one where only the victim's
  side is known reads `An unidentified player from <team> (<race>, <coach>)`;
  one where a multi-team match leaves the side ambiguous reads
  `An unidentified player from <team A> (…) or <team B> (…)`, "or"-joined with
  an Oxford comma for three or more; and one with nothing attributable at all
  reads `An opponent, in mysterious circumstances`. A death this player
  caused but that was saved by an apothecary or by regeneration reads
  `An unidentified player from <team> (<race>, <coach>), saved by an apothecary` or
  `...saved by regeneration` — the team is known and the victim player is
  never named, in the normal case; a defensive fallback (not expected from any
  known importer behaviour) can instead render a prevented kill through the
  generic resolution logic like any other unresolvable kill, when the
  recorded team can't be matched or the save reason is missing. Any of them
  ends with `(via a foul)` when
  the fatal (or prevented) event was a foul, the same note the `Status:` line
  uses — including the prevented row. The list also includes a death attempt
  with no recorded outcome at all; its victim's team is resolved the same way
  an event with an ambiguous or unattributed killer team already is resolved
  elsewhere in this document. One line is shown per kill event, so a victim
  killed more than once by this player appears once per kill. At most 30
  kills are shown; when
  there are more, the list ends with an exact `…and N more not shown.` note
  computed from the player's true kill count. The same note can also appear
  with 30 or fewer total kills: long team, player, race or coach names can
  exhaust the embed's description-length budget before all of the fetched
  rows fit, in which case the rows that do not fit are dropped the same way
  and the note reports them too. Either way the note's count is always exact
  — it is computed from the player's true kill total, not from how many rows
  happened to be fetched or rendered — regardless of which of the two
  overflow reasons caused rows to be dropped. The player's true kill count
  always equals the killed sub-counts of the casualty and foul lines added
  together, exactly — not merely typically.
  Each trophy is
  rendered as a drill-down button to the trophy; those come first, then — for
  a player who died — a button to the killer (the killer player for a named
  killer, the killer team for a team-only killer, or one button per candidate
  team when the killer is ambiguous; no button at all in the mysterious-
  circumstances case), then one button per listed victim (the victim player
  when identified, one button per candidate team when the side is ambiguous,
  none in the mysterious-circumstances case), then the team, era, race and
  position buttons — which follow the order of the header lines — so the most
  specific content keeps button priority. The `Position: <position>` line
  stays as text as well as gaining a button: unlike team/era/race, the button
  can vanish under the 25-entry cap or when the list of drill-down targets
  grows too long for buttons, so the text line is the reader's guaranteed way
  to see the position even then. Neither the killer's own position, race or
  coach has a button, nor a victim's.
- **A player that matches nothing** — the bot replies with a not-found message.
- **`star-player:<star>`** — the bot replies with an embed for that star: the
  star's name as the title, then one line per team that has ever hired them,
  most-hires-first (ties broken by team name — the query itself supplies this
  order, so the description and the buttons can never disagree), formatted
  `<team> (<race>, <coach>) — <N> hire(s)`. Each hire is a
  separate signing: a team that brings the same star back counts once per hire,
  and hires are never split by era. Each listed team is rendered as a
  drill-down button to that team. A star that resolves but has never been hired
  by anyone is treated as not found — the same not-found reply as a star
  matching no name at all — because there is no hire history to show. The
  description is truncated with a trailing `…` if it would otherwise exceed
  Discord's embed description limit, mirroring the regular player deepdive's
  own safety net.
- **A star player that matches nothing** — the bot replies with a not-found
  message.
- **`race:<race>`** — the bot replies with an embed for that race: the race
  name as the title, then `Eras: <eras>` (the eras this race has appeared in,
  comma-joined by name, or "None recorded" if it is in none), then — only when
  the race has (non-star) positions recorded for at least one era, with the
  whole section omitted otherwise — a blank line and one
  `<era> positions:` heading per era, oldest era first, each followed by that
  era's positions as one line per position, name-ascending — the same
  heading-then-rows shape the trophy and competition-group deepdives use for
  their own per-era lists. A position recurring across several eras appears
  once per era it belongs to. Star positions are never listed here: they are
  shared across every race that can hire them rather than belonging to this
  one race, and are already reachable from their own star-player deepdive.
  Then a blank line and
  `Top teams by matches played:` followed by its top five teams by matches
  played, one line per team formatted `<rank>. <team> — <matches>`. Ties at the
  fifth-place cutoff are all shown, up to ten teams — the same convention
  `/insights` toplists use, though at most ten teams are fetched, so the "…and N
  more tied." note never actually appears here. The top-teams list is not
  era-scoped. A race with no recorded team appearances shows a short "no teams
  yet" message in place of the list. Every listed position is rendered as a
  drill-down button to that position's deepdive, ahead of the top-teams
  buttons.
- **A race that matches nothing** — the bot replies with a not-found message.
- **`position:<position>`** — the bot replies with an embed for that
  [position](../../glossary.md#position): the position name as the title,
  then `Race(s): <races>` (comma-joined by name, or "None recorded" if the
  position has no [race](../../glossary.md#race) recorded — a position can
  in principle belong to more than one race), a blank line, and one stat
  line per rules set the position has recorded characteristics for, oldest
  rules set first, formatted `<rules set>: MA <move> ST <strength>
  AG <agility> [PA <passing>] AV <armour>`. Each value is written using that
  rules set's own recorded format — a bare number, or a number with a
  trailing `+` for a target a die roll has to meet — and a rules set with no
  Passing characteristic at all omits the `PA` field entirely rather than
  showing a placeholder for it; a stored value of zero (not yet curated)
  renders as a dash instead of `0`. A position with no characteristics
  recorded for any rules set shows a short message instead of a stat-line
  list. Then a blank line, `Held by <N> player(s)`, a blank line, and
  `Top players by SPP:` followed by its top five players by career SPP total,
  one line per player formatted `<rank>. <player> (<team>, <coach>) — <SPP>`
  — the player's position is left off, since every listed player already
  holds this one, and the list is not scoped to one race or one
  [era](../../glossary.md#era), so neither belongs on the row either. Ties at the
  fifth-place cutoff are all shown, up to ten players — the same convention
  `/insights` toplists use, though at most ten players are fetched, so the
  "…and N more tied." note never actually appears here. A position with no
  players shows a short message instead of a list. Every listed race is
  rendered as a drill-down button to that race's deepdive, followed by one
  button per listed top player.
- **A position that matches nothing** — the bot replies with a not-found
  message.
- **`competition:<competition>`** — the bot replies with an embed for that
  competition: the competition name as the title, then `Type: <type>` (`season`
  or `cup`), `Era: <era>`, `Group: <competition group>`, `Duration: <range>`
  (an ongoing competition shows `present`), a blank line, and
  `Participating teams:` followed by every participating team, one line per
  team formatted `<team>` with its race and coach appended as a suffix. A
  competition with no participating teams shows a short "nobody has signed up
  yet" message instead of a list. Every participating team and the era are
  each rendered as a drill-down button (teams take priority over the era entry
  when the combined list is too long for buttons and switches to select
  menus), and the embed also offers a drill-up button to the competition's
  recurring group, last of all.
- **A competition that matches nothing** — the bot replies with a not-found
  message.
- **`competition-group:<group>`** — the bot replies with an embed for that
  recurring group: the group name as the title, then `League: <league>`, a
  blank line, `Trophies:` followed by every trophy the group awards, one line
  per trophy (or "Not one piece of silverware rides on this one." when it
  awards none), a blank line, and one `<era> competitions:` heading per era,
  oldest era first, each followed by that era's competition instances, oldest
  first, one line per competition formatted `<name>: <date range>` (or "This
  fixture has never actually been played." when the group has no instances at
  all, in which case no era heading is shown) — a blank line separates each
  era section from the next, so a multi-era group doesn't read as one packed
  block. Competitions are rendered as
  drill-down buttons before trophies (competitions take priority over trophies
  when the combined list is too long for buttons and switches to select
  menus).
- **A competition group that matches nothing** — the bot replies with a
  not-found message.
- **`league:<league>`** — the bot replies with an embed for that league: the
  league name as the title, then `Trophies:` followed by every trophy the
  league itself awards directly — not through one of its competition groups —
  one line per trophy (or "This league keeps no silverware of its own." when it
  awards none directly), a blank line, and `Competition groups:` followed by
  every competition group the league runs, one line per group (or "This league
  has never scheduled a single fixture." when it has none). Competition groups
  are rendered as drill-down buttons before trophies (groups take priority over
  trophies when the combined list is too long for buttons and switches to
  select menus).
- **A league that matches nothing** — the bot replies with a not-found message.
- **`trophy:<trophy>`** — the bot replies with an embed for that trophy: the
  trophy name as the title, then `Awarded for: <competition group>` and, only
  when the trophy has one, `Description: <description>`, a blank line, then
  one `<era> recipients:` heading per era, newest era first, each followed by
  that era's awards, newest-first, one line per award formatted
  `<competition>: <team> (<race>, <coach>)` for a team trophy or
  `<competition>: <player> (<position>, <team>, <race>, <coach>)` for a player
  trophy — the same race/coach and position/team/race/coach context the
  `team.toplist` and `player.toplist` insights append to their own rows (the
  era is left off the row, since the section heading already names it). A
  blank line separates each era section from the next, so a long-running
  trophy doesn't read as one packed block.
  At most 30 recipients are shown; when there are more, the list ends with an
  exact `…and N more not shown.` note computed from the trophy's true award
  count. A trophy with no recorded awards shows a short "nobody has got their
  hands on this one yet" message instead of a list. Each shown recipient is
  rendered as a drill-down button to whoever actually received the trophy —
  the team for a team trophy, the player for a player trophy — with no button
  for the competition it was awarded at; the embed also offers a drill-up
  button, last of all, to the trophy's competition group when it has one, or
  to its league directly when it does not — a trophy is scoped to exactly one
  or the other, never both.
- **A trophy that matches nothing** — the bot replies with a not-found
  message.

If the database does not respond in time, the command falls back to a themed
timeout message instead of its normal reply, so it always answers within
Discord's response window.

## Relationship to `/insights`

`/insights`' `eras.list` view lists every era and attaches one button per era.
Pressing a button opens the same era deepdive shown by `/deepdive era:<era>` —
the button and the command share a single resolver, so their output is always
identical. Likewise, each of the eleven coach toplists
(`coach.toplist.matches.played`, `coach.toplist.matches.won`, `coach.toplist.matches.lost`, `coach.toplist.matches.drawn`, `coach.toplist.teams`,
`coach.toplist.competitions.played`, `coach.toplist.eras.active`,
`coach.toplist.fouls.committed`,
`coach.toplist.timeBetweenMatches.longest.descending`,
`coach.toplist.timeBetweenMatches.longest.ascending`,
`coach.toplist.timeBetweenMatches.average`) attaches one button per listed
coach, opening the same `/deepdive coach:<coach>` view. See
[`/insights`](insights.md).

Each of the twenty-two `team.toplist.*` facts attaches one button per listed team,
opening the same `/deepdive team:<team>` view.

All five race toplists (`race.toplist.teams`, `race.toplist.matches.played`,
`race.toplist.matches.won`, `race.toplist.matches.lost`,
`race.toplist.matches.drawn`) attach
one button per listed race, opening the same `/deepdive race:<race>` view. With
this, every `/insights` toplist has button coverage.

Each of the fourteen `player.toplist.*` facts attaches one button per listed
player, opening the same `/deepdive player:<player>` view. Note the button set
is broader than the deepdive's own category list: the consequence-only toplists
(`player.toplist.casualties.suffered`, `player.toplist.injuries.serious.suffered`,
`player.toplist.injuries.lasting.suffered`, `player.toplist.sent_off`) still get
buttons, even though those "happened to the player" categories are never shown
in the deepdive embed itself.

`starPlayers.list`, `starPlayers.toplist.hires.total` and
`starPlayers.toplist.hires.distinctTeams` each attach one button per listed
star, opening the same `/deepdive star-player:<star>` view. No `/insights`
fact lists leagues today, so the `league` target has no `/insights` button
coverage yet.

`trophies.list` attaches one button per listed trophy, opening the same
`/deepdive trophy:<trophy>` view.

This is the intended pattern going forward: as `/deepdive` grows more lookup
targets, most `/insights` views that list items of a supported target type are
expected to gain a button per listed item, opening that item's deepdive the
same way `eras.list`, `trophies.list`, the coach toplists, and the team
toplists do today.

Drill-down links render as buttons while a view lists at most 25 items —
Discord's per-message button ceiling. A longer list switches entirely to
dropdown menus instead (one menu per linked entity type, 25 entries per menu,
at most five menus per message), which raises the ceiling to 125 links.
Choosing an entry opens the same deepdive its button would have. If even that
is not enough, the remaining items are still listed in the embed text and the
description ends with a note counting the ones left without a link — the cap
is visible rather than silent. See
`apps/discord-bot/src/entity-components.service.ts`.

See the implementation in `apps/discord-bot/src/slash-commands/deepdive-command.service.ts`
and the resolvers in `apps/discord-bot/src/deepdive/facts/era-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/coach-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/team-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/player-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/star-player-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/race-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/position-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/competition-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/competition-group-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/league-deepdive.service.ts`, and
`apps/discord-bot/src/deepdive/facts/trophy-deepdive.service.ts`.
