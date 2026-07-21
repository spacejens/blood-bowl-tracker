import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

@Injectable()
export class TpRulesSetsImportService {
  constructor(
    private readonly eraConfig: EraDataConfigService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
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

    const tpSystemName = this.externalSystemName.getTpSystemName();

    let names: string[];
    try {
      names = [
        ...new Set(this.eraConfig.getEras().flatMap((e) => e.rulesSets)),
      ];
    } catch (error) {
      errors.push(
        makeImportError({
          item: { externalSystems: [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: makeImportResult({ imported, errors }),
        rulesSetIdsByName,
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, isBookkeeping: false },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        rulesSetIdsByName,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

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
