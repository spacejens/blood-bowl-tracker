import type {
  ImportError,
  ImportResult,
  UpsertRulesSetData,
} from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportResult,
  RulesSetsImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';

@Injectable()
export class BblRulesSetsImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
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
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      names = [
        ...new Set(
          this.eraConfig.getEras().flatMap((e) => e.identity.rulesSets),
        ),
      ];
      [bblSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
        ),
      );
      return {
        result: makeImportResult({ imported, errors }),
        rulesSetIdsByName,
      };
    }

    for (const name of names) {
      const rulesSetData: UpsertRulesSetData = {
        name,
        externalIds: [
          { externalSystemId: bblSystemId, externalId: name },
          { externalSystemId: nameSystemId, externalId: name },
        ],
      };
      const rulesSet = await this.rulesSetsImport.upsertRulesSet(
        rulesSetData,
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
