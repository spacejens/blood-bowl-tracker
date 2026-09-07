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
apart. Where a target's description in
[`/deepdive` embed formats](deepdive-embeds.md) says "the `<x>` name as the
title", that title carries this prefix too. The not-found and database-timeout replies
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
suggestions exclude star positions — those are looked up via `star-player`
instead — and are labelled `<position> (<race>)`, because position names
repeat across races — nearly every race has a "Lineman" — and a position
available to several races produces one suggestion per race, all selecting
the same position; a position with no race recorded is not suggested, since
there would be no race to name; `competition` suggestions are labelled
`<competition> (<league>)`; `competition-group` suggestions are labelled
`<name> (<league>)`; `trophy` suggestions are labelled `<name>
(<competition group>)`, or `<name> (<league>)` for a trophy the league awards
directly; `league` suggestions are a bare name with no parenthetical):

- **No argument** — the bot replies with a short usage prompt, because a
  deepdive needs a target. This is framed as "specify a target", not a hard
  validation error, so the command can add targets later without changing this
  contract.
- **More than one argument** (e.g. both `era` and `coach`) — the bot rejects
  the call with an error message instead of guessing which target was
  intended, since the arguments are mutually exclusive.

## Targets

One line per target — what its embed shows at a glance. The full embed format
for each, including its drill-down buttons, is in
[`/deepdive` embed formats](deepdive-embeds.md).

- **`era:<era>`** — an embed for that era: its league, its start-end dates, its
  rules sets, and a chronological list of its competitions. See
  [the full format](deepdive-embeds.md#era).
- **An era that matches nothing** — the bot replies with a not-found message.
- **`coach:<coach>`** — an embed for that coach: their career span and their top
  five teams by matches played. See
  [the full format](deepdive-embeds.md#coach).
- **A coach that matches nothing** — the bot replies with a not-found message.
- **`team:<team>`** — an embed for that team: its race, coach, era list and
  career span, its trophies grouped by era, and its top five players by SPP. See
  [the full format](deepdive-embeds.md#team).
- **A team that matches nothing** — the bot replies with a not-found message.
- **`player:<player>`** — an embed for that player: their team, era, race and
  position, a killer-attribution line if they died, their characteristics, their
  trophies, their per-match-event counters, their star player points, and their
  kills. See [the full format](deepdive-embeds.md#player).
- **A player that matches nothing** — the bot replies with a not-found message.
- **`star-player:<star>`** — an embed for that star: one stat line per rules set
  they have recorded characteristics for, and every team that has hired them.
  See [the full format](deepdive-embeds.md#star-player).
- **A star player that matches nothing** — the bot replies with a not-found
  message.
- **`race:<race>`** — an embed for that race: the eras it has appeared in, its
  positions grouped by era, and its top five teams by matches played. See
  [the full format](deepdive-embeds.md#race).
- **A race that matches nothing** — the bot replies with a not-found message.
- **`position:<position>`** — an embed for that
  [position](../../glossary.md#position): its race(s), one stat line per rules
  set, how many players hold it, and its top five players by SPP. See
  [the full format](deepdive-embeds.md#position).
- **A position that matches nothing** — the bot replies with a not-found
  message.
- **`competition:<competition>`** — an embed for that competition: its type,
  era, group and duration, and its participating teams. See
  [the full format](deepdive-embeds.md#competition).
- **A competition that matches nothing** — the bot replies with a not-found
  message.
- **`competition-group:<group>`** — an embed for that recurring group: its
  league, the trophies it awards, and its competition instances grouped by era.
  See [the full format](deepdive-embeds.md#competition-group).
- **A competition group that matches nothing** — the bot replies with a
  not-found message.
- **`league:<league>`** — an embed for that league: the trophies it awards
  directly and the competition groups it runs. See
  [the full format](deepdive-embeds.md#league).
- **A league that matches nothing** — the bot replies with a not-found message.
- **`trophy:<trophy>`** — an embed for that trophy: what it is awarded for, its
  description, and its recipients grouped by era. See
  [the full format](deepdive-embeds.md#trophy).
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

All six race toplists (`race.toplist.teams.descending`,
`race.toplist.teams.ascending`, `race.toplist.matches.played`,
`race.toplist.matches.won`, `race.toplist.matches.lost`,
`race.toplist.matches.drawn`) attach
one button per listed race, opening the same `/deepdive race:<race>` view.

`position.toplist.players` attaches one button per listed position, opening
the same `/deepdive position:<position>` view. With this, every `/insights`
toplist has button coverage.

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
