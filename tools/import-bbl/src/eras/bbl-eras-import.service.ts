import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { EraConfig, EraConfigService } from './era-config.service';

@Injectable()
export class BblErasImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly erasImport: ErasImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import the configured eras (BBL_ERAS), each referencing its league and
   * its rules sets. Both are resolved server-side, by external id, against
   * whatever the leagues and rules-sets steps upserted moments earlier in the
   * same run -- one batched lookup per kind for the whole run, not one per
   * era. Each era is keyed by its name under both the BBL and Name external
   * systems. Eras whose league or a rules set does not resolve are skipped
   * with a recorded error. Idempotent.
   */
  async importEras(): Promise<{
    result: ImportResult;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let eras: EraConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    const leagueRefs = [
      ...new Set(
        eras
          .map((era) => era.leagueName)
          .filter((name): name is string => name !== undefined),
      ),
    ].map((name) => ({ externalSystemId: bblSystemId, externalId: name }));
    const rulesSetRefs = [
      ...new Set(eras.flatMap((era) => era.identity.rulesSets)),
    ].map((name) => ({ externalSystemId: bblSystemId, externalId: name }));

    // One round trip per kind for the whole run: every era's league and rules
    // sets were upserted moments ago by the two preceding steps, so they are
    // already in the database and resolvable by the same external ids those
    // steps wrote.
    const leagueIds = await this.lookup.lookupMap('league', leagueRefs);
    const rulesSetIds = await this.lookup.lookupMap('rulesSet', rulesSetRefs);

    for (const era of eras) {
      const leagueId =
        era.leagueName === undefined
          ? undefined
          : leagueIds.get(
              this.lookup.keyOf({
                externalSystemId: bblSystemId,
                externalId: era.leagueName,
              }),
            );
      if (leagueId === undefined) {
        errors.push(
          this.importResults.error({
            item: era,
            message: `Cannot import era "${era.identity.name}": its league "${era.leagueName ?? '(unset)'}" could not be resolved.`,
          }),
        );
        continue;
      }

      const eraRulesSetIds: number[] = [];
      let unresolved: string | undefined;
      for (const name of era.identity.rulesSets) {
        const id = rulesSetIds.get(
          this.lookup.keyOf({
            externalSystemId: bblSystemId,
            externalId: name,
          }),
        );
        if (id === undefined) {
          unresolved = name;
          break;
        }
        eraRulesSetIds.push(id);
      }
      if (unresolved !== undefined) {
        errors.push(
          this.importResults.error({
            item: era,
            message: `Cannot import era "${era.identity.name}": its rules set "${unresolved}" could not be resolved.`,
          }),
        );
        continue;
      }

      const upsertedEra = await this.erasImport.upsert(
        {
          name: era.identity.name,
          leagueId,
          rulesSetIds: eraRulesSetIds,
          startDate: era.dates.startDate,
          endDate: era.dates.endDate,
          externalIds: [
            { externalSystemId: bblSystemId, externalId: era.identity.name },
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forEra(era.identity.name),
            },
          ],
        },
        errors,
      );
      if (upsertedEra) {
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
    };
  }
}
