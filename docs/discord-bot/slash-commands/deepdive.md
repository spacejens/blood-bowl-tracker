# `/deepdive`

`/deepdive` is a lookup and drill-down command for a single recorded subject.
Today it supports five targets — an era, a coach, a team, a player, and a race — and is
designed to grow further optional, mutually exclusive targets in future work.

## Arguments

The command takes five optional string arguments, `era`, `coach`, `team`, `player`, and
`race`, each autocompleted by name (`era` suggestions are labelled `<era>
(<league>)`; `player` suggestions are labelled `<name> (<team>)` because player
names are not unique across teams):

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
  name as the title, then its race, its coach, its career span (the first and
  last dates across every match it has played), a blank line, and `Top players
  by match events:` followed by its top five players by total match events —
  every recorded event a player took part in, of any type, counted together —
  one line per player formatted `<rank>. <player> — <events>`. Ties at the
  fifth-place cutoff are all shown, up to ten players (the same convention
  `/insights` toplists use, though at most ten players are fetched, so the
  "…and N more tied." note never actually appears here). A team that exists but
  has recorded no matches shows a short "hasn't played yet" message in place of
  the career span and player list, but still shows its race and coach.
- **A team that matches nothing** — the bot replies with a not-found message.
- **`player:<player>`** — the bot replies with an embed for that player: the
  player name as the title, then `Team: <team>`, `Race: <race>`, and
  `Position: <position>` (every player always has all three), a blank line, and
  one line per non-zero event category the player caused, formatted
  `<label>: <count>`. The categories are the nine acting-role tallies: MVP
  awards, touchdowns scored, completions, interceptions, deflections,
  casualties inflicted, serious injuries inflicted, opponents killed, and fouls
  committed — things the player did, never things done to them. Zero categories
  are omitted; a player with nothing in any category shows a short
  nothing-memorable-yet-style message instead of an empty list.
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

If the database does not respond in time, the command falls back to a themed
timeout message instead of its normal reply, so it always answers within
Discord's response window.

## Relationship to `/insights`

`/insights`' `eras.list` view lists every era and attaches one button per era.
Pressing a button opens the same era deepdive shown by `/deepdive era:<era>` —
the button and the command share a single resolver, so their output is always
identical. Likewise, each of the five coach toplists
(`coach.toplist.matches.played`, `coach.toplist.teams`,
`coach.toplist.competitions.played`, `coach.toplist.eras.active`,
`coach.toplist.fouls.committed`) attaches one button per listed coach, opening
the same `/deepdive coach:<coach>` view. See [`/insights`](insights.md).

Each of the sixteen `team.toplist.*` facts attaches one button per listed team,
opening the same `/deepdive team:<team>` view.

Both race toplists (`race.toplist.teams`, `race.toplist.matches.played`) attach
one button per listed race, opening the same `/deepdive race:<race>` view. With
this, every `/insights` toplist has button coverage.

Each of the thirteen `player.toplist.*` facts attaches one button per listed
player, opening the same `/deepdive player:<player>` view. Note the button set
is broader than the deepdive's own category list: the consequence-only toplists
(`player.toplist.casualties.suffered`, `player.toplist.injuries.serious.suffered`,
`player.toplist.injuries.lasting.suffered`, `player.toplist.sent_off`) still get
buttons, even though those "happened to the player" categories are never shown
in the deepdive embed itself.

This is the intended pattern going forward: as `/deepdive` grows more lookup
targets, most `/insights` views that list items of a supported target type are
expected to gain a button per listed item, opening that item's deepdive the
same way `eras.list`, the coach toplists, and the team toplists do today.

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
and the resolvers in `apps/discord-bot/src/deepdive/facts/era-deepdive.ts`,
`apps/discord-bot/src/deepdive/facts/coach-deepdive.ts`,
`apps/discord-bot/src/deepdive/facts/team-deepdive.ts`,
`apps/discord-bot/src/deepdive/facts/player-deepdive.ts`, and
`apps/discord-bot/src/deepdive/facts/race-deepdive.ts`.
