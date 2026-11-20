import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionTeams,
  countDistinct,
  DB,
  desc,
  eq,
  eras,
  ilike,
  inArray,
  matches,
  matchTeams,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/domain-enums';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  CASUALTY_CAUSED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  TOUCHDOWN_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { TrophyAwardCountsService } from '../shared/trophy-award-counts.service';
import { CoachMatchGapsService } from './coach-match-gaps.service';
import { CoachParticipationCountsService } from './coach-participation-counts.service';

/**
 * The acting-side event filter of a match-event-backed coach count: the
 * action types that count, optionally narrowed to rows whose own consequence
 * is one of `consequenceTypes` (see MatchEventSelector).
 */
type ActingCoachEvents = {
  types: readonly ActionType[];
  consequenceTypes?: readonly ConsequenceType[];
};

/**
 * Read-only coach lookups, scoped counts and toplists for the Discord bot.
 * Coach ingestion is `CoachesService` in packages/game-data.
 */
@Injectable()
export class CoachesQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly matchEventCounts: MatchEventCountsService,
    private readonly matchOutcomeCounts: MatchOutcomeCountsService,
    private readonly trophyAwardCounts: TrophyAwardCountsService,
    private readonly coachMatchGaps: CoachMatchGapsService,
    private readonly coachParticipationCounts: CoachParticipationCountsService,
  ) {}

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(eq(coaches.id, id));
    return rows[0];
  }

  /**
   * Every era any of this coach's teams belongs to, oldest first. Joins through
   * `teams` rather than filtering `teamEras.teamId` directly (as the team-side
   * sibling `TeamsQueriesService.listEras` does) because a coach can own several
   * teams; `groupBy` then collapses an era that two of those teams share, which
   * would otherwise be listed twice.
   */
  async listEras(coachId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(teamEras)
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId))
      .groupBy(eras.id, eras.name)
      .orderBy(eras.startDate, eras.name);
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(ilike(coaches.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async getCareerSpan(
    coachId: number,
  ): Promise<{ start: string; end: string } | undefined> {
    // Aggregate over zero rows still returns one row with null start/end, so a
    // null start marks a coach who has recorded no matches. Each aggregate is
    // converted to a UTC calendar day (YYYY-MM-DD) after aggregating, so the
    // span does not depend on the database session's timezone and the resolver
    // can render the strings directly.
    const [row] = await this.db
      .select({
        start: sql<
          string | null
        >`(min(${matches.playedAt}) at time zone 'UTC')::date`,
        end: sql<
          string | null
        >`(max(${matches.playedAt}) at time zone 'UTC')::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  /**
   * Career spans for a batch of coaches, keyed by coach id: the UTC calendar
   * days of each coach's first and last recorded match, computed exactly as
   * `getCareerSpan` does but in one grouped query. A coach with no recorded
   * matches has no row in the grouped result and so no entry in the map. An
   * empty id list short-circuits rather than issuing an empty `inArray`,
   * which SQL would reject.
   */
  async getCareerSpansByIds(
    coachIds: number[],
  ): Promise<Map<number, { start: string; end: string }>> {
    if (coachIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        coachId: teams.coachId,
        start: sql<string>`(min(${matches.playedAt}) at time zone 'UTC')::date`,
        end: sql<string>`(max(${matches.playedAt}) at time zone 'UTC')::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(inArray(teams.coachId, coachIds))
      .groupBy(teams.coachId);
    return new Map(
      rows.map((row) => [row.coachId, { start: row.start, end: row.end }]),
    );
  }

  getTopTeamsByMatchesPlayed(
    coachId: number,
    limit: number,
  ): Promise<{ id: number; name: string; count: number }[]> {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  /**
   * The participation toplists (matches played, competitions entered, teams
   * coached, eras active) live on CoachParticipationCountsService; these
   * delegates keep them reachable through CoachesQueriesService alongside the
   * other coach toplists.
   */
  countMatchesPlayedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachParticipationCounts.countMatchesPlayedByCoach(
      scope,
      limit,
    );
  }

  /**
   * The won/lost/drawn siblings of `countMatchesPlayedByCoach`: the same
   * league/era/match-category scope, narrowed to matches with the given
   * outcome for the coach's own side. See `MatchOutcomeCountsService` for the
   * query and its dedup semantics.
   */
  countMatchesWonByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'drawn',
      scope,
      limit,
    });
  }

  /**
   * The time-between-matches toplists live on CoachMatchGapsService; these
   * delegates keep them reachable through CoachesQueriesService alongside the
   * other coach toplists.
   */
  getGapBetweenMatchesByCoachDescending(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachMatchGaps.getGapBetweenMatchesByCoachDescending(
      scope,
      limit,
    );
  }

  getGapBetweenMatchesByCoachAscending(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachMatchGaps.getGapBetweenMatchesByCoachAscending(
      scope,
      limit,
    );
  }

  getAverageGapBetweenMatchesByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachMatchGaps.getAverageGapBetweenMatchesByCoach(scope, limit);
  }

  countCompetitionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachParticipationCounts.countCompetitionsByCoach(scope, limit);
  }

  countTeamsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachParticipationCounts.countTeamsByCoach(scope, limit);
  }

  countErasByCoach(
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.coachParticipationCounts.countErasByCoach(limit);
  }

  /**
   * The shared shape of every match-event-backed coach toplist: count events
   * of the given types credited to the acting side, attributed to that
   * team's coach and summed over all of the coach's teams. Deliberately does
   * not forward scope.competitionId: these coach toplists are
   * league/era/match-category-scoped only (the trophy toplist below is the
   * exception, since a trophy award belongs to a competition). An optional
   * consequenceTypes narrows the count to actions whose own row records one
   * of those consequences.
   */
  private countActingEventsByCoach(
    events: ActingCoachEvents,
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByCoach({
      selector: { role: 'acting', ...events },
      scope: {
        leagueId: scope.leagueId,
        eraId: scope.eraId,
        category: scope.category,
      },
      limit,
    });
  }

  countFoulsCommittedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach({ types: FOUL_TYPES }, scope, limit);
  }

  countTouchdownsScoredByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: TOUCHDOWN_TYPES },
      scope,
      limit,
    );
  }

  countCompletionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: COMPLETION_TYPES },
      scope,
      limit,
    );
  }

  countInterceptionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: INTERCEPTION_TYPES },
      scope,
      limit,
    );
  }

  countDeflectionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: DEFLECTION_TYPES },
      scope,
      limit,
    );
  }

  countCasualtiesCausedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: CASUALTY_CAUSED_TYPES },
      scope,
      limit,
    );
  }

  countSeriousInjuriesCausedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: SERIOUS_INJURY_CAUSED_TYPES },
      scope,
      limit,
    );
  }

  /**
   * Lasting injuries the coach's teams inflicted: a casualty-severity action
   * whose own row carries a lasting consequence, as for
   * TeamsStatisticsService.countLastingInjuriesCausedByTeam. A foul does not
   * count, and a consequence-only row has no causer.
   */
  countLastingInjuriesCausedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      {
        types: CASUALTY_CAUSED_TYPES,
        consequenceTypes: LASTING_INJURY_SUFFERED_TYPES,
      },
      scope,
      limit,
    );
  }

  countDeathsCausedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.countActingEventsByCoach(
      { types: DEATH_CAUSED_TYPES },
      scope,
      limit,
    );
  }

  /**
   * Coaches ranked by the total number of trophies their teams have won,
   * across every team they have coached. Unlike the match-event-backed coach
   * counts, the competitionId is forwarded: a trophy award belongs to a
   * competition, so this fact is competition-scopable. The scope's match
   * category is ignored by the shared service — a trophy award is not a match
   * event.
   */
  countTrophiesByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.trophyAwardCounts.countTrophiesByCoach(scope, limit);
  }

  countAll(): Promise<number> {
    return countRows(this.db, coaches);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
