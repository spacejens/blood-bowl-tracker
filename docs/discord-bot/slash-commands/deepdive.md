# `/deepdive`

`/deepdive` is a lookup and drill-down command for a single recorded subject.
Today it supports eight targets — an era, a coach, a team, a player, a race, a
competition, a competition group, and a trophy — and is designed to grow
further optional, mutually exclusive targets in future work.

Every deepdive embed's headline is the subject's name prefixed with its entity
type's emoji — 🕰️ era, 📋 coach, 🛡️ team, 🎽 player, 🧬 race, 🏟️ competition,
🔁 competition group, 🏆 trophy — so the title visually matches the button or
dropdown entry that opened it. These are the same emoji the drill-down
components carry, read from the single map in
`apps/discord-bot/src/entity-components.service.ts`, so the two can never drift
apart. Where a target's description below says "the `<x>` name as the title",
that title carries this prefix too. The not-found and database-timeout replies
are plain messages with no embed, so they have no headline to prefix.

## Arguments

The command takes eight optional string arguments, `era`, `coach`, `team`, `player`,
`race`, `competition`, `competition-group`, and `trophy`, each autocompleted by name
(`era` suggestions are labelled `<era> (<league>)`; `coach` and `team` suggestions are labelled
`<name> (#<id>)`; `player` suggestions are labelled `<name> (<team>)`
because player names are not unique across teams; `race` suggestions are a bare
name with no parenthetical; `competition` suggestions are
labelled `<competition> (<league>)`; `competition-group` suggestions are
labelled `<name> (<league>)`; `trophy` suggestions are labelled `<name>
(<competition group>)`):

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
  belongs to exactly one team-era, and therefore to exactly one era), a blank
  line, and one line per non-zero event category the player caused, formatted
  `<label>: <count>`. The categories are the nine acting-role tallies: MVP
  awards, touchdowns scored, completions, interceptions, deflections,
  casualties inflicted, serious injuries inflicted, opponents killed, and fouls
  committed — things the player did, never things done to them. Zero categories
  are omitted; a player with nothing in any category shows a short
  nothing-memorable-yet-style message instead of an empty list. The team, era
  and race are each rendered as a drill-down button, in the same order as the
  header lines; position has no deepdive target, so it has no button.
- **A player that matches nothing** — the bot replies with a not-found message.
- **`race:<race>`** — the bot replies with an embed for that race: the race
  name as the title, then `Eras: <eras>` (the eras this race has appeared in,
  comma-joined by name, or "None recorded" if it is in none), a blank line, and
  `Top teams by matches played:` followed by its top five teams by matches
  played, one line per team formatted `<rank>. <team> — <matches>`. Ties at the
  fifth-place cutoff are all shown, up to ten teams — the same convention
  `/insights` toplists use, though at most ten teams are fetched, so the "…and N
  more tied." note never actually appears here. The top-teams list is not
  era-scoped. A race with no recorded team appearances shows a short "no teams
  yet" message in place of the list.
- **A race that matches nothing** — the bot replies with a not-found message.
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
  button to the trophy's competition group, last of all.
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

Each of the twenty-one `team.toplist.*` facts attaches one button per listed team,
opening the same `/deepdive team:<team>` view.

All five race toplists (`race.toplist.teams`, `race.toplist.matches.played`,
`race.toplist.matches.won`, `race.toplist.matches.lost`,
`race.toplist.matches.drawn`) attach
one button per listed race, opening the same `/deepdive race:<race>` view. With
this, every `/insights` toplist has button coverage.

Each of the thirteen `player.toplist.*` facts attaches one button per listed
player, opening the same `/deepdive player:<player>` view. Note the button set
is broader than the deepdive's own category list: the consequence-only toplists
(`player.toplist.casualties.suffered`, `player.toplist.injuries.serious.suffered`,
`player.toplist.injuries.lasting.suffered`, `player.toplist.sent_off`) still get
buttons, even though those "happened to the player" categories are never shown
in the deepdive embed itself.

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
`apps/discord-bot/src/deepdive/facts/race-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/competition-deepdive.service.ts`,
`apps/discord-bot/src/deepdive/facts/competition-group-deepdive.service.ts`, and
`apps/discord-bot/src/deepdive/facts/trophy-deepdive.service.ts`.
