import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import { PLAYER_CHARACTERISTIC_KEYS } from '@blood-bowl-tracker/api-contract';
import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  playerExternalIds,
  players,
  positions,
  races,
  rulesSets,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import type { CharacteristicValues } from '../shared/characteristic-format-validation.service';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';
import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
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
import type { PlayerContextNames } from '../shared/player-context-names.service';
import { PlayerContextNamesService } from '../shared/player-context-names.service';
import type { TeamTopPlayer } from '../shared/team-top-player';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { SppTotalsService } from '../spp/spp-totals.service';
import type { PlayerDeepdiveCategoryCounts } from './player-deepdive-counts.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';

export class PlayerUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class PlayersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly sppTotals: SppTotalsService,
    private readonly deepdiveCounts: PlayerDeepdiveCountsService,
    private readonly matchEventCounts: MatchEventCountsService,
    private readonly playerContextNames: PlayerContextNamesService,
    private readonly characteristicFormats: CharacteristicFormatValidationService,
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
        positionId: number;
        eraName: string;
        eraId: number;
        sppTotal: number | null;
        sppAdjustment: number | null;
        move: number;
        strength: number;
        agility: number;
        passing: number | null;
        armour: number;
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
        positionId: positions.id,
        eraName: eras.name,
        eraId: eras.id,
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
        // The player's own current characteristics. No new join: they live on
        // `players` itself. A stored 0 is passed through as-is — a legacy
        // value for the four NOT NULL columns (which have no database
        // default, so nothing a database-level fallback could legitimately
        // write), a real value for a `plus_zero_legal` Passing value —
        // because rendering it is the caller's decision.
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
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
   * Every counter the player deepdive shows, in one round trip. Delegates to
   * `PlayerDeepdiveCountsService`, which owns the query shapes; see that
   * service's `PlayerDeepdiveCategoryCounts` doc comment for the semantics of
   * each counter.
   */
  getDeepdiveCategoryCounts(
    playerId: number,
  ): Promise<PlayerDeepdiveCategoryCounts> {
    return this.deepdiveCounts.getDeepdiveCategoryCounts(playerId);
  }

  /**
   * Position, team, race, era and coach names for a batch of players, for
   * annotating player lists with context beyond the player name. See
   * `PlayerContextNamesService`.
   */
  getContextNamesByIds(
    playerIds: number[],
  ): Promise<Map<number, PlayerContextNames>> {
    return this.playerContextNames.getPlayerContextNamesByIds(playerIds);
  }

  /**
   * Any supplied characteristics are validated against `data.rulesSetId`'s
   * declared formats before anything is written; a mismatch throws
   * `CharacteristicFormatMismatchError` and nothing is stored.
   * `rulesSetId` is used only for that check — it is never persisted, so
   * which rules set a player's characteristics were validated against is not
   * itself recorded anywhere.
   */
  async upsert(
    data: UpsertPlayer,
  ): Promise<{ player: Player; created: boolean }> {
    await this.validateCharacteristics(data);

    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
      sppTotal: data.sppTotal,
      // Undefined keys are stripped by upsertByExternalIds, so a payload
      // that says nothing about characteristics leaves the stored line
      // alone; an explicit null passing really writes null.
      move: data.move,
      strength: data.strength,
      agility: data.agility,
      passing: data.passing,
      armour: data.armour,
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

  /**
   * Reject characteristics that disagree with the rules set they are
   * declared under, before any write happens. Nothing is stored about which
   * rules set was used: `rulesSetId` addresses the validation, not the row.
   *
   * The contract's UpsertPlayerSchema already guarantees the all-or-nothing
   * pairing at the RPC boundary, but this service is also called directly,
   * so it refuses a half-specified payload here rather than writing an
   * unvalidated partial line.
   */
  private async validateCharacteristics(data: UpsertPlayer): Promise<void> {
    const supplied = PLAYER_CHARACTERISTIC_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      supplied.length > 0 &&
      supplied.length < PLAYER_CHARACTERISTIC_KEYS.length
    ) {
      throw new CharacteristicFormatMismatchError(
        `Characteristics are all-or-nothing: a partial characteristic line was supplied for ${this.playerSubject(data)} — supply every one of ${PLAYER_CHARACTERISTIC_KEYS.join(', ')} or none`,
      );
    }

    const values = this.characteristicValues(data);
    if (values === undefined) {
      if (data.rulesSetId !== undefined) {
        throw new CharacteristicFormatMismatchError(
          `Rules set ${data.rulesSetId} was supplied for ${this.playerSubject(data)} without a complete set of characteristics`,
        );
      }
      return;
    }
    if (data.rulesSetId === undefined) {
      throw new CharacteristicFormatMismatchError(
        `Characteristics were supplied for ${this.playerSubject(data)} without a rules set to validate them against`,
      );
    }

    const [formats] = await this.db
      .select({
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(rulesSets)
      .where(eq(rulesSets.id, data.rulesSetId));

    this.characteristicFormats.validate({
      values,
      formats,
      rulesSetId: data.rulesSetId,
      subject: this.playerSubject(data),
    });
  }

  /**
   * The payload's complete characteristic line, or undefined when it carries
   * no complete one. `passing: null` counts as supplied — it asserts that the
   * rules set has no Passing characteristic.
   */
  private characteristicValues(
    data: UpsertPlayer,
  ): CharacteristicValues | undefined {
    const { move, strength, agility, passing, armour } = data;
    if (
      move === undefined ||
      strength === undefined ||
      agility === undefined ||
      passing === undefined ||
      armour === undefined
    ) {
      return undefined;
    }
    return { move, strength, agility, passing, armour };
  }

  /**
   * Names the player in a validation message. The row may not exist yet, so
   * the first external id is the only stable identifier available — and it is
   * the one the importer reporting the failure recognizes.
   */
  private playerSubject(data: UpsertPlayer): string {
    const [first] = data.externalIds;
    return `player ${first.externalSystemId}:${first.externalId}`;
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
