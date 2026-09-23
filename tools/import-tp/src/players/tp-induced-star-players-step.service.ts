import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { TpEraRulesSetResolverService } from '../eras/tp-era-rules-set-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { InducedStarPlayerHireGroup } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersImportService } from './tp-induced-star-players-import.service';

/** Options for {@link TpInducedStarPlayersStepService.importStarHires}. */
export interface ImportStarHiresOptions {
  groups: InducedStarPlayerHireGroup[];
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  /** From the positions step: each position's characteristics per rules set. */
  characteristicsByPositionId: Map<
    number,
    Map<number, TpPositionCharacteristics>
  >;
}

/** What the hired-star step did. */
export interface StarHiresOutcome {
  result: ImportResult;
  starPlayerIdsByRosterAndMaster: Map<string, number>;
  insertedPlayerIds: number[];
}

@Injectable()
export class TpInducedStarPlayersStepService {
  constructor(
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly eraConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
    private readonly eraRulesSetResolver: TpEraRulesSetResolverService,
    private readonly inducedStarPlayers: TpInducedStarPlayersImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Imports the star players hired through `inducements_roll` match events.
   * They appear on no roster file, so this step, not the roster import,
   * owns them. It sets up what TpInducedStarPlayersImportService needs: the
   * TP and Name external systems, each era's id and name, and the rules set
   * of each era a hire was made in (for the star position's template values).
   */
  async importStarHires({
    groups,
    teamErasByRosterId,
    characteristicsByPositionId,
  }: ImportStarHiresOptions): Promise<StarHiresOutcome> {
    const errors: ImportError[] = [];
    const starPlayerIdsByRosterAndMaster = new Map<string, number>();
    const insertedPlayerIds: number[] = [];
    const outcome = (imported: number): StarHiresOutcome => ({
      result: this.importResults.result({ imported, errors }),
      starPlayerIdsByRosterAndMaster,
      insertedPlayerIds,
    });
    if (groups.length === 0) {
      return outcome(0);
    }

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return outcome(0);
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let eras: EraDataConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return outcome(0);
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      eras.map((era) => ({
        externalSystemId: tpSystemId,
        externalId: era.name,
      })),
    );
    const eraNameByEraId = new Map<number, string>();
    for (const era of eras) {
      const eraId = eraIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: era.name,
        }),
      );
      if (eraId !== undefined) {
        eraNameByEraId.set(eraId, era.name);
      }
    }
    const hiredEraNames = new Set(
      groups.flatMap((group) => eraNameByEraId.get(group.eraId) ?? []),
    );
    const rulesSetIdByEraName =
      await this.eraRulesSetResolver.resolveRulesSetIdByEraName({
        eras: eras.filter((era) => hiredEraNames.has(era.name)),
        tpSystemId,
        errors,
      });

    const hires = await this.inducedStarPlayers.importHires({
      groups,
      teamErasByRosterId,
      context: {
        tpSystemId,
        nameSystemId,
        eraNameByEraId,
        rulesSetIdByEraName,
        characteristicsByPositionId,
      },
      errors,
    });
    for (const [key, playerId] of hires.starPlayerIdsByRosterAndMaster) {
      starPlayerIdsByRosterAndMaster.set(key, playerId);
    }
    insertedPlayerIds.push(...hires.insertedPlayerIds);
    return outcome(hires.imported);
  }
}
