# `/insights`

`/insights` shares a fact drawn from a growing tree of categorized
[insights](../../glossary.md#insight) derived from the recorded game data. When
invoked, the bot replies in the same channel — most facts reply with an embedded
leaderboard.

## Argument

The command takes one optional string argument, `category`, a dotted path into
the [fact tree](../../glossary.md#fact-tree) (for example `coach.toplist.teams`):

- **No argument** — the bot picks a random fact from the whole tree.
- **A specific fact path** (e.g. `coach.toplist.matches.played`) — the bot
  returns that fact.
- **A branch path** (e.g. `coach.toplist`) — the bot picks a random fact from
  under that branch.
- **A path that matches nothing** — the bot replies with a not-found message.

As you type the argument, autocomplete suggests the next segment of valid paths
so you can navigate the tree without memorizing it.

## Scope options

Besides `category`, the command takes four optional scope options — `league`,
`era`, `competition` and `match-category`, in that drill-down order. They are
mutually exclusive: supplying more than one replies with a conflict message.
With none of them, facts are all-time and the embed title ends in
`— All time`; with one, the title ends in that league, era, competition or
match category's name instead. An era or competition is dated as well as
named — `— BB2020 (2020-01-01 – present)` — so a reader can tell whether the
scope is finished or still running; a league and a match category have no date
range of their own and appear as bare names.

`league`, `era` and `competition` autocomplete against the recorded data.
`match-category` instead offers every match category as a fixed choice, so
there is no id to mistype and no "not found" reply.

Each fact declares which of the four scopes it supports; a fact that does not
support the scope in play is skipped, and asking for it by name replies with a
per-scope refusal message. Exact per-fact scope support is declared on each
fact in `apps/discord-bot/src/insights/fact-tree.ts`. Facts whose values are
not derived from matches or match events (counts of teams, rostered players,
skills, eras, trophies, competition groups, star player hires) cannot take a
match category. Facts that count competitions played, or that total match-event
points per player, can, because those values do come from matches (see below).
`stats` is excluded deliberately: only two of the counts it reports have a
category at all, so a category-scoped `stats` would mix scoped and all-time
numbers.

Note that `coach.toplist.competitions.played` and
`team.toplist.competitions.played` change meaning under a match category: they
then count the competitions in which that coach or team actually played a
match of the chosen category (e.g. with Season Final, the seasons whose final
they reached), rather than every competition entered.

## Available facts

The exact event and consequence kinds these facts count live in the database
schema rather than here — see `packages/db/src/schema/game-data/match-events.ts`
(`actionTypeEnum` and `consequenceTypeEnum`) for the authoritative list.

- `stats` — a combined embed of entity counts (title "Statistics"): leagues,
  eras, external systems, rules sets, races, positions, coaches, competitions
  (with a season/cup breakdown), teams, players, matches, and match events.
  When an era is selected the title gains the usual `— <era>` suffix and the
  body changes: Leagues and Eras both read 1 (intentionally kept, rather than
  dropped, for a consistent line set between all-time and era-scoped output);
  External systems becomes the count of
  distinct external systems linked directly to the era whose category is an
  imported data source — excluding bookkeeping systems such as the synthetic
  `Name` system, and excluding systems only referenced through a coach (e.g.
  a coach's NAF number), since those describe the coach rather than the era
  itself; Rules sets becomes the count of the era's own rules sets (not a
  name list); and Races, Positions,
  Coaches, Competitions, Teams, Players, Matches, and Match events are each
  scoped to the selected era.
- `coach.toplist.matches.played` — coaches ranked by number of matches played.
- `coach.toplist.matches.won` — coaches ranked by number of matches won.
  Counts matches whose recorded winner is one of the coach's own teams.
- `coach.toplist.matches.lost` — coaches ranked by number of matches lost:
  matches with a recorded winner that was not one of the coach's own teams.
  Ranked most-losses-first, as its own leaderboard rather than an inverted
  wins list.
- `coach.toplist.matches.drawn` — coaches ranked by number of drawn matches
  (matches with no recorded winner).
- `coach.toplist.teams` — coaches ranked by number of teams coached.
- `coach.toplist.competitions.played` — coaches ranked by number of distinct
  competitions their teams have entered.
- `coach.toplist.eras.active` — coaches ranked by number of distinct eras their
  teams have existed across. It takes none of the scope options: scoping to a
  single era would always yield 0 or 1, so era scoping in particular makes no
  sense.
- `coach.toplist.fouls.committed` — coaches ranked by fouls committed. Counts
  foul events credited to the acting team, attributed to that team's coach.
- `coach.toplist.trophies.won` — coaches ranked by number of trophies their
  teams have won. Counts every recorded trophy award tied to any of the
  coach's teams, including player awards (MVP, most casualties, ...) won by
  one of their players, summed across all of the coach's teams. A trophy award
  is not a match event, so a match category cannot scope this count.
- `coach.toplist.timeBetweenMatches.longest.descending` — coaches ranked by the
  longest gap between two of their consecutive matches, longest first, shown in
  whole days. Coaches with fewer than two matches in scope are excluded (they
  have no gap).
- `coach.toplist.timeBetweenMatches.longest.ascending` — the same longest-gap value,
  ranked smallest first: the coaches whose longest break between matches is the
  shortest, i.e. the most consistently active ones. Same exclusions as
  above, plus a minimum of 5 matches in scope (unlike `.longest`),
  so a coach with only a couple of closely-played matches can't dominate this
  toplist.
- `coach.toplist.timeBetweenMatches.average` — coaches ranked by the average gap
  across all of their consecutive matches, smallest first, shown in whole days.
  Same exclusions as above, plus the same minimum-5-matches floor
  as `.longest.ascending`.

Each coach listed by the `coach.toplist.*` facts above also gets a
button, in the same order as the list, that opens that coach's
[`/deepdive`](deepdive.md) detail view.

- `team.toplist.matches.played` — teams ranked by number of matches played.
- `team.toplist.matches.won` — teams ranked by number of matches won. Counts
  matches whose recorded winner is that team.
- `team.toplist.matches.lost` — teams ranked by number of matches lost:
  matches with a recorded winner that was the opponent. Ranked
  most-losses-first, as its own leaderboard.
- `team.toplist.matches.drawn` — teams ranked by number of drawn matches
  (matches with no recorded winner).
- `team.toplist.competitions.played` — teams ranked by number of distinct
  competitions entered.
- `team.toplist.eras.active` — teams ranked by number of distinct eras they
  have existed across. It takes none of the scope options: scoping to a
  single era would always yield 0 or 1, so era scoping in particular makes no
  sense.
- `team.toplist.trophies.won` — teams ranked by number of trophies won. Counts
  every recorded trophy award tied to the team, including player awards (MVP,
  most casualties, ...) won by one of its players, so an unfiltered listing
  matches the trophy count on that team's own `/deepdive`. A trophy
  award is not a match event, so a match category cannot scope this count.
- `team.toplist.touchdowns.scored` — teams ranked by number of touchdowns
  scored. Counts touchdown events credited to the team.
- `team.toplist.completions` — teams ranked by number of passes completed.
  Counts completed-pass events credited to the team.
- `team.toplist.interceptions` — teams ranked by number of interceptions made.
  Counts interception events credited to the team.
- `team.toplist.deflections` — teams ranked by number of passes deflected.
  Counts pass-deflection events credited to the team.
- `team.toplist.casualties.caused` — teams ranked by casualties inflicted.
  Counts every casualty event credited to the acting team, from a plain
  knock-out through serious injuries and deaths.
- `team.toplist.casualties.suffered` — teams ranked by casualties suffered.
  Counts every match event whose consequence for the victim is a casualty of
  any severity — a plain knock-out, a serious injury, a missed next game, a
  niggling injury, a lasting characteristic reduction, or death — credited to
  the team the victim belongs to.
- `team.toplist.injuries.serious.caused` — teams ranked by serious injuries
  inflicted. Counts serious-injury events credited to the acting team.
- `team.toplist.injuries.serious.suffered` — teams ranked by serious injuries
  suffered. Counts the consequences that keep a player out of action or leave a
  mark on them — a serious injury, a missed next game, a niggling injury, or a
  lasting characteristic reduction — credited to the team the victim belongs to.
  Plain knock-outs and deaths are counted by the casualty and death facts
  instead, not here.
- `team.toplist.injuries.lasting.suffered` — teams ranked by lasting injuries
  suffered. Counts only the career-spanning consequences — a niggling injury or a
  lasting characteristic reduction — credited to the team the victim belongs to.
- `team.toplist.deaths.caused` — teams ranked by opponents killed. Counts fatal
  events credited to the acting team.
- `team.toplist.deaths.suffered` — teams ranked by players killed. Counts match
  events that killed a player, credited to the team the dead player belongs to.
- `team.toplist.fouls.committed` — teams ranked by fouls committed. Counts foul
  events credited to the acting team.
- `team.toplist.sent_off` — teams ranked by players sent off. Counts match
  events that sent a player off, credited to the team that player belongs to.
- `team.toplist.expensiveMistakes.total` — teams ranked by the total money lost
  to expensive mistakes across their history (the amounts lost are summed, not
  the events counted). Amounts render with a thousands
  separator and a `gp` suffix (e.g. `150,000 gp`).
- `team.toplist.expensiveMistakes.biggest` — individual expensive-mistake events
  ranked by amount, each row showing the losing team and the ISO `YYYY-MM-DD`
  date of the match it occurred in. A team can appear more than once.

Each team listed by the `team.toplist.*` facts above also gets a
button, in the same order as the list, that opens that team's
[`/deepdive`](deepdive.md) detail view. For the biggest-events fact, buttons are
deduplicated so a team that appears on multiple rows gets a single button.

- `player.toplist.mvps` — players ranked by number of MVP awards won. Counts MVP
  awards per player, so a player credited with more than one MVP in a single
  match has each award counted.
- `player.toplist.touchdowns.scored` — players ranked by number of touchdowns
  scored. Counts touchdown events credited to the player.
- `player.toplist.completions` — players ranked by number of passes completed.
  Counts completed-pass events credited to the player.
- `player.toplist.interceptions` — players ranked by number of interceptions
  made. Counts interception events credited to the player.
- `player.toplist.deflections` — players ranked by number of passes deflected.
  Counts pass-deflection events credited to the player.
- `player.toplist.casualties.caused` — players ranked by casualties inflicted.
  Counts every casualty event credited to the acting player, from a plain
  knock-out through serious injuries and deaths.
- `player.toplist.casualties.suffered` — players ranked by casualties suffered.
  Counts every match event whose consequence for the victim is a casualty of
  any severity — a plain knock-out, a serious injury, a missed next game, a
  niggling injury, a lasting characteristic reduction, or death — credited to
  the victim player.
- `player.toplist.injuries.serious.caused` — players ranked by serious injuries
  inflicted. Counts serious-injury events credited to the acting player.
- `player.toplist.injuries.serious.suffered` — players ranked by serious
  injuries suffered. Counts the consequences that keep a player out of action
  or leave a mark on them — a serious injury, a missed next game, a niggling
  injury, or a lasting characteristic reduction — credited to the victim player.
  Plain knock-outs and deaths are counted by the casualty and death facts
  instead, not here.
- `player.toplist.injuries.lasting.suffered` — players ranked by lasting
  injuries suffered. Counts only the career-spanning consequences — a niggling
  injury or a lasting characteristic reduction — credited to the victim player.
- `player.toplist.deaths.caused` — players ranked by opponents killed. Counts
  fatal events credited to the acting player.
- `player.toplist.fouls.committed` — players ranked by fouls committed. Counts
  foul events credited to the acting player.
- `player.toplist.sent_off` — players ranked by times sent off. Counts match
  events that sent this player off.
- `player.toplist.totalSpp` — players ranked by total star player points. For
  the unfiltered, league, and era views this is the same stored total the
  player's own [`/deepdive`](deepdive.md) shows on its
  `Total star player points:` line; a competition- or match-category-scoped
  view instead sums only the scoped match events' SPP, which omits any manual
  adjustment folded into that stored total.

Each player listed by the `player.toplist.*` facts above also gets a
button, in the same order as the list, that opens that player's
[`/deepdive`](deepdive.md) detail view.

- `race.toplist.teams.descending` — races ranked by how many teams have ever
  chosen them, most-chosen first. The count is always the race's all-time
  total across every league and era; a league or era scope instead narrows
  which races are listed at all, to the ones available in that league or era
  according to their recorded eras. A race available under the current scope
  that nobody has ever chosen is still listed, with a count of zero. Ties
  break on the race's most recent match, most-recently-played first.
- `race.toplist.teams.ascending` — the same all-time team count ranked from
  the other end: the races hardly anyone picks, least-chosen first, with any
  race nobody has ever picked heading the list at zero. Ties break the other
  way too, least-recently-played first.
- `race.toplist.matches.played` — races ranked by number of matches played by
  teams of that race. Counts one participation per participating team, so a
  match between two teams of the same race adds 2 to that race's total.
- `race.toplist.matches.won` — races ranked by number of matches won by teams
  of that race. Counts one result per participating team, so a match between
  two teams of the same race contributes one win and one loss to that race.
- `race.toplist.matches.lost` — races ranked by number of matches lost by
  teams of that race, counted the same way. Ranked most-losses-first, as its
  own leaderboard.
- `race.toplist.matches.drawn` — races ranked by number of drawn matches
  played by teams of that race. A drawn match between two teams of the same
  race adds 2 to that race's total, matching how `race.toplist.matches.played`
  counts.
- `position.toplist.players` — positions ranked by number of players who have
  held them, most first. Each row reads `<position> (<race>)`, because
  position names repeat across races — nearly every race has a "Lineman" — so
  the name alone would not say which roster a row means. Star positions are
  excluded: their availability spans every race that ever fielded them, so
  there is no single race to put in that label. Each listed position also
  gets a button that opens that position's [`/deepdive`](deepdive.md) detail
  view. League and era scopes narrow the count through the player's own team
  era — when they actually played, not when the rules made the position
  available.
- `skill.toplist.players.any` — skills ranked by how many players have them,
  most common first (title "Skills by players who have them"). Counts a skill
  however the player came by it: a starting skill from their position as
  readily as one gained through advancement. A skill that carries a variable
  attribute — Hatred's target race, say — is counted by its base skill, so
  "Hatred (Elf)" and "Hatred (Dwarf)" both count toward "Hatred", and a player
  holding both counts once. Star players are excluded: their skill sets are
  fixed and often unique to them, and each hire of a star is a separate player
  record, so one popular star would otherwise be counted once per hiring team.
  Skills have no `/deepdive` view, so rows carry no drill-down button.
  League and era scopes narrow the count through the player's own team era.
- `skill.toplist.players.advancement.any` — the same ranking narrowed to
  skills gained through advancement (title "Skills by players who gained them
  as an advancement"), so a position's starting skills are excluded. Includes
  skills recorded only as gained, without saying whether they were chosen or
  rolled, which is all some sources report. Same counting rules and scoping
  as `skill.toplist.players.any`.
- `skill.toplist.players.advancement.chosen` — narrowed further to skills the
  coach freely picked as an advancement (title "Skills by players who chose
  them as an advancement"). A skill recorded only as gained is not counted
  here, because it is not known to have been chosen. Same counting rules and
  scoping as `skill.toplist.players.any`.
- `skill.toplist.players.advancement.random` — narrowed to skills randomly
  rolled as an advancement (title "Skills by players who had them randomly
  rolled as an advancement"), counted and scoped the same way as the chosen
  list above.
- `starPlayers.list` — a single embed listing every star player that has been
  hired at least once (title "Star Players"), name-ascending. A star position
  that has never been hired has nothing to show and is excluded. Each listed
  star also gets a button that opens that star's [`/deepdive`](deepdive.md)
  detail view. It takes none of the scope options, for the same "star player
  exception" reason as `starPlayers.toplist.hires.total` below.
- `starPlayers.toplist.hires.total` — star players ranked by the total number
  of times they have been hired, across every team and every era (title "Star
  players by times hired"). Each hire is a separate signing, so a team that
  brings the same star back season after season adds one to that star's total
  each time. Each listed star also gets a button that opens that star's
  [`/deepdive`](deepdive.md) detail view, where the per-team breakdown of
  those hires lives. It takes none of the scope options: the "star player
  exception" makes every star available in essentially every era, so a scoped
  hire count would not meaningfully narrow anything.
- `starPlayers.toplist.hires.distinctTeams` — star players ranked by how many
  distinct teams have ever hired them (title "Star players by distinct teams
  hired"). Unlike `starPlayers.toplist.hires.total`, this counts breadth
  rather than frequency: a team that brings the same star back season after
  season, or across several eras, still counts once, so a star signed by many
  different front offices outranks one repeatedly re-hired by a single team.
  Each listed star also gets a button that opens that star's
  [`/deepdive`](deepdive.md) detail view, where the per-team breakdown showing
  _which_ teams those are lives. It takes none of the scope options, for the
  same "star player exception" reason as `starPlayers.toplist.hires.total`
  above.
- `eras.list` — a single embed listing every recorded era in chronological
  order by start date, regardless of league (ties broken by league, then era
  name). Each line reads `<era> (<league>): <start> – <end>`
  (an ongoing era shows `present`). Each listed era also gets a button that
  opens that era's [`/deepdive`](deepdive.md) detail view (which is where a
  rules-set breakdown now lives, rather than inline on this list). Up to 25
  eras get one button each; past that the links switch to dropdown menus
  (see [`/deepdive`](deepdive.md)), and past 125 the description ends with a
  note counting the eras left without a link. A league scope narrows
  the list to that league's eras; an era scope makes no sense because the fact
  exists to list all eras.
- `trophies.list` — a single embed listing every trophy in the curated
  catalog (title "Trophies"), ordered by the competition group or league that
  awards it and then by trophy name. Each line reads
  `<trophy> (<competition group>)` for a trophy awarded through a competition
  group, or `<trophy> (<league>)` for one the league awards directly. Each
  listed trophy also gets a button that opens that trophy's
  [`/deepdive`](deepdive.md) detail view, where its criteria and its list of
  recipients live. Up to 25 trophies get one button each; past that the links
  switch to dropdown menus (see [`/deepdive`](deepdive.md)), and past 125 the
  description ends with a note counting the trophies left without a link.
  A league scope narrows the list: a competition-group trophy is filtered
  through its group's league, and a league-direct trophy through that league
  itself. The fact exists to list the whole catalog, so narrower scopes make no
  sense.
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
  counting the groups left without a link. A league scope narrows
  the list; the fact exists to list the whole catalog, so narrower scopes make
  no sense.
- `date.toplist.matches.descending` — calendar dates (a month and a day, across
  every recorded year — the same "on this date" scoping `/onthisdate` uses)
  ranked by how many matches were played on them, busiest first. Rows read
  `<rank>. <date> — <N>`, e.g. `1. February 29 — 12`. Ties order
  chronologically, so two identical requests always render the same list.
- `date.toplist.matches.ascending` — the same match-count metric ranked from
  the other end: the quietest dates on which anything was ever played. Dates
  with no recorded match at all are absent rather than ranked zero, since the
  ranking is built from matches.
- `date.onThisDate` — an embed for today's calendar date carrying the match count
  for that month and day across every recorded year, the event breakdown, and
  the most notable players who died on it with who killed them. Always
  resolved against today, because the phrase means nothing relative to any
  other moment. Available for any date through the
  [`/onthisdate`](on-this-date.md) command. See
  [On this date](../../insights/on-this-date.md) for the underlying rules.

Each date listed by the `date.toplist.*` facts also gets a button, in the
same order as the list, that opens that date's
[`/onthisdate`](on-this-date.md) view. Unlike every other drill-down button,
these carry the toplist's own scope: clicking a row on a toplist scoped to one
league, era, competition or match category opens an `/onthisdate` scoped the
same way, rather than an all-time one. If the scoped league, era or competition
has been deleted since the toplist was posted, the button replies with the same
not-found message the corresponding `/insights` option would.

The bot's startup message carries only the deployment embed; it does not
post a fact from this tree.

Leaderboards show the top five ranks; ties share a rank, so a leaderboard can
list more than five entries. If the database does not respond in time, the
command falls back to a themed timeout message.
