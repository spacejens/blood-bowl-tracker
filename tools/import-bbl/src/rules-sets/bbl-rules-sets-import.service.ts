import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '../source/external-system-names';

@Injectable()
export class BblRulesSetsImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Import the rules sets the BBL league played under. Rules sets are not in
   * the source data; their names are the distinct `rulesSet` values across the
   * configured eras (BBL_ERAS). Each is keyed by its name under both the BBL
   * and Name external systems. Returns a name→id map so the eras import can
   * reference each rules set's id. Idempotent.
   */
  async importRulesSets(): Promise<{
    result: ImportResult;
    rulesSetIdsByName: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const rulesSetIdsByName = new Map<string, number>();

    let names: string[];
    let bblSystemId: number;
    let nameSystemId: number;
    try {
      names = [...new Set(this.eraConfig.getEras().map((e) => e.rulesSet))];
      bblSystemId = await this.externalSystemsImport.upsertExternalSystem(
        BBL_EXTERNAL_SYSTEM_NAME,
      );
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
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
        result: makeImportResult({ imported, errors }),
        rulesSetIdsByName,
      };
    }

    for (const name of names) {
      const rulesSet = await this.rulesSetsImport.upsertRulesSet(
        {
          name,
          externalIds: [
            { externalSystemId: bblSystemId, externalId: name },
            { externalSystemId: nameSystemId, externalId: name },
          ],
        },
        errors,
      );
      if (rulesSet) {
        rulesSetIdsByName.set(name, rulesSet.id);
        imported += 1;
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      rulesSetIdsByName,
    };
  }
}
