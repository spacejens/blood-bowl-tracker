import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  competitionTeams,
  DB,
  eras,
  matches,
  matchTeams,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, desc, eq } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import {
  countAllMatchEventsByPlayerForTeam,
  countMatchEventsByTeam,
  listBiggestExpensiveMistakes as queryListBiggestExpensiveMistakes,
  sumExpensiveMistakesByTeam as querySumExpensiveMistakesByTeam,
} from '../shared/match-event-counts';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { countMatchesWithOutcomeByTeam } from '../shared/match-outcome-counts';

@Injectable()
export class TeamsStatisticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  getTopPlayersByMatchEventCount(
    teamId: number,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countAllMatchEventsByPlayerForTeam({ db: this.db, teamId, limit });
  }

  async countMatchesPlayedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
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
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
          scope.category === undefined
            ? undefined
            : eq(matches.category, scope.category),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  /**
   * The won/lost/drawn siblings of `countMatchesPlayedByTeam`: the same
   * league/era/match-category scope, narrowed to matches with the given
   * outcome for this team's side. See shared/match-outcome-counts.ts.
   */
  countMatchesWonByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByTeam({
      db: this.db,
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByTeam({
      db: this.db,
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByTeam({
      db: this.db,
      outcome: 'drawn',
      scope,
      limit,
    });
  }

  async countCompetitionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    const eraFilter = and(
      scope.leagueId === undefined
        ? undefined
        : eq(eras.leagueId, scope.leagueId),
      scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
    );
    const base = this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(competitions.id),
      })
      .from(competitions)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId));
    if (scope.category === undefined) {
      return base
        .where(eraFilter)
        .groupBy(teams.id, teams.name)
        .orderBy(desc(countDistinct(competitions.id)))
        .limit(limit);
    }
    return base
      .innerJoin(matchTeams, eq(matchTeams.teamEraId, teamEras.id))
      .innerJoin(
        matches,
        and(
          eq(matches.id, matchTeams.matchId),
          eq(matches.competitionId, competitions.id),
          eq(matches.category, scope.category),
        ),
      )
      .where(eraFilter)
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(competitions.id)))
      .limit(limit);
  }

  async countErasByTeam(
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(teamEras.eraId),
      })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(teamEras.eraId)))
      .limit(limit);
  }

  countTouchdownsScoredByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      scope,
      limit,
    });
  }

  countCompletionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: COMPLETION_TYPES },
      scope,
      limit,
    });
  }

  countInterceptionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      scope,
      limit,
    });
  }

  countDeflectionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countFoulsCommittedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: FOUL_TYPES },
      scope,
      limit,
    });
  }

  countTimesSentOffByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countLastingInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: DEATH_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  sumExpensiveMistakesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return querySumExpensiveMistakesByTeam({ db: this.db, scope, limit });
  }

  listBiggestExpensiveMistakes(
    scope: FactScope,
    limit: number,
  ): Promise<
    {
      teamId: number;
      name: string;
      count: number;
      date: string;
      category: MatchCategory;
    }[]
  > {
    return queryListBiggestExpensiveMistakes({ db: this.db, scope, limit });
  }
}
