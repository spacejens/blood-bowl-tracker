import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  matchEvents,
  playerExternalIds,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import type { MatchEventSelector } from '../shared/match-event-counts';
import {
  countMatchEventsByPlayer,
  countMatchEventsForPlayer,
} from '../shared/match-event-counts';
import type { ConsequenceType } from '../shared/match-event-types';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  MVP_AWARD_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import type { PlayerContextNames } from '../shared/player-context-names';
import { getPlayerContextNamesByIds as queryPlayerContextNamesByIds } from '../shared/player-context-names';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { SppTotalsService } from '../spp/spp-totals.service';

export class PlayerUpsertConflictError extends UpsertConflictError {}

/**
 * One counter that carries its own severity breakdown: a total plus the
 * subset that inflicted a serious injury or a death. Used for both the
 * casualty and the foul counters, which report the same three numbers over
 * different event populations.
 */
export interface PlayerDeepdiveEventGroup {
  total: number;
  seriousInjuries: number;
  killed: number;
}

/**
 * The player deepdive's event counters. The five `simple` categories are
 * plain label/count rows; casualties and fouls each carry a severity
 * breakdown so the embed can render them as one line apiece. `fouls.killed`
 * plus `casualties.killed` is exactly the number of kills the deepdive's
 * Kills section lists, because an event with `consequenceType = 'death'`
 * always has an `actionType` of either `'death'` or `'foul'`.
 */
export interface PlayerDeepdiveCategoryCounts {
  simple: { label: string; count: number }[];
  casualties: PlayerDeepdiveEventGroup;
  fouls: PlayerDeepdiveEventGroup;
}

@Injectable()
export class PlayersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly sppTotals: SppTotalsService,
  ) {}

  async findById(id: number): Promise<
    | {
        id: number;
        name: string;
        teamName: string;
        teamId: number;
        raceName: string;
        raceId: number;
        positionName: string;
        eraName: string;
        eraId: number;
        sppTotal: number | null;
        sppAdjustment: number | null;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: players.id,
        name: players.name,
        teamName: teams.name,
        teamId: teams.id,
        raceName: races.name,
        raceId: races.id,
        positionName: positions.name,
        eraName: eras.name,
        eraId: eras.id,
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(players.id, id));
    return rows[0];
  }

  /**
   * Name-prefix search backing `/deepdive`'s player autocomplete. Star
   * players are excluded: a star's identity is their position, and each hire
   * is its own `players` row, so a popular star would otherwise appear once
   * per hiring team. Excluding them here only means no star id is *offered*
   * by autocomplete; a star deepdive remains reachable via drill-down buttons
   * elsewhere and renders that one hire, which is the intended per-team-era
   * presentation.
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; teamName: string }[]> {
    return this.db
      .select({ id: players.id, name: players.name, teamName: teams.name })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          ilike(players.name, `${this.likePattern.escape(prefix)}%`),
          eq(positions.isStarPlayer, false),
        ),
      )
      .limit(limit);
  }

  /**
   * Every counter the player deepdive shows, in one round trip. Issued as a
   * single `Promise.all` so the caller's one timeout message covers the whole
   * group.
   */
  async getDeepdiveCategoryCounts(
    playerId: number,
  ): Promise<PlayerDeepdiveCategoryCounts> {
    const simpleCategories: { label: string; selector: MatchEventSelector }[] =
      [
        {
          label: 'MVP awards',
          selector: { role: 'acting', types: MVP_AWARD_TYPES },
        },
        {
          label: 'Touchdowns scored',
          selector: { role: 'acting', types: TOUCHDOWN_TYPES },
        },
        {
          label: 'Completions',
          selector: { role: 'acting', types: COMPLETION_TYPES },
        },
        {
          label: 'Interceptions',
          selector: { role: 'acting', types: INTERCEPTION_TYPES },
        },
        {
          label: 'Deflections',
          selector: { role: 'acting', types: DEFLECTION_TYPES },
        },
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
          this.countDeepdiveEvents(playerId, category.selector),
        ),
      ),
      this.countDeepdiveEvents(playerId, {
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
      }),
      this.countDeepdiveEvents(playerId, {
        role: 'acting',
        types: SERIOUS_INJURY_CAUSED_TYPES,
      }),
      this.countDeepdiveEvents(playerId, {
        role: 'acting',
        types: DEATH_CAUSED_TYPES,
      }),
      this.countDeepdiveEvents(playerId, { role: 'acting', types: FOUL_TYPES }),
      this.countFoulConsequences(playerId, 'serious_injury'),
      this.countFoulConsequences(playerId, 'death'),
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

  /** One deepdive counter: unscoped, single-role, for this player alone. */
  private countDeepdiveEvents(
    playerId: number,
    selector: MatchEventSelector,
  ): Promise<number> {
    return countMatchEventsForPlayer({ db: this.db, playerId, selector });
  }

  /**
   * Events this player committed as a foul that inflicted the given
   * consequence. `MatchEventSelector` is single-role by design, so a combined
   * acting-and-consequence filter needs its own query — a direct
   * `match_events` filter, with none of the join graph the scoped counters
   * carry, because deepdive counters apply no scope narrowing.
   */
  private async countFoulConsequences(
    playerId: number,
    consequenceType: ConsequenceType,
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          eq(matchEvents.actionType, 'foul'),
          eq(matchEvents.consequenceType, consequenceType),
        ),
      );
    return row.count;
  }

  /**
   * Position, team, race, era and coach names for a batch of players, for
   * annotating player lists with context beyond the player name. See
   * shared/player-context-names.ts.
   */
  getContextNamesByIds(
    playerIds: number[],
  ): Promise<Map<number, PlayerContextNames>> {
    return queryPlayerContextNamesByIds({ db: this.db, playerIds });
  }

  async upsert(
    data: UpsertPlayer,
  ): Promise<{ player: Player; created: boolean }> {
    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
      sppTotal: data.sppTotal,
    };

    const { row: player, created } = await upsertByExternalIds<
      typeof players,
      typeof playerExternalIds
    >({
      db: this.db,
      entityTable: players,
      entityIdColumn: players.id,
      values: columns,
      externalIdTable: playerExternalIds,
      ownerIdColumn: playerExternalIds.playerId,
      externalSystemIdColumn: playerExternalIds.externalSystemId,
      externalIdColumn: playerExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: PlayerUpsertConflictError,
      entityLabelPlural: 'players',
      buildExternalIdRow: (playerId, pair) => ({ playerId, ...pair }),
    });

    return { player, created };
  }

  countMvpAwardsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: MVP_AWARD_TYPES },
      scope,
      limit,
    });
  }

  countTouchdownsScoredByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      scope,
      limit,
    });
  }

  countCompletionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: COMPLETION_TYPES },
      scope,
      limit,
    });
  }

  countInterceptionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      scope,
      limit,
    });
  }

  countDeflectionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countFoulsCommittedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: FOUL_TYPES },
      scope,
      limit,
    });
  }

  countTimesSentOffByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countLastingInjuriesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, players);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(players.id) })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(players.id) })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(players.id) })
      .from(players)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.teamEraId, players.teamEraId),
      )
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }

  /**
   * Players ranked by total Star Player Points, most first.
   *
   * Two calculations, chosen by scope — `FactScope`'s fields are mutually
   * exclusive, so this is a plain two-way branch:
   *
   * - All-time, league or era: the stored `players.spp_total`, which already
   *   includes manual adjustments (`players.spp_adjustment`). A player belongs
   *   to a league/era purely through their own `players.team_era_id`; no match
   *   event is involved. A NULL total means no source has populated one, so
   *   there is nothing to rank and the player is excluded.
   * - Competition or match category: those scopes are narrower than an era and
   *   an adjustment cannot be attributed to one, so the per-event sum is used
   *   instead — see SppTotalsService.topPlayersBySppSum.
   *
   * Star players are excluded from both branches: each hire of a star is its
   * own `players` row, so one star would otherwise occupy several slots —
   * and stars are typically the strongest players in the game.
   */
  topPlayersByTotalSpp(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    if (scope.competitionId !== undefined || scope.category !== undefined) {
      return this.sppTotals.topPlayersBySppSum(scope, limit);
    }
    // Typed through sql<number> because the column is nullable in general;
    // the isNotNull guard below is what makes every returned row a number.
    const total = sql<number>`${players.sppTotal}`;
    return this.db
      .select({ playerId: players.id, name: players.name, count: total })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          isNotNull(players.sppTotal),
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
          eq(positions.isStarPlayer, false),
        ),
      )
      .orderBy(desc(players.sppTotal))
      .limit(limit);
  }
}
