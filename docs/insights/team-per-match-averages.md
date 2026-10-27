# Team per-match averages

Per-match averages per team, backing the `/insights` team average top lists
(see [`/insights`](../discord-bot/slash-commands/insights.md)). Today these
are average touchdowns scored and conceded, casualties caused and suffered,
serious injuries caused and suffered, lasting injuries caused and suffered,
and deaths caused and suffered, per match.

Every such average is the same query, shaped by one input: the **per-side
value** summed for each match the team played. The query divides that sum by
the team's number of distinct matches in scope. For the exact query, see
`packages/game-data/src/teams/team-average-statistics.service.ts`.

## Per-side values

- **Touchdowns scored** — the team's own final score for the match
  (`match_teams.score`, the per-side touchdown count stored at import).
- **Touchdowns conceded** — the summed final score of every _other_ side of
  the same match. A normal match has one opponent; a four-team merged final
  has three, and all of their touchdowns count as conceded.
- **Casualties, injuries and deaths** — the number of this side's match events
  of the right types. `match_events` is counted once per query into a
  pre-aggregated table of per-side counts, which is left-joined onto each
  side. Caused measures count events the team's players acted in
  (`acting_match_team_id` and `action_type`); suffered measures count events
  whose victim belongs to the team (`consequence_match_team_id` and
  `consequence_type`). Lasting injuries caused also filters
  `consequence_type` on the same row as the action (see
  [lasting injuries caused](match-event-counts.md#lasting-injuries-caused)).
  The type sets are the ones the total-based team
  toplists use, so an average times the matches played matches the
  total-based figure up to rounding, over the same league, era and match
  category scope (the averages ignore competition scope):
  - casualties caused: any casualty severity; a foul that injures does not
    count, as Blood Bowl awards no casualty credit for a foul;
  - serious injuries caused: serious-injury actions;
  - casualties suffered: any casualty consequence, from a plain knock-out
    through lasting injuries to death;
  - serious injuries suffered: consequences that outlast the match;
  - lasting injuries caused: any casualty action whose own row carries a
    niggling injury or characteristic reduction; a foul does not count,
    nor does an injury with no causer;
  - lasting injuries suffered: niggling injuries and characteristic
    reductions;
  - deaths caused: death actions; like casualties caused, a foul that kills
    does not count;
  - deaths suffered: death consequences, however the player died, fouls
    included.

A match where the team recorded no such event counts as zero, so it still
counts towards the matches played.

A new average adds only its per-side value (and, for event counts, the
per-side join that value reads from); the division, floor, rounding, ordering
and scope stay shared.

## Minimum matches

A team is ranked only once it has at least 5 matches in scope
(`MIN_MATCHES_FOR_TEAM_AVERAGE`). An average over one or two matches is
noise: a single high-scoring match would otherwise top the list. This is the
same 5-match threshold the coach average-time-between-matches toplist uses.

## Rounding and ordering

The average is rounded to two decimals in the database, so teams whose
averages agree to two decimals tie, and the bot shows them with the same
rank. Each average is ranked both highest first and lowest first. Ties are
broken by team name so the order is stable.

## Scope

League, era and match category narrow the matches counted, the same way they
do for matches played. Competition scope is not offered, matching matches
played, so the helper ignores any competition in the scope it is given.
