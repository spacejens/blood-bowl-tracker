# `/insights` player facts

The `player.toplist.*` facts of [`/insights`](insights.md), which describes
how a fact path is chosen and which scope options apply.

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
  `Total SPP:` line; a competition- or match-category-scoped
  view instead sums only the scoped match events' SPP, which omits any manual
  adjustment folded into that stored total.
- `player.toplist.trophies.won` — players ranked by number of trophies won.
  Counts only player-level trophy awards (MVP, most casualties, ...) credited
  to the player; team-level trophies are never counted toward any player. A
  trophy award is not a match event, so a match category cannot scope this
  count.

Each player listed by the `player.toplist.*` facts above also gets a
button, in the same order as the list, that opens that player's
[`/deepdive`](deepdive.md) detail view.
