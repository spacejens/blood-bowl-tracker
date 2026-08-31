import type {
  RulesSet,
  UpsertRulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

@Injectable()
export class BblRulesSetsImportService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import the rules sets the BBL league played under. Rules sets are not in
   * the source data; their names are the distinct `rulesSet` values across the
   * configured eras (BBL_ERAS). Each is keyed by its name under both the BBL
   * and Name external systems. The eras import resolves each era's rules sets
   * server-side, by that same external id, once this step has upserted them.
   * Idempotent.
   */
  async importRulesSets(): Promise<{
    result: ImportResult;
    rulesSetsByName: Map<string, RulesSet>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    // Each upsert already answers with the full RulesSet, formats included, so
    // the characteristics import downstream needs no extra round trip to learn
    // a target rules set's passingFormat.
    const rulesSetsByName = new Map<string, RulesSet>();

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let names: string[];
    try {
      names = [
        ...new Set(
          this.eraConfig.getEras().flatMap((e) => e.identity.rulesSets),
        ),
      ];
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        rulesSetsByName,
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
        rulesSetsByName,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    for (const name of names) {
      const rulesSetData: UpsertRulesSet = {
        name,
        externalIds: [
          { externalSystemId: bblSystemId, externalId: name },
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forRulesSet(name),
          },
        ],
      };
      const rulesSet = await this.rulesSetsImport.upsert(rulesSetData, errors);
      if (rulesSet) {
        imported += 1;
        rulesSetsByName.set(name, rulesSet);
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      rulesSetsByName,
    };
  }
}
