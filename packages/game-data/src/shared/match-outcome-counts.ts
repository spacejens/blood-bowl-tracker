import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  eras,
  matches,
  matchTeams,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { SQL } from 'drizzle-orm';
import {
  and,
  countDistinct,
  desc,
  eq,
  isNotNull,
  isNull,
  ne,
} from 'drizzle-orm';

import type { FactScope } from './fact-scope';

/**
 * How a match ended for one particular participating side. `matches`
 * records the outcome as a single nullable `winningMatchTeamId`, so all three
 * outcomes are read off that one column relative to the side being counted.
 */
type MatchOutcome = 'won' | 'lost' | 'drawn';

/**
 * The outcome predicate for the side represented by the joined `matchTeams`
 * row. A null `winningMatchTeamId` is a draw for both sides; a non-null one
 * means the side whose `match_teams.id` it equals won and the other lost.
 */
function outcomeFilter(outcome: MatchOutcome): SQL | undefined {
  switch (outcome) {
    case 'won':
      return eq(matches.winningMatchTeamId, matchTeams.id);
    case 'lost':
      return and(
        isNotNull(matches.winningMatchTeamId),
        ne(matches.winningMatchTeamId, matchTeams.id),
      );
    case 'drawn':
      return isNull(matches.winningMatchTeamId);
  }
}

/**
 * The same league/era/match-category scope filter the `countMatchesPlayedBy*`
 * queries apply. Competition scoping is deliberately absent: matches-played
 * and its outcome siblings are league/era/category-scoped only.
 */
function scopeFilter(scope: FactScope): SQL | undefined {
  return and(
    scope.leagueId === undefined
      ? undefined
      : eq(eras.leagueId, scope.leagueId),
    scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
    scope.category === undefined
      ? undefined
      : eq(matches.category, scope.category),
  );
}

/**
 * Options shared by every outcome count: the database handle, which outcome to
 * count, the fact scope, and the row limit. Taking the whole `FactScope`
 * (rather than mirroring its fields) keeps callers — which already hold one —
 * from restating it, and keeps the call under the 3-parameter ceiling.
 */
export interface CountMatchesWithOutcomeOptions {
  db: Db;
  outcome: MatchOutcome;
  scope: FactScope;
  limit: number;
}

/**
 * Matches with the given outcome, counted per coach and ordered most-first.
 * `countDistinct(matches.id)` mirrors `countMatchesPlayedByCoach`: a coach who
 * fielded two of their own teams in one match still counts that match once per
 * outcome (such a match contributes one win *and* one loss, which is correct —
 * the coach genuinely both won and lost it).
 */
export async function countMatchesWithOutcomeByCoach(
  options: CountMatchesWithOutcomeOptions,
): Promise<{ coachId: number; name: string; count: number }[]> {
  const { db, outcome, scope, limit } = options;
  return db
    .select({
      coachId: coaches.id,
      name: coaches.name,
      count: countDistinct(matches.id),
    })
    .from(matches)
    .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .innerJoin(coaches, eq(coaches.id, teams.coachId))
    .where(and(outcomeFilter(outcome), scopeFilter(scope)))
    .groupBy(coaches.id, coaches.name)
    .orderBy(desc(countDistinct(matches.id)))
    .limit(limit);
}

/**
 * Matches with the given outcome, counted per team and ordered most-first.
 * Same join chain as the coach grouping minus the `coaches` join, mirroring
 * `countMatchesPlayedByTeam`.
 */
export async function countMatchesWithOutcomeByTeam(
  options: CountMatchesWithOutcomeOptions,
): Promise<{ teamId: number; name: string; count: number }[]> {
  const { db, outcome, scope, limit } = options;
  return db
    .select({
      teamId: teams.id,
      name: teams.name,
      count: countDistinct(matches.id),
    })
    .from(matches)
    .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(and(outcomeFilter(outcome), scopeFilter(scope)))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(countDistinct(matches.id)))
    .limit(limit);
}

/**
 * Matches with the given outcome, counted per race and ordered most-first.
 * Counts distinct `matchTeams.id` (one participation per participating team)
 * exactly like `countMatchesPlayedByRace`, so a same-race match adds 2 to that
 * race's drawn total. The `matches` join stays last and unconditional for the
 * same reason it does there: `matchTeams.matchId` is a non-null foreign key so
 * the join drops no rows, and keeping it last leaves the earlier join indices
 * stable for the existing spec assertions.
 */
export async function countMatchesWithOutcomeByRace(
  options: CountMatchesWithOutcomeOptions,
): Promise<{ raceId: number; name: string; count: number }[]> {
  const { db, outcome, scope, limit } = options;
  return db
    .select({
      raceId: races.id,
      name: races.name,
      count: countDistinct(matchTeams.id),
    })
    .from(matchTeams)
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .innerJoin(races, eq(races.id, teams.raceId))
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .where(and(outcomeFilter(outcome), scopeFilter(scope)))
    .groupBy(races.id, races.name)
    .orderBy(desc(countDistinct(matchTeams.id)))
    .limit(limit);
}
