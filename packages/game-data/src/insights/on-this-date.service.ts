import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  or,
  SQL,
  sql,
} from 'drizzle-orm';

import type { PlayerKillerInfo } from '../players/player-death.service';
import { PlayerDeathService } from '../players/player-death.service';
import type { PlayerDeepdiveCategoryCounts } from '../players/player-deepdive-counts.service';
import type { FactScope } from '../shared/fact-scope';
import type { ConsequenceType } from '../shared/match-event-types';
import {
  CASUALTY_CAUSED_TYPES,
  CATCH_TYPES,
  COMPLETION_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  THROW_TEAM_MATE_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';

export interface OnThisDateOptions {
  /**
   * A plain month/day pair (1-12, 1-31) resolved against real calendar dates only,
   * with no nearest-date behaviour and no folding. February 29 is its own date,
   * matching only actual February 29 rows; a non-leap year contributes nothing.
   * The extract predicate falls out of the SQL `extract()` call for free,
   * so there is deliberately no leap-year-specific code anywhere in this file.
   */
  month: number;
  day: number;
  scope: FactScope;
}

export interface OnThisDateTopKilledOptions extends OnThisDateOptions {
  limit: number;
}

export interface OnThisDateKilledPlayer {
  playerId: number;
  name: string;
  sppTotal: number;
  positionId: number;
  positionName: string;
  isStarPlayer: boolean;
  teamId: number;
  teamName: string;
  raceId: number;
  raceName: string;
  coachId: number;
  coachName: string;
  killer: PlayerKillerInfo | null;
}

@Injectable()
export class OnThisDateService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matchScopeFilter: MatchScopeFilterService,
    private readonly playerDeath: PlayerDeathService,
  ) {}

  private dateFilter(options: OnThisDateOptions): SQL | undefined {
    return and(
      sql`extract(month from ${matches.playedAt}) = ${sql.param(options.month)}`,
      sql`extract(day from ${matches.playedAt}) = ${sql.param(options.day)}`,
    );
  }

  /**
   * Death-severity events this service caused, whether confirmed, prevented, or
   * unrecorded. Mirrors `PlayerDeepdiveCountsService`'s `countDeathOutcome`
   * exactly, so the two services can never disagree about what 'killed' means.
   */
  private deathOutcomeFilter(): SQL | undefined {
    return and(
      eq(matchEvents.actionType, 'death'),
      or(
        eq(matchEvents.consequenceType, 'death'),
        and(
          eq(matchEvents.consequenceType, 'casualty_avoided'),
          eq(matchEvents.consequenceAvoidedSeverity, 'death'),
        ),
        isNull(matchEvents.consequenceType),
      ),
    );
  }

  /**
   * Foul-caused events (or prevented foul-caused events) whose confirmed or
   * would-have-been severity falls in `severities`. Covers both "it happened"
   * (`consequenceType` is one of `severities`) and "it was prevented"
   * (`consequenceType = 'casualty_avoided'` and `consequenceAvoidedSeverity`
   * is one of `severities`), so a foul that would have caused a serious
   * injury but was saved by an apothecary still counts. Mirrors
   * `PlayerDeepdiveCountsService`'s `countFoulOutcome` exactly, so the two
   * services can never disagree about what 'killed' means. Note that
   * `actionType = 'foul'` carries no severity of its own — unlike
   * `actionType = 'death'`, which certifies severity by itself — so there
   * is no unpaired/no-consequence case to fold in here.
   */
  private foulOutcomeFilter(
    severities: readonly ConsequenceType[],
  ): SQL | undefined {
    return and(
      eq(matchEvents.actionType, 'foul'),
      or(
        inArray(matchEvents.consequenceType, severities),
        and(
          eq(matchEvents.consequenceType, 'casualty_avoided'),
          inArray(matchEvents.consequenceAvoidedSeverity, severities),
        ),
      ),
    );
  }

  private async countScopedEvents(
    options: OnThisDateOptions,
    filter: SQL | undefined,
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          filter,
          this.matchScopeFilter.build(options.scope),
          this.dateFilter(options),
        ),
      );
    return row.count;
  }

  async countMatchesPlayed(options: OnThisDateOptions): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matches.id) })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          this.matchScopeFilter.build(options.scope),
          this.dateFilter(options),
        ),
      );
    return row.count;
  }

  /**
   * Counts event categories in the shape of PlayerDeepdiveCategoryCounts.
   * The MVP row is deliberately absent — an MVP is a per-player honour,
   * and totalling it over a date measures how many matches were played
   * rather than anything about the date.
   *
   * Every counter joins matchEvents to the acting side's matchTeams,
   * then matches, teamEras and eras, because the date filter needs
   * matches.playedAt and the scope filter needs the other three.
   * That drops an event whose actingMatchTeamId is null, the same
   * tradeoff MatchEventCountsService.countMatchEventsByTeam makes for
   * every scoped counter — unavoidable here because the counts really
   * are scoped.
   */
  async getEventCounts(
    options: OnThisDateOptions,
  ): Promise<PlayerDeepdiveCategoryCounts> {
    const simpleCategories = [
      { label: 'Touchdowns scored', types: TOUCHDOWN_TYPES },
      { label: 'Completions', types: COMPLETION_TYPES },
      { label: 'Interceptions', types: INTERCEPTION_TYPES },
      { label: 'Deflections', types: DEFLECTION_TYPES },
      { label: 'Team-mates thrown', types: THROW_TEAM_MATE_TYPES },
      { label: 'Successful catches', types: CATCH_TYPES },
    ];
    const [
      simpleCounts,
      casualtyTotal,
      casualtySeriousInjuries,
      casualtyKilled,
      foulTotal,
      foulSeriousInjuries,
      foulKilled,
    ] = await Promise.all([
      Promise.all(
        simpleCategories.map((category) =>
          this.countScopedEvents(
            options,
            inArray(matchEvents.actionType, category.types),
          ),
        ),
      ),
      this.countScopedEvents(
        options,
        inArray(matchEvents.actionType, CASUALTY_CAUSED_TYPES),
      ),
      this.countScopedEvents(
        options,
        inArray(matchEvents.actionType, SERIOUS_INJURY_CAUSED_TYPES),
      ),
      this.countScopedEvents(options, this.deathOutcomeFilter()),
      this.countScopedEvents(
        options,
        inArray(matchEvents.actionType, FOUL_TYPES),
      ),
      this.countScopedEvents(
        options,
        this.foulOutcomeFilter(SERIOUS_INJURY_SUFFERED_TYPES),
      ),
      this.countScopedEvents(options, this.foulOutcomeFilter(['death'])),
    ]);
    return {
      simple: simpleCategories.map((category, index) => ({
        label: category.label,
        count: simpleCounts[index],
      })),
      casualties: {
        total: casualtyTotal,
        seriousInjuries: casualtySeriousInjuries,
        killed: casualtyKilled,
      },
      fouls: {
        total: foulTotal,
        seriousInjuries: foulSeriousInjuries,
        killed: foulKilled,
      },
    };
  }

  /**
   * Fetches players who died on the given date, ordered by SPP descending.
   * players.spp_total is nullable and Postgres sorts nulls first under a
   * descending order, so both the selected value and the ordering key are
   * coalesce(spp_total, 0)::int. players.id is the secondary ordering key
   * so a tie is stable.
   *
   * Resolves PlayerDeathService.getKillerInfo for every fetched row in one
   * Promise.all. A player dies at most once, so that player's only death
   * is exactly the death being reported. The caller passes the leaderboard's
   * own fetch window as limit, so the tie logic in Task 5 can see a whole
   * tie group; the resulting parallel killer lookups are an accepted cost,
   * bounded by the caller's database timeout.
   */
  async getTopKilledPlayers(
    options: OnThisDateTopKilledOptions,
  ): Promise<OnThisDateKilledPlayer[]> {
    const sppTotal = sql<number>`coalesce(${players.sppTotal}, 0)::int`;
    const victims = await this.db
      .select({
        playerId: players.id,
        name: players.name,
        sppTotal,
        positionId: positions.id,
        positionName: positions.name,
        isStarPlayer: positions.isStarPlayer,
        teamId: teams.id,
        teamName: teams.name,
        raceId: races.id,
        raceName: races.name,
        coachId: coaches.id,
        coachName: coaches.name,
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.consequencePlayerId))
      .innerJoin(
        matchTeams,
        eq(matchTeams.id, matchEvents.consequenceMatchTeamId),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          eq(matchEvents.consequenceType, 'death'),
          this.matchScopeFilter.build(options.scope),
          this.dateFilter(options),
        ),
      )
      .orderBy(desc(sppTotal), players.id)
      .limit(options.limit);

    return Promise.all(
      victims.map(async (victim) => ({
        ...victim,
        killer: await this.playerDeath.getKillerInfo(victim.playerId),
      })),
    );
  }
}
