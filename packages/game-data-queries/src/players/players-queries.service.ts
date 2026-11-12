import type {
  CharacteristicLine,
  PlayerLastingInjuries,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  competitionTeams,
  count,
  DB,
  desc,
  eq,
  eras,
  ilike,
  isNotNull,
  players,
  positions,
  races,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import type { FactScope } from '@blood-bowl-tracker/game-data';
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
  SppTotalsService,
  TOUCHDOWN_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import type { TeamTopPlayer } from '../shared/team-top-player';
import { TrophyAwardCountsService } from '../shared/trophy-award-counts.service';

/**
 * One player with the names and ids of their team, race, position and era —
 * what `PlayersQueriesService.findById` returns for a player deepdive.
 */
export interface PlayerDetail
  extends PlayerLastingInjuries, CharacteristicLine {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
  positionId: number;
  eraName: string;
  eraId: number;
  /** The era's own span (`null` end = ongoing), for the `Era:` line. */
  eraStartDate: string;
  eraEndDate: string | null;
  sppTotal: number | null;
  sppAdjustment: number | null;
  /** Unspent SPP when known exactly; `null` means not known exactly. */
  unspentSpp: number | null;
  /**
   * The player's current status as their source reports it; `null` means no
   * source has reported one (unknown), never "active".
   */
  status: PlayerStatus | null;
}

/**
 * Read-only player lookups, scoped counts and toplists for the Discord bot.
 * Player ingestion (upsert, resolve, retirement) is `PlayersService` in
 * packages/game-data.
 */
@Injectable()
export class PlayersQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly sppTotals: SppTotalsService,
    private readonly matchEventCounts: MatchEventCountsService,
    private readonly trophyAwardCounts: TrophyAwardCountsService,
  ) {}

  async findById(id: number): Promise<PlayerDetail | undefined> {
    const rows = await this.db
      .select({
        id: players.id,
        name: players.name,
        teamName: teams.name,
        teamId: teams.id,
        raceName: races.name,
        raceId: races.id,
        positionName: positions.name,
        positionId: positions.id,
        eraName: eras.name,
        eraId: eras.id,
        eraStartDate: eras.startDate,
        eraEndDate: eras.endDate,
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
        unspentSpp: players.unspentSpp,
        status: players.status,
        // The player's own current characteristics. No new join: they live on
        // `players` itself. A stored 0 is passed through as-is — a
        // placeholder for the four NOT NULL columns, a real value for a
        // `plus_zero_legal` Passing value — because rendering it is the
        // caller's decision.
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
        // The player's currently outstanding lasting injuries. No new join:
        // they live on `players` itself, alongside the characteristics above.
        missNextGame: players.missNextGame,
        nigglingInjuryCount: players.nigglingInjuryCount,
        moveReductionCount: players.moveReductionCount,
        strengthReductionCount: players.strengthReductionCount,
        agilityReductionCount: players.agilityReductionCount,
        passingReductionCount: players.passingReductionCount,
        armourReductionCount: players.armourReductionCount,
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

  countMvpAwardsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: MVP_AWARD_TYPES },
      scope,
      limit,
    });
  }

  countTouchdownsScoredByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      scope,
      limit,
    });
  }

  countCompletionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: COMPLETION_TYPES },
      scope,
      limit,
    });
  }

  countInterceptionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      scope,
      limit,
    });
  }

  countDeflectionsByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countDeathsCausedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      scope,
      limit,
    });
  }

  countFoulsCommittedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'acting', types: FOUL_TYPES },
      scope,
      limit,
    });
  }

  countTimesSentOffByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      scope,
      limit,
    });
  }

  countCasualtiesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countSeriousInjuriesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  countLastingInjuriesSufferedByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.matchEventCounts.countMatchEventsByPlayer({
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      scope,
      limit,
    });
  }

  /**
   * Players ranked by how many player-level trophies they have won. The query
   * lives on TrophyAwardCountsService, next to the team- and coach-grouped
   * trophy counts; team-level awards never count toward a player.
   */
  countTrophiesByPlayer(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.trophyAwardCounts.countTrophiesByPlayer(scope, limit);
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

  /**
   * One team's players ranked by total Star Player Points, most first.
   *
   * Uses the stored `players.spp_total` — the same number the player deepdive
   * shows for that player — rather than a per-event sum, so the two views can
   * never disagree. The stored total also carries `players.spp_adjustment`
   * (SPP granted outside the normal per-event flow), which an event sum would
   * silently drop. A NULL total means no source has populated one, so there is
   * nothing to rank and the player is excluded.
   *
   * The team is reached through the player's own `team_era`, with no era
   * filter, so the ranking spans every era/season the team has played.
   *
   * Star players are excluded, matching every other SPP ranking here: each
   * hire of a star is its own `players` row, so one star would otherwise
   * occupy several of the five slots on a single team's list. `isStarPlayer`
   * is still selected (and is therefore always `false` here) because
   * `TeamTopPlayer` is the shared row shape the deepdive's drill-down button
   * routing consumes.
   *
   * Ordered by the stored total alone — no secondary tiebreak — matching
   * `topPlayersByTotalSpp` and `SppTotalsService.topPlayersBySppSum`. Equal
   * totals come back in whatever order the database produces, and the caller
   * groups them into one rank.
   */
  topPlayersByTotalSppForTeam(
    teamId: number,
    limit: number,
  ): Promise<TeamTopPlayer[]> {
    // Typed through sql<number> because the column is nullable in general;
    // the isNotNull guard below is what makes every returned row a number.
    const total = sql<number>`${players.sppTotal}`;
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: total,
        positionId: positions.id,
        positionName: positions.name,
        isStarPlayer: positions.isStarPlayer,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          isNotNull(players.sppTotal),
          eq(teams.id, teamId),
          eq(positions.isStarPlayer, false),
        ),
      )
      .orderBy(desc(players.sppTotal))
      .limit(limit);
  }
}
