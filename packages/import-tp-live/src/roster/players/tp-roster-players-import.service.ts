import type {
  ImportError,
  TpImportedPlayer,
  TpMatchEmbeddedPlayer,
  TpMercenaryPositionUsage,
  UpsertPlayer,
  UpsertPlayerCharacteristics,
} from '@blood-bowl-tracker/api-contract';
import { UpsertPlayerSchema } from '@blood-bowl-tracker/api-contract';
import { PlayersService } from '@blood-bowl-tracker/game-data';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpRosterContext } from '../tp-roster-context.service';
import type { IncreaseBaselineCache } from './tp-characteristic-increases.service';
import { TpCharacteristicIncreasesService } from './tp-characteristic-increases.service';
import { TpLastingInjuryBuilderService } from './tp-lasting-injury-builder.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';
import type {
  MercenaryPositionCache,
  ResolvedPlayerPosition,
} from './tp-player-position.service';
import { TpPlayerPositionService } from './tp-player-position.service';
import { TpPlayerStatusService } from './tp-player-status.service';

/** Options for {@link TpRosterPlayersImportService.importPlayers}. */
export interface ImportRosterPlayersOptions {
  roster: TpRoster;
  /** This roster's players seen only in match snapshots. */
  matchEmbeddedPlayers: TpMatchEmbeddedPlayer[];
  context: TpRosterContext;
  /** The team's team-era row for the context's era. */
  teamEraId: number;
  /**
   * When true, the players' `spp_total` is left alone: the caller writes it
   * afterwards through `players.syncReportedSppAdjustments`, from the
   * `reportedSppTotal` this import returns.
   */
  deferSppTotal?: boolean;
  errors: ImportError[];
}

/** What one roster's player import did. */
export interface TpRosterPlayersOutcome {
  imported: number;
  importedPlayers: TpImportedPlayer[];
  mercenaryPositionUsages: TpMercenaryPositionUsage[];
}

@Injectable()
export class TpRosterPlayersImportService {
  constructor(
    private readonly positions: TpPlayerPositionService,
    private readonly players: PlayersService,
    private readonly characteristicsBuilder: TpPlayerCharacteristicsBuilderService,
    private readonly mercenaryCharacteristics: TpMercenaryCharacteristicsService,
    private readonly lastingInjuryBuilder: TpLastingInjuryBuilderService,
    private readonly characteristicIncreases: TpCharacteristicIncreasesService,
    private readonly status: TpPlayerStatusService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Upserts every player of one roster into its team era. The roster file
   * lists the roster's composition only as of when it was fetched, so its
   * players are unioned with `matchEmbeddedPlayers` (players seen only in
   * match snapshots — a player who has since left is still referenced by
   * match events); the roster file wins for any id both list, being the
   * freshest, except for the career SPP total, which only ever grows and so
   * takes the highest value seen; it is returned per player, and stored unless
   * the caller defers it. Players carry only a TP external id (their
   * `lineUps[].id`), never a Name one: player names are not unique.
   * Every player's status is sent too, `null` when TP's data establishes
   * none, so a re-import clears one the player no longer has; a roster file
   * and a match snapshot count equally for deciding a player is active.
   */
  async importPlayers({
    roster,
    matchEmbeddedPlayers,
    context,
    teamEraId,
    deferSppTotal,
    errors,
  }: ImportRosterPlayersOptions): Promise<TpRosterPlayersOutcome> {
    const merged = this.mergePlayers(roster.players, matchEmbeddedPlayers);
    const catalogPositionIds = await this.positions.resolveCatalogPositions({
      players: merged,
      tpSystemId: context.tpSystemId,
    });
    const mercenaryCache: MercenaryPositionCache = new Map();
    const baselineCache = this.characteristicIncreases.newCache();
    const outcome: TpRosterPlayersOutcome = {
      imported: 0,
      importedPlayers: [],
      mercenaryPositionUsages: [],
    };

    for (const player of merged) {
      const position = await this.positions.forPlayer({
        player,
        catalogPositionIds,
        context,
        mercenaryCache,
        errors,
      });
      if (position === undefined) {
        continue;
      }
      const data = await this.buildPayload({
        player,
        position,
        context,
        teamEraId,
        deferSppTotal,
        baselineCache,
        errors,
      });
      const upserted = await this.runner.record({
        run: () => this.players.upsert(UpsertPlayerSchema.parse(data)),
        item: data,
        errors,
        buildErrorMessage: (error) =>
          `Failed to import player "${player.name}": ${this.runner.messageOf(error)}`,
      });
      if (upserted === undefined) {
        continue;
      }
      outcome.imported += 1;
      outcome.importedPlayers.push({
        lineUpId: player.id,
        playerId: upserted.player.id,
        created: upserted.created,
        reportedSppTotal: player.totalStarPlayerPoints,
      });
      if (position.mercenary !== undefined) {
        outcome.mercenaryPositionUsages.push({
          positionId: position.positionId,
          teamRaceCode: roster.teamRaceCode,
          era: context.era.name,
        });
      }
    }
    await this.retireDepartedPlayers({
      roster,
      presentIds: merged.map((player) => player.id),
      context,
      teamEraId,
      errors,
    });
    return outcome;
  }

  /**
   * A roster file lists only a team's current players, and a match snapshot
   * covers the rest of those a match event can name, so a stored TP player of
   * the team era that appears in neither has left the team and becomes
   * `retired` (fired and retired are the same thing in TP) — unless already
   * `dead`, which is never downgraded; a player who died but whose match has
   * not been imported yet reads `retired` until that match import sets `dead`.
   * A player whose own upsert failed still counts as present, so a transient
   * failure never retires him. Skipped when the roster file lists no players:
   * a truncated or failed roster must never retire a whole team. Only players
   * with a numeric TP external id (a `lineUps` id) are considered, so
   * inducement hires, whose ids start with `star-`, are left alone. A failure
   * is recorded and does not affect the players already imported.
   */
  private async retireDepartedPlayers(options: {
    roster: TpRoster;
    presentIds: number[];
    context: TpRosterContext;
    teamEraId: number;
    errors: ImportError[];
  }): Promise<void> {
    const { roster, presentIds, context, teamEraId, errors } = options;
    if (roster.players.length === 0) {
      return;
    }
    await this.runner.record({
      run: () =>
        this.players.retireAbsentExternalPlayers({
          teamEraId,
          externalSystemId: context.tpSystemId,
          presentExternalIds: presentIds.map(String),
        }),
      item: { teamEraId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to retire players who left the roster: ${this.runner.messageOf(error)}`,
    });
  }

  /**
   * Match snapshots first, then the roster file's own players over them, so
   * a departed player is kept and the roster file wins on a shared id; every
   * player's SPP total is the highest either source reported.
   */
  private mergePlayers(
    rosterPlayers: TpRosterPlayer[],
    matchEmbeddedPlayers: TpMatchEmbeddedPlayer[],
  ): TpRosterPlayer[] {
    const merged = new Map<number, TpRosterPlayer>();
    for (const player of [...matchEmbeddedPlayers, ...rosterPlayers]) {
      merged.set(player.id, player);
    }
    const maxSpp = new Map<number, number>();
    for (const player of [...rosterPlayers, ...matchEmbeddedPlayers]) {
      maxSpp.set(
        player.id,
        Math.max(
          maxSpp.get(player.id) ?? player.totalStarPlayerPoints,
          player.totalStarPlayerPoints,
        ),
      );
    }
    return [...merged.values()].map((player) => ({
      ...player,
      totalStarPlayerPoints:
        maxSpp.get(player.id) ?? player.totalStarPlayerPoints,
    }));
  }

  /**
   * One player's upsert payload. TP embeds every roster player's own current
   * characteristics; a match-snapshot-only player carries none and sends
   * none, leaving stored values untouched. A mercenary hire carries none
   * anywhere, so it falls back to the curated values — checked only after
   * its own, so a future TP payload that embeds real ones still wins.
   *
   * The increase counts are measured against the player's embedded position
   * template (the same reference the reduction counts use), with TP's
   * literal 0 for a missing Passing turned into null when the rules set
   * declares no Passing. A player with no characteristics, or an era with no
   * single rules set, sends no increase group: it is all-or-nothing.
   */
  private async buildPayload(options: {
    player: TpRosterPlayer;
    position: ResolvedPlayerPosition;
    context: TpRosterContext;
    teamEraId: number;
    deferSppTotal: boolean | undefined;
    baselineCache: IncreaseBaselineCache;
    errors: ImportError[];
  }): Promise<UpsertPlayer> {
    const {
      player,
      position,
      context,
      teamEraId,
      deferSppTotal,
      baselineCache,
      errors,
    } = options;
    const { rulesSet } = context;
    let characteristics: UpsertPlayerCharacteristics | undefined =
      this.characteristicsBuilder.forRosterPlayer({
        characteristics: player.characteristics,
        rulesSetId: rulesSet?.id,
      });
    if (characteristics === undefined && position.mercenary !== undefined) {
      characteristics = this.mercenaryCharacteristics.forRosterPlayer({
        curated: position.mercenary,
        positionName: player.fallbackPositionName,
        player: { id: player.id, name: player.name },
        rulesSet:
          rulesSet === undefined
            ? undefined
            : { id: rulesSet.id, name: rulesSet.name },
        errors,
      });
    }
    const lastingInjuries = this.lastingInjuryBuilder.forRosterPlayer({
      player,
      rulesSet,
    });
    const increaseCounts =
      characteristics === undefined || rulesSet === undefined
        ? undefined
        : await this.characteristicIncreases.forPlayer({
            player: {
              label: `player "${player.name}" (${player.id})`,
              positionId: position.positionId,
            },
            rulesSet,
            current: {
              move: characteristics.move,
              strength: characteristics.strength,
              agility: characteristics.agility,
              passing: characteristics.passing,
              armour: characteristics.armour,
            },
            reductions: lastingInjuries,
            baseline:
              player.positionTemplate === undefined
                ? undefined
                : {
                    ...player.positionTemplate,
                    passing:
                      rulesSet.passingFormat === 'absent'
                        ? null
                        : player.positionTemplate.passing,
                  },
            cache: baselineCache,
            errors,
          });

    return {
      name: player.name,
      teamEraId,
      positionId: position.positionId,
      // Deferred: the bulk import writes spp_total through the reported
      // adjustments step instead, so each run has one writer.
      ...(deferSppTotal === true
        ? {}
        : { sppTotal: player.totalStarPlayerPoints }),
      ...characteristics,
      ...lastingInjuries,
      ...increaseCounts,
      // Sent on every import, null included, so a re-import clears a status
      // the player no longer has.
      status: this.status.forPlayer({
        state: player.state,
        isActive: player.isActive,
      }),
      externalIds: [
        { externalSystemId: context.tpSystemId, externalId: String(player.id) },
      ],
    };
  }
}
