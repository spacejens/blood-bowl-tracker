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
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq } from 'drizzle-orm';

import { PlayersService } from '../players/players.service';
import type { FactScope } from '../shared/fact-scope';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
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
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import type { TeamTopPlayer } from '../shared/team-top-player';

@Injectable()
export class TeamsStatisticsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matchEventCounts: MatchEventCountsService,
    private readonly matchOutcomeCounts: MatchOutcomeCountsService,
    private readonly players: PlayersService,
  ) {}

  /**
   * One team's top players by career SPP total. Thin delegation: the query
   * itself lives on PlayersService next to the league-wide SPP ranking it
   * mirrors, so both stay consistent about which column they read and which
   * players they exclude.
   */
  getTopPlayersByTotalSpp(
    teamId: number,
    limit: number,
  ): Promise<TeamTopPlayer[]> {
    return this.players.topPlayersByTotalSppForTeam(teamId, limit);
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
   * outcome for this team's side. See `MatchOutcomeCountsService`.
   */
  countMatchesWonByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByTeam({
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByTeam({
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByTeam({
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

  /**
   * Teams ranked by how many trophies they have won. Counts every
   * `trophy_awards` row tied to the team through its team era — including
   * player-kind awards (MVP, most casualties, ...), since `team_era_id` is
   * populated even for those. This is deliberately the same aggregation as
   * `TrophyAwardsService.countByTeam`, grouped by team instead of filtered to
   * one, so the toplist and a team's own deepdive trophy count agree.
   *
   * Hand-written rather than routed through `MatchEventCountsService`: trophy
   * awards are not match events, so there is no match-category dimension and
   * `scope.category` is deliberately ignored (the fact-tree leaf correspondingly
   * declares `supportsMatchCategory: false`). League and era are read off the
   * winning team era (matching how `countCompetitionsByTeam` scopes era, for
   * consistency with the other counters here) rather than off the award's own
   * competition; competition is read straight off the award row. The two eras
   * can only diverge on anomalous data.
   */
  countTrophiesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(trophyAwards.id),
      })
      .from(trophyAwards)
      .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
          scope.competitionId === undefined
            ? undefined
            : eq(trophyAwards.competitionId, scope.competitionId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(trophyAwards.id)))
      .limit(limit);
  }

  countTouchdownsScoredByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      scope,
      limit,
    });
  }

  countCompletionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: COMPLETION_TYPES },
      scope,
      limit,
    });
  }

  countInterceptionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      scope,
      limit,
    });
  }

  countDeflectionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countFoulsCommittedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'acting', types: FOUL_TYPES },
      scope,
      limit,
    });
  }

  countTimesSentOffByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countLastingInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByTeam({
      selector: { role: 'consequence', types: DEATH_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  sumExpensiveMistakesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.matchEventCounts.sumExpensiveMistakesByTeam({ scope, limit });
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
    return this.matchEventCounts.listBiggestExpensiveMistakes({ scope, limit });
  }
}
