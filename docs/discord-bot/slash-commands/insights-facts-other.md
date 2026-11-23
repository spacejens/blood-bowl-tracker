# `/insights` other facts

The `stats` fact and the race, position, skill, star player, era, trophy,
competition group and date facts of [`/insights`](insights.md), which
describes how a fact path is chosen and which scope options apply.

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
  a coach's [NAF](../../glossary.md#naf) number), since those describe the coach rather than the era
  itself; Rules sets becomes the count of the era's own rules sets (not a
  name list); and Races, Positions,
  Coaches, Competitions, Teams, Players, Matches, and Match events are each
  scoped to the selected era.

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
  hired at least once (title "Star players"), name-ascending. A star position
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
league, era or match category opens an `/onthisdate` scoped the same way,
rather than an all-time one. These facts take no competition scope, so no date
button carries one. If the scoped league or era has been deleted since the
toplist was posted, the button replies with the same not-found message the
corresponding `/insights` option would.
