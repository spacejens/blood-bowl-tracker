# `/insights` team facts

The `team.toplist.*` facts of [`/insights`](insights.md), which describes
how a fact path is chosen and which scope options apply.

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
- `team.toplist.touchdowns.average.scored.descending` — teams ranked by
  average touchdowns scored per match, highest first. Every team per-match
  average fact (`team.toplist.*.average.*`) is shown to two decimals
  (`3.42 per match`) and ranks only teams with at least 5 matches in scope,
  so one lucky match cannot top the list. They take the league, era and
  match-category scopes but not competition, like matches played. See
  [Per-match averages](../../insights/per-match-averages.md).
- `team.toplist.touchdowns.average.scored.ascending` — the same average,
  lowest first. Same 5-match floor and scopes.
- `team.toplist.touchdowns.average.conceded.descending` — teams ranked by
  average touchdowns scored against them per match, highest first. Every
  other side of a match counts, so in a four-team merged final all three
  opponents' touchdowns are conceded. Same 5-match floor and scopes.
- `team.toplist.touchdowns.average.conceded.ascending` — the same conceded
  average, lowest first. Same 5-match floor and scopes.
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
- `team.toplist.casualties.average.caused.descending` — teams ranked by
  average casualties inflicted per match, highest first. Counts the same
  casualties as `team.toplist.casualties.caused`. Same 5-match floor and
  scopes.
- `team.toplist.casualties.average.caused.ascending` — the same average,
  lowest first. Same 5-match floor and scopes.
- `team.toplist.casualties.average.suffered.descending` — teams ranked by
  average casualties suffered per match, highest first. Counts the same
  casualties as `team.toplist.casualties.suffered`. Same 5-match floor and
  scopes.
- `team.toplist.casualties.average.suffered.ascending` — the same average,
  lowest first. Same 5-match floor and scopes.
- `team.toplist.injuries.serious.caused` — teams ranked by serious injuries
  inflicted. Counts serious-injury events credited to the acting team.
- `team.toplist.injuries.serious.suffered` — teams ranked by serious injuries
  suffered. Counts the consequences that keep a player out of action or leave a
  mark on them — a serious injury, a missed next game, a niggling injury, or a
  lasting characteristic reduction — credited to the team the victim belongs to.
  Plain knock-outs and deaths are counted by the casualty and death facts
  instead, not here.
- `team.toplist.injuries.serious.average.caused.descending` — teams ranked
  by average serious injuries inflicted per match, highest first. Counts the
  same events as `team.toplist.injuries.serious.caused`. Same 5-match floor
  and scopes.
- `team.toplist.injuries.serious.average.caused.ascending` — the same
  average, lowest first. Same 5-match floor and scopes.
- `team.toplist.injuries.serious.average.suffered.descending` — teams ranked
  by average serious injuries suffered per match, highest first. Counts the
  same consequences as `team.toplist.injuries.serious.suffered`. Same 5-match
  floor and scopes.
- `team.toplist.injuries.serious.average.suffered.ascending` — the same
  average, lowest first. Same 5-match floor and scopes.
- `team.toplist.injuries.lasting.caused` — teams ranked by lasting injuries
  inflicted. Counts casualty events credited to the acting team whose outcome,
  on the same event, is a niggling injury or a lasting characteristic
  reduction. A foul that leaves a lasting injury does not count, nor does one
  with no recorded causer, so across all teams this is usually lower than
  lasting injuries suffered (see
  [lasting injuries caused](../../insights/match-event-counts.md#lasting-injuries-caused)).
- `team.toplist.injuries.lasting.average.caused.descending` — teams ranked by
  average lasting injuries inflicted per match, highest first. Counts the same
  events as `team.toplist.injuries.lasting.caused`. Same 5-match floor and
  scopes.
- `team.toplist.injuries.lasting.average.caused.ascending` — the same average,
  lowest first. Same 5-match floor and scopes.
- `team.toplist.injuries.lasting.suffered` — teams ranked by lasting injuries
  suffered. Counts only the career-spanning consequences — a niggling injury or a
  lasting characteristic reduction — credited to the team the victim belongs to.
- `team.toplist.injuries.lasting.average.suffered.descending` — teams ranked
  by average lasting injuries suffered per match, highest first. Counts the
  same consequences as `team.toplist.injuries.lasting.suffered`. Same 5-match
  floor and scopes.
- `team.toplist.injuries.lasting.average.suffered.ascending` — the same
  average, lowest first. Same 5-match floor and scopes.
- `team.toplist.deaths.caused` — teams ranked by opponents killed. Counts fatal
  events credited to the acting team.
- `team.toplist.deaths.suffered` — teams ranked by players killed. Counts match
  events that killed a player, credited to the team the dead player belongs to.
- `team.toplist.deaths.average.caused.descending` — teams ranked by average
  opponents killed per match, highest first. Counts the same events as
  `team.toplist.deaths.caused`. Same 5-match floor and scopes.
- `team.toplist.deaths.average.caused.ascending` — the same average, lowest
  first. Same 5-match floor and scopes.
- `team.toplist.deaths.average.suffered.descending` — teams ranked by average
  deaths suffered per match, highest first. Counts the same events as
  `team.toplist.deaths.suffered`. Same 5-match floor and scopes.
- `team.toplist.deaths.average.suffered.ascending` — the same average, lowest
  first. Same 5-match floor and scopes.
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
