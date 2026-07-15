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
  ): Promise<{ result: ImportResult; eraIdsByName: Map<string, number> }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const eraIdsByName = new Map<string, number>();

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
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }

    if (leagueId === undefined) {
      errors.push(
        makeImportError({
          item: { eras: eras.map((e) => e.identity.name) },
          message:
            'Cannot import eras: the league was not imported successfully, so ' +
            'its id is unknown.',
        }),
      );
      return { result: makeImportResult({ imported, errors }), eraIdsByName };
    }

    for (const era of eras) {
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
            { externalSystemId: nameSystemId, externalId: era.identity.name },
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
