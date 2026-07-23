import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  playerExternalIds,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import type { MatchEventSelector } from '../shared/match-event-counts';
import {
  countMatchEventsByPlayer,
  countMatchEventsForPlayer,
} from '../shared/match-event-counts';
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
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PlayerUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class PlayersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
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
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(eq(players.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; teamName: string }[]> {
    return this.db
      .select({ id: players.id, name: players.name, teamName: teams.name })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(ilike(players.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async getDeepdiveCategoryCounts(
    playerId: number,
  ): Promise<{ label: string; count: number }[]> {
    const categories: { label: string; selector: MatchEventSelector }[] = [
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
      {
        label: 'Casualties inflicted',
        selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      },
      {
        label: 'Serious injuries inflicted',
        selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      },
      {
        label: 'Opponents killed',
        selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      },
      {
        label: 'Fouls committed',
        selector: { role: 'acting', types: FOUL_TYPES },
      },
    ];
    const counts = await Promise.all(
      categories.map((category) =>
        countMatchEventsForPlayer({
          db: this.db,
          playerId,
          selector: category.selector,
        }),
      ),
    );
    return categories.map((category, index) => ({
      label: category.label,
      count: counts[index],
    }));
  }

  async upsert(
    data: UpsertPlayer,
  ): Promise<{ player: Player; created: boolean }> {
    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
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
}
