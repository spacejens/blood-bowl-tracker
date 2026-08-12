# Match event counts

Counts of [match events](../glossary.md#match-event) grouped by player, by team, or by coach,
backing the `/insights` top lists.

Every such count is the same query shaped by three inputs: the **role** the counted entity played in
the event (the acting side or the consequence side), the **set of event types** that count, and the
**grouping entity** (player, team, or coach). Role and join columns co-vary: an acting-role count
joins through the acting columns, a consequence-role count through the consequence columns.

## The player/team grid is deliberately incomplete

Not every count exists for both grouping entities, and that is by design — not an oversight:

- Deaths **suffered** are counted by team but not by player. A player who dies is dead; a per-player
  top list of deaths suffered would be a list of ones.
- MVP awards are counted by player but not by team. The award is a per-player honour; totalling it
  per team measures matches played, not merit.
- Fouls committed are additionally counted by **coach** (`countMatchEventsByCoach`, the per-team join
  graph plus a `teams.coachId -> coaches.id` hop). It is the only coach-grouped count today: coaches
  are ranked on fouls because someone wanted to read that list, not because every player/team count
  needs a coach twin. The coach grouping is also league/era-scoped only — coach toplists take no
  competition scope.

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

## Total SPP: one toplist, two calculations

The player toplist ranking by total
[Star Player Points](../glossary.md#star-player-points-spp) is the one
`/insights` query whose meaning changes with its scope, because SPP has two
sources: a player's stored career total, which already folds in any
adjustment recorded outside match events, and the sum of the SPP awarded by
that player's own events.

- **All-time, league, or era scope:** ranks by the stored career total,
  including adjustments. A player qualifies for a league/era-scoped list
  through the [team era](../glossary.md#team-era) their own player record
  belongs to — never through a match they played. A player with no stored
  total is excluded.
- **Competition or match-category scope:** these are narrower than an era,
  and an adjustment's originating match is unknown, so it cannot be
  attributed to a competition or category. This scope instead sums the SPP
  earned by that player's own events within the scope, across every event
  type that awards SPP rather than one fixed set. A player whose scoped sum
  is zero is excluded, for the same "nothing to rank" reason as the
  no-stored-total case above.

The `/insights` command only ever resolves a single league, era, competition,
or match category for one request, so the choice between the two
calculations above is a plain two-way branch — never a blend of more than
one scope at once.
