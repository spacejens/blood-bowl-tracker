import type {
  ExternalId,
  ResolveResult,
  UpsertPlayer,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  inArray,
  isNull,
  ne,
  or,
  playerExternalIds,
  players,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { JourneymanLonerService } from '../player-skills/journeyman-loner.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';

export class PlayerUpsertConflictError extends UpsertConflictError {}

/** A `lineUps` id is purely numeric; inducement hires carry `star-…` ids. */
const NUMERIC_EXTERNAL_ID_PATTERN = sql.raw("'^[0-9]+$'");

@Injectable()
export class PlayersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly characteristicsValidation: PlayerCharacteristicsValidationService,
    private readonly lastingInjuryValidation: PlayerLastingInjuryValidationService,
    private readonly journeymen: JourneymanLonerService,
  ) {}

  /**
   * Which player already declares this external-id pair, if any. The
   * single-pair convenience over `resolveBatch`, exactly as every other
   * resolvable entity service spells it.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  /**
   * The batched counterpart: one query answers the whole list, index-aligned
   * with the request, and an unmatched pair is `{ found: false }` rather than
   * an error. `tools/import-manual`'s curated trophy awards are the caller
   * this exists for — a manually curated award names its winning player by
   * the external id the BBL/TP importers already created.
   */
  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: playerExternalIds,
      ownerIdColumn: playerExternalIds.playerId,
      externalSystemIdColumn: playerExternalIds.externalSystemId,
      externalIdColumn: playerExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * Any supplied characteristics are validated against `data.rulesSetId`'s
   * declared formats before anything is written; a mismatch throws
   * `CharacteristicFormatMismatchError` and nothing is stored.
   * `rulesSetId` is used only for that check — it is never persisted, so
   * which rules set a player's characteristics were validated against is not
   * itself recorded anywhere.
   *
   * Any supplied lasting injuries are similarly validated — all-or-nothing,
   * and every count a nonnegative integer — before anything is written; a
   * violation throws `LastingInjuryValidationError` and nothing is stored.
   *
   * The journeyman marker is written when given. While it is set after the
   * write, the player's starting Loner is kept (`JourneymanLonerService`);
   * while it is not, a starting Loner neither his position's starting skills
   * nor a star-player position explain (a recruited journeyman's) is
   * retired. `unspentSpp` is already cleared on
   * every write, so the Loner change needs no further clear.
   */
  async upsert(
    data: UpsertPlayer,
  ): Promise<{ player: Player; created: boolean }> {
    await this.characteristicsValidation.validate(data);
    this.lastingInjuryValidation.validate(data);

    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
      sppTotal: data.sppTotal,
      // Cleared on every write: anything here can change what it should be,
      // and every import that upserts players ends with the SPP adjustment
      // sync, which writes it back against the final total. Null until then
      // is never wrong.
      unspentSpp: null,
      // Undefined is stripped by upsertByExternalIds, so an omitted status
      // leaves the stored one alone; an explicit null clears it to unknown.
      status: data.status,
      // Undefined is stripped by upsertByExternalIds, so an omitted marker
      // leaves the stored one alone.
      isJourneyman: data.isJourneyman,
      // Undefined keys are stripped by upsertByExternalIds, so a payload
      // that says nothing about characteristics leaves the stored line
      // alone; an explicit null passing really writes null.
      move: data.move,
      strength: data.strength,
      agility: data.agility,
      passing: data.passing,
      armour: data.armour,
      // Undefined keys are stripped by `upsertByExternalIds`, so a payload
      // that says nothing about lasting injuries leaves the stored state
      // alone — the same contract the characteristics above rely on.
      missNextGame: data.missNextGame,
      nigglingInjuryCount: data.nigglingInjuryCount,
      moveReductionCount: data.moveReductionCount,
      strengthReductionCount: data.strengthReductionCount,
      agilityReductionCount: data.agilityReductionCount,
      passingReductionCount: data.passingReductionCount,
      armourReductionCount: data.armourReductionCount,
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
      buildExternalIdRow: (playerId, externalId) => ({
        playerId,
        ...externalId,
      }),
    });

    // Both are idempotent, so a write that failed before reaching them is
    // put right by the next one. Each re-reads the stored marker under a
    // lock on the player's row and acts only if it still matches, so an
    // overlapping write of the same player cannot apply a stale change.
    if (player.isJourneyman) {
      await this.journeymen.ensureStartingLoner(player.id);
    } else {
      await this.journeymen.retireStartingLoner(player.id);
    }

    return { player, created };
  }

  /**
   * Marks `retired` every player of the team era whose external ids in the
   * given system include a purely numeric one (a roster `lineUps` id) but none
   * of `presentExternalIds`: a source's roster lists only a team's current
   * players, so one it no longer lists has left the team. A player with
   * several ids in the system stays when any of them is present. A `dead`
   * player is never downgraded; a NULL status is included. Only a numeric
   * external id makes a player a candidate, so inducement hires (whose ids
   * start with `star-`) and players the source never identified are left
   * alone. An empty `presentExternalIds` excludes nothing — callers decide
   * whether an empty source listing may be trusted. Returns the number of rows
   * updated.
   */
  async retireAbsentExternalPlayers(options: {
    teamEraId: number;
    externalSystemId: number;
    presentExternalIds: readonly string[];
  }): Promise<number> {
    const { teamEraId, externalSystemId, presentExternalIds } = options;
    const hasLineUpId = sql`${players.id} in (select ${playerExternalIds.playerId} from ${playerExternalIds} where ${and(
      eq(playerExternalIds.externalSystemId, externalSystemId),
      sql`${playerExternalIds.externalId} ~ ${NUMERIC_EXTERNAL_ID_PATTERN}`,
    )})`;
    const hasPresentId =
      presentExternalIds.length === 0
        ? undefined
        : sql`not exists (select 1 from ${playerExternalIds} where ${and(
            eq(playerExternalIds.playerId, players.id),
            eq(playerExternalIds.externalSystemId, externalSystemId),
            inArray(playerExternalIds.externalId, [...presentExternalIds]),
          )})`;
    const rows = await this.db
      .update(players)
      .set({ status: 'retired' })
      .where(
        and(
          eq(players.teamEraId, teamEraId),
          or(isNull(players.status), ne(players.status, 'dead')),
          hasLineUpId,
          hasPresentId,
        ),
      )
      .returning({ id: players.id });
    return rows.length;
  }
}
