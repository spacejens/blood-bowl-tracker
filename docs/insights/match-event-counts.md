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

The player toplist ranking by total Star Player Points is the one `/insights`
query whose meaning changes with its scope, because SPP has two sources: a
player's stored career total (`players.spp_total`, which already folds in any
manual adjustment recorded outside match events — see the `players.spp_total`
and `players.spp_adjustment` column comments in
`packages/db/src/schema/players.ts` for how each source computes it) and the
sum of per-event awards (`match_events.spp_value`).

- **All-time, league, or era scope:** ranks by the stored `players.spp_total`,
  including adjustments. A player qualifies for a league/era-scoped list
  through their own `players.team_era_id` — never through a match they
  played — so no match-event join is involved. A player with no stored total
  (`NULL`) is excluded.
- **Competition or match-category scope:** these are narrower than an era,
  and an adjustment's originating match is unknown, so it cannot be
  attributed to a competition or category. This scope instead sums
  `match_events.spp_value` for the acting player over the usual
  scope-narrowed join, with no restriction to a fixed set of event types —
  SPP is awarded across many action types, not one selector's worth. A
  player whose scoped sum is zero is excluded, for the same "nothing to
  rank" reason as the `NULL`-total case above.

`FactScope`'s fields are mutually exclusive, so the choice between the two
calculations is a plain two-way branch on whether a competition or match
category is set — never a blend of both.
