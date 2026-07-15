# `/insights`

`/insights` shares a fact drawn from a growing tree of categorized insights
derived from the recorded game data. When invoked, the bot replies in the same
channel — most facts reply with an embedded leaderboard.

## Argument

The command takes one optional string argument, `category`, a dotted path into
the fact tree (for example `coach.toplist.teams`):

- **No argument** — the bot picks a random fact from the whole tree.
- **A specific fact path** (e.g. `coach.toplist.matches.played`) — the bot
  returns that fact.
- **A branch path** (e.g. `coach.toplist`) — the bot picks a random fact from
  under that branch.
- **A path that matches nothing** — the bot replies
  `Even the Apothecary can't make sense of that one.`

As you type the argument, autocomplete suggests the next segment of valid paths
so you can navigate the tree without memorizing it.

## Available facts

- `stats` — a combined embed of entity counts (title "Statistics"): leagues,
  eras, external systems, rules sets, races, positions, coaches, competitions
  (with a season/cup breakdown), teams, players, matches, and match events.
  Supports era filtering. When an era is selected the title gains the usual
  `— <era>` suffix and the body changes: Leagues and Eras both read 1
  (intentionally kept, rather than dropped, for a consistent line set between
  all-time and era-scoped output); External systems becomes the count of
  distinct external systems the era has an external ID for, excluding the
  synthetic `Name` system; Rules sets becomes the count of the era's own
  rules sets (not a name list); and Races, Positions, Coaches, Competitions,
  Teams, Players, Matches, and Match events are each scoped to the selected
  era. Positions is an approximation — it counts every position of any race
  available in the era, since positions are not modelled per era (follow-up
  issue #153).
- `coach.toplist.matches.played` — coaches ranked by number of matches played.
- `coach.toplist.teams` — coaches ranked by number of teams coached.
- `coach.toplist.competitions.played` — coaches ranked by number of distinct
  competitions their teams have entered. Supports era filtering.
- `coach.toplist.eras.active` — coaches ranked by number of distinct eras their
  teams have existed across. Does not support era filtering (scoping to a single
  era would always yield 0 or 1), so it is excluded from era-filtered runs.
- `team.toplist.matches.played` — teams ranked by number of matches played.
- `team.toplist.competitions.played` — teams ranked by number of distinct
  competitions entered. Supports era filtering.
- `team.toplist.eras.active` — teams ranked by number of distinct eras they
  have existed across. Does not support era filtering (scoping to a single
  era would always yield 0 or 1), so it is excluded from era-filtered runs.
- `team.toplist.touchdowns.scored` — teams ranked by number of touchdowns
  scored. Counts raw `touchdown` match events credited to the team. Supports
  era filtering.
- `team.toplist.completions` — teams ranked by number of passes completed.
  Counts raw `completion` match events credited to the team. Supports era
  filtering.
- `team.toplist.interceptions` — teams ranked by number of interceptions made.
  Counts raw `interception` match events credited to the team. Supports era
  filtering.
- `team.toplist.deflections` — teams ranked by number of passes deflected.
  Counts raw `deflection` match events credited to the team. Supports era
  filtering.
- `player.toplist.mvps` — players ranked by number of MVP awards won.
  Counts raw `mvp_award` match events per player, so a player credited with
  more than one MVP in a single match has each award counted. Supports era
  filtering.
- `player.toplist.touchdowns.scored` — players ranked by number of touchdowns
  scored. Counts raw `touchdown` match events credited to the player. Supports
  era filtering.
- `player.toplist.completions` — players ranked by number of passes completed.
  Counts raw `completion` match events credited to the player. Supports era
  filtering.
- `player.toplist.interceptions` — players ranked by number of interceptions
  made. Counts raw `interception` match events credited to the player. Supports
  era filtering.
- `player.toplist.deflections` — players ranked by number of passes deflected.
  Counts raw `deflection` match events credited to the player. Supports era
  filtering.
- `race.toplist.teams` — races ranked by number of teams that have chosen
  them. Supports era filtering (an era scopes the count to teams active in
  that era).
- `race.toplist.matches.played` — races ranked by number of matches played by
  teams of that race. Counts one participation per participating team, so a
  match between two teams of the same race adds 2 to that race's total.
  Supports era filtering.
- `eras.list` — a single embed listing every recorded era grouped by league,
  leagues ordered by their earliest era and eras ordered chronologically
  within each league. Each line reads `<era> (<league>): <start> – <end>`
  (an ongoing era shows `present`), with a ` — Rules: ...` suffix when the era
  has rules sets. Does not support the `era` filter option (it exists to list
  all eras), so it is excluded from era-filtered runs.

The bot's startup message posts a random fact from this tree — the same
behavior as invoking `/insights` with no argument.

Leaderboards show the top five ranks; ties share a rank, so a leaderboard can
list more than five entries. If the database does not respond in time, the
command falls back to the message `I am stunned`.
