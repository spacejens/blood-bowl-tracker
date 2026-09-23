import type {
  ImportError,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import { UpsertPositionSchema } from '@blood-bowl-tracker/api-contract';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpRosterContext } from '../tp-roster-context.service';
import type { MercenaryCurated } from './tp-mercenary-characteristics.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';

/** Mercenary positions resolved during one import, by fallback name. */
export type MercenaryPositionCache = Map<
  string,
  { positionId: number; curated: MercenaryCurated }
>;

/** A player's resolved position; `mercenary` is set only for a mercenary hire. */
export interface ResolvedPlayerPosition {
  positionId: number;
  mercenary: MercenaryCurated | undefined;
}

/** Options for {@link TpPlayerPositionService.forPlayer}. */
export interface ResolvePlayerPositionOptions {
  player: TpRosterPlayer;
  /** From {@link TpPlayerPositionService.resolveCatalogPositions}. */
  catalogPositionIds: Map<number, number>;
  context: TpRosterContext;
  /** Created per import by the caller, so nothing outlives one import. */
  mercenaryCache: MercenaryPositionCache;
  errors: ImportError[];
}

@Injectable()
export class TpPlayerPositionService {
  constructor(
    private readonly positions: PositionsService,
    private readonly mercenaryCharacteristics: TpMercenaryCharacteristicsService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Every distinct `lineUpMasterId` among `players`, resolved against the
   * positions TP's official team list created, in one batched query. Regular
   * and star positions share one id space there, so one lookup covers both.
   */
  async resolveCatalogPositions(options: {
    players: TpRosterPlayer[];
    tpSystemId: number;
  }): Promise<Map<number, number>> {
    const masterIds = [
      ...new Set(options.players.map((player) => player.lineUpMasterId)),
    ];
    if (masterIds.length === 0) {
      return new Map();
    }
    const resolved = await this.positions.resolveBatch(
      masterIds.map((masterId) => ({
        externalSystemId: options.tpSystemId,
        externalId: String(masterId),
      })),
    );
    const byMasterId = new Map<number, number>();
    resolved.forEach((result, index) => {
      if (result.found) {
        byMasterId.set(masterIds[index], result.id);
      }
    });
    return byMasterId;
  }

  /**
   * The player's position: the catalog one, or — only for a player flagged
   * `isBigGuy`, since a mercenary hire has no catalog entry at all — an
   * `isStarPlayer` position keyed by its inline `fallbackPositionName`. The
   * gate keeps the fallback from masking a genuine regular-position catalog
   * gap. Undefined, with an error, when neither resolves.
   */
  async forPlayer({
    player,
    catalogPositionIds,
    context,
    mercenaryCache,
    errors,
  }: ResolvePlayerPositionOptions): Promise<
    ResolvedPlayerPosition | undefined
  > {
    const catalogId = catalogPositionIds.get(player.lineUpMasterId);
    if (catalogId !== undefined) {
      return { positionId: catalogId, mercenary: undefined };
    }
    if (player.isBigGuy) {
      const mercenary = await this.mercenaryPosition({
        name: player.fallbackPositionName,
        context,
        mercenaryCache,
        errors,
      });
      if (mercenary !== undefined) {
        return {
          positionId: mercenary.positionId,
          mercenary: mercenary.curated,
        };
      }
    }
    errors.push(
      this.importResults.error({
        item: { player: player.id, lineUpMasterId: player.lineUpMasterId },
        message: `Skipped player "${player.name}" (${player.id}): could not resolve position for lineUpMasterId ${player.lineUpMasterId}`,
      }),
    );
    return undefined;
  }

  /**
   * The mercenary's star position and its curated rows, upserted and read
   * once per distinct name per import. A failed upsert is not cached, so a
   * later hire retries it.
   */
  private async mercenaryPosition(options: {
    name: string;
    context: TpRosterContext;
    mercenaryCache: MercenaryPositionCache;
    errors: ImportError[];
  }): Promise<{ positionId: number; curated: MercenaryCurated } | undefined> {
    const { name, context, mercenaryCache, errors } = options;
    const cached = mercenaryCache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const data: UpsertPosition = {
      name,
      isStarPlayer: true,
      externalIds: [
        { externalSystemId: context.tpSystemId, externalId: name },
        {
          externalSystemId: context.nameSystemId,
          externalId: this.nameExternalId.forStarPosition(name),
        },
      ],
    };
    // Parsed through the contract schema so a direct call is held to the
    // same validation a positions.upsert RPC call would be.
    const upserted = await this.runner.record({
      run: () => this.positions.upsert(UpsertPositionSchema.parse(data)),
      item: data,
      errors,
      buildErrorMessage: (error) =>
        `Failed to import position "${name}": ${this.runner.messageOf(error)}`,
    });
    if (upserted === undefined) {
      return undefined;
    }
    const entry = {
      positionId: upserted.position.id,
      curated: await this.mercenaryCharacteristics.loadPositionCharacteristics({
        positionName: name,
        positionId: upserted.position.id,
        errors,
      }),
    };
    mercenaryCache.set(name, entry);
    return entry;
  }
}
