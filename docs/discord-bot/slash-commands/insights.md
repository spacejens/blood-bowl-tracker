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

## Scope options

Besides `category`, the command takes four optional scope options — `league`,
`era`, `competition` and `match-category`, in that drill-down order. They are
mutually exclusive: supplying more than one replies `The referee rejects your
request.` With none of them, facts are all-time and the embed title ends in
`— All time`; with one, the title ends in that league, era, competition or
match category's name instead.

`league`, `era` and `competition` autocomplete against the recorded data.
`match-category` instead offers the six fixed match categories as a static
choice list — Normal, Cup Final, Season Semi Final, Season Final, Season
Bronze and Season Qualifier — so there is no id to mistype and no "not found"
reply.

Each fact declares which of the four scopes it supports; a fact that supports
none of them is skipped when that scope is in play, and asking for it by name
replies with a per-scope refusal message. All but twelve facts support
`match-category`. The exceptions are `coach.toplist.teams`,
`race.toplist.teams`, `coach.toplist.eras.active`, `team.toplist.eras.active`,
`team.toplist.trophies.won`, `eras.list`, `trophies.list`,
`competitionGroups.list`, `starPlayers.list`,
`starPlayers.toplist.hires.total` and
`starPlayers.toplist.hires.distinctTeams` — which list or count teams, eras,
trophies, trophy awards, competition groups or star player hires rather than
matches —
and `stats`, which is excluded deliberately: only two of the dozen counts it
reports (matches and match events) have a category at all, so a
category-scoped `stats` would show two scoped numbers beside ten all-time
ones.

Note that `coach.toplist.competitions.played` and
`team.toplist.competitions.played` change meaning under a match category: they
then count the competitions in which that coach or team actually played a
match of the chosen category (e.g. with Season Final, the seasons whose final
they reached), rather than every competition entered.

## Available facts

- `stats` — a combined embed of entity counts (title "Statistics"): leagues,
  eras, external systems, rules sets, races, positions, coaches, competitions
  (with a season/cup breakdown), teams, players, matches, and match events.
  Supports league, era and competition filtering. When an era is selected the
  title gains the usual `— <era>` suffix and the body changes: Leagues and Eras
  both read 1
  (intentionally kept, rather than dropped, for a consistent line set between
  all-time and era-scoped output); External systems becomes the count of
  distinct external systems linked directly to the era whose category is an
  imported data source — excluding bookkeeping systems such as the synthetic
  `Name` system, and excluding systems only referenced through a coach (e.g.
  a coach's NAF number), since those describe the coach rather than the era
  itself; Rules sets becomes the count of the era's own rules sets (not a
  name list); and Races, Positions,
  Coaches, Competitions, Teams, Players, Matches, and Match events are each
  scoped to the selected era.
- `coach.toplist.matches.played` — coaches ranked by number of matches played.
  Supports league, era and match-category filtering, but not competition
  filtering (like the other `coach.toplist.*` facts).
- `coach.toplist.matches.won` — coaches ranked by number of matches won.
  Counts matches whose recorded winner is one of the coach's own teams.
  Supports league, era and match-category filtering, but not competition
  filtering (like the other `coach.toplist.*` facts).
- `coach.toplist.matches.lost` — coaches ranked by number of matches lost:
  matches with a recorded winner that was not one of the coach's own teams.
  Ranked most-losses-first, as its own leaderboard rather than an inverted
  wins list. Same filtering as above.
- `coach.toplist.matches.drawn` — coaches ranked by number of drawn matches
  (matches with no recorded winner). Same filtering as above.
- `coach.toplist.teams` — coaches ranked by number of teams coached. Supports
  league and era filtering, but not competition or match-category filtering.
- `coach.toplist.competitions.played` — coaches ranked by number of distinct
  competitions their teams have entered. Supports league, era and
  match-category filtering, but not competition filtering (like the other
  `coach.toplist.*` facts).
- `coach.toplist.eras.active` — coaches ranked by number of distinct eras their
  teams have existed across. Supports none of the four scope options — scoping
  to a single era would always yield 0 or 1, so era filtering in particular is
  excluded outright.
- `coach.toplist.fouls.committed` — coaches ranked by fouls committed. Counts
  `foul` match events credited to the acting team, attributed to that team's
  coach. Supports league, era and match-category filtering, but not competition
  filtering (like the other `coach.toplist.*` facts).
- `coach.toplist.timeBetweenMatches.longest.descending` — coaches ranked by the
  longest gap between two of their consecutive matches, longest first, shown in
  whole days. Coaches with fewer than two matches in scope are excluded (they
  have no gap). Supports league, era and match-category filtering, but not
  competition filtering (like the other `coach.toplist.*` facts).
- `coach.toplist.timeBetweenMatches.longest.ascending` — the same longest-gap value,
  ranked smallest first: the coaches whose longest break between matches is the
  shortest, i.e. the most consistently active ones. Same exclusions and
  filtering as above, plus a minimum of 5 matches in scope (unlike `.longest`),
  so a coach with only a couple of closely-played matches can't dominate this
  toplist.
- `coach.toplist.timeBetweenMatches.average` — coaches ranked by the average gap
  across all of their consecutive matches, smallest first, shown in whole days.
  Same exclusions and filtering as above, plus the same minimum-5-matches floor
  as `.longest.ascending`.

Each coach listed by the eleven `coach.toplist.*` facts above also gets a
button, in the same order as the list, that opens that coach's
[`/deepdive`](deepdive.md) detail view.

- `team.toplist.matches.played` — teams ranked by number of matches played.
  Supports league, era and match-category filtering, but not competition
  filtering.
- `team.toplist.matches.won` — teams ranked by number of matches won. Counts
  matches whose recorded winner is that team. Supports league, era and
  match-category filtering, but not competition filtering.
- `team.toplist.matches.lost` — teams ranked by number of matches lost:
  matches with a recorded winner that was the opponent. Ranked
  most-losses-first, as its own leaderboard. Same filtering as above.
- `team.toplist.matches.drawn` — teams ranked by number of drawn matches
  (matches with no recorded winner). Same filtering as above.
- `team.toplist.competitions.played` — teams ranked by number of distinct
  competitions entered. Supports league, era and match-category filtering, but
  not competition filtering.
- `team.toplist.eras.active` — teams ranked by number of distinct eras they
  have existed across. Supports none of the four scope options — scoping to a
  single era would always yield 0 or 1, so era filtering in particular is
  excluded outright.
- `team.toplist.trophies.won` — teams ranked by number of trophies won. Counts
  every recorded trophy award tied to the team, including player awards (MVP,
  most casualties, ...) won by one of its players, so an unfiltered listing
  matches the trophy count on that team's own `/deepdive`. Supports league,
  era and competition filtering, but not match-category filtering: a trophy
  award is not a match event, so it has no category.
- `team.toplist.touchdowns.scored` — teams ranked by number of touchdowns
  scored. Counts raw `touchdown` match events credited to the team. Supports
  league, era, competition and match-category filtering.
- `team.toplist.completions` — teams ranked by number of passes completed.
  Counts raw `completion` match events credited to the team. Supports league,
  era, competition and match-category filtering.
- `team.toplist.interceptions` — teams ranked by number of interceptions made.
  Counts raw `interception` match events credited to the team. Supports league,
  era, competition and match-category filtering.
- `team.toplist.deflections` — teams ranked by number of passes deflected.
  Counts raw `deflection` match events credited to the team. Supports league,
  era, competition and match-category filtering.
- `team.toplist.casualties.caused` — teams ranked by casualties inflicted.
  Counts `casualty`, `badly_hurt`, `serious_injury`, and `death` match events
  credited to the acting team. Supports league, era, competition and
  match-category filtering.
- `team.toplist.casualties.suffered` — teams ranked by casualties suffered.
  Counts match events whose consequence is `casualty`, `badly_hurt`, `death`,
  `serious_injury`, `niggling_injury`, `miss_next_game`, or any
  `stat_reduction_*`, credited to the team the victim belongs to. Supports
  league, era, competition and match-category filtering.
- `team.toplist.injuries.serious.caused` — teams ranked by serious injuries
  inflicted. Counts `serious_injury` match events credited to the acting team.
  Supports league, era, competition and match-category filtering.
- `team.toplist.injuries.serious.suffered` — teams ranked by serious injuries
  suffered. Counts `serious_injury`, `niggling_injury`, `miss_next_game`, and
  any `stat_reduction_*` consequence, credited to the team the victim belongs
  to. Supports league, era, competition and match-category filtering.
- `team.toplist.injuries.lasting.suffered` — teams ranked by lasting injuries
  suffered. Counts `niggling_injury` and any `stat_reduction_*` consequence
  (the career-spanning outcomes), credited to the team the victim belongs to.
  Supports league, era, competition and match-category filtering.
- `team.toplist.deaths.caused` — teams ranked by opponents killed. Counts
  `death` match events credited to the acting team. Supports league, era,
  competition and match-category filtering.
- `team.toplist.deaths.suffered` — teams ranked by players killed. Counts match
  events whose consequence is `death`, credited to the team the dead player
  belongs to. Supports league, era, competition and match-category filtering.
- `team.toplist.fouls.committed` — teams ranked by fouls committed. Counts
  `foul` match events credited to the acting team. Supports league, era,
  competition and match-category filtering.
- `team.toplist.sent_off` — teams ranked by players sent off. Counts match
  events whose consequence is `sent_off`, credited to the team the sent-off
  player belongs to. Supports league, era, competition and match-category
  filtering.
- `team.toplist.expensiveMistakes.total` — teams ranked by the total money lost
  to expensive mistakes across their history (summed `expensive_mistake`
  consequence amounts, not event count). Amounts render with a thousands
  separator and a `gp` suffix (e.g. `150,000 gp`). Supports league, era,
  competition and match-category filtering.
- `team.toplist.expensiveMistakes.biggest` — individual expensive-mistake events
  ranked by amount, each row showing the losing team and the ISO `YYYY-MM-DD`
  date of the match it occurred in. A team can appear more than once. Supports
  league, era, competition and match-category filtering.

Each team listed by the twenty-two `team.toplist.*` facts above also gets a
button, in the same order as the list, that opens that team's
[`/deepdive`](deepdive.md) detail view. For the biggest-events fact, buttons are
deduplicated so a team that appears on multiple rows gets a single button.

- `player.toplist.mvps` — players ranked by number of MVP awards won.
  Counts raw `mvp_award` match events per player, so a player credited with
  more than one MVP in a single match has each award counted. Supports league,
  era, competition and match-category filtering.
- `player.toplist.touchdowns.scored` — players ranked by number of touchdowns
  scored. Counts raw `touchdown` match events credited to the player. Supports
  league, era, competition and match-category filtering.
- `player.toplist.completions` — players ranked by number of passes completed.
  Counts raw `completion` match events credited to the player. Supports league,
  era, competition and match-category filtering.
- `player.toplist.interceptions` — players ranked by number of interceptions
  made. Counts raw `interception` match events credited to the player. Supports
  league, era, competition and match-category filtering.
- `player.toplist.deflections` — players ranked by number of passes deflected.
  Counts raw `deflection` match events credited to the player. Supports league,
  era, competition and match-category filtering.
- `player.toplist.casualties.caused` — players ranked by casualties inflicted.
  Counts `casualty`, `badly_hurt`, `serious_injury`, and `death` match events
  credited to the acting player. Supports league, era, competition and
  match-category filtering.
- `player.toplist.casualties.suffered` — players ranked by casualties suffered.
  Counts match events whose consequence is `casualty`, `badly_hurt`, `death`,
  `serious_injury`, `niggling_injury`, `miss_next_game`, or any
  `stat_reduction_*`, credited to the victim player. Supports league, era,
  competition and match-category filtering.
- `player.toplist.injuries.serious.caused` — players ranked by serious injuries
  inflicted. Counts `serious_injury` match events credited to the acting
  player. Supports league, era, competition and match-category filtering.
- `player.toplist.injuries.serious.suffered` — players ranked by serious
  injuries suffered. Counts `serious_injury`, `niggling_injury`,
  `miss_next_game`, and any `stat_reduction_*` consequence, credited to the
  victim player. Supports league, era, competition and match-category
  filtering.
- `player.toplist.injuries.lasting.suffered` — players ranked by lasting
  injuries suffered. Counts `niggling_injury` and any `stat_reduction_*`
  consequence (the career-spanning outcomes), credited to the victim player.
  Supports league, era, competition and match-category filtering.
- `player.toplist.deaths.caused` — players ranked by opponents killed. Counts
  `death` match events credited to the acting player. Supports league, era,
  competition and match-category filtering.
- `player.toplist.fouls.committed` — players ranked by fouls committed. Counts
  `foul` match events credited to the acting player. Supports league, era,
  competition and match-category filtering.
- `player.toplist.sent_off` — players ranked by times sent off. Counts match
  events whose consequence is `sent_off`, credited to the sent-off player.
  Supports league, era, competition and match-category filtering.
- `player.toplist.totalSpp` — players ranked by total star player points, the
  same total the player's own [`/deepdive`](deepdive.md) shows on its
  `Total star player points:` line. Supports league, era, competition and
  match-category filtering.

Each player listed by the fourteen `player.toplist.*` facts above also gets a
button, in the same order as the list, that opens that player's
[`/deepdive`](deepdive.md) detail view.

- `race.toplist.teams` — races ranked by number of teams that have chosen
  them. Supports league and era filtering (an era scopes the count to teams
  active in that era).
- `race.toplist.matches.played` — races ranked by number of matches played by
  teams of that race. Counts one participation per participating team, so a
  match between two teams of the same race adds 2 to that race's total.
  Supports league, era and match-category filtering.
- `race.toplist.matches.won` — races ranked by number of matches won by teams
  of that race. Counts one result per participating team, so a match between
  two teams of the same race contributes one win and one loss to that race.
  Supports league, era and match-category filtering.
- `race.toplist.matches.lost` — races ranked by number of matches lost by
  teams of that race, counted the same way. Ranked most-losses-first, as its
  own leaderboard. Same filtering as `race.toplist.matches.played`.
- `race.toplist.matches.drawn` — races ranked by number of drawn matches
  played by teams of that race. A drawn match between two teams of the same
  race adds 2 to that race's total, matching how `race.toplist.matches.played`
  counts. Same filtering as `race.toplist.matches.played`.
- `starPlayers.list` — a single embed listing every star player that has been
  hired at least once (title "Star Players"), name-ascending. A star position
  that has never been hired has nothing to show and is excluded. Each listed
  star also gets a button that opens that star's [`/deepdive`](deepdive.md)
  detail view. Supports none of the `league`, `era`, `competition` or
  `match-category` filter options, for the same "star player exception"
  reason as `starPlayers.toplist.hires.total` below, so it is excluded from
  every filtered run.
- `starPlayers.toplist.hires.total` — star players ranked by the total number
  of times they have been hired, across every team and every era (title "Star
  players by times hired"). Each hire is a separate signing, so a team that
  brings the same star back season after season adds one to that star's total
  each time. Each listed star also gets a button that opens that star's
  [`/deepdive`](deepdive.md) detail view, where the per-team breakdown of
  those hires lives. Supports none of the `league`, `era`, `competition` or
  `match-category` filter options: the "star player exception" makes every
  star available in essentially every era, so a scoped hire count would not
  meaningfully narrow anything. It is therefore excluded from every filtered
  run.
- `starPlayers.toplist.hires.distinctTeams` — star players ranked by how many
  distinct teams have ever hired them (title "Star players by distinct teams
  hired"). Unlike `starPlayers.toplist.hires.total`, this counts breadth
  rather than frequency: a team that brings the same star back season after
  season, or across several eras, still counts once, so a star signed by many
  different front offices outranks one repeatedly re-hired by a single team.
  Each listed star also gets a button that opens that star's
  [`/deepdive`](deepdive.md) detail view, where the per-team breakdown showing
  _which_ teams those are lives. Supports none of the `league`, `era`,
  `competition` or `match-category` filter options, for the same "star player
  exception" reason as `starPlayers.toplist.hires.total` above, so it is
  excluded from every filtered run.
- `eras.list` — a single embed listing every recorded era in chronological
  order by start date, regardless of league (ties broken by league, then era
  name). Each line reads `<era> (<league>): <start> – <end>`
  (an ongoing era shows `present`). Each listed era also gets a button that
  opens that era's [`/deepdive`](deepdive.md) detail view (which is where a
  rules-set breakdown now lives, rather than inline on this list). Up to 25
  eras get one button each; past that the links switch to dropdown menus
  (see [`/deepdive`](deepdive.md)), and past 125 the description ends with a
  note counting the eras left without a link. Supports league filtering
  (narrowing the list to one league's eras). Does not support the `era`,
  `competition` or `match-category` filter options (`era` in particular
  because it exists to list all eras), so it is excluded from runs scoped by
  those.
- `trophies.list` — a single embed listing every trophy in the curated
  catalog (title "Trophies"), ordered by the competition group that awards it
  and then by trophy name. Each line reads `<trophy> (<competition group>)`.
  Each listed trophy also gets a button that opens that trophy's
  [`/deepdive`](deepdive.md) detail view, where its criteria and its list of
  recipients live. Up to 25 trophies get one button each; past that the links
  switch to dropdown menus (see [`/deepdive`](deepdive.md)), and past 125 the
  description ends with a note counting the trophies left without a link.
  Supports league filtering — a trophy has no league of its own, so the filter
  goes through its competition group's league. Does not support the `era`,
  `competition` or `match-category` filter options (it exists to list the whole
  catalog), so it is excluded from runs scoped by those.
- `competitionGroups.list` — a single embed listing every recurring
  competition group in the catalog (title "Competition groups"), ordered by
  league and then by group name. Each line reads
  `<group> (<league>): <N> competition(s)`, where the count is how many
  competitions belong to that group (a group with none yet shows `0
competitions`). Each listed group also gets a button that opens that
  group's [`/deepdive`](deepdive.md) detail view, where its trophies and
  every instance of the competition live. Up to 25 groups get one button
  each; past that the links switch to dropdown menus (see
  [`/deepdive`](deepdive.md)), and past 125 the description ends with a note
  counting the groups left without a link. Supports league filtering. Does
  not support the `era`, `competition` or `match-category` filter options (it
  exists to list the whole catalog), so it is excluded from runs scoped by
  those.

The bot's startup message posts a random fact from this tree — the same
behavior as invoking `/insights` with no argument.

Leaderboards show the top five ranks; ties share a rank, so a leaderboard can
list more than five entries. If the database does not respond in time, the
command falls back to the message `I am stunned`.
