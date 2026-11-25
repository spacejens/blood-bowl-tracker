import type { Era } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfig, EraConfigService } from './era-config.service';

@Injectable()
export class BblErasImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly erasImport: ErasImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Attach the BBL external id to every configured era (BBL_ERAS). The era
   * itself is curated (batch 001), league, dates and rules sets included:
   * this step finds it by its Name external id and adds the same name under
   * the BBL system, sending nothing else. An era missing from the catalog
   * fails with the server's missing-field error, recorded for that era.
   *
   * Returns every upserted era keyed by its configured name. The upsert
   * answers with the curated era, so later steps read its dates and rules-set
   * names from this map instead of from the config. Idempotent.
   */
  async importEras(): Promise<{
    result: ImportResult;
    erasByName: Map<string, Era>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const erasByName = new Map<string, Era>();

    let eras: EraConfig[];
    try {
      eras = this.eraConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: {
            externalSystems: [
              BBL_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        erasByName,
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: BBL_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        erasByName,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    for (const era of eras) {
      const upserted = await this.erasImport.upsert(
        {
          // The contract's default, spelled out because the upsert type
          // requires it: an empty list links no rules set and leaves the
          // curated era's links alone.
          rulesSetIds: [],
          externalIds: [
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forEra(era.identity.name),
            },
            { externalSystemId: bblSystemId, externalId: era.identity.name },
          ],
        },
        errors,
      );
      if (upserted) {
        imported += 1;
        erasByName.set(era.identity.name, upserted);
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      erasByName,
    };
  }
}
