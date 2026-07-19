import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportResult,
  RulesSetsImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';

@Injectable()
export class TpRulesSetsImportService {
  constructor(
    private readonly eraConfig: EraDataConfigService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import the rule sets the TP league played under. Rule sets are not named in
   * TP's data (only an opaque numeric code is), so their names are the distinct
   * rulesSets values across the configured eras. Each is keyed by its name
   * under both the TP and Name external systems. Returns a name->id map so the
   * eras import can reference each rule set's id. Idempotent.
   */
  async importRulesSets(): Promise<{
    result: ImportResult;
    rulesSetIdsByName: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const rulesSetIdsByName = new Map<string, number>();

    let names: string[];
    let tpSystemId: number;
    let nameSystemId: number;
    const tpSystemName = this.externalSystemName.getTpSystemName();
    try {
      names = [
        ...new Set(this.eraConfig.getEras().flatMap((e) => e.rulesSets)),
      ];
      [tpSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
        ),
      );
      return {
        result: makeImportResult({ imported, errors }),
        rulesSetIdsByName,
      };
    }

    for (const name of names) {
      const rulesSetData: UpsertRulesSet = {
        name,
        externalIds: [
          { externalSystemId: tpSystemId, externalId: name },
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
