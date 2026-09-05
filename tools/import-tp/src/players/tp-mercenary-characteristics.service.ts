import type { PositionRulesSetEntry } from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { MercenaryCharacteristicsConfigService } from './mercenary-characteristics-config.service';
import type { TpPlayerCharacteristicsPayload } from './tp-player-characteristics-builder.service';

/**
 * Applies the curated mercenary characteristics table to the two places TP's
 * own data leaves empty: the mercenary Position's `position_rules_sets` rows,
 * and each individual hire's own characteristics.
 *
 * Split out of `TpPlayersImportService` (which only calls the three methods
 * below) both to keep that file under the repo's source-file line cap and
 * because every "this mercenary is not curated" error message belongs in one
 * place. Every path that leaves a mercenary without characteristics records an
 * `ImportError`, so a missing curation shows up in the import run's result
 * instead of silently landing on `players`' illegal `DEFAULT 0` placeholder.
 */
@Injectable()
export class TpMercenaryCharacteristicsService {
  constructor(
    private readonly config: MercenaryCharacteristicsConfigService,
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Era name -> its single rules set's NAME, from the era config. The curated
   * table is keyed by rules-set name while `TpEraRulesSetResolverService`
   * resolves era -> rules-set *id*, so the players importer needs both. An era
   * declaring anything other than exactly one rules set is skipped here
   * silently: the resolver has already recorded its own error for it, and the
   * caller then simply passes `rulesSet: undefined`.
   */
  rulesSetNameByEraName(eras: EraDataConfig[]): Map<string, string> {
    const byEraName = new Map<string, string>();
    for (const era of eras) {
      if (era.rulesSets.length === 1) {
        byEraName.set(era.name, era.rulesSets[0]);
      }
    }
    return byEraName;
  }

  /**
   * Write a mercenary Position's curated characteristics to
   * `position_rules_sets`, one batch for the whole position (the same shape
   * `TpPositionCharacteristicsImportService` uses, so one bad position cannot
   * reject another's). Call once per distinct mercenary name per import run.
   */
  async syncPositionCharacteristics(options: {
    positionName: string;
    positionId: number;
    tpSystemId: number;
    errors: ImportError[];
  }): Promise<void> {
    const { positionName, positionId, tpSystemId, errors } = options;
    const curated = this.config.forPosition(positionName);
    if (curated === undefined) {
      errors.push(
        this.importResults.error({
          item: { position: positionName },
          message:
            `Could not resolve curated characteristics for mercenary ` +
            `position "${positionName}": it has no entry in the mercenary ` +
            'characteristics table. Add one so its hires get real values.',
        }),
      );
      return;
    }

    const rulesSetIds = await this.lookup.lookupMap(
      'rulesSet',
      [...curated.keys()].map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    const entries: PositionRulesSetEntry[] = [];
    for (const [rulesSetName, characteristics] of curated) {
      const rulesSetId = rulesSetIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: rulesSetName,
        }),
      );
      if (rulesSetId === undefined) {
        errors.push(
          this.importResults.error({
            item: { position: positionName, rulesSet: rulesSetName },
            message:
              `Could not resolve rules set "${rulesSetName}" for mercenary ` +
              `position "${positionName}"; its curated characteristics are ` +
              'skipped.',
          }),
        );
        continue;
      }
      entries.push({ positionId, rulesSetId, ...characteristics });
    }
    if (entries.length === 0) {
      return;
    }

    await this.positionRulesSetsImport.syncPositionRulesSets(
      { entries },
      errors,
    );
  }

  /**
   * One mercenary hire's own characteristics, from the curated table, shaped
   * exactly like `TpPlayerCharacteristicsBuilderService`'s return value so the
   * caller can spread either into the same upsert payload. Returns `undefined`
   * (recording an error naming the position, rules set and hire) when the
   * table has no entry for that specific rules set -- the player row is still
   * created, just without characteristics, and the gap is visible in the
   * import result. A `rulesSet` of `undefined` (the era resolved to no single
   * rules set) returns `undefined` silently: the era resolver already recorded
   * that problem, and duplicating it per hire would only add noise.
   */
  forRosterPlayer(options: {
    positionName: string;
    player: { id: number; name: string };
    rulesSet: { name: string; id: number } | undefined;
    errors: ImportError[];
  }): TpPlayerCharacteristicsPayload | undefined {
    const { positionName, player, rulesSet, errors } = options;
    if (rulesSet === undefined) {
      return undefined;
    }
    const characteristics = this.config.forPositionAndRulesSet({
      positionName,
      rulesSetName: rulesSet.name,
    });
    if (characteristics === undefined) {
      errors.push(
        this.importResults.error({
          item: {
            player: player.id,
            position: positionName,
            rulesSet: rulesSet.name,
          },
          message:
            `Imported mercenary hire "${player.name}" (${player.id}) without ` +
            `characteristics: mercenary position "${positionName}" has no ` +
            `curated entry for rules set "${rulesSet.name}".`,
        }),
      );
      return undefined;
    }
    return { ...characteristics, rulesSetId: rulesSet.id };
  }
}
