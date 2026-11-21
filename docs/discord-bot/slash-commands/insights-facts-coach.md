# `/insights` coach facts

The `coach.toplist.*` facts of [`/insights`](insights.md), which describes
how a fact path is chosen and which scope options apply.

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
- `coach.toplist.touchdowns.scored` — coaches ranked by touchdowns scored.
  Counts touchdown events credited to the acting team, summed over every team
  the coach has coached.
- `coach.toplist.completions` — coaches ranked by passes completed, counted the
  same way.
- `coach.toplist.interceptions` — coaches ranked by interceptions made, counted
  the same way.
- `coach.toplist.deflections` — coaches ranked by passes deflected, counted the
  same way.
- `coach.toplist.casualties.caused` — coaches ranked by casualties inflicted.
  Counts the same events as `team.toplist.casualties.caused` (a foul earns no
  casualty credit), summed over every team the coach has coached.
- `coach.toplist.injuries.serious.caused` — coaches ranked by serious injuries
  inflicted, counted the same way as `team.toplist.injuries.serious.caused`.
- `coach.toplist.injuries.lasting.caused` — coaches ranked by lasting injuries
  inflicted, counted the same way as `team.toplist.injuries.lasting.caused`.
- `coach.toplist.deaths.caused` — coaches ranked by opponents killed, counted
  the same way as `team.toplist.deaths.caused`.
- `coach.toplist.casualties.suffered` — coaches ranked by casualties suffered,
  counted as `team.toplist.casualties.suffered` and summed over their teams.
- `coach.toplist.injuries.serious.suffered` — coaches ranked by serious injuries
  suffered, counted the same way as `team.toplist.injuries.serious.suffered`.
- `coach.toplist.injuries.lasting.suffered` — coaches ranked by lasting injuries
  suffered, counted the same way as `team.toplist.injuries.lasting.suffered`.
- `coach.toplist.deaths.suffered` — coaches ranked by their own players killed,
  counted the same way as `team.toplist.deaths.suffered`.
- `coach.toplist.casualties.average.caused.descending` — coaches ranked by
  average casualties caused per match, highest first. Every coach per-match
  average fact (`coach.toplist.*.average.*`) spans all of the coach's teams:
  their events are summed and divided by the distinct matches any of those
  teams played, so a match between two of the coach's own teams counts once,
  with both sides' events. They count the same events as the matching
  `team.toplist.*.average.*` fact, are shown to two decimals
  (`3.42 per match`), rank only coaches with at least 5 matches in scope, and
  take the league, era and match-category scopes but not competition. See
  [Per-match averages](../../insights/per-match-averages.md).
- `coach.toplist.casualties.average.caused.ascending` — the same average,
  lowest first.
- `coach.toplist.casualties.average.suffered.descending` — coaches ranked by
  average casualties suffered per match, highest first.
- `coach.toplist.casualties.average.suffered.ascending` — the same average,
  lowest first.
- `coach.toplist.injuries.serious.average.caused.descending` — coaches ranked
  by average serious injuries caused per match, highest first.
- `coach.toplist.injuries.serious.average.caused.ascending` — the same
  average, lowest first.
- `coach.toplist.injuries.serious.average.suffered.descending` — coaches
  ranked by average serious injuries suffered per match, highest first.
- `coach.toplist.injuries.serious.average.suffered.ascending` — the same
  average, lowest first.
- `coach.toplist.injuries.lasting.average.caused.descending` — coaches ranked
  by average lasting injuries caused per match, highest first.
- `coach.toplist.injuries.lasting.average.caused.ascending` — the same
  average, lowest first.
- `coach.toplist.injuries.lasting.average.suffered.descending` — coaches
  ranked by average lasting injuries suffered per match, highest first.
- `coach.toplist.injuries.lasting.average.suffered.ascending` — the same
  average, lowest first.
- `coach.toplist.deaths.average.caused.descending` — coaches ranked by average
  opponents killed per match, highest first.
- `coach.toplist.deaths.average.caused.ascending` — the same average, lowest
  first.
- `coach.toplist.deaths.average.suffered.descending` — coaches ranked by
  average deaths suffered per match, highest first.
- `coach.toplist.deaths.average.suffered.ascending` — the same average, lowest
  first.
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
