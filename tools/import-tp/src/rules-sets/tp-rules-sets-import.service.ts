import type {
  Era,
  RulesSet,
  UpsertRulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  RulesSetsImportService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TpRulesSetsImportService {
  constructor(
    private readonly rulesSetsImport: RulesSetsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Attach the TP external id to every rules set the TP eras played under.
   * Rules sets are not named in TP's data (only an opaque numeric code is),
   * and are curated (batch 001): their names are the distinct `rulesSetNames`
   * across the curated eras the eras step returned, in first-seen order. Each
   * is found by its Name external id and gets the same name under the TP
   * system, sending nothing else. The TP id matters: the official team lists
   * resolve a rules set by its TP external id. A rules set missing from the
   * catalog fails with the server's missing-field error, recorded for that
   * rules set. Idempotent.
   */
  async importRulesSets(erasByName: ReadonlyMap<string, Era>): Promise<{
    result: ImportResult;
    /**
     * Every rules set this step upserted, keyed by name, carrying the five
     * `CharacteristicFormat`s the server returned. The players step needs
     * them to tell a current-vs-template stat reduction from an advancement:
     * which direction is "worse" is per characteristic per rules set. Mirrors
     * what `BblRulesSetsImportService` already returns.
     */
    rulesSetsByName: Map<string, RulesSet>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const rulesSetsByName = new Map<string, RulesSet>();

    const names = [
      ...new Set([...erasByName.values()].flatMap((e) => e.rulesSetNames)),
    ];

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        rulesSetsByName,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    for (const name of names) {
      const rulesSetData: UpsertRulesSet = {
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forRulesSet(name),
          },
          { externalSystemId: tpSystemId, externalId: name },
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
