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
  era.
- `coach.toplist.matches.played` — coaches ranked by number of matches played.
- `coach.toplist.teams` — coaches ranked by number of teams coached.
- `coach.toplist.competitions.played` — coaches ranked by number of distinct
  competitions their teams have entered. Supports era filtering.
- `coach.toplist.eras.active` — coaches ranked by number of distinct eras their
  teams have existed across. Does not support era filtering (scoping to a single
  era would always yield 0 or 1), so it is excluded from era-filtered runs.

Each coach listed by the four `coach.toplist.*` facts above also gets a
button, in the same order as the list, that opens that coach's
[`/deepdive`](deepdive.md) detail view.

- `team.toplist.matches.played` — teams ranked by number of matches played.
- `team.toplist.competitions.played` — teams ranked by number of distinct
  competitions entered. Supports era filtering.
- `team.toplist.eras.active` — teams ranked by number of distinct eras they
  have existed across. Does not support era filtering (scoping to a single
  era would always yield 0 or 1), so it is excluded from era-filtered runs.
- `team.toplist.touchdowns.scored` — teams ranked by number of touchdowns
  scored. Counts raw `touchdown` match events credited to the team. Supports
  era and competition filtering.
- `team.toplist.completions` — teams ranked by number of passes completed.
  Counts raw `completion` match events credited to the team. Supports era and
  competition filtering.
- `team.toplist.interceptions` — teams ranked by number of interceptions made.
  Counts raw `interception` match events credited to the team. Supports era
  and competition filtering.
- `team.toplist.deflections` — teams ranked by number of passes deflected.
  Counts raw `deflection` match events credited to the team. Supports era and
  competition filtering.
- `team.toplist.casualties.caused` — teams ranked by casualties inflicted.
  Counts `casualty`, `badly_hurt`, `serious_injury`, and `death` match events
  credited to the acting team. Supports era and competition filtering.
- `team.toplist.casualties.suffered` — teams ranked by casualties suffered.
  Counts match events whose consequence is `casualty`, `badly_hurt`, `death`,
  `serious_injury`, `niggling_injury`, `miss_next_game`, or any
  `stat_reduction_*`, credited to the team the victim belongs to. Supports
  era and competition filtering.
- `team.toplist.injuries.serious.caused` — teams ranked by serious injuries
  inflicted. Counts `serious_injury` match events credited to the acting team.
  Supports era and competition filtering.
- `team.toplist.injuries.serious.suffered` — teams ranked by serious injuries
  suffered. Counts `serious_injury`, `niggling_injury`, `miss_next_game`, and
  any `stat_reduction_*` consequence, credited to the team the victim belongs
  to. Supports era and competition filtering.
- `team.toplist.injuries.lasting.suffered` — teams ranked by lasting injuries
  suffered. Counts `niggling_injury` and any `stat_reduction_*` consequence
  (the career-spanning outcomes), credited to the team the victim belongs to.
  Supports era and competition filtering.
- `team.toplist.deaths.caused` — teams ranked by opponents killed. Counts
  `death` match events credited to the acting team. Supports era and
  competition filtering.
- `team.toplist.deaths.suffered` — teams ranked by players killed. Counts match
  events whose consequence is `death`, credited to the team the dead player
  belongs to. Supports era and competition filtering.
- `team.toplist.fouls.committed` — teams ranked by fouls committed. Counts
  `foul` match events credited to the acting team. Supports era and
  competition filtering.
- `team.toplist.sent_off` — teams ranked by players sent off. Counts match
  events whose consequence is `sent_off`, credited to the team the sent-off
  player belongs to. Supports era and competition filtering.
- `team.toplist.expensiveMistakes.total` — teams ranked by the total money lost
  to expensive mistakes across their history (summed `expensive_mistake`
  consequence amounts, not event count). Amounts render with a thousands
  separator and a `gp` suffix (e.g. `150,000 gp`). Supports era and competition
  filtering.
- `team.toplist.expensiveMistakes.biggest` — individual expensive-mistake events
  ranked by amount, each row showing the losing team and the ISO `YYYY-MM-DD`
  date of the match it occurred in. A team can appear more than once. Supports
  era and competition filtering.

Each team listed by the eighteen `team.toplist.*` facts above also gets a
button, in the same order as the list, that opens that team's
[`/deepdive`](deepdive.md) detail view. For the biggest-events fact, buttons are
deduplicated so a team that appears on multiple rows gets a single button.

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
- `player.toplist.casualties.caused` — players ranked by casualties inflicted.
  Counts `casualty`, `badly_hurt`, `serious_injury`, and `death` match events
  credited to the acting player. Supports era filtering.
- `player.toplist.casualties.suffered` — players ranked by casualties suffered.
  Counts match events whose consequence is `casualty`, `badly_hurt`, `death`,
  `serious_injury`, `niggling_injury`, `miss_next_game`, or any
  `stat_reduction_*`, credited to the victim player. Supports era filtering.
- `player.toplist.injuries.serious.caused` — players ranked by serious injuries
  inflicted. Counts `serious_injury` match events credited to the acting
  player. Supports era filtering.
- `player.toplist.injuries.serious.suffered` — players ranked by serious
  injuries suffered. Counts `serious_injury`, `niggling_injury`,
  `miss_next_game`, and any `stat_reduction_*` consequence, credited to the
  victim player. Supports era filtering.
- `player.toplist.injuries.lasting.suffered` — players ranked by lasting
  injuries suffered. Counts `niggling_injury` and any `stat_reduction_*`
  consequence (the career-spanning outcomes), credited to the victim player.
  Supports era filtering.
- `player.toplist.deaths.caused` — players ranked by opponents killed. Counts
  `death` match events credited to the acting player. Supports era filtering.
- `player.toplist.fouls.committed` — players ranked by fouls committed. Counts
  `foul` match events credited to the acting player. Supports era filtering.
- `player.toplist.sent_off` — players ranked by times sent off. Counts match
  events whose consequence is `sent_off`, credited to the sent-off player.
  Supports era filtering.

Each player listed by the thirteen `player.toplist.*` facts above also gets a
button, in the same order as the list, that opens that player's
[`/deepdive`](deepdive.md) detail view.

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
  (an ongoing era shows `present`). Each listed era also gets a button that
  opens that era's [`/deepdive`](deepdive.md) detail view (which is where a
  rules-set breakdown now lives, rather than inline on this list). Buttons are
  capped at Discord's per-message limit of 25. Does not support the `era`
  filter option (it exists to list all eras), so it is excluded from
  era-filtered runs.

The bot's startup message posts a random fact from this tree — the same
behavior as invoking `/insights` with no argument.

Leaderboards show the top five ranks; ties share a rank, so a leaderboard can
list more than five entries. If the database does not respond in time, the
command falls back to the message `I am stunned`.
