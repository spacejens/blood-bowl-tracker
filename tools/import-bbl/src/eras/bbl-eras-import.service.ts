import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
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
  ) {}

  /**
   * Import the configured eras (BBL_ERAS), each referencing its league's id and
   * its rules set's id (both resolved earlier in the import run and passed in).
   * The league id is resolved per-era from leagueIdsByName by the era's stamped
   * leagueName. Each era is keyed by its name under both the BBL and Name
   * external systems. Eras whose league id or rules set id is unknown are
   * skipped with a recorded error. Idempotent.
   */
  async importEras(
    leagueIdsByName: Map<string, number>,
    rulesSetIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult; eraIdsByName: Map<string, number> }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const eraIdsByName = new Map<string, number>();

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let eras: EraConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        makeImportError({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    for (const era of eras) {
      const leagueId =
        era.leagueName === undefined
          ? undefined
          : leagueIdsByName.get(era.leagueName);
      if (leagueId === undefined) {
        errors.push(
          makeImportError({
            item: era,
            message: `Cannot import era "${era.identity.name}": its league "${era.leagueName ?? '(unset)'}" was not imported successfully.`,
          }),
        );
        continue;
      }

      const rulesSetIds: number[] = [];
      let unresolved: string | undefined;
      for (const name of era.identity.rulesSets) {
        const id = rulesSetIdsByName.get(name);
        if (id === undefined) {
          unresolved = name;
          break;
        }
        rulesSetIds.push(id);
      }
      if (unresolved !== undefined) {
        errors.push(
          makeImportError({
            item: era,
            message: `Cannot import era "${era.identity.name}": its rules set "${unresolved}" was not imported successfully.`,
          }),
        );
        continue;
      }

      const upsertedEra = await this.erasImport.upsertEra(
        {
          name: era.identity.name,
          leagueId,
          rulesSetIds,
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
        eraIdsByName.set(era.identity.name, upsertedEra.id);
        imported += 1;
      }
    }

    return { result: makeImportResult({ imported, errors }), eraIdsByName };
  }
}
