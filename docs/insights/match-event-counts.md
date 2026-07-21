# Match event counts

Counts of [match events](../glossary.md#match-event) grouped by player or by team, backing the
`/insights` top lists.

Every such count is the same query shaped by three inputs: the **role** the counted entity played in
the event (the acting side or the consequence side), the **set of event types** that count, and the
**grouping entity** (player or team). Role and join columns co-vary: an acting-role count joins
through the acting columns, a consequence-role count through the consequence columns.

## The player/team grid is deliberately incomplete

Not every count exists for both grouping entities, and that is by design — not an oversight:

- Deaths **suffered** are counted by team but not by player. A player who dies is dead; a per-player
  top list of deaths suffered would be a list of ones.
- MVP awards are counted by player but not by team. The award is a per-player honour; totalling it
  per team measures matches played, not merit.

The shared count helper makes filling in the grid mechanically trivial. Do not. A count exists
because someone wants to read it, not because the grid has a hole.

## Expensive-mistake money queries

Two `/insights` team toplists rank money rather than counting events, but reuse
the same consequence-side join graph (`matchEvents → matchTeams → matches →
teamEras → teams`, filtered to `consequenceType = 'expensive_mistake'`):

- **Total lost per team** sums `matchEvents.expensiveMistake` grouped by team.
- **Biggest individual events** returns one row per event (no grouping), each
  labelled with the team and the match's `playedAt` date, ordered by amount.

Both return the full matching row set (no `LIMIT`); the application layer ranks
and truncates via `topRanksWithTies`, exactly as the count toplists do.
