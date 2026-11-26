import type {
  Era,
  RulesSet,
  UpsertRulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BblRulesSetsImportService {
  constructor(
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Attach the BBL external id to every rules set the BBL eras played under.
   * Rules sets are not in the source data, and are curated (batch 001): their
   * names are the distinct `rulesSetNames` across the curated eras the eras
   * step returned, in first-seen order. Each is found by its Name external id
   * and gets the same name under the BBL system, sending nothing else. A rules
   * set missing from the catalog fails with the server's missing-field error,
   * recorded for that rules set. A rules set whose every era failed to import is not in
   * `erasByName`, so it gets no BBL id from this step. Idempotent.
   */
  async importRulesSets(erasByName: ReadonlyMap<string, Era>): Promise<{
    result: ImportResult;
    rulesSetsByName: Map<string, RulesSet>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    // Each upsert already answers with the full curated RulesSet, formats
    // included, so the characteristics import downstream needs no extra round
    // trip to learn a target rules set's passingFormat.
    const rulesSetsByName = new Map<string, RulesSet>();

    const names = [
      ...new Set([...erasByName.values()].flatMap((e) => e.rulesSetNames)),
    ];

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: BBL_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
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
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forRulesSet(name),
          },
          { externalSystemId: bblSystemId, externalId: name },
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
