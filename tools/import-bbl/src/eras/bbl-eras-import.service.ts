import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { EraConfig, EraConfigService } from './era-config.service';

@Injectable()
export class BblErasImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly erasImport: ErasImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import the configured eras (BBL_ERAS), each referencing the league's id and
   * its rules set's id (both resolved earlier in the import run and passed in).
   * Each era is keyed by its name under both the BBL and Name external systems.
   * Eras whose league id or rules set id is unknown are skipped with a recorded
   * error. Idempotent.
   */
  async importEras(
    leagueId: number | undefined,
    rulesSetIdsByName: Map<string, number>,
  ): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];

    let eras: EraConfig[];
    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      eras = this.eraConfig.getEras();
      bblSystemId =
        await this.externalSystemsImport.upsertExternalSystem(bblSystemName);
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return makeImportResult({ imported, errors });
    }

    if (leagueId === undefined) {
      errors.push(
        makeImportError({
          item: { eras: eras.map((e) => e.name) },
          message:
            'Cannot import eras: the league was not imported successfully, so ' +
            'its id is unknown.',
        }),
      );
      return makeImportResult({ imported, errors });
    }

    for (const era of eras) {
      const rulesSetId = rulesSetIdsByName.get(era.rulesSet);
      if (rulesSetId === undefined) {
        errors.push(
          makeImportError({
            item: era,
            message: `Cannot import era "${era.name}": its rules set "${era.rulesSet}" was not imported successfully.`,
          }),
        );
        continue;
      }

      const success = await this.erasImport.upsertEra(
        {
          name: era.name,
          leagueId,
          rulesSetId,
          startDate: era.startDate,
          endDate: era.endDate,
          externalIds: [
            { externalSystemId: bblSystemId, externalId: era.name },
            { externalSystemId: nameSystemId, externalId: era.name },
          ],
        },
        errors,
      );
      if (success) {
        imported += 1;
      }
    }

    return makeImportResult({ imported, errors });
  }
}
