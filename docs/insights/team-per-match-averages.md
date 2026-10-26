# Team per-match averages

Per-match averages per team, backing the `/insights` team average top lists
(see [`/insights`](../discord-bot/slash-commands/insights.md)). Today these
are average touchdowns scored and conceded per match.

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

A new average (casualties, deaths, ...) adds only its per-side value; the
division, floor, rounding, ordering and scope stay shared.

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
do for matches played. Competition scope is not offered: few teams play 5
matches in one competition, so the floor would leave almost nothing to rank.
